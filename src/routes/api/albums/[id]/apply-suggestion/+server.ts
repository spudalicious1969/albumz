// POST /api/albums/:id/apply-suggestion
// Body: { field: 'tags' | 'label' | 'tracklist', value: string[] | string | TracklistSnapshot }
//
// Writes a single field on the user's album row — used by the backfill recap
// to accept qwen tag/label suggestions, and by the album-edit lookup panel
// to snapshot a chosen tracklist. Year/cover go through the regular edit
// page since they have their own flows.

import { error, json } from '@sveltejs/kit';
import type { Track, TracklistSource } from '$lib/tracklist';
import type { RequestHandler } from './$types';

type TracklistSnapshot = {
	tracks: Track[];
	source: TracklistSource;
	sourceId?: string;
};

type Body = { field?: string; value?: unknown };

const VALID_SOURCES: TracklistSource[] = ['spotify', 'deezer', 'itunes', 'musicbrainz', 'lastfm'];

function parseTracklistSnapshot(value: unknown): TracklistSnapshot {
	if (!value || typeof value !== 'object') error(400, 'tracklist must be an object');
	const v = value as { tracks?: unknown; source?: unknown; sourceId?: unknown };

	if (!Array.isArray(v.tracks) || v.tracks.length === 0) {
		error(400, 'tracklist.tracks must be a non-empty array');
	}
	if (typeof v.source !== 'string' || !VALID_SOURCES.includes(v.source as TracklistSource)) {
		error(400, 'tracklist.source must be one of spotify|deezer|itunes|musicbrainz|lastfm');
	}

	const tracks: Track[] = v.tracks.map((t, i) => {
		if (!t || typeof t !== 'object') error(400, `track ${i} must be an object`);
		const rec = t as { position?: unknown; name?: unknown; duration?: unknown };
		const position =
			typeof rec.position === 'number' && Number.isFinite(rec.position) && rec.position > 0
				? Math.floor(rec.position)
				: i + 1;
		const name = typeof rec.name === 'string' ? rec.name.trim() : '';
		const duration =
			typeof rec.duration === 'number' && Number.isFinite(rec.duration) && rec.duration > 0
				? Math.floor(rec.duration)
				: null;
		return { position, name, duration };
	});

	const snap: TracklistSnapshot = { tracks, source: v.source as TracklistSource };
	if (typeof v.sourceId === 'string' && v.sourceId.trim()) {
		snap.sourceId = v.sourceId.trim();
	}
	return snap;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		error(400, 'Invalid JSON body');
	}

	const field = body.field;
	if (field !== 'tags' && field !== 'label' && field !== 'tracklist') {
		error(400, 'field must be "tags", "label", or "tracklist"');
	}

	let update: Record<string, unknown>;
	if (field === 'tags') {
		if (!Array.isArray(body.value)) error(400, 'tags must be an array');
		const tags = body.value
			.filter((t): t is string => typeof t === 'string')
			.map((t) => t.trim())
			.filter(Boolean);
		if (tags.length === 0) error(400, 'tags must contain at least one non-empty string');
		update = { tags };
	} else if (field === 'label') {
		if (typeof body.value !== 'string' || !body.value.trim()) {
			error(400, 'label must be a non-empty string');
		}
		update = { label: body.value.trim() };
	} else {
		// `value: null` clears a previously-pinned snapshot, falling page-load
		// rendering back to the live pick-longest fetch.
		update = body.value === null ? { tracklist: null } : { tracklist: parseTracklistSnapshot(body.value) };
	}

	const { error: dbErr } = await locals.supabase
		.from('albums')
		.update(update)
		.eq('id', params.id)
		.eq('user_id', user.id);
	if (dbErr) error(500, dbErr.message);

	return json({ ok: true });
};
