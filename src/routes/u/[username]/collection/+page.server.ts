import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const username = params.username.toLowerCase();

	const { data: profile, error: profileError } = await locals.supabase
		.from('profiles')
		.select('id, username, display_name')
		.eq('username', username)
		.maybeSingle();

	if (profileError) error(500, profileError.message);
	if (!profile) error(404, 'No collection at this URL.');

	const { data: albums, error: albumsError } = await locals.supabase
		.from('albums')
		.select('id, artist, title, year, format, rating, cover_url, accent_color, tags')
		.eq('user_id', profile.id)
		.eq('ownership', 'OWN')
		.eq('hidden', false)
		.order('artist', { ascending: true });

	if (albumsError) error(500, albumsError.message);

	return { profile, albums: albums ?? [] };
};
