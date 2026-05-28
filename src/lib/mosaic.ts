import { LAST_FM_API_KEY } from '$env/static/private';
import type { SupabaseClient } from '@supabase/supabase-js';

const ITUNES_PROXY = 'https://spudalicio.us/proxy/itunes';

/** A randomly-sampled album from a user's collection. Clicks deep-link into their public page. */
export interface AlbumTile {
	kind: 'album';
	id: string;          // stable identity for the mosaic ("album:<albumId>")
	albumId: string;
	artist: string;
	title: string;
	imageUrl: string;
	accentColor: string | null;
	username: string;
	displayName: string;
}

/** A live "now-playing" track from a profile's Last.fm. Clicks open Spotify search. */
export interface NowPlayingTile {
	kind: 'nowPlaying';
	id: string;          // "nowplaying:<username>"
	artist: string;
	track: string;
	album: string | null;
	imageUrl: string;
	spotifyUrl: string;
	username: string;
	displayName: string;
}

export type MosaicTile = AlbumTile | NowPlayingTile;

interface ProfileWithLastFm {
	username: string;
	display_name: string | null;
	last_fm_username: string;
}

interface AlbumPoolRow {
	album_id: string;
	artist: string;
	title: string;
	cover_url: string;
	accent_color: string | null;
	username: string;
	display_name: string | null;
}

const POOL_SIZE = 300;
const PER_USER_CAP = 30;

/**
 * Build the mosaic for logged-out visitors. Two layers:
 *   1) A randomly-sampled pool of album covers from public collections (base layer).
 *   2) Live "now-playing" tiles from any profile that has linked Last.fm — these
 *      surface as featured 2x2 tiles in the layout.
 *
 * The order of the returned array is: now-playing tiles first, then the album pool.
 * The view layer uses the first slice to fill visible cells (so now-playing wins the
 * featured slots) and keeps the rest in reserve to flip in over time.
 */
export async function fetchMosaicTiles(
	supabase: SupabaseClient,
	profilesWithLastFm: ProfileWithLastFm[]
): Promise<MosaicTile[]> {
	const [pool, nowPlaying] = await Promise.all([
		fetchAlbumPool(supabase),
		fetchNowPlayingTiles(profilesWithLastFm)
	]);
	return [...nowPlaying, ...pool];
}

async function fetchAlbumPool(supabase: SupabaseClient): Promise<AlbumTile[]> {
	const { data, error } = await supabase.rpc('mosaic_album_pool', {
		sample_size: POOL_SIZE,
		per_user_cap: PER_USER_CAP
	});

	if (error || !data) return [];

	return (data as AlbumPoolRow[]).map((row) => ({
		kind: 'album' as const,
		id: `album:${row.album_id}`,
		albumId: row.album_id,
		artist: row.artist,
		title: row.title,
		imageUrl: row.cover_url,
		accentColor: row.accent_color,
		username: row.username,
		displayName: row.display_name ?? row.username
	}));
}

// ── Now-playing layer ────────────────────────────────────────────────
// Pulls *only* the currently-playing track per profile (state === 'playing').
// Recent-but-not-current tracks no longer feed the mosaic — that role moved to
// the random album pool. This keeps the live layer rare and special.

interface NowPlayingRaw {
	artist: string;
	track: string;
	album: string | null;
	isPlaying: boolean;
}

async function fetchNowPlayingTiles(profiles: ProfileWithLastFm[]): Promise<NowPlayingTile[]> {
	const perProfile = await Promise.all(profiles.map(fetchProfileNowPlaying));

	const tiles: NowPlayingTile[] = [];
	const seenTracks = new Set<string>();

	for (const { profile, np } of perProfile) {
		if (!np || !np.isPlaying) continue;
		const key = `${np.artist}::${np.track}`.toLowerCase();
		if (seenTracks.has(key)) continue;
		seenTracks.add(key);

		const cover = await lookupCover(np.artist, np.track, np.album);
		if (!cover) continue;

		tiles.push({
			kind: 'nowPlaying',
			id: `nowplaying:${profile.username}`,
			artist: np.artist,
			track: np.track,
			album: np.album,
			imageUrl: cover,
			spotifyUrl: spotifySearchUrl(np.artist, np.track),
			username: profile.username,
			displayName: profile.display_name ?? profile.username
		});
	}

	return tiles;
}

async function fetchProfileNowPlaying(
	profile: ProfileWithLastFm
): Promise<{ profile: ProfileWithLastFm; np: NowPlayingRaw | null }> {
	const url = new URL('https://ws.audioscrobbler.com/2.0/');
	url.searchParams.set('method', 'user.getRecentTracks');
	url.searchParams.set('user', profile.last_fm_username);
	url.searchParams.set('api_key', LAST_FM_API_KEY);
	url.searchParams.set('format', 'json');
	url.searchParams.set('limit', '1');

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return { profile, np: null };

		const data = await res.json();
		const first = (data?.recenttracks?.track ?? [])[0];
		if (!first) return { profile, np: null };

		const artist = ((first.artist as Record<string, unknown>)?.['#text'] as string)
			?? ((first.artist as Record<string, unknown>)?.name as string);
		const track = first.name as string;
		if (!artist || !track) return { profile, np: null };

		const album = ((first.album as Record<string, unknown>)?.['#text'] as string) || null;
		const isPlaying = ((first['@attr'] as Record<string, unknown>)?.nowplaying as string) === 'true';

		return { profile, np: { artist, track, album, isPlaying } };
	} catch {
		return { profile, np: null };
	}
}

function spotifySearchUrl(artist: string, track: string): string {
	return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${track}`)}`;
}

// ── Cover-lookup cache (now-playing only — pool tiles already have cover URLs) ──
const TRACK_COVER_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const trackCoverCache = new Map<string, { url: string | null; expiresAt: number }>();

async function lookupCover(artist: string, track: string, album: string | null): Promise<string | null> {
	const cacheKey = `${artist}::${track}`.toLowerCase();
	const cached = trackCoverCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.url;

	const term = album ? `${artist} ${album}` : `${artist} ${track}`;
	const entity = album ? 'album' : 'song';

	let url: string | null = null;
	try {
		const res = await fetch(
			`${ITUNES_PROXY}/search?term=${encodeURIComponent(term)}&media=music&entity=${entity}&limit=1`,
			{ signal: AbortSignal.timeout(4000) }
		);
		if (res.ok) {
			const data = await res.json();
			const first = (data.results ?? [])[0];
			const artwork = first?.artworkUrl100 as string | undefined;
			if (artwork) url = artwork.replace('100x100', '600x600');
		}
	} catch {
		// fall through to negative cache
	}

	trackCoverCache.set(cacheKey, {
		url,
		expiresAt: Date.now() + (url ? TRACK_COVER_TTL_MS : NEGATIVE_TTL_MS)
	});
	return url;
}
