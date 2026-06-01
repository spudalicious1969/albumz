<script lang="ts">
	import { enhance } from '$app/forms';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let selectedCover = $state<string>('');
	let accentColor = $state<string>('');
	let searching = $state(false);

	const covers = $derived((form as { covers?: typeof data.covers })?.covers ?? data.covers);
	const prefill = $derived((form as { prefill?: typeof data.prefill })?.prefill ?? data.prefill);

	// Form fields — live state so picking a cover can update them
	let artist = $state('');
	let title = $state('');
	let year = $state<number | ''>('');
	let format = $state('');
	let rating = $state('');
	let ownership = $state<'OWN' | 'WANT'>('OWN');

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

	// Seed from the user's search terms whenever those change
	$effect(() => {
		if (prefill?.artist) artist = prefill.artist;
		if (prefill?.title) title = prefill.title;
		if (prefill?.ownership) ownership = prefill.ownership === 'WANT' ? 'WANT' : 'OWN';
	});

	type Cover = (typeof data.covers)[number];

	function onCoverSelect(cover: Cover) {
		selectedCover = cover.url;
		// Prefer iTunes/Deezer-provided values, but only overwrite blanks the user hasn't customized
		if (cover.artist) artist = cover.artist;
		if (cover.title) title = cover.title;
		if (cover.year) year = cover.year;

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => { accentColor = extractAccentColorFromImg(img); };
		img.src = cover.url;
	}

	function onNoCover() {
		selectedCover = '';
		accentColor = '';
	}
</script>

<svelte:head>
	<title>{prefill?.ownership === 'WANT' ? 'Add to wantlist' : 'Add album'} — albumz</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<a href={prefill?.ownership === 'WANT' ? '/wantlist' : '/'} class="back">
			← {prefill?.ownership === 'WANT' ? 'Wantlist' : 'Collection'}
		</a>
		<h1>{prefill?.ownership === 'WANT' ? 'Add to wantlist' : 'Add album'}</h1>
	</header>

	<!-- Step 1: Search for covers -->
	<section class="search-section">
		<form
			method="POST"
			action="?/search"
			use:enhance={() => {
				searching = true;
				return async ({ update }) => { await update(); searching = false; };
			}}
		>
			<input type="hidden" name="ownership" value={prefill?.ownership ?? 'OWN'} />
			<div class="search-row">
				<input
					type="text"
					name="artist"
					placeholder="Artist (e.g. Nirvana)"
					value={prefill?.artist ?? ''}
				/>
				<input
					type="text"
					name="title"
					placeholder="Album title (e.g. Nevermind)"
					value={prefill?.title ?? ''}
				/>
				<button type="submit" disabled={searching}>
					{searching ? 'Searching…' : 'Search'}
				</button>
			</div>
			<p class="search-hint">Fill in artist, title, or both — we'll find matches either way.</p>
		</form>
	</section>

	<!-- Step 2: Pick a cover -->
	{#if covers?.length}
		<section class="covers-section">
			<p class="eyebrow">Pick an album</p>
			<div class="cover-grid">
				{#each covers as cover}
					<button
						type="button"
						class="cover-option"
						class:selected={selectedCover === cover.url}
						onclick={() => onCoverSelect(cover)}
					>
						<img src={cover.url} alt="{cover.artist} – {cover.title}" loading="lazy" />
						<span class="cover-label">{cover.artist}<br />{cover.title}</span>
					</button>
				{/each}
				<button
					type="button"
					class="cover-option no-cover"
					class:selected={selectedCover === ''}
					onclick={onNoCover}
				>
					<span>No cover</span>
				</button>
			</div>
		</section>
	{/if}

	<!-- Step 3: Album details -->
	<section class="details-section">
		<form method="POST" action="?/save" use:enhance>
			<input type="hidden" name="cover_url" value={selectedCover} />
			<input type="hidden" name="accent_color" value={accentColor} />

			<div class="field-grid">
				<label class="field">
					<span class="label">Artist *</span>
					<input type="text" name="artist" bind:value={artist} required />
				</label>
				<label class="field">
					<span class="label">Title *</span>
					<input type="text" name="title" bind:value={title} required />
				</label>
				<label class="field">
					<span class="label">Year</span>
					<input type="number" name="year" min="1900" max="2099" bind:value={year} />
				</label>
				<div class="field">
					<span class="label">Format</span>
					<SortDropdown options={formatOptions} bind:value={format} ariaLabel="Format" />
					<input type="hidden" name="format" value={format} />
				</div>
				<label class="field">
					<span class="label">Label</span>
					<input type="text" name="label" />
				</label>
				<div class="field">
					<span class="label">Rating</span>
					<SortDropdown options={ratingOptions} bind:value={rating} ariaLabel="Rating" />
					<input type="hidden" name="rating" value={rating} />
				</div>
				<label class="field ownership">
					<span class="label">Ownership</span>
					<div class="radio-group">
						<label><input type="radio" name="ownership" value="OWN" bind:group={ownership} /> Own</label>
						<label><input type="radio" name="ownership" value="WANT" bind:group={ownership} /> Want</label>
					</div>
				</label>
				<label class="field full">
					<span class="label">Tags <small>(comma-separated)</small></span>
					<input type="text" name="tags" placeholder="jazz, favourites, 70s" />
				</label>
				<label class="field full">
					<span class="label">Notes</span>
					<textarea name="notes" rows="3"></textarea>
				</label>
			</div>

			{#if (form as { error?: string })?.error}
				<p class="error">{(form as { error?: string }).error}</p>
			{/if}

			<div class="actions">
				<a href="/" class="btn-ghost">Cancel</a>
				<button type="submit" class="btn-primary">
					{ownership === 'WANT' ? 'Add to wantlist' : 'Add to collection'}
				</button>
			</div>
		</form>
	</section>
</div>

<style>
	.page {
		max-width: 860px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}
	.page-header {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}
	.back { font-size: 0.85rem; color: var(--text-muted); }
	h1 { font-size: 1.5rem; font-weight: 700; }

	.search-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.search-row input {
		flex: 1;
		min-width: 160px;
		padding: 0.55rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}
	.search-row button {
		padding: 0.55rem 1.25rem;
		border: none;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}
	.search-row button:disabled { opacity: 0.5; cursor: default; }
	.search-hint {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.covers-section { margin: 2rem 0; }
	.covers-section .eyebrow { margin-bottom: 0.75rem; }
	.cover-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
	}
	.cover-option {
		border: 2px solid transparent;
		border-radius: var(--radius);
		background: var(--surface);
		cursor: pointer;
		padding: 0;
		overflow: hidden;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.cover-option img { width: 100%; aspect-ratio: 1; object-fit: cover; }
	.cover-label {
		display: block;
		font-size: 0.65rem;
		padding: 0.3rem 0.4rem;
		color: var(--text-muted);
		line-height: 1.3;
	}
	.cover-option.no-cover {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.cover-option.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.details-section { margin-top: 2rem; }
	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.field { display: flex; flex-direction: column; gap: 0.35rem; }
	.field.full { grid-column: 1 / -1; }
	.label { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
	.label small { font-weight: 400; text-transform: none; letter-spacing: 0; }
	.field input, .field select, .field textarea {
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}
	.field textarea { resize: vertical; }
	.field :global(.sort-group) { display: flex; }
	.field :global(.dropdown) { flex: 1; display: block; }
	.field :global(.trigger) {
		width: 100%;
		justify-content: space-between;
		padding: 0.55rem 0.75rem;
		font-size: 1rem;
		font-weight: 400;
	}
	.field :global(.menu) { left: 0; right: auto; min-width: 100%; }
	.radio-group { display: flex; gap: 1.25rem; align-items: center; padding-top: 0.3rem; }
	.radio-group label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; cursor: pointer; }

	.actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 2rem;
	}
	.btn-primary {
		padding: 0.6rem 1.5rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
	}
	.btn-ghost {
		padding: 0.6rem 1rem;
		color: var(--text-muted);
		font-size: 0.9rem;
		display: flex;
		align-items: center;
	}
	.error { color: oklch(55% 0.2 25); font-size: 0.85rem; margin-top: 0.5rem; }
</style>
