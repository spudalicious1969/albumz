<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const parsed = $derived(
		(form as { parsed?: unknown })?.parsed as
			| {
					rows: Array<{
						artist: string;
						title: string;
						year: number | null;
						format: string | null;
						label: string | null;
						rating: number | null;
						notes: string | null;
						tags: string[];
						ownership: 'OWN' | 'WANT';
						rowIndex: number;
						skipReason?: string;
					}>;
					detectedColumns: Record<string, string>;
					sourceHeaders: string[];
					totalRows: number;
			  }
			| undefined
	);

	let busy = $state(false);

	const validRows = $derived(parsed?.rows.filter((r) => !r.skipReason) ?? []);
	const skippedRows = $derived(parsed?.rows.filter((r) => r.skipReason) ?? []);
</script>

<svelte:head><title>Import — albumz</title></svelte:head>

<div class="page">
	<header class="topbar">
		<a href="/" class="back">← Collection</a>
		<h1>Import</h1>
	</header>

	{#if !parsed}
		<section class="intro">
			<p>
				Upload a CSV, XLS, or XLSX file. Headers like "Artist", "Album", "Year", "Format" are
				auto-detected — including Discogs exports.
			</p>

			<form
				method="POST"
				action="?/preview"
				enctype="multipart/form-data"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
			>
				<label class="file-field">
					<span class="label">File</span>
					<input type="file" name="file" accept=".csv,.xls,.xlsx" />
				</label>

				<details>
					<summary>or paste CSV text (e.g. from Google Sheets)</summary>
					<textarea
						name="pasted_csv"
						rows="6"
						placeholder="Artist,Album,Year&#10;Underscores,Wallsocket,2023"
					></textarea>
				</details>

				{#if (form as { error?: string })?.error}
					<p class="error">{(form as { error?: string }).error}</p>
				{/if}

				<button type="submit" class="btn-primary" disabled={busy}>
					{busy ? 'Parsing…' : 'Preview'}
				</button>
			</form>
		</section>
	{:else}
		<section class="preview">
			<div class="summary">
				<p class="eyebrow">Preview</p>
				<p>
					<strong>{validRows.length}</strong> ready to import
					{#if skippedRows.length}
						· <span class="muted">{skippedRows.length} skipped</span>
					{/if}
					· {parsed.totalRows} total rows
				</p>
				<p class="muted detected">
					Detected: {Object.entries(parsed.detectedColumns)
						.map(([k, v]) => `${k} ← "${v}"`)
						.join(' · ')}
				</p>
			</div>

			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Artist</th><th>Title</th><th>Year</th>
							<th>Format</th><th>Label</th><th>Rating</th>
							<th>Tags</th><th>Own</th><th></th>
						</tr>
					</thead>
					<tbody>
						{#each parsed.rows as r}
							<tr class:skipped={!!r.skipReason}>
								<td>{r.artist || '—'}</td>
								<td>{r.title || '—'}</td>
								<td>{r.year ?? ''}</td>
								<td>{r.format ?? ''}</td>
								<td class="muted">{r.label ?? ''}</td>
								<td>{r.rating ? '★'.repeat(r.rating) : ''}</td>
								<td class="muted">{r.tags.join(', ')}</td>
								<td>{r.ownership === 'OWN' ? '✓' : 'want'}</td>
								<td class="skip-reason">{r.skipReason ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<form
				method="POST"
				action="?/commit"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
			>
				<input type="hidden" name="rows" value={JSON.stringify(validRows)} />

				{#if (form as { error?: string })?.error}
					<p class="error">{(form as { error?: string }).error}</p>
				{/if}

				<div class="actions">
					<a href="/import" class="btn-ghost">Start over</a>
					<button type="submit" class="btn-primary" disabled={busy || validRows.length === 0}>
						{busy
							? 'Importing…'
							: `Import ${validRows.length} album${validRows.length === 1 ? '' : 's'}`}
					</button>
				</div>
			</form>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 1000px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}
	.topbar {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}
	.back {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	h1 {
		font-size: 1.5rem;
		font-weight: 700;
	}

	.intro p {
		color: var(--text-muted);
		margin-bottom: 1.5rem;
	}
	.file-field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.label {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	input[type='file'] {
		padding: 0.55rem 0.75rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		width: 100%;
	}
	textarea {
		width: 100%;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 0.85rem;
		resize: vertical;
		margin-top: 0.5rem;
	}
	details {
		margin: 1rem 0;
	}
	summary {
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.btn-primary {
		padding: 0.6rem 1.5rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		margin-top: 1rem;
	}
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.btn-ghost {
		padding: 0.6rem 1rem;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.summary {
		margin-bottom: 1.5rem;
	}
	.eyebrow {
		margin-bottom: 0.5rem;
	}
	.muted {
		color: var(--text-muted);
	}
	.detected {
		font-size: 0.78rem;
		margin-top: 0.5rem;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 1.5rem;
		max-height: 60vh;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	thead {
		position: sticky;
		top: 0;
		background: var(--bg-elevated);
		z-index: 1;
	}
	th,
	td {
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}
	th {
		font-weight: 600;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}
	tr.skipped td {
		opacity: 0.4;
	}
	.skip-reason {
		color: oklch(60% 0.2 25);
		font-size: 0.78rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		align-items: center;
	}
	.error {
		color: oklch(55% 0.22 25);
		font-size: 0.85rem;
		margin: 0.75rem 0;
	}
</style>
