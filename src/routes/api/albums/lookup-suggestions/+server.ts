// GET /api/albums/lookup-suggestions?artist=&title=
//
// Companion to the cover-search endpoint, called in parallel from the album
// edit page's "Look up details" panel. Returns tag and label suggestions
// using the same chain as the bulk backfill: Discogs first (release-level
// curated style+genre), Last.fm artist tags as fallback, qwen as final
// fallback. Label only comes from qwen since catalog sources are noisy on
// label (often distributor or imprint rather than original label).
//
// Tags returned with a source so the UI can badge their provenance.

import { error, json } from '@sveltejs/kit';
import { fetchDiscogsTagsForAlbum } from '$lib/discogs-tags.server';
import { getArtistTopTagsBatch } from '$lib/lastfm.server';
import { suggestMetadata } from '$lib/qwen-suggest.server';
import type { RequestHandler } from './$types';

export type LookupSuggestions = {
	tags: string[];
	tagSource: 'discogs' | 'lastfm' | 'ai' | null;
	label: string | null;
};

const EMPTY: LookupSuggestions = { tags: [], tagSource: null, label: null };

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const artist = (url.searchParams.get('artist') ?? '').trim();
	const title = (url.searchParams.get('title') ?? '').trim();
	if (!artist || !title) return json(EMPTY);

	// Discogs is fast; qwen is the latency floor. We need qwen anyway for the
	// label suggestion, so running it in parallel with Discogs costs nothing
	// over the slowest leg. Last.fm fallback only kicks in if Discogs is dry.
	const [discogsTags, qwenSug] = await Promise.all([
		fetchDiscogsTagsForAlbum(artist, title),
		suggestMetadata(artist, title)
	]);

	let tags: string[] = [];
	let tagSource: LookupSuggestions['tagSource'] = null;

	if (discogsTags.length > 0) {
		tags = discogsTags;
		tagSource = 'discogs';
	} else {
		const lfmMap = await getArtistTopTagsBatch(locals.supabase, [artist.toLowerCase()]);
		const lfmTags = lfmMap.get(artist.toLowerCase()) ?? [];
		if (lfmTags.length > 0) {
			tags = lfmTags;
			tagSource = 'lastfm';
		} else if (qwenSug.tags && qwenSug.tags.length > 0) {
			tags = qwenSug.tags;
			tagSource = 'ai';
		}
	}

	return json({
		tags: tags.slice(0, 8),
		tagSource,
		label: qwenSug.label
	} satisfies LookupSuggestions);
};
