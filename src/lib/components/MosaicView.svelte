<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { MosaicTile } from '$lib/mosaic';

	let { tiles }: { tiles: MosaicTile[] } = $props();

	// ── Tunables ─────────────────────────────────────────────────────────
	const FLIP_INTERVAL_MS = 450; // gap between scheduling decisions
	const MAX_CONCURRENT_FLIPS = 5;
	const FLIP_DURATION_MS = 1100; // keep in sync with CSS transition below
	const FIRST_FLIP_DELAY_MS = 2200; // wait for initial fade-in to settle
	const FEATURED_EVERY_N_ALBUM = 9; // ~1 in 9 album slots becomes a 2x2 feature
	const RESIZE_DEBOUNCE_MS = 300;
	const GRID_GAP_PX = 6; // keep in sync with CSS --gap
	const NOWPLAYING_POLL_MS = 15000; // matches the /u/{username} hero poll cadence

	// ── Split tiles by kind ──────────────────────────────────────────────
	const nowPlayingTiles = tiles.filter(
		(t): t is Extract<MosaicTile, { kind: 'nowPlaying' }> => t.kind === 'nowPlaying'
	);
	const albumTiles = tiles.filter(
		(t): t is Extract<MosaicTile, { kind: 'album' }> => t.kind === 'album'
	);

	// ── Slot state ───────────────────────────────────────────────────────
	type SlotShape = '1x1' | '2x2';
	type Slot = {
		shape: SlotShape;
		faces: [MosaicTile | null, MosaicTile | null];
		showing: 0 | 1;
		flipping: boolean;
		locked: boolean; // now-playing slots don't flip — they're the live signal
	};

	let slots = $state<Slot[]>([]);
	let flipping = $state(0);
	let gridEl: HTMLDivElement | undefined = $state();
	let frameEl: HTMLDivElement | undefined = $state();
	let headerEl: HTMLElement | undefined = $state();
	// Bumps on rebuild so in-flight flip continuations from the previous layout
	// can detect they've been orphaned and bail out cleanly.
	let generation = 0;

	function computeLayout(): { cols: number; rows: number } {
		if (typeof window === 'undefined') return { cols: 5, rows: 5 };
		// Mirror the CSS --cell breakpoints
		const cell = window.innerWidth >= 1400 ? 180 : window.innerWidth >= 900 ? 160 : 140;
		const gap = GRID_GAP_PX;
		// Measure the FRAME (which has the visible viewport size). The inner grid
		// is intentionally larger than the frame to support bleed-off + pan.
		const innerWidth = (frameEl?.clientWidth ?? window.innerWidth) - 2 * gap;
		const headerHeight = headerEl?.offsetHeight ?? 0;
		const innerHeight = window.innerHeight - headerHeight - 2 * gap;
		// ceil() = always overshoot by enough to bleed a partial tile off the
		// right + bottom edges (preferred over leaving gutter space).
		const cols = Math.max(1, Math.ceil((innerWidth + gap) / (cell + gap)));
		const rows = Math.max(1, Math.ceil((innerHeight + gap) / (cell + gap)));
		return { cols, rows };
	}

	// Used to skip flips on slots that ended up below the fold or off to the
	// side after over-rendering. getBoundingClientRect respects the pan
	// transform, so a slot that's drifted into view will correctly read on-screen.
	function isSlotOnScreen(idx: number): boolean {
		if (!frameEl || !gridEl) return true;
		const el = gridEl.children[idx] as HTMLElement | undefined;
		if (!el) return true;
		const rect = el.getBoundingClientRect();
		const frameRect = frameEl.getBoundingClientRect();
		return (
			rect.bottom > frameRect.top &&
			rect.top < frameRect.bottom &&
			rect.right > frameRect.left &&
			rect.left < frameRect.right
		);
	}

	function buildSlotsForCells(maxCells: number): Slot[] {
		const result: Slot[] = [];
		let cellsUsed = 0;
		// Now-playing tiles always get a featured 2x2 slot at the top of the grid
		for (const t of nowPlayingTiles) {
			if (cellsUsed + 4 > maxCells) break;
			result.push({ shape: '2x2', faces: [t, null], showing: 0, flipping: false, locked: true });
			cellsUsed += 4;
		}
		let albumIdx = 0;
		while (cellsUsed < maxCells && albumIdx < albumTiles.length) {
			const tile = albumTiles[albumIdx++];
			// Sprinkle 2x2 album features through the grid for visual rhythm,
			// but only when there's room (otherwise downgrade to 1x1).
			const wantsFeature = result.length > 0 && result.length % FEATURED_EVERY_N_ALBUM === 0;
			const useFeature = wantsFeature && cellsUsed + 4 <= maxCells;
			const cost = useFeature ? 4 : 1;
			result.push({
				shape: useFeature ? '2x2' : '1x1',
				faces: [tile, null],
				showing: 0,
				flipping: false,
				locked: false
			});
			cellsUsed += cost;
		}
		// Safety buffer of pure 1x1 slots — when a 2x2 forces CSS dense flow to
		// extend the grid, the cells it skips over need filling. Dense flow
		// scans from the start of the grid on every placement, so these buffer
		// 1x1s backfill the visible gaps before flowing into the overshoot rows.
		// Kept small so we don't render lots of content below the viewport fold.
		const SAFETY_BUFFER = 8;
		let buffer = 0;
		while (buffer < SAFETY_BUFFER && albumIdx < albumTiles.length) {
			const tile = albumTiles[albumIdx++];
			result.push({
				shape: '1x1',
				faces: [tile, null],
				showing: 0,
				flipping: false,
				locked: false
			});
			buffer++;
		}
		return result;
	}

	function visibleTileIds(): Set<string> {
		const set = new Set<string>();
		for (const s of slots) {
			if (s.faces[0]) set.add(s.faces[0].id);
			if (s.faces[1]) set.add(s.faces[1].id);
		}
		return set;
	}

	function pickNextAlbumTile(slotIdx: number): MosaicTile | null {
		// Strict: don't repeat anything currently visible anywhere on screen.
		const onScreen = visibleTileIds();
		const strict = albumTiles.filter((t) => !onScreen.has(t.id));
		if (strict.length > 0) {
			return strict[Math.floor(Math.random() * strict.length)];
		}
		// Loose fallback (pool smaller than visible slots): allow tiles already
		// shown elsewhere, just never pick something already on this same slot
		// (that would flip into the same image — no visible motion).
		const slot = slots[slotIdx];
		const localIds = new Set<string>();
		if (slot.faces[0]) localIds.add(slot.faces[0].id);
		if (slot.faces[1]) localIds.add(slot.faces[1].id);
		const loose = albumTiles.filter((t) => !localIds.has(t.id));
		if (loose.length === 0) return null;
		return loose[Math.floor(Math.random() * loose.length)];
	}

	function preload(url: string): Promise<void> {
		return new Promise((resolve) => {
			const img = new Image();
			let settled = false;
			const done = () => {
				if (!settled) {
					settled = true;
					resolve();
				}
			};
			img.onload = done;
			img.onerror = done;
			setTimeout(done, 5000);
			img.src = url;
		});
	}

	// Flip a single slot to a new tile. Shared by the random-album scheduler
	// (which respects MAX_CONCURRENT_FLIPS) and now-playing polling (which
	// always flips on track change, so it doesn't count toward the limit).
	async function flipSlotTo(idx: number, newTile: MosaicTile, countsTowardLimit: boolean) {
		const slot = slots[idx];
		if (!slot || slot.flipping) return;

		const gen = generation;
		const hidden: 0 | 1 = slot.showing === 0 ? 1 : 0;
		slot.faces[hidden] = newTile;
		slot.flipping = true;
		if (countsTowardLimit) flipping++;

		await preload(newTile.imageUrl);
		if (gen !== generation) return; // orphaned by a rebuild — bail
		slot.showing = hidden;

		setTimeout(() => {
			if (gen !== generation) return;
			const newlyHidden: 0 | 1 = slot.showing === 0 ? 1 : 0;
			slot.faces[newlyHidden] = null;
			slot.flipping = false;
			if (countsTowardLimit) flipping--;
		}, FLIP_DURATION_MS);
	}

	async function tick() {
		if (flipping >= MAX_CONCURRENT_FLIPS) return;

		const candidates: number[] = [];
		for (let i = 0; i < slots.length; i++) {
			if (slots[i].locked || slots[i].flipping) continue;
			if (!isSlotOnScreen(i)) continue;
			candidates.push(i);
		}
		if (candidates.length === 0) return;

		const idx = candidates[Math.floor(Math.random() * candidates.length)];
		const next = pickNextAlbumTile(idx);
		if (!next) return;

		await flipSlotTo(idx, next, true);
	}

	let tickHandle: ReturnType<typeof setInterval> | undefined;
	let startHandle: ReturnType<typeof setTimeout> | undefined;
	let resizeHandle: ReturnType<typeof setTimeout> | undefined;
	let nowPlayingHandles: ReturnType<typeof setInterval>[] = [];

	type NowPlayingApiResult = {
		state: 'playing' | 'recent' | 'none';
		artist: string | null;
		track: string | null;
		album: string | null;
		coverUrl: string | null;
		coverCandidates?: string[];
	};

	async function pollNowPlaying(idx: number, username: string, displayName: string) {
		try {
			const res = await fetch(`/api/now-playing/${username}`);
			if (!res.ok) return;
			const data = (await res.json()) as NowPlayingApiResult;
			if (data.state !== 'playing' || !data.artist || !data.track) return;

			const slot = slots[idx];
			if (!slot || !slot.locked) return;
			const current = slot.faces[slot.showing];
			if (
				current?.kind === 'nowPlaying' &&
				current.artist === data.artist &&
				current.track === data.track
			) {
				return; // unchanged
			}

			const cover = data.coverCandidates?.[0] ?? data.coverUrl;
			if (!cover) return;

			const newTile: Extract<MosaicTile, { kind: 'nowPlaying' }> = {
				kind: 'nowPlaying',
				id: `nowplaying:${username}`,
				artist: data.artist,
				track: data.track,
				album: data.album ?? null,
				imageUrl: cover,
				spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(`${data.artist} ${data.track}`)}`,
				username,
				displayName
			};

			await flipSlotTo(idx, newTile, false);
		} catch {
			// swallow — try again on next interval
		}
	}

	function startNowPlayingPolling() {
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			if (!slot.locked) continue;
			const tile = slot.faces[slot.showing];
			if (tile?.kind !== 'nowPlaying') continue;
			const { username, displayName } = tile;
			const handle = setInterval(
				() => pollNowPlaying(i, username, displayName),
				NOWPLAYING_POLL_MS
			);
			nowPlayingHandles.push(handle);
		}
	}

	function stopNowPlayingPolling() {
		for (const h of nowPlayingHandles) clearInterval(h);
		nowPlayingHandles = [];
	}

	function rebuild() {
		if (tickHandle) {
			clearInterval(tickHandle);
			tickHandle = undefined;
		}
		if (startHandle) {
			clearTimeout(startHandle);
			startHandle = undefined;
		}
		stopNowPlayingPolling();
		generation++;
		flipping = 0;
		const { cols, rows } = computeLayout();
		// Drive the CSS grid-template-columns count from JS so we can force the
		// overshoot column (auto-fill would happily leave a gutter instead).
		if (gridEl) gridEl.style.setProperty('--cols', String(cols));
		slots = buildSlotsForCells(cols * rows);
		startNowPlayingPolling();
		startHandle = setTimeout(() => {
			tickHandle = setInterval(tick, FLIP_INTERVAL_MS);
		}, FIRST_FLIP_DELAY_MS);
	}

	function onResize() {
		if (resizeHandle) clearTimeout(resizeHandle);
		resizeHandle = setTimeout(rebuild, RESIZE_DEBOUNCE_MS);
	}

	onMount(() => {
		rebuild();
		window.addEventListener('resize', onResize);
	});

	onDestroy(() => {
		// Svelte 5 fires onDestroy during SSR cleanup as well — guard window access
		if (typeof window === 'undefined') return;
		window.removeEventListener('resize', onResize);
		if (tickHandle) clearInterval(tickHandle);
		if (startHandle) clearTimeout(startHandle);
		if (resizeHandle) clearTimeout(resizeHandle);
		stopNowPlayingPolling();
	});

	function tileHref(t: MosaicTile): string {
		return t.kind === 'album' ? `/u/${t.username}/albums/${t.albumId}` : t.spotifyUrl;
	}

	function tileTitle(t: MosaicTile): string {
		return t.kind === 'album'
			? `${t.artist} – ${t.title} · ${t.displayName}`
			: `Now playing: ${t.artist} – ${t.track} · ${t.displayName}`;
	}

	function tileAlt(t: MosaicTile): string {
		return t.kind === 'album' ? `${t.artist} – ${t.title}` : `${t.artist} – ${t.track}`;
	}

	function tileExternal(t: MosaicTile): boolean {
		return t.kind === 'nowPlaying';
	}
</script>

<div class="mosaic-page">
	<header class="mosaic-header" bind:this={headerEl}>
		<span class="wordmark">album<span>z</span></span>
		<nav>
			<a href="/login">Sign in</a>
			<a href="/register" class="register">Create account</a>
		</nav>
	</header>

	{#if tiles.length === 0}
		<div class="mosaic-empty">
			<p class="wordmark large">album<span>z</span></p>
			<p class="empty-hint">Sign in to start your collection.</p>
		</div>
	{:else}
		<div class="bento-frame" bind:this={frameEl}>
			<div class="bento-grid" aria-hidden="true" bind:this={gridEl}>
				{#each slots as slot, i (i)}
					<div
						class="slot"
						class:feature={slot.shape === '2x2'}
						style="animation-delay: {Math.min(i * 35, 1400)}ms;"
					>
						<div
							class="flipper"
							class:showing-back={slot.showing === 1}
							style="transition-duration: {FLIP_DURATION_MS}ms;"
						>
							{#each [0, 1] as faceIdx (faceIdx)}
								{@const tile = slot.faces[faceIdx]}
								<div
									class="face"
									class:face-back={faceIdx === 1}
									style={tile?.kind === 'album' && tile.accentColor
										? `--tile-accent: ${tile.accentColor};`
										: ''}
								>
									{#if tile}
										<a
											class="tile-link"
											class:now-playing={tile.kind === 'nowPlaying'}
											href={tileHref(tile)}
											target={tileExternal(tile) ? '_blank' : undefined}
											rel={tileExternal(tile) ? 'noopener noreferrer' : undefined}
											title={tileTitle(tile)}
											tabindex={faceIdx === slot.showing ? 0 : -1}
											aria-hidden={faceIdx === slot.showing ? undefined : 'true'}
										>
											<img
												src={tile.imageUrl}
												alt={tileAlt(tile)}
												loading="lazy"
												draggable="false"
											/>
											{#if tile.kind === 'nowPlaying'}
												<span class="live-dot" aria-hidden="true"></span>
												<span class="hover-label">Open in Spotify ▶</span>
											{:else}
												<span class="hover-label">View album →</span>
											{/if}
										</a>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<div class="noir-vignette" aria-hidden="true"></div>
			<div class="noir-grain" aria-hidden="true"></div>
		</div>
	{/if}
</div>

<style>
	.mosaic-page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.mosaic-header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.25rem 1.5rem;
		background: color-mix(in oklch, var(--bg) 80%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
	}
	.wordmark {
		font-size: 1.4rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		color: var(--text);
	}
	.wordmark span {
		text-shadow:
			0 0 18px var(--accent-glow),
			0 0 6px var(--accent-glow);
	}
	.wordmark.large {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.mosaic-header nav {
		display: flex;
		gap: 1rem;
		align-items: center;
		font-size: 0.85rem;
	}
	.mosaic-header nav a {
		color: var(--text-muted);
	}
	.mosaic-header nav a.register {
		padding: 0.4rem 1rem;
		background: var(--accent);
		color: #fff;
		border-radius: 100px;
		text-decoration: none;
		font-weight: 600;
	}

	/* ── Bento grid ──────────────────────────────────────────────────── */
	/* Outer frame: the visible viewport that clips the over-sized grid inside */
	.bento-frame {
		position: relative;
		flex: 1;
		overflow: hidden;
	}

	.bento-grid {
		--cell: 140px;
		--gap: 6px;
		--cols: 5; /* default before JS measures — overwritten on mount */
		display: grid;
		grid-template-columns: repeat(var(--cols), var(--cell));
		grid-auto-rows: var(--cell);
		grid-auto-flow: dense;
		gap: var(--gap);
		padding: var(--gap);
	}
	@media (min-width: 900px) {
		.bento-grid {
			--cell: 160px;
		}
	}
	@media (min-width: 1400px) {
		.bento-grid {
			--cell: 180px;
		}
	}

	.slot {
		position: relative;
		width: 100%;
		height: 100%;
		perspective: 1200px;
		animation: fade-in 0.9s ease-out both;
	}
	.slot.feature {
		grid-column: span 2;
		grid-row: span 2;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: scale(0.94);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* ── 3D flipper ──────────────────────────────────────────────────── */
	.flipper {
		position: relative;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
		transition: transform 1.1s cubic-bezier(0.65, 0, 0.35, 1);
	}
	.flipper.showing-back {
		transform: rotateY(180deg);
	}
	.face {
		position: absolute;
		inset: 0;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		overflow: hidden;
		background: var(--bg-elevated);
	}
	.face-back {
		transform: rotateY(180deg);
	}

	/* ── Tile link / image ───────────────────────────────────────────── */
	.tile-link {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		text-decoration: none;
		color: inherit;
	}
	.tile-link img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition:
			transform 0.6s,
			filter 0.4s;
		filter: saturate(0.92);
	}
	.tile-link:hover img {
		transform: scale(1.05);
		filter: saturate(1.15);
	}

	/* ── Hover label ─────────────────────────────────────────────────── */
	.hover-label {
		position: absolute;
		left: 8px;
		bottom: 8px;
		right: 8px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: #fff;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
		opacity: 0;
		transform: translateY(4px);
		transition:
			opacity 0.18s,
			transform 0.18s;
		pointer-events: none;
	}
	.tile-link:hover .hover-label {
		opacity: 1;
		transform: translateY(0);
	}

	/* ── Now-playing accents ─────────────────────────────────────────── */
	.tile-link.now-playing {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.live-dot {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 10px var(--accent-glow);
		animation: pulse 1.4s ease-in-out infinite;
		z-index: 1;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.3);
		}
	}

	/* ── Neo-noir overlays ───────────────────────────────────────────── */
	.noir-vignette,
	.noir-grain {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* Subtle corner darkening — gives the frame "lens character" */
	.noir-vignette {
		z-index: 1;
		background: radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.3) 100%);
	}

	/* Static SVG fractalNoise tile, blended over the grid as filmstock grain */
	.noir-grain {
		z-index: 3;
		opacity: 0.08;
		mix-blend-mode: overlay;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	/* ── Empty state ─────────────────────────────────────────────────── */
	.mosaic-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 4rem 1.5rem;
	}
	.empty-hint {
		color: var(--text-muted);
		font-size: 0.95rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.flipper {
			transition: none;
		}
		.slot {
			animation: none;
		}
		.live-dot {
			animation: none;
		}
		.tile-link img {
			transition: none;
		}
	}
</style>
