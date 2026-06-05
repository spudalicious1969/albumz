// Bulk metadata backfill — fills missing year, label, tags, and cover_url
// across a user's collection. Only writes to empty fields; never overwrites.
// Leaves user-curated fields alone: ownership, format, notes, rating, hidden,
// discogs_id, accent_color (re-derived from cover_url on render).
//
// Sources reused from per-album lookup:
//   - year/label/cover: runDiscovery → Spotify/iTunes/Deezer/MB/LFM (scored)
//   - tags: Discogs release-level styles+genres first (curated, album-specific),
//          Last.fm artist-tag cache as fallback when Discogs has no match.

import type { SupabaseClient } from '@supabase/supabase-js';
import { runDiscovery } from './album-search.server';
import { getArtistTopTagsBatch } from './lastfm.server';
import { fetchDiscogsTagsForAlbum } from './discogs-tags.server';

const TAGS_PER_ALBUM_CAP = 8;

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
	}>;
};

function needsAnything(a: AlbumRow): boolean {
	return (
		a.year === null ||
		!a.label ||
		(a.tags?.length ?? 0) === 0 ||
		!a.cover_url
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
		if ((a.tags?.length ?? 0) === 0) artistsNeedingTags.add(artistKey(a.artist));
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
		const wantsTags = (a.tags?.length ?? 0) === 0;

		// Discogs-style lookup only fires when a non-tag field is missing — saves
		// API roundtrips for albums whose only gap is tags.
		const needsLookup = wantsYear || wantsLabel || wantsCover;
		if (needsLookup) {
			if (wantsYear) attempted.years++;
			if (wantsLabel) attempted.labels++;
			if (wantsCover) attempted.covers++;
			try {
				const results = await runDiscovery(a.artist, a.title);
				const top = results[0];
				if (top) {
					if (wantsYear && typeof top.year === 'number') {
						updates.year = top.year;
						filled.years++;
					}
					if (wantsLabel && top.label) {
						updates.label = top.label;
						filled.labels++;
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

		if (wantsTags) {
			attempted.tagSets++;
			// Discogs first — release-level style+genre, curated. Falls back to
			// Last.fm's artist-level tags from the pre-batched cache.
			let tags = await fetchDiscogsTagsForAlbum(a.artist, a.title);
			if (tags.length === 0) {
				tags = tagMap.get(artistKey(a.artist)) ?? [];
			}
			if (tags.length > 0) {
				updates.tags = tags.slice(0, TAGS_PER_ALBUM_CAP);
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

		// Anything still empty after the pass — surface so the owner can pick
		// it up by hand.
		const remaining: MissingField[] = [];
		if (wantsYear && updates.year === undefined) remaining.push('year');
		if (wantsLabel && updates.label === undefined) remaining.push('label');
		if (wantsTags && updates.tags === undefined) remaining.push('tags');
		if (wantsCover && updates.cover_url === undefined) remaining.push('cover');
		if (remaining.length > 0) {
			stillMissing.push({
				id: a.id,
				artist: a.artist,
				title: a.title,
				missingFields: remaining
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
