<script lang="ts">
	import { goto } from '$app/navigation';
	import { lookup } from '$lib/lookup-state.svelte';

	type LookupAlbum = {
		id: string;
		artist: string;
		title: string;
		year: number | null;
		format: string | null;
		ownership: 'OWN' | 'WANT';
		cover_url: string | null;
	};

	let query = $state('');
	let albums = $state<LookupAlbum[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let selectedIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	const q = $derived(query.trim().toLowerCase());

	const filtered = $derived.by(() => {
		if (!q) return albums.slice(0, 25);
		return albums.filter((a) =>
			a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
		);
	});

	async function loadAlbums() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch('/api/albums/lookup');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json() as { albums: LookupAlbum[] };
			albums = data.albums;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	function handleGlobalKey(e: KeyboardEvent) {
		const isMod = e.metaKey || e.ctrlKey;
		if (isMod && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			lookup.toggle();
		} else if (e.key === 'Escape' && lookup.isOpen) {
			lookup.close();
		}
	}

	function handleListKey(e: KeyboardEvent) {
		if (!lookup.isOpen) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter') {
			const target = filtered[selectedIndex];
			if (target) {
				e.preventDefault();
				openAlbum(target.id);
			}
		}
	}

	function openAlbum(id: string) {
		lookup.close();
		goto(`/albums/${id}`);
	}

	function addAlbum() {
		const parts = query.trim().split(/\s+-\s+|\s+–\s+/);
		const artist = parts[0] ?? query.trim();
		const title = parts[1] ?? '';
		const params = new URLSearchParams();
		if (artist) params.set('artist', artist);
		if (title) params.set('title', title);
		lookup.close();
		goto(`/albums/new?${params.toString()}`);
	}

	// Reset on open/close; load albums + focus on open
	$effect(() => {
		if (lookup.isOpen) {
			query = '';
			selectedIndex = 0;
			loadAlbums();
			// next tick to ensure input is mounted
			queueMicrotask(() => inputEl?.focus());
		}
	});

	// Clamp selection when filter changes
	$effect(() => {
		if (selectedIndex >= filtered.length) {
			selectedIndex = filtered.length > 0 ? filtered.length - 1 : 0;
		}
	});

	// Scroll selected row into view
	$effect(() => {
		if (!listEl) return;
		const row = listEl.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`);
		row?.scrollIntoView({ block: 'nearest' });
	});
</script>

<svelte:window onkeydown={handleGlobalKey} />

{#if lookup.isOpen}
	<div
		class="backdrop"
		role="presentation"
		onclick={() => lookup.close()}
	>
		<div
			class="palette"
			role="dialog"
			aria-label="Look up an album"
			aria-modal="true"
			onclick={(e) => e.stopPropagation()}
			onkeydown={handleListKey}
		>
			<div class="search-row">
				<svg class="search-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
					<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
					<path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					placeholder="Do I have this? Artist or album title…"
					autocomplete="off"
					autocorrect="off"
					autocapitalize="off"
					spellcheck="false"
				/>
				<button class="close" onclick={() => lookup.close()} aria-label="Close">✕</button>
			</div>

			<div class="results" bind:this={listEl}>
				{#if loading && albums.length === 0}
					<div class="status">Loading your collection…</div>
				{:else if loadError}
					<div class="status error">{loadError}</div>
				{:else if filtered.length === 0 && q}
					<div class="empty">
						<p class="empty-headline">Not in your collection</p>
						<p class="empty-sub">No matches for <strong>{query}</strong></p>
						<button class="btn-add" onclick={addAlbum}>+ Add this album</button>
					</div>
				{:else if filtered.length === 0}
					<div class="status">Your collection is empty.</div>
				{:else}
					{#if !q}
						<div class="results-label">Recent additions</div>
					{/if}
					{#each filtered as album, idx (album.id)}
						<button
							type="button"
							class="row"
							class:selected={idx === selectedIndex}
							data-idx={idx}
							onclick={() => openAlbum(album.id)}
							onmouseenter={() => (selectedIndex = idx)}
						>
							<div class="thumb">
								{#if album.cover_url}
									<img src={album.cover_url} alt="" loading="lazy" />
								{:else}
									<span class="thumb-initial">{album.artist.slice(0, 1)}</span>
								{/if}
							</div>
							<div class="meta">
								<span class="artist">{album.artist}</span>
								<span class="title">
									{album.title}
									{#if album.year}<span class="year">· {album.year}</span>{/if}
								</span>
							</div>
							<span class="badge" class:want={album.ownership === 'WANT'}>
								{album.ownership === 'WANT' ? 'Want' : 'Owned'}
							</span>
						</button>
					{/each}
				{/if}
			</div>

			<div class="footer">
				<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
				<span><kbd>↵</kbd> open</span>
				<span><kbd>Esc</kbd> close</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: color-mix(in oklch, black 55%, transparent);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 8vh 1rem 1rem;
		z-index: 1000;
		animation: fade-in 0.12s ease-out;
	}

	.palette {
		width: 100%;
		max-width: 580px;
		max-height: 70vh;
		background: var(--bg-elevated, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lift, 0 30px 60px rgba(0, 0, 0, 0.5));
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: slide-in 0.15s ease-out;
	}

	.search-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
	}
	.search-icon { color: var(--text-muted); flex-shrink: 0; }
	.search-row input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: var(--text);
		font-size: 1rem;
		padding: 0.25rem 0;
		font-family: inherit;
	}
	.close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius);
	}
	.close:hover { color: var(--text); background: var(--surface); }

	.results {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 0;
	}
	.results-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		padding: 0.5rem 1rem 0.25rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		padding: 0.55rem 1rem;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		color: var(--text);
		font-family: inherit;
	}
	.row.selected { background: var(--surface); }

	.thumb {
		width: 40px;
		height: 40px;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.thumb img { width: 100%; height: 100%; object-fit: cover; }
	.thumb-initial {
		font-size: 1.1rem;
		font-weight: 800;
		color: var(--text-muted);
	}

	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	.artist {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.title {
		font-size: 0.9rem;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.year { color: var(--text-muted); font-weight: 400; }

	.badge {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 18%, transparent);
		color: var(--accent);
		flex-shrink: 0;
	}
	.badge.want {
		background: var(--surface);
		color: var(--text-muted);
	}

	.status, .empty {
		padding: 1.5rem 1rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.status.error { color: oklch(60% 0.18 25); }

	.empty-headline {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text);
		margin-bottom: 0.3rem;
	}
	.empty-sub { margin-bottom: 1rem; }
	.btn-add {
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.btn-add:hover { opacity: 0.9; }

	.footer {
		display: flex;
		gap: 1rem;
		padding: 0.55rem 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	kbd {
		display: inline-block;
		padding: 0.05rem 0.35rem;
		font-family: inherit;
		font-size: 0.7rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 4px;
		margin-right: 0.25rem;
	}

	/* Mobile: full-screen sheet */
	@media (max-width: 640px) {
		.backdrop {
			padding: 0;
			align-items: stretch;
			backdrop-filter: none;
			background: var(--bg, #08070a);
		}
		.palette {
			max-width: none;
			max-height: none;
			height: 100%;
			border-radius: 0;
			border: none;
			animation: slide-up 0.18s ease-out;
		}
		.footer { display: none; }
	}

	@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
	@keyframes slide-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
	@keyframes slide-up { from { transform: translateY(100%); } to { transform: none; } }
</style>
