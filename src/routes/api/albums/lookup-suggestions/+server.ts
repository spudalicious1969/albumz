// GET /api/albums/lookup-suggestions?artist=&title=
//
// Companion to the cover-search endpoint, called in parallel from the album
// edit page's "Look up details" panel. Returns tag and label suggestions
// for human review (Accept/Edit/Skip).
//
// Tags merge all three sources — Discogs (release-level curated styles),
// Last.fm (artist-level community tags), qwen (AI characterization) — and
// dedupe case-insensitively. The previous waterfall stopped at the first
// non-empty source, which often left B-side artists with a single thin tag
// (e.g. just "New Wave" for the B-52s) when richer context was available
// from the other sources. Discogs ordering wins so curated styles surface
// first in the merged list.
//
// Label prefers Discogs (catalog-sourced, factual) and falls back to qwen when
// Discogs has no label on the match. Discogs labels are per-pressing so they
// can be a reissue imprint rather than the original — acceptable here because
// label rides through the same Accept/Edit/Skip review as everything else, so
// a noisy suggestion the owner can skip still beats the blank field that
// qwen-only left whenever qwen wasn't confident.

import { error, json } from '@sveltejs/kit';
import { fetchDiscogsMetaForAlbum } from '$lib/discogs-tags.server';
import { fetchAlbumTopTags, getArtistTopTagsBatch } from '$lib/lastfm.server';
import { suggestMetadata } from '$lib/qwen-suggest.server';
import { mergeTags } from '$lib/tag-merge';
import type { RequestHandler } from './$types';

export type LookupSuggestions = {
	tags: string[];
	label: string | null;
};

const EMPTY: LookupSuggestions = { tags: [], label: null };
const TAG_CAP = 8;

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Not signed in');

	const artist = (url.searchParams.get('artist') ?? '').trim();
	const title = (url.searchParams.get('title') ?? '').trim();
	if (!artist || !title) return json(EMPTY);

	// Run all four in parallel. qwen sets the latency floor and we need it for
	// the tag merge and the label fallback anyway. Last.fm album-level tags are
	// the richest source for record-specific genres (post-punk vs. just "rock");
	// artist-level tags fill in when album has none indexed yet.
	const [discogs, lfmAlbumTags, lfmArtistMap, qwenSug] = await Promise.all([
		fetchDiscogsMetaForAlbum(artist, title),
		fetchAlbumTopTags(artist, title),
		getArtistTopTagsBatch(locals.supabase, [artist.toLowerCase()]),
		suggestMetadata(artist, title)
	]);

	const lfmArtistTags = lfmArtistMap.get(artist.toLowerCase()) ?? [];
	const tags = mergeTags(discogs.tags, lfmAlbumTags, lfmArtistTags, qwenSug.tags ?? []).slice(
		0,
		TAG_CAP
	);

	const label = discogs.label ?? qwenSug.label;

	return json({ tags, label } satisfies LookupSuggestions);
};
