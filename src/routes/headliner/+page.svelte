<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Headliner — albumz</title>
</svelte:head>

<main>
	<h1>Headliner</h1>
	<p>Pick a user to watch:</p>

	{#if data.profiles.length === 0}
		<p class="muted">Nobody has linked a Last.fm username yet.</p>
	{:else}
		<ul>
			{#each data.profiles as p}
				<li><a href="/headliner/{p.username}">{p.display_name ?? p.username}</a></li>
			{/each}
		</ul>
	{/if}

	<p class="back"><a href="/">← Back</a></p>
</main>

<style>
	main {
		max-width: 480px;
		margin: 6rem auto;
		padding: 0 1.5rem;
		text-align: center;
	}
	h1 {
		font-size: 1.8rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		margin-bottom: 0.5rem;
	}
	p {
		color: var(--text-muted);
		margin-bottom: 1.5rem;
	}
	ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	li a {
		display: block;
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		text-decoration: none;
	}
	li a:hover {
		background: var(--surface-hover);
	}
	.back {
		margin-top: 2rem;
	}
</style>
