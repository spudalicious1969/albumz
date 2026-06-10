// Shared tracklist types + formatters. Browser-safe (no env imports).
// Server-side fetch lives in tracklist.server.ts.

export type Track = {
	position: number;
	name: string;
	duration: number | null;
};

export type TracklistSource = 'spotify' | 'lastfm' | 'deezer' | 'itunes' | 'musicbrainz';

// One of the alternate MusicBrainz releases for the same artist+album search.
// Only populated when source='musicbrainz'. Lets the user switch between
// e.g. "CD" and "EP+Demo" pressings of the same record without round-tripping
// through musicbrainz.org to find an MBID.
export type MBAlternate = {
	mbid: string;
	label: string;
	trackCount: number;
};

export type TracklistResult = {
	tracks: Track[];
	source: TracklistSource | null;
	totalDuration: number | null;
	// sourceId identifies which underlying record at the source the tracks came
	// from. Currently only meaningful for MusicBrainz (the release MBID); other
	// sources collapse variants into one entry so the field stays unset.
	sourceId?: string | null;
	alternates?: MBAlternate[];
};

/**
 * Multi-disc releases come back from catalog sources (and live in snapshots
 * saved before this landed) with track positions restarting at 1 per disc.
 * Renumber sequentially when positions aren't unique so the UI shows 1..N
 * and consumers can safely use position as a key.
 */
export function renumberIfDuplicates(tracks: Track[]): Track[] {
	const seen = new Set<number>();
	for (const t of tracks) {
		if (seen.has(t.position)) {
			return tracks.map((track, i) => ({ ...track, position: i + 1 }));
		}
		seen.add(t.position);
	}
	return tracks;
}

export function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTotalDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

/**
 * Promote a stored tracklist snapshot (jsonb on the album row) into the
 * TracklistResult shape the UI expects. Computes totalDuration on the fly
 * so we never have to migrate stored snapshots if the format gains fields.
 * Returns null if the value isn't a valid snapshot.
 */
export function snapshotToResult(raw: unknown): TracklistResult | null {
	if (!raw || typeof raw !== 'object') return null;
	const v = raw as { tracks?: unknown; source?: unknown; sourceId?: unknown };
	if (!Array.isArray(v.tracks) || v.tracks.length === 0) return null;
	if (typeof v.source !== 'string') return null;

	const tracks = renumberIfDuplicates(v.tracks as Track[]);
	const totalDuration = tracks.reduce((sum, t) => (t.duration ? sum + t.duration : sum), 0);
	return {
		tracks,
		source: v.source as TracklistSource,
		totalDuration: totalDuration > 0 ? totalDuration : null,
		sourceId: typeof v.sourceId === 'string' ? v.sourceId : null
	};
}
