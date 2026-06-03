// Listening-baseline profile for the discovery flow's qwen-step-1 (nudge
// interpretation). Pulls the user's recent scrobbles, batches Last.fm artist
// tags via the existing cache, and returns a weighted top-tag profile plus
// the top played artists. Lives in its own module rather than extracting
// from digest-data.server.ts so the digest pipeline stays untouched and this
// helper is free to evolve for discovery's needs.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRecentTracks, getArtistTopTagsBatch } from '$lib/lastfm.server';

const DEFAULT_LOOKBACK_DAYS = 7;
const TOP_TAGS = 8;
const TOP_ARTISTS = 10;
const ARTIST_TAGS_IN_PROFILE = 3;

export type ListeningBaseline = {
	playCount: number;
	lookbackDays: number;
	topTags: string[];
	topArtists: Array<{
		artist: string;
		plays: number;
		tags: string[];
	}>;
};

export type BaselineResult =
	| { ok: true; baseline: ListeningBaseline }
	| { ok: false; error: 'no-lastfm' | 'no-recent-plays' | 'profile-missing' };

export async function buildListeningBaseline(
	supabase: SupabaseClient,
	userId: string,
	lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Promise<BaselineResult> {
	const { data: profile } = await supabase
		.from('profiles')
		.select('last_fm_username')
		.eq('id', userId)
		.maybeSingle();

	if (!profile) return { ok: false, error: 'profile-missing' };
	if (!profile.last_fm_username) return { ok: false, error: 'no-lastfm' };

	const now = Math.floor(Date.now() / 1000);
	const from = now - lookbackDays * 24 * 60 * 60;
	const scrobbles = await fetchRecentTracks(profile.last_fm_username, from, now);

	if (scrobbles.length === 0) return { ok: false, error: 'no-recent-plays' };

	const artistPlays = new Map<string, number>();
	const artistDisplay = new Map<string, string>();
	for (const s of scrobbles) {
		const key = s.artist.toLowerCase().trim();
		if (!key) continue;
		artistPlays.set(key, (artistPlays.get(key) ?? 0) + 1);
		if (!artistDisplay.has(key)) artistDisplay.set(key, s.artist);
	}

	const tagMap = await getArtistTopTagsBatch(supabase, Array.from(artistPlays.keys()));

	const tagWeights = new Map<string, number>();
	for (const [key, plays] of artistPlays.entries()) {
		for (const tag of tagMap.get(key) ?? []) {
			tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + plays);
		}
	}

	const topTags = Array.from(tagWeights.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, TOP_TAGS)
		.map(([t]) => t);

	const topArtists = Array.from(artistPlays.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, TOP_ARTISTS)
		.map(([key, plays]) => ({
			artist: artistDisplay.get(key) ?? key,
			plays,
			tags: (tagMap.get(key) ?? []).slice(0, ARTIST_TAGS_IN_PROFILE)
		}));

	return {
		ok: true,
		baseline: {
			playCount: scrobbles.length,
			lookbackDays,
			topTags,
			topArtists
		}
	};
}
