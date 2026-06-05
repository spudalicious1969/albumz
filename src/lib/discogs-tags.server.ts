// Per-release tag lookup against Discogs. Discogs publishes both `style[]`
// (specific subgenres — "Shoegaze", "Post-Punk", "Slowcore") and `genre[]`
// (broader umbrellas — "Rock", "Electronic") on each release record, curated
// by their crate-digger community. Album-specific and more curated than
// Last.fm's artist-level folksonomy, which makes Discogs the preferred first
// stop for backfill tags. Last.fm remains the fallback when Discogs has no
// match or no tags on the match it has.

import { env } from '$env/dynamic/private';

const ENDPOINT = 'https://api.discogs.com/database/search';
const USER_AGENT = 'Albumz/1.0 (+https://albumz.spudalicio.us)';
const TOP_RESULTS_TO_UNION = 5;

type DiscogsSearchHit = {
	style?: string[];
	genre?: string[];
};

/** Returns lowercase, deduped tags. Order: styles first (more specific),
 *  then genres. Returns [] on any failure so callers can fall back cleanly. */
export async function fetchDiscogsTagsForAlbum(
	artist: string,
	title: string
): Promise<string[]> {
	const token = env.DISCOGS_TOKEN;
	if (!token) return [];
	if (!artist.trim() || !title.trim()) return [];

	const url = new URL(ENDPOINT);
	url.searchParams.set('artist', artist);
	url.searchParams.set('release_title', title);
	url.searchParams.set('type', 'release');
	url.searchParams.set('per_page', String(TOP_RESULTS_TO_UNION));
	url.searchParams.set('token', token);

	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) return [];
		const data = (await res.json()) as { results?: DiscogsSearchHit[] };
		const hits = data.results ?? [];

		// Union across top hits — different pressings of a release can have
		// different style sets; aggregating gives us the strongest tag signal.
		const seen = new Set<string>();
		const tags: string[] = [];
		const push = (raw: string) => {
			const k = raw.toLowerCase().trim();
			if (!k || seen.has(k)) return;
			seen.add(k);
			tags.push(k);
		};
		for (const h of hits) for (const s of h.style ?? []) push(s);
		for (const h of hits) for (const g of h.genre ?? []) push(g);
		return tags;
	} catch {
		return [];
	}
}
