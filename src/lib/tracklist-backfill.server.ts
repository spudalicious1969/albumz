// Bulk tracklist backfill — pins a tracklist snapshot on every album that
// doesn't have one yet. The counterpart to metadata backfill (backfill.server)
// and the cover healer (cover-refresh.server), aimed at the `tracklist` jsonb.
//
// Only fills empty: albums where `tracklist` is null. A snapshot the user pinned
// by hand via the lookup-panel chooser is left untouched — same "never overwrite
// curated fields" rule the metadata backfill follows.
//
// Per album it runs the same resolver the album page and chooser use
// (fetchTracklist → Spotify/Deezer/iTunes/MusicBrainz/Last.fm in parallel,
// most-tracks wins). A non-empty result is stored as { tracks, source,
// sourceId? } — byte-for-byte the shape a hand-pinned snapshot takes (see
// apply-suggestion's parseTracklistSnapshot), so the album page and any future
// track search treat backfilled and curated tracklists identically.
//
// Why this exists: tracklist coverage across the collection is ~1% (snapshots
// only ever got written when someone manually pinned one). Track-aware search
// is only worth building once most albums actually carry a tracklist; this is
// the one-time pass that gets coverage there.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTracklist } from './tracklist.server';

export type TracklistBackfillSummary = {
	scanned: number; // albums with no snapshot that we attempted
	filled: number; // snapshots written
	tracksAdded: number; // total tracks pinned across all filled albums
	stillEmpty: Array<{ id: string; artist: string; title: string }>;
};

type Row = { id: string; artist: string; title: string };

// fetchTracklist fans out to five sources per album, so keep a few albums in
// flight at once — but stay gentle on the rate-limited ones (MusicBrainz asks
// for ~1 req/s). A modest pool balances throughput against being a good
// citizen; when a throttled source returns empty, pick-longest just takes
// whichever other source answered.
const CONCURRENCY = 3;

async function mapPool<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const idx = next++;
			out[idx] = await fn(items[idx]);
		}
	});
	await Promise.all(workers);
	return out;
}

export async function backfillTracklists(
	supabase: SupabaseClient,
	userId: string
): Promise<TracklistBackfillSummary> {
	// Both owned and wantlist albums — a tracklist is worth having on either,
	// and track search will want to reach into both lists.
	const { data, error: loadErr } = await supabase
		.from('albums')
		.select('id, artist, title')
		.eq('user_id', userId)
		.is('tracklist', null);
	if (loadErr) throw new Error(loadErr.message);

	const rows = (data ?? []) as Row[];

	let filled = 0;
	let tracksAdded = 0;
	const stillEmpty: TracklistBackfillSummary['stillEmpty'] = [];

	await mapPool(rows, CONCURRENCY, async (a) => {
		try {
			const result = await fetchTracklist(a.artist, a.title);
			if (result.tracks.length > 0 && result.source) {
				// Store the curated-snapshot shape: tracks + source (+ sourceId when
				// the source identifies the underlying release, i.e. MusicBrainz).
				// Deliberately omit totalDuration (recomputed on read) and alternates
				// (chooser-only) so a backfilled snapshot is indistinguishable from a
				// hand-pinned one.
				const snapshot: { tracks: typeof result.tracks; source: string; sourceId?: string } = {
					tracks: result.tracks,
					source: result.source
				};
				if (result.sourceId) snapshot.sourceId = result.sourceId;

				const { error: upErr } = await supabase
					.from('albums')
					.update({ tracklist: snapshot })
					.eq('id', a.id)
					.eq('user_id', userId);
				if (!upErr) {
					filled++;
					tracksAdded += result.tracks.length;
					return;
				}
			}
		} catch {
			// best-effort: one album's lookup/write failure shouldn't abort the pass
		}
		stillEmpty.push({ id: a.id, artist: a.artist, title: a.title });
	});

	stillEmpty.sort((x, y) => x.artist.localeCompare(y.artist) || x.title.localeCompare(y.title));

	return { scanned: rows.length, filled, tracksAdded, stillEmpty };
}
