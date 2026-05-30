-- spins: mic-identified physical playback events. The classifier joins these to
-- Last.fm scrobbles at query time — scrobble + matching spin = physical (vinyl/
-- CD/cassette), scrobble alone = streamed.
--
-- Free-text artist/track/album so spins of things the user doesn't own still log.
-- Join back to public.albums at query time via (artist, title) match if needed.

create table if not exists public.spins (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  artist          text not null,
  track           text not null,
  album           text,
  identified_at   timestamptz not null default now(),
  confidence      numeric
);

alter table public.spins enable row level security;

create policy "Users can view their own spins"
  on public.spins for select using (auth.uid() = user_id);

create policy "Users can insert their own spins"
  on public.spins for insert with check (auth.uid() = user_id);

create policy "Users can delete their own spins"
  on public.spins for delete using (auth.uid() = user_id);

create index if not exists spins_user_time_idx
  on public.spins (user_id, identified_at desc);

create index if not exists spins_user_track_time_idx
  on public.spins (user_id, artist, track, identified_at desc);
