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

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Returns the most recent Sunday on or before the given date, at 00:00 UTC. */
export function previousSunday(d = new Date()): Date {
	const result = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	result.setUTCDate(result.getUTCDate() - result.getUTCDay());
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

	// Profile — for display name.
	const { data: profile } = await supabase
		.from('profiles')
		.select('username, display_name')
		.eq('id', userId)
		.maybeSingle();
	if (!profile) return { ok: false, error: 'Profile not found.' };

	// Spins for the week, oldest first.
	const { data: spins, error: spinsErr } = await supabase
		.from('spins')
		.select('artist, track, album, identified_at, source')
		.eq('user_id', userId)
		.gte('identified_at', weekStart.toISOString())
		.lt('identified_at', weekEndExclusive.toISOString())
		.order('identified_at', { ascending: true });

	if (spinsErr) return { ok: false, error: spinsErr.message };
	if (!spins || spins.length === 0) {
		return { ok: false, error: 'No plays recorded for this week — nothing to write about yet.' };
	}

	// Format chronological listening log. Cap at 30 lines so we don't drown
	// the model in tokens — if more, prefer recency + repetition.
	const lines = spins.slice(0, 30).map((s) => {
		const dow = DOW[new Date(s.identified_at).getUTCDay()];
		const sourceMark = s.source === 'streamed' ? '[*]' : '[s]';
		const albumPart = s.album ? ` (${s.album})` : '';
		return `${dow} — ${s.artist} — ${s.track}${albumPart} ${sourceMark}`;
	});
	const listening_log = lines.join('\n');

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
			rediscovery_hook = "hasn't been pulled out in months; sits alongside what you spun this week.";
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
		discovery_hook = "from another collection in Albumz; worth a listen if the week's mood holds.";
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
