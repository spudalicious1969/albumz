// Server-side tracklist resolver. Fans out to Spotify, Deezer, iTunes,
// MusicBrainz, and Last.fm in parallel and picks the source returning the most
// tracks. The previous waterfall stopped at the first non-empty result, which
// silently truncated tracklists when Last.fm had the album in its DB with only
// one scrobble-registered track (common for very new releases). Ties go to
// whichever fetcher we listed first — ordering by track-quality reputation:
// Spotify > Deezer > iTunes > MusicBrainz > Last.fm.

import { env } from '$env/dynamic/private';
import { getSpotifyToken } from './spotify-auth.server';
import type { MBAlternate, Track, TracklistResult, TracklistSource } from './tracklist';

const CACHE_TTL_MS = 60 * 60 * 1000;
const PER_SOURCE_TIMEOUT_MS = 8000;
const cache = new Map<string, { value: TracklistResult; expires: number }>();

// Server-side calls don't need the CORS-fixing proxies — hit upstream directly
// so Albumz isn't coupled to spudalicio.us being up.
const SPOTIFY_API = 'https://api.spotify.com/v1';
const DEEZER_API = 'https://api.deezer.com';
const ITUNES_API = 'https://itunes.apple.com';
const MB_API = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = { 'User-Agent': 'Albumz/1.0 (brent.l.watkins@gmail.com)' };

const EMPTY: TracklistResult = { tracks: [], source: null, totalDuration: null };

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
	]);
}

/**
 * Fan out to all sources and return every non-error result (including empties).
 * Ordering reflects quality preference: Spotify > Deezer > iTunes > Last.fm.
 * Used by the lookup-panel chooser so the user can compare and pin a snapshot.
 */
export async function fetchTracklistCandidates(
	artist: string,
	title: string
): Promise<TracklistResult[]> {
	const fetchers: Array<() => Promise<TracklistResult>> = [
		() => fetchFromSpotify(artist, title),
		() => fetchFromDeezer(artist, title),
		() => fetchFromItunes(artist, title),
		() => fetchFromMusicBrainz(artist, title),
		() => fetchFromLastfm(artist, title)
	];

	return Promise.all(
		fetchers.map((f) =>
			withTimeout(f().catch(() => EMPTY), PER_SOURCE_TIMEOUT_MS, EMPTY)
		)
	);
}

export async function fetchTracklist(artist: string, title: string): Promise<TracklistResult> {
	const cacheKey = `${artist.toLowerCase()}::${title.toLowerCase()}`;
	const hit = cache.get(cacheKey);
	if (hit && hit.expires > Date.now()) return hit.value;

	const results = await fetchTracklistCandidates(artist, title);

	// Pick the longest tracklist. Reduce with strict `>` so earlier entries
	// in the fetcher list win on ties — that's our quality preference order.
	const best = results.reduce(
		(max, r) => (r.tracks.length > max.tracks.length ? r : max),
		EMPTY
	);

	cache.set(cacheKey, { value: best, expires: Date.now() + CACHE_TTL_MS });
	return best;
}

function finalize(tracks: Track[], source: TracklistSource): TracklistResult {
	const totalDuration = tracks.reduce((sum, t) => (t.duration ? sum + t.duration : sum), 0);
	return {
		tracks,
		source: tracks.length > 0 ? source : null,
		totalDuration: totalDuration > 0 ? totalDuration : null
	};
}

// ---------- Spotify ----------

type SpotifyAlbumSearchHit = {
	id?: string;
	name?: string;
	artists?: Array<{ name?: string }>;
};

type SpotifyAlbumTracks = {
	items?: Array<{ name?: string; track_number?: number; duration_ms?: number }>;
};

async function fetchFromSpotify(artist: string, title: string): Promise<TracklistResult> {
	const token = await getSpotifyToken();
	if (!token) return finalize([], 'spotify');

	const q = `artist:"${artist}" album:"${title}"`;
	const searchUrl = `${SPOTIFY_API}/search?q=${encodeURIComponent(q)}&type=album&limit=5`;
	const searchRes = await fetch(searchUrl, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!searchRes.ok) return finalize([], 'spotify');
	const searchData = (await searchRes.json()) as {
		albums?: { items?: SpotifyAlbumSearchHit[] };
	};
	const items = searchData.albums?.items ?? [];
	if (items.length === 0) return finalize([], 'spotify');

	const wantArtist = normalize(artist);
	const wantTitle = normalize(title);
	const match =
		items.find(
			(it) =>
				normalize(it.artists?.[0]?.name ?? '') === wantArtist &&
				normalize(it.name ?? '') === wantTitle
		) ?? items[0];
	if (!match.id) return finalize([], 'spotify');

	const tracksRes = await fetch(`${SPOTIFY_API}/albums/${match.id}/tracks?limit=50`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!tracksRes.ok) return finalize([], 'spotify');
	const tracksData = (await tracksRes.json()) as SpotifyAlbumTracks;
	const list = tracksData.items ?? [];

	const tracks: Track[] = list.map((t, i) => ({
		position: t.track_number && t.track_number > 0 ? t.track_number : i + 1,
		name: t.name ?? '',
		duration: t.duration_ms && t.duration_ms > 0 ? Math.round(t.duration_ms / 1000) : null
	}));

	return finalize(tracks, 'spotify');
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

// ---------- MusicBrainz ----------

type MBReleaseSummary = {
	id?: string;
	title?: string;
	disambiguation?: string;
	'artist-credit'?: Array<{ artist?: { name?: string } }>;
	date?: string;
	country?: string;
	'track-count'?: number;
	media?: Array<{ format?: string; 'track-count'?: number }>;
};

type MBReleaseDetail = {
	media?: Array<{
		tracks?: Array<{ position?: number; title?: string; length?: number | null }>;
	}>;
};

// Build a short, scannable label for an MB release. Priority: human-set
// disambiguation > pressed format(s) > year. We want "EP+Demo · 2018" or
// "CD · 2020" — enough to pick from a list of variants.
function mbReleaseLabel(r: MBReleaseSummary): string {
	const parts: string[] = [];
	if (r.disambiguation) parts.push(r.disambiguation);
	const formats = (r.media ?? [])
		.map((m) => m.format)
		.filter((f): f is string => Boolean(f));
	if (formats.length > 0 && parts.length === 0) {
		parts.push(formats.join(' + '));
	}
	const year = r.date?.slice(0, 4);
	if (year) parts.push(year);
	if (r.country && parts.length < 2) parts.push(r.country);
	return parts.length > 0 ? parts.join(' · ') : 'Release';
}

function mbTrackCount(r: MBReleaseSummary): number {
	if (typeof r['track-count'] === 'number') return r['track-count'];
	return (r.media ?? []).reduce((sum, m) => sum + (m['track-count'] ?? 0), 0);
}

async function fetchMBReleaseTracks(mbid: string): Promise<Track[] | null> {
	const releaseUrl = `${MB_API}/release/${mbid}?inc=recordings&fmt=json`;
	const res = await fetch(releaseUrl, { headers: MB_HEADERS });
	if (!res.ok) return null;
	const data = (await res.json()) as MBReleaseDetail;
	const tracks: Track[] = [];
	for (const medium of data.media ?? []) {
		for (const t of medium.tracks ?? []) {
			tracks.push({
				position: tracks.length + 1,
				name: t.title ?? '',
				duration: t.length && t.length > 0 ? Math.round(t.length / 1000) : null
			});
		}
	}
	return tracks;
}

async function fetchFromMusicBrainz(artist: string, title: string): Promise<TracklistResult> {
	const query = `release:"${title}" AND artist:"${artist}"`;
	const searchUrl = `${MB_API}/release?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
	const searchRes = await fetch(searchUrl, { headers: MB_HEADERS });
	if (!searchRes.ok) return finalize([], 'musicbrainz');

	const searchData = (await searchRes.json()) as { releases?: MBReleaseSummary[] };
	const releases = (searchData.releases ?? []).filter((r): r is MBReleaseSummary & { id: string } =>
		typeof r.id === 'string'
	);
	if (releases.length === 0) return finalize([], 'musicbrainz');

	const wantArtist = normalize(artist);
	const wantTitle = normalize(title);
	const best =
		releases.find(
			(r) =>
				normalize(r['artist-credit']?.[0]?.artist?.name ?? '') === wantArtist &&
				normalize(r.title ?? '') === wantTitle
		) ?? releases[0];

	const tracks = await fetchMBReleaseTracks(best.id);
	if (!tracks) return finalize([], 'musicbrainz');

	const alternates: MBAlternate[] = releases.map((r) => ({
		mbid: r.id,
		label: mbReleaseLabel(r),
		trackCount: mbTrackCount(r)
	}));

	const result = finalize(tracks, 'musicbrainz');
	result.sourceId = best.id;
	result.alternates = alternates;
	return result;
}

/**
 * Fetch a specific MusicBrainz release by MBID. Used by the lookup-panel
 * "switch release" picker when the user wants a variant other than the
 * search default (e.g. EP+Demo instead of CD). Does not include alternates;
 * the caller already has them from the original search.
 */
export async function fetchMusicBrainzRelease(mbid: string): Promise<TracklistResult> {
	const tracks = await fetchMBReleaseTracks(mbid);
	if (!tracks || tracks.length === 0) return finalize([], 'musicbrainz');
	const result = finalize(tracks, 'musicbrainz');
	result.sourceId = mbid;
	return result;
}
