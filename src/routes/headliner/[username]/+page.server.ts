import { error } from '@sveltejs/kit';
import { fetchNowPlaying, type NowPlayingResult } from '$lib/now-playing';
import { classifyNowPlayingSource } from '$lib/spins.server';
import type { PageServerLoad } from './$types';

export interface IdleTile {
	id: string;
	artist: string;
	title: string;
	imageUrl: string;
}

const IDLE_TILE_CAP = 60;

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	const username = params.username.toLowerCase();

	const { data: profile, error: profileError } = await locals.supabase
		.from('profiles')
		.select('id, username, display_name, last_fm_username')
		.eq('username', username)
		.maybeSingle();

	if (profileError) error(500, profileError.message);
	if (!profile) error(404, 'No user at this URL.');

	let initial: NowPlayingResult = {
		state: 'none', track: null, artist: null, album: null,
		coverUrl: null, coverCandidates: [], playedAt: null, source: null
	};
	if (profile.last_fm_username) {
		initial = await fetchNowPlaying(profile.last_fm_username);
		if (initial.state !== 'none' && initial.artist && initial.track) {
			initial.source = await classifyNowPlayingSource(
				locals.supabase, profile.id, initial.artist, initial.track
			);
		}
	}

	const { data: idleRows } = await locals.supabase
		.from('albums')
		.select('id, artist, title, cover_url')
		.eq('user_id', profile.id)
		.eq('ownership', 'OWN')
		.eq('hidden', false)
		.not('cover_url', 'is', null)
		.order('created_at', { ascending: false })
		.limit(IDLE_TILE_CAP);

	const idleTiles: IdleTile[] = (idleRows ?? []).map((r) => ({
		id: r.id,
		artist: r.artist,
		title: r.title,
		imageUrl: r.cover_url as string
	}));

	// Is the viewer looking at their own Headliner? Drives whether the
	// Spin-the-disc ritual card shows.
	const { user: viewer } = await locals.safeGetSession();
	const isOwner = viewer?.id === profile.id;

	// Don't cache owner-personalized pages — isOwner depends on the viewer.
	if (!isOwner) setHeaders({ 'cache-control': 'public, max-age=10' });

	return { profile, initial, idleTiles, isOwner };
};
