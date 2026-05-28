// Spotify-backed album discovery search. Handles partial queries — type just
// an artist name to see their albums, or just an album title to see matches.
// Returns the same CoverResult shape as cover-search so the UI is interchangeable.

import { getSpotifyToken } from './spotify-auth.server';
import { searchCovers, type CoverResult } from './cover-search';

/**
 * When both artist and title are filled, run the full multi-source cover
 * lookup (5 sources, ranked by artist-match). When only one is filled, fall
 * back to a Spotify-backed discovery search so partial queries still surface
 * useful suggestions.
 */
export async function runDiscovery(artist: string, title: string): Promise<CoverResult[]> {
	const a = artist.trim();
	const t = title.trim();
	if (a && t) return await searchCovers(a, t);
	if (a || t) return await searchAlbums(a, t);
	return [];
}

type SpotifyAlbumItem = {
	name: string;
	album_type?: string;
	release_date?: string;
	images?: Array<{ url: string; width: number; height: number }>;
	artists?: Array<{ name: string }>;
};

type SpotifySearchResponse = {
	albums?: { items?: SpotifyAlbumItem[] };
};

/**
 * Search Spotify for albums matching the partial query.
 * At least one of artist/title must be non-empty.
 */
export async function searchAlbums(artist: string, title: string): Promise<CoverResult[]> {
	const a = artist.trim();
	const t = title.trim();
	if (!a && !t) return [];

	const token = await getSpotifyToken();
	if (!token) return [];

	// Build the query — use field filters when we have specifics, otherwise free text
	const parts: string[] = [];
	if (a) parts.push(`artist:"${a}"`);
	if (t) parts.push(`album:"${t}"`);
	const q = parts.join(' ');

	try {
		// Spotify caps `limit` at 10 for field-filter queries (artist:/album:)
		// — values above that return 400. 10 is plenty for discovery anyway.
		const res = await fetch(
			`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=10`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(5000)
			}
		);
		if (!res.ok) return [];

		const data = (await res.json()) as SpotifySearchResponse;
		const items = data.albums?.items ?? [];

		// Filter out singles/compilations when artist+title query is loose — but
		// keep everything if user is just browsing by artist
		const albums = items.filter((x) => x.album_type !== 'single' || items.length < 5);

		// De-dupe by artist+title (Spotify often returns regional duplicates)
		const seen = new Set<string>();
		const results: CoverResult[] = [];
		for (const x of albums) {
			const artistName = x.artists?.[0]?.name ?? '';
			const key = `${artistName.toLowerCase()}::${x.name.toLowerCase()}`;
			if (seen.has(key)) continue;
			seen.add(key);

			// Largest image first (Spotify orders descending; take the biggest)
			const img = x.images?.[0]?.url;
			if (!img) continue;

			const result: CoverResult = {
				url: img,
				artist: artistName,
				title: x.name,
				source: 'spotify'
			};
			const year = x.release_date ? Number(x.release_date.slice(0, 4)) : NaN;
			if (Number.isFinite(year)) result.year = year;
			results.push(result);
		}

		return results.slice(0, 12);
	} catch {
		return [];
	}
}
