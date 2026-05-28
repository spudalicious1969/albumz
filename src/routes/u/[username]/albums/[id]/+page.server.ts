import { error } from '@sveltejs/kit';
import { resolveExternalLinks } from '$lib/external-links.server';
import { fetchTracklist } from '$lib/tracklist.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	// Find the profile so we know whose collection we're looking at
	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('id, username, display_name')
		.eq('username', params.username)
		.maybeSingle();

	if (!profile) error(404, 'User not found');

	// Find the album — RLS already restricts to non-hidden OWN albums for
	// anonymous viewers, but be explicit so we get a clean 404 not a generic empty.
	const { data: album, error: dbError } = await locals.supabase
		.from('albums')
		.select(
			'id, artist, title, year, format, label, rating, ownership, notes, tags, hidden, cover_url, accent_color, user_id'
		)
		.eq('id', params.id)
		.eq('user_id', profile.id)
		.eq('hidden', false)
		.eq('ownership', 'OWN')
		.maybeSingle();

	if (dbError) error(500, dbError.message);
	if (!album) error(404, 'Album not found');

	const [externalLinks, tracklist] = await Promise.all([
		resolveExternalLinks(album.artist, album.title),
		fetchTracklist(album.artist, album.title)
	]);

	// Light HTTP caching — album pages aren't user-state-dependent
	setHeaders({ 'cache-control': 'public, max-age=60' });

	return { profile, album, externalLinks, tracklist };
};
