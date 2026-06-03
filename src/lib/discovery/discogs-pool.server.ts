// Discogs candidate-pool fetcher. Takes qwen's translated search params and
// hits Discogs's search API one style at a time (style+style URL repetition
// gets weird OR semantics, so we query each separately and union the results).
// Uses type=master so each album appears once regardless of pressings — label
// and country are approximate on masters but that's fine; album-level
// uniqueness matters more than pressing precision for discovery.
//
// Filters out the user's crate (Dig handles rediscovery; /discover means new).
// Returns up to POOL_TARGET candidates with the metadata qwen step 2 needs
// to pick from and the UI needs to render.

import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DiscogsSearchParams } from './interpret-nudge.server';

const DISCOGS_ENDPOINT = 'https://api.discogs.com/database/search';
const USER_AGENT = 'Albumz/1.0 (+https://albumz.spudalicio.us)';
const PER_STYLE_LIMIT = 50;
const POOL_TARGET = 80;
// Discogs ranks by notability, so a popular genre godfather (Cheap Trick for
// Power Pop) can take half the pool. Cap per artist so qwen step 2 has real
// variety to curate from.
const PER_ARTIST_CAP = 2;

export type Candidate = {
	master_id: number;
	artist: string;
	title: string;
	year: number | null;
	label: string | null;
	country: string | null;
	cover_image: string | null;
	style: string;
};

export type PoolResult =
	| {
			ok: true;
			candidates: Candidate[];
			perStyleCounts: Record<string, number>;
			filteredOutFromCrate: number;
	  }
	| { ok: false; error: string };

// Discogs search returns "title" as "Artist - Album". Parse defensively —
// occasionally a record has multiple " - " in the artist or title (rare but
// real), so split on the first occurrence only.
function parseDiscogsTitle(rawTitle: string): { artist: string; title: string } {
	const idx = rawTitle.indexOf(' - ');
	if (idx < 0) return { artist: 'Unknown', title: rawTitle };
	return {
		artist: rawTitle.slice(0, idx).trim(),
		title: rawTitle.slice(idx + 3).trim()
	};
}

function albumKey(artist: string, title: string): string {
	return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
}

type DiscogsSearchResult = {
	id?: number;
	master_id?: number;
	title?: string;
	year?: string | number;
	label?: string | string[];
	country?: string;
	cover_image?: string;
};

async function fetchOneStyle(
	style: string,
	params: DiscogsSearchParams,
	token: string
): Promise<Candidate[]> {
	const url = new URL(DISCOGS_ENDPOINT);
	url.searchParams.set('type', 'master');
	url.searchParams.set('style', style);
	url.searchParams.set('per_page', String(PER_STYLE_LIMIT));
	url.searchParams.set('token', token);

	if (params.year_min && params.year_max) {
		url.searchParams.set('year', `${params.year_min}-${params.year_max}`);
	}
	if (params.label) url.searchParams.set('label', params.label);
	if (params.country) url.searchParams.set('country', params.country);

	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
			signal: AbortSignal.timeout(10000)
		});
		if (!res.ok) return [];

		const data = (await res.json()) as { results?: DiscogsSearchResult[] };
		const results = data.results ?? [];

		return results.map((r) => {
			const { artist, title } = parseDiscogsTitle(r.title ?? '');
			return {
				master_id: r.master_id ?? r.id ?? 0,
				artist,
				title,
				year: r.year ? Number(r.year) || null : null,
				label: Array.isArray(r.label) ? r.label[0] ?? null : r.label ?? null,
				country: r.country ?? null,
				cover_image: r.cover_image ?? null,
				style
			};
		});
	} catch {
		return [];
	}
}

export async function fetchDiscogsPool(
	supabase: SupabaseClient,
	userId: string,
	params: DiscogsSearchParams
): Promise<PoolResult> {
	const token = env.DISCOGS_TOKEN;
	if (!token) return { ok: false, error: 'DISCOGS_TOKEN not set' };

	if (!params.styles || params.styles.length === 0) {
		return { ok: false, error: 'qwen step 1 returned no styles' };
	}

	// Sequential per style — politeness over throughput. Discogs allows
	// 60 req/min authenticated and we're well under, but bursting offers
	// no benefit here and sequential keeps the logs readable.
	const perStyleCounts: Record<string, number> = {};
	const allCandidates: Candidate[] = [];
	for (const style of params.styles) {
		const candidates = await fetchOneStyle(style, params, token);
		perStyleCounts[style] = candidates.length;
		allCandidates.push(...candidates);
	}

	// Dedupe by master_id (canonical), with artist+title as backup for
	// records that lack a master_id (rare but possible for very old uploads).
	// Cap PER_ARTIST_CAP albums per artist in the same pass so high-notability
	// artists don't dominate the pool.
	const seenMasters = new Set<number>();
	const seenKeys = new Set<string>();
	const perArtistCount = new Map<string, number>();
	const deduped: Candidate[] = [];
	for (const c of allCandidates) {
		const key = albumKey(c.artist, c.title);
		if (c.master_id && seenMasters.has(c.master_id)) continue;
		if (seenKeys.has(key)) continue;
		const artistKey = c.artist.toLowerCase().trim();
		const artistCount = perArtistCount.get(artistKey) ?? 0;
		if (artistCount >= PER_ARTIST_CAP) continue;
		if (c.master_id) seenMasters.add(c.master_id);
		seenKeys.add(key);
		perArtistCount.set(artistKey, artistCount + 1);
		deduped.push(c);
	}

	// Crate filter. Match on artist+title (case-insensitive, trimmed) since
	// master_id won't be in the user's albums table — Albumz stores arbitrary
	// CSV-imported albums without Discogs IDs.
	const { data: ownedAlbums } = await supabase
		.from('albums')
		.select('artist, title')
		.eq('user_id', userId)
		.eq('ownership', 'OWN');

	const ownedKeys = new Set((ownedAlbums ?? []).map((a) => albumKey(a.artist, a.title)));

	const beforeFilter = deduped.length;
	const filtered = deduped.filter((c) => !ownedKeys.has(albumKey(c.artist, c.title)));
	const filteredOutFromCrate = beforeFilter - filtered.length;

	const final = filtered.slice(0, POOL_TARGET);

	return { ok: true, candidates: final, perStyleCounts, filteredOutFromCrate };
}
