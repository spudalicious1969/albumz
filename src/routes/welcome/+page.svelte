<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let username = $state(data.suggestedUsername);
	let checkStatus: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' = $state(
		data.suggestedUsername ? 'idle' : 'idle'
	);
	let submitting = $state(false);

	$effect(() => {
		const trimmed = username.trim().toLowerCase();
		checkStatus = 'idle';
		if (!trimmed) return;
		if (!/^[a-z0-9][a-z0-9_.-]*$/.test(trimmed) || trimmed.length < 2) {
			checkStatus = 'invalid';
			return;
		}
		checkStatus = 'checking';
		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(`/api/username-check?username=${encodeURIComponent(trimmed)}`);
				const { available } = await res.json();
				checkStatus = available ? 'available' : 'taken';
			} catch {
				checkStatus = 'idle';
			}
		}, 350);
		return () => clearTimeout(timeout);
	});

	const canSubmit = $derived(checkStatus === 'available' && !submitting);
</script>

<svelte:head>
	<title>Welcome to albumz</title>
</svelte:head>

<div class="page">
	<div class="card">
		<div class="wordmark">album<span>z</span></div>
		<h1>Pick your username</h1>
		<p class="intro">This becomes your public address. You can always change it later in Settings.</p>

		<form
			method="POST"
			action="?/complete"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			<div class="field">
				<label for="username">Username</label>
				<div class="input-row">
					<input
						id="username"
						name="username"
						type="text"
						value={username}
						oninput={(e) => (username = (e.target as HTMLInputElement).value)}
						autocomplete="username"
						autocapitalize="none"
						spellcheck={false}
						maxlength="40"
						placeholder="yourname"
						aria-describedby="username-hint"
					/>
					<span class="status-icon" aria-hidden="true">
						{#if checkStatus === 'checking'}
							<span class="spinner"></span>
						{:else if checkStatus === 'available'}
							<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 8l3.5 3.5 6.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						{:else if checkStatus === 'taken'}
							<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
						{/if}
					</span>
				</div>

				<p
					id="username-hint"
					class="hint"
					class:hint-ok={checkStatus === 'available'}
					class:hint-err={checkStatus === 'taken' || checkStatus === 'invalid'}
				>
					{#if checkStatus === 'available'}
						✓ Available — your page will be at <strong>albumz.spudalicio.us/u/{username.trim().toLowerCase()}</strong>
					{:else if checkStatus === 'taken'}
						That username is already taken.
					{:else if checkStatus === 'invalid'}
						Must start with a letter or number; can contain letters, numbers, _ . -
					{:else if username.trim()}
						Checking…
					{:else}
						Your public collection will live at <strong>albumz.spudalicio.us/u/yourname</strong>
					{/if}
				</p>
			</div>

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<button type="submit" class="btn-primary" disabled={!canSubmit}>
				{submitting ? 'Setting up your account…' : "Let's go →"}
			</button>
		</form>
	</div>
</div>

<style>
	.page {
		min-height: 100svh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
	}

	.card {
		width: 100%;
		max-width: 420px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 2.5rem 2rem;
		box-shadow: var(--shadow-lift);
	}

	.wordmark {
		font-size: 1.6rem;
		font-weight: 900;
		letter-spacing: -0.03em;
		color: var(--text);
		margin-bottom: 1.25rem;
	}
	.wordmark span { color: var(--accent); }

	h1 {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--text);
		margin-bottom: 0.5rem;
	}

	.intro {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin-bottom: 2rem;
		line-height: 1.5;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1.5rem;
	}

	label {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.input-row {
		position: relative;
	}

	input {
		width: 100%;
		padding: 0.65rem 2.5rem 0.65rem 0.9rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
		outline: none;
		transition: border-color 0.15s;
	}
	input:focus { border-color: var(--accent); }

	.status-icon {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		color: var(--text-muted);
		pointer-events: none;
	}
	.status-icon svg { color: oklch(55% 0.17 145); }

	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.hint {
		font-size: 0.8rem;
		color: var(--text-muted);
		line-height: 1.4;
		min-height: 1.2em;
	}
	.hint-ok { color: oklch(55% 0.17 145); }
	.hint-err { color: oklch(55% 0.2 25); }

	.error {
		font-size: 0.85rem;
		color: oklch(55% 0.2 25);
		margin-bottom: 1rem;
	}

	.btn-primary {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.btn-primary:hover:not(:disabled) { opacity: 0.9; }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
