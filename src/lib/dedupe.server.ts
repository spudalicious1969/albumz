// Album duplicate handling. Two surfaces use this:
//   1. /import preview marks rows that already exist in the collection so
//      they default to skipped instead of creating new dupes.
//   2. Settings "Find duplicates" tool finds and removes existing dupes,
//      keeping the highest-metadata row per (artist, title) group.
//
// Duplicate definition is intentionally loose: same (artist, title)
// case-insensitive, regardless of year / format / ownership. The 99%
// case is "I double-imported a CSV"; the rare dual-pressings collector
// can re-add by hand with distinguishing data.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AlbumForDedupe = {
	id: string;
	artist: string;
	title: string;
	year: number | null;
	format: string | null;
	rating: number | null;
	notes: string | null;
	tags: string[] | null;
	cover_url: string | null;
	created_at: string;
};

export function dedupeKey(artist: string, title: string): string {
	return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
}

/** Score an album by how much user-added metadata it carries. Higher score
 * wins when we have to pick one duplicate to keep. */
export function metadataScore(a: AlbumForDedupe): number {
	let score = 0;
	if (a.cover_url) score += 5;
	if (a.rating != null) score += 2;
	if (a.notes && a.notes.trim().length > 0) score += 3 + Math.min(a.notes.trim().length / 80, 5);
	if (a.tags && a.tags.length > 0) score += a.tags.length;
	if (a.year != null) score += 1;
	if (a.format) score += 1;
	return score;
}

/** Pick the survivor in a duplicate group: highest metadata score, oldest
 * created_at as tiebreaker. */
export function pickSurvivor(group: AlbumForDedupe[]): AlbumForDedupe {
	return group.slice().sort((a, b) => {
		const scoreDiff = metadataScore(b) - metadataScore(a);
		if (scoreDiff !== 0) return scoreDiff;
		return a.created_at.localeCompare(b.created_at);
	})[0];
}

export type DuplicateScan = {
	groups: AlbumForDedupe[][];
	totalDuplicates: number;
};

/** Find all duplicate groups for a user. Returns each group sorted with the
 * survivor first. Groups of size 1 (no duplicates) are excluded. */
export async function scanDuplicates(
	supabase: SupabaseClient,
	userId: string
): Promise<DuplicateScan> {
	const { data, error } = await supabase
		.from('albums')
		.select('id, artist, title, year, format, rating, notes, tags, cover_url, created_at')
		.eq('user_id', userId);

	if (error) throw new Error(error.message);

	const byKey = new Map<string, AlbumForDedupe[]>();
	for (const album of (data ?? []) as AlbumForDedupe[]) {
		const key = dedupeKey(album.artist, album.title);
		const arr = byKey.get(key);
		if (arr) arr.push(album);
		else byKey.set(key, [album]);
	}

	const groups: AlbumForDedupe[][] = [];
	let totalDuplicates = 0;
	for (const group of byKey.values()) {
		if (group.length < 2) continue;
		const survivor = pickSurvivor(group);
		const ordered = [survivor, ...group.filter((a) => a.id !== survivor.id)];
		groups.push(ordered);
		totalDuplicates += group.length - 1;
	}

	return { groups, totalDuplicates };
}

/** Remove all duplicate albums for a user, keeping the highest-metadata
 * survivor per (artist, title) group. Returns the count removed. */
export async function removeDuplicates(
	supabase: SupabaseClient,
	userId: string
): Promise<number> {
	const scan = await scanDuplicates(supabase, userId);
	const idsToDelete: string[] = [];
	for (const group of scan.groups) {
		for (let i = 1; i < group.length; i++) {
			idsToDelete.push(group[i].id);
		}
	}
	if (idsToDelete.length === 0) return 0;

	const { error } = await supabase
		.from('albums')
		.delete()
		.in('id', idsToDelete)
		.eq('user_id', userId);
	if (error) throw new Error(error.message);

	return idsToDelete.length;
}

/** Pull the set of (artist, title) keys already in a user's collection.
 * Used by /import preview to mark would-be duplicates. */
export async function existingAlbumKeys(
	supabase: SupabaseClient,
	userId: string
): Promise<Set<string>> {
	const { data, error } = await supabase
		.from('albums')
		.select('artist, title')
		.eq('user_id', userId);
	if (error) throw new Error(error.message);
	const keys = new Set<string>();
	for (const row of data ?? []) {
		keys.add(dedupeKey(row.artist, row.title));
	}
	return keys;
}
