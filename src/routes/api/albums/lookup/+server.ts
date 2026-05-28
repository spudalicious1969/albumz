import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Not signed in');

	const { data, error: dbError } = await locals.supabase
		.from('albums')
		.select('id, artist, title, year, format, ownership, cover_url')
		.eq('user_id', user.id)
		.order('artist', { ascending: true })
		.order('title', { ascending: true });

	if (dbError) throw error(500, dbError.message);

	return json({ albums: data ?? [] }, {
		headers: { 'cache-control': 'no-store' }
	});
};
