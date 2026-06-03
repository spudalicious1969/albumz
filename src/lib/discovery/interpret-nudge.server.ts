// Qwen step 1: translate the listener's free-text nudge into a structured
// Discogs catalog query. Qwen plays the record-store clerk — given the
// listener's recent tag profile + a direction nudge, she outputs styles +
// optional genre/year/label/country hints we can hand to Discogs search.
//
// Output is constrained to JSON via Ollama's format:"json" mode so we get
// parseable structured output reliably. Temperature is kept low for
// stability — this step is structured translation, not prose. Inline
// prompt for now; can promote to prompts/*.md (digest pattern) once we
// know what stable looks like.

import { env } from '$env/dynamic/private';
import type { ListeningBaseline } from './baseline.server';

const DEFAULT_MODEL = 'qwen3.5:latest';

// Qwen ceiling: even with format:json + tight rules, ~10-20% of calls will
// either return empty styles or otherwise fail validation. Retry pattern
// mirrors the digest's MAX_ATTEMPTS = 3. Each attempt costs ~3-5s on local
// Ollama, so worst case adds ~10-15s to the discovery flow before erroring.
const MAX_ATTEMPTS = 3;

export type DiscogsSearchParams = {
	styles: string[];
	genres?: string[];
	year_min?: number;
	year_max?: number;
	label?: string;
	country?: string;
};

const SYSTEM_PROMPT = `You are a record-store clerk with deep knowledge of music styles, scenes, labels, and eras. A listener tells you what they've been listening to (top tags from the last week) and gives you a "nudge" — a direction they want their listening to lean. Translate the nudge into a Discogs catalog query.

The output is ALWAYS a JSON object with at minimum a non-empty "styles" array. Every nudge can be answered with style choices — no matter how abstract.

Output format (strict JSON, nothing else):
{
  "styles": ["Style 1", "Style 2"],
  "genres": ["Genre"],
  "year_min": 1980,
  "year_max": 1985,
  "label": "Label Name",
  "country": "Country"
}

Rules:
- "styles" (REQUIRED, 1-3 entries, NEVER empty) — Specific Discogs styles that carry the FEELING of the nudge as part of their cultural identity. Translate the feeling into specific cultural styles, never invent literal "X" styles. Examples:
    * "more melancholy" → Shoegaze, Slowcore, Darkwave
    * "happier" → Power Pop, Jangle Pop, Twee Pop, Sunshine Pop
    * "weirder, more electronic" → Krautrock, Drone, No Wave, IDM
    * "more energy" → Garage Rock, Hardcore, Post-Punk
  Even for vague nudges, pick the styles that best capture the feeling.

- "genres" (optional) — Broad Discogs buckets: Rock, Electronic, Pop, Jazz, Folk World & Country, Funk/Soul, Hip Hop, Latin, Blues, Reggae, Classical. Usually safe to omit.

- "year_min"/"year_max" — INCLUDE when EITHER (a) the nudge contains an explicit temporal word ("80s", "70s vibes", "modern", "current", "early stuff", "vintage", years/decades), OR (b) the nudge anchors on a specific artist/album/scene with a clearly defined active period. ALWAYS pair year_min with year_max (use the current year 2026 as year_max for contemporary anchors). DO NOT add era from style history alone (Power Pop ≠ era license). DO NOT add era for non-anchored vibe words. Examples:
    * "more melancholy" → NO era (vibe word, no anchor)
    * "happier" → NO era (vibe word, no anchor)
    * "weirder" → NO era
    * "more 80s" → year_min: 1980, year_max: 1989
    * "the early stuff" → era from listener's baseline artists' active period
    * "like The Beths" → year_min: 2015, year_max: 2026 (contemporary anchor, active mid-2010s onward)
    * "like Joy Division" → year_min: 1976, year_max: 1985 (vintage anchor with defined period)
    * "like My Bloody Valentine" → year_min: 1988, year_max: 1995 (defined era despite later activity)
    * "like Brian Eno" → NO era (long-running artist, no single primary period)
    * "like Bowie" → NO era (long-running, no single era)
  When the anchor's era is ambiguous or long-running, omit era. Always omit both year fields if you omit one.

- "label" — INCLUDE ONLY when the nudge explicitly names a label ("4AD-ish", "Sub Pop"). Otherwise omit.

- "country" — INCLUDE ONLY when the nudge explicitly names a region ("more UK", "Japanese"). Otherwise omit.

- ANCHORED NUDGES: when the nudge names a specific artist/album/scene/label ("like The Beths", "in the spirit of Sub Pop"), use that anchor's musical character to pick styles AND its active period for year_min/year_max (per the era rule above). The listener's baseline becomes context.

- Stay near the listener's baseline unless the nudge asks for a swerve or supplies its own anchor. Baseline is the starting point; nudge is the direction.

- Favor specific styles that carry cultural weight over umbrellas. "Post-Punk" beats "Alternative Rock". "Shoegaze" beats "Indie Rock".

Output ONLY the JSON object. No prose, no markdown fences, no commentary.`;

function buildUserPrompt(baseline: ListeningBaseline, nudge: string): string {
	const lines: string[] = [
		`Listener's last ${baseline.lookbackDays} days, ${baseline.playCount} plays.`,
		'',
		`Top tags: ${baseline.topTags.join(', ') || '—'}`,
		'',
		`Top artists:`,
		...baseline.topArtists.map(
			(a) => `  - ${a.artist} (${a.plays}× this week; tags: ${a.tags.join(', ') || '—'})`
		),
		'',
		`Nudge: "${nudge}"`,
		'',
		'Output the JSON query now.'
	];
	return lines.join('\n');
}

export type InterpretResult =
	| { ok: true; params: DiscogsSearchParams; raw: string }
	| { ok: false; error: string };

type AttemptOutcome =
	| { ok: true; params: DiscogsSearchParams; raw: string }
	| { ok: false; reason: string };

async function runAttempt(
	systemPrompt: string,
	userPrompt: string,
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
					temperature: 0.4,
					num_ctx: 8192,
					num_predict: 512
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

	let parsed: DiscogsSearchParams;
	try {
		parsed = JSON.parse(raw) as DiscogsSearchParams;
	} catch {
		return { ok: false, reason: `not valid JSON: ${raw.slice(0, 200)}` };
	}

	if (!parsed.styles || !Array.isArray(parsed.styles) || parsed.styles.length === 0) {
		return { ok: false, reason: `empty styles array: ${raw.slice(0, 200)}` };
	}

	return { ok: true, params: parsed, raw };
}

export async function interpretNudge(
	baseline: ListeningBaseline,
	nudge: string
): Promise<InterpretResult> {
	const ollamaUrl = env.OLLAMA_URL || 'http://localhost:11434/api/chat';
	const userPrompt = buildUserPrompt(baseline, nudge);

	const failures: string[] = [];
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const outcome = await runAttempt(SYSTEM_PROMPT, userPrompt, ollamaUrl);
		if (outcome.ok) return { ok: true, params: outcome.params, raw: outcome.raw };
		failures.push(`attempt ${attempt}: ${outcome.reason}`);
	}

	return {
		ok: false,
		error: `${MAX_ATTEMPTS} attempts all failed. ${failures.join(' | ')}`
	};
}
