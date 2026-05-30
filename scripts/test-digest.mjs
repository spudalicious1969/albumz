#!/usr/bin/env node
// Test harness for prompts/weekly-digest.md.
// Loads the prompt, fills it with hand-curated fake user data, runs it through
// qwen3.5 via the local Ollama API N times, prints each output, and runs the
// quality probes from the prompt doc's checklist.
//
// Usage: node scripts/test-digest.mjs [N] [MODEL]
//   N defaults to 1, MODEL defaults to qwen3.5:latest.
//   Examples:
//     node scripts/test-digest.mjs           # 1 sample, qwen3.5
//     node scripts/test-digest.mjs 3         # 3 samples, qwen3.5
//     node scripts/test-digest.mjs 3 phi3:medium

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const MODEL = process.argv[3] ?? 'qwen3.5:latest';
const OLLAMA_URL = 'http://localhost:11434/api/chat';

// ---------- 1. Load prompt template ----------
const promptDoc = readFileSync(resolve(REPO_ROOT, 'prompts/weekly-digest.md'), 'utf8');
const fences = [...promptDoc.matchAll(/```\n([\s\S]+?)\n```/g)].map((m) => m[1]);
if (fences.length < 2) {
	console.error('Could not find both fenced blocks in prompts/weekly-digest.md');
	process.exit(1);
}
const [systemPrompt, userTemplate] = fences;

// ---------- 2. Fake input data ----------
// listening_log is the new chronological shape: one line per play, marked
// [s] for spun and [*] for streamed. Replaces the old two-bucket framing.
const data = {
	display_name: 'Marcus',
	week_ending: 'May 29, 2026',
	listening_log: [
		'Wed — Slowdive — Star Roving (Slowdive) [s]',
		'Wed — Slowdive — Sugar for the Pill (Slowdive) [s]',
		'Thu — The Cure — Plainsong (Disintegration) [s]',
		'Thu — The Cure — Pictures of You (Disintegration) [s]',
		'Thu — The Cure — Lovesong (Disintegration) [s]',
		'Fri — Ride — Vapour Trail (Nowhere) [s]',
		'Fri — Codeine — D (Frigid Stars) [s]',
		'Fri — Codeine — Cave-In (Frigid Stars) [s]',
		'Sat — Slint — Nosferatu Man (Spiderland) [s]',
		'Sat — Slint — Good Morning, Captain (Spiderland) [s]',
		'Sun — Big Thief — Vampire Empire [*]',
		'Sun — Wednesday — Bath County [*]',
		'Mon — MJ Lenderman — Wristwatch [*]',
		'Tue — Phoebe Bridgers — Funeral [*]'
	].join('\n'),
	top_tags: 'shoegaze, post-punk, slowcore, indie folk, dream pop',
	patterns_observed: [
		'- Two Slowdive deep cuts back-to-back Wednesday — first Slowdive listens since January',
		'- Cure, Ride, Codeine, Slint all spun on physical; no streaming overlap with the physical picks',
		'- Sunday and Monday were stream-only days',
		'- Slowcore cluster Friday into Saturday (Codeine then Slint)'
	].join('\n'),
	rediscovery_pick: 'Codeine — The White Birch (1994)',
	rediscovery_hook:
		'logged once in 2024 and never since — sits right next to Frigid Stars, which they spun Friday',
	discovery_pick: 'Duster — Stratosphere (1998)',
	discovery_hook:
		'sits on the slowcore axis between Slint and Codeine — the same axis Friday and Saturday were built on; quiet, textured, patient.'
};

const userPrompt = userTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => {
	if (!(key in data)) {
		console.error(`Missing template key: ${key}`);
		process.exit(1);
	}
	return data[key];
});

// ---------- 3. Generation + probes ----------
const N = Number(process.argv[2] ?? 1);
console.log(`=== MODEL: ${MODEL} · ${N} sample${N === 1 ? '' : 's'} ===\n`);

async function generateOnce() {
	const t0 = Date.now();
	const res = await fetch(OLLAMA_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			stream: false,
			think: false,
			options: { temperature: 0.7 }
		})
	});
	if (!res.ok) {
		console.error(`Ollama error: ${res.status} ${res.statusText}`);
		console.error(await res.text());
		process.exit(1);
	}
	const json = await res.json();
	return {
		output: json.message?.content?.trim() ?? '',
		elapsedSec: ((Date.now() - t0) / 1000).toFixed(1)
	};
}

// Banned phrase lists, grouped by failure mode so we can tell what's slipping.
// All matching is case-insensitive.

// Physical-vs-streamed editorializing — abstracting the two as concepts.
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

// Structural meta-language — naming the slot rather than the album.
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

// System mechanism leaks — exposing the gears behind the recommendation.
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
	'the indie folk tags',
	'the dream pop tags',
	'the shoegaze tags',
	'tags from those sessions',
	'top tags'
];

// Format-specific tropes — the column doesn't know if the user has vinyl,
// CDs, cassettes, or a mix, so these all assume a format we don't have.
// Whole-word matching only (so "vinyl" matches but "the vinyls' fan club"
// in a band name wouldn't — though there are no such fakes in test data).
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

// Borrowed example phrases — these come from the prompt's own shape
// examples or from past iterations that overused them. The model should
// invent its own framings.
const BORROWED_PHRASE_TERMS = [
	'belongs in that same room',
	'has legs',
	'swing for the curious',
	'a swing for',
	'sits one shelf away',
	'one shelf away'
];

// Virtual-shelf and streamed-as-category nouns — these abstract "streamed"
// into a concept rather than just naming it as a verb. The streamed-vs-spun
// rule in the prompt forbids using either as a category.
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

function findTerms(output, terms) {
	const haystack = output.toLowerCase();
	return terms.filter((t) => haystack.includes(t.toLowerCase()));
}

function probe(output) {
	const paragraphs = output.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
	const paraCount = paragraphs.length;
	const headerLine = /^(#{1,6}\s|\*\*[^*]+\*\*\s*$)/m;
	const bulletLine = /^\s*([-*•]\s|\d+\.\s)/m;
	const rawCounts = output.match(/\b\d+\s+(times?|spins?|plays?|listens?)\b/gi);
	const thisWeekCount = (output.match(/\bthis week\b/gi) || []).length;
	const emoji = output.match(/\p{Extended_Pictographic}/gu);
	const lastPara = paragraphs[paragraphs.length - 1] || '';
	const lastSentence = (lastPara.split(/(?<=[.!?])\s+/).pop() || '').trim();

	// Discovery + rediscovery presence: distinctive tokens from each pick must
	// appear. Both are mandatory.
	const discoveryPresent = /\bDuster\b|\bStratosphere\b/i.test(output);
	const rediscoveryPresent = /\bWhite Birch\b/i.test(output);

	const echoesFound = findTerms(output, ECHO_TERMS);
	const metaFound = findTerms(output, META_TERMS);
	const mechanismFound = findTerms(output, MECHANISM_TERMS);
	const formatFound = findTerms(output, FORMAT_TROPE_TERMS);
	const borrowedFound = findTerms(output, BORROWED_PHRASE_TERMS);
	const categoryFound = findTerms(output, CATEGORY_NOUN_TERMS);

	return {
		paraCount,
		paraOk: paraCount >= 4 && paraCount <= 6,
		headersOk: !headerLine.test(output),
		bulletsOk: !bulletLine.test(output),
		rawCountsOk: !rawCounts,
		rawCountsFound: rawCounts,
		thisWeekCount,
		thisWeekOk: thisWeekCount <= 2,
		emojiOk: !emoji,
		emojiFound: emoji,
		discoveryOk: discoveryPresent,
		rediscoveryOk: rediscoveryPresent,
		echoOk: echoesFound.length === 0,
		echoesFound,
		metaOk: metaFound.length === 0,
		metaFound,
		mechanismOk: mechanismFound.length === 0,
		mechanismFound,
		formatOk: formatFound.length === 0,
		formatFound,
		borrowedOk: borrowedFound.length === 0,
		borrowedFound,
		categoryOk: categoryFound.length === 0,
		categoryFound,
		lastSentence
	};
}

const results = [];
for (let i = 1; i <= N; i++) {
	console.log(`--- SAMPLE ${i}/${N} ---`);
	const { output, elapsedSec } = await generateOnce();
	console.log(`(generated in ${elapsedSec}s)\n`);
	console.log(output);
	const r = probe(output);
	results.push({ i, output, elapsedSec, ...r });
	console.log('\n--- probes ---');
	console.log(`paragraphs:   ${r.paraCount}  ${r.paraOk ? 'PASS' : 'FAIL'}`);
	console.log(`no headers:   ${r.headersOk ? 'PASS' : 'FAIL'}`);
	console.log(`no bullets:   ${r.bulletsOk ? 'PASS' : 'FAIL'}`);
	console.log(`no raw cnt:   ${r.rawCountsOk ? 'PASS' : `FAIL — ${r.rawCountsFound.join(', ')}`}`);
	console.log(`"this week":  ${r.thisWeekOk ? 'PASS' : `FAIL (${r.thisWeekCount}x)`}`);
	console.log(`no emoji:     ${r.emojiOk ? 'PASS' : `FAIL — ${r.emojiFound.join(' ')}`}`);
	console.log(`discovery in: ${r.discoveryOk ? 'PASS' : 'FAIL — Duster/Stratosphere not mentioned'}`);
	console.log(`rediscov. in: ${r.rediscoveryOk ? 'PASS' : 'FAIL — White Birch not mentioned'}`);
	console.log(`no echo:      ${r.echoOk ? 'PASS' : `FAIL — ${r.echoesFound.join(', ')}`}`);
	console.log(`no meta-lang: ${r.metaOk ? 'PASS' : `FAIL — ${r.metaFound.join(', ')}`}`);
	console.log(`no mechanism: ${r.mechanismOk ? 'PASS' : `FAIL — ${r.mechanismFound.join(', ')}`}`);
	console.log(`no format:    ${r.formatOk ? 'PASS' : `FAIL — ${r.formatFound.join(', ')}`}`);
	console.log(`no borrowed:  ${r.borrowedOk ? 'PASS' : `FAIL — ${r.borrowedFound.join(', ')}`}`);
	console.log(`no category:  ${r.categoryOk ? 'PASS' : `FAIL — ${r.categoryFound.join(', ')}`}`);
	console.log(`final:        "${r.lastSentence}"`);
	console.log('');
}

if (N > 1) {
	console.log('=== SUMMARY ===');
	const cols = [
		['paraOk', 'paragraphs in range'],
		['headersOk', 'no headers'],
		['bulletsOk', 'no bullets'],
		['rawCountsOk', 'no raw counts'],
		['thisWeekOk', '"this week" ≤2x'],
		['emojiOk', 'no emoji'],
		['discoveryOk', 'discovery present'],
		['rediscoveryOk', 'rediscovery present'],
		['echoOk', 'no echo-of-rules'],
		['metaOk', 'no structural meta-lang'],
		['mechanismOk', 'no mechanism leaks'],
		['formatOk', 'no format tropes'],
		['borrowedOk', 'no borrowed phrases'],
		['categoryOk', 'no category nouns']
	];
	for (const [key, label] of cols) {
		const pass = results.filter((r) => r[key]).length;
		console.log(`${label.padEnd(24)} ${pass}/${N} pass`);
	}
	console.log('\nFinal sentences (manual review — year-gesture check):');
	for (const r of results) console.log(`  ${r.i}. "${r.lastSentence}"`);
}
