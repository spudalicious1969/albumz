<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function fmtWeekEnding(iso: string): string {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
			timeZone: 'UTC',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function firstSentence(body: string): string {
		// First non-empty paragraph, first sentence-ish — used as the teaser.
		const para = body.split(/\n\s*\n/).find((p) => p.trim().length > 0) ?? '';
		const match = para.match(/^.+?[.!?](?=\s|$)/);
		return (match?.[0] ?? para).trim();
	}

	let busy = $state(false);
	let err = $state<string | null>(null);

	async function generate() {
		busy = true;
		err = null;
		try {
			const res = await fetch('/api/digests/generate', { method: 'POST' });
			if (!res.ok) {
				const { message } = await res.json().catch(() => ({}));
				throw new Error(message || `Generation failed (${res.status})`);
			}
			const { digest } = await res.json();
			await goto(`/digests/${digest.id}`);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Generation failed.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Digests — {data.profile.displayName} — albumz</title>
</svelte:head>

<div class="page">
	<header class="head">
		<p class="eyebrow">Weekly digests</p>
		<h1>{data.profile.displayName}</h1>
		<p class="byline">
			<a href="/u/{data.profile.username}" class="back">← @{data.profile.username}</a>
		</p>
	</header>

	{#if data.isOwner}
		<div class="owner-bar">
			<div class="owner-bar-text">
				<p class="owner-lead">Drafts arrive automatically Sunday evening.</p>
				<p class="owner-sub">
					Use this to preview the current week early or to regenerate after a discard. Takes ~15–45
					seconds.
				</p>
			</div>
			<button type="button" class="btn-generate" onclick={generate} disabled={busy}>
				{busy ? 'Generating…' : 'Generate this week'}
			</button>
		</div>
		{#if err}
			<p class="owner-err">{err}</p>
		{/if}
	{/if}

	{#if data.digests.length === 0}
		<div class="empty">
			<p class="empty-headline">No published digests yet.</p>
			<p class="empty-sub">
				Once {data.profile.displayName} publishes a weekly column, it'll show up here.
			</p>
		</div>
	{:else}
		<ul class="archive">
			{#each data.digests as d (d.id)}
				<li>
					<a href="/digests/{d.id}" class="archive-row">
						<span class="when">{fmtWeekEnding(d.week_ending)}</span>
						<p class="teaser">{firstSentence(d.body)}</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.page {
		max-width: 680px;
		margin: 0 auto;
		padding: 5rem 1.5rem 4rem;
	}

	.head {
		margin-bottom: 2.5rem;
	}
	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--accent);
		margin: 0 0 0.85rem;
	}
	h1 {
		font-size: clamp(1.8rem, 3.5vw, 2.4rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.15;
		margin: 0 0 0.6rem;
		color: var(--text);
	}
	.byline {
		margin: 0;
		font-size: 0.95rem;
	}
	.back {
		color: var(--text-muted);
		text-decoration: none;
	}
	.back:hover {
		color: var(--text);
	}

	.owner-bar {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1rem 1.25rem;
		margin-bottom: 1.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius);
	}
	.owner-bar-text {
		flex: 1;
		min-width: 0;
	}
	.owner-lead {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--text);
	}
	.owner-sub {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
	.btn-generate {
		flex-shrink: 0;
		padding: 0.55rem 1.1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.88rem;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.btn-generate:hover:not(:disabled) {
		opacity: 0.9;
	}
	.btn-generate:disabled {
		opacity: 0.55;
		cursor: progress;
	}

	.owner-err {
		margin: -0.75rem 0 1.5rem;
		font-size: 0.85rem;
		color: oklch(60% 0.18 25);
	}

	@media (max-width: 560px) {
		.owner-bar {
			flex-direction: column;
			align-items: stretch;
			gap: 0.85rem;
		}
		.btn-generate {
			width: 100%;
		}
	}

	.empty {
		padding: 4rem 0;
		text-align: center;
		color: var(--text-muted);
	}
	.empty-headline {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text);
		margin: 0 0 0.5rem;
	}
	.empty-sub {
		font-size: 0.95rem;
		margin: 0;
	}

	.archive {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.archive-row {
		display: block;
		padding: 1.1rem 1.3rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.archive-row:hover {
		background: var(--bg-elevated);
		border-color: color-mix(in oklch, var(--border) 50%, var(--text));
		text-decoration: none;
	}

	.when {
		display: block;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent);
		margin-bottom: 0.4rem;
	}

	.teaser {
		font-size: 0.98rem;
		line-height: 1.55;
		color: var(--text);
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
