// POST /api/albums/:id/apply-suggestion
// Body: { field: 'tags' | 'label', value: string[] | string }
//
// Writes a single field on the user's album row — used by the backfill recap
// to accept (or accept-after-edit) a qwen-suggested tag set or label. Only
// these two fields are writable here; year/cover go through the regular
// edit page since qwen doesn't suggest those.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type Body = { field?: string; value?: unknown };

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
	if (field !== 'tags' && field !== 'label') {
		error(400, 'field must be "tags" or "label"');
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
	} else {
		if (typeof body.value !== 'string' || !body.value.trim()) {
			error(400, 'label must be a non-empty string');
		}
		update = { label: body.value.trim() };
	}

	const { error: dbErr } = await locals.supabase
		.from('albums')
		.update(update)
		.eq('id', params.id)
		.eq('user_id', user.id);
	if (dbErr) error(500, dbErr.message);

	return json({ ok: true });
};
