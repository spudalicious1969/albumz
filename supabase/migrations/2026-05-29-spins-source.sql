-- Classify each spin at identify time: 'spun' (physical) vs 'streamed'.
-- Determined by cross-referencing the user's Last.fm scrobbles at the moment
-- Shazam identifies the audio. If Last.fm already reports the same track as
-- now-playing (or scrobbled in the last few minutes), it's a stream; otherwise
-- it's physical playback.
--
-- Defaulting existing rows to 'spun' is intentional — pre-classifier rows came
-- from the MVP loop where streaming wasn't yet recognized; treating them as
-- physical preserves the original "every spin was a vinyl ritual" assumption.

alter table public.spins
  add column if not exists source text not null default 'spun'
  check (source in ('spun', 'streamed'));

create index if not exists spins_user_source_time_idx
  on public.spins (user_id, source, identified_at desc);
