import Papa from 'papaparse';

export interface ExportableAlbum {
	artist: string;
	title: string;
	year: number | null;
	format: string | null;
	label: string | null;
	rating: number | null;
	notes: string | null;
	tags: string[] | null;
	ownership: 'OWN' | 'WANT';
	hidden: boolean;
	cover_url: string | null;
	accent_color: string | null;
	discogs_id: string | null;
	created_at: string;
}

// Headers mirror import's canonical field names so a round-trip
// (export → re-import) preserves the core data. Extra columns
// after `ownership` are passed through for archival fidelity;
// the import path ignores unknown headers.
const COLUMNS: Array<{ header: string; pick: (a: ExportableAlbum) => string }> = [
	{ header: 'artist',       pick: (a) => a.artist },
	{ header: 'title',        pick: (a) => a.title },
	{ header: 'year',         pick: (a) => a.year != null ? String(a.year) : '' },
	{ header: 'format',       pick: (a) => a.format ?? '' },
	{ header: 'label',        pick: (a) => a.label ?? '' },
	{ header: 'rating',       pick: (a) => a.rating != null ? String(a.rating) : '' },
	{ header: 'notes',        pick: (a) => a.notes ?? '' },
	{ header: 'tags',         pick: (a) => (a.tags ?? []).join(', ') },
	{ header: 'ownership',    pick: (a) => a.ownership },
	{ header: 'hidden',       pick: (a) => a.hidden ? 'true' : 'false' },
	{ header: 'cover_url',    pick: (a) => a.cover_url ?? '' },
	{ header: 'accent_color', pick: (a) => a.accent_color ?? '' },
	{ header: 'discogs_id',   pick: (a) => a.discogs_id ?? '' },
	{ header: 'created_at',   pick: (a) => a.created_at }
];

export function buildCsv(albums: ExportableAlbum[]): string {
	const headers = COLUMNS.map((c) => c.header);
	const rows = albums.map((a) => COLUMNS.map((c) => c.pick(a)));
	return Papa.unparse({ fields: headers, data: rows });
}

export function exportFilename(username: string, date = new Date()): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	const safe = (username || 'collection').replace(/[^a-z0-9_-]/gi, '');
	return `albumz-${safe}-${yyyy}-${mm}-${dd}.csv`;
}
