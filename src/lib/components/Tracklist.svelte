<script lang="ts">
	import type { Track, TracklistSource } from '$lib/tracklist';
	import { formatDuration, formatTotalDuration } from '$lib/tracklist';

	let {
		tracks,
		totalDuration,
		source
	}: { tracks: Track[]; totalDuration: number | null; source: TracklistSource | null } = $props();

	const SOURCE_LABEL: Record<TracklistSource, string> = {
		lastfm: 'Last.fm',
		deezer: 'Deezer',
		itunes: 'iTunes'
	};
</script>

<section class="tracklist">
	<header class="head">
		<h2 class="section-title">Tracklist</h2>
		{#if tracks.length > 0}
			<p class="summary">
				{tracks.length} track{tracks.length === 1 ? '' : 's'}
				{#if totalDuration}· {formatTotalDuration(totalDuration)}{/if}
			</p>
		{/if}
	</header>

	{#if tracks.length === 0}
		<p class="empty">No tracklist available.</p>
	{:else}
		<ol class="list">
			{#each tracks as track (track.position)}
				<li class="row">
					<span class="pos">{track.position}</span>
					<span class="name">{track.name}</span>
					<span class="dur">{track.duration ? formatDuration(track.duration) : '—'}</span>
				</li>
			{/each}
		</ol>
		{#if source}
			<p class="credit">via {SOURCE_LABEL[source]}</p>
		{/if}
	{/if}
</section>

<style>
	.tracklist {
		max-width: 980px;
		margin: 0 auto 3rem;
		padding: 0 1.5rem;
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		justify-content: space-between;
		margin-bottom: 0.85rem;
	}
	.section-title {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.summary {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.empty {
		padding: 1.25rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.88rem;
		text-align: center;
	}

	.list {
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface);
	}
	.row {
		display: grid;
		grid-template-columns: 2.5rem 1fr auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.92rem;
		transition: background 0.1s;
	}
	.row:last-child { border-bottom: none; }
	.row:hover { background: var(--surface-hover); }

	.pos {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: right;
	}
	.name { color: var(--text); }
	.dur {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		font-size: 0.83rem;
	}

	.credit {
		text-align: right;
		font-size: 0.7rem;
		color: var(--text-muted);
		margin-top: 0.5rem;
		opacity: 0.7;
	}
</style>
