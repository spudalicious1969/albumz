<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { extractAccentColorFromImg } from '$lib/accent-color';
	import AlbumHero from '$lib/components/AlbumHero.svelte';
	import ExternalLinks from '$lib/components/ExternalLinks.svelte';
	import SortDropdown from '$lib/components/SortDropdown.svelte';
	import Tracklist from '$lib/components/Tracklist.svelte';
	import BackfillSuggestion from '$lib/components/BackfillSuggestion.svelte';
	import {
		formatDuration,
		formatTotalDuration,
		type TracklistResult,
		type TracklistSource
	} from '$lib/tracklist';
	import { mergeTags } from '$lib/tag-merge';
	import type { CoverResult } from '$lib/cover-types';
	import {
		groupResults,
		uniqueYears,
		uniqueLabels,
		uniqueBySource,
		LOOKUP_SOURCE_LABEL
	} from '$lib/lookup-grouping';
	import type { PageData, ActionData } from './$types';

	type LookupSuggestions = {
		tags: string[];
		label: string | null;
	};

	const TRACKLIST_SOURCE_LABEL: Record<TracklistSource, string> = {
		spotify: 'Spotify',
		deezer: 'Deezer',
		itunes: 'iTunes',
		musicbrainz: 'MusicBrainz',
		lastfm: 'Last.fm'
	};


	const formatOptions = [
		{ value: '', label: '—' },
		{ value: 'LP', label: 'LP' },
		{ value: 'CD', label: 'CD' },
		{ value: '7"', label: '7"' },
		{ value: '10"', label: '10"' },
		{ value: '12"', label: '12"' },
		{ value: 'Cassette', label: 'Cassette' },
		{ value: 'Digital', label: 'Digital' }
	];
	const ratingOptions = [
		{ value: '', label: '—' },
		{ value: '1', label: '★' },
		{ value: '2', label: '★★' },
		{ value: '3', label: '★★★' },
		{ value: '4', label: '★★★★' },
		{ value: '5', label: '★★★★★' }
	];

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const album = $derived(data.album);

	let editing = $state(false);
	let confirmingDelete = $state(false);
	let coverPickerOpen = $state(false);


	let coverSearching = $state(false);
	let coverResults = $state<CoverResult[]>([]);
	let pickedCoverUrl = $state('');
	let pickedAccent = $state('');

	// ── Look-up panel state (lives inside the edit form) ─────────────────
	// Bindable copies of the editable fields so a search result can update them
	// without losing whatever the user has typed elsewhere.
	let editArtist = $state(album.artist);
	let editTitle = $state(album.title);
	let editYear = $state<number | ''>(album.year ?? '');
	let editFormat = $state(album.format ?? '');
	let editRating = $state(album.rating != null ? String(album.rating) : '');
	let editLabel = $state(album.label ?? '');
	let editTags = $state(album.tags?.join(', ') ?? '');

	let lookupOpen = $state(false);
	let lookupSearching = $state(false);
	let lookupResults = $state<CoverResult[]>([]);
	const groupedResults = $derived(groupResults(lookupResults));
	let lookupSuggesting = $state(false);
	let lookupSuggestions = $state<LookupSuggestions | null>(null);
	let suggestionsEl = $state<HTMLDivElement | null>(null);
	// When a lookup pick fills in a cover, stage it here so the Save form picks it up
	let stagedCoverUrl = $state('');
	let stagedAccent = $state('');

	// ── Tracklist chooser state ──────────────────────────────────────────
	let tracklistLoading = $state(false);
	let tracklistCandidates = $state<TracklistResult[]>([]);
	let expandedSource = $state<TracklistSource | null>(null);
	let pinningSource = $state<TracklistSource | null>(null);
	let pinErrorMsg = $state<string | null>(null);
	let clearingPin = $state(false);
	// MusicBrainz-only: which release variants dropdown is open, and which
	// alternate is currently being fetched. Other sources fold variants into
	// one entry so they don't need this affordance.
	let mbAlternatesOpen = $state(false);
	let loadingAlternateMbid = $state<string | null>(null);
	// Currently-pinned source from the loaded album row (null if auto-pick).
	const pinnedSource = $derived<TracklistSource | null>(
		(album.tracklist as { source?: TracklistSource } | null | undefined)?.source ?? null
	);

	// Re-sync the edit-state vars if the underlying album changes (e.g. after Save invalidates)
	$effect(() => {
		editArtist = album.artist;
		editTitle = album.title;
		editYear = album.year ?? '';
		editFormat = album.format ?? '';
		editRating = album.rating != null ? String(album.rating) : '';
		editLabel = album.label ?? '';
		editTags = album.tags?.join(', ') ?? '';
	});

	// Visibility of suggestion rows — reactive to current form state so they
	// auto-hide when the user types a value in (or accepts a suggestion).
	// Tags: surface when the merged (existing + catalog + AI) set would add
	// at least one new tag beyond what's already on the album. Pre-filling
	// with the merged value means Accept preserves the user's current tags
	// instead of overwriting them — safe to surface even on already-tagged
	// albums.
	const currentTagArray = $derived(
		editTags.split(',').map((s: string) => s.trim()).filter(Boolean)
	);
	const mergedTagSuggestion = $derived(
		lookupSuggestions?.tags && lookupSuggestions.tags.length > 0
			? mergeTags(currentTagArray, lookupSuggestions.tags)
			: []
	);
	const showTagSuggestion = $derived(
		mergedTagSuggestion.length > currentTagArray.length
	);
	const showLabelSuggestion = $derived(
		!editLabel.trim() && !!lookupSuggestions?.label
	);

	function runLookup() {
		lookupSearching = true;
		lookupSuggesting = true;
		tracklistLoading = true;
		lookupResults = [];
		lookupSuggestions = null;
		tracklistCandidates = [];
		expandedSource = null;
		pinErrorMsg = null;

		const params = new URLSearchParams();
		if (editArtist.trim()) params.set('artist', editArtist.trim());
		if (editTitle.trim()) params.set('title', editTitle.trim());
		const qs = params.toString();

		// Three independent fetches, three independent loading states — each
		// section of the panel renders as soon as its data lands.
		fetch(`/api/covers/search?${qs}`)
			.then((r) => r.json())
			.then((p: { covers?: CoverResult[] }) => {
				lookupResults = p.covers ?? [];
			})
			.catch(() => {})
			.finally(() => {
				lookupSearching = false;
			});

		fetch(`/api/albums/lookup-suggestions?${qs}`)
			.then((r) => r.json())
			.then((p: LookupSuggestions) => {
				lookupSuggestions = p;
			})
			.catch(() => {})
			.finally(() => {
				lookupSuggesting = false;
			});

		fetch(`/api/albums/tracklist-candidates?${qs}`)
			.then((r) => r.json())
			.then((p: { candidates?: TracklistResult[] }) => {
				tracklistCandidates = p.candidates ?? [];
				mbAlternatesOpen = false;
			})
			.catch(() => {})
			.finally(() => {
				tracklistLoading = false;
			});
	}

	async function pinTracklist(candidate: TracklistResult) {
		if (!candidate.source) return;
		pinningSource = candidate.source;
		pinErrorMsg = null;
		try {
			const snapshot: { tracks: typeof candidate.tracks; source: TracklistSource; sourceId?: string } = {
				tracks: candidate.tracks,
				source: candidate.source
			};
			if (candidate.sourceId) snapshot.sourceId = candidate.sourceId;
			const res = await fetch(`/api/albums/${album.id}/apply-suggestion`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ field: 'tracklist', value: snapshot })
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(data?.message || `Pin failed (${res.status})`);
			}
			await invalidateAll();
		} catch (err) {
			pinErrorMsg = err instanceof Error ? err.message : 'Pin failed.';
		} finally {
			pinningSource = null;
		}
	}

	async function switchMBAlternate(mbid: string) {
		loadingAlternateMbid = mbid;
		pinErrorMsg = null;
		try {
			const res = await fetch(`/api/albums/tracklist-musicbrainz?mbid=${encodeURIComponent(mbid)}`);
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(data?.message || `Fetch failed (${res.status})`);
			}
			const fresh = (await res.json()) as TracklistResult;
			if (!fresh.tracks || fresh.tracks.length === 0) {
				throw new Error('That release has no tracks.');
			}
			// Preserve alternates list from the previous MB candidate so the user
			// can keep switching. Replace tracks/duration/sourceId in place.
			const idx = tracklistCandidates.findIndex((c) => c.source === 'musicbrainz');
			if (idx >= 0) {
				const prev = tracklistCandidates[idx];
				tracklistCandidates[idx] = {
					...fresh,
					source: 'musicbrainz',
					alternates: prev.alternates
				};
			}
			mbAlternatesOpen = false;
			expandedSource = 'musicbrainz';
		} catch (err) {
			pinErrorMsg = err instanceof Error ? err.message : 'Switch failed.';
		} finally {
			loadingAlternateMbid = null;
		}
	}

	async function clearTracklistPin() {
		clearingPin = true;
		pinErrorMsg = null;
		try {
			const res = await fetch(`/api/albums/${album.id}/apply-suggestion`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ field: 'tracklist', value: null })
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { message?: string } | null;
				throw new Error(data?.message || `Clear failed (${res.status})`);
			}
			await invalidateAll();
		} catch (err) {
			pinErrorMsg = err instanceof Error ? err.message : 'Clear failed.';
		} finally {
			clearingPin = false;
		}
	}

	function toggleExpand(source: TracklistSource | null) {
		if (!source) return;
		expandedSource = expandedSource === source ? null : source;
	}

	function applyLookup(result: CoverResult) {
		editArtist = result.artist || editArtist;
		editTitle = result.title || editTitle;
		if (result.year) editYear = result.year;
		// Fill label from the cover result too if label is currently blank.
		// (Spotify/MB hits typically have this; the user's already on the
		// "trust this result" path by clicking Use these details.)
		if (!editLabel.trim() && result.label) editLabel = result.label;
		// Auto-fill cover only if the album currently has none — preserves intentional covers
		if (!album.cover_url && result.url) {
			stagedCoverUrl = result.url;
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => { stagedAccent = extractAccentColorFromImg(img); };
			img.src = result.url;
		}
		// Only auto-close if there's nothing left to review. Otherwise keep
		// the panel open and nudge the suggestions section into view so the
		// user doesn't miss qwen's tag/label suggestions sitting below the fold.
		// Tracklist candidates count too — picking details shouldn't silently
		// abandon a tracklist-source decision the user is still making.
		const hasPending =
			lookupSuggesting ||
			showTagSuggestion ||
			showLabelSuggestion ||
			tracklistCandidates.length > 0;
		if (hasPending) {
			suggestionsEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		} else {
			lookupOpen = false;
		}
	}

	async function openCoverPicker() {
		coverPickerOpen = true;
		if (coverResults.length === 0) {
			coverSearching = true;
			try {
				const res = await fetch(
					`/api/covers/search?artist=${encodeURIComponent(album.artist)}&title=${encodeURIComponent(album.title)}`
				);
				const payload = await res.json();
				coverResults = payload.covers ?? [];
			} finally {
				coverSearching = false;
			}
		}
	}

	function pickCover(cover: CoverResult) {
		pickedCoverUrl = cover.url;
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => { pickedAccent = extractAccentColorFromImg(img); };
		img.src = cover.url;
	}
</script>

<svelte:head>
	<title>{album.artist} – {album.title} — albumz</title>
</svelte:head>

<div class="page" style={album.accent_color ? `--accent: ${album.accent_color}` : ''}>
	<header class="topbar">
		<a href={album.ownership === 'WANT' ? '/wantlist' : '/'} class="back">
			← {album.ownership === 'WANT' ? 'Wantlist' : 'Collection'}
		</a>
	</header>

	<AlbumHero {album} />

	<!-- Owner action row -->
	<section class="actions-row">
		<button type="button" class="btn-secondary" onclick={() => (editing = !editing)}>
			{editing ? 'Close editor' : 'Edit details'}
		</button>
		<button type="button" class="btn-secondary" onclick={openCoverPicker}>
			{album.cover_url ? 'Change cover' : 'Find a cover'}
		</button>
		<form method="POST" action="?/toggleFeatured" use:enhance style="display:inline">
			<button type="submit" class="btn-pill" class:is-featured={data.isFeatured}>
				{data.isFeatured ? '★ Featured' : '☆ Set as featured'}
			</button>
		</form>
	</section>

	{#if coverPickerOpen}
		<section class="picker">
			<header class="picker-header">
				<p class="eyebrow">Pick a cover</p>
				<button type="button" class="close" onclick={() => (coverPickerOpen = false)}>✕</button>
			</header>

			{#if coverSearching}
				<p class="muted">Searching…</p>
			{:else if coverResults.length === 0}
				<p class="muted">No matches found.</p>
			{:else}
				<div class="cover-grid">
					{#each coverResults as cover}
						<button
							type="button"
							class="cover-option"
							class:selected={pickedCoverUrl === cover.url}
							onclick={() => pickCover(cover)}
						>
							<img src={cover.url} alt="{cover.artist} – {cover.title}" loading="lazy" />
							<span class="cover-label">{cover.artist}<br />{cover.title}</span>
						</button>
					{/each}
				</div>

				<form
					method="POST"
					action="?/setCover"
					use:enhance={() => {
						return async ({ update }) => {
							await update({ reset: false });
							coverPickerOpen = false;
						};
					}}
				>
					<input type="hidden" name="cover_url" value={pickedCoverUrl} />
					<input type="hidden" name="accent_color" value={pickedAccent} />
					<div class="picker-actions">
						<button type="button" class="btn-ghost" onclick={() => (coverPickerOpen = false)}>Cancel</button>
						<button type="submit" class="btn-primary" disabled={!pickedCoverUrl}>Use this cover</button>
					</div>
				</form>
			{/if}
		</section>
	{/if}

	<ExternalLinks links={data.externalLinks} />

	<Tracklist
		tracks={data.tracklist.tracks}
		totalDuration={data.tracklist.totalDuration}
		source={data.tracklist.source}
	/>

	{#if editing}
		<section class="edit">
			<h2 class="section-title">Edit album</h2>

			<!-- Look up details — fills artist/title/year from a search result -->
			<div class="lookup">
				<button type="button" class="btn-secondary" onclick={() => { lookupOpen = !lookupOpen; if (lookupOpen && lookupResults.length === 0) runLookup(); }}>
					{lookupOpen ? 'Close lookup' : 'Look up details'}
				</button>
				{#if stagedCoverUrl}
					<span class="staged-pill">✓ New cover staged — save to apply</span>
				{/if}
			</div>

			{#if lookupOpen}
				<div class="lookup-panel">
					<p class="muted lookup-hint">Searches Spotify, iTunes, Last.fm, MusicBrainz, and Deezer using the current artist/title. Pick a result to fill in correct details.</p>
					<div class="lookup-search-row">
						<button type="button" class="btn-secondary" onclick={runLookup} disabled={lookupSearching}>
							{lookupSearching ? 'Searching…' : 'Search again'}
						</button>
					</div>
					{#if lookupSearching}
						<p class="muted">Searching…</p>
					{:else if groupedResults.length === 0}
						<p class="muted">No matches found.</p>
					{:else}
						<p class="muted lookup-hint">Click a source thumbnail to apply that source's details. Where sources disagree on year or label, the alternates are called out below the title.</p>
						<ul class="lookup-results">
							{#each groupedResults as group (group.artist + '::' + group.title)}
								{@const years = uniqueYears(group)}
								{@const labels = uniqueLabels(group)}
								<li class="result-group">
									<div class="group-header">
										<p class="result-artist">{group.artist}</p>
										<p class="result-title">{group.title}</p>
										{#if years.length > 1}
											<p class="result-detail">
												<span class="detail-label">Years:</span>
												{years.join(' · ')}
											</p>
										{:else if years.length === 1}
											<p class="result-detail">
												<span class="detail-label">Year:</span>
												{years[0]}
											</p>
										{/if}
										{#if labels.length > 1}
											<p class="result-detail">
												<span class="detail-label">Labels:</span>
												{labels.join(' · ')}
											</p>
										{:else if labels.length === 1}
											<p class="result-detail">
												<span class="detail-label">Label:</span>
												{labels[0]}
											</p>
										{/if}
									</div>
									<div class="source-strip">
										{#each uniqueBySource(group.sources) as src (src.url + '::' + src.source)}
											<button
												type="button"
												class="source-cover"
												onclick={() => applyLookup(src)}
												title="Apply details from {LOOKUP_SOURCE_LABEL[src.source] ?? src.source}{src.year ? ` (${src.year})` : ''}"
											>
												{#if src.url}
													<img src={src.url} alt="" loading="lazy" />
												{:else}
													<div class="src-no-thumb"></div>
												{/if}
												<span class="source-name">{LOOKUP_SOURCE_LABEL[src.source] ?? src.source}</span>
											</button>
										{/each}
									</div>
								</li>
							{/each}
						</ul>
					{/if}

					{#if lookupSuggesting && !lookupSuggestions}
						<p class="muted lookup-sug-loading">Looking up tags and label…</p>
					{:else if lookupSuggestions && (showTagSuggestion || showLabelSuggestion)}
						<div class="lookup-suggestions" bind:this={suggestionsEl}>
							<h3 class="lookup-suggestions-title">More suggestions</h3>
							{#if showTagSuggestion}
								<BackfillSuggestion
									field="tags"
									suggested={mergedTagSuggestion}
									onSave={(value) => {
										editTags = Array.isArray(value) ? value.join(', ') : value;
									}}
								/>
							{/if}
							{#if showLabelSuggestion}
								<BackfillSuggestion
									field="label"
									suggested={lookupSuggestions.label ?? ''}
									sourceLabel="AI"
									onSave={(value) => {
										editLabel = Array.isArray(value) ? value.join(', ') : value;
									}}
								/>
							{/if}
						</div>
					{/if}

					<div class="tracklist-chooser">
						<div class="tracklist-chooser-header">
							<h3 class="lookup-suggestions-title">Tracklist</h3>
							{#if pinnedSource}
								<span class="pinned-pill">
									Pinned: {TRACKLIST_SOURCE_LABEL[pinnedSource]}
								</span>
								<button
									type="button"
									class="btn-mini"
									onclick={clearTracklistPin}
									disabled={clearingPin}
								>
									{clearingPin ? 'Clearing…' : 'Use auto-pick'}
								</button>
							{:else}
								<span class="auto-pill">Auto-pick (longest wins)</span>
							{/if}
						</div>

						{#if pinErrorMsg}
							<p class="pin-error">{pinErrorMsg}</p>
						{/if}

						{#if tracklistLoading}
							<p class="muted lookup-sug-loading">Looking up tracklists…</p>
						{:else if tracklistCandidates.length === 0}
							<p class="muted lookup-sug-loading">No tracklist sources returned matches.</p>
						{:else}
							<ul class="tracklist-candidates">
								{#each tracklistCandidates as candidate (candidate.source)}
									{@const isExpanded = expandedSource === candidate.source}
									{@const isPinned = pinnedSource === candidate.source}
									{@const isPinning = pinningSource === candidate.source}
									{@const otherAlts =
										candidate.source === 'musicbrainz' && candidate.alternates
											? candidate.alternates.filter((a) => a.mbid !== candidate.sourceId)
											: []}
									<li class="tracklist-candidate" class:is-pinned={isPinned}>
										<button
											type="button"
											class="tracklist-row"
											onclick={() => toggleExpand(candidate.source)}
											aria-expanded={isExpanded}
										>
											<span class="caret">{isExpanded ? '▾' : '▸'}</span>
											<span class="tracklist-source">
												{candidate.source ? TRACKLIST_SOURCE_LABEL[candidate.source] : '—'}
											</span>
											<span class="tracklist-meta">
												{candidate.tracks.length} track{candidate.tracks.length === 1 ? '' : 's'}
												{#if candidate.totalDuration}
													· {formatTotalDuration(candidate.totalDuration)}
												{/if}
											</span>
										</button>
										<div class="tracklist-actions">
											{#if otherAlts.length > 0}
												<button
													type="button"
													class="btn-mini btn-alt-toggle"
													onclick={() => (mbAlternatesOpen = !mbAlternatesOpen)}
													aria-expanded={mbAlternatesOpen}
												>
													{mbAlternatesOpen ? '▴' : '▾'} {otherAlts.length} alternate{otherAlts.length === 1 ? '' : 's'}
												</button>
											{/if}
											{#if isPinned}
												<span class="pinned-marker">✓ Pinned</span>
											{:else}
												<button
													type="button"
													class="btn-mini btn-accept"
													onclick={() => pinTracklist(candidate)}
													disabled={isPinning || !candidate.source}
												>
													{isPinning ? 'Pinning…' : 'Accept'}
												</button>
											{/if}
										</div>
										{#if candidate.source === 'musicbrainz' && mbAlternatesOpen && otherAlts.length > 0}
											<ul class="mb-alternates">
												<li class="mb-alt-hint muted">Switch to a different release:</li>
												{#each otherAlts as alt (alt.mbid)}
													<li>
														<button
															type="button"
															class="mb-alt-row"
															onclick={() => switchMBAlternate(alt.mbid)}
															disabled={loadingAlternateMbid !== null}
														>
															<span class="mb-alt-label">{alt.label}</span>
															<span class="mb-alt-meta">
																{alt.trackCount} track{alt.trackCount === 1 ? '' : 's'}
															</span>
															{#if loadingAlternateMbid === alt.mbid}
																<span class="mb-alt-loading">Loading…</span>
															{/if}
														</button>
													</li>
												{/each}
											</ul>
										{/if}
										{#if isExpanded}
											<ol class="tracklist-tracks">
												{#each candidate.tracks as track (track.position)}
													<li class="tracklist-track">
														<span class="tt-pos">{track.position}</span>
														<span class="tt-name">{track.name}</span>
														<span class="tt-dur">
															{track.duration ? formatDuration(track.duration) : '—'}
														</span>
													</li>
												{/each}
											</ol>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{/if}

			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
						// Clear staged cover after save commits
						stagedCoverUrl = '';
						stagedAccent = '';
					};
				}}
			>
				{#if stagedCoverUrl}
					<input type="hidden" name="cover_url" value={stagedCoverUrl} />
					<input type="hidden" name="accent_color" value={stagedAccent} />
				{/if}

				<div class="field-grid">
					<label class="field">
						<span class="label">Artist *</span>
						<input type="text" name="artist" bind:value={editArtist} required />
					</label>
					<label class="field">
						<span class="label">Title *</span>
						<input type="text" name="title" bind:value={editTitle} required />
					</label>
					<label class="field">
						<span class="label">Year</span>
						<input type="number" name="year" min="1900" max="2099" bind:value={editYear} />
					</label>
					<div class="field">
						<span class="label">Format</span>
						<SortDropdown options={formatOptions} bind:value={editFormat} ariaLabel="Format" />
						<input type="hidden" name="format" value={editFormat} />
					</div>
					<label class="field">
						<span class="label">Label</span>
						<input type="text" name="label" bind:value={editLabel} />
					</label>
					<div class="field">
						<span class="label">Rating</span>
						<SortDropdown options={ratingOptions} bind:value={editRating} ariaLabel="Rating" />
						<input type="hidden" name="rating" value={editRating} />
					</div>
					<fieldset class="field">
						<legend class="label">Ownership</legend>
						<div class="radio-group">
							<label><input type="radio" name="ownership" value="OWN" checked={album.ownership === 'OWN'} /> Own</label>
							<label><input type="radio" name="ownership" value="WANT" checked={album.ownership === 'WANT'} /> Want</label>
						</div>
					</fieldset>
					<label class="field">
						<span class="label">Visibility</span>
						<label class="checkbox">
							<input type="checkbox" name="hidden" checked={album.hidden} />
							Hidden from public view
						</label>
					</label>
					<label class="field full">
						<span class="label">Tags <small>(comma-separated)</small></span>
						<input type="text" name="tags" bind:value={editTags} />
					</label>
					<label class="field full">
						<span class="label">Notes</span>
						<textarea
							name="notes"
							rows="3"
							placeholder="What this record means to you. Links: [text](https://…)"
						>{album.notes ?? ''}</textarea>
					</label>
				</div>

				{#if (form as { error?: string })?.error}
					<p class="error">{(form as { error?: string }).error}</p>
				{:else if (form as { saved?: boolean })?.saved}
					<p class="success">Saved.</p>
				{/if}

				<div class="form-actions">
					<button type="button" class="btn-ghost" onclick={() => (editing = false)}>Close</button>
					<button type="submit" class="btn-primary">Save changes</button>
				</div>
			</form>
		</section>
	{/if}

	<section class="danger">
		{#if !confirmingDelete}
			<button type="button" class="btn-danger" onclick={() => (confirmingDelete = true)}>
				Delete album
			</button>
		{:else}
			<form method="POST" action="?/delete" use:enhance>
				<p>Delete <strong>{album.title}</strong> from your collection?</p>
				<div class="form-actions">
					<button type="button" class="btn-ghost" onclick={() => (confirmingDelete = false)}>Cancel</button>
					<button type="submit" class="btn-danger">Yes, delete</button>
				</div>
			</form>
		{/if}
	</section>
</div>

<style>
	.page {
		position: relative;
		min-height: 100dvh;
		padding-bottom: 4rem;
		/* The album's own accent_color overrides --accent for this page, so the
		   entire room — buttons, pills, glows — breathes in the album's color
		   instead of the brand red. Semantic states (danger, success, error)
		   stay fixed via their own hardcoded color values. */
		transition: --accent 1.5s ease-out;
	}
	@media (prefers-reduced-motion: reduce) {
		.page { transition: none; }
	}

	.topbar {
		max-width: 980px;
		margin: 0 auto;
		padding: 1.5rem 1.5rem 0;
	}
	.back { font-size: 0.85rem; color: var(--text-muted); }

	.actions-row {
		max-width: 980px;
		margin: 0 auto 2rem;
		padding: 0 1.5rem;
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.btn-secondary {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid color-mix(in oklch, var(--text-muted) 28%, transparent);
		color: var(--text-muted);
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.2s, border-color 0.2s, color 0.2s;
	}
	.btn-secondary:hover {
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		border-color: color-mix(in oklch, var(--accent) 45%, var(--border));
		color: var(--text);
	}
	.btn-pill {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: 100px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		font-family: inherit;
	}
	.btn-pill:hover { color: var(--text); border-color: var(--accent); }
	.btn-pill.is-featured {
		color: var(--accent);
		border-color: var(--accent);
		background: color-mix(in oklch, var(--accent) 10%, transparent);
	}

	.section-title {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 1rem;
	}

	.edit, .danger {
		max-width: 980px;
		margin: 0 auto 2rem;
		padding: 0 1.5rem;
	}
	.edit form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
	}

	.lookup {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-bottom: 0.85rem;
	}
	.staged-pill {
		font-size: 0.78rem;
		color: var(--accent);
		font-weight: 600;
	}
	/* Lookup panel: open content area, not a stacked-modal container.
	   The form below has its own surface+border for grouping fields; the
	   lookup is review-of-suggestions, which reads more naturally as inline
	   content with a divider above and below. */
	.lookup-panel {
		padding: 0.5rem 0 1.25rem;
		margin-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}
	.lookup-hint {
		font-size: 0.8rem;
		margin-bottom: 0.75rem;
	}
	.lookup-sug-loading {
		font-size: 0.8rem;
		margin-top: 0.75rem;
	}
	.lookup-suggestions {
		margin-top: 1rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--border);
	}
	.lookup-suggestions-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
		margin: 0 0 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.lookup-search-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}
	.lookup-results {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		max-height: 460px;
		overflow-y: auto;
		padding: 0;
		margin: 0;
	}

	/* Grouped result: one entry per album (deduped across sources). Header
	   carries the shared identity; year/label disagreements are surfaced
	   below the title; the source strip shows each source's cover as the
	   apply affordance. */
	.result-group {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.5rem 0.25rem;
	}
	.group-header { min-width: 0; }
	.result-artist {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--text);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.result-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1.25;
		margin-top: 0.1rem;
	}
	.result-detail {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-top: 0.2rem;
	}
	.detail-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		opacity: 0.7;
		margin-right: 0.35rem;
	}

	.source-strip {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	/* Each source-cover is the apply affordance. Hover responds with a lift +
	   accent glow, same atmospheric-response language as album cards. */
	.source-cover {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: transform 0.18s;
	}
	.source-cover img,
	.source-cover .src-no-thumb {
		width: 72px;
		height: 72px;
		object-fit: cover;
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		transition: box-shadow 0.18s;
	}
	.src-no-thumb {
		background: var(--surface);
	}
	.source-cover:hover {
		transform: translateY(-2px);
	}
	.source-cover:hover img,
	.source-cover:hover .src-no-thumb {
		box-shadow:
			var(--shadow-lift),
			0 0 24px color-mix(in oklch, var(--accent) 35%, transparent);
	}
	.source-name {
		font-size: 0.7rem;
		color: var(--text-muted);
		letter-spacing: 0.04em;
		transition: color 0.18s;
	}
	.source-cover:hover .source-name {
		color: var(--text);
	}

	/* ── Tracklist chooser ─────────────────────────────────────────── */
	.tracklist-chooser {
		margin-top: 1rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--border);
	}
	.tracklist-chooser-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.tracklist-chooser-header .lookup-suggestions-title {
		margin: 0;
	}
	.pinned-pill {
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent, oklch(70% 0.15 220)) 22%, transparent);
		color: var(--text);
		letter-spacing: 0.03em;
	}
	.auto-pill {
		font-size: 0.72rem;
		color: var(--text-muted);
		font-style: italic;
	}
	.pin-error {
		font-size: 0.8rem;
		color: oklch(55% 0.2 25);
		margin: 0 0 0.5rem;
	}
	.tracklist-candidates {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0;
		margin: 0;
	}
	.tracklist-candidate {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.35rem;
		border-radius: 6px;
		transition: background 0.15s, border-color 0.15s;
	}
	.tracklist-candidate:hover {
		background: color-mix(in oklch, var(--accent) 6%, transparent);
	}
	.tracklist-candidate.is-pinned {
		background: color-mix(in oklch, var(--accent) 10%, transparent);
		box-shadow: inset 3px 0 0 var(--accent);
		padding-left: 0.65rem;
	}
	.tracklist-row {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		color: var(--text);
		font-family: inherit;
		font-size: inherit;
		min-width: 0;
	}
	.tracklist-row:hover .tracklist-source {
		color: var(--accent, var(--text));
	}
	.caret {
		font-size: 0.8rem;
		color: var(--text-muted);
		width: 0.9rem;
		display: inline-block;
	}
	.tracklist-source {
		font-weight: 600;
		font-size: 0.88rem;
		letter-spacing: 0.02em;
		transition: color 0.1s;
	}
	.tracklist-meta {
		font-size: 0.78rem;
		color: var(--text-muted);
	}
	.tracklist-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.pinned-marker {
		font-size: 0.78rem;
		font-weight: 600;
		color: oklch(55% 0.17 145);
	}
	.tracklist-tracks {
		grid-column: 1 / -1;
		list-style: none;
		padding: 0.55rem 0 0.25rem;
		margin: 0.5rem 0 0;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.tracklist-track {
		display: grid;
		grid-template-columns: 1.8rem 1fr auto;
		gap: 0.6rem;
		align-items: baseline;
		font-size: 0.85rem;
		padding: 0.15rem 0;
	}
	.tt-pos {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		font-size: 0.78rem;
		text-align: right;
	}
	.tt-name { color: var(--text); }
	.tt-dur {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.btn-mini {
		font-size: 0.78rem;
		padding: 0.25rem 0.65rem;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		border-radius: 4px;
		cursor: pointer;
		font-family: inherit;
	}
	.btn-mini:hover { background: color-mix(in oklch, var(--text) 8%, transparent); }
	.btn-mini:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-accept { border-color: oklch(55% 0.17 145); color: oklch(55% 0.17 145); }
	.btn-alt-toggle { color: var(--text-muted); }

	.mb-alternates {
		grid-column: 1 / -1;
		list-style: none;
		padding: 0.4rem 0 0.2rem;
		margin: 0.5rem 0 0;
		border-top: 1px dashed var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.mb-alt-hint {
		font-size: 0.75rem;
		padding: 0.15rem 0.35rem 0.3rem;
	}
	.mb-alt-row {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		width: 100%;
		padding: 0.35rem 0.45rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.82rem;
		color: var(--text);
		text-align: left;
	}
	.mb-alt-row:hover {
		background: color-mix(in oklch, var(--text) 6%, transparent);
		border-color: var(--border);
	}
	.mb-alt-row:disabled { opacity: 0.5; cursor: not-allowed; }
	.mb-alt-label { flex: 1; }
	.mb-alt-meta {
		color: var(--text-muted);
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}
	.mb-alt-loading {
		color: var(--text-muted);
		font-size: 0.75rem;
		font-style: italic;
	}

	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.field { display: flex; flex-direction: column; gap: 0.35rem; border: none; padding: 0; margin: 0; }
	.field.full { grid-column: 1 / -1; }
	.label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
	.label small { font-weight: 400; text-transform: none; letter-spacing: 0; }
	.field input, .field select, .field textarea {
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
		font-family: inherit;
	}
	.field textarea { resize: vertical; }
	/* Notes is content, not metadata — style the textarea to feel like writing
	   in the read-view note panel: accent left border, soft fill, italic. */
	.field textarea[name="notes"] {
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		padding: 0.85rem 1rem;
		font-style: italic;
		line-height: 1.5;
		min-height: 4.5rem;
	}
	.field textarea[name="notes"]::placeholder { font-style: italic; }
	.field :global(.sort-group) { display: flex; }
	.field :global(.dropdown) { flex: 1; display: block; }
	.field :global(.trigger) {
		width: 100%;
		justify-content: space-between;
		padding: 0.55rem 0.75rem;
		background: var(--bg-elevated);
		font-size: 1rem;
		font-weight: 400;
	}
	.field :global(.menu) { left: 0; right: auto; min-width: 100%; }
	.radio-group { display: flex; gap: 1.25rem; align-items: center; padding-top: 0.3rem; }
	.radio-group label, .checkbox {
		display: flex; align-items: center; gap: 0.4rem;
		font-size: 0.9rem; cursor: pointer;
	}
	@media (max-width: 600px) {
		.field-grid { grid-template-columns: 1fr; }
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}
	.btn-primary {
		padding: 0.6rem 1.5rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
	.btn-ghost {
		padding: 0.6rem 1rem;
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius);
		cursor: pointer;
		font-family: inherit;
	}
	.btn-danger {
		padding: 0.5rem 1rem;
		background: transparent;
		color: color-mix(in oklch, oklch(60% 0.22 25) 55%, var(--text-muted));
		border: 1px solid color-mix(in oklch, oklch(60% 0.22 25) 22%, var(--border));
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
		font-family: inherit;
		transition: color 0.2s, border-color 0.2s, background 0.2s;
	}
	.btn-danger:hover {
		color: oklch(60% 0.22 25);
		border-color: color-mix(in oklch, oklch(60% 0.22 25) 55%, var(--border));
		background: oklch(60% 0.22 25 / 0.08);
	}

	.danger { margin-top: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--border); max-width: 980px; }
	.danger p { color: var(--text-muted); margin-bottom: 1rem; }

	.error { color: oklch(55% 0.22 25); font-size: 0.85rem; margin-top: 0.5rem; }
	.success { color: oklch(55% 0.15 150); font-size: 0.85rem; margin-top: 0.5rem; }

	.picker {
		max-width: 980px;
		margin: 0 auto 2rem;
		padding: 1.25rem 1.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.picker-header {
		display: flex; justify-content: space-between; align-items: center;
		margin-bottom: 0.85rem;
	}
	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.close {
		background: none; border: none; color: var(--text-muted);
		font-size: 1.1rem; cursor: pointer;
	}
	.muted { color: var(--text-muted); }
	.cover-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	.cover-option {
		border: 2px solid transparent;
		border-radius: var(--radius);
		background: var(--bg-elevated);
		cursor: pointer;
		padding: 0;
		overflow: hidden;
	}
	.cover-option img { width: 100%; aspect-ratio: 1; object-fit: cover; }
	.cover-label {
		display: block;
		font-size: 0.62rem;
		padding: 0.25rem 0.35rem;
		color: var(--text-muted);
		line-height: 1.3;
	}
	.cover-option.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.picker-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1rem;
	}
</style>
