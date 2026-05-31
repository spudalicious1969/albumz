<script lang="ts">
	import AlbumHero from '$lib/components/AlbumHero.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Carry forward the exclude list so "Pull another" doesn't loop back.
	// Capped server-side too, but keep the URL tidy here as well.
	const nextExclude = $derived.by(() => {
		if (!data.album) return [];
		return [...data.exclude, data.album.id].slice(-12);
	});
	const pullAnotherHref = $derived(`/dig?exclude=${nextExclude.join(',')}`);
</script>

<svelte:head><title>Dig — albumz</title></svelte:head>

{#if data.album}
	<div class="crate-stage">
		<AlbumHero album={data.album} eyebrow={`From the crate · ${data.lastSpunLabel}`} />
		<div class="actions">
			<a class="btn-primary" href={pullAnotherHref}>Pull another</a>
			<a class="btn-secondary" href="/albums/{data.album.id}">Open album</a>
			<a class="btn-quiet" href="/">Back to collection</a>
		</div>
	</div>
{:else}
	<div class="empty-shell">
		<div class="empty">
			{#if data.emptyReason === 'no-albums'}
				<p class="eyebrow">The crate</p>
				<h1>Nothing to dig up yet</h1>
				<p class="lede">Add a few albums and come back. The crate fills itself once you start.</p>
				<a href="/albums/new" class="btn-primary">Add an album</a>
			{:else if data.emptyReason === 'exhausted'}
				<p class="eyebrow">The crate</p>
				<h1>That's the bottom of the pile</h1>
				<p class="lede">You've pulled everything in this session. Start fresh, or come back later.</p>
				<a href="/dig" class="btn-primary">Start fresh</a>
			{:else if data.emptyReason === 'error'}
				<p class="eyebrow">The crate</p>
				<h1>Something went sideways</h1>
				<p class="lede">{data.errorMsg ?? 'Couldn’t reach the collection just now.'}</p>
				<a href="/dig" class="btn-primary">Try again</a>
			{:else}
				<p class="eyebrow">The crate</p>
				<h1>Everything's been pulled recently</h1>
				<p class="lede">No album in your collection has gone untouched for thirty days. Come back when something's settled.</p>
				<a href="/" class="btn-secondary">Back to collection</a>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Vertically center the moment in the viewport. AlbumHero's fixed atmosphere
	   layers already fill the page; this just floats the album + actions into
	   the middle so the pick doesn't hug the top with dead space below. */
	.crate-stage {
		min-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 2.5rem 0 3rem;
	}
	.crate-stage :global(.hero) {
		margin: 0 auto;
	}
	@media (min-width: 721px) {
		.crate-stage :global(.hero) {
			grid-template-columns: 340px 1fr;
		}
	}

	.actions {
		max-width: 980px;
		width: 100%;
		margin: 2rem auto 0;
		padding: 0 1.5rem;
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.btn-primary,
	.btn-secondary,
	.btn-quiet {
		padding: 0.7rem 1.4rem;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.9rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.btn-primary {
		background: var(--accent);
		color: #fff;
	}
	.btn-primary:hover { opacity: 0.92; text-decoration: none; }
	.btn-secondary {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}
	.btn-secondary:hover { background: var(--surface-hover, color-mix(in oklch, var(--surface) 80%, var(--text))); text-decoration: none; }
	.btn-quiet {
		background: transparent;
		color: var(--text-muted);
		border: 1px solid transparent;
	}
	.btn-quiet:hover { color: var(--text); text-decoration: none; }

	.empty-shell {
		min-height: 70vh;
		display: grid;
		place-items: center;
		padding: 2rem 1.5rem;
	}
	.empty {
		max-width: 540px;
		text-align: center;
	}
	.empty .eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.8rem;
	}
	.empty h1 {
		font-size: 1.8rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin-bottom: 0.8rem;
	}
	.empty .lede {
		color: var(--text-muted);
		margin-bottom: 1.5rem;
		line-height: 1.5;
	}
</style>
