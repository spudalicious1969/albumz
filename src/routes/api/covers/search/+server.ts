import { error, json } from '@sveltejs/kit';
import { runDiscovery } from '$lib/album-search.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not authenticated');

	const artist = (url.searchParams.get('artist') ?? '').trim();
	const title = (url.searchParams.get('title') ?? '').trim();

	const covers = await runDiscovery(artist, title, { withLabel: true });
	return json({ covers });
};
