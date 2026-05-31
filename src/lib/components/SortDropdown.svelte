<script lang="ts" generics="T extends string">
	// Themed sort dropdown. Native <select> popovers are OS-rendered and ignore
	// site styling, so we render our own list. Mirrors the UserMenu structure
	// (click-outside + Esc to close, focusable trigger). Generic on the value
	// type so parents with narrow string unions don't lose type info via bind.

	type Option = { value: T; label: string };

	let {
		options,
		value = $bindable(),
		reversed = $bindable(false),
		reversible = false,
		ariaLabel = 'Sort by'
	}: {
		options: Option[];
		value: T;
		reversed?: boolean;
		reversible?: boolean;
		ariaLabel?: string;
	} = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);

	const current = $derived(options.find((o) => o.value === value) ?? options[0]);

	function close() {
		open = false;
	}

	function pick(v: T) {
		value = v;
		close();
		triggerEl?.focus();
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

<div class="sort-group">
	<div class="dropdown">
		<button
			bind:this={triggerEl}
			type="button"
			class="trigger"
			class:active={open}
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-label={ariaLabel}
			onclick={() => (open = !open)}
		>
			<span class="label">{current.label}</span>
			<svg class="chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
				<path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>

		{#if open}
			<div bind:this={menuEl} class="menu" role="listbox">
				{#each options as opt (opt.value)}
					<button
						type="button"
						role="option"
						aria-selected={opt.value === value}
						class="item"
						class:selected={opt.value === value}
						onclick={() => pick(opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if reversible}
		<button
			type="button"
			class="reverse"
			class:on={reversed}
			onclick={() => (reversed = !reversed)}
			title={reversed ? 'Reversed (click to restore default order)' : 'Reverse sort order'}
			aria-label="Reverse sort order"
			aria-pressed={reversed}
		>
			<svg class="reverse-icon" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
				<path d="M6 2 v8 M3 7 l3 3 l3 -3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.sort-group { display: inline-flex; gap: 0.35rem; align-items: center; }
	.dropdown { position: relative; display: inline-flex; }

	.reverse {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: var(--surface);
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.reverse:hover {
		background: var(--surface-hover, color-mix(in oklch, var(--surface) 80%, var(--text)));
		color: var(--text);
		border-color: color-mix(in oklch, var(--border) 50%, var(--text));
	}
	.reverse.on {
		color: var(--accent);
		border-color: color-mix(in oklch, var(--accent) 50%, var(--border));
	}
	.reverse-icon { transition: transform 0.15s; }
	.reverse.on .reverse-icon { transform: rotate(180deg); }

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.7rem;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}
	.trigger:hover,
	.trigger.active {
		background: var(--surface-hover, color-mix(in oklch, var(--surface) 80%, var(--text)));
		border-color: color-mix(in oklch, var(--border) 50%, var(--text));
	}

	.chev { transition: transform 0.15s; opacity: 0.7; }
	.trigger.active .chev { transform: rotate(180deg); }

	.menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		min-width: 160px;
		background: var(--bg-elevated, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
		padding: 0.3rem 0;
		z-index: 100;
		animation: drop-in 0.12s ease-out;
	}

	.item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.9rem;
		font-size: 0.88rem;
		font-family: inherit;
		color: var(--text);
		background: none;
		border: none;
		cursor: pointer;
	}
	.item:hover { background: var(--surface); }
	.item.selected {
		color: var(--accent);
		font-weight: 600;
	}

	@keyframes drop-in {
		from { opacity: 0; transform: translateY(-4px); }
		to   { opacity: 1; transform: none; }
	}
</style>
