import { fetchMosaicTiles } from '$lib/mosaic';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const { user } = await locals.safeGetSession();

	// Logged-out visitors get the ambient mosaic landing
	if (!user) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('username, display_name, last_fm_username')
			.not('last_fm_username', 'is', null);

		const tiles = await fetchMosaicTiles(locals.supabase, profiles ?? []);

		// Light HTTP-level caching so visitors hitting the landing back-to-back don't hammer Last.fm
		setHeaders({ 'cache-control': 'public, max-age=60' });

		return { mode: 'mosaic' as const, tiles };
	}

	// Logged-in: collection
	const { data: albums, error } = await locals.supabase
		.from('albums')
		.select('id, artist, title, year, format, rating, ownership, cover_url, accent_color, created_at')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	return {
		mode: 'collection' as const,
		user,
		albums: albums ?? [],
		error: error?.message ?? null
	};
};
