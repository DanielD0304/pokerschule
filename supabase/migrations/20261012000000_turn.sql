-- Turn-Training als bewerteter Modus (Roadmap 04, B-03): Entscheidungen, Rangliste und Freundesvergleich kennen "turn".
-- create or replace behält Eigentümer und Ausführungsrechte der Funktionen.

alter table public.decisions drop constraint if exists decisions_mode_check;
alter table public.decisions add constraint decisions_mode_check
  check (mode in ('arena', 'duel', 'flop', 'turn', 'river', 'quiz', 'review'));

create or replace function public.board_values(p public.profiles) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'overall', p.rating,
    'arena', public.to_int(p.ratings ->> 'arena'), 'duel', public.to_int(p.ratings ->> 'duel'),
    'flop', public.to_int(p.ratings ->> 'flop'), 'turn', public.to_int(p.ratings ->> 'turn'), 'river', public.to_int(p.ratings ->> 'river'),
    'online_pf', public.to_int(p.online -> 'pf' ->> 'rating'), 'online_duel', public.to_int(p.online -> 'duel' ->> 'rating')))
$$;

create or replace function public.leaderboard(p_board text, p_period text default 'all', p_scope text default 'all', p_group uuid default null, p_limit integer default 100)
returns table (pos bigint, name text, avatar text, rating integer, n integer, gain integer, me boolean, is_public boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Berlin')::date; since date;
begin
  if p_board not in ('overall', 'arena', 'duel', 'flop', 'turn', 'river', 'online_pf', 'online_duel') then raise exception 'Unbekannte Rangliste.'; end if;
  if p_period not in ('all', 'week', 'month') or p_scope not in ('all', 'friends', 'group') then raise exception 'Unbekannte Ansicht.'; end if;
  if p_scope = 'group' and (uid is null or not public.is_member(p_group, uid)) then raise exception 'Diese Gruppe gibt es nicht, oder du bist kein Mitglied.'; end if;
  since := case p_period when 'week' then date_trunc('week', today)::date when 'month' then date_trunc('month', today)::date end;
  return query
  with c as (
    select p.id, p.display_name, p.avatar, p.is_public, p.active_at,
           public.to_int(public.board_values(p) ->> p_board) as v, public.board_count(p, p_board) as cnt
      from public.profiles p
     where p.display_name is not null
       and not exists (select 1 from public.fair_play f where f.user_id = p.id and f.banned)
       and case p_scope
             when 'all' then p.is_public
             when 'friends' then p.id = uid or public.are_friends(uid, p.id)
             else public.is_member(p_group, p.id) end
  ), e as (
    select c.*, case when since is null then null else c.v - coalesce(
             (select public.to_int(h.close ->> p_board) from public.rating_history h where h.user_id = c.id and h.day < since order by h.day desc limit 1),
             (select public.to_int(h.open ->> p_board) from public.rating_history h where h.user_id = c.id and h.day >= since order by h.day limit 1)) end as g
      from c
     where c.v between 100 and 3000
       and (p_scope <> 'all' or (c.cnt >= case when p_board like 'online%' then 10 else 200 end and c.active_at > now() - interval '30 days'))
       and (since is null or (c.active_at at time zone 'Europe/Berlin')::date >= since)
  ), r as (
    select row_number() over (order by case when since is null then e.v else e.g end desc, e.v desc, e.cnt desc, lower(e.display_name)) as rk, e.*
      from e where since is null or e.g is not null
  )
  select r.rk, r.display_name, r.avatar, r.v, r.cnt, r.g, r.id = uid, r.is_public
    from r where r.rk <= least(greatest(p_limit, 1), 200) or r.id = uid
   order by r.rk;
end $$;

create or replace function public.friend_compare(p_other uuid) returns table (spot text, my_n integer, my_loss real, their_n integer, their_loss real)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid();
begin
  if not public.are_friends(uid, p_other) then raise exception 'Ihr seid nicht befreundet.'; end if;
  return query
  select d.spot,
         count(*) filter (where d.user_id = uid)::integer, coalesce(sum(d.ev_loss) filter (where d.user_id = uid), 0)::real,
         count(*) filter (where d.user_id = p_other)::integer, coalesce(sum(d.ev_loss) filter (where d.user_id = p_other), 0)::real
    from public.decisions d
   where d.user_id in (uid, p_other) and d.mode in ('arena', 'duel', 'flop', 'turn', 'river')
   group by d.spot;
end $$;
