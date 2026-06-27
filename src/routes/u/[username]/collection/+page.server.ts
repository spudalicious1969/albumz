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
		.select('id, artist, title, year, format, rating, cover_url, accent_color, tags, tracklist')
		.eq('user_id', profile.id)
		.eq('ownership', 'OWN')
		.eq('hidden', false)
		.order('artist', { ascending: true });

	if (albumsError) error(500, albumsError.message);

	// Compact track-name index for client-side song search, keyed by album id.
	// Only the track *names* travel (no positions/durations), and we strip the
	// full tracklist jsonb back off the album rows so the cards stay light and
	// the Album type the page sees is unchanged. At ~300 bytes/album gzipped this
	// rides along cheaply up to ~1,500-album collections; past that, switch to a
	// server-side jsonb query instead of bundling.
	const trackIndex: Record<string, string[]> = {};
	const rows = albums ?? [];
	for (const a of rows) {
		const snap = a.tracklist as { tracks?: Array<{ name?: unknown }> } | null;
		const names = Array.isArray(snap?.tracks)
			? snap.tracks
					.map((t) => (typeof t?.name === 'string' ? t.name.trim() : ''))
					.filter((n): n is string => n.length > 0)
			: [];
		if (names.length > 0) trackIndex[a.id] = names;
		delete (a as { tracklist?: unknown }).tracklist;
	}

	return { profile, albums: rows, trackIndex };
};
