// Central tag-cleanup module: stoplist + merge logic, applied uniformly
// across every source (Discogs, Last.fm artist/album, qwen). Browser-safe
// so the album editor can call mergeTags() reactively without dragging in
// server-only imports.

// Tags so generic they don't anchor a hook: genre umbrellas, era buckets,
// preference markers, locale labels, vocalist-role tags. The second tier
// (post-punk, shoegaze, krautrock, dream pop, etc.) is where Albumz tags get
// their flavor; this stoplist clears the way for them to surface. Applied at
// both fetch-time (Last.fm) and merge-time (catches Discogs' "Rock" /
// "Alternative Rock" and any qwen umbrella-isms).
const TAG_STOPLIST = new Set([
	// Genre umbrellas
	'rock', 'pop', 'indie', 'alternative', 'alternative rock', 'indie rock', 'indie pop',
	// Era / decade buckets
	'50s', '60s', '70s', '80s', '90s', '00s', '10s', '20s',
	'2000s', '2010s', '2020s', 'classic rock', 'oldies',
	// Preference / meta noise
	'seen live', 'favourite', 'favourites', 'favorite', 'favorites',
	'my favourites', 'my favorites', 'awesome', 'amazing', 'love', 'great', 'best', 'cool', 'good',
	'love it', 'loved',
	// Locale labels
	'american', 'british', 'english', 'uk', 'usa', 'american rock', 'british rock',
	'american indie', 'british indie',
	// Vocalist role
	'male vocalists', 'female vocalists', 'male vocalist', 'female vocalist',
	// Other catch-all
	'all', 'music'
]);

// Pattern-based junk filters for things that can't be enumerated exhaustively:
// year tags (1979), decade-as-year (1970s), list-membership noise
// ("1001 albums you must hear before you die", "rolling stone top 500"),
// and preference praise like "killer album" / "perfect record".
// Tags are already lowercased before this runs, so no /i flag needed.
const TAG_STOPLIST_PATTERNS: RegExp[] = [
	// Numeric-only tags — years, counts, junk like "100"
	/^\d+$/,
	// Decade-as-year (1970s, 2010s) — bare decade tags like "70s" are above
	/^\d+s$/,
	// List-membership noise
	/you must hear/,
	/^\d+\s*albums?\b/,
	/\btop\s*\d+/,
	/\bgreatest\s*\d+/,
	/\d+\s*greatest/,
	/\ball.?time\b/,
	// Preference / quality praise — "killer album", "perfect record", etc.
	/^(killer|great|greatest|perfect|amazing|brilliant|incredible|wonderful|essential|favourite|favorite|fav|godlike|legendary|epic|stunning|classic)\s+(album|track|song|record|tune|artist|band)s?$/,
	/^masterpiece(s)?$/,
	/\b(album|track|song|record)\s+of\s+the\s+(year|decade|century)\b/
];

function isStoplisted(loweredTag: string): boolean {
	if (TAG_STOPLIST.has(loweredTag)) return true;
	for (const pat of TAG_STOPLIST_PATTERNS) {
		if (pat.test(loweredTag)) return true;
	}
	return false;
}

/** Filter junk tags from a single source's list. Used by Last.fm fetchers so
 *  their per-source limit caps fill with useful tags, not stoplisted noise. */
export function filterStoplist(tags: string[]): string[] {
	return tags.filter((t) => !isStoplisted(t));
}

/** Merge tags from multiple sources, preserving the casing of the first
 *  appearance and skipping near-duplicates (case + whitespace/hyphens). The
 *  dedup key collapses "New Wave" / "new wave" / "new-wave" into one entry so
 *  Discogs + Last.fm + qwen don't stack three almost-identical tags.
 *
 *  Source ordering decides which casing wins on dedup — list curated sources
 *  first (Discogs > Last.fm > qwen) so they set the canonical display form.
 *  The stoplist is applied here so Discogs' "Rock" and qwen's umbrella-isms
 *  get filtered consistently with Last.fm. */
export function mergeTags(...sources: string[][]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const list of sources) {
		for (const raw of list) {
			const trimmed = raw.trim();
			if (!trimmed) continue;
			const lowered = trimmed.toLowerCase();
			if (isStoplisted(lowered)) continue;
			const key = lowered.replace(/[\s_-]+/g, '');
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push(trimmed);
		}
	}
	return out;
}
