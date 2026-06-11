<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import HeadlinerSpinCard from '$lib/components/HeadlinerSpinCard.svelte';
	import HeadlinerIdleMosaic from '$lib/components/HeadlinerIdleMosaic.svelte';
	import type { PageData } from './$types';
	import type { NowPlayingResult } from '$lib/now-playing';

	let { data }: { data: PageData } = $props();

	// A "recent" scrobble older than this is treated as idle — the room has gone
	// quiet enough that the mosaic should take over from the last-streamed hero.
	const IDLE_STALENESS_MS = 60 * 60 * 1000;

	// Last.fm briefly returns 'recent' between tracks, which would otherwise
	// flick the eyebrow from "Currently Streaming" to "Last Streamed" and stop
	// the live dot pulsing. Hold the live presentation for this long after the
	// most recent 'playing' ping so quick song changes don't visually drop.
	const LIVE_GRACE_MS = 15 * 1000;

	// Number of consecutive idle poll responses required before the mosaic
	// takes over. A single bad SSR fetch or transient Last.fm hiccup used to
	// flash the mosaic in for one cycle; requiring two confirmed idle polls
	// (~30s) rules that out without making the real idle transition feel slow.
	// Trade-off: a cold mount with a real 'none' from SSR (genuine idle user)
	// also has to wait through the streak before the mosaic appears, showing
	// the placeholder card for ~30s. Worth it to immunize against bad SSR.
	const IDLE_CONFIRM_POLLS = 2;

	// How often we poll Last.fm via /api/now-playing. Drives both the staleness
	// check cadence (nowMs only ticks here) and how fast we recover from a
	// transient miss.
	const POLL_INTERVAL_MS = 15 * 1000;

	let current = $state<NowPlayingResult>(data.initial);
	let accent = $state<string>('var(--accent)');
	let nowMs = $state<number>(Date.now());
	let lastPlayingAt = $state<number>(data.initial.state === 'playing' ? Date.now() : 0);
	let idleStreak = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;

	// Cover-fallback chain: try candidates in order, advance on <img> error.
	// Reset when track changes.
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

	// If we navigate /headliner/userA → /headliner/userB, reset to that user's initial
	$effect(() => {
		current = data.initial;
		lastPlayingAt = data.initial.state === 'playing' ? Date.now() : 0;
		idleStreak = 0;
	});

	// When the active cover changes, extract a fresh accent color from it.
	// Following the candidate index means we pull color from whichever URL ends up displayed.
	// The cancellation guard prevents a slow-loading stale Image from clobbering
	// the accent after the cover has already advanced past it.
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
		// Tick the clock every poll so the staleness check re-evaluates even when
		// Last.fm keeps returning the same scrobble.
		nowMs = Date.now();
		try {
			const res = await fetch(`/api/now-playing/${data.profile.username}`);
			if (!res.ok) return;
			const next: NowPlayingResult = await res.json();

			// Last.fm doesn't return 'none' for an active user — once we have data,
			// any 'none' is a failed read (timeout, transient error), not real idle.
			// Real idle is signaled by isStale on a 'recent' result.
			if (next.state === 'none' && current.state !== 'none') return;

			if (next.state === 'playing') lastPlayingAt = Date.now();

			const sameTrack = next.track === current.track && next.artist === current.artist;

			if (sameTrack) {
				// Same song still playing — keep the existing cover candidates so the
				// {#key activeCoverUrl} blocks don't re-mount and restart fade-ins just
				// because iTunes/Deezer reordered their results. Refresh the ephemeral
				// fields (state, source, playedAt, plus album if Last.fm filled it in).
				//
				// Invariant: coverCandidates is only replaced when the track changes
				// (the `else` branch below). That guarantees coverIdx stays valid for
				// the array it indexes into. If you ever update candidates mid-track
				// (e.g. retry with better art), also reset coverIdx to 0 here.
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

			// Bump or reset the confirmed-idle streak. The mosaic only takes over
			// once we've seen IDLE_CONFIRM_POLLS in a row, so a single sketchy
			// response (SSR miss, Last.fm hiccup) can never flash it in.
			const polledIsStale =
				current.state === 'recent' &&
				current.playedAt !== null &&
				Date.now() - current.playedAt * 1000 > IDLE_STALENESS_MS;
			if (current.state === 'none' || polledIsStale) idleStreak++;
			else idleStreak = 0;
		} catch {
			// transient errors are fine; we'll try again next tick
		}
	}

	// Browsers throttle setInterval hard when the tab is hidden, so when the
	// user returns the displayed state can be several minutes stale until the
	// next poll lands. Re-poll immediately on visibility return and reset the
	// timer so we don't double-fire.
	function handleVisibilityChange() {
		if (document.visibilityState !== 'visible') return;
		refresh();
		if (timer) clearInterval(timer);
		timer = setInterval(refresh, POLL_INTERVAL_MS);
	}

	// Lock body scroll + dark bg explicitly so cleanup is guaranteed.
	// Doing this via `:global(body) { overflow:hidden }` leaves the rule
	// stuck after SvelteKit client-side nav in some browsers (Chrome on
	// macOS especially), trapping scroll on every subsequent page until refresh.
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

	// Open the mini Headliner as a deliberately small popup rather than a clone of
	// this (often full-screen) window. The mini is square-first — the cover full-
	// bleeds at a square content area — so open it square (width/height set the
	// inner viewport in modern browsers) and let the cover be the hero from the
	// first frame, not the letterboxed fallback. A named target means repeat
	// clicks reuse the same popup; modified/middle clicks fall through to the
	// anchor's default new-tab behaviour.
	function openMini(e: MouseEvent) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		const url = `/headliner/${data.profile.username}/mini`;
		window.open(url, 'albumz-mini', 'popup,width=240,height=240');
	}

	const displayName = $derived(data.profile.display_name || data.profile.username);
	// Treat a 'recent' result as still live for LIVE_GRACE_MS after the most
	// recent 'playing' ping, so between-track gaps don't flick the UI.
	const effectiveState = $derived(
		current.state === 'recent' && lastPlayingAt > 0 && nowMs - lastPlayingAt < LIVE_GRACE_MS
			? 'playing'
			: current.state
	);
	// Eyebrow split so the leading symbol can carry the same single-character-glow
	// language as the wordmark's `z` — a tiny jewel that signals "this is Albumz".
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
				: 'Headliner'
	);
	// `nowMs` only updates inside refresh(), so isStale re-evaluates per poll,
	// not per second. Practical effect: real idle is detected at
	// last_scrobble + IDLE_STALENESS_MS + (0..POLL_INTERVAL_MS), and the mosaic
	// appears IDLE_CONFIRM_POLLS * POLL_INTERVAL_MS later. Predictable lag, not a bug.
	const isStale = $derived(
		current.state === 'recent' &&
			current.playedAt !== null &&
			// playedAt is Last.fm's `date.uts` — Unix *seconds*, not ms.
			nowMs - current.playedAt * 1000 > IDLE_STALENESS_MS
	);
	const isIdle = $derived(current.state === 'none' || isStale);
	const idleWithMosaic = $derived(
		isIdle && idleStreak >= IDLE_CONFIRM_POLLS && data.idleTiles.length > 0
	);
	// The "quiet" state: idle but the mosaic hasn't taken over yet. Shows the
	// ghost of the last cover at low opacity and a single line — "the room is
	// quiet" — instead of a placeholder card. Deliberately restful rather than
	// anticipatory; no "waiting for X to start something" framing.
	const isQuietIdle = $derived(isIdle && !idleWithMosaic);
</script>

<svelte:head>
	<title>Headliner — {displayName}</title>
	<link rel="manifest" href="/headliner/manifest.json" />
	<meta name="theme-color" content="#08070a" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<div class="headliner" style="--hl-accent: {accent}">
	{#if idleWithMosaic}
		<HeadlinerIdleMosaic tiles={data.idleTiles} />
	{:else}
		{#if activeCoverUrl}
			{#key activeCoverUrl}
				<div
					class="bg-layer"
					class:quiet={isQuietIdle}
					style="background-image: url({activeCoverUrl})"
				></div>
			{/key}
		{/if}
		<div class="bg-veil"></div>
	{/if}

	<!-- Quiet back-link to the user's public page. `target="_blank"` keeps
	     the installed PWA pristine — opens in a regular browser window. -->
	<a
		class="back-link"
		href="/u/{data.profile.username}"
		target="_blank"
		rel="noopener"
		title="Open {displayName}'s public page">← @{data.profile.username}</a
	>

	<!-- Compact-mode escape hatch. Opens the mini Headliner in its own window so
	     it can be sized down to a corner of the screen while you listen. -->
	<a
		class="mini-link"
		href="/headliner/{data.profile.username}/mini"
		target="_blank"
		rel="noopener"
		onclick={openMini}
		title="Open mini mode — a compact now-playing widget"
		aria-label="Open mini mode"><span class="mini-glyph" aria-hidden="true">⊟</span> Mini</a
	>

	{#if idleWithMosaic}
		<div class="idle-overlay">
			<span class="wordmark idle-wordmark">album<span>z</span></span>
		</div>
	{:else if isQuietIdle}
		<div class="quiet-overlay">
			<p class="quiet-msg">The room is quiet.</p>
		</div>
	{:else}
		<div class="stage">
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

			<div class="meta">
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
				{#if current.album}
					<p class="album">{current.album}</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if data.isOwner}
		<HeadlinerSpinCard nowPlaying={current} />
	{/if}
</div>

<style>
	.headliner {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #08070a;
		color: #f0ead8;
	}

	/* Blurred cover fills the screen — re-keyed so SvelteKit cross-fades on track change */
	.bg-layer {
		position: absolute;
		inset: -10%;
		background-size: cover;
		background-position: center;
		filter: blur(80px) saturate(1.4);
		transform: scale(1.15);
		opacity: 0.55;
		animation: bg-fade-in 1.2s ease-out forwards;
	}
	/* Quiet idle: ghost the last cover instead of presenting it. */
	.bg-layer.quiet {
		animation-name: bg-fade-in-quiet;
	}
	.bg-veil {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 0%,
			color-mix(in oklch, #08070a 70%, transparent) 70%,
			#08070a 100%
		);
		pointer-events: none;
	}

	.back-link {
		position: fixed;
		top: 1.25rem;
		left: 1.5rem;
		z-index: 5;
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: color-mix(in oklch, var(--hl-accent) 70%, transparent);
		text-decoration: none;
		text-shadow: 0 0 12px color-mix(in oklch, var(--hl-accent) 35%, transparent);
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.back-link:hover {
		color: var(--hl-accent);
		background: color-mix(in oklch, var(--hl-accent) 8%, transparent);
		text-decoration: none;
	}

	.mini-link {
		position: fixed;
		top: 1.25rem;
		right: 1.5rem;
		z-index: 5;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: color-mix(in oklch, var(--hl-accent) 70%, transparent);
		text-decoration: none;
		text-shadow: 0 0 12px color-mix(in oklch, var(--hl-accent) 35%, transparent);
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.mini-link:hover {
		color: var(--hl-accent);
		background: color-mix(in oklch, var(--hl-accent) 8%, transparent);
		text-decoration: none;
	}
	.mini-glyph {
		font-size: 0.9rem;
		line-height: 1;
	}

	@keyframes bg-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.55;
		}
	}
	@keyframes bg-fade-in-quiet {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.25;
		}
	}

	.stage {
		position: relative;
		z-index: 1;
		height: 100dvh;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		align-items: center;
		gap: 5vw;
		padding: 5vh 7vw;
	}
	@media (max-width: 900px) {
		.stage {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(0, 1fr) auto;
			padding: 4vh 6vw;
			gap: 3vh;
			text-align: center;
		}
	}

	.cover {
		display: block;
		width: 100%;
		max-width: min(70vh, 600px);
		aspect-ratio: 1;
		justify-self: end;
		object-fit: cover;
		border-radius: 12px;
		box-shadow:
			0 30px 80px rgba(0, 0, 0, 0.6),
			0 0 120px color-mix(in oklch, var(--hl-accent) 45%, transparent);
		animation: cover-in 1.1s ease-out forwards;
	}
	@media (max-width: 900px) {
		.cover {
			justify-self: center;
			max-width: 70vw;
		}
	}
	.cover.placeholder {
		background: color-mix(in oklch, var(--hl-accent) 18%, #100e14);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: clamp(4rem, 14vw, 12rem);
		font-weight: 800;
		color: color-mix(in oklch, var(--hl-accent) 60%, #f0ead8);
	}

	@keyframes cover-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		max-width: 100%;
	}

	.eyebrow {
		font-size: clamp(0.75rem, 1.1vw, 0.95rem);
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--hl-accent);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		text-shadow: 0 1px 12px rgba(0, 0, 0, 0.7);
	}
	/* Single-character jewel — same glow language as the wordmark's `z`,
	   echoed once in the most active part of the Headliner. Cream character
	   on accent halo (matching the wordmark recipe) so the glow has contrast
	   to bleed from. */
	.eyebrow-symbol {
		color: #f0ead8;
		font-weight: 700;
		text-shadow:
			0 0 24px var(--hl-accent),
			0 0 8px var(--hl-accent);
	}
	.dot {
		width: 0.55em;
		height: 0.55em;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.7;
	}
	.dot.live {
		opacity: 1;
		box-shadow: 0 0 12px currentColor;
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
		font-size: clamp(2.2rem, 5.5vw, 5.5rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		text-shadow:
			0 2px 30px rgba(0, 0, 0, 0.75),
			0 0 14px rgba(0, 0, 0, 0.55);
		animation: text-in 1s ease-out 0.15s both;
	}
	.artist {
		font-size: clamp(1.2rem, 2.4vw, 2.2rem);
		font-weight: 500;
		color: color-mix(in oklch, #f0ead8 80%, transparent);
		text-shadow: 0 1px 18px rgba(0, 0, 0, 0.7);
		animation: text-in 1s ease-out 0.25s both;
	}
	.album {
		font-size: clamp(0.95rem, 1.4vw, 1.2rem);
		color: color-mix(in oklch, #f0ead8 65%, transparent);
		font-style: italic;
		text-shadow: 0 1px 14px rgba(0, 0, 0, 0.7);
		animation: text-in 1s ease-out 0.35s both;
	}

	@keyframes text-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.wordmark {
		font-weight: 800;
		letter-spacing: 0.09em;
	}
	.wordmark span {
		text-shadow:
			0 0 24px var(--hl-accent),
			0 0 8px var(--hl-accent);
	}

	.quiet-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		pointer-events: none;
		padding: 2rem;
		animation: quiet-in 2s ease-out 0.4s both;
	}
	.quiet-msg {
		font-size: clamp(1rem, 1.5vw, 1.4rem);
		font-weight: 400;
		letter-spacing: 0.08em;
		color: color-mix(in oklch, #f0ead8 55%, transparent);
		text-shadow: 0 1px 16px rgba(0, 0, 0, 0.85);
	}
	@keyframes quiet-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.idle-overlay {
		position: absolute;
		inset: 0;
		z-index: 3;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		text-align: center;
		pointer-events: none;
		padding: 2rem;
	}
	/* Soft dark spotlight centered behind the text. The mosaic stays atmospheric
	   at the edges; the middle just dims enough to anchor the wordmark. */
	.idle-overlay::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 55% 35% at center,
			rgba(0, 0, 0, 0.6) 0%,
			rgba(0, 0, 0, 0.35) 45%,
			transparent 100%
		);
		pointer-events: none;
		z-index: 0;
	}
	.idle-wordmark {
		position: relative;
		z-index: 1;
		font-size: clamp(3rem, 8vw, 6rem);
		color: color-mix(in oklch, #f0ead8 92%, transparent);
		text-shadow:
			0 0 40px rgba(0, 0, 0, 0.95),
			0 0 18px rgba(0, 0, 0, 0.9),
			0 2px 6px rgba(0, 0, 0, 0.95);
	}
</style>
