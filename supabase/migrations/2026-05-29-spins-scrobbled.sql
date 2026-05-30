-- Records the moment we successfully called track.scrobble for a given spin.
-- We insert one spins row per Shazam-identified 10s chunk, so most rows for a
-- given play stay NULL — only the chunk that crossed the scrobble threshold
-- is marked. This lets us dedupe future inserts within the same play window
-- without re-scrobbling.

alter table public.spins
  add column if not exists scrobbled_at timestamptz;

create index if not exists spins_scrobbled_lookup_idx
  on public.spins (user_id, artist, track, identified_at desc)
  where scrobbled_at is not null;
