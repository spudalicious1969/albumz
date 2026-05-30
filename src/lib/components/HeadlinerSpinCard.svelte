<script lang="ts">
	// Owner-only ritual surface on the Headliner. The card's expand/collapse is
	// decoupled from the mic — opening the set list and turning on the mic are
	// two separate gestures. When expanded with mic off, streamed tracks from
	// the parent's now-playing poll mirror into the set so the list fills even
	// during a pure-streaming session.

	import { spin, type SpinEvent } from '$lib/spin-state.svelte';
	import type { NowPlayingResult } from '$lib/now-playing';

	let { nowPlaying }: { nowPlaying: NowPlayingResult } = $props();

	// Initial state: if a session is already running when we mount, expand.
	// Otherwise collapse and let the user open it intentionally.
	let collapsed = $state(!spin.active);

	function formatStart(d: Date | null): string {
		if (!d) return '';
		return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	// Passive streamed mirror: while the card is open and the mic is off,
	// reflect Last.fm now-playing into the set so it fills even without the mic.
	// recordSpin() dedupes consecutive identical tracks, so polling the same
	// track every 15s only adds one entry.
	$effect(() => {
		if (collapsed || spin.active) return;
		if (nowPlaying.state !== 'playing' || nowPlaying.source !== 'streamed') return;
		if (!nowPlaying.artist || !nowPlaying.track) return;

		const playedAtIso = nowPlaying.playedAt
			? new Date(nowPlaying.playedAt * 1000).toISOString()
			: new Date().toISOString();

		const event: SpinEvent = {
			id: `passive-${Date.now()}-${nowPlaying.artist}-${nowPlaying.track}`,
			artist: nowPlaying.artist,
			track: nowPlaying.track,
			album: nowPlaying.album ?? null,
			identifiedAt: playedAtIso,
			confidence: null,
			source: 'streamed'
		};
		spin.recordSpin(event);
	});

	function endSet() {
		spin.clearSet();
		collapsed = true;
	}

	const hasContent = $derived(spin.spins.length > 0 || spin.active);
	const micLabel = $derived(
		spin.active
			? spin.runnerStatus === 'identifying'
				? 'Identifying…'
				: 'Listening for spins'
			: 'Catch what’s spinning'
	);

	// Tick once a minute so the label crosses time-of-day boundaries during long
	// sessions without us needing to anchor everything to startedAt.
	let now = $state(new Date());
	$effect(() => {
		const t = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(t);
	});

	const setLabel = $derived.by(() => {
		const hour = (spin.startedAt ?? now).getHours();
		if (hour >= 5 && hour < 12) return "This morning's set";
		if (hour >= 12 && hour < 17) return "This afternoon's set";
		if (hour >= 17 && hour < 21) return "This evening's set";
		return "Tonight's set";
	});
</script>

{#if collapsed}
	<button
		class="pill"
		class:armed={spin.active}
		type="button"
		onclick={() => (collapsed = false)}
		title="Open {setLabel}"
		aria-label="Open {setLabel}"
		aria-expanded="false"
	>
		{#if spin.active}<span class="pulse"></span>{/if}
		<span class="pill-label">
			{setLabel}
			{#if spin.spins.length > 0}
				· {spin.spins.length}
			{/if}
		</span>
		<span class="chev" aria-hidden="true">▴</span>
	</button>
{:else}
	<aside class="card" aria-live="polite">
		<header class="head">
			<p class="eyebrow">
				<span class="pulse" class:active={spin.active}></span>
				{setLabel}
			</p>
			<button
				class="iconbtn"
				type="button"
				onclick={() => (collapsed = true)}
				title="Collapse"
				aria-label="Collapse {setLabel}"
				aria-expanded="true"
			>▾</button>
		</header>

		{#if spin.startedAt}
			<p class="started">started {formatStart(spin.startedAt)}</p>
		{/if}

		<button
			class="mic"
			class:on={spin.active}
			class:identifying={spin.runnerStatus === 'identifying'}
			type="button"
			onclick={() => spin.toggle()}
			aria-pressed={spin.active}
		>
			<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
				<path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" fill="currentColor" />
				<path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21h-2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11z" fill="currentColor" />
			</svg>
			<span>{micLabel}</span>
		</button>

		{#if spin.spins.length === 0}
			<p class="empty">
				{#if spin.active}
					Listening…
				{:else if nowPlaying.state === 'playing'}
					Streamed tracks will land here as they play.
				{:else}
					Quiet so far. Streamed tracks will show up as they play.
				{/if}
			</p>
		{:else}
			{@const latest = spin.spins[0]}
			<div class="latest">
				<p class="latest-eyebrow">
					{latest.source === 'streamed' ? 'Now streaming' : 'Now spinning'}
				</p>
				<p class="latest-track">{latest.track}</p>
				<p class="latest-artist">{latest.artist}</p>
				{#if latest.album}<p class="latest-album">{latest.album}</p>{/if}
			</div>

			{#if spin.spins.length > 1}
				<ol class="prior">
					{#each spin.spins.slice(1, 6) as event (event.id)}
						<li>
							<span class="prior-track">{event.track}</span>
							<span class="prior-artist">{event.artist}</span>
							<span class="prior-source" class:streamed={event.source === 'streamed'}>
								{event.source === 'streamed' ? '⇢' : '◉'}
							</span>
						</li>
					{/each}
				</ol>
				{#if spin.spins.length > 6}
					<p class="more">+ {spin.spins.length - 6} earlier</p>
				{/if}
			{/if}
		{/if}

		{#if hasContent}
			<button class="endlink" type="button" onclick={endSet}>End set</button>
		{/if}
	</aside>
{/if}

<style>
	.pill,
	.card {
		position: fixed;
		right: 1.5rem;
		bottom: 1.5rem;
		z-index: 5;
		font-family: inherit;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.9rem 0.5rem 0.75rem;
		background: color-mix(in oklch, #08070a 70%, transparent);
		border: 1px solid color-mix(in oklch, var(--hl-accent) 35%, rgba(255, 255, 255, 0.08));
		border-radius: 999px;
		color: color-mix(in oklch, var(--hl-accent) 85%, #f0ead8);
		font-size: 0.74rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		cursor: pointer;
		backdrop-filter: blur(10px);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
		transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.2s;
		animation: pill-in 0.28s ease-out both;
	}
	.pill:hover {
		background: color-mix(in oklch, var(--hl-accent) 14%, #08070a 70%);
		border-color: color-mix(in oklch, var(--hl-accent) 55%, transparent);
		color: var(--hl-accent);
	}
	.pill.armed {
		border-color: color-mix(in oklch, var(--hl-accent) 55%, transparent);
		color: var(--hl-accent);
	}
	.pill .pill-label {
		font-variant-numeric: tabular-nums;
	}
	.pill .chev {
		font-size: 0.7rem;
		opacity: 0.7;
	}
	@keyframes pill-in {
		from { opacity: 0; transform: translateY(6px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.card {
		width: clamp(240px, 24vw, 300px);
		padding: 0.95rem 1.05rem 1rem;
		background: color-mix(in oklch, #08070a 75%, transparent);
		border: 1px solid color-mix(in oklch, var(--hl-accent) 30%, rgba(255,255,255,0.08));
		border-radius: 14px;
		color: #f0ead8;
		backdrop-filter: blur(14px);
		box-shadow: 0 20px 40px rgba(0,0,0,0.5);
		animation: card-in 0.32s ease-out both;
	}
	@keyframes card-in {
		from { opacity: 0; transform: translateY(8px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--hl-accent);
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
	}
	.pulse {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: color-mix(in oklch, var(--hl-accent) 55%, transparent);
	}
	.pulse.active {
		background: var(--hl-accent);
		box-shadow: 0 0 12px var(--hl-accent);
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1;   transform: scale(1); }
		50%      { opacity: 0.5; transform: scale(1.35); }
	}

	.iconbtn {
		background: transparent;
		border: none;
		color: color-mix(in oklch, #f0ead8 55%, transparent);
		font-size: 1.05rem;
		line-height: 1;
		padding: 0.1rem 0.35rem;
		cursor: pointer;
		border-radius: 6px;
		transition: color 0.15s, background 0.15s;
	}
	.iconbtn:hover {
		color: #f0ead8;
		background: color-mix(in oklch, #f0ead8 8%, transparent);
	}

	.started {
		font-size: 0.72rem;
		color: color-mix(in oklch, #f0ead8 50%, transparent);
		margin: 0.25rem 0 0.65rem;
		letter-spacing: 0.04em;
	}

	.mic {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.7rem;
		background: transparent;
		border: 1px solid color-mix(in oklch, #f0ead8 18%, transparent);
		border-radius: 999px;
		color: color-mix(in oklch, #f0ead8 70%, transparent);
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		cursor: pointer;
		margin: 0 0 0.85rem;
		transition: color 0.2s, border-color 0.2s, background 0.2s;
	}
	.mic:hover {
		color: #f0ead8;
		border-color: color-mix(in oklch, #f0ead8 40%, transparent);
		background: color-mix(in oklch, #f0ead8 5%, transparent);
	}
	.mic.on {
		color: #ff6b6b;
		border-color: rgba(255, 107, 107, 0.5);
		background: rgba(255, 107, 107, 0.08);
	}
	.mic.on::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #ff6b6b;
		margin-right: -0.15rem;
		animation: mic-pulse 1.6s ease-out infinite;
	}
	.mic.on.identifying::before {
		animation-duration: 0.7s;
	}
	@keyframes mic-pulse {
		0%   { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.6); }
		70%  { box-shadow: 0 0 0 8px rgba(255, 107, 107, 0); }
		100% { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0); }
	}

	.empty {
		font-size: 0.82rem;
		color: color-mix(in oklch, #f0ead8 55%, transparent);
		font-style: italic;
		margin: 0;
		line-height: 1.4;
	}

	.latest {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid color-mix(in oklch, #f0ead8 12%, transparent);
		margin-bottom: 0.7rem;
	}
	.latest-eyebrow {
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: color-mix(in oklch, var(--hl-accent) 80%, #f0ead8);
		margin: 0 0 0.3rem;
		opacity: 0.85;
	}
	.latest-track {
		font-size: 0.98rem;
		font-weight: 700;
		line-height: 1.2;
		margin: 0 0 0.1rem;
	}
	.latest-artist {
		font-size: 0.82rem;
		color: color-mix(in oklch, #f0ead8 75%, transparent);
		margin: 0;
	}
	.latest-album {
		font-size: 0.74rem;
		color: color-mix(in oklch, #f0ead8 50%, transparent);
		font-style: italic;
		margin: 0.1rem 0 0;
	}

	.prior {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.prior li {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
		column-gap: 0.5rem;
		row-gap: 0.05rem;
		font-size: 0.78rem;
		opacity: 0.78;
		align-items: baseline;
	}
	.prior-track { color: #f0ead8; grid-column: 1; grid-row: 1; }
	.prior-artist { color: color-mix(in oklch, #f0ead8 55%, transparent); font-size: 0.72rem; grid-column: 1; grid-row: 2; }
	.prior-source {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		font-size: 0.7rem;
		color: color-mix(in oklch, var(--hl-accent) 65%, transparent);
		opacity: 0.7;
	}
	.prior-source.streamed { color: color-mix(in oklch, #f0ead8 55%, transparent); }

	.more {
		font-size: 0.7rem;
		color: color-mix(in oklch, #f0ead8 45%, transparent);
		margin: 0.65rem 0 0;
		font-style: italic;
	}

	.endlink {
		display: block;
		margin: 0.85rem 0 0 auto;
		background: transparent;
		border: none;
		color: color-mix(in oklch, #f0ead8 45%, transparent);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		padding: 0.2rem 0.3rem;
		border-radius: 6px;
		transition: color 0.15s, background 0.15s;
	}
	.endlink:hover {
		color: #f0ead8;
		background: color-mix(in oklch, #f0ead8 8%, transparent);
	}
</style>
