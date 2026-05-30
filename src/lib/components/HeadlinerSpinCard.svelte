<script lang="ts">
	// Owner-only ritual surface on the Headliner. Three states in one component:
	// off = "Spin the disc" trigger; on+expanded = full "Tonight's set" card
	// with the running list; on+collapsed = small pill ("Tonight · N spins").
	// Tied to the same global spin store as the topbar chip, so flipping one
	// updates the other.

	import { spin } from '$lib/spin-state.svelte';

	let collapsed = $state(false);

	function formatStart(d: Date | null): string {
		if (!d) return '';
		return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}
</script>

{#if !spin.active}
	<button class="trigger" type="button" onclick={() => spin.start()}>
		<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
			<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
			<circle cx="12" cy="12" r="2.4" fill="currentColor" />
		</svg>
		<span>Spin the disc</span>
	</button>
{:else if collapsed}
	<button
		class="pill"
		type="button"
		onclick={() => (collapsed = false)}
		title="Expand Tonight's set"
		aria-label="Expand Tonight's set"
		aria-expanded="false"
	>
		<span class="pulse"></span>
		<span class="pill-label">
			Tonight ·
			{#if spin.spins.length > 0}
				{spin.spins.length} spin{spin.spins.length === 1 ? '' : 's'}
			{:else}
				{spin.runnerStatus === 'identifying' ? 'identifying…' : 'listening…'}
			{/if}
		</span>
		<span class="chev" aria-hidden="true">▴</span>
	</button>
{:else}
	<aside class="card" aria-live="polite">
		<header class="head">
			<p class="eyebrow">
				<span class="pulse"></span>
				Tonight's set
			</p>
			<div class="head-actions">
				<button
					class="iconbtn"
					type="button"
					onclick={() => (collapsed = true)}
					title="Collapse"
					aria-label="Collapse Tonight's set"
					aria-expanded="true"
				>▾</button>
				<button
					class="iconbtn stop"
					type="button"
					onclick={() => spin.stop()}
					title="Stop spin session"
					aria-label="Stop spin session"
				>×</button>
			</div>
		</header>
		<p class="started">started {formatStart(spin.startedAt)}</p>

		{#if spin.spins.length === 0}
			<p class="listening">
				{spin.runnerStatus === 'identifying' ? 'Identifying…' : 'Listening…'}
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
	</aside>
{/if}

<style>
	.trigger,
	.pill,
	.card {
		position: fixed;
		right: 1.5rem;
		bottom: 1.5rem;
		z-index: 5;
		font-family: inherit;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.95rem;
		background: color-mix(in oklch, var(--hl-accent) 12%, transparent);
		border: 1px solid color-mix(in oklch, var(--hl-accent) 45%, transparent);
		border-radius: 999px;
		color: color-mix(in oklch, var(--hl-accent) 90%, #f0ead8);
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-shadow: 0 0 12px color-mix(in oklch, var(--hl-accent) 35%, transparent);
		cursor: pointer;
		backdrop-filter: blur(8px);
		transition: background 0.2s, border-color 0.2s, color 0.2s;
	}
	.trigger:hover {
		background: color-mix(in oklch, var(--hl-accent) 22%, transparent);
		border-color: var(--hl-accent);
		color: var(--hl-accent);
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
		background: var(--hl-accent);
		box-shadow: 0 0 12px var(--hl-accent);
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1;   transform: scale(1); }
		50%      { opacity: 0.5; transform: scale(1.35); }
	}

	.head-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
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
	.iconbtn.stop {
		font-size: 1.2rem;
	}

	.started {
		font-size: 0.72rem;
		color: color-mix(in oklch, #f0ead8 50%, transparent);
		margin: 0.25rem 0 0.85rem;
		letter-spacing: 0.04em;
	}

	.listening {
		font-size: 0.85rem;
		color: color-mix(in oklch, #f0ead8 60%, transparent);
		font-style: italic;
		margin: 0;
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
</style>
