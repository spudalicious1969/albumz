<script lang="ts">
	import type { Track, TracklistSource } from '$lib/tracklist';
	import { formatDuration, formatTotalDuration } from '$lib/tracklist';

	let {
		tracks,
		totalDuration,
		source
	}: { tracks: Track[]; totalDuration: number | null; source: TracklistSource | null } = $props();

	const SOURCE_LABEL: Record<TracklistSource, string> = {
		spotify: 'Spotify',
		lastfm: 'Last.fm',
		deezer: 'Deezer',
		itunes: 'iTunes',
		musicbrainz: 'MusicBrainz'
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
			{#each tracks as track}
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

	/* Soft container — kept a subtle surface fill so the rows group visually,
	   but no outer border. The section title eyebrow already signposts the
	   group; the border was doubling the work and making the tracklist read
	   as the lone boxed UI element on an otherwise atmospheric page. */
	.list {
		list-style: none;
		border-radius: var(--radius);
		overflow: hidden;
		background: color-mix(in oklch, var(--surface) 70%, transparent);
		padding: 0;
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 2.5rem 1fr auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
		font-size: 0.92rem;
		transition: background 0.15s;
	}
	.row:last-child { border-bottom: none; }
	/* Hover breathes in the album's accent, same family as every other hover
	   on the page after the synesthesia work. */
	.row:hover {
		background: color-mix(in oklch, var(--accent) 9%, transparent);
	}

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
