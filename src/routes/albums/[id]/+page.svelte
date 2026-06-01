<script lang="ts">
	import { enhance } from '$app/forms';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import AlbumHero from '$lib/components/AlbumHero.svelte';
	import ExternalLinks from '$lib/components/ExternalLinks.svelte';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import Tracklist from '$lib/components/Tracklist.svelte';
	import type { PageData, ActionData } from './$types';

	const formatOptions = [
		{ value: '', label: '—' },
		{ value: 'LP', label: 'LP' },
		{ value: 'CD', label: 'CD' },
		{ value: '7"', label: '7"' },
		{ value: '10"', label: '10"' },
		{ value: '12"', label: '12"' },
		{ value: 'Cassette', label: 'Cassette' },
		{ value: 'Digital', label: 'Digital' }
	];
	const ratingOptions = [
		{ value: '', label: '—' },
		{ value: '1', label: '★' },
		{ value: '2', label: '★★' },
		{ value: '3', label: '★★★' },
		{ value: '4', label: '★★★★' },
		{ value: '5', label: '★★★★★' }
	];

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const album = $derived(data.album);

	let editing = $state(false);
	let confirmingDelete = $state(false);
	let coverPickerOpen = $state(false);

	type CoverResult = { url: string; artist: string; title: string; year?: number; source: string };

	let coverSearching = $state(false);
	let coverResults = $state<CoverResult[]>([]);
	let pickedCoverUrl = $state('');
	let pickedAccent = $state('');

	// ── Look-up panel state (lives inside the edit form) ─────────────────
	// Bindable copies of the editable fields so a search result can update them
	// without losing whatever the user has typed elsewhere.
	let editArtist = $state(album.artist);
	let editTitle = $state(album.title);
	let editYear = $state<number | ''>(album.year ?? '');
	let editFormat = $state(album.format ?? '');
	let editRating = $state(album.rating != null ? String(album.rating) : '');

	let lookupOpen = $state(false);
	let lookupSearching = $state(false);
	let lookupResults = $state<CoverResult[]>([]);
	// When a lookup pick fills in a cover, stage it here so the Save form picks it up
	let stagedCoverUrl = $state('');
	let stagedAccent = $state('');

	// Re-sync the edit-state vars if the underlying album changes (e.g. after Save invalidates)
	$effect(() => {
		editArtist = album.artist;
		editTitle = album.title;
		editYear = album.year ?? '';
		editFormat = album.format ?? '';
		editRating = album.rating != null ? String(album.rating) : '';
	});

	async function runLookup() {
		lookupSearching = true;
		lookupResults = [];
		try {
			const params = new URLSearchParams();
			if (editArtist.trim()) params.set('artist', editArtist.trim());
			if (editTitle.trim()) params.set('title', editTitle.trim());
			const res = await fetch(`/api/covers/search?${params.toString()}`);
			const payload = await res.json();
			lookupResults = payload.covers ?? [];
		} finally {
			lookupSearching = false;
		}
	}

	function applyLookup(result: CoverResult) {
		editArtist = result.artist || editArtist;
		editTitle = result.title || editTitle;
		if (result.year) editYear = result.year;
		// Auto-fill cover only if the album currently has none — preserves intentional covers
		if (!album.cover_url && result.url) {
			stagedCoverUrl = result.url;
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => { stagedAccent = extractAccentColorFromImg(img); };
			img.src = result.url;
		}
		lookupOpen = false;
	}

	async function openCoverPicker() {
		coverPickerOpen = true;
		if (coverResults.length === 0) {
			coverSearching = true;
			try {
				const res = await fetch(
					`/api/covers/search?artist=${encodeURIComponent(album.artist)}&title=${encodeURIComponent(album.title)}`
				);
				const payload = await res.json();
				coverResults = payload.covers ?? [];
			} finally {
				coverSearching = false;
			}
		}
	}

	function pickCover(cover: CoverResult) {
		pickedCoverUrl = cover.url;
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => { pickedAccent = extractAccentColorFromImg(img); };
		img.src = cover.url;
	}
</script>

<svelte:head>
	<title>{album.artist} – {album.title} — albumz</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a href={album.ownership === 'WANT' ? '/wantlist' : '/'} class="back">
			← {album.ownership === 'WANT' ? 'Wantlist' : 'Collection'}
		</a>
	</header>

	<AlbumHero {album} />

	<!-- Owner action row -->
	<section class="actions-row">
		<button type="button" class="btn-secondary" onclick={() => (editing = !editing)}>
			{editing ? 'Close editor' : 'Edit details'}
		</button>
		<button type="button" class="btn-secondary" onclick={openCoverPicker}>
			{album.cover_url ? 'Change cover' : 'Find a cover'}
		</button>
		<form method="POST" action="?/toggleFeatured" use:enhance style="display:inline">
			<button type="submit" class="btn-pill" class:is-featured={data.isFeatured}>
				{data.isFeatured ? '★ Featured' : '☆ Set as featured'}
			</button>
		</form>
	</section>

	{#if coverPickerOpen}
		<section class="picker">
			<header class="picker-header">
				<p class="eyebrow">Pick a cover</p>
				<button type="button" class="close" onclick={() => (coverPickerOpen = false)}>✕</button>
			</header>

			{#if coverSearching}
				<p class="muted">Searching…</p>
			{:else if coverResults.length === 0}
				<p class="muted">No matches found.</p>
			{:else}
				<div class="cover-grid">
					{#each coverResults as cover}
						<button
							type="button"
							class="cover-option"
							class:selected={pickedCoverUrl === cover.url}
							onclick={() => pickCover(cover)}
						>
							<img src={cover.url} alt="{cover.artist} – {cover.title}" loading="lazy" />
							<span class="cover-label">{cover.artist}<br />{cover.title}</span>
						</button>
					{/each}
				</div>

				<form
					method="POST"
					action="?/setCover"
					use:enhance={() => {
						return async ({ update }) => {
							await update({ reset: false });
							coverPickerOpen = false;
						};
					}}
				>
					<input type="hidden" name="cover_url" value={pickedCoverUrl} />
					<input type="hidden" name="accent_color" value={pickedAccent} />
					<div class="picker-actions">
						<button type="button" class="btn-ghost" onclick={() => (coverPickerOpen = false)}>Cancel</button>
						<button type="submit" class="btn-primary" disabled={!pickedCoverUrl}>Use this cover</button>
					</div>
				</form>
			{/if}
		</section>
	{/if}

	<ExternalLinks links={data.externalLinks} />

	<Tracklist
		tracks={data.tracklist.tracks}
		totalDuration={data.tracklist.totalDuration}
		source={data.tracklist.source}
	/>

	{#if editing}
		<section class="edit">
			<h2 class="section-title">Edit album</h2>

			<!-- Look up details — fills artist/title/year from a search result -->
			<div class="lookup">
				<button type="button" class="btn-secondary" onclick={() => { lookupOpen = !lookupOpen; if (lookupOpen && lookupResults.length === 0) runLookup(); }}>
					{lookupOpen ? 'Close lookup' : '🔎 Look up details'}
				</button>
				{#if stagedCoverUrl}
					<span class="staged-pill">✓ New cover staged — save to apply</span>
				{/if}
			</div>

			{#if lookupOpen}
				<div class="lookup-panel">
					<p class="muted lookup-hint">Searches Spotify, iTunes, Last.fm, MusicBrainz, and Deezer using the current artist/title. Pick a result to fill in correct details.</p>
					<div class="lookup-search-row">
						<button type="button" class="btn-secondary" onclick={runLookup} disabled={lookupSearching}>
							{lookupSearching ? 'Searching…' : 'Search again'}
						</button>
					</div>
					{#if lookupSearching}
						<p class="muted">Searching…</p>
					{:else if lookupResults.length === 0}
						<p class="muted">No matches found.</p>
					{:else}
						<ul class="lookup-results">
							{#each lookupResults as r (r.url)}
								<li class="lookup-row">
									{#if r.url}
										<img class="lookup-thumb" src={r.url} alt="" loading="lazy" />
									{:else}
										<div class="lookup-thumb no-thumb"></div>
									{/if}
									<div class="lookup-meta">
										<p class="lookup-artist">{r.artist}</p>
										<p class="lookup-title">{r.title}{r.year ? ` · ${r.year}` : ''}</p>
										<p class="lookup-source">{r.source}</p>
									</div>
									<button type="button" class="btn-pill" onclick={() => applyLookup(r)}>Use these details</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
						// Clear staged cover after save commits
						stagedCoverUrl = '';
						stagedAccent = '';
					};
				}}
			>
				{#if stagedCoverUrl}
					<input type="hidden" name="cover_url" value={stagedCoverUrl} />
					<input type="hidden" name="accent_color" value={stagedAccent} />
				{/if}

				<div class="field-grid">
					<label class="field">
						<span class="label">Artist *</span>
						<input type="text" name="artist" bind:value={editArtist} required />
					</label>
					<label class="field">
						<span class="label">Title *</span>
						<input type="text" name="title" bind:value={editTitle} required />
					</label>
					<label class="field">
						<span class="label">Year</span>
						<input type="number" name="year" min="1900" max="2099" bind:value={editYear} />
					</label>
					<div class="field">
						<span class="label">Format</span>
						<SortDropdown options={formatOptions} bind:value={editFormat} ariaLabel="Format" />
						<input type="hidden" name="format" value={editFormat} />
					</div>
					<label class="field">
						<span class="label">Label</span>
						<input type="text" name="label" value={album.label ?? ''} />
					</label>
					<div class="field">
						<span class="label">Rating</span>
						<SortDropdown options={ratingOptions} bind:value={editRating} ariaLabel="Rating" />
						<input type="hidden" name="rating" value={editRating} />
					</div>
					<fieldset class="field">
						<legend class="label">Ownership</legend>
						<div class="radio-group">
							<label><input type="radio" name="ownership" value="OWN" checked={album.ownership === 'OWN'} /> Own</label>
							<label><input type="radio" name="ownership" value="WANT" checked={album.ownership === 'WANT'} /> Want</label>
						</div>
					</fieldset>
					<label class="field">
						<span class="label">Visibility</span>
						<label class="checkbox">
							<input type="checkbox" name="hidden" checked={album.hidden} />
							Hidden from public view
						</label>
					</label>
					<label class="field full">
						<span class="label">Tags <small>(comma-separated)</small></span>
						<input type="text" name="tags" value={album.tags?.join(', ') ?? ''} />
					</label>
					<label class="field full">
						<span class="label">Notes</span>
						<textarea name="notes" rows="3">{album.notes ?? ''}</textarea>
					</label>
				</div>

				{#if (form as { error?: string })?.error}
					<p class="error">{(form as { error?: string }).error}</p>
				{:else if (form as { saved?: boolean })?.saved}
					<p class="success">Saved.</p>
				{/if}

				<div class="form-actions">
					<button type="button" class="btn-ghost" onclick={() => (editing = false)}>Close</button>
					<button type="submit" class="btn-primary">Save changes</button>
				</div>
			</form>
		</section>
	{/if}

	<section class="danger">
		{#if !confirmingDelete}
			<button type="button" class="btn-danger" onclick={() => (confirmingDelete = true)}>
				Delete album
			</button>
		{:else}
			<form method="POST" action="?/delete" use:enhance>
				<p>Delete <strong>{album.title}</strong> from your collection?</p>
				<div class="form-actions">
					<button type="button" class="btn-ghost" onclick={() => (confirmingDelete = false)}>Cancel</button>
					<button type="submit" class="btn-danger">Yes, delete</button>
				</div>
			</form>
		{/if}
	</section>
</div>

<style>
	.page {
		position: relative;
		min-height: 100dvh;
		padding-bottom: 4rem;
	}

	.topbar {
		max-width: 980px;
		margin: 0 auto;
		padding: 1.5rem 1.5rem 0;
	}
	.back { font-size: 0.85rem; color: var(--text-muted); }

	.actions-row {
		max-width: 980px;
		margin: 0 auto 2rem;
		padding: 0 1.5rem;
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.btn-secondary {
		padding: 0.5rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
		font-family: inherit;
	}
	.btn-secondary:hover { background: var(--surface-hover); }
	.btn-pill {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: 100px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		font-family: inherit;
	}
	.btn-pill:hover { color: var(--text); border-color: var(--accent); }
	.btn-pill.is-featured {
		color: var(--accent);
		border-color: var(--accent);
		background: color-mix(in oklch, var(--accent) 10%, transparent);
	}

	.section-title {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 1rem;
	}

	.edit, .danger {
		max-width: 980px;
		margin: 0 auto 2rem;
		padding: 0 1.5rem;
	}
	.edit form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
	}

	.lookup {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-bottom: 0.85rem;
	}
	.staged-pill {
		font-size: 0.78rem;
		color: var(--accent);
		font-weight: 600;
	}
	.lookup-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		margin-bottom: 1rem;
	}
	.lookup-hint {
		font-size: 0.8rem;
		margin-bottom: 0.75rem;
	}
	.lookup-search-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}
	.lookup-results {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 360px;
		overflow-y: auto;
	}
	.lookup-row {
		display: grid;
		grid-template-columns: 56px 1fr auto;
		gap: 0.85rem;
		align-items: center;
		padding: 0.6rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.lookup-thumb {
		width: 56px;
		height: 56px;
		object-fit: cover;
		border-radius: 6px;
	}
	.lookup-thumb.no-thumb {
		background: var(--surface);
	}
	.lookup-meta { min-width: 0; }
	.lookup-artist {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--text);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.lookup-title {
		font-size: 0.88rem;
		color: var(--text-muted);
		line-height: 1.3;
	}
	.lookup-source {
		font-size: 0.65rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		opacity: 0.65;
		margin-top: 0.2rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.field { display: flex; flex-direction: column; gap: 0.35rem; border: none; padding: 0; margin: 0; }
	.field.full { grid-column: 1 / -1; }
	.label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
	.label small { font-weight: 400; text-transform: none; letter-spacing: 0; }
	.field input, .field select, .field textarea {
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
		font-family: inherit;
	}
	.field textarea { resize: vertical; }
	.field :global(.sort-group) { display: flex; }
	.field :global(.dropdown) { flex: 1; display: block; }
	.field :global(.trigger) {
		width: 100%;
		justify-content: space-between;
		padding: 0.55rem 0.75rem;
		background: var(--bg-elevated);
		font-size: 1rem;
		font-weight: 400;
	}
	.field :global(.menu) { left: 0; right: auto; min-width: 100%; }
	.radio-group { display: flex; gap: 1.25rem; align-items: center; padding-top: 0.3rem; }
	.radio-group label, .checkbox {
		display: flex; align-items: center; gap: 0.4rem;
		font-size: 0.9rem; cursor: pointer;
	}
	@media (max-width: 600px) {
		.field-grid { grid-template-columns: 1fr; }
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}
	.btn-primary {
		padding: 0.6rem 1.5rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
	.btn-ghost {
		padding: 0.6rem 1rem;
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius);
		cursor: pointer;
		font-family: inherit;
	}
	.btn-danger {
		padding: 0.6rem 1.25rem;
		background: transparent;
		color: oklch(60% 0.22 25);
		border: 1px solid oklch(60% 0.22 25 / 0.5);
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
	.btn-danger:hover { background: oklch(60% 0.22 25 / 0.1); }

	.danger { margin-top: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--border); max-width: 980px; }
	.danger p { color: var(--text-muted); margin-bottom: 1rem; }

	.error { color: oklch(55% 0.22 25); font-size: 0.85rem; margin-top: 0.5rem; }
	.success { color: oklch(55% 0.15 150); font-size: 0.85rem; margin-top: 0.5rem; }

	.picker {
		max-width: 980px;
		margin: 0 auto 2rem;
		padding: 1.25rem 1.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.picker-header {
		display: flex; justify-content: space-between; align-items: center;
		margin-bottom: 0.85rem;
	}
	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.close {
		background: none; border: none; color: var(--text-muted);
		font-size: 1.1rem; cursor: pointer;
	}
	.muted { color: var(--text-muted); }
	.cover-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	.cover-option {
		border: 2px solid transparent;
		border-radius: var(--radius);
		background: var(--bg-elevated);
		cursor: pointer;
		padding: 0;
		overflow: hidden;
	}
	.cover-option img { width: 100%; aspect-ratio: 1; object-fit: cover; }
	.cover-label {
		display: block;
		font-size: 0.62rem;
		padding: 0.25rem 0.35rem;
		color: var(--text-muted);
		line-height: 1.3;
	}
	.cover-option.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.picker-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1rem;
	}
</style>
