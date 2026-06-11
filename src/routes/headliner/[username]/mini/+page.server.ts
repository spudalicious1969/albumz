import { error } from '@sveltejs/kit';
import { fetchNowPlaying, type NowPlayingResult } from '$lib/now-playing';
import { classifyNowPlayingSource } from '$lib/spins.server';
import type { PageServerLoad } from './$types';

// Mini Headliner: a compact now-playing widget meant to live in a small,
// corner-of-the-screen browser window while you listen. Same data spine as the
// full Headliner minus the idle mosaic — no idleTiles fetch, since a one-tile
// "mosaic" is just a cover with delusions of grandeur. The listen toggle reuses
// the global spin store + SpinSessionRunner (mounted in the root layout), so
// there's no recorder code here.

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	const username = params.username.toLowerCase();

	const { data: profile, error: profileError } = await locals.supabase
		.from('profiles')
		.select('id, username, display_name, last_fm_username')
		.eq('username', username)
		.maybeSingle();

	if (profileError) error(500, profileError.message);
	if (!profile) error(404, 'No user at this URL.');

	let initial: NowPlayingResult = {
		state: 'none',
		track: null,
		artist: null,
		album: null,
		coverUrl: null,
		coverCandidates: [],
		playedAt: null,
		source: null
	};
	if (profile.last_fm_username) {
		initial = await fetchNowPlaying(profile.last_fm_username);
		if (initial.state !== 'none' && initial.artist && initial.track) {
			initial.source = await classifyNowPlayingSource(
				locals.supabase,
				profile.id,
				initial.artist,
				initial.track
			);
		}
	}

	// Is the viewer looking at their own mini Headliner? Drives whether the
	// listen toggle shows — only the owner's mic catches their own spins.
	const { user: viewer } = await locals.safeGetSession();
	const isOwner = viewer?.id === profile.id;

	// Don't cache owner-personalized pages — isOwner depends on the viewer.
	if (!isOwner) setHeaders({ 'cache-control': 'public, max-age=10' });

	return { profile, initial, isOwner };
};
