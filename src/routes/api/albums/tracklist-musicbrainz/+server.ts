// GET /api/albums/tracklist-musicbrainz?mbid=
//
// Fetches a specific MusicBrainz release's tracklist by MBID. Used by the
// album-edit lookup-panel chooser when the user picks an alternate MB release
// (e.g. switching from "CD" to "EP+Demo" pressing). MusicBrainz is the only
// source that exposes release variants this granularly.

import { error, json } from '@sveltejs/kit';
import { fetchMusicBrainzRelease } from '$lib/tracklist.server';
import type { RequestHandler } from './$types';

const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const mbid = (url.searchParams.get('mbid') ?? '').trim();
	if (!MBID_RE.test(mbid)) error(400, 'mbid must be a valid MusicBrainz UUID');

	const result = await fetchMusicBrainzRelease(mbid);
	return json(result);
};
