<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const baselineErrorCopy: Record<string, string> = {
		'no-lastfm':
			"You haven't connected Last.fm yet — Discovery uses your scrobbles to know where you've been. Connect it in Settings, then come back.",
		'no-recent-plays':
			"No plays in the last week to steer from. Listen to something, then come back.",
		'profile-missing':
			"Couldn't load your profile — try refreshing."
	};
</script>

<svelte:head><title>Discover — albumz</title></svelte:head>

<div class="discover-stage">
	{#if !data.nudge}
		<div class="prompt">
			<p class="eyebrow">Discover</p>
			<h1>Where do you want to go?</h1>
			<p class="lede">
				You&rsquo;ve been listening to something. Say where you&rsquo;d like
				it to <em>lean</em>.
			</p>

			<form method="get" action="/discover">
				<textarea
					name="nudge"
					placeholder="more melancholy. or something with more energy. weirder, more electronic. like last week but heavier&hellip;"
					rows="3"
					required
				></textarea>
				<button type="submit" class="btn-primary">Steer</button>
			</form>
		</div>
	{:else if data.result.baselineError}
		<div class="result-stub">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">{baselineErrorCopy[data.result.baselineError]}</p>
			<a class="btn-secondary" href="/discover">Back</a>
		</div>
	{:else if data.result.interpretError}
		<div class="result-stub">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">
				Qwen tripped on that one: <code>{data.result.interpretError}</code>
			</p>
			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>
	{:else if data.result.poolError}
		<div class="result-stub">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">
				Discogs tripped: <code>{data.result.poolError}</code>
			</p>
			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>
	{:else if data.result.curateError}
		<div class="result-stub">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>
			<p class="lede">
				Qwen tripped on curation: <code>{data.result.curateError}</code>
			</p>
			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>
	{:else if data.result.params && data.result.baseline}
		<div class="result-stub">
			<p class="eyebrow">Steering toward</p>
			<h1 class="nudge-echo">&ldquo;{data.nudge}&rdquo;</h1>

			<div class="debug-panel">
				<p class="debug-label">Your baseline (last {data.result.baseline.lookbackDays} days, {data.result.baseline.playCount} plays):</p>
				<p class="debug-tags">
					{data.result.baseline.topTags.join(' · ') || '—'}
				</p>

				<p class="debug-label">Qwen's translation:</p>
				<dl class="debug-params">
					<dt>Styles</dt>
					<dd>{data.result.params.styles.join(' · ')}</dd>
					{#if data.result.params.genres?.length}
						<dt>Genres</dt>
						<dd>{data.result.params.genres.join(' · ')}</dd>
					{/if}
					{#if data.result.params.year_min || data.result.params.year_max}
						<dt>Era</dt>
						<dd>{data.result.params.year_min ?? '?'}–{data.result.params.year_max ?? '?'}</dd>
					{/if}
					{#if data.result.params.label}
						<dt>Label</dt>
						<dd>{data.result.params.label}</dd>
					{/if}
					{#if data.result.params.country}
						<dt>Country</dt>
						<dd>{data.result.params.country}</dd>
					{/if}
				</dl>

				{#if data.result.picks}
					<p class="debug-label">Qwen's picks</p>
					<ul class="pick-list">
						{#each data.result.picks as p (p.master_id || p.artist + p.title)}
							<li class="pick">
								{#if p.cover_image}
									<img class="pick-cover" src={p.cover_image} alt="" loading="lazy" />
								{:else}
									<div class="pick-cover pick-cover-blank"></div>
								{/if}
								<div class="pick-meta">
									<div class="pick-title">{p.artist} &mdash; {p.title}</div>
									<div class="pick-eyebrow">
										{p.year ?? '?'}{#if p.label} · {p.label}{/if}{#if p.country} · {p.country}{/if} · <em>{p.style}</em>
									</div>
									<p class="pick-why">{p.why}</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}

				{#if data.result.candidates}
					<details class="pool-debug">
						<summary>Pool used: {data.result.candidates.length} candidates ({data.result.filteredOutFromCrate} from your shelf hidden)</summary>
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
											{c.year ?? '?'}{#if c.label} · {c.label}{/if}{#if c.country} · {c.country}{/if} · <em>{c.style}</em>
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

				<p class="debug-note">
					&mdash; debug preview &mdash; next step: atmospheric album result UI
				</p>
			</div>

			<a class="btn-secondary" href="/discover">Try a different direction</a>
		</div>
	{/if}
</div>

<style>
	.discover-stage {
		min-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 2.5rem 1.5rem 3rem;
		max-width: 720px;
		margin: 0 auto;
	}

	.prompt,
	.result-stub {
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

	h1 {
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
	}

	.btn-primary:hover {
		opacity: 0.92;
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
		margin-top: 1.5rem;
	}

	.btn-secondary:hover {
		text-decoration: none;
		background: var(--surface-hover, color-mix(in oklch, var(--surface) 80%, var(--text)));
	}

	.debug-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
		text-align: left;
		max-width: 560px;
		margin: 1.5rem auto 0;
	}

	.debug-label {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.4rem;
		margin-top: 1rem;
	}
	.debug-label:first-child {
		margin-top: 0;
	}

	.debug-tags {
		color: var(--text);
		margin-bottom: 0;
		line-height: 1.5;
	}

	.debug-params {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.3rem 1rem;
		margin: 0;
	}
	.debug-params dt {
		font-weight: 700;
		color: var(--text-muted);
	}
	.debug-params dd {
		margin: 0;
		color: var(--text);
	}

	.debug-note {
		margin-top: 1.5rem;
		margin-bottom: 0;
		font-size: 0.82rem;
		color: var(--text-muted);
		font-style: italic;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.88em;
		background: var(--surface);
		padding: 0.1em 0.3em;
		border-radius: 4px;
	}

	.candidate-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.candidate {
		display: flex;
		gap: 0.8rem;
		align-items: center;
	}

	.candidate-cover {
		width: 48px;
		height: 48px;
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
		font-size: 0.92rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.candidate-eyebrow {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-top: 0.1rem;
	}

	.pick-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.pick {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.pick-cover {
		width: 84px;
		height: 84px;
		object-fit: cover;
		border-radius: 6px;
		background: var(--surface);
		flex: none;
	}

	.pick-cover-blank {
		opacity: 0.4;
	}

	.pick-meta {
		min-width: 0;
		flex: 1;
	}

	.pick-title {
		font-weight: 700;
		color: var(--text);
		font-size: 1rem;
		line-height: 1.3;
	}

	.pick-eyebrow {
		font-size: 0.76rem;
		color: var(--text-muted);
		margin-top: 0.2rem;
	}

	.pick-why {
		margin: 0.6rem 0 0;
		color: var(--text);
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.pool-debug {
		margin-top: 1rem;
		border-top: 1px solid var(--border);
		padding-top: 1rem;
	}
	.pool-debug summary {
		font-size: 0.78rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	.pool-debug summary:hover {
		color: var(--text);
	}
	.pool-debug[open] summary {
		margin-bottom: 0.8rem;
	}
</style>
