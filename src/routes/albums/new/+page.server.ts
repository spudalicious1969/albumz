import { redirect, fail } from '@sveltejs/kit';
import { runDiscovery } from '$lib/album-search.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const artist = url.searchParams.get('artist') ?? '';
	const title = url.searchParams.get('title') ?? '';
	const ownership = url.searchParams.get('ownership') === 'WANT' ? 'WANT' : 'OWN';

	const covers = await runDiscovery(artist, title, { withLabel: true });

	return { covers, prefill: { artist, title, ownership } };
};

export const actions: Actions = {
	search: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const artist = (form.get('artist') as string).trim();
		const title = (form.get('title') as string).trim();
		const ownership = form.get('ownership') === 'WANT' ? 'WANT' : 'OWN';

		if (!artist && !title) {
			return fail(400, { error: 'Enter an artist or an album title (or both) to search.' });
		}

		const covers = await runDiscovery(artist, title, { withLabel: true });
		return { covers, prefill: { artist, title, ownership } };
	},

	save: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const artist = (form.get('artist') as string).trim();
		const title = (form.get('title') as string).trim();

		if (!artist || !title) return fail(400, { error: 'Artist and title are required.' });

		const year = form.get('year') ? Number(form.get('year')) : null;
		const rating = form.get('rating') ? Number(form.get('rating')) : null;
		const tagRaw = ((form.get('tags') as string) ?? '').trim();
		const tags = tagRaw
			? tagRaw
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean)
			: [];

		const ownership = form.get('ownership') === 'WANT' ? 'WANT' : 'OWN';

		const { error } = await locals.supabase.from('albums').insert({
			user_id: user.id,
			artist,
			title,
			year,
			format: form.get('format') || null,
			label: form.get('label') || null,
			rating,
			notes: form.get('notes') || null,
			tags,
			ownership,
			cover_url: form.get('cover_url') || null,
			accent_color: form.get('accent_color') || null
		});

		if (error) return fail(500, { error: error.message });

		redirect(303, ownership === 'WANT' ? '/wantlist' : '/');
	}
};
