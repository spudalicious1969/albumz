// Server-side Last.fm helpers for the write API (auth + updateNowPlaying).
// Signing convention: alphabetize params, concat key+value pairs into one
// string, append the shared secret, MD5 (lowercase hex). `format` is added
// after signing and not included in the signed string.

import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';

const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';

export type LastfmSession = { name: string; key: string };

/** Where to send the user to authorize Albumz. Last.fm redirects them
 * back to `callbackUrl?token=...` on success. */
export function lastfmAuthUrl(callbackUrl: string): string {
	const key = env.LAST_FM_API_KEY;
	if (!key) throw new Error('LAST_FM_API_KEY missing');
	return (
		`https://www.last.fm/api/auth/?api_key=${key}` +
		`&cb=${encodeURIComponent(callbackUrl)}`
	);
}

/** Exchange a one-shot `token` (from the callback) for a permanent session. */
export async function exchangeToken(token: string): Promise<LastfmSession> {
	const { api_key, secret } = creds();
	const params: Record<string, string> = {
		method: 'auth.getSession',
		api_key,
		token
	};
	params.api_sig = sign(params, secret);
	params.format = 'json';

	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(params).toString()
	});
	const data = (await res.json()) as {
		session?: { name?: string; key?: string };
		error?: number;
		message?: string;
	};
	if (data.error || !data.session?.name || !data.session?.key) {
		throw new Error(
			`Last.fm auth failed (code=${data.error ?? '?'}): ${data.message ?? 'no session in response'}`
		);
	}
	return { name: data.session.name, key: data.session.key };
}

/** Record a permanent play in the user's Last.fm history. Distinct from
 * updateNowPlaying — that one only flips the live "now playing" marker;
 * scrobble is what feeds long-term stats / year-end / top-artist views.
 *
 * `playedAtUnix` should be the timestamp (seconds since epoch) when the
 * track actually started playing — Last.fm uses this to ordering history
 * correctly. Defaults to now() if unknown.
 *
 * Resolves with `true` on success, `false` on any error — Last.fm hiccups
 * must never break the spin pipeline. */
export async function scrobble(
	sessionKey: string,
	artist: string,
	track: string,
	album: string | null | undefined,
	playedAtUnix: number = Math.floor(Date.now() / 1000)
): Promise<boolean> {
	try {
		const { api_key, secret } = creds();
		const params: Record<string, string> = {
			method: 'track.scrobble',
			api_key,
			sk: sessionKey,
			artist,
			track,
			timestamp: String(playedAtUnix)
		};
		if (album) params.album = album;
		params.api_sig = sign(params, secret);
		params.format = 'json';

		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(params).toString()
		});
		if (!res.ok) return false;
		const data = (await res.json()) as {
			scrobbles?: { '@attr'?: { accepted?: number; ignored?: number } };
			error?: number;
		};
		if (data.error) return false;
		return (data.scrobbles?.['@attr']?.accepted ?? 0) > 0;
	} catch {
		return false;
	}
}

/** Fire-and-forget. Posts the "what's playing right now" update.
 * Resolves with `true` on success, `false` on any error (we don't want
 * Last.fm hiccups to break spin identification). */
export async function updateNowPlaying(
	sessionKey: string,
	artist: string,
	track: string,
	album?: string | null
): Promise<boolean> {
	try {
		const { api_key, secret } = creds();
		const params: Record<string, string> = {
			method: 'track.updateNowPlaying',
			api_key,
			sk: sessionKey,
			artist,
			track
		};
		if (album) params.album = album;
		params.api_sig = sign(params, secret);
		params.format = 'json';

		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(params).toString()
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Best-effort: is this artist+track scrobbled (or nowplaying) for the given
 * Last.fm user within the last `windowMinutes`? Used to classify a Shazam-
 * identified spin as 'streamed' (Last.fm agrees) vs 'spun' (Shazam alone).
 *
 * Returns false on any error — the caller should treat that as "no signal",
 * which by convention defaults to 'spun'. We do not want Last.fm hiccups to
 * silently re-label vinyl as streamed. */
export async function isOnLastfmNow(
	lastfmUsername: string,
	artist: string,
	track: string,
	windowMinutes = 6
): Promise<boolean> {
	const key = env.LAST_FM_API_KEY;
	if (!key) return false;

	const url = new URL('https://ws.audioscrobbler.com/2.0/');
	url.searchParams.set('method', 'user.getRecentTracks');
	url.searchParams.set('user', lastfmUsername);
	url.searchParams.set('api_key', key);
	url.searchParams.set('format', 'json');
	url.searchParams.set('limit', '3');

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
		if (!res.ok) return false;
		const data = await res.json();
		const tracks = (data?.recenttracks?.track ?? []) as RecentTrack[];
		const norm = (s: string) => s.toLowerCase().trim();
		const targetArtist = norm(artist);
		const targetTrack = norm(track);
		const cutoff = Date.now() / 1000 - windowMinutes * 60;

		for (const t of tracks) {
			const a = norm((t.artist?.['#text'] ?? t.artist?.name ?? '') as string);
			const tr = norm(t.name ?? '');
			if (a !== targetArtist || tr !== targetTrack) continue;
			const nowplaying = t['@attr']?.nowplaying === 'true';
			if (nowplaying) return true;
			const playedAt = t.date?.uts ? Number(t.date.uts) : null;
			if (playedAt && playedAt >= cutoff) return true;
		}
		return false;
	} catch {
		return false;
	}
}

type RecentTrack = {
	name?: string;
	artist?: { '#text'?: string; name?: string };
	album?: { '#text'?: string };
	date?: { uts?: string };
	'@attr'?: { nowplaying?: string };
};

export type LastfmScrobble = {
	artist: string;
	track: string;
	album: string | null;
	playedAtUnix: number;
};

/** Fetch a user's scrobbles within a time window. Powers the weekly digest:
 * the spins table only captures plays the user made while Spin's mic was on,
 * so we ask Last.fm for the broader picture and cross-reference back.
 *
 * Returns [] on any error so the caller can degrade gracefully — without
 * Last.fm we still have whatever spins/streamed entries Spin caught. */
export async function fetchRecentTracks(
	lastfmUsername: string,
	fromUnix: number,
	toUnix: number,
	limit = 200
): Promise<LastfmScrobble[]> {
	const key = env.LAST_FM_API_KEY;
	if (!key) return [];

	const url = new URL(ENDPOINT);
	url.searchParams.set('method', 'user.getRecentTracks');
	url.searchParams.set('user', lastfmUsername);
	url.searchParams.set('api_key', key);
	url.searchParams.set('format', 'json');
	url.searchParams.set('limit', String(limit));
	url.searchParams.set('from', String(fromUnix));
	url.searchParams.set('to', String(toUnix));

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return [];
		const data = await res.json();
		const raw = (data?.recenttracks?.track ?? []) as RecentTrack[];
		return raw
			.filter((t) => t.name && t.artist && t.date?.uts)
			.map((t) => ({
				artist: (t.artist?.['#text'] ?? t.artist?.name ?? '') as string,
				track: t.name as string,
				album: (t.album?.['#text'] || null) as string | null,
				playedAtUnix: Number(t.date?.uts)
			}))
			.filter((t) => t.artist && t.track);
	} catch {
		return [];
	}
}

// Tags so generic they don't anchor a hook: genre umbrellas, era buckets,
// preference markers, locale labels, vocalist-role tags. The second tier of
// Last.fm tags (post-punk, shoegaze, krautrock, dream pop, etc.) is where
// the column gets its flavor; this stoplist clears the way for them to
// surface. Applied at both fetch-time (new cache rows store clean) and
// read-time (existing noisy rows get filtered on the way through), so no
// cache wipe is needed.
const TAG_STOPLIST = new Set([
	// Genre umbrellas
	'rock', 'pop', 'indie', 'alternative', 'alternative rock', 'indie rock', 'indie pop',
	// Era / decade buckets
	'50s', '60s', '70s', '80s', '90s', '00s', '10s', '20s',
	'2000s', '2010s', '2020s', 'classic rock', 'oldies',
	// Preference / meta noise
	'seen live', 'favourite', 'favourites', 'favorite', 'favorites',
	'my favourites', 'my favorites', 'awesome', 'amazing', 'love', 'great', 'best', 'cool', 'good',
	'love it', 'loved',
	// Locale labels
	'american', 'british', 'english', 'uk', 'usa', 'american rock', 'british rock',
	'american indie', 'british indie',
	// Vocalist role
	'male vocalists', 'female vocalists', 'male vocalist', 'female vocalist',
	// Other catch-all
	'all', 'music'
]);

function filterStoplist(tags: string[]): string[] {
	return tags.filter((t) => !TAG_STOPLIST.has(t));
}

/** Top tags for an artist from Last.fm `artist.getTopTags`. Lowercased,
 * deduped, stoplist-filtered, capped to the top `limit` by Last.fm's count
 * weighting. Returns `[]` on any error so the caller treats it as "no tag
 * info" rather than surfacing a failure into the digest. */
export async function fetchArtistTopTags(
	artist: string,
	limit = 5
): Promise<string[]> {
	const key = env.LAST_FM_API_KEY;
	if (!key || !artist) return [];

	const url = new URL(ENDPOINT);
	url.searchParams.set('method', 'artist.getTopTags');
	url.searchParams.set('artist', artist);
	url.searchParams.set('api_key', key);
	url.searchParams.set('format', 'json');
	url.searchParams.set('autocorrect', '1');

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return [];
		const data = (await res.json()) as {
			toptags?: { tag?: { name?: string; count?: number }[] | { name?: string; count?: number } };
			error?: number;
		};
		if (data.error) return [];
		const raw = data.toptags?.tag;
		const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
		const tags = arr
			.filter((t) => t.name && (t.count ?? 0) > 0)
			.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
			.map((t) => (t.name as string).toLowerCase().trim())
			.filter((t) => t.length > 0);
		const seen = new Set<string>();
		const unique: string[] = [];
		for (const t of filterStoplist(tags)) {
			if (seen.has(t)) continue;
			seen.add(t);
			unique.push(t);
			if (unique.length >= limit) break;
		}
		return unique;
	} catch {
		return [];
	}
}

/** Resolve top tags for a batch of artists with a Supabase-backed cache.
 *
 * Cache key is the lowercased artist name. Cache hits return immediately.
 * Misses are fetched from Last.fm sequentially (politeness over throughput
 * for a background background job) and written back as one upsert at the
 * end. Returns a Map keyed by lowercased artist name. Artists with no tags
 * (Last.fm hiccup, unknown artist, or just no tags) map to `[]`. */
export async function getArtistTopTagsBatch(
	supabase: import('@supabase/supabase-js').SupabaseClient,
	artists: string[]
): Promise<Map<string, string[]>> {
	const result = new Map<string, string[]>();
	const keys = Array.from(
		new Set(artists.map((a) => a.toLowerCase().trim()).filter((a) => a.length > 0))
	);
	if (keys.length === 0) return result;

	const { data: cached } = await supabase
		.from('artist_tags')
		.select('artist, tags')
		.in('artist', keys);

	const cachedKeys = new Set<string>();
	for (const row of cached ?? []) {
		// Re-apply the stoplist on read so cache rows written before the
		// stoplist existed still surface only the specific tags.
		result.set(row.artist, filterStoplist((row.tags as string[]) ?? []));
		cachedKeys.add(row.artist);
	}

	const misses = keys.filter((k) => !cachedKeys.has(k));
	if (misses.length === 0) return result;

	const toUpsert: { artist: string; tags: string[] }[] = [];
	for (const key of misses) {
		const tags = await fetchArtistTopTags(key);
		result.set(key, tags);
		toUpsert.push({ artist: key, tags });
	}

	if (toUpsert.length > 0) {
		await supabase.from('artist_tags').upsert(toUpsert, { onConflict: 'artist' });
	}

	return result;
}

function creds() {
	const api_key = env.LAST_FM_API_KEY;
	const secret = env.LAST_FM_API_SECRET;
	if (!api_key || !secret) {
		throw new Error('LAST_FM_API_KEY and LAST_FM_API_SECRET must be set');
	}
	return { api_key, secret };
}

function sign(params: Record<string, string>, secret: string): string {
	const keys = Object.keys(params).filter((k) => k !== 'format' && k !== 'callback').sort();
	const joined = keys.map((k) => `${k}${params[k]}`).join('') + secret;
	return crypto.createHash('md5').update(joined, 'utf-8').digest('hex');
}
