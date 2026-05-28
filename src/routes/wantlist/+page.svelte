<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { compareByKey } from '$lib/sort-key';
	import { loadSort, saveSort } from '$lib/persist';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type WantAlbum = (typeof data.albums)[number];

	const SORTS = ['recent', 'artist', 'title', 'format'] as const;
	type Sort = (typeof SORTS)[number];
	const SORT_KEY = 'albumz:sort:wantlist';

	let sort = $state<Sort>('recent');
	let hydrated = $state(false);
	let promotingId = $state<string | null>(null);

	onMount(() => {
		sort = loadSort(SORT_KEY, SORTS, 'recent');
		hydrated = true;
	});
	$effect(() => {
		if (hydrated) saveSort(SORT_KEY, sort);
	});

	const sorted = $derived.by(() => {
		const list = [...data.albums];
		switch (sort) {
			case 'artist':
				return list.sort((a, b) => compareByKey(a.artist, b.artist) || compareByKey(a.title, b.title));
			case 'title':
				return list.sort((a, b) => compareByKey(a.title, b.title));
			case 'format':
				return list.sort((a, b) => (a.format ?? 'zzz').localeCompare(b.format ?? 'zzz') || compareByKey(a.artist, b.artist));
			case 'recent':
			default:
				return list.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
		}
	});

	function buyLinks(album: WantAlbum) {
		const q = encodeURIComponent(`${album.artist} ${album.title}`);
		return [
			{ label: 'Record Exchange', href: `https://shop.therecordexchange.com/Search?terms=${q}` },
			{ label: 'Bandcamp',        href: `https://bandcamp.com/search?q=${q}` },
			{ label: 'Discogs',         href: `https://www.discogs.com/search/?q=${q}&type=release` },
			{ label: 'Amazon',          href: `https://www.amazon.com/s?k=${q}&i=popular` },
			{ label: 'eBay',            href: `https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=11233` }
		];
	}
</script>

<svelte:head><title>Wantlist — albumz</title></svelte:head>

<div class="page">
	<header class="topbar">
		<a href="/" class="back">← Collection</a>
		<h1>Wantlist <span class="count">{data.albums.length}</span></h1>
		<div class="actions">
			<label class="sort">
				Sort
				<select bind:value={sort}>
					<option value="recent">Recently added</option>
					<option value="artist">Artist</option>
					<option value="title">Title</option>
					<option value="format">Format</option>
				</select>
			</label>
			<a href="/albums/new?ownership=WANT" class="btn-add">+ Add to wantlist</a>
		</div>
	</header>

	{#if sorted.length === 0}
		<div class="empty">
			<p class="empty-headline">Your wantlist is empty</p>
			<p class="empty-sub">Things you're hunting for live here.</p>
			<a href="/albums/new?ownership=WANT" class="btn-add">+ Add to wantlist</a>
		</div>
	{:else}
		<div class="list">
			{#each sorted as album (album.id)}
				<article class="row" style="--row-accent: {album.accent_color ?? 'var(--accent)'}">
					<a href="/albums/{album.id}" class="thumb-link" aria-label="Open {album.title}">
						<div class="thumb">
							{#if album.cover_url}
								<img src={album.cover_url} alt="" loading="lazy" />
							{:else}
								<span class="thumb-initial">{album.artist.slice(0, 1)}</span>
							{/if}
						</div>
					</a>
					<a href="/albums/{album.id}" class="meta">
						<span class="artist">{album.artist}</span>
						<span class="title">
							{album.title}
							{#if album.year}<span class="dim">· {album.year}</span>{/if}
							{#if album.format}<span class="dim">· {album.format}</span>{/if}
						</span>
						{#if album.notes}
							<span class="notes">{album.notes}</span>
						{/if}
						{#if album.tags && album.tags.length > 0}
							<span class="tags">
								{#each album.tags as tag}
									<span class="tag">{tag}</span>
								{/each}
							</span>
						{/if}
					</a>
					<div class="row-actions">
						<div class="buy-group" aria-label="Buy at">
							<span class="eyebrow">Buy</span>
							{#each buyLinks(album) as store}
								<a href={store.href} target="_blank" rel="noopener" class="chip">{store.label}</a>
							{/each}
						</div>
						<form
							method="POST"
							action="?/promote"
							use:enhance={() => {
								promotingId = album.id;
								return async ({ update }) => {
									await update({ reset: false });
									await invalidateAll();
									promotingId = null;
								};
							}}
						>
							<input type="hidden" name="id" value={album.id} />
							<button type="submit" class="got-it" disabled={promotingId === album.id}>
								{promotingId === album.id ? 'Moving…' : '✓ I got it!'}
							</button>
						</form>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1000px;
		margin: 0 auto;
		padding: 0 1.5rem 4rem;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--border);
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}
	.back {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.back:hover { color: var(--text); }
	h1 {
		font-size: 1.5rem;
		font-weight: 800;
		margin: 0;
		flex: 1;
	}
	.count {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--surface);
		padding: 0.15em 0.55em;
		border-radius: 999px;
		margin-left: 0.4rem;
		vertical-align: middle;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.sort select {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: var(--radius);
		padding: 0.35rem 0.55rem;
		font-family: inherit;
		font-size: 0.85rem;
	}
	.btn-add {
		padding: 0.45rem 1rem;
		background: var(--accent);
		color: #fff;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.85rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.btn-add:hover { opacity: 0.9; text-decoration: none; }

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: grid;
		grid-template-columns: 64px 1fr auto;
		gap: 1rem;
		align-items: center;
		padding: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--row-accent);
		border-radius: var(--radius);
		transition: background 0.15s;
	}
	.row:hover { background: var(--surface-hover, color-mix(in oklch, var(--surface) 80%, var(--text))); }

	.thumb-link { display: block; }
	.thumb {
		width: 64px;
		height: 64px;
		border-radius: var(--radius);
		overflow: hidden;
		background: color-mix(in oklch, var(--row-accent) 15%, var(--bg-elevated));
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.thumb img { width: 100%; height: 100%; object-fit: cover; }
	.thumb-initial {
		font-size: 1.4rem;
		font-weight: 800;
		color: color-mix(in oklch, var(--row-accent) 60%, var(--text));
	}

	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
		text-decoration: none;
		color: inherit;
		gap: 0.15rem;
	}
	.meta:hover { text-decoration: none; }
	.artist {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.title {
		font-size: 0.95rem;
		color: var(--text);
		font-weight: 600;
	}
	.dim { color: var(--text-muted); font-weight: 400; }
	.notes {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-style: italic;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tags {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-top: 0.15rem;
	}
	.tag {
		font-size: 0.65rem;
		padding: 0.1rem 0.45rem;
		background: var(--bg-elevated, var(--surface));
		color: var(--text-muted);
		border-radius: 999px;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.buy-group {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.5rem;
		background: color-mix(in oklch, var(--row-accent) 8%, transparent);
		border: 1px solid color-mix(in oklch, var(--row-accent) 22%, transparent);
		border-radius: 999px;
		flex-wrap: wrap;
	}
	.buy-group .eyebrow {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
		padding: 0 0.25rem 0 0.1rem;
	}
	.chip {
		font-size: 0.72rem;
		padding: 0.25rem 0.55rem;
		background: var(--bg-elevated, var(--surface));
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		text-decoration: none;
		white-space: nowrap;
	}
	.chip:hover {
		color: var(--text);
		border-color: var(--text-muted);
		text-decoration: none;
	}
	.got-it {
		font-size: 0.78rem;
		padding: 0.4rem 0.7rem;
		background: color-mix(in oklch, var(--row-accent) 25%, transparent);
		color: var(--row-accent);
		border: 1px solid color-mix(in oklch, var(--row-accent) 35%, transparent);
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
	.got-it:hover:not(:disabled) {
		background: color-mix(in oklch, var(--row-accent) 40%, transparent);
	}
	.got-it:disabled { opacity: 0.6; cursor: wait; }

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 6rem 0;
		color: var(--text-muted);
	}
	.empty-headline {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--text);
	}
	.empty-sub { margin-bottom: 1rem; }

	@media (max-width: 640px) {
		.row {
			grid-template-columns: 56px 1fr;
			grid-template-rows: auto auto;
		}
		.row-actions {
			grid-column: 1 / -1;
			justify-content: flex-end;
			flex-wrap: wrap;
		}
		.thumb { width: 56px; height: 56px; }
	}
</style>
