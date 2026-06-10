<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/components/Avatar.svelte';
	import BackfillSuggestion from '$lib/components/BackfillSuggestion.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const profile = $derived(data.profile);

	// Flash message from the Last.fm callback redirect (?lastfm=connected|failed|...).
	const lastfmFlash = $derived.by(() => {
		const code = page.url.searchParams.get('lastfm');
		switch (code) {
			case 'connected':     return { kind: 'ok' as const, message: 'Connected to Last.fm.' };
			case 'failed':        return { kind: 'error' as const, message: "Couldn't reach Last.fm. Try again?" };
			case 'missing-token': return { kind: 'error' as const, message: 'Last.fm didn\'t hand us a token. Try again?' };
			case 'db-error':      return { kind: 'error' as const, message: 'Saved nothing — database write failed.' };
			default:              return null;
		}
	});

	type Album = typeof data.albums[number];

	let pickerOpen = $state(false);
	let pickerQuery = $state('');

	let fileInputEl = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);
	let backfilling = $state(false);
	let avatarError = $state<string | null>(null);

	const filteredAlbums = $derived(
		pickerQuery.trim()
			? data.albums.filter((a: Album) => {
				const q = pickerQuery.toLowerCase();
				return a.artist.toLowerCase().includes(q) || a.title.toLowerCase().includes(q);
			})
			: data.albums
	);

	// Client-side resize to ~256px square before upload, encoded as WebP.
	async function resizeImage(file: File, maxSize: number): Promise<Blob> {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
		const w = Math.max(1, Math.round(bitmap.width * scale));
		const h = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas not supported in this browser.');
		ctx.drawImage(bitmap, 0, 0, w, h);
		bitmap.close();
		return await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
	}

	async function onAvatarPicked() {
		const file = fileInputEl?.files?.[0];
		if (!file) return;
		uploading = true;
		avatarError = null;
		try {
			const resized = await resizeImage(file, 256);
			const fd = new FormData();
			fd.set('avatar', new File([resized], 'avatar.webp', { type: 'image/webp' }));
			const res = await fetch('?/uploadAvatar', {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = await res.json();
			if (result.type === 'failure') {
				avatarError = result.data?.avatarError ?? 'Upload failed.';
			} else if (result.type === 'error') {
				avatarError = result.error?.message ?? 'Upload failed.';
			} else {
				await invalidateAll();
			}
		} catch (err) {
			avatarError = err instanceof Error ? err.message : 'Upload failed.';
		} finally {
			uploading = false;
			if (fileInputEl) fileInputEl.value = '';
		}
	}

</script>

<svelte:head><title>Settings — albumz</title></svelte:head>

<div class="page">
	<header class="topbar">
		<a href="/" class="back">← Collection</a>
		<h1>Settings</h1>
	</header>

	{#if !profile}
		<p class="error">Your profile is missing. Try signing out and back in.</p>
	{:else}
		<!-- ── Profile ────────────────────────────────────────────── -->
		<section class="card">
			<h2>Profile</h2>
			<form
				method="POST"
				action="?/updateProfile"
				use:enhance={() => async ({ update }) => update({ reset: false })}
			>
				<label class="field">
					<span class="label">Username</span>
					<input type="text" name="username" value={profile.username ?? ''} required />
					<span class="hint">Your public page lives at <code>/u/{profile.username ?? 'username'}</code></span>
				</label>
				<label class="field">
					<span class="label">Display name</span>
					<input type="text" name="display_name" value={profile.display_name ?? ''} placeholder="Your name" />
				</label>
				<label class="field">
					<span class="label">Last.fm username</span>
					<input type="text" name="last_fm_username" value={profile.last_fm_username ?? ''} placeholder="your-lastfm-handle" />
					<span class="hint">Powers now-playing on your public page and contributes to the home mosaic.</span>
				</label>

				<div class="field lastfm-link">
					<span class="label">Last.fm connection</span>
					<div class="lastfm-row">
						{#if data.lastfmConnected}
							<span class="lastfm-status connected">
								<span class="dot"></span>
								Connected as @{profile.last_fm_username}
							</span>
							<!-- Submits the #disconnect-lastfm form declared after the Profile
								     form — a <form> can't nest inside another <form>. -->
								<button type="submit" form="disconnect-lastfm" class="btn-ghost">Disconnect</button>
						{:else}
							<span class="lastfm-status">
								<span class="dot off"></span>
								Not connected
							</span>
							<a href="/auth/lastfm/start" class="btn-secondary" data-sveltekit-reload>Connect Last.fm</a>
						{/if}
					</div>
					<span class="hint">
						Required for spins to update your Last.fm now-playing. We never see your password — Last.fm hands us a one-way session key.
					</span>
					{#if lastfmFlash}
						<p class="lastfm-flash" class:error={lastfmFlash.kind === 'error'}>{lastfmFlash.message}</p>
					{/if}
				</div>
				<label class="field">
					<span class="label">Discogs username</span>
					<input type="text" name="discogs_username" value={profile.discogs_username ?? ''} />
					<span class="hint">Reserved for future wantlist / crate-digging features.</span>
				</label>

				<fieldset class="field">
					<legend class="label">Theme</legend>
					<div class="radio-row">
						{#each ['auto', 'light', 'dark'] as t}
							<label class="radio-pill">
								<input type="radio" name="theme" value={t} checked={(profile.theme ?? 'auto') === t} />
								<span>{t[0].toUpperCase() + t.slice(1)}</span>
							</label>
						{/each}
					</div>
					<span class="hint">"Auto" follows your operating system.</span>
				</fieldset>

				{#if (form as { error?: string })?.error}
					<p class="error">{(form as { error?: string }).error}</p>
				{:else if (form as { savedProfile?: boolean })?.savedProfile}
					<p class="success">Saved.</p>
				{/if}

				<div class="actions">
					<button type="submit" class="btn-primary">Save profile</button>
				</div>
			</form>
			<!-- Target of the Disconnect button inside the Profile form (via its
			     form="disconnect-lastfm" attribute); lives out here because forms
			     can't nest. Renders nothing. -->
			<form id="disconnect-lastfm" method="POST" action="?/disconnectLastfm" use:enhance></form>
		</section>

		<!-- ── Avatar ─────────────────────────────────────────────── -->
		<section class="card">
			<h2>Avatar</h2>
			<p class="muted">
				Your uploaded picture takes precedence. If you don't upload one, we'll show your
				<a href="https://gravatar.com/" target="_blank" rel="noopener">Gravatar</a>
				if you have one — otherwise a generated colored initial.
			</p>
			<div class="avatar-row">
				<Avatar profile={profile} size={120} />
				<div class="avatar-actions">
					<input
						type="file"
						accept="image/png, image/jpeg, image/webp"
						bind:this={fileInputEl}
						onchange={onAvatarPicked}
						style="display:none"
					/>
					<button
						type="button"
						class="btn-secondary"
						onclick={() => fileInputEl?.click()}
						disabled={uploading}
					>
						{uploading ? 'Uploading…' : (profile.avatar_url ? 'Change avatar' : 'Upload avatar')}
					</button>
					{#if profile.avatar_url}
						<form
							method="POST"
							action="?/removeAvatar"
							use:enhance={() => async ({ update }) => { await update(); }}
						>
							<button type="submit" class="btn-link" disabled={uploading}>Remove</button>
						</form>
					{/if}
				</div>
			</div>
			{#if avatarError}
				<p class="error">{avatarError}</p>
			{:else if (form as { savedAvatar?: unknown })?.savedAvatar !== undefined}
				<p class="success">Avatar updated.</p>
			{/if}
		</section>

		<!-- ── Featured album ─────────────────────────────────────── -->
		<section class="card">
			<h2>Featured album</h2>
			<p class="muted">The album that anchors your public page hero.</p>

			{#if data.featured}
				<div class="featured-display">
					{#if data.featured.cover_url}
						<img class="featured-cover" src={data.featured.cover_url} alt={data.featured.title} />
					{:else}
						<div class="featured-cover no-cover">{data.featured.artist.slice(0, 1)}</div>
					{/if}
					<div>
						<p class="eyebrow">★ Featured</p>
						<p class="featured-title">{data.featured.title}</p>
						<p class="featured-artist">{data.featured.artist}</p>
					</div>
				</div>
			{:else}
				<p class="muted">No featured album picked yet.</p>
			{/if}

			{#if !pickerOpen}
				<button type="button" class="btn-secondary" onclick={() => pickerOpen = true}>
					{data.featured ? 'Change featured album' : 'Pick a featured album'}
				</button>
			{:else}
				<div class="picker">
					<input
						type="text"
						bind:value={pickerQuery}
						placeholder="Search your collection…"
						class="picker-search"
					/>

					{#if filteredAlbums.length === 0}
						<p class="muted">No matches.</p>
					{:else}
						<div class="picker-grid">
							{#each filteredAlbums.slice(0, 40) as album (album.id)}
								<form
									method="POST"
									action="?/setFeatured"
									use:enhance={() => async ({ update }) => {
										await update({ reset: false });
										pickerOpen = false;
										pickerQuery = '';
									}}
								>
									<input type="hidden" name="album_id" value={album.id} />
									<button type="submit" class="picker-card" title="{album.artist} – {album.title}">
										{#if album.cover_url}
											<img src={album.cover_url} alt={album.title} loading="lazy" />
										{:else}
											<div class="picker-no-cover">{album.artist.slice(0, 1)}</div>
										{/if}
										<span class="picker-label">{album.artist}<br />{album.title}</span>
									</button>
								</form>
							{/each}
						</div>
						{#if filteredAlbums.length > 40}
							<p class="muted picker-more">{filteredAlbums.length - 40} more — refine your search</p>
						{/if}
					{/if}

					<div class="actions">
						{#if data.featured}
							<form method="POST" action="?/setFeatured" use:enhance={() => async ({ update }) => {
								await update({ reset: false });
								pickerOpen = false;
							}}>
								<input type="hidden" name="album_id" value="" />
								<button type="submit" class="btn-ghost">Clear featured</button>
							</form>
						{/if}
						<button type="button" class="btn-ghost" onclick={() => { pickerOpen = false; pickerQuery = ''; }}>
							Done
						</button>
					</div>
				</div>
			{/if}
		</section>

		<!-- ── Duplicates ────────────────────────────────────────── -->
		<section class="card">
			<h2>Duplicates</h2>
			<p class="muted">Scan your collection for albums with the same artist + title (case-insensitive). On cleanup, the entry with the most user-added metadata is kept; the rest are removed.</p>
			<div class="data-row">
				<form method="POST" action="?/scanDuplicates" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<button type="submit" class="btn-secondary">Scan for duplicates</button>
				</form>
				{#if form?.dupeError}
					<span class="hint hint-err">{form.dupeError}</span>
				{/if}
				{#if form?.dupeRemoved !== undefined}
					<span class="hint hint-ok">
						{form.dupeRemoved === 0
							? 'No duplicates found.'
							: `Removed ${form.dupeRemoved} duplicate ${form.dupeRemoved === 1 ? 'album' : 'albums'}.`}
					</span>
				{/if}
			</div>

			{#if form?.dupeScan}
				{#if form.dupeScan.totalDuplicates === 0}
					<p class="dupe-empty">No duplicates found. Your collection is clean.</p>
				{:else}
					<div class="dupe-result">
						<p>
							Found <strong>{form.dupeScan.totalDuplicates}</strong>
							duplicate {form.dupeScan.totalDuplicates === 1 ? 'album' : 'albums'}
							across <strong>{form.dupeScan.groupCount}</strong>
							{form.dupeScan.groupCount === 1 ? 'group' : 'groups'}.
						</p>
						{#if form.dupeScan.preview.length > 0}
							<ul class="dupe-preview">
								{#each form.dupeScan.preview as p}
									<li>
										<span class="dupe-album">{p.artist} — {p.title}</span>
										<span class="dupe-count">×{p.count}</span>
									</li>
								{/each}
								{#if form.dupeScan.groupCount > form.dupeScan.preview.length}
									<li class="dupe-more">+ {form.dupeScan.groupCount - form.dupeScan.preview.length} more {form.dupeScan.groupCount - form.dupeScan.preview.length === 1 ? 'group' : 'groups'}</li>
								{/if}
							</ul>
						{/if}
						<form
							method="POST"
							action="?/removeDuplicates"
							use:enhance={() => async ({ update }) => update({ reset: false })}
							onsubmit={(e) => {
								if (!confirm(`Remove ${form.dupeScan.totalDuplicates} duplicate ${form.dupeScan.totalDuplicates === 1 ? 'album' : 'albums'}? The highest-metadata copy of each will be kept.`)) {
									e.preventDefault();
								}
							}}
						>
							<button type="submit" class="btn-primary">Remove duplicates</button>
						</form>
					</div>
				{/if}
			{/if}
		</section>

		<!-- ── Backfill missing metadata ─────────────────────────── -->
		<section class="card">
			<h2>Fill missing metadata</h2>
			<p class="muted">Looks up release year, label, tags, and cover art for albums where those fields are empty. Touches only empty fields — never overwrites your existing data. Ownership, format, notes, and rating are left alone. This can take a few minutes for a large collection.</p>
			<div class="data-row">
				<form
					method="POST"
					action="?/backfillMetadata"
					use:enhance={() => {
						backfilling = true;
						return async ({ update }) => {
							await update({ reset: false });
							backfilling = false;
						};
					}}
				>
					<button type="submit" class="btn-secondary" disabled={backfilling}>
						{backfilling ? 'Filling…' : 'Backfill missing data'}
					</button>
				</form>
				{#if backfilling}
					<span class="hint backfill-working">
						<span class="pulse-dot" aria-hidden="true"></span>
						Looking up Spotify, iTunes, Deezer, MusicBrainz, and Last.fm. Could take a few minutes — hang tight.
					</span>
				{:else if form?.backfillError}
					<span class="hint hint-err">{form.backfillError}</span>
				{/if}
			</div>

			{#if !backfilling && form?.backfillSummary}
				{@const s = form.backfillSummary}
				{#if s.scanned === 0}
					<p class="hint hint-ok">Nothing missing. Your collection is fully populated.</p>
				{:else}
					<div class="backfill-result">
						<p class="hint hint-ok">
							Scanned {s.scanned} {s.scanned === 1 ? 'album' : 'albums'} with gaps, updated {s.affected}.
						</p>
						<ul class="backfill-breakdown">
							<li><span class="bf-label">Years:</span> filled {s.filled.years} of {s.attempted.years} attempted</li>
							<li><span class="bf-label">Labels:</span> filled {s.filled.labels} of {s.attempted.labels} attempted</li>
							<li><span class="bf-label">Tag sets:</span> filled {s.filled.tagSets} of {s.attempted.tagSets} attempted</li>
							<li><span class="bf-label">Covers:</span> filled {s.filled.covers} of {s.attempted.covers} attempted</li>
						</ul>
						{#if s.stillMissing.length > 0}
							<details class="backfill-missing" open>
								<summary>{s.stillMissing.length} {s.stillMissing.length === 1 ? 'album' : 'albums'} still need a hand</summary>
								<p class="bf-missing-note">External sources didn't have data for these gaps. Tags and labels include AI suggestions where qwen recognized the album — review and accept, edit, or skip each. Year and cover always need a manual edit.</p>
								<ul class="backfill-missing-list">
									{#each s.stillMissing as a (a.id)}
										<li class="bf-album">
											<a class="bf-album-link" href="/albums/{a.id}">{a.artist} — {a.title}</a>
											<ul class="bf-fields">
												{#each a.missingFields as field (field)}
													<li class="bf-field">
														{#if field === 'tags' && a.suggestion?.tags}
															<BackfillSuggestion albumId={a.id} field="tags" suggested={a.suggestion.tags} />
														{:else if field === 'label' && a.suggestion?.label}
															<BackfillSuggestion albumId={a.id} field="label" suggested={a.suggestion.label} />
														{:else}
															<span class="bf-no-suggestion">
																<span class="field-label">{field}:</span>
																<span class="bf-no-sug-text">no suggestion — <a href="/albums/{a.id}">edit manually</a></span>
															</span>
														{/if}
													</li>
												{/each}
											</ul>
										</li>
									{/each}
								</ul>
							</details>
						{/if}
					</div>
				{/if}
			{/if}
		</section>

		<!-- ── Import / Export ───────────────────────────────────── -->
		<section class="card">
			<h2>Import / Export</h2>
			<p class="muted">Bring albums in from a CSV/XLSX file, or download your full collection (owned + wantlist) as CSV. The export format round-trips through the importer.</p>
			<div class="data-row">
				<a href="/import" class="btn-secondary">Import from file</a>
				<a href="/api/export" class="btn-secondary" download>Export collection (CSV)</a>
				<span class="hint">{data.totalAlbumCount} {data.totalAlbumCount === 1 ? 'album' : 'albums'}</span>
			</div>
		</section>
	{/if}
</div>

<style>
	.page { max-width: 760px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
	.topbar { display: flex; align-items: baseline; gap: 1.5rem; margin-bottom: 2rem; }
	.back { font-size: 0.85rem; color: var(--text-muted); }
	h1 { font-size: 1.5rem; font-weight: 700; }

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}
	.card h2 {
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 1rem;
	}
	.card > p.muted { margin-bottom: 1rem; font-size: 0.9rem; }

	.field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1.1rem; border: none; padding: 0; }
	.label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
	.field input {
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
	}
	.hint { font-size: 0.78rem; color: var(--text-muted); }
	.backfill-working { display: inline-flex; align-items: center; gap: 0.5rem; }
	.backfill-result { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.backfill-breakdown { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.25rem; font-size: 0.85rem; color: var(--text-muted); }
	.bf-label { color: var(--text); font-weight: 600; margin-right: 0.4rem; }
	.backfill-missing { font-size: 0.85rem; }
	.backfill-missing summary { cursor: pointer; color: var(--text); font-weight: 600; padding: 0.4rem 0; }
	.bf-missing-note { color: var(--text-muted); margin: 0.4rem 0 0.6rem; font-size: 0.82rem; }
	.backfill-missing-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; max-height: 32rem; overflow-y: auto; }
	.bf-album { display: grid; gap: 0.35rem; padding: 0.6rem 0.7rem; background: color-mix(in oklch, var(--text) 4%, transparent); border-radius: var(--radius); }
	.bf-album-link { color: var(--text); text-decoration: none; font-weight: 600; }
	.bf-album-link:hover { text-decoration: underline; }
	.bf-fields { list-style: none; padding: 0; margin: 0.25rem 0 0; display: grid; gap: 0.35rem; }
	.bf-field { display: block; }
	.bf-no-suggestion { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.85rem; padding: 0.4rem 0; }
	.bf-no-suggestion .field-label { color: var(--text-muted); font-size: 0.78rem; text-transform: capitalize; }
	.bf-no-sug-text { color: var(--text-muted); }
	.bf-no-sug-text a { color: var(--text); }
	.pulse-dot {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--accent, oklch(70% 0.15 220));
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 0.35; transform: scale(0.85); }
		50%      { opacity: 1;    transform: scale(1.1); }
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse-dot { animation: none; opacity: 0.8; }
	}
	.hint code { font-family: ui-monospace, monospace; background: var(--bg-elevated); padding: 0.05rem 0.3rem; border-radius: 4px; }
	.hint-err { color: oklch(55% 0.2 25); }
	.hint-ok { color: oklch(55% 0.17 145); }

	.dupe-empty {
		margin: 1rem 0 0;
		font-size: 0.9rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.dupe-result {
		margin-top: 1.1rem;
		padding: 1.1rem 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.dupe-result p { margin: 0 0 0.85rem; font-size: 0.95rem; color: var(--text); }

	.dupe-preview {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.dupe-preview li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.88rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid color-mix(in oklch, var(--border) 50%, transparent);
	}
	.dupe-preview li:last-child { border-bottom: none; }
	.dupe-album { color: var(--text); }
	.dupe-count { color: var(--text-muted); font-variant-numeric: tabular-nums; }
	.dupe-more { color: var(--text-muted); font-style: italic; }

	.radio-row { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 0.25rem; }
	.radio-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: 20px;
		cursor: pointer;
		font-size: 0.85rem;
		background: var(--bg-elevated);
	}
	.radio-pill input { accent-color: var(--accent); }
	.radio-pill:has(input:checked) { border-color: var(--accent); color: var(--accent); }

	.actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.25rem; }

	.btn-primary {
		padding: 0.55rem 1.25rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
	}
	.btn-secondary {
		padding: 0.55rem 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		margin-top: 1rem;
	}
	.btn-secondary:hover { background: var(--surface-hover); }
	.btn-ghost {
		padding: 0.55rem 1rem;
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius);
		cursor: pointer;
	}

	.muted { color: var(--text-muted); }
	.error { color: oklch(55% 0.22 25); font-size: 0.85rem; margin-top: 0.5rem; }
	.success { color: oklch(55% 0.15 150); font-size: 0.85rem; margin-top: 0.5rem; }

	.lastfm-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.lastfm-status {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.lastfm-status .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: oklch(60% 0.15 150);
		box-shadow: 0 0 8px oklch(60% 0.15 150);
	}
	.lastfm-status .dot.off {
		background: var(--text-muted);
		box-shadow: none;
		opacity: 0.5;
	}
	.lastfm-status.connected { color: var(--text); }
	.lastfm-flash { font-size: 0.85rem; margin-top: 0.5rem; color: oklch(55% 0.15 150); }
	.lastfm-flash.error { color: oklch(55% 0.22 25); }

	/* Featured album display */
	.featured-display {
		display: grid;
		grid-template-columns: 80px 1fr;
		gap: 1rem;
		align-items: center;
		padding: 1rem;
		background: var(--bg-elevated);
		border-radius: var(--radius);
		margin-bottom: 1rem;
	}
	.featured-cover {
		width: 80px;
		height: 80px;
		border-radius: var(--radius);
		object-fit: cover;
	}
	.featured-cover.no-cover {
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklch, var(--accent) 15%, var(--bg-elevated));
		font-size: 1.8rem;
		font-weight: 800;
	}
	.featured-title { font-size: 1rem; font-weight: 700; }
	.featured-artist { font-size: 0.85rem; color: var(--text-muted); }
	.eyebrow { margin-bottom: 0.25rem; }

	/* Picker */
	.picker { margin-top: 1rem; }
	.picker-search {
		width: 100%;
		padding: 0.55rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
		margin-bottom: 0.85rem;
	}
	.picker-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
		gap: 0.4rem;
		max-height: 360px;
		overflow-y: auto;
		padding: 0.25rem;
	}
	.picker-grid form { margin: 0; }
	.picker-card {
		display: block;
		width: 100%;
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius);
		background: var(--bg-elevated);
		cursor: pointer;
		overflow: hidden;
		text-align: left;
	}
	.picker-card:hover { border-color: var(--accent); }
	.picker-card img { width: 100%; aspect-ratio: 1; object-fit: cover; }
	.picker-no-cover {
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklch, var(--accent) 12%, var(--bg-elevated));
		font-weight: 800;
		color: var(--text-muted);
	}
	.picker-label {
		display: block;
		font-size: 0.6rem;
		padding: 0.2rem 0.3rem;
		color: var(--text-muted);
		line-height: 1.3;
	}
	.picker-more {
		margin-top: 0.6rem;
		font-size: 0.78rem;
		text-align: center;
	}

	.data-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.data-row { flex-wrap: wrap; }
	.data-row .btn-secondary { margin-top: 0; text-decoration: none; display: inline-block; }

	.avatar-row {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-top: 1rem;
		flex-wrap: wrap;
	}
	.avatar-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.btn-link {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
	}
	.btn-link:hover { color: var(--text); text-decoration: underline; }
</style>
