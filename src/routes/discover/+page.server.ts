import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	buildListeningBaseline,
	type ListeningBaseline
} from '$lib/discovery/baseline.server';
import {
	interpretNudge,
	type DiscogsSearchParams
} from '$lib/discovery/interpret-nudge.server';
import {
	fetchDiscogsPool,
	type Candidate
} from '$lib/discovery/discogs-pool.server';
import {
	curateCandidates,
	type CuratedPick
} from '$lib/discovery/curate.server';
import { spotifyAlbumUrl } from '$lib/external-links.server';

export type DisplayPick = CuratedPick & { spotifyUrl: string | null };

// Discovery — steering wheel, not recommender. Full pipeline:
//   1. Build listening baseline (Last.fm scrobbles → top tags + artists).
//   2. Qwen step 1: translate nudge → Discogs search params.
//   3. Discogs search → candidate pool (filtered against crate, capped per artist).
//   4. Qwen step 2: pick 3-5 + write a "why" sentence each.
//   5. (next) Render picks in atmospheric AlbumHero-style layout.

type DiscoverResult = {
	baseline: ListeningBaseline | null;
	baselineError: 'no-lastfm' | 'no-recent-plays' | 'profile-missing' | null;
	params: DiscogsSearchParams | null;
	interpretError: string | null;
	candidates: Candidate[] | null;
	perStyleCounts: Record<string, number> | null;
	filteredOutFromCrate: number;
	poolError: string | null;
	picks: DisplayPick[] | null;
	curateError: string | null;
};

const EMPTY_RESULT: DiscoverResult = {
	baseline: null,
	baselineError: null,
	params: null,
	interpretError: null,
	candidates: null,
	perStyleCounts: null,
	filteredOutFromCrate: 0,
	poolError: null,
	picks: null,
	curateError: null
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const nudge = url.searchParams.get('nudge')?.trim() || null;
	if (!nudge) return { nudge: null, result: EMPTY_RESULT };

	const baselineResult = await buildListeningBaseline(locals.supabase, user.id);
	if (!baselineResult.ok) {
		return {
			nudge,
			result: { ...EMPTY_RESULT, baselineError: baselineResult.error }
		};
	}

	const interpretResult = await interpretNudge(baselineResult.baseline, nudge);
	if (!interpretResult.ok) {
		return {
			nudge,
			result: {
				...EMPTY_RESULT,
				baseline: baselineResult.baseline,
				interpretError: interpretResult.error
			}
		};
	}

	const poolResult = await fetchDiscogsPool(
		locals.supabase,
		user.id,
		interpretResult.params
	);
	if (!poolResult.ok) {
		return {
			nudge,
			result: {
				...EMPTY_RESULT,
				baseline: baselineResult.baseline,
				params: interpretResult.params,
				poolError: poolResult.error
			}
		};
	}

	const curateResult = await curateCandidates(
		poolResult.candidates,
		nudge,
		baselineResult.baseline
	);
	if (!curateResult.ok) {
		return {
			nudge,
			result: {
				...EMPTY_RESULT,
				baseline: baselineResult.baseline,
				params: interpretResult.params,
				candidates: poolResult.candidates,
				perStyleCounts: poolResult.perStyleCounts,
				filteredOutFromCrate: poolResult.filteredOutFromCrate,
				curateError: curateResult.error
			}
		};
	}

	// Enrich each pick with a direct Spotify album URL (parallel lookups).
	// Discogs link stays on the cover for "dig deeper"; the explicit
	// "Listen on Spotify" link below the why is the listen-first action.
	const picksWithSpotify: DisplayPick[] = await Promise.all(
		curateResult.picks.map(async (p) => ({
			...p,
			spotifyUrl: await spotifyAlbumUrl(p.artist, p.title)
		}))
	);

	return {
		nudge,
		result: {
			...EMPTY_RESULT,
			baseline: baselineResult.baseline,
			params: interpretResult.params,
			candidates: poolResult.candidates,
			perStyleCounts: poolResult.perStyleCounts,
			filteredOutFromCrate: poolResult.filteredOutFromCrate,
			picks: picksWithSpotify
		}
	};
};
