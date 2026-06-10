import { error } from '@sveltejs/kit';
import { buildCsv, exportFilename, type ExportableAlbum } from '$lib/export/csv';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Not signed in');

	const [profileRes, albumsRes] = await Promise.all([
		locals.supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
		locals.supabase
			.from('albums')
			.select(
				'artist, title, year, format, label, rating, notes, tags, ownership, hidden, cover_url, accent_color, discogs_id, created_at'
			)
			.eq('user_id', user.id)
			.order('artist', { ascending: true })
			.order('title', { ascending: true })
	]);

	if (albumsRes.error) throw error(500, albumsRes.error.message);

	const csv = buildCsv((albumsRes.data ?? []) as ExportableAlbum[]);
	const filename = exportFilename(profileRes.data?.username ?? 'collection');

	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
};
