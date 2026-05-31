import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Crate-dig: pull one dormant owned album. "Dormant" = owned + no spin in the
// last 30 days. URL `?exclude=id1,id2` lets "Pull another" rotate without
// repeating recent picks within a session.

const DORMANT_DAYS = 30;
const MAX_EXCLUDE = 12;

function parseExclude(raw: string | null): string[] {
	if (!raw) return [];
	return raw.split(',').filter(Boolean).slice(0, MAX_EXCLUDE);
}

function keyOf(artist: string, album: string): string {
	return `${artist.toLowerCase().trim()}::${album.toLowerCase().trim()}`;
}

function humanRelative(date: Date | null): string {
	if (!date) return 'never spun on Albumz';
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
	if (days < 1) return 'last spun today';
	if (days === 1) return 'last spun yesterday';
	if (days < 30) return `last spun ${days} days ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return months === 1 ? 'last spun a month ago' : `last spun ${months} months ago`;
	const years = Math.floor(months / 12);
	return years === 1 ? 'last spun a year ago' : `last spun ${years} years ago`;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const excludeIds = parseExclude(url.searchParams.get('exclude'));

	const { data: ownedAlbums, error: ownedErr } = await locals.supabase
		.from('albums')
		.select('id, artist, title, year, format, label, rating, notes, tags, cover_url, accent_color, ownership')
		.eq('user_id', user.id)
		.eq('ownership', 'OWN')
		.limit(5000);

	if (ownedErr) {
		return { album: null, exclude: excludeIds, emptyReason: 'error' as const, errorMsg: ownedErr.message };
	}

	if (!ownedAlbums || ownedAlbums.length === 0) {
		return { album: null, exclude: excludeIds, emptyReason: 'no-albums' as const };
	}

	const cutoff = new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
	const { data: recentSpins } = await locals.supabase
		.from('spins')
		.select('artist, album')
		.eq('user_id', user.id)
		.gte('identified_at', cutoff.toISOString());

	const recentlySpunKeys = new Set(
		(recentSpins ?? [])
			.filter((s) => s.album)
			.map((s) => keyOf(s.artist, s.album as string))
	);

	const excludeSet = new Set(excludeIds);
	const pool = ownedAlbums.filter(
		(a) => !excludeSet.has(a.id) && !recentlySpunKeys.has(keyOf(a.artist, a.title))
	);

	if (pool.length === 0) {
		const reason = excludeIds.length > 0 ? ('exhausted' as const) : ('all-recent' as const);
		return { album: null, exclude: excludeIds, emptyReason: reason };
	}

	const picked = pool[Math.floor(Math.random() * pool.length)];

	// Find this album's most recent spin (could predate the 30d cutoff, or
	// be null if never spun). Used only to render the eyebrow line.
	const { data: lastSpinRow } = await locals.supabase
		.from('spins')
		.select('identified_at')
		.eq('user_id', user.id)
		.ilike('artist', picked.artist)
		.ilike('album', picked.title)
		.order('identified_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	const lastSpunDate = lastSpinRow?.identified_at ? new Date(lastSpinRow.identified_at) : null;

	return {
		album: picked,
		lastSpunLabel: humanRelative(lastSpunDate),
		exclude: excludeIds
	};
};
