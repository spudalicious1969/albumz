// Server-side tracklist resolver. Waterfall: Last.fm → Deezer → iTunes.
// Each provider's response shape is normalized into a TracklistResult.
// We fall through to the next source only when the previous returned no tracks.

import { env } from '$env/dynamic/private';
import type { Track, TracklistResult, TracklistSource } from './tracklist';

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { value: TracklistResult; expires: number }>();

// Server-side calls don't need the CORS-fixing proxies — hit upstream directly
// so Albumz isn't coupled to spudalicio.us being up.
const DEEZER_API = 'https://api.deezer.com';
const ITUNES_API = 'https://itunes.apple.com';

export async function fetchTracklist(artist: string, title: string): Promise<TracklistResult> {
	const cacheKey = `${artist.toLowerCase()}::${title.toLowerCase()}`;
	const hit = cache.get(cacheKey);
	if (hit && hit.expires > Date.now()) return hit.value;

	const empty: TracklistResult = { tracks: [], source: null, totalDuration: null };

	for (const fetcher of [fetchFromLastfm, fetchFromDeezer, fetchFromItunes]) {
		try {
			const result = await fetcher(artist, title);
			if (result.tracks.length > 0) {
				cache.set(cacheKey, { value: result, expires: Date.now() + CACHE_TTL_MS });
				return result;
			}
		} catch {
			// Try the next source.
		}
	}

	cache.set(cacheKey, { value: empty, expires: Date.now() + CACHE_TTL_MS });
	return empty;
}

function finalize(tracks: Track[], source: TracklistSource): TracklistResult {
	const totalDuration = tracks.reduce((sum, t) => (t.duration ? sum + t.duration : sum), 0);
	return {
		tracks,
		source: tracks.length > 0 ? source : null,
		totalDuration: totalDuration > 0 ? totalDuration : null
	};
}

// ---------- Last.fm ----------

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

async function fetchFromLastfm(artist: string, title: string): Promise<TracklistResult> {
	const key = env.LAST_FM_API_KEY;
	if (!key) return finalize([], 'lastfm');

	const url =
		`https://ws.audioscrobbler.com/2.0/?method=album.getinfo` +
		`&artist=${encodeURIComponent(artist)}` +
		`&album=${encodeURIComponent(title)}` +
		`&api_key=${key}&autocorrect=1&format=json`;
	const res = await fetch(url);
	if (!res.ok) return finalize([], 'lastfm');
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

	return finalize(tracks, 'lastfm');
}

// ---------- Deezer ----------

type DeezerSearchResult = {
	data?: Array<{ id: number; title: string; artist?: { name?: string } }>;
};

type DeezerAlbum = {
	tracks?: {
		data?: Array<{ title?: string; duration?: number; track_position?: number }>;
	};
};

function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{Letter}\p{Number}]+/gu, '')
		.trim();
}

async function fetchFromDeezer(artist: string, title: string): Promise<TracklistResult> {
	const q = `artist:"${artist}" album:"${title}"`;
	const searchUrl = `${DEEZER_API}/search/album?q=${encodeURIComponent(q)}&limit=5`;
	const searchRes = await fetch(searchUrl);
	if (!searchRes.ok) return finalize([], 'deezer');
	const search = (await searchRes.json()) as DeezerSearchResult;
	const candidates = search.data ?? [];
	if (candidates.length === 0) return finalize([], 'deezer');

	const wantArtist = normalize(artist);
	const wantTitle = normalize(title);
	const match =
		candidates.find(
			(c) => normalize(c.artist?.name ?? '') === wantArtist && normalize(c.title) === wantTitle
		) ?? candidates[0];

	const albumRes = await fetch(`${DEEZER_API}/album/${match.id}`);
	if (!albumRes.ok) return finalize([], 'deezer');
	const album = (await albumRes.json()) as DeezerAlbum;
	const list = album.tracks?.data ?? [];

	const tracks: Track[] = list.map((t, i) => ({
		position: t.track_position && t.track_position > 0 ? t.track_position : i + 1,
		name: t.title ?? '',
		duration: t.duration && t.duration > 0 ? t.duration : null
	}));

	return finalize(tracks, 'deezer');
}

// ---------- iTunes ----------

type ItunesSearchResult = {
	results?: Array<{
		collectionId?: number;
		collectionName?: string;
		artistName?: string;
		wrapperType?: string;
	}>;
};

type ItunesLookupResult = {
	results?: Array<{
		wrapperType?: string;
		kind?: string;
		trackName?: string;
		trackNumber?: number;
		trackTimeMillis?: number;
	}>;
};

async function fetchFromItunes(artist: string, title: string): Promise<TracklistResult> {
	const term = `${artist} ${title}`;
	const searchUrl =
		`${ITUNES_API}/search?term=${encodeURIComponent(term)}` +
		`&entity=album&limit=5`;
	const searchRes = await fetch(searchUrl);
	if (!searchRes.ok) return finalize([], 'itunes');
	const search = (await searchRes.json()) as ItunesSearchResult;
	const candidates = (search.results ?? []).filter((r) => r.collectionId);
	if (candidates.length === 0) return finalize([], 'itunes');

	const wantArtist = normalize(artist);
	const wantTitle = normalize(title);
	const match =
		candidates.find(
			(c) =>
				normalize(c.artistName ?? '') === wantArtist &&
				normalize(c.collectionName ?? '') === wantTitle
		) ?? candidates[0];

	const lookupUrl = `${ITUNES_API}/lookup?id=${match.collectionId}&entity=song`;
	const lookupRes = await fetch(lookupUrl);
	if (!lookupRes.ok) return finalize([], 'itunes');
	const lookup = (await lookupRes.json()) as ItunesLookupResult;
	const songs = (lookup.results ?? []).filter((r) => r.wrapperType === 'track' && r.kind === 'song');

	const tracks: Track[] = songs.map((s, i) => ({
		position: s.trackNumber && s.trackNumber > 0 ? s.trackNumber : i + 1,
		name: s.trackName ?? '',
		duration:
			s.trackTimeMillis && s.trackTimeMillis > 0
				? Math.round(s.trackTimeMillis / 1000)
				: null
	}));

	return finalize(tracks, 'itunes');
}
