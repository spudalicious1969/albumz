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
				{#if !link.isDirect}<span class="kind">search</span>{/if}
				<span class="arrow" aria-hidden="true">↗</span>
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
		gap: 0.5rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.85rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 100px;
		color: var(--text);
		text-decoration: none;
		font-size: 0.83rem;
		font-weight: 500;
		transition: background 0.15s, border-color 0.15s, transform 0.15s;
	}
	.chip:hover {
		background: var(--surface-hover);
		border-color: color-mix(in oklch, var(--accent) 40%, var(--border));
		text-decoration: none;
		transform: translateY(-1px);
	}
	.chip.direct {
		background: color-mix(in oklch, var(--surface) 80%, var(--bg-elevated));
		border-color: color-mix(in oklch, var(--accent) 25%, var(--border));
	}

	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
	}
	.kind {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted);
		opacity: 0.7;
	}
	.arrow {
		font-size: 0.7rem;
		color: var(--text-muted);
	}
</style>
