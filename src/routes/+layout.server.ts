import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();

	let theme: 'auto' | 'light' | 'dark' = 'auto';
	let profile: {
		username: string;
		display_name: string | null;
		avatar_url: string | null;
		email_hash: string | null;
		last_fm_username: string | null;
	} | null = null;

	if (user) {
		const { data } = await locals.supabase
			.from('profiles')
			.select('username, display_name, avatar_url, email_hash, last_fm_username, theme')
			.eq('id', user.id)
			.maybeSingle();
		if (data) {
			profile = {
				username: data.username,
				display_name: data.display_name,
				avatar_url: data.avatar_url,
				email_hash: data.email_hash,
				last_fm_username: data.last_fm_username
			};
			if (data.theme === 'light' || data.theme === 'dark') theme = data.theme;
		}
	}

	return { session, user, theme, profile };
};
