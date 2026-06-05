<script lang="ts">
	// Inline Accept / Edit / Skip control for a single suggested field
	// (tags or label). Used in two contexts:
	//   1. Backfill recap on /settings — pass `albumId`; default behavior POSTs
	//      to the apply-suggestion API and persists immediately.
	//   2. Lookup panel on /albums/[id] — pass `onSave` to bind the accepted
	//      value into the parent's form state instead. Final commit happens
	//      when the user clicks the form's Save button.
	type Props = {
		field: 'tags' | 'label';
		suggested: string[] | string;
		albumId?: string;
		onSave?: (value: string[] | string) => Promise<void> | void;
		sourceLabel?: string;
	};
	let { field, suggested, albumId, onSave, sourceLabel = 'AI' }: Props = $props();

	type State = 'idle' | 'editing' | 'saving' | 'saved' | 'skipped' | 'error';
	let uiState = $state<State>('idle');
	let errorMsg = $state<string | null>(null);
	let editValue = $state(formatForEdit(suggested));

	function formatForEdit(v: string[] | string): string {
		return Array.isArray(v) ? v.join(', ') : v;
	}

	function suggestedDisplay(): string {
		return Array.isArray(suggested) ? suggested.join(', ') : suggested;
	}

	async function save(value: string[] | string) {
		uiState = 'saving';
		errorMsg = null;
		try {
			if (onSave) {
				await onSave(value);
			} else {
				if (!albumId) throw new Error('albumId required when onSave is not provided');
				const res = await fetch(`/api/albums/${albumId}/apply-suggestion`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ field, value })
				});
				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as { message?: string } | null;
					throw new Error(data?.message || `Save failed (${res.status})`);
				}
			}
			uiState = 'saved';
		} catch (err) {
			uiState = 'error';
			errorMsg = err instanceof Error ? err.message : 'Save failed.';
		}
	}

	function acceptAsIs() {
		save(suggested);
	}

	function acceptEdited() {
		if (field === 'tags') {
			const tags = editValue.split(',').map((s: string) => s.trim()).filter(Boolean);
			save(tags);
		} else {
			save(editValue.trim());
		}
	}

	function startEdit() {
		editValue = formatForEdit(suggested);
		uiState = 'editing';
	}

	function cancelEdit() {
		uiState = 'idle';
	}

	function skip() {
		uiState = 'skipped';
	}
</script>

<div class="suggestion" class:saved={uiState === 'saved'} class:skipped={uiState === 'skipped'}>
	<div class="suggestion-header">
		<span class="field-label">{field}:</span>
		{#if uiState === 'editing'}
			<input
				type="text"
				bind:value={editValue}
				class="suggestion-input"
				placeholder={field === 'tags' ? 'comma-separated tags' : 'label name'}
			/>
		{:else}
			<span class="suggestion-value">{suggestedDisplay()}</span>
			<span class="ai-badge" title="Source: {sourceLabel} — review before accepting">{sourceLabel}</span>
		{/if}
	</div>

	<div class="suggestion-actions">
		{#if uiState === 'idle'}
			<button type="button" class="btn-mini btn-accept" onclick={acceptAsIs}>Accept</button>
			<button type="button" class="btn-mini" onclick={startEdit}>Edit</button>
			<button type="button" class="btn-mini btn-skip" onclick={skip}>Skip</button>
		{:else if uiState === 'editing'}
			<button type="button" class="btn-mini btn-accept" onclick={acceptEdited}>Save</button>
			<button type="button" class="btn-mini" onclick={cancelEdit}>Cancel</button>
		{:else if uiState === 'saving'}
			<span class="status">Saving…</span>
		{:else if uiState === 'saved'}
			<span class="status status-ok">✓ Saved</span>
		{:else if uiState === 'skipped'}
			<span class="status status-muted">Skipped</span>
		{:else if uiState === 'error'}
			<span class="status status-err">{errorMsg}</span>
			<button type="button" class="btn-mini" onclick={acceptAsIs}>Retry</button>
		{/if}
	</div>
</div>

<style>
	.suggestion {
		display: grid;
		gap: 0.4rem;
		padding: 0.55rem 0.65rem;
		background: var(--bg-elevated, color-mix(in oklch, var(--surface, #fff) 96%, var(--text) 4%));
		border-radius: 6px;
		margin-top: 0.4rem;
	}
	.suggestion.saved { opacity: 0.7; }
	.suggestion.skipped { opacity: 0.5; }
	.suggestion-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.field-label { color: var(--text-muted); font-size: 0.78rem; text-transform: capitalize; }
	.suggestion-value { color: var(--text); font-size: 0.88rem; }
	.ai-badge {
		font-size: 0.62rem;
		padding: 0.08rem 0.4rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent, oklch(70% 0.15 220)) 22%, transparent);
		color: var(--text);
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.suggestion-input {
		flex: 1;
		min-width: 12rem;
		padding: 0.3rem 0.5rem;
		font-size: 0.88rem;
		border: 1px solid var(--border, color-mix(in oklch, var(--text) 20%, transparent));
		background: var(--surface, transparent);
		color: var(--text);
		border-radius: 4px;
	}
	.suggestion-actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
	.btn-mini {
		font-size: 0.78rem;
		padding: 0.25rem 0.65rem;
		border: 1px solid var(--border, color-mix(in oklch, var(--text) 20%, transparent));
		background: transparent;
		color: var(--text);
		border-radius: 4px;
		cursor: pointer;
		font-family: inherit;
	}
	.btn-mini:hover { background: color-mix(in oklch, var(--text) 8%, transparent); }
	.btn-accept { border-color: oklch(55% 0.17 145); color: oklch(55% 0.17 145); }
	.btn-skip { color: var(--text-muted); }
	.status { font-size: 0.8rem; color: var(--text-muted); }
	.status-ok { color: oklch(55% 0.17 145); }
	.status-err { color: oklch(55% 0.2 25); }
	.status-muted { color: var(--text-muted); font-style: italic; }
</style>
