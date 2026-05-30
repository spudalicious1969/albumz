import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const username = params.username.toLowerCase();

	const { data: profile, error: profileErr } = await locals.supabase
		.from('profiles')
		.select('id, username, display_name')
		.eq('username', username)
		.maybeSingle();

	if (profileErr) error(500, profileErr.message);
	if (!profile) error(404, 'No user at this URL.');

	const { data: digests, error: digestsErr } = await locals.supabase
		.from('digests')
		.select('id, week_ending, body, published_at')
		.eq('user_id', profile.id)
		.eq('status', 'published')
		.order('week_ending', { ascending: false })
		.limit(60);

	if (digestsErr) error(500, digestsErr.message);

	return {
		profile: { username: profile.username, displayName: profile.display_name ?? profile.username },
		digests: digests ?? []
	};
};
