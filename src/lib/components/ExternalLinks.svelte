<script lang="ts">
	import type { ExternalLink } from '$lib/external-links';

	let { links }: { links: ExternalLink[] } = $props();

	// Brand color hints for the leading dot — keeps the row visually scannable.
	const brandColor: Record<ExternalLink['service'], string> = {
		spotify: '#1DB954',
		tidal: '#00FFFF',
		'apple-music': '#FA243C',
		'youtube-music': '#FF0000',
		lastfm: '#D51007',
		discogs: '#FF6900',
		musicbrainz: '#BA478F',
		musicmap: '#888',
		aoty: '#F5A623'
	};
</script>

<section class="links">
	<h2 class="section-title">Listen &amp; Explore</h2>
	<div class="grid">
		{#each links as link}
			<a
				href={link.url}
				target="_blank"
				rel="noopener noreferrer"
				class="chip"
				class:direct={link.isDirect}
				title={link.isDirect ? `Open ${link.name}` : `Search on ${link.name}`}
			>
				<span class="dot" style="background: {brandColor[link.service]}"></span>
				<span class="name">{link.name}</span>
			</a>
		{/each}
	</div>
</section>

<style>
	.links {
		max-width: 980px;
		margin: 0 auto 3rem;
		padding: 0 1.5rem;
	}
	.section-title {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.85rem;
	}
	.grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.4rem;
	}
	/* Quiet at rest — no border, no fill, no arrow, no inline "search" label.
	   The brand dot does the at-a-glance recognition; the name confirms it.
	   On hover the chip brushes with the page accent so it feels like the
	   room lighting up the affordance you're focused on. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.35rem 0.7rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 100px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.82rem;
		font-weight: 500;
		transition: color 0.18s, background 0.18s, border-color 0.18s;
	}
	.chip:hover {
		color: var(--text);
		background: color-mix(in oklch, var(--accent) 7%, transparent);
		border-color: color-mix(in oklch, var(--accent) 30%, transparent);
		text-decoration: none;
	}
	.chip:hover .dot { opacity: 1; }

	.dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		opacity: 0.78;
		transition: opacity 0.18s;
	}
</style>
