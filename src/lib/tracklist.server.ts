// Server-side tracklist resolver. Hits Last.fm's album.getInfo and normalizes
// the response (which is shaped oddly — `tracks.track` can be missing, a
// single object, or an array, and durations are strings in seconds).

import { env } from '$env/dynamic/private';
import type { Track, TracklistResult } from './tracklist';

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { value: TracklistResult; expires: number }>();

type LastfmTrack = {
	name?: string;
	duration?: string | number;
	'@attr'?: { rank?: string | number };
};

type LastfmResponse = {
	album?: {
		tracks?: { track?: LastfmTrack | LastfmTrack[] };
	};
};

export async function fetchTracklist(artist: string, title: string): Promise<TracklistResult> {
	const cacheKey = `${artist.toLowerCase()}::${title.toLowerCase()}`;
	const hit = cache.get(cacheKey);
	if (hit && hit.expires > Date.now()) return hit.value;

	const empty: TracklistResult = { tracks: [], source: null, totalDuration: null };
	const key = env.LAST_FM_API_KEY;
	if (!key) {
		cache.set(cacheKey, { value: empty, expires: Date.now() + CACHE_TTL_MS });
		return empty;
	}

	try {
		const url =
			`https://ws.audioscrobbler.com/2.0/?method=album.getinfo` +
			`&artist=${encodeURIComponent(artist)}` +
			`&album=${encodeURIComponent(title)}` +
			`&api_key=${key}&autocorrect=1&format=json`;
		const res = await fetch(url);
		if (!res.ok) {
			cache.set(cacheKey, { value: empty, expires: Date.now() + CACHE_TTL_MS });
			return empty;
		}
		const data = (await res.json()) as LastfmResponse;
		const raw = data.album?.tracks?.track;
		const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

		const tracks: Track[] = list.map((t, i) => {
			const dur = typeof t.duration === 'string' ? parseInt(t.duration, 10) : t.duration;
			const rank =
				typeof t['@attr']?.rank === 'string'
					? parseInt(t['@attr']!.rank as string, 10)
					: (t['@attr']?.rank as number | undefined);
			return {
				position: rank && Number.isFinite(rank) ? rank : i + 1,
				name: t.name ?? '',
				duration: dur && Number.isFinite(dur) && dur > 0 ? dur : null
			};
		});

		const totalDuration = tracks.reduce(
			(sum, t) => (t.duration ? sum + t.duration : sum),
			0
		);

		const result: TracklistResult = {
			tracks,
			source: tracks.length > 0 ? 'lastfm' : null,
			totalDuration: totalDuration > 0 ? totalDuration : null
		};
		cache.set(cacheKey, { value: result, expires: Date.now() + CACHE_TTL_MS });
		return result;
	} catch {
		cache.set(cacheKey, { value: empty, expires: Date.now() + CACHE_TTL_MS });
		return empty;
	}
}
