import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// PATCH /api/albums/[id]/accent { accent_color: string | null }
// Stores a client-extracted accent color (typically an oklch() string from
// extractAccentColorFromImg). Used by the home-page bulk backfill so each
// album's accent is refreshed alongside its cover.
export const PATCH: RequestHandler = async ({ request, locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not authenticated');

	const body = (await request.json()) as { accent_color?: string | null };
	const accent = typeof body.accent_color === 'string' ? body.accent_color.trim() : null;

	const { error: dbError } = await locals.supabase
		.from('albums')
		.update({ accent_color: accent || null })
		.eq('id', params.id)
		.eq('user_id', user.id);

	if (dbError) error(500, dbError.message);
	return json({ ok: true });
};
