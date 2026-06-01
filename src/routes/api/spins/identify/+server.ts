// Receives a 10s audio chunk from the browser, asks Shazam (via the Python
// sidecar at SHAZAM_SIDECAR_URL) what it is, and — on a confident match —
// inserts a spin row.
//
// Env switches: set SPINS_MOCK=1 to bypass the sidecar entirely and cycle a
// canned list (useful when iterating on UI without burning Shazam queries).
// Otherwise SHAZAM_SIDECAR_URL must be set or we return 503.

import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOnLastfmNow, scrobble, updateNowPlaying } from '$lib/lastfm.server';
import type { RequestHandler } from './$types';

// Scrobble after this many confirmed chunks of the same track within the
// dedupe window. 4 × 15s = ~60s of confirmed presence — covers short songs
// (punk, hardcore, anything under 2 min) which a higher threshold would
// silently miss. Shazam often skips the first chunk or two on quiet intros,
// so 4 confirmed IDs usually maps to 75-90s of real audio. Last.fm accepts
// scrobbles regardless of timing as long as track is ≥30s.
const SCROBBLE_CHUNK_THRESHOLD = 4;

// "Same play" window — if we already scrobbled this artist+track within
// this many minutes, don't scrobble again. Long enough to span any song,
// short enough that a deliberate re-listen later counts as a new play.
const SCROBBLE_DEDUPE_MINUTES = 15;

type Identification = {
	artist: string;
	track: string;
	album: string | null;
	confidence: number | null;
};

const MOCK_POOL: Identification[] = [
	{ artist: 'Radiohead', track: 'Reckoner', album: 'In Rainbows', confidence: 0.92 },
	{ artist: 'Fleetwood Mac', track: 'Dreams', album: 'Rumours', confidence: 0.88 },
	{ artist: 'Miles Davis', track: 'So What', album: 'Kind of Blue', confidence: 0.9 },
	{ artist: 'Beach House', track: 'Space Song', album: 'Depression Cherry', confidence: 0.85 }
];

let mockCursor = 0;

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const contentType = request.headers.get('content-type') || 'audio/webm';
	const audio = await request.arrayBuffer();
	if (audio.byteLength < 1000) {
		return json({ matched: false, reason: 'too-short' });
	}

	const identification = await identify(audio, contentType);
	if (!identification) return json({ matched: false });

	// Pull profile first — we need last_fm_username to classify spun vs streamed.
	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('lastfm_session_key, last_fm_username')
		.eq('id', user.id)
		.maybeSingle();

	// Source is sticky within a play: if we've already classified this same
	// artist+track in the last 6 minutes, inherit it. This is critical —
	// otherwise our own updateNowPlaying call on chunk 1 poisons the Last.fm
	// nowplaying lookup on chunk 2+, flipping every subsequent chunk to
	// 'streamed' even though it's the same vinyl play.
	let source: 'spun' | 'streamed' = 'spun';
	const stickyCutoff = new Date(Date.now() - 6 * 60_000).toISOString();
	const { data: priorSpin } = await locals.supabase
		.from('spins')
		.select('source')
		.eq('user_id', user.id)
		.ilike('artist', identification.artist)
		.ilike('track', identification.track)
		.gte('identified_at', stickyCutoff)
		.order('identified_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (priorSpin) {
		source = priorSpin.source === 'streamed' ? 'streamed' : 'spun';
	} else if (profile?.last_fm_username) {
		// First chunk of a new play — ask Last.fm whether this looks like a stream.
		const onLastfm = await isOnLastfmNow(
			profile.last_fm_username,
			identification.artist,
			identification.track
		);
		if (onLastfm) source = 'streamed';
	}

	const insertRes = await locals.supabase
		.from('spins')
		.insert({
			user_id: user.id,
			artist: identification.artist,
			track: identification.track,
			album: identification.album,
			confidence: identification.confidence,
			source
		})
		.select('id, identified_at')
		.single();

	if (insertRes.error) error(500, insertRes.error.message);

	// Fire-and-forget — Last.fm hiccups must never break spin identification.
	const sessionKey = profile?.lastfm_session_key;
	if (sessionKey) {
		updateNowPlaying(sessionKey, identification.artist, identification.track, identification.album)
			.catch(() => { /* swallowed inside helper, double-guarded here */ });
	}

	// Scrobble logic: physical plays only (streams are already in the user's
	// Last.fm history via Spotify/whatever — re-scrobbling would dupe). Needs
	// a session key (auth) and enough confirmed chunks to clear the threshold.
	let scrobbled = false;
	if (sessionKey && source === 'spun') {
		scrobbled = await maybeScrobble(
			locals.supabase,
			user.id,
			identification,
			sessionKey,
			insertRes.data.id
		);
	}

	return json({
		matched: true,
		spin: {
			id: insertRes.data.id,
			identified_at: insertRes.data.identified_at,
			source,
			scrobbled,
			...identification
		}
	});
};

/** Check whether this insert pushed us over the scrobble threshold; if so,
 * call Last.fm and mark the row scrobbled. Returns true if a scrobble was
 * actually sent and accepted by Last.fm. All errors swallowed — a failed
 * scrobble is never worth breaking the identify flow. */
async function maybeScrobble(
	supabase: SupabaseClient,
	userId: string,
	id: Identification,
	sessionKey: string,
	thisRowId: string
): Promise<boolean> {
	try {
		const cutoff = new Date(Date.now() - SCROBBLE_DEDUPE_MINUTES * 60_000).toISOString();

		// Pull all recent chunks for this user+track in one round-trip so we can
		// both count them and check for an existing scrobble marker.
		const { data: recent } = await supabase
			.from('spins')
			.select('identified_at, scrobbled_at')
			.eq('user_id', userId)
			.ilike('artist', id.artist)
			.ilike('track', id.track)
			.gte('identified_at', cutoff)
			.order('identified_at', { ascending: true });

		if (!recent) return false;

		// Already scrobbled this play — bail.
		if (recent.some((r) => r.scrobbled_at !== null)) return false;
		if (recent.length < SCROBBLE_CHUNK_THRESHOLD) return false;

		// Earliest identified_at is our best guess at "when the track started."
		const startedAtIso = recent[0].identified_at;
		const startedAtUnix = Math.floor(new Date(startedAtIso).getTime() / 1000);

		const ok = await scrobble(sessionKey, id.artist, id.track, id.album, startedAtUnix);
		if (!ok) return false;

		// Mark this row as the one that triggered the scrobble. Future inserts
		// for the same play will see it via the .some() check above and skip.
		await supabase
			.from('spins')
			.update({ scrobbled_at: new Date().toISOString() })
			.eq('id', thisRowId);

		return true;
	} catch {
		return false;
	}
}

type SidecarResponse = {
	matched: boolean;
	artist?: string | null;
	track?: string | null;
	album?: string | null;
	confidence?: number | null;
};

async function identify(audio: ArrayBuffer, contentType: string): Promise<Identification | null> {
	if (env.SPINS_MOCK === '1') {
		const pick = MOCK_POOL[mockCursor % MOCK_POOL.length];
		mockCursor++;
		return pick;
	}

	const sidecar = env.SHAZAM_SIDECAR_URL;
	if (!sidecar) error(503, 'Spin identification not configured');

	const target = `${sidecar.replace(/\/$/, '')}/identify`;
	let res: Response;
	try {
		res = await fetch(target, {
			method: 'POST',
			body: audio,
			headers: { 'content-type': contentType }
		});
	} catch (err) {
		const cause = err instanceof Error ? (err.cause ?? err.message) : String(err);
		console.error(`[spins/identify] sidecar fetch to ${target} failed:`, cause);
		error(502, `Sidecar unreachable: ${target}`);
	}
	if (!res.ok) error(502, `Sidecar returned ${res.status}`);

	const data = (await res.json()) as SidecarResponse;
	if (!data.matched || !data.artist || !data.track) return null;

	return {
		artist: data.artist,
		track: data.track,
		album: data.album ?? null,
		confidence: data.confidence ?? null
	};
}
