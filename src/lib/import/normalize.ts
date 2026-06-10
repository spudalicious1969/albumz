// Column-name → field aliases. Case-insensitive, whitespace-normalized.
const COLUMN_ALIASES: Record<string, string[]> = {
	artist: ['artist', 'artist name', 'band', 'performer'],
	title: ['title', 'album', 'album name', 'album title', 'release', 'release title'],
	year: ['year', 'release year', 'released', 'date', 'release date'],
	format: ['format', 'media', 'media type', 'media format'],
	label: ['label', 'record label', 'publisher'],
	rating: ['rating', 'my rating', 'score', 'stars'],
	notes: ['notes', 'comment', 'comments', 'description', 'collection notes'],
	tags: ['tags', 'genre', 'genres', 'style', 'styles', 'category', 'categories'],
	ownership: ['ownership', 'status', 'collection status', 'type', 'collectionfolder']
};

function normHeader(s: string): string {
	return s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Map raw header names from the file to our canonical fields. */
export function detectColumns(headers: string[]): Record<string, string> {
	const map: Record<string, string> = {};
	for (const header of headers) {
		const normalized = normHeader(header);
		for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
			if (map[field]) continue; // first match wins
			if (aliases.includes(normalized)) {
				map[field] = header;
				break;
			}
		}
	}
	return map;
}

/** "1979", "1979-06-23", "23 Jun 1979" → 1979; garbage → null */
export function normalizeYear(raw: unknown): number | null {
	if (raw === null || raw === undefined || raw === '') return null;
	const s = String(raw).trim();
	const yearMatch = s.match(/\b(19|20)\d{2}\b/);
	if (yearMatch) {
		const n = Number(yearMatch[0]);
		if (n >= 1900 && n <= 2099) return n;
	}
	return null;
}

/** "5", "5/5", "★★★★★", "5.0" → 5 (clamped 1–5); garbage → null */
export function normalizeRating(raw: unknown): number | null {
	if (raw === null || raw === undefined || raw === '') return null;
	const s = String(raw).trim();

	const starCount = (s.match(/★/g) ?? []).length;
	if (starCount >= 1 && starCount <= 5) return starCount;

	const num = parseFloat(s);
	if (Number.isFinite(num)) {
		const rounded = Math.round(num);
		if (rounded >= 1 && rounded <= 5) return rounded;
		// Handle 10-point scales: "8/10" → 4
		if (rounded >= 6 && rounded <= 10) return Math.round((rounded / 10) * 5);
	}
	return null;
}

/**
 * Format normalization.
 *  - Bare numbers "7", "10", "12" → '7"', '10"', '12"' (vinyl size shorthand)
 *  - Discogs-style "LP, Album, Stereo" → "LP"
 *  - "Vinyl", "Album" → "LP"
 *  - "Compact Disc" → "CD"
 */
export function normalizeFormat(raw: unknown): string | null {
	if (raw === null || raw === undefined || raw === '') return null;
	const s = String(raw).trim();
	if (!s) return null;

	// Take the first comma-separated piece (Discogs format columns are like "LP, Album, Stereo")
	const first = s.split(',')[0].trim();
	const lower = first.toLowerCase();

	// Bare vinyl-size shorthand
	if (/^7$/.test(first)) return '7"';
	if (/^10$/.test(first)) return '10"';
	if (/^12$/.test(first)) return '12"';

	// Already-formed shorthand
	if (/^7"$/.test(first) || /^10"$/.test(first) || /^12"$/.test(first)) return first;

	if (['lp', 'vinyl', 'album', '33 ⅓ rpm', '33 1/3 rpm'].includes(lower)) return 'LP';
	if (['cd', 'compact disc'].includes(lower)) return 'CD';
	if (['cassette', 'tape', 'cs'].includes(lower)) return 'Cassette';
	if (['digital', 'file', 'flac', 'mp3', 'aac', 'streaming'].includes(lower)) return 'Digital';

	// Otherwise pass through the first piece as-is, preserving the user's term
	return first;
}

/**
 * Ownership normalization. Default 'OWN' when ambiguous.
 *  - "own", "owned", "collection" → "OWN"
 *  - "want", "wantlist", "wishlist", "discogs:wantlist" → "WANT"
 */
export function normalizeOwnership(raw: unknown): 'OWN' | 'WANT' {
	if (raw === null || raw === undefined || raw === '') return 'OWN';
	const s = String(raw).toLowerCase().trim();
	if (!s) return 'OWN';
	if (s.includes('want') || s.includes('wish')) return 'WANT';
	return 'OWN';
}

/** "rock, jazz, 70s" → ["rock", "jazz", "70s"] */
export function normalizeTags(raw: unknown): string[] {
	if (raw === null || raw === undefined || raw === '') return [];
	const s = String(raw).trim();
	if (!s) return [];
	return s
		.split(/[,;|]/)
		.map((t) => t.trim())
		.filter(Boolean);
}
