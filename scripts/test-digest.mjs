#!/usr/bin/env node
// Test harness for prompts/weekly-digest.md.
// Loads the prompt, fills it with hand-curated fake user data, runs it through
// qwen3.5 via the local Ollama API N times, prints each output, and runs the
// quality probes from the prompt doc's checklist.
//
// Usage: node scripts/test-digest.mjs [N]   (default N=1)

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const MODEL = 'qwen3.5:latest';
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
const data = {
	display_name: 'Marcus',
	week_ending: 'May 29, 2026',
	spins_physical_list: [
		'Slowdive — Star Roving (Slowdive, Wed)',
		'Slowdive — Sugar for the Pill (Slowdive, Wed)',
		'The Cure — Plainsong (Disintegration, Thu)',
		'The Cure — Pictures of You (Disintegration, Thu)',
		'The Cure — Lovesong (Disintegration, Thu)',
		'Ride — Vapour Trail (Nowhere, Fri)',
		'Codeine — D (Frigid Stars, Fri)',
		'Codeine — Cave-In (Frigid Stars, Fri)',
		'Slint — Nosferatu Man (Spiderland, Sat)',
		'Slint — Good Morning, Captain (Spiderland, Sat)'
	].join('\n'),
	spins_streamed_list: [
		'Big Thief — Vampire Empire (Sun)',
		'Wednesday — Bath County (Sun)',
		'MJ Lenderman — Wristwatch (Mon)',
		'Phoebe Bridgers — Funeral (Tue)'
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
		'three Albumz users with overlapping Slint/Codeine collections have this rated highly; same slowcore axis they leaned into Friday and Saturday'
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

	// Discovery presence: distinctive token from discovery_pick must appear.
	// (For Duster — Stratosphere, both "Duster" and "Stratosphere" qualify.)
	const discoveryPresent = /\bDuster\b|\bStratosphere\b/i.test(output);

	// Echo-of-rules detector: prose paraphrasing the prompt's own framing.
	const echoTerms = [
		'valid ways of being',
		'no hierarchy',
		'both approaches are valid',
		'without diminishing',
		'lesser experience',
		'passing echo'
	];
	const echoesFound = echoTerms.filter((t) => output.toLowerCase().includes(t.toLowerCase()));

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
		echoOk: echoesFound.length === 0,
		echoesFound,
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
	console.log(`no echo:      ${r.echoOk ? 'PASS' : `FAIL — ${r.echoesFound.join(', ')}`}`);
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
		['echoOk', 'no rule-echoes']
	];
	for (const [key, label] of cols) {
		const pass = results.filter((r) => r[key]).length;
		console.log(`${label.padEnd(24)} ${pass}/${N} pass`);
	}
	console.log('\nFinal sentences (manual review — year-gesture check):');
	for (const r of results) console.log(`  ${r.i}. "${r.lastSentence}"`);
}
