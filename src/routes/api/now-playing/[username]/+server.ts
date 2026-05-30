import { error, json } from '@sveltejs/kit';
import { fetchNowPlaying } from '$lib/now-playing';
import { classifyNowPlayingSource } from '$lib/spins.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	const username = params.username.toLowerCase();

	const { data: profile, error: profileError } = await locals.supabase
		.from('profiles')
		.select('id, username, last_fm_username')
		.eq('username', username)
		.maybeSingle();

	if (profileError) error(500, profileError.message);
	if (!profile) error(404, 'User not found.');
	if (!profile.last_fm_username) {
		return json({
			state: 'none', track: null, artist: null, album: null,
			coverUrl: null, coverCandidates: [], playedAt: null, source: null
		});
	}

	const result = await fetchNowPlaying(profile.last_fm_username);
	if (result.state !== 'none' && result.artist && result.track) {
		result.source = await classifyNowPlayingSource(
			locals.supabase, profile.id, result.artist, result.track
		);
	}

	// Cache briefly so Headliner polling 15s isn't a thundering herd if hit by multiple devices
	setHeaders({ 'cache-control': 'public, max-age=10' });

	return json(result);
};
