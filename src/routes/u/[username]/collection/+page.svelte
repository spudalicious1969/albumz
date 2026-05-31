<script lang="ts">
	import { onMount } from 'svelte';
	import { compareByKey } from '$lib/sort-key';
	import { loadSort, saveSort, loadReversed, saveReversed } from '$lib/persist';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	type Album = typeof data.albums[number];

	const SORTS = ['artist', 'album', 'rating', 'format'] as const;
	type Sort = (typeof SORTS)[number];
	const SORT_KEY = 'albumz:sort:collection';
	const REV_KEY = 'albumz:sort:collection:rev';

	let query = $state('');
	let sort = $state<Sort>('artist');
	let reversed = $state(false);
	let hydrated = $state(false);
	let searchOpen = $state(false);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	onMount(() => {
		sort = loadSort(SORT_KEY, SORTS, 'artist');
		reversed = loadReversed(REV_KEY);
		hydrated = true;
	});
	$effect(() => {
		if (hydrated) saveSort(SORT_KEY, sort);
	});
	$effect(() => {
		if (hydrated) saveReversed(REV_KEY, reversed);
	});

	function openSearch() {
		searchOpen = true;
		// focus after render
		queueMicrotask(() => searchInputEl?.focus());
	}
	function closeSearch() {
		query = '';
		searchOpen = false;
	}

	const filtered = $derived(
		(query.trim()
			? data.albums.filter((a: Album) => {
				const q = query.toLowerCase();
				return (
					a.artist.toLowerCase().includes(q) ||
					a.title.toLowerCase().includes(q) ||
					(a.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
				);
			})
			: data.albums
		).slice().sort((a: Album, b: Album) => {
			let r: number;
			switch (sort) {
				case 'album':  r = compareByKey(a.title, b.title); break;
				case 'rating': r = (b.rating ?? 0) - (a.rating ?? 0); break;
				case 'format': r = (a.format ?? 'zzz').localeCompare(b.format ?? 'zzz') || compareByKey(a.artist, b.artist); break;
				case 'artist':
				default:       r = compareByKey(a.artist, b.artist);
			}
			return reversed ? -r : r;
		})
	);

	const displayName = $derived(data.profile.display_name || data.profile.username);
</script>

<svelte:head>
	<title>{displayName}'s collection — albumz</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a href="/u/{data.profile.username}" class="back">← {displayName}</a>
		<h1>Full collection <span class="count">{data.albums.length}</span></h1>
		<div class="topbar-actions">
			{#if searchOpen}
				<div class="search-wrap">
					<input
						type="search"
						placeholder="Search artist, title, or tag…"
						bind:value={query}
						bind:this={searchInputEl}
						onkeydown={(e) => { if (e.key === 'Escape') closeSearch(); }}
						class="search"
					/>
					<button type="button" class="search-close" onclick={closeSearch} aria-label="Close search">✕</button>
				</div>
			{:else}
				<button
					type="button"
					class="btn-icon"
					onclick={openSearch}
					title="Search this collection"
					aria-label="Search collection"
				>
					<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
						<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
						<path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>
			{/if}
			<SortDropdown
				bind:value={sort}
				bind:reversed
				reversible
				options={[
					{ value: 'artist', label: 'Artist' },
					{ value: 'album', label: 'Album' },
					{ value: 'rating', label: 'Rating' },
					{ value: 'format', label: 'Format' }
				]}
			/>
		</div>
	</header>

	{#if filtered.length === 0}
		<p class="empty">No albums match.</p>
	{:else}
		<div class="album-grid">
			{#each filtered as album (album.id)}
				<a
					href="/u/{data.profile.username}/albums/{album.id}"
					class="album-card"
					style="--card-accent: {album.accent_color ?? 'var(--accent)'}"
				>
					{#if album.cover_url}
						<img src={album.cover_url} alt="{album.artist} – {album.title}" loading="lazy" />
					{:else}
						<div class="no-cover">{album.artist.slice(0, 1)}</div>
					{/if}
					<div class="card-info">
						<p class="card-artist">{album.artist}</p>
						<p class="card-title">{album.title}</p>
						{#if album.year}<p class="card-year">{album.year}</p>{/if}
						{#if album.rating}<p class="card-rating">{'★'.repeat(album.rating)}</p>{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page { max-width: 1200px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; }

	.topbar {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		flex-wrap: wrap;
		padding-bottom: 1rem;
		margin-bottom: 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.back { font-size: 0.85rem; color: var(--text-muted); }
	h1 { font-size: 1.4rem; font-weight: 700; flex: 1; }
	.count {
		font-size: 0.7rem;
		background: var(--border);
		border-radius: 10px;
		padding: 0.1em 0.45em;
		margin-left: 0.3em;
		color: var(--text);
		font-weight: 500;
	}

	.topbar-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: var(--surface);
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.btn-icon:hover { background: var(--surface-hover); color: var(--text); }
	.search-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.search-close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius);
	}
	.search-close:hover { background: var(--surface); color: var(--text); }
	.search {
		flex: 1;
		padding: 0.55rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}
	.empty { padding: 4rem 0; text-align: center; color: var(--text-muted); }

	.album-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
	}
	.album-card {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--surface);
		box-shadow: var(--shadow);
		text-decoration: none;
		color: inherit;
		transition: transform 0.18s, box-shadow 0.18s;
	}
	.album-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-lift), 0 0 18px color-mix(in oklch, var(--card-accent) 25%, transparent);
		text-decoration: none;
	}
	.album-card img { width: 100%; aspect-ratio: 1; object-fit: cover; }
	.no-cover {
		width: 100%; aspect-ratio: 1;
		display: flex; align-items: center; justify-content: center;
		background: color-mix(in oklch, var(--card-accent) 12%, var(--bg-elevated));
		font-weight: 800; font-size: 2rem;
		color: color-mix(in oklch, var(--card-accent) 60%, var(--text));
	}
	.card-info { padding: 0.5rem 0.7rem 0.65rem; }
	.card-artist {
		font-size: 0.65rem; font-weight: 700;
		letter-spacing: 0.06em; text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.1rem;
	}
	.card-title { font-size: 0.83rem; font-weight: 600; line-height: 1.3; }
	.card-year { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }
	.card-rating { font-size: 0.65rem; color: var(--card-accent); margin-top: 0.2rem; letter-spacing: 0.05em; }
</style>
