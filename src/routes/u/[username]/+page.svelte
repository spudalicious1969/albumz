<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import type { NowPlayingResult } from '$lib/now-playing';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Mutable copy of nowPlaying so we can refresh it from the API on a timer
	let current: NowPlayingResult = $state(data.nowPlaying);

	$effect(() => {
		if (!data.profile.last_fm_username) return;
		const tick = async () => {
			try {
				const res = await fetch(`/api/now-playing/${data.profile.username}`);
				if (res.ok) current = await res.json();
			} catch { /* keep last good value */ }
		};
		const id = setInterval(tick, 15_000);
		return () => clearInterval(id);
	});

	const isLive = $derived(current.state === 'playing');

	// Fallback chain: when a now-playing cover URL 404s/blocks, advance through
	// the rest of the candidate list. Reset when track changes.
	let coverIdx = $state(0);
	let lastTrackKey = $state('');
	$effect(() => {
		const key = `${current.track ?? ''}::${current.artist ?? ''}`;
		if (key !== lastTrackKey) {
			lastTrackKey = key;
			coverIdx = 0;
		}
	});
	const liveCoverUrl = $derived(
		isLive ? (current.coverCandidates?.[coverIdx] ?? null) : null
	);

	// Hero pivots between currently-playing and featured album
	const hero = $derived(
		isLive
			? {
				coverUrl: liveCoverUrl,
				title: current.track ?? '',
				subtitle: current.artist ?? '',
				detail: current.album ?? null
			}
			: data.featured
				? {
					coverUrl: data.featured.cover_url,
					title: data.featured.title,
					subtitle: data.featured.artist,
					detail: data.featured.year ? String(data.featured.year) : null
				}
				: null
	);

	const heroAccent = $derived(
		isLive ? 'var(--accent)' : (data.featured?.accent_color ?? 'var(--accent)')
	);
	const eyebrow = $derived(
		isLive
			? (current.source === 'streamed' ? '♪ Currently Streaming' : '♪ Currently Spinning')
			: data.featuredIsUserPicked ? '★ Featured Album'
			: 'Most Recent'
	);

	const displayName = $derived(data.profile.display_name || data.profile.username);
	const ogTitle = $derived(`${displayName}'s collection`);
	const ogDesc = $derived(
		`${data.totalCount} album${data.totalCount === 1 ? '' : 's'}${data.featured ? ` · featuring ${data.featured.artist} – ${data.featured.title}` : ''}`
	);
</script>

<svelte:head>
	<title>{displayName} — albumz</title>
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDesc} />
	{#if data.featured?.cover_url}
		<meta property="og:image" content={data.featured.cover_url} />
	{/if}
</svelte:head>

<div class="page" style="--page-accent: {heroAccent}">
	{#if hero?.coverUrl}
		{#key hero.coverUrl}
			<div class="hero-bg" style="background-image: url({hero.coverUrl})"></div>
		{/key}
	{/if}
	<div class="hero-veil"></div>
	<div class="hero-accent"></div>

	<header class="topbar">
		<a href="/" class="wordmark">album<span>z</span></a>
		{#if data.profile.last_fm_username}
			<a href="/headliner/{data.profile.username}" class="headliner-link" title="Open Headliner">
				↗ Headliner
			</a>
		{/if}
	</header>

	<section class="hero">
		<div class="profile-line">
			<Avatar profile={data.profile} size={80} title={displayName} />
			<div class="profile-text">
				<p class="username">@{data.profile.username}</p>
				<h1 class="display-name">{displayName}</h1>
				<p class="count">{data.totalCount} album{data.totalCount === 1 ? '' : 's'}</p>
			</div>
		</div>

		{#if hero}
			<div class="featured">
				{#if hero.coverUrl}
					{#key hero.coverUrl}
						<img
								class="featured-cover"
								src={hero.coverUrl}
								alt="{hero.subtitle} – {hero.title}"
								onerror={() => { if (isLive) coverIdx++; }}
							/>
					{/key}
				{:else}
					<div class="featured-cover no-cover">{hero.subtitle.slice(0, 1)}</div>
				{/if}
				<div class="featured-meta">
					<p class="eyebrow">
						<span class="dot" class:live={isLive}></span>
						{eyebrow}
					</p>
					<h2 class="featured-title">{hero.title}</h2>
					<p class="featured-artist">
						{hero.subtitle}{hero.detail ? ` · ${hero.detail}` : ''}
					</p>
				</div>
			</div>
		{:else}
			<p class="empty">This collection is empty.</p>
		{/if}
	</section>

	{#if data.recent.length > 0}
		<section class="recent">
			<p class="section-eyebrow">Recently Added</p>
			<div class="recent-grid">
				{#each data.recent as album (album.id)}
					<a
						href="/u/{data.profile.username}/albums/{album.id}"
						class="recent-card"
						style="--card-accent: {album.accent_color ?? heroAccent}"
					>
						{#if album.cover_url}
							<img src={album.cover_url} alt="{album.artist} – {album.title}" loading="lazy" />
						{:else}
							<div class="no-cover">{album.artist.slice(0, 1)}</div>
						{/if}
						<div class="recent-meta">
							<p class="recent-artist">{album.artist}</p>
							<p class="recent-title">{album.title}</p>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.totalCount > 0}
		<section class="cta-wrap">
			<a href="/u/{data.profile.username}/collection" class="cta">
				Browse Full Collection
				<span class="arrow">→</span>
			</a>
		</section>
	{/if}
</div>

<style>
	.page {
		position: relative;
		min-height: 100dvh;
	}

	/* Atmospheric layers */
	.hero-bg {
		position: fixed;
		inset: 0;
		background-size: cover;
		background-position: center;
		filter: blur(80px) saturate(1.3);
		transform: scale(1.15);
		opacity: 0.45;
		z-index: -3;
	}
	.hero-veil {
		position: fixed;
		inset: 0;
		background:
			radial-gradient(120% 60% at 50% 0%, transparent, var(--bg) 80%),
			linear-gradient(to bottom, color-mix(in oklch, var(--bg) 50%, transparent), var(--bg));
		z-index: -1;
	}
	.hero-accent {
		position: fixed;
		inset: 0;
		background: radial-gradient(60% 40% at 50% 30%, color-mix(in oklch, var(--page-accent) 18%, transparent), transparent);
		z-index: -2;
	}

	.topbar {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 1.5rem 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.headliner-link {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
		text-decoration: none;
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: 100px;
		transition: color 0.15s, border-color 0.15s;
	}
	.headliner-link:hover {
		color: var(--page-accent);
		border-color: var(--page-accent);
		text-decoration: none;
	}
	.wordmark {
		font-size: 1.4rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		color: var(--text);
		text-decoration: none;
	}
	.wordmark span {
		text-shadow: 0 0 18px var(--page-accent), 0 0 6px var(--page-accent);
	}

	.hero {
		max-width: 1100px;
		margin: 0 auto;
		min-height: 75vh;
		padding: 3rem 1.5rem 4rem;
		display: grid;
		grid-template-columns: 1fr;
		gap: 2.5rem;
		align-content: center;
		justify-items: center;
		text-align: center;
	}

	.profile-line { display: flex; flex-direction: column; gap: 0.65rem; align-items: center; }
	.profile-text { display: flex; flex-direction: column; gap: 0.35rem; align-items: center; }
	.username {
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.display-name {
		font-size: 2.6rem;
		font-weight: 800;
		letter-spacing: -0.015em;
		line-height: 1;
	}
	.count {
		font-size: 0.85rem;
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}

	.featured {
		display: grid;
		grid-template-columns: minmax(220px, 320px) 1fr;
		gap: 2.5rem;
		align-items: center;
		max-width: 800px;
		text-align: left;
	}
	@media (max-width: 700px) {
		.featured { grid-template-columns: 1fr; text-align: center; justify-items: center; }
	}

	.featured-cover {
		width: 100%;
		aspect-ratio: 1;
		border-radius: var(--radius-lg);
		object-fit: cover;
		box-shadow:
			var(--shadow-lift),
			0 0 80px color-mix(in oklch, var(--page-accent) 40%, transparent);
	}
	.featured-cover.no-cover {
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklch, var(--page-accent) 20%, var(--bg-elevated));
		font-size: 6rem;
		font-weight: 800;
		color: color-mix(in oklch, var(--page-accent) 60%, var(--text));
	}

	.featured-meta .eyebrow {
		color: var(--page-accent);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		margin-bottom: 0.85rem;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.dot {
		width: 0.5em;
		height: 0.5em;
		border-radius: 50%;
		background: currentColor;
		opacity: 0;
	}
	.dot.live {
		opacity: 1;
		box-shadow: 0 0 8px currentColor;
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50%      { opacity: 0.4; transform: scale(1.4); }
	}
	.featured-title {
		font-size: 1.85rem;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.01em;
		margin-bottom: 0.4rem;
	}
	.featured-artist {
		font-size: 1rem;
		color: var(--text-muted);
	}

	.empty { color: var(--text-muted); padding: 4rem 0; }

	/* Recent additions */
	.recent {
		max-width: 1100px;
		margin: 2rem auto 3rem;
		padding: 0 1.5rem;
	}
	.section-eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 1.25rem;
	}
	.recent-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
	}
	.recent-card {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface);
		box-shadow: var(--shadow);
		text-decoration: none;
		color: inherit;
		transition: transform 0.18s, box-shadow 0.18s;
	}
	.recent-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-lift), 0 0 18px color-mix(in oklch, var(--card-accent) 25%, transparent);
		text-decoration: none;
	}
	.recent-card img { width: 100%; aspect-ratio: 1; object-fit: cover; }
	.no-cover {
		width: 100%;
		aspect-ratio: 1;
		display: flex; align-items: center; justify-content: center;
		background: color-mix(in oklch, var(--card-accent) 12%, var(--bg-elevated));
		font-weight: 800;
		font-size: 2rem;
		color: color-mix(in oklch, var(--card-accent) 60%, var(--text));
	}
	.recent-meta { padding: 0.55rem 0.7rem 0.7rem; }
	.recent-artist {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 0.15rem;
	}
	.recent-title {
		font-size: 0.85rem;
		font-weight: 600;
		line-height: 1.3;
	}

	/* CTA */
	.cta-wrap {
		max-width: 1100px;
		margin: 1rem auto 5rem;
		padding: 0 1.5rem;
		text-align: center;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.9rem 2rem;
		border: 1px solid var(--page-accent);
		border-radius: 100px;
		color: var(--page-accent);
		font-weight: 600;
		font-size: 0.95rem;
		letter-spacing: 0.03em;
		text-decoration: none;
		transition: background 0.2s;
	}
	.cta:hover {
		text-decoration: none;
		background: color-mix(in oklch, var(--page-accent) 12%, transparent);
	}
	.arrow { transition: transform 0.2s; }
	.cta:hover .arrow { transform: translateX(3px); }
</style>
