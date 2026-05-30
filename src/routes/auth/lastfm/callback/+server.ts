import { redirect, error } from '@sveltejs/kit';
import { exchangeToken } from '$lib/lastfm.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const token = url.searchParams.get('token');
	if (!token) redirect(303, '/settings?lastfm=missing-token');

	let session;
	try {
		session = await exchangeToken(token);
	} catch (err) {
		console.error('[lastfm/callback] exchangeToken failed:', err);
		redirect(303, '/settings?lastfm=failed');
	}

	// Persist the session key + sync the readable handle to match the connected
	// Last.fm account so later "now playing" reads use the right username.
	const { error: dbError } = await locals.supabase
		.from('profiles')
		.update({
			lastfm_session_key: session.key,
			last_fm_username: session.name
		})
		.eq('id', user.id);

	if (dbError) redirect(303, '/settings?lastfm=db-error');

	redirect(303, '/settings?lastfm=connected');
};
