// Server-side resolver for streaming/external links shown on album detail.
// Hits Spotify, Discogs, and YouTube APIs to get direct album URLs when
// possible; falls back to search URLs everywhere else. Module-level cache
// keeps repeat hits cheap (in adapter-node the module persists across requests).

import { env } from '$env/dynamic/private';
import { getSpotifyToken } from './spotify-auth.server';
import type { ExternalLink } from './external-links';

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { value: ExternalLink[]; expires: number }>();

export async function spotifyAlbumUrl(artist: string, title: string): Promise<string | null> {
	const token = await getSpotifyToken();
	if (!token) return null;
	try {
		const q = `album:"${title}" artist:"${artist}"`;
		const res = await fetch(
			`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=1`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		if (!res.ok) return null;
		const data = (await res.json()) as {
			albums?: { items?: Array<{ external_urls?: { spotify?: string } }> };
		};
		return data.albums?.items?.[0]?.external_urls?.spotify ?? null;
	} catch {
		return null;
	}
}

// ── Discogs ─────────────────────────────────────────────────────────────────
async function discogsAlbumUrl(artist: string, title: string): Promise<string | null> {
	const token = env.DISCOGS_TOKEN;
	if (!token) return null;
	try {
		const q = encodeURIComponent(`${artist} ${title}`);
		const res = await fetch(
			`https://api.discogs.com/database/search?q=${q}&type=release&per_page=1&token=${token}`,
			{ headers: { 'User-Agent': 'Albumz/1.0 (+https://albumz.spudalicio.us)' } }
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { results?: Array<{ uri?: string }> };
		const uri = data.results?.[0]?.uri;
		return uri ? `https://www.discogs.com${uri}` : null;
	} catch {
		return null;
	}
}

// ── YouTube (Data API) — find an album playlist if one exists ───────────────
async function youtubePlaylistUrl(artist: string, title: string): Promise<string | null> {
	const key = env.YOUTUBE_API_KEY;
	if (!key) return null;
	try {
		const q = encodeURIComponent(`${artist} ${title} album`);
		const res = await fetch(
			`https://www.googleapis.com/youtube/v3/search?part=id&q=${q}&type=playlist&maxResults=1&key=${key}`
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { items?: Array<{ id?: { playlistId?: string } }> };
		const id = data.items?.[0]?.id?.playlistId;
		return id ? `https://music.youtube.com/playlist?list=${id}` : null;
	} catch {
		return null;
	}
}

function plus(s: string): string {
	return encodeURIComponent(s).replace(/%20/g, '+');
}

export async function resolveExternalLinks(
	artist: string,
	title: string
): Promise<ExternalLink[]> {
	const cacheKey = `${artist.toLowerCase()}::${title.toLowerCase()}`;
	const hit = cache.get(cacheKey);
	if (hit && hit.expires > Date.now()) return hit.value;

	const [spotify, discogs, youtube] = await Promise.all([
		spotifyAlbumUrl(artist, title),
		discogsAlbumUrl(artist, title),
		youtubePlaylistUrl(artist, title)
	]);

	const q = encodeURIComponent(`${artist} ${title}`);
	const mbQuery = encodeURIComponent(`artist:"${artist}" AND release:"${title}"`);

	const links: ExternalLink[] = [
		{
			service: 'spotify',
			name: 'Spotify',
			url: spotify ?? `https://open.spotify.com/search/${q}`,
			isDirect: !!spotify
		},
		{
			service: 'tidal',
			name: 'Tidal',
			url: `https://listen.tidal.com/search?q=${q}`,
			isDirect: false
		},
		{
			service: 'apple-music',
			name: 'Apple Music',
			url: `https://music.apple.com/us/search?term=${q}`,
			isDirect: false
		},
		{
			service: 'youtube-music',
			name: 'YouTube Music',
			url: youtube ?? `https://music.youtube.com/search?q=${q}`,
			isDirect: !!youtube
		},
		{
			service: 'lastfm',
			name: 'Last.fm',
			url: `https://www.last.fm/music/${plus(artist)}/${plus(title)}`,
			isDirect: true
		},
		{
			service: 'discogs',
			name: 'Discogs',
			url: discogs ?? `https://www.discogs.com/search?q=${q}&type=release`,
			isDirect: !!discogs
		},
		{
			service: 'musicbrainz',
			name: 'MusicBrainz',
			url: `https://musicbrainz.org/search?query=${mbQuery}&type=release`,
			isDirect: false
		},
		{
			service: 'musicmap',
			name: 'MusicMap',
			url: `https://www.music-map.com/${plus(artist.toLowerCase())}.html`,
			isDirect: true
		},
		{
			service: 'aoty',
			name: 'AOTY',
			url: `https://www.albumoftheyear.org/search/?q=${q}`,
			isDirect: false
		}
	];

	cache.set(cacheKey, { value: links, expires: Date.now() + CACHE_TTL_MS });
	return links;
}
