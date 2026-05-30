import { redirect, error } from '@sveltejs/kit';
import { lastfmAuthUrl } from '$lib/lastfm.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const callback = `${url.origin}/auth/lastfm/callback`;
	redirect(303, lastfmAuthUrl(callback));
};
