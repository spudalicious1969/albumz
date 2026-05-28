import { redirect, fail, error } from '@sveltejs/kit';
import { resolveExternalLinks } from '$lib/external-links.server';
import { fetchTracklist } from '$lib/tracklist.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const [albumRes, profileRes] = await Promise.all([
		locals.supabase
			.from('albums')
			.select('*')
			.eq('id', params.id)
			.eq('user_id', user.id)
			.maybeSingle(),
		locals.supabase
			.from('profiles')
			.select('featured_album_id')
			.eq('id', user.id)
			.maybeSingle()
	]);

	if (albumRes.error) error(500, albumRes.error.message);
	if (!albumRes.data) error(404, 'Album not found');

	const album = albumRes.data;
	const [externalLinks, tracklist] = await Promise.all([
		resolveExternalLinks(album.artist, album.title),
		fetchTracklist(album.artist, album.title)
	]);

	return {
		album,
		isFeatured: profileRes.data?.featured_album_id === album.id,
		externalLinks,
		tracklist
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const artist = (form.get('artist') as string).trim();
		const title = (form.get('title') as string).trim();

		if (!artist || !title) return fail(400, { error: 'Artist and title are required.' });

		const year = form.get('year') ? Number(form.get('year')) : null;
		const rating = form.get('rating') ? Number(form.get('rating')) : null;
		const tagRaw = ((form.get('tags') as string) ?? '').trim();
		const tags = tagRaw ? tagRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

		const updates: Record<string, unknown> = {
			artist,
			title,
			year,
			format: form.get('format') || null,
			label: form.get('label') || null,
			rating,
			notes: form.get('notes') || null,
			tags,
			ownership: form.get('ownership') ?? 'OWN',
			hidden: form.get('hidden') === 'on'
		};

		// Optional cover swap from a Look-up pick — only applied if the form
		// included a fresh cover_url (the lookup panel adds it as a hidden field).
		const newCover = form.get('cover_url');
		if (typeof newCover === 'string' && newCover.trim()) {
			updates.cover_url = newCover.trim();
			const newAccent = form.get('accent_color');
			updates.accent_color = typeof newAccent === 'string' && newAccent.trim() ? newAccent.trim() : null;
		}

		const { error: dbError } = await locals.supabase
			.from('albums')
			.update(updates)
			.eq('id', params.id)
			.eq('user_id', user.id);

		if (dbError) return fail(500, { error: dbError.message });

		return { saved: true };
	},

	toggleFeatured: async ({ locals, params }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const { data: profile } = await locals.supabase
			.from('profiles')
			.select('featured_album_id')
			.eq('id', user.id)
			.maybeSingle();

		const next = profile?.featured_album_id === params.id ? null : params.id;

		const { error: dbError } = await locals.supabase
			.from('profiles')
			.update({ featured_album_id: next })
			.eq('id', user.id);

		if (dbError) return fail(500, { error: dbError.message });
		return { featuredToggled: true };
	},

	setCover: async ({ request, locals, params }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const cover_url = (form.get('cover_url') as string)?.trim() || null;
		const accent_color = (form.get('accent_color') as string)?.trim() || null;

		const { error: dbError } = await locals.supabase
			.from('albums')
			.update({ cover_url, accent_color })
			.eq('id', params.id)
			.eq('user_id', user.id);

		if (dbError) return fail(500, { error: dbError.message });
		return { saved: true };
	},

	delete: async ({ locals, params }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const { error: dbError } = await locals.supabase
			.from('albums')
			.delete()
			.eq('id', params.id)
			.eq('user_id', user.id);

		if (dbError) return fail(500, { error: dbError.message });

		redirect(303, '/');
	}
};
