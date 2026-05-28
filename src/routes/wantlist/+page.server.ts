import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const { data: albums, error: dbError } = await locals.supabase
		.from('albums')
		.select('id, artist, title, year, format, label, rating, notes, tags, cover_url, accent_color, created_at')
		.eq('user_id', user.id)
		.eq('ownership', 'WANT')
		.order('created_at', { ascending: false });

	if (dbError) throw error(500, dbError.message);

	return { user, albums: albums ?? [] };
};

export const actions: Actions = {
	promote: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'Missing album id' });

		const { error: updateError } = await locals.supabase
			.from('albums')
			.update({ ownership: 'OWN' })
			.eq('id', id)
			.eq('user_id', user.id);

		if (updateError) return fail(500, { error: updateError.message });
		return { promoted: id };
	}
};
