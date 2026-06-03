<script lang="ts">
	import { navigating } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// True while SvelteKit is navigating into /discover with a fresh nudge —
	// gives the Steer button something to say while qwen does ~15-25s of work.
	const isSteering = $derived(
		navigating?.to?.url.pathname === '/discover' &&
			!!navigating?.to?.url.searchParams.get('nudge')
	);

	const baselineErrorCopy: Record<string, string> = {
		'no-lastfm':
			"You haven't connected Last.fm yet — Discovery uses your scrobbles to know where you've been. Connect it in Settings, then come back.",
		'no-recent-plays':
			"No plays in the last week to steer from. Listen to something, then come back.",
		'profile-missing': "Couldn't load your profile — try refreshing."
	};

	const picks = $derived(data.result.picks);
	// Backdrop atmospheric layer is anchored on the first pick's cover —
	// gives the whole moment a color and tone without committing to a per-pick
	// accent system.
	const heroCoverUrl = $derived(picks?.[0]?.cover_image ?? null);
</script>

<svelte:head><title>Discover — albumz</title></svelte:head>

{#if picks && heroCoverUrl}
	<div class="hero-bg" style="background-image: url({heroCoverUrl})"></div>
	<div class="hero-accent"></div>
	<div class="hero-veil"></div>
{/if}

<div class="discover-stage" class:has-results={!!picks}>
	{#if !data.nudge}
		<div class="prompt">
			<p class="eyebrow">Discover</p>
			<h1>Where do you want to go?</h1>
			<p class="lede">
				Your last week of listening is the starting point. Type a
				direction &mdash; warmer, weirder, more electronic, in the spirit
				of some band &mdash; and Discovery returns 3-5 albums
				<em>leaning</em> that way.
			</p>

			<form method="get" action="/discover">
				<textarea
					name="nudge"
					placeholder="more melancholy. or something with more energy. weirder, more electronic. like last week but heavier&hellip;"
					rows="3"
					required
					disabled={isSteering}
				></textarea>
				<button type="submit" class="btn-primary" disabled={isSteering}>
					{isSteering ? 'Steering…' : 'Steer'}
				</button>
			</form>
		</div>
	{:else if data.result.baselineError}
		<div class="error-shell">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">{baselineErrorCopy[data.result.baselineError]}</p>
			<a class="btn-secondary" href="/discover">Back</a>
		</div>
	{:else if data.result.interpretError}
		<div class="error-shell">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">
				Qwen tripped on that one: <code>{data.result.interpretError}</code>
			</p>
			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>
	{:else if data.result.poolError}
		<div class="error-shell">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">
				Discogs tripped: <code>{data.result.poolError}</code>
			</p>
			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>
	{:else if data.result.curateError}
		<div class="error-shell">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">
				Qwen tripped on curation: <code>{data.result.curateError}</code>
			</p>
			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>
	{:else if picks}
		<header class="result-header">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
		</header>

		<ul class="picks">
			{#each picks as p (p.master_id || p.artist + p.title)}
				<li class="pick-card">
					<a
						class="pick-cover-link"
						href={p.master_id
							? `https://www.discogs.com/master/${p.master_id}`
							: `https://www.discogs.com/search?q=${encodeURIComponent(p.artist + ' ' + p.title)}&type=release`}
						target="_blank"
						rel="noreferrer noopener"
					>
						{#if p.cover_image}
							<img class="pick-cover" src={p.cover_image} alt="{p.artist} — {p.title}" loading="lazy" />
						{:else}
							<div class="pick-cover pick-cover-blank">
								<span>{p.artist.slice(0, 1)}</span>
							</div>
						{/if}
					</a>
					<div class="pick-meta">
						<h2 class="pick-title">{p.title}</h2>
						<p class="pick-artist">{p.artist}</p>
						<p class="pick-pills">
							{#if p.year}<span class="pill">{p.year}</span>{/if}
							{#if p.label}<span class="pill">{p.label}</span>{/if}
							{#if p.country}<span class="pill">{p.country}</span>{/if}
							<span class="pill pill-style">{p.style}</span>
						</p>
						<p class="pick-why">{p.why}</p>
						<p class="pick-actions">
							<a
								class="listen-link"
								href={p.spotifyUrl ??
									`https://open.spotify.com/search/${encodeURIComponent(p.artist + ' ' + p.title)}`}
								target="_blank"
								rel="noreferrer noopener"
							>
								Listen on Spotify
								<span class="listen-arrow" aria-hidden="true">↗</span>
							</a>
						</p>
					</div>
				</li>
			{/each}
		</ul>

		<div class="actions">
			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>

		{#if data.result.candidates}
			<details class="pool-debug">
				<summary
					>Pool used: {data.result.candidates.length} candidates ({data.result
						.filteredOutFromCrate} from your shelf hidden)</summary
				>
				{#if data.result.perStyleCounts}
					<p class="debug-tags">
						per style:
						{#each Object.entries(data.result.perStyleCounts) as [style, count], i (style)}
							{#if i > 0} · {/if}{style} ({count}){/each}
					</p>
				{/if}
				<ul class="candidate-list">
					{#each data.result.candidates.slice(0, 20) as c (c.master_id || c.artist + c.title)}
						<li class="candidate">
							{#if c.cover_image}
								<img class="candidate-cover" src={c.cover_image} alt="" loading="lazy" />
							{:else}
								<div class="candidate-cover candidate-cover-blank"></div>
							{/if}
							<div class="candidate-meta">
								<div class="candidate-title">{c.artist} &mdash; {c.title}</div>
								<div class="candidate-eyebrow">
									{c.year ?? '?'}{#if c.label} · {c.label}{/if}{#if c.country} · {c.country}{/if}
									· <em>{c.style}</em>
								</div>
							</div>
						</li>
					{/each}
				</ul>
				{#if data.result.candidates.length > 20}
					<p class="debug-note">
						&hellip; and {data.result.candidates.length - 20} more
					</p>
				{/if}
			</details>
		{/if}
	{/if}
</div>

<style>
	/* Boosted vs AlbumHero's defaults — Discover picks come from Discogs
	   without a precomputed accent_color, so we lean harder on the cover
	   itself (brightness + saturation) and a more visible app-accent halo
	   to give the page a felt atmosphere even when the anchor cover is
	   dark (a common case in indie/electronic). */
	.hero-bg {
		position: fixed;
		inset: 0;
		background-size: cover;
		background-position: center;
		filter: blur(80px) saturate(1.9) brightness(1.45);
		transform: scale(1.15);
		opacity: 0.75;
		z-index: -3;
		pointer-events: none;
	}
	.hero-accent {
		position: fixed;
		inset: 0;
		background: radial-gradient(
			60% 40% at 50% 25%,
			color-mix(in oklch, var(--accent) 40%, transparent),
			transparent
		);
		z-index: -2;
		pointer-events: none;
	}
	.hero-veil {
		position: fixed;
		inset: 0;
		background:
			radial-gradient(120% 60% at 50% 0%, transparent, var(--bg) 80%),
			linear-gradient(to bottom, color-mix(in oklch, var(--bg) 50%, transparent), var(--bg));
		z-index: -1;
		pointer-events: none;
	}

	.discover-stage {
		min-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
		padding: 2.5rem 1.5rem 4rem;
		max-width: 760px;
		margin: 0 auto;
	}

	.discover-stage:not(.has-results) {
		justify-content: center;
	}

	.prompt,
	.error-shell {
		text-align: center;
	}

	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.8rem;
	}

	.prompt h1,
	.error-shell h1 {
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin-bottom: 0.8rem;
	}

	.nudge-echo {
		font-style: italic;
		font-weight: 600;
		color: var(--accent);
	}

	.lede {
		color: var(--text-muted);
		margin-bottom: 2rem;
		line-height: 1.5;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
	}

	textarea {
		width: 100%;
		max-width: 560px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.2rem;
		font: inherit;
		color: var(--text);
		resize: vertical;
		line-height: 1.5;
	}

	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	textarea:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	textarea::placeholder {
		color: var(--text-muted);
		font-style: italic;
	}

	.btn-primary {
		padding: 0.7rem 1.4rem;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
		border: none;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.92;
	}

	.btn-primary:disabled {
		opacity: 0.7;
		cursor: wait;
		animation: pulse 1.6s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.7;
		}
		50% {
			opacity: 0.5;
		}
	}

	.btn-secondary {
		padding: 0.7rem 1.4rem;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		font-weight: 600;
		font-size: 0.9rem;
		text-decoration: none;
		display: inline-block;
	}

	.btn-secondary:hover {
		text-decoration: none;
		background: var(--surface-hover, color-mix(in oklch, var(--surface) 80%, var(--text)));
	}

	.result-header {
		text-align: center;
		margin-bottom: 2.5rem;
	}

	.result-header h1 {
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.picks {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.pick-card {
		display: grid;
		grid-template-columns: 140px 1fr;
		gap: 1.4rem;
		align-items: start;
	}

	@media (max-width: 560px) {
		.pick-card {
			grid-template-columns: 1fr;
			gap: 0.9rem;
		}
		.pick-cover-link {
			max-width: 200px;
		}
	}

	.pick-cover-link {
		display: block;
		border-radius: var(--radius);
		overflow: hidden;
		transition: transform 0.2s;
		box-shadow: var(--shadow-lift, 0 12px 32px rgba(0, 0, 0, 0.25));
	}
	.pick-cover-link:hover {
		transform: translateY(-2px);
	}

	.pick-cover {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}

	.pick-cover-blank {
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklch, var(--accent) 18%, var(--surface));
		font-size: 3.4rem;
		font-weight: 800;
		color: color-mix(in oklch, var(--accent) 60%, var(--text));
	}

	.pick-meta {
		min-width: 0;
	}

	.pick-title {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1.2;
		margin: 0 0 0.2rem;
	}

	.pick-artist {
		font-size: 0.98rem;
		font-weight: 500;
		color: var(--text-muted);
		margin: 0 0 0.7rem;
	}

	.pick-pills {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: 0 0 0.9rem;
	}

	.pill {
		display: inline-block;
		padding: 0.16rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 0.7rem;
		color: var(--text-muted);
		background: var(--surface);
	}

	.pill-style {
		color: var(--accent);
		border-color: color-mix(in oklch, var(--accent) 40%, var(--border));
	}

	.pick-why {
		margin: 0;
		color: var(--text);
		font-size: 0.96rem;
		line-height: 1.55;
	}

	.pick-actions {
		margin: 0.9rem 0 0;
	}

	.listen-link {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #1ed760;
		text-decoration: none;
		padding: 0.3rem 0.7rem;
		border: 1px solid color-mix(in oklch, #1ed760 30%, var(--border));
		border-radius: 100px;
		transition: background 0.18s, color 0.18s;
	}

	.listen-link:hover {
		text-decoration: none;
		background: color-mix(in oklch, #1ed760 16%, transparent);
	}

	.listen-arrow {
		font-size: 0.78rem;
	}

	.actions {
		display: flex;
		justify-content: center;
		margin-top: 3rem;
	}

	.pool-debug {
		margin-top: 3rem;
		border-top: 1px solid var(--border);
		padding-top: 1.2rem;
	}
	.pool-debug summary {
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		cursor: pointer;
	}
	.pool-debug summary:hover {
		color: var(--text);
	}
	.pool-debug[open] summary {
		margin-bottom: 0.8rem;
	}

	.candidate-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.candidate {
		display: flex;
		gap: 0.7rem;
		align-items: center;
	}

	.candidate-cover {
		width: 40px;
		height: 40px;
		object-fit: cover;
		border-radius: 4px;
		background: var(--surface);
		flex: none;
	}

	.candidate-cover-blank {
		opacity: 0.4;
	}

	.candidate-meta {
		min-width: 0;
		flex: 1;
	}

	.candidate-title {
		font-weight: 600;
		color: var(--text);
		font-size: 0.86rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.candidate-eyebrow {
		font-size: 0.74rem;
		color: var(--text-muted);
		margin-top: 0.1rem;
	}

	.debug-tags {
		color: var(--text-muted);
		font-size: 0.78rem;
		margin: 0.4rem 0;
	}

	.debug-note {
		font-size: 0.78rem;
		color: var(--text-muted);
		font-style: italic;
		margin: 0.6rem 0 0;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.88em;
		background: var(--surface);
		padding: 0.1em 0.3em;
		border-radius: 4px;
	}
</style>
