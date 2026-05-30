<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import MosaicView from '$lib/components/MosaicView.svelte';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import { lookup } from '$lib/lookup-state.svelte';
	import { compareByKey } from '$lib/sort-key';
	import { loadSort, saveSort } from '$lib/persist';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ── Collection-mode state (only used when data.mode === 'collection') ─────
	type Album = { id: string; artist: string; title: string; year: number | null;
		format: string | null; rating: number | null; ownership: 'OWN' | 'WANT';
		cover_url: string | null; accent_color: string | null; created_at: string; };
	const albums = $derived(data.mode === 'collection' ? data.albums as Album[] : []);

	const owned = $derived(albums.filter((a) => a.ownership === 'OWN'));
	const missingCovers = $derived(albums.filter((a) => !a.cover_url));
	// Albums that have a cover but never had a per-album accent extracted —
	// typically bulk-imported entries that ran through `/api/covers/fetch` (which
	// only sets cover_url, not accent_color). Surfacing them here so the same
	// "Refresh" button picks them up.
	const missingAccents = $derived(albums.filter((a) => a.cover_url && !a.accent_color));
	const needsArtwork = $derived(missingCovers.length + missingAccents.length);

	const SORTS = ['recent', 'artist', 'album', 'rating'] as const;
	type Sort = (typeof SORTS)[number];
	const SORT_KEY = 'albumz:sort:home';

	let sort = $state<Sort>('recent');
	let hydrated = $state(false);

	onMount(() => {
		sort = loadSort(SORT_KEY, SORTS, 'recent');
		hydrated = true;
	});
	$effect(() => {
		if (hydrated) saveSort(SORT_KEY, sort);
	});

	const sortedOwned = $derived(
		owned.slice().sort((a, b) => {
			switch (sort) {
				case 'artist': return compareByKey(a.artist, b.artist);
				case 'album':  return compareByKey(a.title, b.title);
				case 'rating': return (b.rating ?? 0) - (a.rating ?? 0);
				case 'recent':
				default:       return b.created_at.localeCompare(a.created_at);
			}
		})
	);

	type Phase = 'idle' | 'covers' | 'accents';
	let phase = $state<Phase>('idle');
	let phaseProgress = $state({ done: 0, total: 0, found: 0, notFound: 0 });

	function extractAccent(coverUrl: string): Promise<string | null> {
		return new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			let settled = false;
			const finish = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
			img.onload = () => { try { finish(extractAccentColorFromImg(img)); } catch { finish(null); } };
			img.onerror = () => finish(null);
			setTimeout(() => finish(null), 8000);
			img.src = coverUrl;
		});
	}

	async function findCovers() {
		const coverQueue = missingCovers.map((a) => a.id);
		// Seed the accent queue with albums that already have a cover but no accent
		const accentTargets: Array<{ id: string; url: string }> = [];
		for (const a of albums) {
			if (a.cover_url && !a.accent_color) accentTargets.push({ id: a.id, url: a.cover_url });
		}

		const BATCH = 10;

		// ── Phase 1: fetch missing covers ──────────────────────────────
		phase = 'covers';
		phaseProgress = { done: 0, total: coverQueue.length, found: 0, notFound: 0 };

		for (let i = 0; i < coverQueue.length; i += BATCH) {
			const slice = coverQueue.slice(i, i + BATCH);
			try {
				const res = await fetch('/api/covers/fetch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ albumIds: slice })
				});
				const { results } = (await res.json()) as {
					results: Array<{ id: string; status: 'updated' | 'not_found' | 'skipped' | 'error'; cover_url?: string }>;
				};
				for (const r of results) {
					if (r.status === 'updated') {
						phaseProgress.found++;
						if (r.cover_url) accentTargets.push({ id: r.id, url: r.cover_url });
					} else if (r.status === 'not_found') {
						phaseProgress.notFound++;
					}
				}
				phaseProgress.done += slice.length;
			} catch {
				phaseProgress.done += slice.length;
				phaseProgress.notFound += slice.length;
			}
		}

		// ── Phase 2: extract + save accent for every cover that needs one ──
		phase = 'accents';
		phaseProgress = { done: 0, total: accentTargets.length, found: 0, notFound: 0 };

		for (let i = 0; i < accentTargets.length; i += BATCH) {
			const slice = accentTargets.slice(i, i + BATCH);
			await Promise.all(slice.map(async ({ id, url }) => {
				const accent = await extractAccent(url);
				if (accent) {
					try {
						await fetch(`/api/albums/${id}/accent`, {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ accent_color: accent })
						});
					} catch { /* swallow — a missed accent isn't fatal */ }
				}
			}));
			phaseProgress.done += slice.length;
		}

		phase = 'idle';
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>albumz</title>
</svelte:head>

{#if data.mode === 'mosaic'}
	<MosaicView tiles={data.tiles} />
{:else}
<div class="page">
	<header class="topbar">
		<span class="wordmark">album<span>z</span></span>
		<span class="title-meta">Collection <span class="count">{owned.length}</span></span>
		<div class="topbar-actions">
			<SortDropdown
				bind:value={sort}
				options={[
					{ value: 'recent', label: 'Recent' },
					{ value: 'artist', label: 'Artist' },
					{ value: 'album', label: 'Album' },
					{ value: 'rating', label: 'Rating' }
				]}
			/>
			<button
				type="button"
				class="btn-icon"
				onclick={() => lookup.open()}
				title="Do I have this? (⌘K)"
				aria-label="Search collection"
			>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
					<path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
			<a href="/wantlist" class="btn-secondary">Wantlist</a>
			<a href="/albums/new" class="btn-add">+ Add</a>
			{#if data.profile}
				<UserMenu profile={data.profile} />
			{/if}
		</div>
	</header>

	{#if needsArtwork > 0 || phase !== 'idle'}
		<aside class="missing-banner">
			{#if phase === 'covers'}
				<span>Finding covers… <strong>{phaseProgress.done}</strong> / {phaseProgress.total} · {phaseProgress.found} found{phaseProgress.notFound ? ` · ${phaseProgress.notFound} not found` : ''}</span>
			{:else if phase === 'accents'}
				<span>Refreshing accent colors… <strong>{phaseProgress.done}</strong> / {phaseProgress.total}</span>
			{:else}
				<span>
					{#if missingCovers.length > 0}
						<strong>{missingCovers.length}</strong> album{missingCovers.length === 1 ? '' : 's'} missing cover art{missingAccents.length > 0 ? `, ${missingAccents.length} missing accent` : ''}
					{:else}
						<strong>{missingAccents.length}</strong> album{missingAccents.length === 1 ? '' : 's'} need an accent-color refresh
					{/if}
				</span>
				<button onclick={findCovers} class="btn-link">Refresh</button>
			{/if}
		</aside>
	{/if}

	{#if data.mode === 'collection' && data.error}
		<p class="error">Error loading albums: {data.error}</p>
	{:else if owned.length === 0}
		<div class="empty">
			<p>Your collection is empty.</p>
			<a href="/albums/new" class="btn-add">Add your first album</a>
		</div>
	{:else}
		<div class="album-grid">
			{#each sortedOwned as album (album.id)}
				<a href="/albums/{album.id}" class="album-card" style="--card-accent: {album.accent_color ?? 'var(--accent)'}">
					{#if album.cover_url}
						<img src={album.cover_url} alt="{album.artist} – {album.title}" loading="lazy" />
					{:else}
						<div class="no-cover">
							<span>{album.artist.slice(0, 1)}</span>
						</div>
					{/if}
					<div class="card-info">
						<p class="card-artist">{album.artist}</p>
						<p class="card-title">{album.title}</p>
						{#if album.year}<p class="card-year">{album.year}</p>{/if}
						{#if album.rating}
							<p class="card-rating">{'★'.repeat(album.rating)}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
{/if}

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem 4rem;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--border);
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.title-meta {
		flex: 1;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	.count {
		font-size: 0.7rem;
		background: var(--border);
		border-radius: 10px;
		padding: 0.1em 0.45em;
		margin-left: 0.3em;
		color: var(--text);
	}

	.topbar-actions { display: flex; align-items: center; gap: 0.75rem; }
	.btn-add {
		padding: 0.45rem 1rem;
		background: var(--accent);
		color: #fff;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.btn-add:hover { text-decoration: none; opacity: 0.9; }
	.btn-secondary {
		padding: 0.45rem 0.9rem;
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.85rem;
		border: 1px solid var(--border);
	}
	.btn-secondary:hover { text-decoration: none; background: var(--surface-hover); }
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
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		padding: 6rem 0;
		color: var(--text-muted);
	}

	.album-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 1.25rem;
	}

	.album-card {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--surface);
		box-shadow: var(--shadow);
		text-decoration: none;
		transition: transform 0.18s, box-shadow 0.18s;
	}
	.album-card:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-lift), 0 0 20px color-mix(in oklch, var(--card-accent) 30%, transparent);
		text-decoration: none;
	}
	.album-card img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.no-cover {
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklch, var(--card-accent) 15%, var(--bg-elevated));
		font-size: 2.5rem;
		font-weight: 800;
		color: color-mix(in oklch, var(--card-accent) 60%, var(--text));
	}
	.card-info {
		padding: 0.6rem 0.75rem 0.75rem;
	}
	.card-artist {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.15rem;
	}
	.card-title {
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1.3;
	}
	.card-year {
		font-size: 0.72rem;
		color: var(--text-muted);
		margin-top: 0.2rem;
	}
	.card-rating {
		font-size: 0.65rem;
		color: var(--card-accent);
		margin-top: 0.25rem;
		letter-spacing: 0.05em;
	}

	.error { color: oklch(55% 0.2 25); padding: 1rem 0; }

	.missing-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius);
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 1.5rem;
	}
	.missing-banner strong { color: var(--text); }
	.btn-link {
		background: none;
		border: none;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
		font-size: 0.85rem;
		margin-left: auto;
	}
	.btn-link:hover { text-decoration: underline; }
</style>
