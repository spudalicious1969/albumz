<script lang="ts">
	import { notesToHtml } from '$lib/notes';

	type Album = {
		artist: string;
		title: string;
		year: number | null;
		format: string | null;
		label: string | null;
		rating: number | null;
		ownership: 'OWN' | 'WANT';
		cover_url: string | null;
		accent_color: string | null;
		tags: string[] | null;
		notes: string | null;
	};

	let { album, eyebrow }: { album: Album; eyebrow?: string } = $props();

	const accent = $derived(album.accent_color ?? 'var(--accent)');
	const ownershipLabel = $derived(
		eyebrow ?? (album.ownership === 'WANT' ? '☆ On Wantlist' : '★ In Collection')
	);
	const notesHtml = $derived(notesToHtml(album.notes));
</script>

<div class="hero-shell" style="--page-accent: {accent}">
	{#if album.cover_url}
		<div class="hero-bg" style="background-image: url({album.cover_url})"></div>
	{/if}
	<div class="hero-accent"></div>
	<div class="hero-veil"></div>

	<div class="hero">
		<div class="cover-wrap">
			{#if album.cover_url}
				<img class="cover" src={album.cover_url} alt="{album.artist} – {album.title}" />
			{:else}
				<div class="cover no-cover"><span>{album.artist.slice(0, 1)}</span></div>
			{/if}
		</div>

		<div class="meta">
			<p class="eyebrow">{ownershipLabel}</p>
			<h1 class="title">{album.title}</h1>
			<p class="artist">{album.artist}</p>
			{#if album.year || album.format || album.label}
				<p class="meta-line">
					{#if album.year}<span class="meta-year">{album.year}</span>{/if}
					{#if album.year && (album.format || album.label)}<span class="meta-sep">·</span>{/if}
					{#if album.format}<span>{album.format}</span>{/if}
					{#if album.format && album.label}<span class="meta-sep">·</span>{/if}
					{#if album.label}<span>{album.label}</span>{/if}
				</p>
			{/if}
			{#if album.rating}
				<p class="rating">
					{'★'.repeat(album.rating)}<span class="rating-empty">{'★'.repeat(5 - album.rating)}</span>
				</p>
			{/if}
			{#if album.tags?.length}
				<ul class="tags">
					{#each album.tags as tag}<li>#{tag}</li>{/each}
				</ul>
			{/if}
			{#if album.notes}
				<p class="notes">{@html notesHtml}</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.hero-shell {
		position: relative;
	}

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
			color-mix(in oklch, var(--page-accent) 40%, transparent),
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

	.hero {
		max-width: 980px;
		margin: 2rem auto 4rem;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 2.5rem;
		align-items: end;
	}
	@media (max-width: 720px) {
		.hero {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
		.cover-wrap {
			max-width: 240px;
		}
	}

	.cover {
		width: 100%;
		aspect-ratio: 1;
		border-radius: var(--radius-lg);
		object-fit: cover;
		box-shadow:
			var(--shadow-lift),
			0 0 70px color-mix(in oklch, var(--page-accent) 35%, transparent);
	}
	.cover.no-cover {
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklch, var(--page-accent) 20%, var(--bg-elevated));
		font-size: 6rem;
		font-weight: 800;
		color: color-mix(in oklch, var(--page-accent) 60%, var(--text));
	}

	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--page-accent);
		margin-bottom: 0.6rem;
	}
	.title {
		font-size: 2.4rem;
		font-weight: 800;
		letter-spacing: -0.015em;
		line-height: 1.05;
		margin-bottom: 0.35rem;
	}
	.artist {
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 0.85rem;
	}
	/* Inline meta line replaces the year/format/label pills. The year keeps
	   its accent color (small visual tie to the cover); format and label go
	   muted; separators are dimmer still. Plain text, no chrome. */
	.meta-line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: baseline;
		font-size: 0.82rem;
		color: var(--text-muted);
	}
	.meta-year {
		color: var(--page-accent);
		font-weight: 600;
	}
	.meta-sep {
		color: var(--border);
	}

	.rating {
		color: var(--page-accent);
		margin-top: 0.85rem;
		letter-spacing: 0.12em;
		font-size: 1rem;
	}
	.rating-empty {
		color: var(--border);
	}

	/* Tags as plain hashtag text rather than pills — they're not clickable,
	   so the pill chrome was misleading. */
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		list-style: none;
		margin-top: 0.9rem;
		padding: 0;
	}
	.tags li {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.notes {
		margin-top: 1.1rem;
		padding: 0.85rem 1rem;
		background: var(--surface);
		border-left: 3px solid var(--page-accent);
		border-radius: var(--radius);
		font-size: 0.9rem;
		line-height: 1.5;
		white-space: pre-wrap;
		color: var(--text);
	}
	.notes :global(a) {
		color: var(--page-accent);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklch, var(--page-accent) 45%, transparent);
		text-underline-offset: 2px;
		transition: text-decoration-color 0.18s;
	}
	.notes :global(a:hover) {
		text-decoration-color: var(--page-accent);
	}
</style>
