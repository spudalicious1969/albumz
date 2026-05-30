-- Cache for Last.fm artist.getTopTags lookups. Populated lazily by the
-- weekly-digest similarity layer; subsequent reads avoid the round trip.
--
-- Tags are stored lowercased, capped at 5 per artist (highest-weighted first)
-- to keep the row compact. `fetched_at` lets a later TTL job re-pull stale
-- entries — for now nothing prunes, since artist tags are largely stable.
--
-- No user-facing access: only the server (service-role / digest endpoint)
-- ever reads or writes this table.

create table if not exists public.artist_tags (
  artist          text primary key,
  tags            text[] not null default '{}',
  fetched_at      timestamptz not null default now()
);

alter table public.artist_tags enable row level security;

-- The digest endpoint runs under the signed-in user's session client.
-- The cache holds no user data — just a global lookup of public Last.fm
-- top-tags — so any signed-in user can read and upsert into it.
create policy "Authenticated can read artist_tags"
  on public.artist_tags for select to authenticated using (true);

create policy "Authenticated can upsert artist_tags"
  on public.artist_tags for insert to authenticated with check (true);

create policy "Authenticated can refresh artist_tags"
  on public.artist_tags for update to authenticated using (true) with check (true);
