import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
	detectColumns,
	normalizeFormat,
	normalizeOwnership,
	normalizeRating,
	normalizeTags,
	normalizeYear
} from './normalize';
import type { ImportRow, ParsedFile } from './types';

export type FileKind = 'csv' | 'xlsx' | 'xls';

export function detectKind(filename: string): FileKind | null {
	const lower = filename.toLowerCase();
	if (lower.endsWith('.csv')) return 'csv';
	if (lower.endsWith('.xlsx')) return 'xlsx';
	if (lower.endsWith('.xls')) return 'xls';
	return null;
}

/** Parse a buffer into rows of { header → value } objects. */
function parseFile(buffer: Buffer, kind: FileKind): Record<string, unknown>[] {
	if (kind === 'csv') {
		const text = buffer.toString('utf-8');
		const result = Papa.parse<Record<string, unknown>>(text, {
			header: true,
			skipEmptyLines: true,
			transformHeader: (h) => h.trim()
		});
		return result.data ?? [];
	}

	// xlsx / xls
	const wb = XLSX.read(buffer, { type: 'buffer' });
	const firstSheet = wb.SheetNames[0];
	if (!firstSheet) return [];
	const sheet = wb.Sheets[firstSheet];
	return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

/** Parse + normalize a file into ImportRows ready for preview / insert. */
export function parseAndNormalize(buffer: Buffer, kind: FileKind): ParsedFile {
	const raw = parseFile(buffer, kind);

	const sourceHeaders = raw.length > 0 ? Object.keys(raw[0]) : [];
	const detected = detectColumns(sourceHeaders);

	const rows: ImportRow[] = raw.map((row, i) => {
		const get = (field: string): unknown => {
			const col = detected[field];
			return col ? row[col] : '';
		};

		const artist = String(get('artist') ?? '').trim();
		const title  = String(get('title')  ?? '').trim();

		const out: ImportRow = {
			artist,
			title,
			year:      normalizeYear(get('year')),
			format:    normalizeFormat(get('format')),
			label:     String(get('label') ?? '').trim() || null,
			rating:    normalizeRating(get('rating')),
			notes:     String(get('notes') ?? '').trim() || null,
			tags:      normalizeTags(get('tags')),
			ownership: normalizeOwnership(get('ownership')),
			rowIndex:  i
		};

		if (!artist || !title) {
			out.skipReason = !artist && !title
				? 'Missing artist and title'
				: !artist ? 'Missing artist' : 'Missing title';
		}

		return out;
	});

	return {
		rows,
		detectedColumns: detected,
		sourceHeaders,
		totalRows: raw.length
	};
}
