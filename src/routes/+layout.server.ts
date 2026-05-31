import type { LayoutServerLoad } from './$types';

// Old forgotten drafts shouldn't keep nagging forever; only surface drafts
// for weeks ending within the last 14 days.
const PENDING_DRAFT_MAX_AGE_DAYS = 14;

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
	let pendingDigest: { id: string; week_ending: string } | null = null;

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

		const cutoff = new Date(Date.now() - PENDING_DRAFT_MAX_AGE_DAYS * 86_400_000)
			.toISOString()
			.slice(0, 10);
		const { data: draft } = await locals.supabase
			.from('digests')
			.select('id, week_ending')
			.eq('user_id', user.id)
			.eq('status', 'draft')
			.gte('week_ending', cutoff)
			.order('week_ending', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (draft) pendingDigest = { id: draft.id, week_ending: draft.week_ending };
	}

	return { session, user, theme, profile, pendingDigest };
};
