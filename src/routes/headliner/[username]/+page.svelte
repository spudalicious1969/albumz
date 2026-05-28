<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import type { PageData } from './$types';
	import type { NowPlayingResult } from '$lib/now-playing';

	let { data }: { data: PageData } = $props();

	let current = $state<NowPlayingResult>(data.initial);
	let accent = $state<string>('var(--accent)');
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
		try {
			const res = await fetch(`/api/now-playing/${data.profile.username}`);
			if (!res.ok) return;
			const next: NowPlayingResult = await res.json();
			// Only swap if something actually changed — avoids unnecessary re-extracts
			if (next.track !== current.track || next.artist !== current.artist || next.coverUrl !== current.coverUrl) {
				current = next;
			}
		} catch {
			// transient errors are fine; we'll try again next tick
		}
	}

	// Lock body scroll + dark bg explicitly so cleanup is guaranteed.
	// Doing this via `:global(body) { overflow:hidden }` leaves the rule
	// stuck after SvelteKit client-side nav in some browsers (Chrome on
	// macOS especially), trapping scroll on every subsequent page until refresh.
	onMount(() => {
		timer = setInterval(refresh, 15_000);
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
	});

	const displayName = $derived(data.profile.display_name || data.profile.username);
	const eyebrow = $derived(
		current.state === 'playing' ? '♪ Currently Spinning'
		: current.state === 'recent' ? '⏵ Last Played'
		: 'Headliner'
	);
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
	{#if activeCoverUrl}
		{#key activeCoverUrl}
			<div class="bg-layer" style="background-image: url({activeCoverUrl})"></div>
		{/key}
	{/if}
	<div class="bg-veil"></div>

	<!-- Quiet back-link to the user's public page. `target="_blank"` keeps
	     the installed PWA pristine — opens in a regular browser window. -->
	<a
		class="back-link"
		href="/u/{data.profile.username}"
		target="_blank"
		rel="noopener"
		title="Open {displayName}'s public page"
	>← @{data.profile.username}</a>

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
		text-shadow: 0 2px 30px rgba(0,0,0,0.5);
		animation: text-in 1s ease-out 0.15s both;
	}
	.artist {
		font-size: clamp(1.2rem, 2.4vw, 2.2rem);
		font-weight: 500;
		color: color-mix(in oklch, #f0ead8 80%, transparent);
		animation: text-in 1s ease-out 0.25s both;
	}
	.album {
		font-size: clamp(0.95rem, 1.4vw, 1.2rem);
		color: color-mix(in oklch, #f0ead8 55%, transparent);
		font-style: italic;
		animation: text-in 1s ease-out 0.35s both;
	}
	.idle-msg {
		color: color-mix(in oklch, #f0ead8 50%, transparent);
		font-size: clamp(1rem, 1.6vw, 1.4rem);
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
</style>
