// Group multi-source cover search results into one entry per album, so that
// the UI can show a single record with each source as an "apply" affordance
// instead of repeating the same record five times — once per source — as
// distinct rows. Used by both /albums/[id] (edit lookup) and /albums/new.

import type { CoverResult, CoverSource } from './cover-types';

export const LOOKUP_SOURCE_LABEL: Record<CoverSource, string> = {
	spotify: 'Spotify',
	deezer: 'Deezer',
	itunes: 'iTunes',
	lastfm: 'Last.fm',
	musicbrainz: 'MusicBrainz'
};

export type ResultGroup = {
	artist: string;
	title: string;
	sources: CoverResult[];
};

// Lowercased, accent-stripped, punctuation-removed, whitespace-collapsed. Means
// "Dominique Fils-Aimé" and "Dominique Fils-Aime" land in the same group while
// genuinely different albums (different artist or title) stay split.
function normalizeForGroup(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^\w\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function groupResults(results: CoverResult[]): ResultGroup[] {
	const groups = new Map<string, ResultGroup>();
	for (const r of results) {
		const key = `${normalizeForGroup(r.artist)}::${normalizeForGroup(r.title)}`;
		let g = groups.get(key);
		if (!g) {
			g = { artist: r.artist, title: r.title, sources: [] };
			groups.set(key, g);
		} else {
			// Keep the longest version of each — usually the more complete one
			// (e.g. "Sgt. Pepper's Lonely Hearts Club Band" over "Sgt Pepper").
			if (r.artist.length > g.artist.length) g.artist = r.artist;
			if (r.title.length > g.title.length) g.title = r.title;
		}
		g.sources.push(r);
	}
	return [...groups.values()];
}

export function uniqueYears(group: ResultGroup): number[] {
	const set = new Set<number>();
	for (const s of group.sources) if (s.year) set.add(s.year);
	return [...set].sort();
}

export function uniqueLabels(group: ResultGroup): string[] {
	const set = new Set<string>();
	for (const s of group.sources) if (s.label?.trim()) set.add(s.label.trim());
	return [...set];
}

/** One result per source within a group. First encountered wins; year/label
 *  aggregation still scans the full sources list so no info is lost. */
export function uniqueBySource(sources: CoverResult[]): CoverResult[] {
	const seen = new Set<string>();
	const out: CoverResult[] = [];
	for (const s of sources) {
		if (seen.has(s.source)) continue;
		seen.add(s.source);
		out.push(s);
	}
	return out;
}
