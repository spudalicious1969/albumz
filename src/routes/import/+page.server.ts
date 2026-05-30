import { redirect, fail } from '@sveltejs/kit';
import { detectKind, parseAndNormalize } from '$lib/import/parse';
import { existingAlbumKeys, dedupeKey } from '$lib/dedupe.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	preview: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const file = form.get('file') as File | null;
		const pastedCsv = (form.get('pasted_csv') as string ?? '').trim();

		let buffer: Buffer;
		let kind: ReturnType<typeof detectKind>;

		if (file && file.size > 0) {
			kind = detectKind(file.name);
			if (!kind) return fail(400, { error: `Unsupported file type: ${file.name}` });
			buffer = Buffer.from(await file.arrayBuffer());
		} else if (pastedCsv) {
			kind = 'csv';
			buffer = Buffer.from(pastedCsv, 'utf-8');
		} else {
			return fail(400, { error: 'Pick a file or paste CSV text.' });
		}

		const parsed = parseAndNormalize(buffer, kind);

		if (parsed.totalRows === 0) {
			return fail(400, { error: 'No rows found in the file.' });
		}
		if (!parsed.detectedColumns.artist || !parsed.detectedColumns.title) {
			return fail(400, {
				error: `Couldn't find required columns (artist + title). Detected headers: ${parsed.sourceHeaders.join(', ')}`
			});
		}

		// Mark rows that already exist in the user's collection so they default
		// to skipped. The .skipReason field is consumed by the preview UI.
		const existing = await existingAlbumKeys(locals.supabase, user.id);
		const seenInBatch = new Set<string>();
		for (const row of parsed.rows) {
			if (row.skipReason) continue;
			if (!row.artist || !row.title) continue;
			const key = dedupeKey(row.artist, row.title);
			if (existing.has(key)) {
				row.skipReason = 'Already in collection';
			} else if (seenInBatch.has(key)) {
				row.skipReason = 'Duplicate row in this file';
			} else {
				seenInBatch.add(key);
			}
		}

		return { parsed };
	},

	commit: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const payload = form.get('rows') as string;
		if (!payload) return fail(400, { error: 'Nothing to import.' });

		let rows: Array<{
			artist: string;
			title: string;
			year: number | null;
			format: string | null;
			label: string | null;
			rating: number | null;
			notes: string | null;
			tags: string[];
			ownership: 'OWN' | 'WANT';
		}>;

		try {
			rows = JSON.parse(payload);
		} catch {
			return fail(400, { error: 'Bad payload.' });
		}

		const insertable = rows
			.filter((r) => r.artist?.trim() && r.title?.trim())
			.map((r) => ({
				user_id:   user.id,
				artist:    r.artist.trim(),
				title:     r.title.trim(),
				year:      r.year,
				format:    r.format,
				label:     r.label,
				rating:    r.rating,
				notes:     r.notes,
				tags:      r.tags ?? [],
				ownership: r.ownership ?? 'OWN'
			}));

		if (insertable.length === 0) return fail(400, { error: 'No valid rows to import.' });

		const { error } = await locals.supabase.from('albums').insert(insertable);
		if (error) return fail(500, { error: error.message });

		// Activity log — single summary entry for 6+, individual for ≤5
		if (insertable.length >= 6) {
			await locals.supabase.from('activity').insert({
				user_id: user.id,
				type: 'import',
				description: `Imported ${insertable.length} albums`
			});
		} else {
			await locals.supabase.from('activity').insert(
				insertable.map((r) => ({
					user_id: user.id,
					type: 'add',
					description: `Added ${r.artist} – ${r.title}`
				}))
			);
		}

		redirect(303, `/?imported=${insertable.length}`);
	}
};
