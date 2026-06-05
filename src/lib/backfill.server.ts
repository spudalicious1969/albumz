// Bulk metadata backfill — fills missing year, label, tags, and cover_url
// across a user's collection. Only writes to empty fields; never overwrites.
// Leaves user-curated fields alone: ownership, format, notes, rating, hidden,
// discogs_id, accent_color (re-derived from cover_url on render).
//
// Sources reused from per-album lookup:
//   - year/label/cover: runDiscovery → Spotify/iTunes/Deezer/MB/LFM (scored)
//   - tags: getArtistTopTagsBatch (Last.fm artist tags via local cache)

import type { SupabaseClient } from '@supabase/supabase-js';
import { runDiscovery } from './album-search.server';
import { getArtistTopTagsBatch } from './lastfm.server';

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

export type BackfillSummary = {
	scanned: number;
	affected: number;
	filledYears: number;
	filledLabels: number;
	filledTagSets: number;
	filledCovers: number;
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

	let filledYears = 0;
	let filledLabels = 0;
	let filledTagSets = 0;
	let filledCovers = 0;
	let affected = 0;

	for (const a of candidates) {
		const updates: Record<string, unknown> = {};

		const needsLookup = a.year === null || !a.label || !a.cover_url;
		if (needsLookup) {
			try {
				const results = await runDiscovery(a.artist, a.title);
				const top = results[0];
				if (top) {
					if (a.year === null && typeof top.year === 'number') {
						updates.year = top.year;
						filledYears++;
					}
					if (!a.label && top.label) {
						updates.label = top.label;
						filledLabels++;
					}
					if (!a.cover_url && top.url) {
						updates.cover_url = top.url;
						// accent_color is derived from cover_url; clear it so the next
						// render picks up a fresh accent for the new cover.
						updates.accent_color = null;
						filledCovers++;
					}
				}
			} catch {
				// best-effort: skip this album's lookup failure, keep going
			}
		}

		if ((a.tags?.length ?? 0) === 0) {
			const tags = tagMap.get(artistKey(a.artist)) ?? [];
			if (tags.length > 0) {
				updates.tags = tags.slice(0, TAGS_PER_ALBUM_CAP);
				filledTagSets++;
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
	}

	return {
		scanned: candidates.length,
		affected,
		filledYears,
		filledLabels,
		filledTagSets,
		filledCovers
	};
}
