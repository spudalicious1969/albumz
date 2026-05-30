<script lang="ts">
	import { spin } from '$lib/spin-state.svelte';
</script>

<button
	type="button"
	class="chip"
	class:active={spin.active}
	class:identifying={spin.runnerStatus === 'identifying'}
	onclick={() => spin.toggle()}
	title={spin.active ? 'Stop spin session' : 'Spin the disc'}
	aria-label={spin.active ? 'Stop spin session' : 'Start spin session'}
	aria-pressed={spin.active}
>
	<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
		<path
			d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"
			fill="currentColor"
		/>
		<path
			d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21h-2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11z"
			fill="currentColor"
		/>
	</svg>
	{#if spin.active && spin.spins.length > 0}
		<span class="count">{spin.spins.length}</span>
	{/if}
</button>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.55rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s, background 0.15s;
	}
	.chip:hover { color: var(--text); border-color: var(--text-muted); }

	.chip.active {
		color: #ff6b6b;
		border-color: rgba(255, 107, 107, 0.5);
		background: rgba(255, 107, 107, 0.08);
	}

	.chip.active::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #ff6b6b;
		box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.6);
		animation: pulse 1.6s ease-out infinite;
	}

	.chip.identifying::before {
		animation-duration: 0.7s;
	}

	.count {
		font-size: 0.72rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	@keyframes pulse {
		0%   { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.6); }
		70%  { box-shadow: 0 0 0 8px rgba(255, 107, 107, 0); }
		100% { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0); }
	}
</style>
