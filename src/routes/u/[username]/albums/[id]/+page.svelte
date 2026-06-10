<script lang="ts">
	import AlbumHero from '$lib/components/AlbumHero.svelte';
	import ExternalLinks from '$lib/components/ExternalLinks.svelte';
	import Tracklist from '$lib/components/Tracklist.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const displayName = $derived(data.profile.display_name || data.profile.username);
</script>

<svelte:head>
	<title>{data.album.artist} – {data.album.title} — {displayName}'s collection</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a href="/u/{data.profile.username}/collection" class="back">
			← {displayName}'s collection
		</a>
	</header>

	<AlbumHero album={data.album} eyebrow="from @{data.profile.username}'s collection" />

	<ExternalLinks links={data.externalLinks} />

	<Tracklist
		tracks={data.tracklist.tracks}
		totalDuration={data.tracklist.totalDuration}
		source={data.tracklist.source}
	/>
</div>

<style>
	.page {
		position: relative;
		min-height: 100dvh;
		padding-bottom: 4rem;
	}
	.topbar {
		max-width: 980px;
		margin: 0 auto;
		padding: 1.5rem 1.5rem 0;
	}
	.back {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
</style>
