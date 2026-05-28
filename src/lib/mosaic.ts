import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchNowPlaying } from './now-playing';

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
//
// Cover resolution uses the existing multi-source `fetchNowPlaying` (iTunes
// song + album, Deezer, Last.fm image, with artist-match filtering) so we
// don't lose a now-playing tile to a single failed iTunes lookup.

async function fetchNowPlayingTiles(profiles: ProfileWithLastFm[]): Promise<NowPlayingTile[]> {
	const results = await Promise.all(
		profiles.map(async (p) => ({ profile: p, np: await fetchNowPlaying(p.last_fm_username) }))
	);

	const tiles: NowPlayingTile[] = [];
	const seen = new Set<string>();

	for (const { profile, np } of results) {
		if (np.state !== 'playing' || !np.artist || !np.track) continue;
		const cover = np.coverCandidates[0] ?? np.coverUrl;
		if (!cover) continue;

		const key = `${np.artist}::${np.track}`.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

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

function spotifySearchUrl(artist: string, track: string): string {
	return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${track}`)}`;
}
