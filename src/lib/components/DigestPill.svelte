<script lang="ts">
	import { onMount } from 'svelte';

	let { digestId, weekEnding }: { digestId: string; weekEnding: string } = $props();

	let visible = $state(false);

	// Dismissal scope: per-digest, per-session. A new digest re-prompts; the same
	// digest stays dismissed across page navigations within the tab.
	const storageKey = $derived(`albumz:digest-pill-dismissed:${digestId}`);

	onMount(() => {
		try {
			if (sessionStorage.getItem(storageKey) === '1') return;
		} catch { /* sessionStorage may be unavailable in some embeds — fail open */ }
		// Tiny delay so the pill doesn't slam in during initial render.
		const handle = setTimeout(() => { visible = true; }, 600);
		return () => clearTimeout(handle);
	});

	function dismiss() {
		visible = false;
		try { sessionStorage.setItem(storageKey, '1'); } catch { /* same */ }
	}

	const weekLabel = $derived.by(() => {
		const d = new Date(weekEnding + 'T00:00:00');
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	});
</script>

{#if visible}
	<div class="pill" role="status">
		<a class="pill-link" href="/digests/{digestId}">
			<span class="dot" aria-hidden="true"></span>
			<span class="text">
				<span class="lead">Your weekly digest is ready</span>
				<span class="sub">draft for week ending {weekLabel} · review →</span>
			</span>
		</a>
		<button type="button" class="dismiss" onclick={dismiss} aria-label="Dismiss">×</button>
	</div>
{/if}

<style>
	.pill {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 60;
		display: flex;
		align-items: stretch;
		max-width: calc(100vw - 2.5rem);
		background: color-mix(in oklch, var(--bg-elevated, #1a1820) 92%, transparent);
		color: var(--text);
		border: 1px solid color-mix(in oklch, var(--accent) 35%, var(--border));
		border-radius: 999px;
		box-shadow:
			0 10px 30px rgba(0, 0, 0, 0.45),
			0 0 24px color-mix(in oklch, var(--accent) 18%, transparent);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		animation: pill-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	@keyframes pill-in {
		from { opacity: 0; transform: translateY(12px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.pill-link {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.65rem 0.9rem 0.65rem 1rem;
		color: inherit;
		text-decoration: none;
	}
	.pill-link:hover { text-decoration: none; }
	.pill-link:hover .lead { color: var(--accent); }

	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 10px var(--accent);
		animation: pulse 1.8s ease-in-out infinite;
		flex-shrink: 0;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50%      { opacity: 0.5; transform: scale(1.3); }
	}

	.text {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.lead {
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		transition: color 0.18s;
	}
	.sub {
		font-size: 0.7rem;
		color: var(--text-muted);
		margin-top: 0.1rem;
	}

	.dismiss {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.1rem;
		line-height: 1;
		padding: 0 0.85rem 0 0.4rem;
		cursor: pointer;
		border-left: 1px solid color-mix(in oklch, var(--border) 60%, transparent);
		border-radius: 0 999px 999px 0;
		transition: color 0.15s, background 0.15s;
	}
	.dismiss:hover {
		color: var(--text);
		background: color-mix(in oklch, var(--accent) 10%, transparent);
	}

	@media (max-width: 600px) {
		.pill { right: 0.75rem; bottom: 0.75rem; }
		.lead { font-size: 0.82rem; }
		.sub  { font-size: 0.66rem; }
	}

	@media (prefers-reduced-motion: reduce) {
		.pill { animation: none; }
		.dot  { animation: none; }
	}
</style>
