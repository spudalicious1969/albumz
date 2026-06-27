import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Not signed in');

	const { data, error: dbError } = await locals.supabase
		.from('albums')
		.select('id, artist, title, year, format, ownership, cover_url, tracklist')
		.eq('user_id', user.id)
		.order('artist', { ascending: true })
		.order('title', { ascending: true });

	if (dbError) throw error(500, dbError.message);

	// Flatten each album's pinned tracklist down to just its track names so the
	// ⌘K palette can answer "do I have the album with this song on it?" without
	// shipping positions/durations. Strip the full tracklist jsonb back off the
	// row to keep the payload lean.
	const albums = (data ?? []).map(({ tracklist, ...rest }) => {
		const snap = tracklist as { tracks?: Array<{ name?: unknown }> } | null;
		const tracks = Array.isArray(snap?.tracks)
			? snap.tracks
					.map((t) => (typeof t?.name === 'string' ? t.name.trim() : ''))
					.filter((n): n is string => n.length > 0)
			: [];
		return { ...rest, tracks };
	});

	return json(
		{ albums },
		{
			headers: { 'cache-control': 'no-store' }
		}
	);
};
