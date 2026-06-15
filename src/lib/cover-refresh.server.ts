// Stale-cover healer — the counterpart to backfill for covers that *rot*.
//
// Backfill (backfill.server.ts) and the "Find covers" button only ever fill an
// *empty* cover_url; they explicitly skip albums that already have one. That's
// right for metadata, but wrong for covers: a CDN URL can go from valid to dead
// (the image gets removed or relinked) without the field ever becoming empty.
// When that happens the album shows a broken cover, yet backfill reports
// "nothing missing" because the field is populated — it's just pointing at a
// 404 now.
//
// This pass closes that hole. It HEAD-checks every album that *has* a cover_url
// and, for any that come back "gone" (403/404/410), re-fetches from the same
// catalog sources and overwrites — but only with a candidate it has verified is
// actually alive. Anything inconclusive (timeout, 5xx, our own network hiccup)
// is left untouched, so a flaky checker can never blank out good art.

import type { SupabaseClient } from '@supabase/supabase-js';
import { searchCovers, topConfidentCover } from './cover-search';

export type CoverRefreshSummary = {
	scanned: number; // albums with a cover_url that we checked
	dead: number; // covers that returned a clear "gone" status
	healed: number; // dead covers replaced with a fresh, verified-live URL
	stillBroken: Array<{ id: string; artist: string; title: string }>;
};

type Row = { id: string; artist: string; title: string; cover_url: string | null };

// Statuses that mean "this image is gone, not just temporarily unhappy".
// 5xx and timeouts are deliberately NOT here — those are transient and would
// risk overwriting a perfectly good cover during a blip.
const DEAD_STATUSES = new Set([403, 404, 410]);

// HEAD-checks are cheap; fan them out. Re-fetches are not (each spins up 5
// source searches), so those stay sequential below.
const CHECK_CONCURRENCY = 6;

type CoverStatus = 'ok' | 'dead' | 'unknown';

async function coverStatus(url: string): Promise<CoverStatus> {
	const probe = async (method: 'HEAD' | 'GET') => {
		const res = await fetch(url, {
			method,
			redirect: 'follow',
			signal: AbortSignal.timeout(7000)
		});
		return res.status;
	};
	try {
		let status = await probe('HEAD');
		// Some hosts refuse HEAD outright — fall back to GET before judging.
		if (status === 405 || status === 501) status = await probe('GET');
		if (DEAD_STATUSES.has(status)) return 'dead';
		if (status >= 200 && status < 400) return 'ok';
		return 'unknown'; // 5xx and friends — transient, leave it alone
	} catch {
		// DNS / connection / timeout on our side — inconclusive, never "dead".
		return 'unknown';
	}
}

// Tiny bounded-concurrency map so a few hundred HEAD checks don't fire all at
// once (and don't run strictly serially either).
async function mapPool<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const idx = next++;
			out[idx] = await fn(items[idx]);
		}
	});
	await Promise.all(workers);
	return out;
}

export async function refreshStaleCovers(
	supabase: SupabaseClient,
	userId: string
): Promise<CoverRefreshSummary> {
	// Every album the user owns/wants that has a cover set — both lists.
	const { data, error: loadErr } = await supabase
		.from('albums')
		.select('id, artist, title, cover_url')
		.eq('user_id', userId)
		.not('cover_url', 'is', null);
	if (loadErr) throw new Error(loadErr.message);

	const rows = (data ?? []) as Row[];

	// Read-only liveness sweep first.
	const statuses = await mapPool(rows, CHECK_CONCURRENCY, (r) =>
		coverStatus(r.cover_url as string)
	);
	const deadRows = rows.filter((_, idx) => statuses[idx] === 'dead');

	let healed = 0;
	const stillBroken: CoverRefreshSummary['stillBroken'] = [];

	for (const a of deadRows) {
		let replaced = false;
		try {
			const covers = await searchCovers(a.artist, a.title);
			const top = topConfidentCover(covers, a.artist, a.title);
			// Only write a candidate that (a) clears the confidence floor, (b) is a
			// different URL than the dead one, and (c) is verifiably live right now.
			// (c) guards against "healing" to another rotted CDN link.
			if (top && top.url !== a.cover_url && (await coverStatus(top.url)) === 'ok') {
				const { error: upErr } = await supabase
					.from('albums')
					.update({ cover_url: top.url, accent_color: null }) // accent re-derives from new cover
					.eq('id', a.id)
					.eq('user_id', userId);
				if (!upErr) {
					healed++;
					replaced = true;
				}
			}
		} catch {
			// best-effort: a single album's lookup failure shouldn't abort the pass
		}
		if (!replaced) stillBroken.push({ id: a.id, artist: a.artist, title: a.title });
	}

	stillBroken.sort((x, y) => x.artist.localeCompare(y.artist) || x.title.localeCompare(y.title));

	return { scanned: rows.length, dead: deadRows.length, healed, stillBroken };
}
