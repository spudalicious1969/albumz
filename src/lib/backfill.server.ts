// Bulk metadata backfill — fills missing year, label, tags, and cover_url
// across a user's collection. Only writes to empty fields; never overwrites.
// Leaves user-curated fields alone: ownership, format, notes, rating, hidden,
// discogs_id, accent_color (re-derived from cover_url on render).
//
// Sources reused from per-album lookup:
//   - year/cover: runDiscovery → Spotify/iTunes/Deezer/MB/LFM (scored)
//   - label + tags: one Discogs lookup per album (fetchDiscogsMetaForAlbum)
//          shared between both. Label is Discogs's first listed label (the
//          primary release label); tags are its release-level styles+genres,
//          merged with the Last.fm artist-tag cache, deduped case-insensitively.
//          Discogs ordering wins so curated styles surface first. Both are
//          catalog sources — safe to auto-write.
//   - tags + label final fallback: qwen3.5 (Ollama). Suggestions only — never
//          auto-written. Surfaced in the recap with Accept/Edit/Skip review.

import type { SupabaseClient } from '@supabase/supabase-js';
import { runDiscovery } from './album-search.server';
import { topConfidentCover } from './cover-search';
import { fetchAlbumTopTags, getArtistTopTagsBatch } from './lastfm.server';
import { fetchDiscogsMetaForAlbum } from './discogs-tags.server';
import { suggestMetadata, type AlbumSuggestion } from './qwen-suggest.server';
import { mergeTags } from './tag-merge';

const TAGS_PER_ALBUM_CAP = 8;
// Albums at or below this tag count are considered "thin" and get enriched
// from catalog sources (existing tags preserved via mergeTags). Anything
// above this is treated as deliberately curated and left alone.
const THIN_TAGS_THRESHOLD = 2;

type AlbumRow = {
	id: string;
	artist: string;
	title: string;
	year: number | null;
	label: string | null;
	tags: string[];
	cover_url: string | null;
};

export type MissingField = 'year' | 'label' | 'tags' | 'cover';

export type BackfillSummary = {
	scanned: number;
	affected: number;
	attempted: { years: number; labels: number; tagSets: number; covers: number };
	filled: { years: number; labels: number; tagSets: number; covers: number };
	stillMissing: Array<{
		id: string;
		artist: string;
		title: string;
		missingFields: MissingField[];
		// AI-suggested values for tags/label when real catalogs came up empty.
		// null when qwen returned NONE (or for fields we don't suggest on:
		// year/cover are catalog-only).
		suggestion: AlbumSuggestion | null;
	}>;
};

function needsAnything(a: AlbumRow): boolean {
	return (
		a.year === null || !a.label || (a.tags?.length ?? 0) <= THIN_TAGS_THRESHOLD || !a.cover_url
	);
}

export async function backfillMissingMetadata(
	supabase: SupabaseClient,
	userId: string
): Promise<BackfillSummary> {
	const { data: rows, error: loadErr } = await supabase
		.from('albums')
		.select('id, artist, title, year, label, tags, cover_url')
		.eq('user_id', userId);
	if (loadErr) throw new Error(loadErr.message);

	const albums = (rows ?? []) as AlbumRow[];
	const candidates = albums.filter(needsAnything);

	// Pre-batch the artist-tags pull so repeated artists hit the local cache
	// once instead of N times. getArtistTopTagsBatch fills the cache for any
	// uncached artists in one Last.fm round-trip.
	const artistKey = (s: string) => s.toLowerCase().trim();
	const artistsNeedingTags = new Set<string>();
	for (const a of candidates) {
		if ((a.tags?.length ?? 0) <= THIN_TAGS_THRESHOLD) artistsNeedingTags.add(artistKey(a.artist));
	}
	const tagMap =
		artistsNeedingTags.size > 0
			? await getArtistTopTagsBatch(supabase, Array.from(artistsNeedingTags))
			: new Map<string, string[]>();

	const attempted = { years: 0, labels: 0, tagSets: 0, covers: 0 };
	const filled = { years: 0, labels: 0, tagSets: 0, covers: 0 };
	const stillMissing: BackfillSummary['stillMissing'] = [];
	let affected = 0;

	for (const a of candidates) {
		const updates: Record<string, unknown> = {};

		const wantsYear = a.year === null;
		const wantsLabel = !a.label;
		const wantsCover = !a.cover_url;
		const existingTagCount = a.tags?.length ?? 0;
		const wantsTags = existingTagCount <= THIN_TAGS_THRESHOLD;
		const tagsEmpty = existingTagCount === 0;

		// Cover-source lookup (year + cover) only fires when one of those is
		// missing — saves API roundtrips for albums whose only gaps are
		// label/tags, which Discogs handles separately below.
		if (wantsYear || wantsCover) {
			if (wantsYear) attempted.years++;
			if (wantsCover) attempted.covers++;
			try {
				const results = await runDiscovery(a.artist, a.title);
				// Only trust the top hit if it clears the confidence floor — both
				// year and cover come from the same result row, so a wrong-artist
				// match would poison both.
				const top = topConfidentCover(results, a.artist, a.title);
				if (top) {
					if (wantsYear && typeof top.year === 'number') {
						updates.year = top.year;
						filled.years++;
					}
					if (wantsCover && top.url) {
						updates.cover_url = top.url;
						// accent_color is derived from cover_url; clear it so the next
						// render picks up a fresh accent for the new cover.
						updates.accent_color = null;
						filled.covers++;
					}
				}
			} catch {
				// best-effort: skip this album's lookup failure, keep going
			}
		}

		// Label and tags both come from Discogs — fetch once and share. (Cover
		// sources don't carry a label, which is why label can't ride on the
		// runDiscovery top hit above.) Returns empty/null on failure.
		const discogsMeta =
			wantsLabel || wantsTags ? await fetchDiscogsMetaForAlbum(a.artist, a.title) : null;

		if (wantsLabel) {
			attempted.labels++;
			if (discogsMeta?.label) {
				updates.label = discogsMeta.label;
				filled.labels++;
			}
		}

		if (wantsTags) {
			attempted.tagSets++;
			// Merge existing tags + Discogs release-level styles + Last.fm's
			// album-level tags + Last.fm's artist-level tags from the
			// pre-batched cache. Existing tags lead the merge so the user's
			// curated picks (e.g. "New Wave") set the canonical casing and
			// aren't lost. Album-level Last.fm tags are the richest source
			// for record-specific genres (post-punk, dance-punk, art rock)
			// that artist-level tags miss. Previously a strict fallback that
			// only fired when tags were completely empty; now also enriches
			// "thin" albums (1-2 tags) so single-tag results like the B-52s
			// get fleshed out without losing the original.
			const lfmAlbumTags = await fetchAlbumTopTags(a.artist, a.title);
			const lfmArtistTags = tagMap.get(artistKey(a.artist)) ?? [];
			const merged = mergeTags(
				a.tags ?? [],
				discogsMeta?.tags ?? [],
				lfmAlbumTags,
				lfmArtistTags
			).slice(0, TAGS_PER_ALBUM_CAP);
			if (merged.length > existingTagCount) {
				updates.tags = merged;
				filled.tagSets++;
			}
		}

		if (Object.keys(updates).length > 0) {
			const { error: upErr } = await supabase
				.from('albums')
				.update(updates)
				.eq('id', a.id)
				.eq('user_id', userId);
			if (!upErr) affected++;
		}

		// Anything still unfilled after the pass — surface so the owner can see
		// which albums came up short and pick them up by hand (or via qwen's
		// suggestion for tags/label). We list *every* gap that didn't get
		// filled, including thin-tag albums that the catalog couldn't enrich —
		// otherwise they vanish from the recap entirely and "scanned 2, updated
		// 0" points at nothing the user can click.
		const remaining: MissingField[] = [];
		if (wantsYear && updates.year === undefined) remaining.push('year');
		if (wantsLabel && updates.label === undefined) remaining.push('label');
		if (wantsTags && updates.tags === undefined) remaining.push('tags');
		if (wantsCover && updates.cover_url === undefined) remaining.push('cover');

		// qwen tag-suggestions only fire when tags are *truly empty* — thin-tag
		// enrichment is a catalog-only operation, and we don't want AI noise on
		// albums that already have a curated start. Those still appear in the
		// list above (so they're findable), just without a suggestion.
		let suggestion: AlbumSuggestion | null = null;
		const needsTagSuggestion = tagsEmpty && updates.tags === undefined;
		const needsLabelSuggestion = remaining.includes('label');
		if (needsTagSuggestion || needsLabelSuggestion) {
			const raw = await suggestMetadata(a.artist, a.title);
			const tagSug = needsTagSuggestion ? raw.tags : null;
			const labelSug = needsLabelSuggestion ? raw.label : null;
			if (tagSug || labelSug) {
				// Cap suggested tags the same as catalog-sourced ones.
				suggestion = {
					tags: tagSug ? tagSug.slice(0, TAGS_PER_ALBUM_CAP) : null,
					label: labelSug
				};
			}
		}

		if (remaining.length > 0) {
			stillMissing.push({
				id: a.id,
				artist: a.artist,
				title: a.title,
				missingFields: remaining,
				suggestion
			});
		}
	}

	stillMissing.sort((a, b) => {
		const byArtist = a.artist.localeCompare(b.artist);
		return byArtist !== 0 ? byArtist : a.title.localeCompare(b.title);
	});

	return {
		scanned: candidates.length,
		affected,
		attempted,
		filled,
		stillMissing
	};
}
