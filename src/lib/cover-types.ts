// Shared cover-result types. Kept in their own module (not in cover-search.ts)
// so that client-side code can import them without dragging in the
// $env/static/private dependency that the server-side searcher uses.

export type CoverSource = 'itunes' | 'deezer' | 'musicbrainz' | 'lastfm' | 'spotify';

export interface CoverResult {
	url: string;
	artist: string;
	title: string;
	year?: number;
	label?: string;
	source: CoverSource;
}
