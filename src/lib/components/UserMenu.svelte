<script lang="ts">
	import Avatar from './Avatar.svelte';

	type MenuProfile = {
		username: string;
		display_name?: string | null;
		avatar_url?: string | null;
		email_hash?: string | null;
		last_fm_username?: string | null;
	};

	let { profile }: { profile: MenuProfile } = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);

	function close() {
		open = false;
	}

	function handleDocClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		if (menuEl?.contains(target) || triggerEl?.contains(target)) return;
		close();
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			close();
			triggerEl?.focus();
		}
	}
</script>

<svelte:window onclick={handleDocClick} onkeydown={handleKey} />

<div class="user-menu">
	<button
		bind:this={triggerEl}
		type="button"
		class="trigger"
		class:active={open}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Account menu"
		onclick={() => (open = !open)}
	>
		<Avatar {profile} size={36} />
		<svg class="chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
			<path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<div bind:this={menuEl} class="dropdown" role="menu">
			<div class="header" role="presentation">
				<p class="signed-in">Signed in as</p>
				<p class="username">@{profile.username}</p>
			</div>
			<div class="divider" role="separator"></div>
			<a role="menuitem" href="/u/{profile.username}" onclick={close}>My public page</a>
			<a role="menuitem" href="/u/{profile.username}/collection" onclick={close}>Full collection</a>
			{#if profile.last_fm_username}
				<a role="menuitem" href="/headliner/{profile.username}" onclick={close}>Headliner</a>
			{/if}
			<a role="menuitem" href="/dig" onclick={close}>Dig</a>
				<a role="menuitem" href="/discover" onclick={close}>Discover</a>
			<div class="divider" role="separator"></div>
			<a role="menuitem" href="/settings" onclick={close}>Settings</a>
			<a role="menuitem" href="/help" onclick={close}>Help</a>
			<form method="POST" action="/auth/logout">
				<button type="submit" role="menuitem" class="signout">Sign out</button>
			</form>
		</div>
	{/if}
</div>

<style>
	.user-menu { position: relative; display: inline-flex; }

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.55rem 0.2rem 0.2rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		cursor: pointer;
		color: var(--text-muted);
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}
	.trigger:hover, .trigger.active {
		background: var(--surface-hover, color-mix(in oklch, var(--surface) 80%, var(--text)));
		color: var(--text);
		border-color: color-mix(in oklch, var(--border) 50%, var(--text));
	}
	.chev { transition: transform 0.15s; }
	.trigger.active .chev { transform: rotate(180deg); }

	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		min-width: 220px;
		background: var(--bg-elevated, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
		padding: 0.4rem 0;
		z-index: 100;
		animation: drop-in 0.12s ease-out;
	}

	.header { padding: 0.5rem 1rem 0.6rem; }
	.signed-in {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.username {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
		margin-top: 0.15rem;
	}

	.divider {
		height: 1px;
		background: var(--border);
		margin: 0.35rem 0;
	}

	.dropdown a, .dropdown .signout {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.55rem 1rem;
		font-size: 0.88rem;
		color: var(--text);
		text-decoration: none;
		background: none;
		border: none;
		font-family: inherit;
		cursor: pointer;
	}
	.dropdown a:hover, .dropdown .signout:hover {
		background: var(--surface);
		text-decoration: none;
	}
	.signout { color: var(--text-muted); }
	.signout:hover { color: var(--text); }

	@keyframes drop-in {
		from { opacity: 0; transform: translateY(-4px); }
		to   { opacity: 1; transform: none; }
	}

	@media (max-width: 480px) {
		.dropdown { min-width: 240px; }
	}
</style>
