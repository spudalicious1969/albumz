<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in — albumz</title>
</svelte:head>

<div class="auth-page">
	<!-- Concentric vinyl-groove rings drifting behind the card. Aria-hidden — pure decoration. -->
	<div class="rings" aria-hidden="true">
		<svg viewBox="-200 -200 400 400">
			<g transform="translate(60, -40)">
				<circle r="40" />
				<circle r="65" />
				<circle r="92" />
				<circle r="120" />
				<circle r="150" />
				<circle r="182" />
				<circle r="215" />
				<circle r="250" />
				<circle r="285" />
			</g>
		</svg>
	</div>

	<form class="card" method="POST">
		<div class="wordmark-wrap">
			<span class="wordmark">album<span>z</span></span>
		</div>
		<p class="subtitle">Sign in to your collection.</p>

		<label class="field">
			<span class="lbl">Email</span>
			<input type="email" name="email" required autocomplete="email" />
		</label>
		<label class="field">
			<span class="lbl">Password</span>
			<input type="password" name="password" required autocomplete="current-password" />
		</label>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button type="submit" class="submit">Sign in</button>

		<p class="foot">No account yet? <a href="/register">Create one</a></p>
	</form>
</div>

<style>
	.auth-page {
		position: relative;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 2rem 1rem;
		overflow: hidden;
	}
	/* Soft accent wash from the top — same pattern as the album hero, just dialed-down */
	.auth-page::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse 55% 35% at 50% -5%, var(--accent-soft), transparent 70%);
		pointer-events: none;
	}

	/* ── Vinyl-groove rings — barely-there rotation ─────────────────── */
	.rings {
		position: absolute;
		inset: 0;
		pointer-events: none;
		display: grid;
		place-items: center;
		mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, black, transparent 75%);
	}
	.rings svg {
		width: min(120vh, 130vw);
		height: min(120vh, 130vw);
		opacity: 0.18;
		animation: spin 120s linear infinite;
	}
	.rings circle {
		fill: none;
		stroke: var(--accent);
		stroke-width: 0.4;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) {
		.rings svg { animation: none; }
	}

	/* ── Card ───────────────────────────────────────────────────────── */
	.card {
		position: relative;
		z-index: 2;
		width: min(380px, calc(100% - 2rem));
		background: var(--surface);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 2.25rem 1.85rem 1.85rem;
		box-shadow: var(--shadow-lift);
	}

	.wordmark-wrap { margin-bottom: 0.4rem; }
	.wordmark {
		font-size: 1.8rem;
		font-weight: 900;
		letter-spacing: -0.02em;
		color: var(--text);
	}
	/* Inherit z-glow from app.css (.wordmark span text-shadow) */

	.subtitle {
		font-size: 0.88rem;
		color: var(--text-muted);
		margin-bottom: 1.6rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.lbl {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.field input {
		padding: 0.7rem 0.85rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
	}

	.submit {
		width: 100%;
		margin-top: 0.6rem;
		padding: 0.75rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 700;
		font-size: 0.95rem;
		cursor: pointer;
		box-shadow: 0 0 24px color-mix(in oklch, var(--accent) 25%, transparent);
		transition: filter 0.15s;
	}
	.submit:hover { filter: brightness(1.07); }

	.foot {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
		text-align: center;
		font-size: 0.82rem;
		color: var(--text-muted);
	}
	.foot a { color: var(--accent); }
	.foot a:hover { text-decoration: underline; }

	.error {
		font-size: 0.85rem;
		color: oklch(60% 0.2 25);
		margin-bottom: 0.85rem;
	}
</style>
