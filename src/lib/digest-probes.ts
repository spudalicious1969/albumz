// Mechanical probes for weekly-digest output. Mirror the rules in
// prompts/weekly-digest.md so we can detect rule violations after generation
// and re-roll. The test harness (scripts/test-digest.mjs) runs the same
// probes against fake data; this module is what the prod endpoint uses for
// test-time enforcement.
//
// Probes are split into CRITICAL (failures trigger a re-roll up to a few
// attempts) and SOFT (failures are noted but won't block — owner review is
// the final gate). Critical ones are the most jarring drifts for the
// reader: fabricated days, missing picks, banned vocabulary.

import type { DigestInputs } from './digest-prompt';

const ECHO_TERMS = [
	'valid ways of being',
	'no hierarchy',
	'without hierarchy',
	'both approaches are valid',
	'without diminishing',
	'lesser experience',
	'passing echo',
	'competing for dominance',
	'without needing to compete',
	'did not compete',
	'different rhythm entirely',
	'filled the gaps',
	'handled the densest',
	'the necessary space',
	'necessary contrast',
	'necessary counterpoint',
	'two formats coexist',
	'the physical pile',
	'the digital side',
	'the physical side',
	'the physical sides',
	'the two formats',
	'the digital selections',
	'the streamed selections',
	'the digital sessions',
	'physical shelf and the stream',
	'breathing room',
	'the digital silence'
];

const META_TERMS = [
	'the discovery pick',
	'a discovery pick',
	'the rediscovery pick',
	'a rediscovery pick',
	'the discovery nudge',
	'a discovery nudge',
	'the discovery suggestion',
	'a discovery suggestion',
	'discovery nudge from'
];

const MECHANISM_TERMS = [
	'other users',
	'wider albumz community',
	'wider community',
	'the community',
	'users with overlapping',
	'users with similar',
	'listeners with overlapping',
	'listeners with similar',
	'rated highly',
	'have rated this',
	'tags from those sessions'
];

const FORMAT_TROPE_TERMS = [
	'turntable',
	'turntables',
	'needle',
	'needles',
	'crackle',
	'crackles',
	'crates',
	'crate digging',
	'crate-digging',
	'vinyl',
	'the wax',
	'b-side',
	'a-side',
	'flip side',
	'flipped the record',
	'spinning the platter',
	'platter'
];

const BORROWED_PHRASE_TERMS = [
	'belongs in that same room',
	'has legs',
	'swing for the curious',
	'a swing for',
	'sits one shelf away',
	'one shelf away'
];

const CATEGORY_NOUN_TERMS = [
	'virtual shelf',
	'virtual shelves',
	'digital shelf',
	'digital shelves',
	'streamed selections',
	'streamed selection',
	'streamed picks',
	'streamed pick',
	'streamed tracks',
	'streamed sessions',
	'streamed side',
	'streaming side',
	'spun records',
	'spun record',
	'spun selections',
	'spun selection',
	'spun picks',
	'spun pick',
	'spun tracks',
	'spun sessions',
	'spun side',
	'physical shelf',
	'physical side',
	'analog side',
	'the streams',
	'the two formats'
];

const DAY_FULL_NAMES = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
] as const;

const DAY_SHORT_TO_FULL: Record<string, string> = {
	Mon: 'Monday',
	Tue: 'Tuesday',
	Wed: 'Wednesday',
	Thu: 'Thursday',
	Fri: 'Friday',
	Sat: 'Saturday',
	Sun: 'Sunday'
};

function findTerms(output: string, terms: readonly string[]): string[] {
	const haystack = output.toLowerCase();
	return terms.filter((t) => haystack.includes(t.toLowerCase()));
}

/** Parse the listening_log block to find which day names had real entries
 * (vs `(no plays)` or omitted entirely). Returns the set of full-day-name
 * strings that the model is allowed to reference in the prose. */
function allowedDays(listeningLog: string): Set<string> {
	const allowed = new Set<string>();
	const dayHeaderPattern = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun):\s*(.*)$/gm;
	for (const m of listeningLog.matchAll(dayHeaderPattern)) {
		const dayShort = m[1];
		const sameLineContent = (m[2] ?? '').trim();
		// "(no plays)" on the same line means the day was empty
		if (sameLineContent.toLowerCase().includes('(no plays)')) continue;
		// Otherwise the day has plays (either same-line or indented below)
		allowed.add(DAY_SHORT_TO_FULL[dayShort]);
	}
	return allowed;
}

/** Extract distinctive tokens from a pick string ("Artist — Album (Year)") for
 * presence-checking. We look at the first 2 words of each side as identifiers
 * — exact substring matches against the prose. Returns null if the pick can't
 * be tokenized (which means we can't check it). */
function pickTokens(pick: string): { artistKey: string; albumKey: string } | null {
	// Format: "Artist — Title (Year)"
	const match = pick.match(/^(.+?)\s+—\s+(.+?)(?:\s+\(\d{4}\))?$/);
	if (!match) return null;
	return { artistKey: match[1].trim(), albumKey: match[2].trim() };
}

function pickPresent(pick: string, output: string): boolean {
	const tokens = pickTokens(pick);
	if (!tokens) return true; // can't check → don't fail
	const haystack = output.toLowerCase();
	// Either the artist OR the album name should appear (album is the
	// more distinctive token; artist is fallback).
	return (
		haystack.includes(tokens.albumKey.toLowerCase()) ||
		haystack.includes(tokens.artistKey.toLowerCase())
	);
}

export type ProbeReport = {
	// Critical (re-roll triggers)
	rediscoveryPresent: boolean;
	discoveryPresent: boolean;
	dayFidelity: boolean;
	formatTropes: string[];
	// Soft (noted but no re-roll)
	categoryNouns: string[];
	borrowedPhrases: string[];
	echoes: string[];
	meta: string[];
	mechanism: string[];
	thisWeekCount: number;
	headersOk: boolean;
	bulletsOk: boolean;
	paragraphCount: number;
	// Derived
	fabricatedDays: string[];
	criticalFail: boolean;
	criticalReason: string | null;
};

export function probeDigest(output: string, inputs: DigestInputs): ProbeReport {
	const allowedDayNames = allowedDays(inputs.listening_log);
	const dayMentions = new Set<string>();
	for (const day of DAY_FULL_NAMES) {
		const pattern = new RegExp(`\\b${day}\\b`, 'i');
		if (pattern.test(output)) dayMentions.add(day);
	}
	const fabricatedDays = Array.from(dayMentions).filter((d) => !allowedDayNames.has(d));

	const formatTropes = findTerms(output, FORMAT_TROPE_TERMS);
	const categoryNouns = findTerms(output, CATEGORY_NOUN_TERMS);
	const borrowedPhrases = findTerms(output, BORROWED_PHRASE_TERMS);
	const echoes = findTerms(output, ECHO_TERMS);
	const meta = findTerms(output, META_TERMS);
	const mechanism = findTerms(output, MECHANISM_TERMS);

	const rediscoveryPresent = pickPresent(inputs.rediscovery_pick, output);
	const discoveryPresent = pickPresent(inputs.discovery_pick, output);

	const thisWeekCount = (output.match(/\bthis week\b/gi) || []).length;
	const headerLine = /^(#{1,6}\s|\*\*[^*]+\*\*\s*$)/m;
	const bulletLine = /^\s*([-*•]\s|\d+\.\s)/m;
	const paragraphs = output.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

	const criticalReasons: string[] = [];
	if (!rediscoveryPresent) criticalReasons.push('rediscovery pick not named');
	if (!discoveryPresent) criticalReasons.push('discovery pick not named');
	if (fabricatedDays.length > 0)
		criticalReasons.push(`fabricated days: ${fabricatedDays.join(', ')}`);
	if (formatTropes.length > 0)
		criticalReasons.push(`format tropes: ${formatTropes.join(', ')}`);

	return {
		rediscoveryPresent,
		discoveryPresent,
		dayFidelity: fabricatedDays.length === 0,
		formatTropes,
		categoryNouns,
		borrowedPhrases,
		echoes,
		meta,
		mechanism,
		thisWeekCount,
		headersOk: !headerLine.test(output),
		bulletsOk: !bulletLine.test(output),
		paragraphCount: paragraphs.length,
		fabricatedDays,
		criticalFail: criticalReasons.length > 0,
		criticalReason: criticalReasons.length > 0 ? criticalReasons.join('; ') : null
	};
}
