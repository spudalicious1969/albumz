<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { IdleTile } from '../../routes/headliner/[username]/+page.server';

	let { tiles }: { tiles: IdleTile[] } = $props();

	// Calmer than the landing mosaic — lean-back pacing.
	const FLIP_INTERVAL_MS = 2000;
	const MAX_CONCURRENT_FLIPS = 1;
	const FLIP_DURATION_MS = 1500;
	const FIRST_FLIP_DELAY_MS = 3000;
	const RESIZE_DEBOUNCE_MS = 300;
	const GRID_GAP_PX = 6;

	type Slot = {
		faces: [IdleTile | null, IdleTile | null];
		showing: 0 | 1;
		flipping: boolean;
	};

	let slots = $state<Slot[]>([]);
	let flipping = $state(0);
	let gridEl: HTMLDivElement | undefined = $state();
	let frameEl: HTMLDivElement | undefined = $state();
	let generation = 0;

	function computeLayout(): { cols: number; rows: number } {
		if (typeof window === 'undefined') return { cols: 5, rows: 5 };
		const cell = window.innerWidth >= 1400 ? 180 : window.innerWidth >= 900 ? 160 : 140;
		const gap = GRID_GAP_PX;
		const innerWidth = (frameEl?.clientWidth ?? window.innerWidth) - 2 * gap;
		const innerHeight = (frameEl?.clientHeight ?? window.innerHeight) - 2 * gap;
		const cols = Math.max(1, Math.ceil((innerWidth + gap) / (cell + gap)));
		const rows = Math.max(1, Math.ceil((innerHeight + gap) / (cell + gap)));
		return { cols, rows };
	}

	function buildSlots(maxCells: number): Slot[] {
		const result: Slot[] = [];
		for (let i = 0; i < maxCells && i < tiles.length; i++) {
			result.push({ faces: [tiles[i], null], showing: 0, flipping: false });
		}
		// If the pool is smaller than the grid, repeat tiles to fill — initial
		// duplicates spread evenly via index modulo so identical covers don't sit
		// adjacent more often than necessary.
		let i = result.length;
		while (i < maxCells && tiles.length > 0) {
			result.push({
				faces: [tiles[i % tiles.length], null],
				showing: 0,
				flipping: false
			});
			i++;
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

	function pickNext(slotIdx: number): IdleTile | null {
		if (tiles.length === 0) return null;
		const onScreen = visibleTileIds();
		const strict = tiles.filter((t) => !onScreen.has(t.id));
		if (strict.length > 0) return strict[Math.floor(Math.random() * strict.length)];
		const slot = slots[slotIdx];
		const localIds = new Set<string>();
		if (slot.faces[0]) localIds.add(slot.faces[0].id);
		if (slot.faces[1]) localIds.add(slot.faces[1].id);
		const loose = tiles.filter((t) => !localIds.has(t.id));
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

	async function flipSlotTo(idx: number, next: IdleTile) {
		const slot = slots[idx];
		if (!slot || slot.flipping) return;
		const gen = generation;
		const hidden: 0 | 1 = slot.showing === 0 ? 1 : 0;
		slot.faces[hidden] = next;
		slot.flipping = true;
		flipping++;

		await preload(next.imageUrl);
		if (gen !== generation) return;
		slot.showing = hidden;

		setTimeout(() => {
			if (gen !== generation) return;
			const newlyHidden: 0 | 1 = slot.showing === 0 ? 1 : 0;
			slot.faces[newlyHidden] = null;
			slot.flipping = false;
			flipping--;
		}, FLIP_DURATION_MS);
	}

	async function tick() {
		if (flipping >= MAX_CONCURRENT_FLIPS) return;
		const candidates: number[] = [];
		for (let i = 0; i < slots.length; i++) {
			if (slots[i].flipping) continue;
			if (!isSlotOnScreen(i)) continue;
			candidates.push(i);
		}
		if (candidates.length === 0) return;
		const idx = candidates[Math.floor(Math.random() * candidates.length)];
		const next = pickNext(idx);
		if (!next) return;
		await flipSlotTo(idx, next);
	}

	let tickHandle: ReturnType<typeof setInterval> | undefined;
	let startHandle: ReturnType<typeof setTimeout> | undefined;
	let resizeHandle: ReturnType<typeof setTimeout> | undefined;

	function rebuild() {
		if (tickHandle) {
			clearInterval(tickHandle);
			tickHandle = undefined;
		}
		if (startHandle) {
			clearTimeout(startHandle);
			startHandle = undefined;
		}
		generation++;
		flipping = 0;
		const { cols, rows } = computeLayout();
		if (gridEl) gridEl.style.setProperty('--cols', String(cols));
		slots = buildSlots(cols * rows);
		// Skip the scheduler if the pool can't fill more than the visible cells —
		// every flip would either be a no-op or recycle into the same tile we just
		// hid. Looks bad. Static grid reads better.
		if (tiles.length > slots.length) {
			startHandle = setTimeout(() => {
				tickHandle = setInterval(tick, FLIP_INTERVAL_MS);
			}, FIRST_FLIP_DELAY_MS);
		}
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
		if (typeof window === 'undefined') return;
		window.removeEventListener('resize', onResize);
		if (tickHandle) clearInterval(tickHandle);
		if (startHandle) clearTimeout(startHandle);
		if (resizeHandle) clearTimeout(resizeHandle);
	});
</script>

<div class="frame" bind:this={frameEl}>
	<div class="grid" aria-hidden="true" bind:this={gridEl}>
		{#each slots as slot, i (i)}
			<div class="slot" style="animation-delay: {Math.min(i * 35, 1400)}ms;">
				<div
					class="flipper"
					class:showing-back={slot.showing === 1}
					style="transition-duration: {FLIP_DURATION_MS}ms;"
				>
					{#each [0, 1] as faceIdx (faceIdx)}
						{@const tile = slot.faces[faceIdx]}
						<div class="face" class:face-back={faceIdx === 1}>
							{#if tile}
								<img src={tile.imageUrl} alt="" loading="lazy" draggable="false" />
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
	<div class="vignette" aria-hidden="true"></div>
	<div class="grain" aria-hidden="true"></div>
</div>

<style>
	.frame {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	.grid {
		--cell: 140px;
		--gap: 6px;
		--cols: 5;
		display: grid;
		grid-template-columns: repeat(var(--cols), var(--cell));
		grid-auto-rows: var(--cell);
		gap: var(--gap);
		padding: var(--gap);
	}
	@media (min-width: 900px) {
		.grid {
			--cell: 160px;
		}
	}
	@media (min-width: 1400px) {
		.grid {
			--cell: 180px;
		}
	}

	.slot {
		position: relative;
		width: 100%;
		height: 100%;
		perspective: 1200px;
		animation: fade-in 1.2s ease-out both;
		opacity: 0.75;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: scale(0.94);
		}
		to {
			opacity: 0.75;
			transform: scale(1);
		}
	}

	.flipper {
		position: relative;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
		transition: transform 1.5s cubic-bezier(0.65, 0, 0.35, 1);
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
		background: #08070a;
	}
	.face-back {
		transform: rotateY(180deg);
	}

	.face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		filter: saturate(0.65) brightness(0.78);
	}

	.vignette {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 1;
		background: radial-gradient(
			ellipse at center,
			transparent 35%,
			rgba(0, 0, 0, 0.55) 80%,
			#08070a 100%
		);
	}

	.grain {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		opacity: 0.12;
		mix-blend-mode: overlay;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	@media (prefers-reduced-motion: reduce) {
		.flipper {
			transition: none;
		}
		.slot {
			animation: none;
		}
	}
</style>
