import type { SupabaseClient } from '@supabase/supabase-js';

/** Decide whether a Last.fm now-playing track is being physically spun
 * (matching recent Shazam-identified spin in our DB) or streamed (no match).
 *
 * "Recent" = within the last 6 minutes — long enough to catch a track that
 * was identified at the start of playback by the mic listener, short enough
 * that a stale ID from earlier in the session doesn't bleed over. */
export async function classifyNowPlayingSource(
	supabase: SupabaseClient,
	userId: string,
	artist: string,
	track: string,
	windowMinutes = 6
): Promise<'spun' | 'streamed'> {
	const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
	const { data } = await supabase
		.from('spins')
		.select('id')
		.eq('user_id', userId)
		.ilike('artist', artist)
		.ilike('track', track)
		.gte('identified_at', cutoff)
		.limit(1)
		.maybeSingle();
	return data ? 'spun' : 'streamed';
}
