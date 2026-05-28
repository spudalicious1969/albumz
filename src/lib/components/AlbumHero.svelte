<script lang="ts">
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
			<p class="sub">
				{#if album.year}<span class="pill year">{album.year}</span>{/if}
				{#if album.format}<span class="pill format">{album.format}</span>{/if}
				{#if album.label}<span class="pill label">{album.label}</span>{/if}
			</p>
			{#if album.rating}
				<p class="rating">{'★'.repeat(album.rating)}<span class="rating-empty">{'★'.repeat(5 - album.rating)}</span></p>
			{/if}
			{#if album.tags?.length}
				<ul class="tags">
					{#each album.tags as tag}<li>#{tag}</li>{/each}
				</ul>
			{/if}
			{#if album.notes}
				<p class="notes">{album.notes}</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.hero-shell { position: relative; }

	.hero-bg {
		position: fixed;
		inset: 0;
		background-size: cover;
		background-position: center;
		filter: blur(80px) saturate(1.3);
		transform: scale(1.15);
		opacity: 0.4;
		z-index: -3;
		pointer-events: none;
	}
	.hero-accent {
		position: fixed;
		inset: 0;
		background: radial-gradient(60% 40% at 50% 25%, color-mix(in oklch, var(--page-accent) 16%, transparent), transparent);
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
		.hero { grid-template-columns: 1fr; gap: 1.5rem; }
		.cover-wrap { max-width: 240px; }
	}

	.cover {
		width: 100%;
		aspect-ratio: 1;
		border-radius: var(--radius-lg);
		object-fit: cover;
		box-shadow: var(--shadow-lift), 0 0 70px color-mix(in oklch, var(--page-accent) 35%, transparent);
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
	.sub { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.pill {
		display: inline-block;
		padding: 0.18rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 0.72rem;
		color: var(--text-muted);
		background: var(--surface);
	}
	.pill.year { border-color: color-mix(in oklch, var(--page-accent) 40%, var(--border)); color: var(--page-accent); }

	.rating { color: var(--page-accent); margin-top: 0.85rem; letter-spacing: 0.12em; font-size: 1rem; }
	.rating-empty { color: var(--border); }

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		list-style: none;
		margin-top: 0.9rem;
	}
	.tags li {
		padding: 0.18rem 0.6rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 0.7rem;
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
</style>
