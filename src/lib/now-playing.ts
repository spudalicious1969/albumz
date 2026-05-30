import { LAST_FM_API_KEY } from '$env/static/private';

const ITUNES_PROXY = 'https://spudalicio.us/proxy/itunes';
const DEEZER_PROXY = 'https://spudalicio.us/proxy/deezer';

// Last.fm serves this MD5 as its "empty" placeholder. Treat any URL containing
// it as no-cover so the fallback chain doesn't latch onto a star icon.
const LFM_PLACEHOLDER_MD5 = '2a96cbd8b46e442fc41c2b86b821562f';

export interface NowPlayingResult {
	state: 'playing' | 'recent' | 'none';
	track: string | null;
	artist: string | null;
	album: string | null;
	/** Best single guess for SSR / immediate display. First item of coverCandidates. */
	coverUrl: string | null;
	/** Ordered list of cover-art URLs to try; the client should fall back through them on <img> error. */
	coverCandidates: string[];
	playedAt: number | null;
	/** Whether the current/recent track was identified by Shazam in the user's
	 * spins log within the last few minutes (= physical playback) or not (= stream).
	 * Null when we have no signal (state === 'none' or no spins lookup performed). */
	source: 'spun' | 'streamed' | null;
}

const EMPTY: NowPlayingResult = {
	state: 'none',
	track: null,
	artist: null,
	album: null,
	coverUrl: null,
	coverCandidates: [],
	playedAt: null,
	source: null
};

/**
 * Fetch the most recent (or currently playing) track for a Last.fm user.
 * Gathers cover-art candidates from iTunes (song+album searches) and Deezer
 * in parallel, then falls back to the Last.fm track image. The component
 * displaying these should set <img onerror> to advance through the list.
 */
export async function fetchNowPlaying(lastFmUsername: string): Promise<NowPlayingResult> {
	const url = new URL('https://ws.audioscrobbler.com/2.0/');
	url.searchParams.set('method', 'user.getRecentTracks');
	url.searchParams.set('user', lastFmUsername);
	url.searchParams.set('api_key', LAST_FM_API_KEY);
	url.searchParams.set('format', 'json');
	url.searchParams.set('limit', '1');

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return EMPTY;

		const data = await res.json();
		const first = (data?.recenttracks?.track ?? [])[0];
		if (!first) return EMPTY;

		const track = first.name as string;
		const artist = (first.artist?.['#text'] as string) ?? (first.artist?.name as string);
		const album = (first.album?.['#text'] as string) || null;
		if (!track || !artist) return EMPTY;

		const nowPlaying = first['@attr']?.nowplaying === 'true';
		const playedAt = first.date?.uts ? Number(first.date.uts) : null;

		// Last.fm sometimes includes track images — collect biggest-first, drop placeholders
		const lfmImages: string[] = [];
		if (Array.isArray(first.image) && first.image.length) {
			for (let i = first.image.length - 1; i >= 0; i--) {
				const u = first.image[i]?.['#text'];
				if (u) lfmImages.push(u.replace('300x300', '600x600'));
			}
		}

		const candidates = await gatherCoverCandidates(artist, track, album, lfmImages);

		return {
			state: nowPlaying ? 'playing' : 'recent',
			track,
			artist,
			album,
			coverUrl: candidates[0] ?? null,
			coverCandidates: candidates,
			playedAt,
			source: null
		};
	} catch {
		return EMPTY;
	}
}

function isValid(url: unknown): url is string {
	if (typeof url !== 'string' || !url.trim()) return false;
	if (url.includes(LFM_PLACEHOLDER_MD5)) return false;
	return true;
}

async function gatherCoverCandidates(
	artist: string,
	track: string,
	album: string | null,
	lfmImages: string[]
): Promise<string[]> {
	const seen = new Set<string>();
	const out: string[] = [];
	const push = (u: unknown) => {
		if (!isValid(u) || seen.has(u)) return;
		seen.add(u);
		out.push(u);
	};

	const al = artist.toLowerCase();
	// Use album in query when known — much better match rate for known releases
	const itunesQ = album ? `${album} ${artist}` : `${track} ${artist}`;
	const deezerQ = album
		? `album:"${album}" artist:"${artist}"`
		: `track:"${track}" artist:"${artist}"`;

	const headers = { Accept: 'application/json' };
	const opts = { signal: AbortSignal.timeout(4000), headers };

	const [songRes, albumRes, deezerRes] = await Promise.allSettled([
		fetch(
			`${ITUNES_PROXY}/search?term=${encodeURIComponent(itunesQ)}&media=music&entity=song&limit=10`,
			opts
		).then((r) => (r.ok ? r.json() : null)),
		fetch(
			`${ITUNES_PROXY}/search?term=${encodeURIComponent(itunesQ)}&media=music&entity=album&limit=5`,
			opts
		).then((r) => (r.ok ? r.json() : null)),
		fetch(`${DEEZER_PROXY}/search?q=${encodeURIComponent(deezerQ)}&limit=5`, opts).then((r) =>
			r.ok ? r.json() : null
		)
	]);

	type ItunesItem = { artworkUrl100?: string; artistName?: string };
	type DeezerItem = { album?: { cover_xl?: string; cover_big?: string } };

	if (songRes.status === 'fulfilled' && songRes.value?.results?.length) {
		const items = songRes.value.results as ItunesItem[];
		const matched = items.filter((x) => x.artistName?.toLowerCase().includes(al));
		for (const x of (matched.length ? matched : items).slice(0, 4)) {
			if (x.artworkUrl100) push(x.artworkUrl100.replace('100x100bb', '1200x1200bb'));
		}
	}

	if (albumRes.status === 'fulfilled' && albumRes.value?.results?.length) {
		const items = albumRes.value.results as ItunesItem[];
		const matched = items.filter((x) => x.artistName?.toLowerCase().includes(al));
		for (const x of (matched.length ? matched : items).slice(0, 3)) {
			if (x.artworkUrl100) push(x.artworkUrl100.replace('100x100bb', '1200x1200bb'));
		}
	}

	if (deezerRes.status === 'fulfilled' && deezerRes.value?.data?.length) {
		const items = deezerRes.value.data as DeezerItem[];
		for (const x of items.slice(0, 4)) {
			push(x.album?.cover_xl);
			push(x.album?.cover_big);
		}
	}

	for (const u of lfmImages) push(u);

	return out;
}
