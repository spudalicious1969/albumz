<script lang="ts">
	import { enhance } from '$app/forms';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import {
		groupResults,
		uniqueYears,
		uniqueLabels,
		uniqueBySource,
		LOOKUP_SOURCE_LABEL
	} from '$lib/lookup-grouping';
	import type { CoverResult } from '$lib/cover-types';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let selectedCover = $state<string>('');
	let accentColor = $state<string>('');
	let searching = $state(false);

	const covers = $derived((form as { covers?: typeof data.covers })?.covers ?? data.covers);
	const groupedCovers = $derived(groupResults(covers as CoverResult[]));
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

	<!-- Step 2: Pick an album (grouped by record; sources shown as thumbnails) -->
	{#if covers?.length}
		<section class="covers-section">
			<p class="eyebrow">Pick an album</p>
			<p class="hint">Click a source thumbnail to apply that source's details. Where sources disagree on year or label, the alternates are called out below the title.</p>
			<ul class="result-groups">
				{#each groupedCovers as group (group.artist + '::' + group.title)}
					{@const years = uniqueYears(group)}
					{@const labels = uniqueLabels(group)}
					<li class="result-group">
						<div class="group-header">
							<p class="result-artist">{group.artist}</p>
							<p class="result-title">{group.title}</p>
							{#if years.length > 1}
								<p class="result-detail">
									<span class="detail-label">Years:</span>{years.join(' · ')}
								</p>
							{:else if years.length === 1}
								<p class="result-detail">
									<span class="detail-label">Year:</span>{years[0]}
								</p>
							{/if}
							{#if labels.length > 1}
								<p class="result-detail">
									<span class="detail-label">Labels:</span>{labels.join(' · ')}
								</p>
							{:else if labels.length === 1}
								<p class="result-detail">
									<span class="detail-label">Label:</span>{labels[0]}
								</p>
							{/if}
						</div>
						<div class="source-strip">
							{#each uniqueBySource(group.sources) as src (src.url + '::' + src.source)}
								<button
									type="button"
									class="source-cover"
									class:selected={selectedCover === src.url}
									onclick={() => onCoverSelect(src)}
									title="Apply details from {LOOKUP_SOURCE_LABEL[src.source]}{src.year ? ` (${src.year})` : ''}"
								>
									{#if src.url}
										<img src={src.url} alt="" loading="lazy" />
									{:else}
										<div class="src-no-thumb"></div>
									{/if}
									<span class="source-name">{LOOKUP_SOURCE_LABEL[src.source]}</span>
								</button>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
			<button
				type="button"
				class="no-cover-option"
				class:selected={selectedCover === ''}
				onclick={onNoCover}
			>
				Skip cover — add without artwork
			</button>
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
					<textarea
						name="notes"
						rows="3"
						placeholder="What this record means to you. Links: [text](https://…)"
					></textarea>
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
		max-width: 1100px;
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
	.covers-section .eyebrow { margin-bottom: 0.4rem; }
	.hint {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-bottom: 0.85rem;
	}

	/* Grid so multiple albums show side-by-side instead of stacking vertically.
	   /albums/new often returns many distinct records (different albums by the
	   same artist), so the single-column vertical layout we use in the editor
	   would create a long scroll before the form fields. */
	.result-groups {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.85rem 1.25rem;
		padding: 0;
		margin: 0;
	}
	.result-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.4rem 0.25rem;
		min-width: 0;
	}
	.group-header { min-width: 0; }
	.result-artist {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--text);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.result-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1.25;
		margin-top: 0.1rem;
		overflow-wrap: break-word;
	}
	.result-detail {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-top: 0.2rem;
	}
	.detail-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		opacity: 0.7;
		margin-right: 0.35rem;
	}

	.source-strip {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.source-cover {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: transform 0.18s;
	}
	.source-cover img,
	.source-cover .src-no-thumb {
		width: 56px;
		height: 56px;
		object-fit: cover;
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		transition: box-shadow 0.18s, outline-color 0.18s;
		outline: 2px solid transparent;
		outline-offset: 2px;
	}
	.src-no-thumb { background: var(--surface); }
	.source-cover:hover { transform: translateY(-2px); }
	.source-cover:hover img,
	.source-cover:hover .src-no-thumb {
		box-shadow:
			var(--shadow-lift),
			0 0 24px color-mix(in oklch, var(--accent) 35%, transparent);
	}
	.source-cover.selected img,
	.source-cover.selected .src-no-thumb {
		outline-color: var(--accent);
		box-shadow:
			var(--shadow-lift),
			0 0 28px color-mix(in oklch, var(--accent) 45%, transparent);
	}
	.source-name {
		font-size: 0.7rem;
		color: var(--text-muted);
		letter-spacing: 0.04em;
		transition: color 0.18s;
	}
	.source-cover:hover .source-name,
	.source-cover.selected .source-name { color: var(--text); }

	.no-cover-option {
		margin-top: 1.25rem;
		padding: 0.55rem 1rem;
		background: transparent;
		border: 1px solid color-mix(in oklch, var(--text-muted) 28%, transparent);
		color: var(--text-muted);
		border-radius: var(--radius);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.2s, border-color 0.2s, color 0.2s;
	}
	.no-cover-option:hover {
		color: var(--text);
		border-color: color-mix(in oklch, var(--accent) 45%, var(--border));
		background: color-mix(in oklch, var(--accent) 8%, transparent);
	}
	.no-cover-option.selected {
		color: var(--text);
		border-color: var(--accent);
		background: color-mix(in oklch, var(--accent) 12%, transparent);
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
	.field input, .field textarea {
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}
	.field textarea { resize: vertical; }
	/* Notes is content, not metadata — styled to feel like writing in the
	   read-view note panel: accent left border, soft fill, italic. */
	.field textarea[name="notes"] {
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		padding: 0.85rem 1rem;
		font-style: italic;
		line-height: 1.5;
		min-height: 4.5rem;
	}
	.field textarea[name="notes"]::placeholder { font-style: italic; }
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
