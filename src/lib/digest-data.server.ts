// Server-side assembly of the weekly-digest input payload. Pulls a user's
// listening for a week, picks a dormant album from their own collection
// (rediscovery) and an album from someone else's public collection
// (discovery), and formats everything into the shapes the prompt expects.
//
// MVP scope: top_tags and patterns_observed are placeholders. Tag aggregation
// (via Last.fm per-artist top tags) and pattern computation are real work
// that can land in a follow-up — the prompt accepts em-dashes there without
// regenerating poorly.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DigestInputs } from './digest-prompt';
import { fetchRecentTracks, type LastfmScrobble } from './lastfm.server';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Returns the most recent Sunday on or before the given date, at 00:00 UTC. */
export function previousSunday(d = new Date()): Date {
	const result = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	result.setUTCDate(result.getUTCDate() - result.getUTCDay());
	return result;
}

/** The Sunday that ends the *current* week — today if today is Sunday,
 *  otherwise the upcoming Sunday. Used as the default for manual digest
 *  generation so an in-progress week is digestible mid-week. */
export function currentWeekEnding(d = new Date()): Date {
	const result = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	const day = result.getUTCDay();
	const daysUntilSunday = day === 0 ? 0 : 7 - day;
	result.setUTCDate(result.getUTCDate() + daysUntilSunday);
	return result;
}

function fmtWeekEnding(d: Date): string {
	return d.toLocaleDateString('en-US', {
		timeZone: 'UTC',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});
}

function keyOf(artist: string, title: string): string {
	return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
}

export type DigestAssembly =
	| { ok: true; inputs: DigestInputs }
	| { ok: false; error: string };

export async function assembleDigest(
	supabase: SupabaseClient,
	userId: string,
	weekEnding: Date
): Promise<DigestAssembly> {
	// Week window: Monday 00:00 UTC through end of the given Sunday.
	const weekStart = new Date(weekEnding);
	weekStart.setUTCDate(weekStart.getUTCDate() - 6);
	const weekEndExclusive = new Date(weekEnding);
	weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 1);

	// Profile — for display name + Last.fm username.
	const { data: profile } = await supabase
		.from('profiles')
		.select('username, display_name, last_fm_username')
		.eq('id', userId)
		.maybeSingle();
	if (!profile) return { ok: false, error: 'Profile not found.' };

	// Two sources to merge:
	//   1. spins table 'spun' rows = ground-truth physical plays Spin caught
	//   2. Last.fm scrobbles = the user's broader listening history (includes
	//      auto-scrobbled physical plays AND everything they streamed without
	//      Spin running). Cross-reference (1) against (2) to mark which
	//      scrobbles were the physical plays.
	const { data: spunRows, error: spunErr } = await supabase
		.from('spins')
		.select('artist, track, album, identified_at')
		.eq('user_id', userId)
		.eq('source', 'spun')
		.gte('identified_at', weekStart.toISOString())
		.lt('identified_at', weekEndExclusive.toISOString())
		.order('identified_at', { ascending: true });
	if (spunErr) return { ok: false, error: spunErr.message };

	let scrobbles: LastfmScrobble[] = [];
	if (profile.last_fm_username) {
		const fromUnix = Math.floor(weekStart.getTime() / 1000);
		const toUnix = Math.floor(weekEndExclusive.getTime() / 1000);
		scrobbles = await fetchRecentTracks(profile.last_fm_username, fromUnix, toUnix);
	}

	// If Last.fm wasn't reachable (or user isn't connected), fall back to also
	// pulling streamed rows from the spins table — partial picture, but better
	// than nothing.
	let streamedFallback: { artist: string; track: string; album: string | null; identified_at: string }[] = [];
	if (scrobbles.length === 0) {
		const { data } = await supabase
			.from('spins')
			.select('artist, track, album, identified_at')
			.eq('user_id', userId)
			.eq('source', 'streamed')
			.gte('identified_at', weekStart.toISOString())
			.lt('identified_at', weekEndExclusive.toISOString());
		streamedFallback = data ?? [];
	}

	type Event = {
		artist: string;
		track: string;
		album: string | null;
		timestamp: number;
		source: 'spun' | 'streamed';
	};

	const events: Event[] = [];

	for (const sp of spunRows ?? []) {
		events.push({
			artist: sp.artist,
			track: sp.track,
			album: sp.album,
			timestamp: Math.floor(new Date(sp.identified_at).getTime() / 1000),
			source: 'spun'
		});
	}

	// Cross-reference scrobbles against spun events. Scrobble within ±10 min
	// of a spun event with same artist+track is the auto-scrobble of that
	// physical play; skip (already added). Everything else is streamed.
	const TEN_MIN = 10 * 60;
	for (const sc of scrobbles) {
		const matched = events.some(
			(e) =>
				e.source === 'spun' &&
				e.artist.toLowerCase() === sc.artist.toLowerCase() &&
				e.track.toLowerCase() === sc.track.toLowerCase() &&
				Math.abs(e.timestamp - sc.playedAtUnix) < TEN_MIN
		);
		if (matched) continue;
		events.push({
			artist: sc.artist,
			track: sc.track,
			album: sc.album,
			timestamp: sc.playedAtUnix,
			source: 'streamed'
		});
	}

	// Fallback streamed rows when Last.fm unavailable.
	for (const sf of streamedFallback) {
		events.push({
			artist: sf.artist,
			track: sf.track,
			album: sf.album,
			timestamp: Math.floor(new Date(sf.identified_at).getTime() / 1000),
			source: 'streamed'
		});
	}

	events.sort((a, b) => a.timestamp - b.timestamp);

	if (events.length === 0) {
		return { ok: false, error: 'No plays recorded for this week — nothing to write about yet.' };
	}

	// Cap at 30 lines so we don't drown the model in tokens.
	const capped = events.length > 30 ? events.slice(-30) : events;
	const listening_log = capped
		.map((e) => {
			const dow = DOW[new Date(e.timestamp * 1000).getUTCDay()];
			const sourceMark = e.source === 'streamed' ? '[*]' : '[s]';
			const albumPart = e.album ? ` (${e.album})` : '';
			return `${dow} — ${e.artist} — ${e.track}${albumPart} ${sourceMark}`;
		})
		.join('\n');

	// Owned albums — used for both rediscovery and discovery-exclusion.
	const { data: ownedAlbums } = await supabase
		.from('albums')
		.select('id, artist, title, year')
		.eq('user_id', userId)
		.eq('ownership', 'OWN')
		.limit(2000);

	const ownedKeys = new Set((ownedAlbums ?? []).map((a) => keyOf(a.artist, a.title)));

	// Rediscovery: an owned album with no spin in the last 90 days. Pull a
	// window of recent spins, exclude albums whose tracks appear in it.
	let rediscovery_pick = '—';
	let rediscovery_hook = '—';

	if (ownedAlbums && ownedAlbums.length > 0) {
		const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
		const { data: recentSpins } = await supabase
			.from('spins')
			.select('artist, album')
			.eq('user_id', userId)
			.gte('identified_at', ninetyDaysAgo.toISOString());

		const recentlySpunAlbumKeys = new Set(
			(recentSpins ?? [])
				.filter((s) => s.album)
				.map((s) => keyOf(s.artist, s.album as string))
		);

		const dormant = ownedAlbums.filter(
			(a) => !recentlySpunAlbumKeys.has(keyOf(a.artist, a.title))
		);

		if (dormant.length > 0) {
			const pick = dormant[Math.floor(Math.random() * dormant.length)];
			const yearPart = pick.year ? ` (${pick.year})` : '';
			rediscovery_pick = `${pick.artist} — ${pick.title}${yearPart}`;
			rediscovery_hook =
				'a dormant pick from their own shelf — no specific musical link to this week, just an album that has gone untouched for a while.';
		}
	}

	// Discovery: an album from any other user's public collection that this
	// user doesn't own. Sample a window and filter.
	let discovery_pick = '—';
	let discovery_hook = '—';

	const { data: otherAlbums } = await supabase
		.from('albums')
		.select('artist, title, year')
		.neq('user_id', userId)
		.eq('ownership', 'OWN')
		.eq('hidden', false)
		.limit(500);

	const candidates = (otherAlbums ?? []).filter(
		(a) => !ownedKeys.has(keyOf(a.artist, a.title))
	);
	if (candidates.length > 0) {
		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		const yearPart = pick.year ? ` (${pick.year})` : '';
		discovery_pick = `${pick.artist} — ${pick.title}${yearPart}`;
		discovery_hook =
			"a wildcard pull from another Albumz collection — no known musical connection to this week's listening, surfaced for the sake of widening the room.";
	}

	// Both picks are mandatory for the prompt to produce a clean column.
	if (rediscovery_pick === '—') {
		return { ok: false, error: 'No dormant album to surface — all owned albums have been spun recently.' };
	}
	if (discovery_pick === '—') {
		return { ok: false, error: 'No discovery candidate found — not enough albums in other collections yet.' };
	}

	return {
		ok: true,
		inputs: {
			display_name: profile.display_name || profile.username,
			week_ending: fmtWeekEnding(weekEnding),
			listening_log,
			top_tags: '—',
			patterns_observed: '—',
			rediscovery_pick,
			rediscovery_hook,
			discovery_pick,
			discovery_hook
		}
	};
}
