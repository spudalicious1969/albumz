-- Albumz schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE throughout

-- pgcrypto powers email_hash (Gravatar lookup); enabled by default on Supabase but safe to re-declare
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id               uuid primary key references auth.users on delete cascade,
  username         text unique not null,
  display_name     text,
  last_fm_username text,
  discogs_username text,
  featured_album_id uuid,  -- FK added after albums table exists (see below)
  theme            text not null default 'auto' check (theme in ('auto', 'light', 'dark')),
  avatar_url       text,   -- uploaded avatar (Supabase Storage URL); null = fall back to Gravatar/initial
  email_hash       text,   -- sha256(lower(trim(email))); public-by-Gravatar-design, lets anyone fetch the user's gravatar
  onboarded        boolean not null default false,  -- false until user completes /welcome username-choice flow
  created_at       timestamptz not null default now()
);

-- Columns added after initial schema — safe to re-run
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists email_hash text;
alter table public.profiles add column if not exists onboarded boolean not null default false;
-- Existing users already have usernames; mark them as having completed onboarding
update public.profiles set onboarded = true where onboarded = false;

alter table public.profiles enable row level security;

create policy "Users can view any profile"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row when a user signs up.
-- search_path includes `extensions` so we can find pgcrypto's digest() — modern
-- Supabase installs pgcrypto into the extensions schema, not public.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, username, email_hash, onboarded)
  values (
    new.id,
    -- derive a default username from the email local part; user chooses a real one at /welcome
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g')),
    encode(digest(lower(trim(new.email)), 'sha256'), 'hex'),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill email_hash for any profiles that predate the column
update public.profiles p
   set email_hash = encode(digest(lower(trim(u.email)), 'sha256'), 'hex')
  from auth.users u
 where p.id = u.id
   and p.email_hash is null
   and u.email is not null;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- albums
-- ─────────────────────────────────────────────
create table if not exists public.albums (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  artist       text not null,
  title        text not null,
  year         int,
  format       text,    -- 'LP', 'CD', '7"', '10"', '12"', etc.
  label        text,
  rating       int check (rating >= 1 and rating <= 5),
  notes        text,
  tags         text[] not null default '{}',
  ownership    text not null default 'OWN' check (ownership in ('OWN', 'WANT')),
  hidden       boolean not null default false,
  cover_url    text,
  accent_color text,    -- precomputed dominant color, oklch string e.g. 'oklch(65% 0.18 22)'
  discogs_id   text,
  tracklist    jsonb,   -- pinned snapshot {tracks, source} picked via the lookup-panel chooser; null = use live pick-longest
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.albums enable row level security;

create policy "Users can view their own albums"
  on public.albums for select using (auth.uid() = user_id);

create policy "Public can view non-hidden owned albums"
  on public.albums for select using (hidden = false and ownership = 'OWN');

create policy "Users can insert their own albums"
  on public.albums for insert with check (auth.uid() = user_id);

create policy "Users can update their own albums"
  on public.albums for update using (auth.uid() = user_id);

create policy "Users can delete their own albums"
  on public.albums for delete using (auth.uid() = user_id);

-- Keep updated_at current automatically
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists albums_set_updated_at on public.albums;
create trigger albums_set_updated_at
  before update on public.albums
  for each row execute procedure public.set_updated_at();

-- Now we can add the FK from profiles.featured_album_id → albums
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'profiles_featured_album_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_featured_album_id_fkey
      foreign key (featured_album_id) references public.albums (id)
      on delete set null;
  end if;
end;
$$;

-- ─────────────────────────────────────────────
-- activity (personal history log, not social)
-- ─────────────────────────────────────────────
create table if not exists public.activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  type        text not null,    -- 'add', 'edit', 'delete', 'import'
  description text not null,
  created_at  timestamptz not null default now()
);

alter table public.activity enable row level security;

create policy "Users can view their own activity"
  on public.activity for select using (auth.uid() = user_id);

create policy "Users can insert their own activity"
  on public.activity for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- indexes
-- ─────────────────────────────────────────────
create index if not exists albums_user_id_idx      on public.albums (user_id);
create index if not exists albums_ownership_idx    on public.albums (user_id, ownership);
create index if not exists albums_created_at_idx   on public.albums (user_id, created_at desc);
create index if not exists activity_user_id_idx    on public.activity (user_id, created_at desc);
create index if not exists profiles_username_idx   on public.profiles (username);

-- ─────────────────────────────────────────────
-- avatars storage bucket (public read, RLS-controlled write per-user)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
