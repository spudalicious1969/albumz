import { error, json } from '@sveltejs/kit';
import { searchCovers } from '$lib/cover-search';
import type { RequestHandler } from './$types';

// Cap per-request to keep latency bounded and avoid hammering the proxies
const MAX_PER_REQUEST = 10;

interface RequestBody {
	albumIds: string[];
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not authenticated');

	const body = (await request.json()) as RequestBody;
	const ids = (body.albumIds ?? []).slice(0, MAX_PER_REQUEST);
	if (ids.length === 0) return json({ results: [] });

	// Load the albums we're about to look up — only ones owned by this user
	const { data: albums, error: dbError } = await locals.supabase
		.from('albums')
		.select('id, artist, title, cover_url')
		.in('id', ids)
		.eq('user_id', user.id);

	if (dbError) error(500, dbError.message);

	const results = await Promise.all(
		(albums ?? []).map(async (album) => {
			// Skip if already has a cover
			if (album.cover_url) return { id: album.id, status: 'skipped' as const };

			const covers = await searchCovers(album.artist, album.title);
			const top = covers[0];

			if (!top) return { id: album.id, status: 'not_found' as const };

			const { error: updateError } = await locals.supabase
				.from('albums')
				.update({ cover_url: top.url })
				.eq('id', album.id)
				.eq('user_id', user.id);

			if (updateError) return { id: album.id, status: 'error' as const, message: updateError.message };
			return { id: album.id, status: 'updated' as const, cover_url: top.url };
		})
	);

	return json({ results });
};
