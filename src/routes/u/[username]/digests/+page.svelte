<script lang="ts">
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

	{#if data.digests.length === 0}
		<div class="empty">
			<p class="empty-headline">No published digests yet.</p>
			<p class="empty-sub">Once {data.profile.displayName} publishes a weekly column, it'll show up here.</p>
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

	.head { margin-bottom: 2.5rem; }
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
	.byline { margin: 0; font-size: 0.95rem; }
	.back { color: var(--text-muted); text-decoration: none; }
	.back:hover { color: var(--text); }

	.empty {
		padding: 4rem 0;
		text-align: center;
		color: var(--text-muted);
	}
	.empty-headline { font-size: 1.1rem; font-weight: 600; color: var(--text); margin: 0 0 0.5rem; }
	.empty-sub { font-size: 0.95rem; margin: 0; }

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
		transition: background 0.15s, border-color 0.15s;
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
