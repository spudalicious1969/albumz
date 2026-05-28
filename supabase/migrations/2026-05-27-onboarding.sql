-- Adds onboarded flag to profiles for the username-choice welcome flow.
-- New users land on /welcome to pick their username; existing users skip it.

alter table public.profiles add column if not exists onboarded boolean not null default false;

-- All users who existed before this migration already have usernames — mark them done
update public.profiles set onboarded = true where onboarded = false;

-- Rebuild trigger to be explicit about onboarded AND include `extensions` in
-- search_path so digest() (pgcrypto, installed in extensions schema on modern
-- Supabase projects) is findable from inside the security-definer function.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, username, email_hash, onboarded)
  values (
    new.id,
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g')),
    encode(digest(lower(trim(new.email)), 'sha256'), 'hex'),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
