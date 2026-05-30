-- Weekly digests. One row per (user_id, week_ending) — re-running generation
-- on the same week overwrites the draft via upsert.
--
-- Status gates the publish lifecycle:
--   draft     — generated, owner-only visibility
--   published — owner has approved; readable by anyone via permalink
--   discarded — owner rejected this generation
--
-- `inputs` stores the rendered input payload as JSON so we can re-prompt
-- alternate templates against the same week without re-querying source data.

create table if not exists public.digests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  week_ending     date not null,
  body            text not null,
  model_used      text not null default 'qwen3.5:latest',
  inputs          jsonb,
  status          text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  unique (user_id, week_ending)
);

alter table public.digests enable row level security;

create policy "Owners read own digests"
  on public.digests for select using (auth.uid() = user_id);

create policy "Published digests are public"
  on public.digests for select using (status = 'published');

create policy "Owners insert own digests"
  on public.digests for insert with check (auth.uid() = user_id);

create policy "Owners update own digests"
  on public.digests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Owners delete own digests"
  on public.digests for delete using (auth.uid() = user_id);

create index if not exists digests_user_week_idx
  on public.digests (user_id, week_ending desc);
