// Qwen step 2: pick 3-5 albums from the Discogs candidate pool and write a
// single-sentence "why" for each. Sentence-per-pick replaces a separate
// narration block — read together, the whys ARE the narration. Each one
// connects the album to the nudge in a specific, sensory way.
//
// This step applies non-queryable modifiers from the nudge ("by dudes",
// "with female vocals", etc.) that step 1 couldn't push down to Discogs.
// Also enforces the deep-cut bias: prefer the album over the canonical hit.
//
// Output is constrained JSON. Indices reference the candidate pool we pass
// in — qwen just returns {index, why} pairs and we hydrate the metadata
// from the original candidates. Saves tokens vs. echoing the full record.

import { env } from '$env/dynamic/private';
import type { Candidate } from './discogs-pool.server';
import type { ListeningBaseline } from './baseline.server';

const DEFAULT_MODEL = 'qwen3.5:latest';
const MAX_ATTEMPTS = 3;
const MIN_PICKS = 3;
const MAX_PICKS = 5;

export type CuratedPick = Candidate & { why: string };

export type CurateResult = { ok: true; picks: CuratedPick[] } | { ok: false; error: string };

const SYSTEM_PROMPT = `You are a record-store clerk. A listener tells you what they've been on, where they want to lean, and you've already narrowed the catalog down to a pool of candidates. Your job is to pick 3-5 albums from that pool and write a single sentence for each explaining why it fits the nudge.

Rules:
- Pick 3-5 albums by their index number from the pool.
- Each pick gets ONE sentence — specific, sensory, connecting the record to the nudge. Not generic. Reach for the actual texture of the album: "shares the gauzy synth bloom the listener's been on, but the basslines pull it darker" beats "great album, fits the mood".
- DEEP CUTS over hits. If two albums by similar artists both fit, take the lesser-known one. Prefer the album over its famous single. The listener has Spotify; they don't need you to reach for the obvious entry point.
- Apply nudge modifiers we couldn't filter at the catalog level. If the nudge said "by dudes", every pick must be a male-fronted band. If "female vocals", every pick must have female vocals. If "instrumental", instrumental-only. Honor these even though the pool doesn't know about them.
- Variety across picks: different artists, different angles on the nudge. Don't pick three records that all hit the same note.
- Voice: warm, specific, lowercase-confident. Continuous flow if you read the whys back-to-back, but each one stands alone. No named sections, no "this album is", no list-stuffing.

Output format (strict JSON, nothing else):
{
  "picks": [
    { "index": 12, "why": "single sentence" },
    { "index": 27, "why": "single sentence" },
    { "index": 41, "why": "single sentence" }
  ]
}

Output ONLY the JSON object. No prose around it, no markdown fences, no commentary.`;

function formatCandidates(candidates: Candidate[]): string {
	return candidates
		.map((c, i) => {
			const year = c.year ?? '?';
			const label = c.label ?? '?';
			const country = c.country ?? '?';
			return `${i}. ${c.artist} — ${c.title} (${year}, ${label}, ${country}) [${c.style}]`;
		})
		.join('\n');
}

function buildUserPrompt(
	baseline: ListeningBaseline,
	nudge: string,
	candidates: Candidate[]
): string {
	const lines: string[] = [
		`Listener's last ${baseline.lookbackDays} days, ${baseline.playCount} plays.`,
		`Top tags: ${baseline.topTags.join(', ') || '—'}`,
		'',
		`Nudge: "${nudge}"`,
		'',
		`Candidate pool (${candidates.length}):`,
		formatCandidates(candidates),
		'',
		`Pick ${MIN_PICKS}-${MAX_PICKS} albums by index and write one sentence for each. Output JSON.`
	];
	return lines.join('\n');
}

type RawPick = { index?: number; why?: string };
type RawOutput = { picks?: RawPick[] };

type AttemptOutcome = { ok: true; picks: CuratedPick[] } | { ok: false; reason: string };

async function runAttempt(
	systemPrompt: string,
	userPrompt: string,
	candidates: Candidate[],
	ollamaUrl: string
): Promise<AttemptOutcome> {
	let res: Response;
	try {
		res = await fetch(ollamaUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				model: DEFAULT_MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				think: false,
				format: 'json',
				options: {
					// Slightly higher than step 1 — this step is prose-shaped (the
					// "why" sentences), and the digest's 0.7 works well for voice.
					temperature: 0.6,
					num_ctx: 8192,
					// Pool of 80 + 3-5 picks with sentences fits comfortably.
					num_predict: 1024
				}
			})
		});
	} catch (err) {
		return { ok: false, reason: err instanceof Error ? err.message : 'fetch failed' };
	}

	if (!res.ok) return { ok: false, reason: `Ollama returned ${res.status}` };

	const data = (await res.json()) as { message?: { content?: string } };
	const raw = (data.message?.content ?? '').trim();
	if (!raw) return { ok: false, reason: 'empty response' };

	let parsed: RawOutput;
	try {
		parsed = JSON.parse(raw) as RawOutput;
	} catch {
		return { ok: false, reason: `not valid JSON: ${raw.slice(0, 200)}` };
	}

	if (!parsed.picks || !Array.isArray(parsed.picks)) {
		return { ok: false, reason: `missing picks array: ${raw.slice(0, 200)}` };
	}

	if (parsed.picks.length < MIN_PICKS || parsed.picks.length > MAX_PICKS) {
		return {
			ok: false,
			reason: `picks count ${parsed.picks.length} out of range (${MIN_PICKS}-${MAX_PICKS})`
		};
	}

	const hydrated: CuratedPick[] = [];
	const seenIndices = new Set<number>();
	for (const p of parsed.picks) {
		if (typeof p.index !== 'number' || !Number.isInteger(p.index)) {
			return { ok: false, reason: `pick missing valid index: ${JSON.stringify(p)}` };
		}
		if (p.index < 0 || p.index >= candidates.length) {
			return { ok: false, reason: `pick index ${p.index} out of bounds` };
		}
		if (seenIndices.has(p.index)) {
			return { ok: false, reason: `duplicate pick index ${p.index}` };
		}
		if (typeof p.why !== 'string' || !p.why.trim()) {
			return { ok: false, reason: `pick ${p.index} missing why text` };
		}
		seenIndices.add(p.index);
		hydrated.push({ ...candidates[p.index], why: p.why.trim() });
	}

	return { ok: true, picks: hydrated };
}

export async function curateCandidates(
	candidates: Candidate[],
	nudge: string,
	baseline: ListeningBaseline
): Promise<CurateResult> {
	if (candidates.length === 0) {
		return { ok: false, error: 'candidate pool is empty' };
	}

	const ollamaUrl = env.OLLAMA_URL || 'http://localhost:11434/api/chat';
	const userPrompt = buildUserPrompt(baseline, nudge, candidates);

	const failures: string[] = [];
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const outcome = await runAttempt(SYSTEM_PROMPT, userPrompt, candidates, ollamaUrl);
		if (outcome.ok) return { ok: true, picks: outcome.picks };
		failures.push(`attempt ${attempt}: ${outcome.reason}`);
	}

	return {
		ok: false,
		error: `${MAX_ATTEMPTS} attempts all failed. ${failures.join(' | ')}`
	};
}
