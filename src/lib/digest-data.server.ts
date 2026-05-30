// Server-side assembly of the weekly-digest input payload. Pulls a user's
// listening for a week, then uses Last.fm artist top-tags (cached locally)
// to score similarity between the week's listening and:
//   - dormant owned albums (rediscovery)
//   - non-owned albums from other public collections (discovery)
// Each pick comes with a real hook naming shared tags and an anchor track
// from the week, so the column can reason from genuine overlap. When
// overlap is empty (artist not on Last.fm, sparse listening, etc.) the
// hook falls back to the wildcard framing — the prompt's "Trust the
// hooks" rule keeps the model from inventing connections in that case.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DigestInputs } from './digest-prompt';
import { fetchRecentTracks, getArtistTopTagsBatch, type LastfmScrobble } from './lastfm.server';

// Day-of-week labeling uses the *server's* local timezone, not UTC. UTC
// labels a 10pm-Mountain Saturday play as "Sun" (it's already 04:00 UTC the
// next day) — which the model then narrates as a Sunday session, mismatching
// the user's lived experience of the week. Server tz is correct for Albumz's
// current single-deployment shape; if multi-tz users land in the future,
// pass tz through from the request.
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function dayOfWeekLocal(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
		weekday: 'short',
		timeZone: LOCAL_TZ
	});
}

// Listening-log cap. Originally 30, which silently dropped Tue–Thu plays on
// heavy-listening weeks where Sat alone could be 50+ scrobbles. qwen3.5 has
// 8192 ctx with ~6k tokens of headroom for input; 150 lines is comfortably
// within budget while preserving full-week chronology.
const LISTENING_LOG_CAP = 150;

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

	const capped =
		events.length > LISTENING_LOG_CAP ? events.slice(-LISTENING_LOG_CAP) : events;
	const listening_log = capped
		.map((e) => {
			const dow = dayOfWeekLocal(e.timestamp);
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

	// Identify dormant candidates (owned, not spun in 90 days).
	let dormantCandidates: AlbumCandidate[] = [];
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
		dormantCandidates = ownedAlbums
			.filter((a) => !recentlySpunAlbumKeys.has(keyOf(a.artist, a.title)))
			.map((a) => ({ artist: a.artist, title: a.title, year: a.year }));
	}

	// Discovery candidates: albums in other users' public collections that
	// this user doesn't own.
	const { data: otherAlbums } = await supabase
		.from('albums')
		.select('artist, title, year')
		.neq('user_id', userId)
		.eq('ownership', 'OWN')
		.eq('hidden', false)
		.limit(500);
	const discoveryCandidates: AlbumCandidate[] = (otherAlbums ?? [])
		.filter((a) => !ownedKeys.has(keyOf(a.artist, a.title)))
		.map((a) => ({ artist: a.artist, title: a.title, year: a.year }));

	if (dormantCandidates.length === 0) {
		return { ok: false, error: 'No dormant album to surface — all owned albums have been spun recently.' };
	}
	if (discoveryCandidates.length === 0) {
		return { ok: false, error: 'No discovery candidate found — not enough albums in other collections yet.' };
	}

	// Build a per-artist play profile from the full events array (not the
	// capped listening_log) so similarity reasoning sees the whole week.
	const artistPlays = new Map<string, number>();
	const artistDisplay = new Map<string, string>();
	const artistTrackPlays = new Map<string, Map<string, number>>();
	for (const e of events) {
		const akey = e.artist.toLowerCase().trim();
		artistPlays.set(akey, (artistPlays.get(akey) ?? 0) + 1);
		if (!artistDisplay.has(akey)) artistDisplay.set(akey, e.artist);
		const trackMap = artistTrackPlays.get(akey) ?? new Map<string, number>();
		trackMap.set(e.track, (trackMap.get(e.track) ?? 0) + 1);
		artistTrackPlays.set(akey, trackMap);
	}

	// One batched tag fetch covers week artists + every candidate artist.
	const tagArtists = new Set<string>();
	for (const k of artistPlays.keys()) tagArtists.add(k);
	for (const c of dormantCandidates) tagArtists.add(c.artist.toLowerCase().trim());
	for (const c of discoveryCandidates) tagArtists.add(c.artist.toLowerCase().trim());
	const tagMap = await getArtistTopTagsBatch(supabase, Array.from(tagArtists));

	// Week tag weights: each artist's tags weighted by play count.
	const weekTagWeights = new Map<string, number>();
	for (const [akey, count] of artistPlays.entries()) {
		for (const t of tagMap.get(akey) ?? []) {
			weekTagWeights.set(t, (weekTagWeights.get(t) ?? 0) + count);
		}
	}

	// Per week artist: most-played track + their tags. Used to find the best
	// anchor for a given candidate (artist with strongest tag overlap).
	const weekArtistInfo: WeekArtistInfo[] = [];
	for (const [akey, count] of artistPlays.entries()) {
		const trackMap = artistTrackPlays.get(akey)!;
		let bestTrack = '';
		let bestCount = 0;
		for (const [track, c] of trackMap.entries()) {
			if (c > bestCount) {
				bestCount = c;
				bestTrack = track;
			}
		}
		weekArtistInfo.push({
			display: artistDisplay.get(akey) ?? akey,
			track: bestTrack,
			weight: count,
			tags: tagMap.get(akey) ?? []
		});
	}

	const topTagsList = Array.from(weekTagWeights.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([t]) => t);
	const top_tags = topTagsList.length > 0 ? topTagsList.join(', ') : '—';

	const rediscoveryPicked = pickWithVariety(
		dormantCandidates.map((c) => scoreCandidate(c, tagMap, weekTagWeights, weekArtistInfo))
	);
	const discoveryPicked = pickWithVariety(
		discoveryCandidates.map((c) => scoreCandidate(c, tagMap, weekTagWeights, weekArtistInfo))
	);

	return {
		ok: true,
		inputs: {
			display_name: profile.display_name || profile.username,
			week_ending: fmtWeekEnding(weekEnding),
			listening_log,
			top_tags,
			patterns_observed: '—',
			rediscovery_pick: formatPick(rediscoveryPicked.album),
			rediscovery_hook: buildHook('rediscovery', rediscoveryPicked),
			discovery_pick: formatPick(discoveryPicked.album),
			discovery_hook: buildHook('discovery', discoveryPicked)
		}
	};
}

type AlbumCandidate = { artist: string; title: string; year: number | null };
type WeekArtistInfo = { display: string; track: string; weight: number; tags: string[] };
type ScoredCandidate = {
	album: AlbumCandidate;
	score: number;
	sharedTags: string[];
	anchor: { artist: string; track: string } | null;
};

function formatPick(a: AlbumCandidate): string {
	const yearPart = a.year ? ` (${a.year})` : '';
	return `${a.artist} — ${a.title}${yearPart}`;
}

function scoreCandidate(
	candidate: AlbumCandidate,
	tagMap: Map<string, string[]>,
	weekTagWeights: Map<string, number>,
	weekArtistInfo: WeekArtistInfo[]
): ScoredCandidate {
	const candidateTags = tagMap.get(candidate.artist.toLowerCase().trim()) ?? [];
	let score = 0;
	const sharedScored: { tag: string; weight: number }[] = [];
	for (const tag of candidateTags) {
		const w = weekTagWeights.get(tag);
		if (w) {
			score += w;
			sharedScored.push({ tag, weight: w });
		}
	}
	sharedScored.sort((a, b) => b.weight - a.weight);
	const sharedTags = sharedScored.slice(0, 2).map((s) => s.tag);

	// Anchor: week artist with strongest tag overlap (play count × shared
	// tag count). Skip the candidate's own artist so the hook doesn't read
	// "shares the X wavelength of Same Artist's track" as a tautology.
	let anchor: { artist: string; track: string } | null = null;
	let bestAnchorScore = 0;
	const candidateArtistKey = candidate.artist.toLowerCase().trim();
	const candidateTagSet = new Set(candidateTags);
	for (const info of weekArtistInfo) {
		if (info.display.toLowerCase().trim() === candidateArtistKey) continue;
		const overlapCount = info.tags.filter((t) => candidateTagSet.has(t)).length;
		if (overlapCount === 0) continue;
		const anchorScore = info.weight * overlapCount;
		if (anchorScore > bestAnchorScore) {
			bestAnchorScore = anchorScore;
			anchor = { artist: info.display, track: info.track };
		}
	}

	return { album: candidate, score, sharedTags, anchor };
}

function pickWithVariety(scored: ScoredCandidate[]): ScoredCandidate {
	scored.sort((a, b) => b.score - a.score);
	const topScore = scored[0].score;
	if (topScore === 0) {
		// No overlap anywhere — fall back to a pure wildcard random pick.
		return scored[Math.floor(Math.random() * scored.length)];
	}
	// Pick randomly from the tier within 80% of the top score, so the same
	// listening week doesn't always surface the exact same album.
	const threshold = topScore * 0.8;
	const tier = scored.filter((s) => s.score >= threshold);
	return tier[Math.floor(Math.random() * tier.length)];
}

function buildHook(role: 'rediscovery' | 'discovery', scored: ScoredCandidate): string {
	const wildcard =
		role === 'rediscovery'
			? 'a dormant pick from their own shelf — no specific musical link to this week, just an album that has gone untouched for a while.'
			: "a wildcard pull from another Albumz collection — no known musical connection to this week's listening, surfaced for the sake of widening the room.";

	if (scored.score === 0 || scored.sharedTags.length === 0) return wildcard;

	const tagPhrase =
		scored.sharedTags.length === 2
			? `${scored.sharedTags[0]} / ${scored.sharedTags[1]}`
			: scored.sharedTags[0];

	const tail =
		role === 'rediscovery'
			? 'a dormant pick from their own shelf worth pulling out again.'
			: 'a nudge outward from another Albumz collection worth a listen.';

	if (scored.anchor) {
		return `shares the ${tagPhrase} wavelength of ${scored.anchor.artist}'s ${scored.anchor.track} from this week — ${tail}`;
	}
	return `sits in the ${tagPhrase} wavelength much of this week leaned into — ${tail}`;
}
