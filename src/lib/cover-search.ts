import { LAST_FM_API_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { getSpotifyToken } from './spotify-auth.server';
import type { CoverResult } from './cover-types';

export type { CoverResult } from './cover-types';

// See now-playing.ts for rationale — direct endpoints by default, env-overridable.
const ITUNES_PROXY = env.ITUNES_PROXY_URL || 'https://itunes.apple.com';
const DEEZER_PROXY = env.DEEZER_PROXY_URL || 'https://api.deezer.com';

// Priority bias when two sources tie on artist/title match. Spotify has the
// cleanest metadata; iTunes is dense; Deezer is good for edge cases; MB+LFM
// are last-resort as they sometimes serve placeholders or wrong-artist hits.
const SOURCE_PRIORITY: Record<CoverResult['source'], number> = {
	spotify: 4,
	itunes: 3,
	deezer: 2,
	musicbrainz: 1,
	lastfm: 0
};

// Confidence floor for auto-writing a cover without user review. Any pick
// below this score is suspect enough that we'd rather leave the album
// cover-less than risk attaching the wrong art (catastrophic when bulk).
// Math: artist equality (+100) + title substring (+15) + min source = 115.
// Substring-only artist matches (the old false-positive vector for short
// or common names) score 30 + 50 + source = 84 max → falls below the floor.
const CONFIDENT_SCORE = 115;

function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{Letter}\p{Number}]+/gu, '')
		.trim();
}

function scoreResult(r: CoverResult, artist: string, title: string): number {
	const a = normalize(artist);
	const t = normalize(title);
	const ra = normalize(r.artist);
	const rt = normalize(r.title);
	let score = SOURCE_PRIORITY[r.source];
	// Artist equality is the heaviest signal — wrong-artist hits via loose
	// substring matching were the main failure mode for bulk auto-writes.
	if (ra && a && ra === a) score += 100;
	else if (ra && a && (ra.includes(a) || a.includes(ra))) score += 30;

	if (rt && t && rt === t) score += 50;
	else if (rt && t && (rt.includes(t) || t.includes(rt))) score += 15;

	return score;
}

/**
 * Pick the top result only if it clears the confidence floor — used by the
 * auto-write paths (Find covers button + bulk backfill). Below the floor,
 * we return null so the caller leaves cover_url unwritten; the user can
 * still browse the full ranked list via the lookup panel.
 */
export function topConfidentCover(
	results: CoverResult[],
	artist: string,
	title: string
): CoverResult | null {
	const top = results[0];
	if (!top) return null;
	return scoreResult(top, artist, title) >= CONFIDENT_SCORE ? top : null;
}

export async function searchCovers(artist: string, title: string): Promise<CoverResult[]> {
	const results = await Promise.allSettled([
		searchSpotify(artist, title),
		searchiTunes(artist, title),
		searchLastFm(artist, title),
		searchMusicBrainz(artist, title),
		searchDeezer(artist, title)
	]);

	const flat = results
		.filter((r): r is PromiseFulfilledResult<CoverResult[]> => r.status === 'fulfilled')
		.flatMap((r) => r.value);

	// Rank by artist-match strength + source quality so the top hit is reliable
	flat.sort((a, b) => scoreResult(b, artist, title) - scoreResult(a, artist, title));

	// De-dupe identical URLs (different sources occasionally return the same CDN URL)
	const seen = new Set<string>();
	const deduped: CoverResult[] = [];
	for (const r of flat) {
		if (seen.has(r.url)) continue;
		seen.add(r.url);
		deduped.push(r);
	}

	return deduped.slice(0, 12);
}

async function searchSpotify(artist: string, title: string): Promise<CoverResult[]> {
	const token = await getSpotifyToken();
	if (!token) return [];

	const q = `artist:"${artist}" album:"${title}"`;
	try {
		const res = await fetch(
			`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(4000)
			}
		);
		if (!res.ok) return [];
		const data = (await res.json()) as {
			albums?: {
				items?: Array<{
					name: string;
					release_date?: string;
					artists?: Array<{ name: string }>;
					images?: Array<{ url: string }>;
				}>;
			};
		};
		const items = data.albums?.items ?? [];
		const out: CoverResult[] = [];
		for (const x of items) {
			const img = x.images?.[0]?.url;
			const artistName = x.artists?.[0]?.name ?? '';
			if (!img) continue;
			const result: CoverResult = {
				url: img,
				artist: artistName,
				title: x.name,
				source: 'spotify'
			};
			const year = x.release_date ? Number(x.release_date.slice(0, 4)) : NaN;
			if (Number.isFinite(year)) result.year = year;
			out.push(result);
		}
		return out;
	} catch {
		return [];
	}
}

async function searchiTunes(artist: string, title: string): Promise<CoverResult[]> {
	const q = encodeURIComponent(`${artist} ${title}`);
	const res = await fetch(`${ITUNES_PROXY}/search?term=${q}&media=music&entity=album&limit=6`, {
		signal: AbortSignal.timeout(5000)
	});
	if (!res.ok) return [];

	const data = await res.json();
	return (data.results ?? [])
		.map((r: Record<string, unknown>) => ({
			url: (r.artworkUrl100 as string)?.replace('100x100', '600x600') ?? '',
			artist: r.artistName as string,
			title: r.collectionName as string,
			year: r.releaseDate ? new Date(r.releaseDate as string).getFullYear() : undefined,
			source: 'itunes' as const
		}))
		.filter((r: CoverResult) => r.url);
}

async function searchDeezer(artist: string, title: string): Promise<CoverResult[]> {
	// Loose query — strict `artist:"x" album:"y"` was missing many releases
	const q = encodeURIComponent(`${artist} ${title}`);
	const res = await fetch(`${DEEZER_PROXY}/search/album?q=${q}&limit=4`, {
		signal: AbortSignal.timeout(5000)
	});
	if (!res.ok) return [];

	const data = await res.json();
	return (data.data ?? [])
		.map((r: Record<string, unknown>) => ({
			url: (r.cover_xl as string) || (r.cover_big as string) || '',
			artist: ((r.artist as Record<string, unknown>)?.name as string) ?? '',
			title: r.title as string,
			source: 'deezer' as const
		}))
		.filter((r: CoverResult) => r.url);
}

/** Last.fm album.getInfo — direct call, no CORS issues, great indie coverage */
async function searchLastFm(artist: string, title: string): Promise<CoverResult[]> {
	const url = new URL('https://ws.audioscrobbler.com/2.0/');
	url.searchParams.set('method', 'album.getInfo');
	url.searchParams.set('artist', artist);
	url.searchParams.set('album', title);
	url.searchParams.set('api_key', LAST_FM_API_KEY);
	url.searchParams.set('format', 'json');

	const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
	if (!res.ok) return [];

	const data = await res.json();
	if (!data.album) return [];

	const images = (data.album.image ?? []) as Array<{ size: string; '#text': string }>;
	const best =
		images.find((i) => i.size === 'mega')?.['#text'] ??
		images.find((i) => i.size === 'extralarge')?.['#text'] ??
		images.find((i) => i.size === 'large')?.['#text'];
	if (!best) return [];

	return [
		{
			url: best,
			artist: data.album.artist as string,
			title: data.album.name as string,
			source: 'lastfm'
		}
	];
}

// MusicBrainz rate limiter — their policy is 1 req/sec.
// We claim a future timestamp slot atomically per caller, then wait until then.
// CAA HEAD checks aren't throttled (different service, no 1/sec policy).
let mbNextSlot = 0;
const MB_MIN_GAP_MS = 1050;

function throttleMB<T>(fn: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const slot = Math.max(now, mbNextSlot);
	mbNextSlot = slot + MB_MIN_GAP_MS;
	const wait = slot - now;
	return wait > 0
		? new Promise<T>((resolve, reject) => {
				setTimeout(() => fn().then(resolve, reject), wait);
			})
		: fn();
}

/** MusicBrainz release search → Cover Art Archive front image */
async function searchMusicBrainz(artist: string, title: string): Promise<CoverResult[]> {
	const q = `artist:"${artist}" AND release:"${title}"`;
	const url = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(q)}&fmt=json&limit=4`;

	const res = await throttleMB(() =>
		fetch(url, {
			headers: { 'User-Agent': 'Albumz/0.1 ( brent.l.watkins@gmail.com )' },
			signal: AbortSignal.timeout(8000)
		})
	);
	if (!res.ok) return [];

	const data = await res.json();
	const releases = (data.releases ?? []) as Array<Record<string, unknown>>;

	// Check CAA in parallel; HEAD-check avoids returning URLs that 404
	const results = await Promise.all(
		releases.slice(0, 4).map(async (rel): Promise<CoverResult | null> => {
			const caaUrl = `https://coverartarchive.org/release/${rel.id}/front-500`;
			try {
				const head = await fetch(caaUrl, {
					method: 'HEAD',
					signal: AbortSignal.timeout(3000),
					redirect: 'follow'
				});
				if (!head.ok) return null;
				const result: CoverResult = {
					url: caaUrl,
					artist:
						((rel['artist-credit'] as Array<Record<string, unknown>>)?.[0]?.name as string) ??
						artist,
					title: rel.title as string,
					source: 'musicbrainz'
				};
				const year = rel.date ? Number(String(rel.date).slice(0, 4)) : NaN;
				if (Number.isFinite(year)) result.year = year;
				return result;
			} catch {
				return null;
			}
		})
	);

	return results.filter((r): r is CoverResult => r !== null);
}
