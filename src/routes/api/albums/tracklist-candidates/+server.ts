// GET /api/albums/tracklist-candidates?artist=&title=
//
// Returns per-source tracklist candidates for the album-edit lookup panel
// chooser. The user picks one and POSTs to /api/albums/:id/apply-suggestion
// to snapshot it onto the album row. Non-empty sources only — empty/error
// fetches are filtered out so the UI doesn't render dead rows.

import { error, json } from '@sveltejs/kit';
import { fetchTracklistCandidates } from '$lib/tracklist.server';
import type { TracklistResult } from '$lib/tracklist';
import type { RequestHandler } from './$types';

export type TracklistCandidates = { candidates: TracklistResult[] };

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const artist = (url.searchParams.get('artist') ?? '').trim();
	const title = (url.searchParams.get('title') ?? '').trim();
	if (!artist || !title) return json({ candidates: [] } satisfies TracklistCandidates);

	const all = await fetchTracklistCandidates(artist, title);
	const candidates = all.filter((c) => c.tracks.length > 0);

	return json({ candidates } satisfies TracklistCandidates);
};
