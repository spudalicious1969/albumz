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

	let current = $state<NowPlayingResult>(data.initial);
	let accent = $state<string>('var(--accent)');
	let nowMs = $state<number>(Date.now());
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
	const activeCoverUrl = $derived(
		current.coverCandidates?.[coverIdx] ?? null
	);

	// If we navigate /headliner/userA → /headliner/userB, reset to that user's initial
	$effect(() => { current = data.initial; });

	// When the active cover changes, extract a fresh accent color from it.
	// Following the candidate index means we pull color from whichever URL ends up displayed.
	$effect(() => {
		const url = activeCoverUrl;
		if (!url) { accent = 'var(--accent)'; return; }
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => { accent = extractAccentColorFromImg(img); };
		img.src = url;
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

			const sameTrack =
				next.track === current.track && next.artist === current.artist;

			if (sameTrack) {
				// Same song still playing — keep the existing cover candidates so the
				// {#key activeCoverUrl} blocks don't re-mount and restart fade-ins just
				// because iTunes/Deezer reordered their results. Refresh the ephemeral
				// fields (state, source, playedAt, plus album if Last.fm filled it in).
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
		timer = setInterval(refresh, 15_000);
	}

	// Lock body scroll + dark bg explicitly so cleanup is guaranteed.
	// Doing this via `:global(body) { overflow:hidden }` leaves the rule
	// stuck after SvelteKit client-side nav in some browsers (Chrome on
	// macOS especially), trapping scroll on every subsequent page until refresh.
	onMount(() => {
		timer = setInterval(refresh, 15_000);
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
	const eyebrow = $derived(
		current.state === 'playing'
			? (current.source === 'streamed' ? '♪ Currently Streaming' : '♪ Currently Spinning')
			: current.state === 'recent'
				? (current.source === 'streamed' ? '⏵ Last Streamed' : '⏵ Last Spun')
				: 'Headliner'
	);
	const isStale = $derived(
		current.state === 'recent' &&
		current.playedAt !== null &&
		nowMs - new Date(current.playedAt).getTime() > IDLE_STALENESS_MS
	);
	const isIdle = $derived(current.state === 'none' || isStale);
	const idleWithMosaic = $derived(isIdle && data.idleTiles.length > 0);
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
				<div class="bg-layer" style="background-image: url({activeCoverUrl})"></div>
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
		title="Open {displayName}'s public page"
	>← @{data.profile.username}</a>

	{#if idleWithMosaic}
		<div class="idle-overlay">
			<span class="wordmark idle-wordmark">album<span>z</span></span>
			<p class="idle-msg">Waiting for {displayName} to start something.</p>
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
			{:else if current.state !== 'none'}
				<div class="cover placeholder">
					<span>{(current.artist ?? '?').slice(0, 1)}</span>
				</div>
			{:else}
				<div class="cover placeholder idle">
					<span class="wordmark">album<span>z</span></span>
				</div>
			{/if}

			<div class="meta">
				<p class="eyebrow">
					<span class="dot" class:live={current.state === 'playing'}></span>
					{eyebrow}
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
				{#if current.state === 'none'}
					<p class="idle-msg">Waiting for {displayName} to start something.</p>
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
		transition: color 0.2s, background 0.2s;
	}
	.back-link:hover {
		color: var(--hl-accent);
		background: color-mix(in oklch, var(--hl-accent) 8%, transparent);
		text-decoration: none;
	}

	@keyframes bg-fade-in {
		from { opacity: 0; }
		to   { opacity: 0.55; }
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
			0 30px 80px rgba(0,0,0,0.6),
			0 0 120px color-mix(in oklch, var(--hl-accent) 45%, transparent);
		animation: cover-in 1.1s ease-out forwards;
	}
	@media (max-width: 900px) {
		.cover { justify-self: center; max-width: 70vw; }
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
	.cover.idle { font-size: clamp(2rem, 6vw, 4.5rem); letter-spacing: 0.09em; }

	@keyframes cover-in {
		from { opacity: 0; transform: scale(0.96); }
		to   { opacity: 1; transform: scale(1); }
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
	.dot {
		width: 0.55em; height: 0.55em;
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
		0%, 100% { opacity: 1; transform: scale(1); }
		50%      { opacity: 0.45; transform: scale(1.4); }
	}

	.track {
		font-size: clamp(2.2rem, 5.5vw, 5.5rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		text-shadow: 0 2px 30px rgba(0, 0, 0, 0.75), 0 0 14px rgba(0, 0, 0, 0.55);
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
	.idle-msg {
		color: color-mix(in oklch, #f0ead8 65%, transparent);
		font-size: clamp(1rem, 1.6vw, 1.4rem);
		text-shadow: 0 1px 14px rgba(0, 0, 0, 0.7);
	}

	@keyframes text-in {
		from { opacity: 0; transform: translateY(8px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.wordmark {
		font-weight: 800;
		letter-spacing: 0.09em;
	}
	.wordmark span {
		text-shadow: 0 0 24px var(--hl-accent), 0 0 8px var(--hl-accent);
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
	.idle-overlay .idle-msg {
		position: relative;
		z-index: 1;
		max-width: 30ch;
		color: color-mix(in oklch, #f0ead8 88%, transparent);
		text-shadow:
			0 0 20px rgba(0, 0, 0, 0.9),
			0 1px 3px rgba(0, 0, 0, 0.95);
	}
</style>
