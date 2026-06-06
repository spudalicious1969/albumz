// Shared tracklist types + formatters. Browser-safe (no env imports).
// Server-side fetch lives in tracklist.server.ts.

export type Track = {
	position: number;
	name: string;
	duration: number | null;
};

export type TracklistSource = 'spotify' | 'lastfm' | 'deezer' | 'itunes';

export type TracklistResult = {
	tracks: Track[];
	source: TracklistSource | null;
	totalDuration: number | null;
};

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
	const v = raw as { tracks?: unknown; source?: unknown };
	if (!Array.isArray(v.tracks) || v.tracks.length === 0) return null;
	if (typeof v.source !== 'string') return null;

	const tracks = v.tracks as Track[];
	const totalDuration = tracks.reduce((sum, t) => (t.duration ? sum + t.duration : sum), 0);
	return {
		tracks,
		source: v.source as TracklistSource,
		totalDuration: totalDuration > 0 ? totalDuration : null
	};
}
