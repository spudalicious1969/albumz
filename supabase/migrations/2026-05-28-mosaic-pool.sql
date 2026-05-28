-- Random-sampled album pool feeding the logged-out landing-page mosaic.
--
-- Pure `order by random() limit N` over the whole table would let one heavy
-- collector dominate the pool, so we cap per user with a window function and
-- then re-shuffle the survivors.

create or replace function public.mosaic_album_pool(sample_size int, per_user_cap int default 30)
returns table (
  album_id uuid,
  artist text,
  title text,
  cover_url text,
  accent_color text,
  username text,
  display_name text
)
language sql
volatile
security invoker
set search_path = public
as $$
  with capped as (
    select
      a.id, a.artist, a.title, a.cover_url, a.accent_color, a.user_id,
      row_number() over (partition by a.user_id order by random()) as rn
    from public.albums a
    where a.cover_url is not null
      and a.ownership = 'OWN'
      and a.hidden = false
  )
  select
    c.id            as album_id,
    c.artist,
    c.title,
    c.cover_url,
    c.accent_color,
    p.username,
    p.display_name
  from capped c
  join public.profiles p on p.id = c.user_id
  where c.rn <= per_user_cap
  order by random()
  limit sample_size
$$;

grant execute on function public.mosaic_album_pool(int, int) to anon, authenticated;
