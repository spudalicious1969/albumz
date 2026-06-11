<script lang="ts">
	// Mini Headliner — a compact now-playing widget meant to live in a small,
	// corner-of-the-screen browser window while you listen. The mini IS the album
	// cover: a square of art that goes full-bleed at a square window, with the
	// track info + listen status layered over it in a bottom scrim. Off-square
	// windows letterbox the square against a blurred backdrop (Headliner DNA), so
	// the layout never shatters regardless of how you size the window.
	//
	// No mosaic, no Spin ritual card. The mic engine (SpinSessionRunner) lives in
	// the root layout and watches the shared `spin` store, so this page only flips
	// `spin.toggle()` and reads back state — there's no recorder here.
	//
	// Polling/accent/cover-fallback logic mirrors the full Headliner, trimmed of
	// the idle-streak + mosaic-takeover machinery this view doesn't need.

	import { onMount, onDestroy } from 'svelte';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import { spin } from '$lib/spin-state.svelte';
	import type { PageData } from './$types';
	import type { NowPlayingResult } from '$lib/now-playing';

	let { data }: { data: PageData } = $props();

	// Hold the live presentation for this long after the most recent 'playing'
	// ping so quick between-track gaps don't flick "Currently" → "Last".
	const LIVE_GRACE_MS = 15 * 1000;
	const POLL_INTERVAL_MS = 15 * 1000;

	let current = $state<NowPlayingResult>(data.initial);
	let accent = $state<string>('var(--accent)');
	let nowMs = $state<number>(Date.now());
	let lastPlayingAt = $state<number>(data.initial.state === 'playing' ? Date.now() : 0);
	let timer: ReturnType<typeof setInterval> | null = null;

	// Cover-fallback chain: try candidates in order, advance on <img> error.
	// Reset when the track changes.
	let coverIdx = $state(0);
	let lastTrackKey = $state('');
	$effect(() => {
		const key = `${current.track ?? ''}::${current.artist ?? ''}`;
		if (key !== lastTrackKey) {
			lastTrackKey = key;
			coverIdx = 0;
		}
	});
	const activeCoverUrl = $derived(current.coverCandidates?.[coverIdx] ?? null);

	// Pull a fresh accent from whichever cover URL actually displays. The
	// cancellation guard stops a slow stale Image from clobbering a newer accent.
	$effect(() => {
		const url = activeCoverUrl;
		if (!url) {
			accent = 'var(--accent)';
			return;
		}
		const img = new Image();
		img.crossOrigin = 'anonymous';
		let cancelled = false;
		img.onload = () => {
			if (!cancelled) accent = extractAccentColorFromImg(img);
		};
		img.src = url;
		return () => {
			cancelled = true;
		};
	});

	async function refresh() {
		nowMs = Date.now();
		try {
			const res = await fetch(`/api/now-playing/${data.profile.username}`);
			if (!res.ok) return;
			const next: NowPlayingResult = await res.json();

			// Once we have data, a 'none' is a failed read, not real idle.
			if (next.state === 'none' && current.state !== 'none') return;
			if (next.state === 'playing') lastPlayingAt = Date.now();

			const sameTrack = next.track === current.track && next.artist === current.artist;
			if (sameTrack) {
				// Same song — keep cover candidates stable so the {#key} block doesn't
				// re-mount and restart the fade just because result order shifted.
				current = {
					...current,
					state: next.state,
					source: next.source,
					playedAt: next.playedAt,
					album: next.album ?? current.album
				};
			} else {
				current = next;
			}
		} catch {
			// Transient errors are fine; next tick retries.
		}
	}

	function handleVisibilityChange() {
		if (document.visibilityState !== 'visible') return;
		refresh();
		if (timer) clearInterval(timer);
		timer = setInterval(refresh, POLL_INTERVAL_MS);
	}

	onMount(() => {
		timer = setInterval(refresh, POLL_INTERVAL_MS);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		const prevOverflow = document.body.style.overflow;
		const prevBg = document.body.style.background;
		document.body.style.overflow = 'hidden';
		document.body.style.background = '#000';
		return () => {
			document.body.style.overflow = prevOverflow;
			document.body.style.background = prevBg;
		};
	});
	onDestroy(() => {
		if (timer) clearInterval(timer);
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	const displayName = $derived(data.profile.display_name || data.profile.username);
	const effectiveState = $derived(
		current.state === 'recent' && lastPlayingAt > 0 && nowMs - lastPlayingAt < LIVE_GRACE_MS
			? 'playing'
			: current.state
	);
	const eyebrowSymbol = $derived(
		effectiveState === 'playing' ? '♪' : effectiveState === 'recent' ? '⏵' : ''
	);
	const eyebrowLabel = $derived(
		effectiveState === 'playing'
			? current.source === 'streamed'
				? 'Currently Streaming'
				: 'Currently Spinning'
			: effectiveState === 'recent'
				? current.source === 'streamed'
					? 'Last Streamed'
					: 'Last Spun'
				: 'Quiet'
	);

	// Listen toggle (owner only). Mirrors the SpinCard's mic language.
	const micLabel = $derived(
		spin.active ? (spin.runnerStatus === 'identifying' ? 'Identifying…' : 'Listening') : 'Listen'
	);
	const latestSpin = $derived(spin.spins[0] ?? null);

	// Swap back to the full Headliner. The mini was script-opened, so it's allowed
	// to close itself — hand off to the full view (near-fullscreen) and tidy the
	// popup away in one gesture. Only self-close if the full view actually opened,
	// so a popup blocker can't strand the user with nothing. Closing the mini as
	// the full opens also means we're never listening in two windows at once.
	function openFull() {
		const w = window.open(
			`/headliner/${data.profile.username}`,
			'albumz-headliner',
			`popup,width=${screen.availWidth},height=${screen.availHeight},left=0,top=0`
		);
		if (w) {
			w.focus();
			window.close();
		}
	}

	// "Caught it" flash — pulse the last-caught line briefly whenever a new spin
	// lands, so a glance confirms the mic actually heard you.
	let justCaught = $state(false);
	let lastSeenSpinId = $state<string | null>(null);
	let caughtTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const id = latestSpin?.id ?? null;
		if (id && id !== lastSeenSpinId) {
			// Don't flash on first mount when restoring an existing session.
			if (lastSeenSpinId !== null) {
				justCaught = true;
				if (caughtTimer) clearTimeout(caughtTimer);
				caughtTimer = setTimeout(() => (justCaught = false), 2200);
			}
			lastSeenSpinId = id;
		}
	});
	onDestroy(() => {
		if (caughtTimer) clearTimeout(caughtTimer);
	});
</script>

<svelte:head>
	<title>Mini — {displayName}</title>
	<meta name="theme-color" content="#08070a" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
</svelte:head>

<div class="mini" style="--hl-accent: {accent}">
	{#if activeCoverUrl}
		{#key activeCoverUrl}
			<div class="bg-layer" style="background-image: url({activeCoverUrl})"></div>
		{/key}
	{/if}

	<!-- `.frame` is a size container; `.art` reads it to become the largest square
	     that fits the window, so the cover full-bleeds at a square window and
	     letterboxes gracefully against the blurred backdrop otherwise. -->
	<div class="frame">
		<div class="art">
			{#if activeCoverUrl}
				{#key activeCoverUrl}
					<img
						class="cover"
						src={activeCoverUrl}
						alt="{current.artist} – {current.album ?? current.track}"
						onerror={() => coverIdx++}
					/>
				{/key}
			{:else}
				<div class="cover placeholder">
					<span>{(current.artist ?? '?').slice(0, 1)}</span>
				</div>
			{/if}

			<!-- Swap to the full Headliner, top-left. Because the mini was script-
			     opened it can close itself, so this hands off to the full view and
			     tidies the popup away in one gesture (also avoiding double-catch). -->
			<button
				class="corner-btn full"
				type="button"
				onclick={openFull}
				title="Open the full Headliner"
				aria-label="Open the full Headliner"
			>
				<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
					<path
						fill="currentColor"
						d="M4 9V4h5v2H6v3H4zm0 6h2v3h3v2H4v-5zm16 0v5h-5v-2h3v-3h2zM15 6V4h5v5h-2V6h-3z"
					/>
				</svg>
				<span class="corner-label">Full</span>
			</button>

			{#if data.isOwner}
				<!-- Listen control floats over the cover, top-right. Its own blur
				     backdrop keeps it legible over any artwork; always visible so the
				     listen *status* never hides, even when the track text goes quiet. -->
				<button
					class="corner-btn mic"
					class:on={spin.active}
					class:identifying={spin.runnerStatus === 'identifying'}
					type="button"
					onclick={() => spin.toggle()}
					aria-pressed={spin.active}
					title={spin.active ? 'Stop listening' : 'Listen for spins'}
				>
					<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
						<path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor" />
						<path
							d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21h-2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11z"
							fill="currentColor"
						/>
					</svg>
					<span class="corner-label">{micLabel}</span>
				</button>
			{/if}

			<!-- Bottom gradient scrim carries the now-playing story + last-caught
			     line, layered over the cover. Text scales to the cover (cq units),
			     not the window, so it stays proportional as you shrink the mini. -->
			<div class="scrim">
				<p class="eyebrow">
					<span class="dot" class:live={effectiveState === 'playing'}></span>
					<span class="eyebrow-text">
						{#if eyebrowSymbol}<span class="eyebrow-symbol">{eyebrowSymbol}</span>
						{/if}{eyebrowLabel}
					</span>
				</p>
				{#if current.track}
					<h1 class="track">{current.track}</h1>
				{/if}
				{#if current.artist}
					<p class="artist">{current.artist}</p>
				{/if}

				{#if data.isOwner}
					{#if latestSpin}
						<p class="caught" class:flash={justCaught} aria-live="polite">
							<span class="caught-mark" class:spun={latestSpin.source === 'spun'}
								>{latestSpin.source === 'spun' ? '◉' : '⇢'}</span
							>
							<span class="caught-text">{latestSpin.track} · {latestSpin.artist}</span>
						</p>
					{:else if spin.active}
						<p class="caught listening-hint">Listening…</p>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.mini {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #08070a;
		color: #f0ead8;
		font-family: inherit;
	}

	/* Blurred cover fills the window behind the square — only visible as a
	   letterbox surround when the window isn't square. Keeps it atmospheric. */
	.bg-layer {
		position: absolute;
		inset: -10%;
		background-size: cover;
		background-position: center;
		filter: blur(60px) saturate(1.4);
		transform: scale(1.15);
		opacity: 0.5;
		animation: bg-fade-in 1s ease-out forwards;
	}
	@keyframes bg-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.5;
		}
	}

	.frame {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		container-type: size;
	}

	/* Largest square that fits the window: min of the frame's two dimensions. */
	.art {
		position: relative;
		width: min(100cqw, 100cqh);
		height: min(100cqw, 100cqh);
		container-type: size;
		border-radius: 10px;
		overflow: hidden;
		box-shadow:
			0 14px 36px rgba(0, 0, 0, 0.6),
			0 0 70px color-mix(in oklch, var(--hl-accent) 38%, transparent);
		animation: art-in 0.9s ease-out forwards;
	}
	@keyframes art-in {
		from {
			opacity: 0;
			transform: scale(0.97);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.cover {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.cover.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklch, var(--hl-accent) 18%, #100e14);
		font-size: 40cqmin;
		font-weight: 800;
		color: color-mix(in oklch, var(--hl-accent) 60%, #f0ead8);
	}

	/* Shared corner control — a clean glyph circle floating over the cover. Both
	   the swap-to-full button (top-left) and the mic (top-right) wear this; state
	   and the hover-revealed label ride on top. */
	.corner-btn {
		position: absolute;
		top: 3.5cqmin;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 0;
		padding: 0.4rem;
		background: color-mix(in oklch, #08070a 60%, transparent);
		border: 1px solid color-mix(in oklch, #f0ead8 22%, transparent);
		border-radius: 999px;
		color: color-mix(in oklch, #f0ead8 78%, transparent);
		font-size: clamp(0.62rem, 3.4cqmin, 0.78rem);
		font-weight: 600;
		letter-spacing: 0.03em;
		cursor: pointer;
		backdrop-filter: blur(10px);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
		transition:
			color 0.2s,
			border-color 0.2s,
			background 0.2s;
	}
	.corner-btn:hover {
		color: #f0ead8;
		border-color: color-mix(in oklch, #f0ead8 45%, transparent);
	}
	.full {
		left: 3.5cqmin;
	}
	.mic {
		right: 3.5cqmin;
	}
	/* Mini default: a clean glyph circle — for the mic, state lives in colour and
	   pulse, so the word isn't needed at rest. The label expands in on hover or
	   keyboard focus, keeping the affordance one mouse-over away. */
	.corner-label {
		max-width: 0;
		margin-left: 0;
		overflow: hidden;
		white-space: nowrap;
		opacity: 0;
		transition:
			max-width 0.25s ease,
			margin-left 0.25s ease,
			opacity 0.18s ease;
	}
	.corner-btn:hover .corner-label,
	.corner-btn:focus-visible .corner-label {
		max-width: 8rem;
		margin-left: 0.4rem;
		opacity: 1;
	}
	/* Armed mic overrides the shared hover colour, so it stays red on hover too. */
	.mic.on,
	.mic.on:hover {
		color: #ff6b6b;
		border-color: rgba(255, 107, 107, 0.55);
		background: color-mix(in oklch, #08070a 45%, transparent);
	}
	.mic.on::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #ff6b6b;
		margin-right: -0.1rem;
		animation: mic-pulse 1.6s ease-out infinite;
	}
	.mic.on.identifying::before {
		animation-duration: 0.7s;
	}
	@keyframes mic-pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.6);
		}
		70% {
			box-shadow: 0 0 0 7px rgba(255, 107, 107, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
		}
	}
	.scrim {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 1.2cqmin;
		padding: 16cqmin 6cqmin 5cqmin;
		background: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.9) 0%,
			rgba(0, 0, 0, 0.62) 42%,
			rgba(0, 0, 0, 0) 100%
		);
	}

	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: clamp(0.55rem, 3.2cqmin, 0.74rem);
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--hl-accent);
		text-shadow: 0 1px 10px rgba(0, 0, 0, 0.8);
	}
	.eyebrow-symbol {
		color: #f0ead8;
		font-weight: 700;
		text-shadow:
			0 0 18px var(--hl-accent),
			0 0 7px var(--hl-accent);
	}
	.dot {
		width: 0.5em;
		height: 0.5em;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.7;
		flex-shrink: 0;
	}
	.dot.live {
		opacity: 1;
		box-shadow: 0 0 10px currentColor;
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.45;
			transform: scale(1.4);
		}
	}

	.track {
		margin: 0;
		font-size: clamp(0.95rem, 8cqmin, 1.8rem);
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1.05;
		text-shadow: 0 2px 18px rgba(0, 0, 0, 0.85);
		/* Two-line clamp so long titles don't climb the whole cover. */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.artist {
		margin: 0;
		font-size: clamp(0.72rem, 5cqmin, 1.15rem);
		font-weight: 500;
		color: color-mix(in oklch, #f0ead8 82%, transparent);
		text-shadow: 0 1px 12px rgba(0, 0, 0, 0.85);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.caught {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		min-width: 0;
		margin: 0.3cqmin 0 0;
		font-size: clamp(0.6rem, 3.4cqmin, 0.8rem);
		color: color-mix(in oklch, #f0ead8 65%, transparent);
		text-shadow: 0 1px 10px rgba(0, 0, 0, 0.85);
		transition: color 0.3s;
	}
	.caught-mark {
		flex-shrink: 0;
		font-size: 0.7em;
		color: color-mix(in oklch, #f0ead8 55%, transparent);
	}
	.caught-mark.spun {
		color: color-mix(in oklch, var(--hl-accent) 80%, transparent);
	}
	.caught-text {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.caught.listening-hint {
		font-style: italic;
		opacity: 0.75;
	}
	.caught.flash {
		color: var(--hl-accent);
		animation: caught-flash 2.2s ease-out;
	}
	@keyframes caught-flash {
		0% {
			color: #f0ead8;
			text-shadow: 0 0 14px color-mix(in oklch, var(--hl-accent) 70%, transparent);
		}
		100% {
			color: color-mix(in oklch, #f0ead8 65%, transparent);
			text-shadow: 0 1px 10px rgba(0, 0, 0, 0.85);
		}
	}
</style>
