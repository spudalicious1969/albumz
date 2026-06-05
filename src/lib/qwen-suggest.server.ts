// Final-fallback metadata suggester for the backfill chain. Runs after
// Discogs and Last.fm both come up empty for a field. The model is asked to
// suggest tags + label only if it confidently knows the specific release;
// otherwise it returns NONE. Suggestions are never written to DB automatically
// — they surface in the backfill recap with explicit Accept/Edit/Skip review.
//
// qwen3.5 voice-discipline ceiling applies (see reference_qwen_voice_ceiling).
// The NONE escape is the load-bearing rule; expect 1-2 confidently-wrong
// suggestions per ~14 albums. The accept/edit UI is the safety net.

import { env } from '$env/dynamic/private';

const DEFAULT_MODEL = 'qwen3.5:latest';
const PER_CALL_TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = `You are a music metadata helper. Given an album by an artist, suggest tags (subgenres) and the original record label, but ONLY if you confidently recognize this specific release. If you are not sure, respond NONE — do not guess.

Output JSON only. No commentary, no markdown, no preamble.

Schema:
{
  "tags": ["lowercase", "tag", "names"] or "NONE",
  "label": "Record Label Name" or "NONE"
}

Rules for tags:
- 3-5 specific subgenres (e.g. "post-punk", "shoegaze", "slowcore", "dream pop", "neo-soul").
- Lowercase.
- DO NOT use eras (2010s, 90s, classic rock, oldies).
- DO NOT use broad umbrellas (rock, pop, electronic, indie, alternative).
- DO NOT use qualifiers ("new", "modern", "experimental" alone).

Rules for label:
- The album's original record label only.
- NOT the distributor, NOT the parent company, NOT a streaming-service imprint.

If you cannot identify this specific album, return NONE for that field. Better to admit ignorance than to invent.`;

type SuggestionRaw = {
	tags?: string[] | 'NONE' | string;
	label?: string;
};

export type AlbumSuggestion = {
	tags: string[] | null;
	label: string | null;
};

const EMPTY: AlbumSuggestion = { tags: null, label: null };

export async function suggestMetadata(
	artist: string,
	title: string
): Promise<AlbumSuggestion> {
	const ollamaUrl = env.OLLAMA_URL || 'http://localhost:11434/api/chat';
	const userPrompt = `Album: ${artist} — ${title}`;

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
				format: 'json',
				options: {
					temperature: 0.2,
					num_predict: 256
				}
			}),
			signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS)
		});
		if (!res.ok) return EMPTY;
		const data = (await res.json()) as { message?: { content?: string } };
		const content = (data.message?.content ?? '').trim();
		if (!content) return EMPTY;

		const parsed = JSON.parse(content) as SuggestionRaw;

		let tags: string[] | null = null;
		if (Array.isArray(parsed.tags)) {
			const cleaned = parsed.tags
				.filter((t): t is string => typeof t === 'string')
				.map((t) => t.toLowerCase().trim())
				.filter(Boolean);
			tags = cleaned.length > 0 ? cleaned : null;
		}

		let label: string | null = null;
		if (typeof parsed.label === 'string') {
			const trimmed = parsed.label.trim();
			if (trimmed && trimmed.toUpperCase() !== 'NONE') label = trimmed;
		}

		return { tags, label };
	} catch {
		return EMPTY;
	}
}
