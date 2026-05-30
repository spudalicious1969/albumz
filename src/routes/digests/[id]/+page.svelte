<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const { digest, isOwner, author } = $derived(data);

	function fmtWeekEnding(iso: string): string {
		// iso is YYYY-MM-DD; render as a long date
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
			timeZone: 'UTC',
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const paragraphs = $derived(digest.body.split(/\n\s*\n/).filter((p) => p.trim().length > 0));
	const eyebrow = $derived(
		digest.status === 'draft'
			? 'Draft — not published'
			: digest.status === 'discarded'
				? 'Discarded'
				: 'Weekly digest'
	);
</script>

<svelte:head>
	<title>Week ending {fmtWeekEnding(digest.week_ending)} — albumz</title>
	{#if digest.status !== 'published'}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

<div class="page">
	<header class="head">
		<p class="eyebrow" class:eyebrow-draft={digest.status !== 'published'}>{eyebrow}</p>
		<h1>Week ending {fmtWeekEnding(digest.week_ending)}</h1>
		{#if author}
			<p class="byline">
				<a href="/u/{author.username}">{author.displayName}</a>
				<span class="dim"> · @{author.username}</span>
			</p>
		{/if}
	</header>

	<article class="prose">
		{#each paragraphs as p (p)}
			<p>{p}</p>
		{/each}
	</article>

	{#if isOwner}
		<aside class="owner-bar" aria-label="Owner controls">
			<p class="owner-eyebrow">Owner controls</p>
			<div class="owner-actions">
				{#if digest.status === 'draft'}
					<form method="POST" action="?/publish" use:enhance>
						<button type="submit" class="btn-primary">Publish</button>
					</form>
					<form
						method="POST"
						action="?/discard"
						use:enhance
						onsubmit={(e) => {
							if (!confirm('Discard this digest? It will be hidden from everywhere.')) {
								e.preventDefault();
							}
						}}
					>
						<button type="submit" class="btn-secondary">Discard</button>
					</form>
				{:else if digest.status === 'published'}
					<form method="POST" action="?/unpublish" use:enhance>
						<button type="submit" class="btn-secondary">Unpublish (return to draft)</button>
					</form>
				{:else}
					<p class="status-note">This digest was discarded. It's hidden from the archive.</p>
				{/if}
				<a href="/settings" class="link-quiet">Generate a new draft →</a>
			</div>
			<p class="meta-note">Model: {digest.model_used} · created {new Date(digest.created_at).toLocaleString()}</p>
		</aside>
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
	.eyebrow-draft { color: var(--text-muted); }

	h1 {
		font-size: clamp(1.8rem, 3.5vw, 2.4rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.15;
		margin: 0 0 0.6rem;
		color: var(--text);
	}

	.byline {
		font-size: 0.95rem;
		color: var(--text);
		margin: 0;
	}
	.byline a {
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
		border-bottom: 1px dotted color-mix(in oklch, var(--text) 30%, transparent);
	}
	.byline a:hover { border-bottom-color: var(--text); }
	.byline .dim { color: var(--text-muted); font-weight: 400; }

	.prose {
		font-size: 1.05rem;
		line-height: 1.75;
		color: var(--text);
	}
	.prose p {
		margin: 0 0 1.3rem;
	}
	.prose p:first-child::first-letter {
		font-size: 3.2rem;
		font-weight: 700;
		line-height: 0.95;
		float: left;
		margin: 0.18rem 0.65rem 0 0;
		color: var(--accent);
	}
	.prose p:last-child {
		margin-bottom: 0;
	}

	.owner-bar {
		margin-top: 3.5rem;
		padding: 1.4rem 1.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	.owner-eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin: 0 0 0.85rem;
	}
	.owner-actions {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.owner-actions form { margin: 0; }
	.btn-primary {
		padding: 0.55rem 1.1rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-family: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.btn-primary:hover { opacity: 0.9; }
	.btn-secondary {
		padding: 0.55rem 1.1rem;
		background: var(--bg-elevated);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-family: inherit;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-secondary:hover { background: var(--surface); }
	.link-quiet {
		font-size: 0.85rem;
		color: var(--text-muted);
		text-decoration: none;
		margin-left: auto;
	}
	.link-quiet:hover { color: var(--text); }

	.status-note {
		font-size: 0.88rem;
		color: var(--text-muted);
		margin: 0;
		font-style: italic;
	}

	.meta-note {
		font-size: 0.72rem;
		color: var(--text-muted);
		margin: 1rem 0 0;
		font-family: ui-monospace, monospace;
	}
</style>
