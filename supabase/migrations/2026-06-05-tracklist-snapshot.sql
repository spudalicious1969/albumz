-- Per-album pinned tracklist snapshot. Picked via the album-edit Look up
-- panel's Tracklist chooser; stored as { tracks: Track[], source: string }
-- where source is one of 'spotify' | 'deezer' | 'itunes' | 'lastfm'.
--
-- Null means "no snapshot" — the album page server load falls back to the
-- live pick-longest fetch (`fetchTracklist`). Set to null via the chooser's
-- "Use auto-pick" action to clear a previously-pinned snapshot.
--
-- We deliberately snapshot the tracks rather than just pinning the source
-- name: 99% of Brent's collection is CD, whose tracklist is frozen at
-- pressing. Upstream catalog churn (deluxe re-releases, region-locks,
-- removed albums) shouldn't move the listener's curated view.

alter table public.albums
  add column if not exists tracklist jsonb;
