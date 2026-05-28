import { error } from '@sveltejs/kit';
import { fetchNowPlaying, type NowPlayingResult } from '$lib/now-playing';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	const username = params.username.toLowerCase();

	const { data: profile, error: profileError } = await locals.supabase
		.from('profiles')
		.select('username, display_name, last_fm_username')
		.eq('username', username)
		.maybeSingle();

	if (profileError) error(500, profileError.message);
	if (!profile) error(404, 'No user at this URL.');

	let initial: NowPlayingResult = {
		state: 'none', track: null, artist: null, album: null, coverUrl: null, playedAt: null
	};
	if (profile.last_fm_username) {
		initial = await fetchNowPlaying(profile.last_fm_username);
	}

	setHeaders({ 'cache-control': 'public, max-age=10' });

	return { profile, initial };
};
