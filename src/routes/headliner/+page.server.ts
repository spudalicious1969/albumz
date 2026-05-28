import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();

	// If logged in, redirect to your own Headliner
	if (user) {
		const { data: profile } = await locals.supabase
			.from('profiles')
			.select('username')
			.eq('id', user.id)
			.maybeSingle();
		if (profile?.username) redirect(303, `/headliner/${profile.username}`);
	}

	// Otherwise, present a tiny picker so the kiosk URL is easy to land on
	const { data: profiles } = await locals.supabase
		.from('profiles')
		.select('username, display_name')
		.not('last_fm_username', 'is', null)
		.order('username');

	return { profiles: profiles ?? [] };
};
