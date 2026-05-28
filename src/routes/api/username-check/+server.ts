import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ available: false }, { status: 401 });

	const username = url.searchParams.get('username')?.trim().toLowerCase() ?? '';
	if (!username || !/^[a-z0-9_]+$/.test(username) || username.length < 2) {
		return json({ available: false });
	}

	const { data } = await locals.supabase
		.from('profiles')
		.select('id')
		.eq('username', username)
		.neq('id', user.id)
		.maybeSingle();

	return json({ available: data === null });
};
