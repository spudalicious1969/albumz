import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type DigestRow = {
	id: string;
	user_id: string;
	week_ending: string;
	body: string;
	model_used: string;
	inputs: Record<string, string> | null;
	status: 'draft' | 'published' | 'discarded';
	created_at: string;
	published_at: string | null;
};

export const load: PageServerLoad = async ({ params, locals }) => {
	const { data: digest, error: digestErr } = await locals.supabase
		.from('digests')
		.select('id, user_id, week_ending, body, model_used, inputs, status, created_at, published_at')
		.eq('id', params.id)
		.maybeSingle();

	if (digestErr) error(500, digestErr.message);
	if (!digest) error(404, 'Digest not found.');

	const { user } = await locals.safeGetSession();
	const isOwner = user?.id === digest.user_id;

	// Drafts and discarded digests are owner-only. Published is public.
	if (!isOwner && digest.status !== 'published') {
		error(404, 'Digest not found.');
	}

	// Pull the author's profile so we can show name + link back to their page.
	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('username, display_name')
		.eq('id', digest.user_id)
		.maybeSingle();

	return {
		digest: digest as DigestRow,
		isOwner,
		author: profile ? { username: profile.username, displayName: profile.display_name ?? profile.username } : null
	};
};

export const actions: Actions = {
	publish: async ({ params, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Not signed in.' });

		const { data: digest } = await locals.supabase
			.from('digests')
			.select('user_id, status')
			.eq('id', params.id)
			.maybeSingle();
		if (!digest) return fail(404, { error: 'Digest not found.' });
		if (digest.user_id !== user.id) return fail(403, { error: 'Not your digest.' });
		if (digest.status === 'published') return fail(400, { error: 'Already published.' });

		const { error: updErr } = await locals.supabase
			.from('digests')
			.update({ status: 'published', published_at: new Date().toISOString() })
			.eq('id', params.id);
		if (updErr) return fail(500, { error: updErr.message });

		return { published: true };
	},

	discard: async ({ params, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Not signed in.' });

		const { data: digest } = await locals.supabase
			.from('digests')
			.select('user_id')
			.eq('id', params.id)
			.maybeSingle();
		if (!digest) return fail(404, { error: 'Digest not found.' });
		if (digest.user_id !== user.id) return fail(403, { error: 'Not your digest.' });

		const { error: updErr } = await locals.supabase
			.from('digests')
			.update({ status: 'discarded' })
			.eq('id', params.id);
		if (updErr) return fail(500, { error: updErr.message });

		// Send them back to settings where the Generate button lives.
		redirect(303, '/settings');
	},

	unpublish: async ({ params, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Not signed in.' });

		const { data: digest } = await locals.supabase
			.from('digests')
			.select('user_id, status')
			.eq('id', params.id)
			.maybeSingle();
		if (!digest) return fail(404, { error: 'Digest not found.' });
		if (digest.user_id !== user.id) return fail(403, { error: 'Not your digest.' });
		if (digest.status !== 'published') return fail(400, { error: 'Not currently published.' });

		const { error: updErr } = await locals.supabase
			.from('digests')
			.update({ status: 'draft', published_at: null })
			.eq('id', params.id);
		if (updErr) return fail(500, { error: updErr.message });

		return { unpublished: true };
	}
};
