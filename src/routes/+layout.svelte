<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import LookupPalette from '$lib/components/LookupPalette.svelte';
	import SpinSessionRunner from '$lib/components/SpinSessionRunner.svelte';
	import DigestPill from '$lib/components/DigestPill.svelte';
	import '../app.css';

	let { data, children } = $props();

	// Don't nag with the pill on the digest permalink itself, or on lean-back
	// Headliner where any overlay would break immersion.
	const suppressPill = $derived(
		page.url.pathname.startsWith('/digests/') || page.url.pathname.startsWith('/headliner/')
	);

	// Single source of truth for which PWA the current page installs as. A page can
	// only carry one effective <link rel="manifest">, so we pick it by route: the
	// mini gets its own per-user manifest (Window Controls Overlay, no titlebar),
	// the rest of Headliner gets the fullscreen Headliner manifest, everything else
	// installs as Albumz. (See the note in app.html for why this lives here.)
	const manifestHref = $derived.by(() => {
		const path = page.url.pathname;
		const mini = path.match(/^\/headliner\/([^/]+)\/mini\/?$/);
		if (mini) return `/headliner/${mini[1]}/mini/manifest.json`;
		if (path === '/headliner' || path.startsWith('/headliner/')) return '/headliner/manifest.json';
		return '/manifest.json';
	});

	onMount(() => {
		const {
			data: { subscription }
		} = data.supabase.auth.onAuthStateChange((_, newSession) => {
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
	<link rel="manifest" href={manifestHref} />
</svelte:head>

{@render children()}

{#if data.user}
	<LookupPalette />
	<SpinSessionRunner />
	{#if data.pendingDigest && !suppressPill}
		<DigestPill digestId={data.pendingDigest.id} weekEnding={data.pendingDigest.week_ending} />
	{/if}
{/if}
