import { error } from '@sveltejs/kit';
import { fetchNowPlaying, type NowPlayingResult } from '$lib/now-playing';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	const username = params.username.toLowerCase();

	// Profile (public)
	const { data: profile, error: profileError } = await locals.supabase
		.from('profiles')
		.select('id, username, display_name, last_fm_username, featured_album_id, avatar_url, email_hash')
		.eq('username', username)
		.maybeSingle();

	if (profileError) error(500, profileError.message);
	if (!profile) error(404, 'No collection at this URL.');

	// Pull the recent additions (RLS already filters to non-hidden + owned)
	const { data: recent, error: recentError } = await locals.supabase
		.from('albums')
		.select('id, artist, title, year, cover_url, accent_color, created_at')
		.eq('user_id', profile.id)
		.eq('ownership', 'OWN')
		.eq('hidden', false)
		.order('created_at', { ascending: false })
		.limit(12);

	if (recentError) error(500, recentError.message);

	// Hero album: featured (user-picked) → fallback to most recently added
	let featured = null;
	if (profile.featured_album_id) {
		const { data } = await locals.supabase
			.from('albums')
			.select('id, artist, title, year, cover_url, accent_color')
			.eq('id', profile.featured_album_id)
			.eq('hidden', false)
			.maybeSingle();
		featured = data;
	}
	if (!featured && recent?.length) {
		featured = recent[0];
	}

	// Total visible count for the CTA
	const { count: totalCount } = await locals.supabase
		.from('albums')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', profile.id)
		.eq('ownership', 'OWN')
		.eq('hidden', false);

	// Now-playing — only if they've linked Last.fm
	let nowPlaying: NowPlayingResult = {
		state: 'none', track: null, artist: null, album: null, coverUrl: null, playedAt: null
	};
	if (profile.last_fm_username) {
		nowPlaying = await fetchNowPlaying(profile.last_fm_username);
	}

	// Short cache so refresh-spamming the page doesn't hammer Last.fm
	setHeaders({ 'cache-control': 'public, max-age=20' });

	return {
		profile,
		featured,
		recent: recent ?? [],
		totalCount: totalCount ?? 0,
		featuredIsUserPicked: !!profile.featured_album_id,
		nowPlaying
	};
};
