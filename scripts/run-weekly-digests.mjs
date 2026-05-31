#!/usr/bin/env node
// Weekly digest scheduler.
//
// Enumerates profiles with Last.fm linked and POSTs to /api/digests/generate
// for each, sequentially. Skips quiet weeks (<10 plays) at the endpoint.
// Designed to be invoked by a systemd timer Sunday evening; safe to run
// manually for testing too.
//
// Required env:
//   PUBLIC_SUPABASE_URL  (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY
//   DIGEST_SCHEDULER_SECRET     ← shared with the SvelteKit endpoint
//
// Optional env:
//   ALBUMZ_BASE_URL     default http://127.0.0.1:3200
//   WEEK_ENDING         override YYYY-MM-DD (default: most recent Sunday local)
//
// Loads .env from the repo root if present so manual invocation just works.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ---------- Inline dotenv loader ----------
// Avoids a runtime dep; only handles the simple KEY=VALUE shape the .env uses.
const envPath = resolve(REPO_ROOT, '.env');
if (existsSync(envPath)) {
	for (const line of readFileSync(envPath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHEDULER_SECRET = process.env.DIGEST_SCHEDULER_SECRET;
const BASE_URL = process.env.ALBUMZ_BASE_URL || 'http://127.0.0.1:3200';

const missing = [];
if (!SUPABASE_URL) missing.push('PUBLIC_SUPABASE_URL');
if (!SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!SCHEDULER_SECRET) missing.push('DIGEST_SCHEDULER_SECRET');
if (missing.length > 0) {
	console.error(`[digests] missing required env: ${missing.join(', ')}`);
	process.exit(1);
}

// ---------- Compute week ending ----------
function lastSundayLocal(d = new Date()) {
	const local = new Date(d);
	local.setHours(0, 0, 0, 0);
	local.setDate(local.getDate() - local.getDay());
	const y = local.getFullYear();
	const m = String(local.getMonth() + 1).padStart(2, '0');
	const dd = String(local.getDate()).padStart(2, '0');
	return `${y}-${m}-${dd}`;
}
const weekEnding = process.env.WEEK_ENDING || lastSundayLocal();
console.log(`[digests] target week ending: ${weekEnding}`);
console.log(`[digests] albumz base: ${BASE_URL}`);

// ---------- Fetch eligible users ----------
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
});

const { data: profiles, error: profilesErr } = await supabase
	.from('profiles')
	.select('id, username, last_fm_username')
	.not('last_fm_username', 'is', null);

if (profilesErr) {
	console.error('[digests] failed to query profiles:', profilesErr.message);
	process.exit(1);
}

if (!profiles || profiles.length === 0) {
	console.log('[digests] no eligible profiles');
	process.exit(0);
}

console.log(`[digests] ${profiles.length} eligible profile(s)`);

// ---------- Generate per user (sequential — single Ollama instance) ----------
const url = `${BASE_URL}/api/digests/generate?week_ending=${encodeURIComponent(weekEnding)}`;
let generated = 0;
let skipped = 0;
let failed = 0;

for (const profile of profiles) {
	const label = `@${profile.username}`;
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'authorization': `Bearer ${SCHEDULER_SECRET}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ user_id: profile.id, skip_if_quiet: true })
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			failed++;
			console.error(`[digests] ${label}: ${res.status} ${data?.message ?? res.statusText}`);
			continue;
		}
		if (data?.status === 'skipped') {
			skipped++;
			console.log(`[digests] ${label}: skipped (${data.reason}${data.playCount != null ? `, ${data.playCount} plays` : ''})`);
			continue;
		}
		generated++;
		console.log(`[digests] ${label}: generated draft ${data?.digest?.id ?? ''}`);
	} catch (err) {
		failed++;
		console.error(`[digests] ${label}: ${err?.message ?? err}`);
	}
}

console.log(`[digests] done — generated=${generated} skipped=${skipped} failed=${failed}`);
process.exit(0);
