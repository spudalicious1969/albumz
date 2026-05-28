// Shared types for external-link chips. Browser-safe.
// Server-side resolver lives in external-links.server.ts.

export type ExternalLink = {
	service:
		| 'spotify'
		| 'tidal'
		| 'apple-music'
		| 'youtube-music'
		| 'lastfm'
		| 'discogs'
		| 'musicbrainz'
		| 'musicmap'
		| 'aoty';
	name: string;
	url: string;
	isDirect: boolean; // true = direct album URL, false = search page
};
