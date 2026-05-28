// Article-aware sort helpers. Strips leading "the / a / an " so "The Beths"
// sorts with B and "A Night at the Opera" sorts with N — same convention as
// iTunes / Plex. Display text is never modified; this only affects sort keys.

const LEADING_ARTICLE = /^(the|a|an)\s+/i;

export function sortKey(s: string | null | undefined): string {
	if (!s) return '';
	return s.replace(LEADING_ARTICLE, '').trim().toLowerCase();
}

export function compareByKey(a: string | null | undefined, b: string | null | undefined): number {
	return sortKey(a).localeCompare(sortKey(b));
}
