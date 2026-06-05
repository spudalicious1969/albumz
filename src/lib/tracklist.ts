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
