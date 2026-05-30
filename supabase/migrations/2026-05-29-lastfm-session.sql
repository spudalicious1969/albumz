-- Per-user Last.fm session key. Acquired via the Last.fm web auth flow and
-- used to call write endpoints (track.updateNowPlaying, track.scrobble) on
-- the user's behalf. Distinct from last_fm_username which is a free-form
-- handle a user can type in for read-only "now playing" queries.

alter table public.profiles
  add column if not exists lastfm_session_key text;
