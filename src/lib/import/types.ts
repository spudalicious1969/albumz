export interface ImportRow {
	artist: string;
	title: string;
	year: number | null;
	format: string | null;
	label: string | null;
	rating: number | null;
	notes: string | null;
	tags: string[];
	ownership: 'OWN' | 'WANT';
	// For UI: which raw row produced this, plus any skip reason
	rowIndex: number;
	skipReason?: string;
}

export interface ParsedFile {
	rows: ImportRow[];
	detectedColumns: Record<string, string>; // field name → source column header
	sourceHeaders: string[];
	totalRows: number;
}
