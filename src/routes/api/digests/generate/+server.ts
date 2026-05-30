// Generate a weekly digest for the signed-in user.
//
// POST /api/digests/generate
//   ?week_ending=YYYY-MM-DD  (optional; defaults to previous Sunday)
//
// Owner-only. Re-running for the same week overwrites the draft via upsert,
// except when the existing row is published — that case requires explicit
// discard first to avoid silently overwriting something the user has already
// committed to publicly.

import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { assembleDigest, previousSunday } from '$lib/digest-data.server';
import { SYSTEM_PROMPT, fillUserTemplate } from '$lib/digest-prompt';
import type { RequestHandler } from './$types';

const DEFAULT_MODEL = 'qwen3.5:latest';

export const POST: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const weekEndingParam = url.searchParams.get('week_ending');
	const weekEnding = weekEndingParam
		? new Date(weekEndingParam + 'T00:00:00Z')
		: previousSunday();

	if (isNaN(weekEnding.getTime())) error(400, 'Invalid week_ending date');

	const weekEndingIso = weekEnding.toISOString().slice(0, 10);

	const { data: existing } = await locals.supabase
		.from('digests')
		.select('id, status')
		.eq('user_id', user.id)
		.eq('week_ending', weekEndingIso)
		.maybeSingle();

	if (existing?.status === 'published') {
		error(409, 'A digest for this week is already published. Discard it first to regenerate.');
	}

	const assembled = await assembleDigest(locals.supabase, user.id, weekEnding);
	if (!assembled.ok) error(400, assembled.error);

	const ollamaUrl = env.OLLAMA_URL || 'http://localhost:11434/api/chat';
	const userPrompt = fillUserTemplate(assembled.inputs);

	let body: string;
	let modelUsed = DEFAULT_MODEL;
	try {
		const res = await fetch(ollamaUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				model: DEFAULT_MODEL,
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				think: false,
				options: { temperature: 0.7 }
			})
		});
		if (!res.ok) error(502, `Ollama returned ${res.status}`);
		const data = await res.json();
		body = (data.message?.content ?? '').trim();
		if (data.model) modelUsed = data.model;
	} catch (err) {
		if ((err as { status?: number }).status) throw err;
		const msg = err instanceof Error ? err.message : 'Ollama call failed';
		error(502, msg);
	}

	if (!body) error(502, 'Ollama returned empty response');

	const { data: row, error: insertErr } = await locals.supabase
		.from('digests')
		.upsert(
			{
				user_id: user.id,
				week_ending: weekEndingIso,
				body,
				model_used: modelUsed,
				inputs: assembled.inputs,
				status: 'draft',
				published_at: null
			},
			{ onConflict: 'user_id,week_ending' }
		)
		.select('id, week_ending, body, model_used, status, created_at, inputs')
		.single();

	if (insertErr) error(500, insertErr.message);

	return json({ digest: row });
};
