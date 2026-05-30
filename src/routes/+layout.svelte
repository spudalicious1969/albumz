<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import LookupPalette from '$lib/components/LookupPalette.svelte';
	import SpinSessionRunner from '$lib/components/SpinSessionRunner.svelte';
	import '../app.css';

	let { data, children } = $props();

	onMount(() => {
		const { data: { subscription } } = data.supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== data.session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		return () => subscription.unsubscribe();
	});

	// Apply theme preference to <html data-theme="..."> — falls back to OS via CSS when 'auto'
	$effect(() => {
		const theme = data.theme;
		if (theme === 'light' || theme === 'dark') {
			document.documentElement.setAttribute('data-theme', theme);
		} else {
			document.documentElement.removeAttribute('data-theme');
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.json" />
	<meta name="theme-color" content="#08070a" />
</svelte:head>

{@render children()}

{#if data.user}
	<LookupPalette />
	<SpinSessionRunner />
{/if}
