import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('username, onboarded')
		.eq('id', user.id)
		.maybeSingle();

	if (profile?.onboarded) redirect(303, '/');

	return { suggestedUsername: profile?.username ?? '' };
};

export const actions: Actions = {
	complete: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const form = await request.formData();
		const username = (form.get('username') as string ?? '').trim().toLowerCase();

		if (!username || !/^[a-z0-9][a-z0-9_.-]*$/.test(username) || username.length < 2) {
			return fail(400, { error: 'Username must start with a letter or number and can contain letters, numbers, underscores, hyphens, and periods.' });
		}

		const { error } = await locals.supabase
			.from('profiles')
			.update({ username, onboarded: true })
			.eq('id', user.id);

		if (error) {
			if (error.code === '23505') return fail(400, { error: 'That username is already taken. Please choose another.' });
			return fail(500, { error: error.message });
		}

		redirect(303, '/');
	}
};
