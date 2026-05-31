// Generate a weekly digest for the signed-in user.
//
// POST /api/digests/generate
//   ?week_ending=YYYY-MM-DD  (optional; defaults to previous Sunday)
//
// Two auth paths:
//   1. Session — uses session.user.id; ignores body.user_id. (Manual triggers.)
//   2. Bearer DIGEST_SCHEDULER_SECRET — uses body.user_id; supports
//      body.skip_if_quiet to skip weeks with <10 plays before invoking Ollama.
//      Service-role Supabase client used for cross-user access.
//
// Re-running for the same week overwrites the draft via upsert, except when
// the existing row is published — that case requires explicit discard first
// to avoid silently overwriting something the user has already committed to.

import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { assembleDigest, currentWeekEnding } from '$lib/digest-data.server';
import { SYSTEM_PROMPT, fillUserTemplate } from '$lib/digest-prompt';
import { probeDigest, type ProbeReport } from '$lib/digest-probes';
import { createSupabaseAdminClient } from '$lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

const DEFAULT_MODEL = 'qwen3.5:latest';

// Test-time enforcement: qwen3.5 has a real voice-discipline ceiling
// (~80-90% per probe — see reference_qwen_voice_ceiling.md). Rather than
// stack more prompt rules and lose voice, we re-roll up to MAX_ATTEMPTS
// when a CRITICAL probe fails (missing pick, fabricated day, format
// trope leak). Soft failures (echo, category nouns) are noted but
// owner-review handles them. Each generation is ~5-10s on local Ollama,
// so worst case adds ~20s to draft creation.
const MAX_ATTEMPTS = 3;
const QUIET_WEEK_THRESHOLD = 10;

interface GenerateBody {
	user_id?: string;
	skip_if_quiet?: boolean;
}

export const POST: RequestHandler = async ({ url, locals, request }) => {
	// Body is optional; parse defensively. Bearer-auth callers send a body.
	let reqBody: GenerateBody = {};
	if (request.headers.get('content-type')?.includes('application/json')) {
		try { reqBody = await request.json(); } catch { reqBody = {}; }
	}

	const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/)?.[1];
	const schedulerSecret = env.DIGEST_SCHEDULER_SECRET;
	const isScheduler = !!(bearer && schedulerSecret && bearer === schedulerSecret);

	let userId: string;
	let supabase: SupabaseClient;
	if (isScheduler) {
		if (!reqBody.user_id) error(400, 'user_id required when calling with scheduler bearer');
		userId = reqBody.user_id;
		supabase = createSupabaseAdminClient();
	} else {
		const { user } = await locals.safeGetSession();
		if (!user) error(401, 'Not signed in');
		userId = user.id;
		supabase = locals.supabase;
	}

	const weekEndingParam = url.searchParams.get('week_ending');
	const weekEnding = weekEndingParam
		? new Date(weekEndingParam + 'T00:00:00Z')
		: currentWeekEnding();

	if (isNaN(weekEnding.getTime())) error(400, 'Invalid week_ending date');

	const weekEndingIso = weekEnding.toISOString().slice(0, 10);

	const { data: existing } = await supabase
		.from('digests')
		.select('id, status')
		.eq('user_id', userId)
		.eq('week_ending', weekEndingIso)
		.maybeSingle();

	if (existing?.status === 'published') {
		error(409, 'A digest for this week is already published. Discard it first to regenerate.');
	}

	const assembled = await assembleDigest(supabase, userId, weekEnding);
	if (!assembled.ok) {
		// Scheduler treats assembly failures as skips (insufficient data is a
		// normal state for some users), not as 4xx errors.
		if (isScheduler) {
			return json({ status: 'skipped', reason: assembled.error });
		}
		error(400, assembled.error);
	}

	if (reqBody.skip_if_quiet && assembled.playCount < QUIET_WEEK_THRESHOLD) {
		return json({
			status: 'skipped',
			reason: 'insufficient_activity',
			playCount: assembled.playCount
		});
	}

	const ollamaUrl = env.OLLAMA_URL || 'http://localhost:11434/api/chat';
	const userPrompt = fillUserTemplate(assembled.inputs);

	let body = '';
	let modelUsed = DEFAULT_MODEL;
	let finalReport: ProbeReport | null = null;
	const attemptReasons: string[] = [];

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		let attemptBody = '';
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
					options: {
						temperature: 0.7,
						num_ctx: 8192,
						num_predict: 2048
					}
				})
			});
			if (!res.ok) error(502, `Ollama returned ${res.status}`);
			const data = await res.json();
			attemptBody = (data.message?.content ?? '').trim();
			if (data.model) modelUsed = data.model;
		} catch (err) {
			if ((err as { status?: number }).status) throw err;
			const msg = err instanceof Error ? err.message : 'Ollama call failed';
			error(502, msg);
		}

		if (!attemptBody) {
			attemptReasons.push(`attempt ${attempt}: empty response`);
			continue;
		}

		const report = probeDigest(attemptBody, assembled.inputs);
		// Always keep the latest attempt as the working draft so we have
		// something to save even if every attempt fails some probe.
		body = attemptBody;
		finalReport = report;

		if (!report.criticalFail) break;
		attemptReasons.push(`attempt ${attempt}: ${report.criticalReason}`);
	}

	if (!body) error(502, 'Ollama returned empty response after all attempts');

	// Log the regen story to the journal so we can see how often the
	// enforcement layer fires in prod without having to instrument
	// telemetry. One line per noteworthy event; no logs on a clean
	// first-attempt pass.
	if (attemptReasons.length > 0) {
		console.log(
			`[digest] regen for ${userId} week=${weekEndingIso}: ${attemptReasons.join(' | ')}` +
				(finalReport?.criticalFail
					? ` | FINAL still critical: ${finalReport.criticalReason}`
					: ' | FINAL clean')
		);
	}

	const { data: row, error: insertErr } = await supabase
		.from('digests')
		.upsert(
			{
				user_id: userId,
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
