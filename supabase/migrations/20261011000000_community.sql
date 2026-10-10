-- Ranglisten, Freunde, Gruppen und Wochen-Challenge (Roadmap 03, Lastenheft D-05).
-- Alle neuen Tabellen haben Row Level Security ohne Richtlinien: Browser greifen nur über die
-- Funktionen unten zu (security definer), die jeweils selbst prüfen, wer was sehen oder ändern darf.
-- Die Regeln (Mindestzahl, Aktivität, Sortierung) stehen auch in src/core/community.js.

-- ---------- Profile: Entscheidungen je Modus, letzte Aktivität, Wochen-Challenge ----------
alter table public.profiles add column counts jsonb not null default '{}'::jsonb;
alter table public.profiles add column active_at timestamptz;
alter table public.profiles add column weekly jsonb not null default '{}'::jsonb; -- { played, best }, schreibt nur der Server
alter table public.profiles add constraint counts_object check (jsonb_typeof(counts) = 'object');
alter table public.profiles add constraint weekly_object check (jsonb_typeof(weekly) = 'object');
grant update (counts) on public.profiles to authenticated;
update public.profiles set active_at = updated_at where rating is not null or online <> '{}'::jsonb;

-- Zahl aus JSON, ohne bei fremden Werten zu scheitern (Profile schreibt der Browser)
create function public.to_int(t text) returns integer language sql immutable as $$
  select case when t ~ '^-?[0-9]{1,6}$' then t::integer end
$$;

/** Rating je Rangliste aus einem Profil. */
create function public.board_values(p public.profiles) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'overall', p.rating,
    'arena', public.to_int(p.ratings ->> 'arena'), 'duel', public.to_int(p.ratings ->> 'duel'),
    'flop', public.to_int(p.ratings ->> 'flop'), 'river', public.to_int(p.ratings ->> 'river'),
    'online_pf', public.to_int(p.online -> 'pf' ->> 'rating'), 'online_duel', public.to_int(p.online -> 'duel' ->> 'rating')))
$$;
/** Menge, die für die Mindestzahl zählt: Entscheidungen bzw. gewertete Online-Matches. */
create function public.board_count(p public.profiles, b text) returns integer language sql stable as $$
  select coalesce(case b
    when 'overall' then p.decisions
    when 'online_pf' then public.to_int(p.online -> 'pf' ->> 'games')
    when 'online_duel' then public.to_int(p.online -> 'duel' ->> 'games')
    else public.to_int(p.counts ->> b) end, 0)
$$;

-- ---------- Verlauf für „diese Woche“ und „dieser Monat“ ----------
-- Je Tag (deutsche Zeit) der Stand zu Beginn (open) und am Ende (close). Ein Wert, der zum ersten Mal
-- erscheint (z. B. Fortschritt vom Gerät beim ersten Verbinden), zählt nicht als Zuwachs.
create table public.rating_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  open    jsonb not null,
  close   jsonb not null,
  primary key (user_id, day)
);

create function public.profiles_activity() returns trigger language plpgsql as $$
begin
  if new.rating is distinct from old.rating or new.ratings is distinct from old.ratings or new.counts is distinct from old.counts
     or new.decisions is distinct from old.decisions or new.online is distinct from old.online then
    new.active_at := now();
  end if;
  return new;
end $$;
create trigger profiles_activity before update on public.profiles for each row execute function public.profiles_activity();

create function public.profiles_history() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old jsonb := public.board_values(old); v_new jsonb := public.board_values(new);
begin
  if v_new is distinct from v_old then
    insert into public.rating_history (user_id, day, open, close)
    values (new.id, (now() at time zone 'Europe/Berlin')::date, v_new || v_old, v_new)
    on conflict (user_id, day) do update set close = excluded.close, open = excluded.open || public.rating_history.open;
  end if;
  return null;
end $$;
create trigger profiles_history after update on public.profiles for each row execute function public.profiles_history();

-- Ausgangsstand für bestehende Profile (gestern), damit der erste Zuwachs stimmt
insert into public.rating_history (user_id, day, open, close)
select p.id, (now() at time zone 'Europe/Berlin')::date - 1, public.board_values(p), public.board_values(p)
  from public.profiles p where public.board_values(p) <> '{}'::jsonb;

-- ---------- Hilfen ----------
-- Einladungscode aus 8 Zeichen ohne Verwechslungsgefahr (kein 0/O, 1/I). Nur die zufälligen Bytes der UUID.
create function public.new_code() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(x.b, i) % 32, 1), '' order by i)
    from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') as b) x, unnest(array[0, 1, 2, 3, 4, 5, 7, 9]) i
$$;
create function public.my_name() returns text language sql stable security definer set search_path = '' as $$
  select display_name from public.profiles where id = auth.uid()
$$;
create function public.need_name() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  if public.my_name() is null then raise exception 'Lege zuerst unter „Konto“ einen Anzeigenamen fest.'; end if;
end $$;

-- ---------- Freunde ----------
create table public.friendships (
  user_a       uuid not null references auth.users (id) on delete cascade,
  user_b       uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b on public.friendships (user_b);
-- persönlicher Freundes-Link; wer ihn öffnet, ist sofort befreundet
create table public.friend_links (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create function public.are_friends(x uuid, y uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f where f.status = 'accepted' and f.user_a = least(x, y) and f.user_b = greatest(x, y))
$$;

create function public.friend_set(p_other uuid, p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if p_other = uid then raise exception 'Das bist du selbst.'; end if;
  if (select count(*) from public.friendships where uid in (user_a, user_b)) >= 200 then raise exception 'Du hast schon 200 Freunde oder Anfragen.'; end if;
  insert into public.friendships (user_a, user_b, requested_by, status)
  values (least(uid, p_other), greatest(uid, p_other), uid, case when p_accept then 'accepted' else 'pending' end)
  on conflict (user_a, user_b) do update set
    -- hat der andere schon angefragt, wird aus der zweiten Anfrage eine Freundschaft
    status = case when p_accept or public.friendships.requested_by <> uid then 'accepted' else public.friendships.status end;
end $$;
revoke execute on function public.friend_set(uuid, boolean) from public, anon, authenticated;

create function public.friend_link(p_renew boolean default false) returns text language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  perform public.need_name();
  select code into c from public.friend_links where user_id = auth.uid();
  if c is null or p_renew then
    c := public.new_code();
    insert into public.friend_links (user_id, code) values (auth.uid(), c)
    on conflict (user_id) do update set code = excluded.code, created_at = now();
  end if;
  return c;
end $$;

create function public.friend_link_peek(p_code text) returns table (name text, avatar text, own boolean)
language sql stable security definer set search_path = '' as $$
  select p.display_name, p.avatar, l.user_id = auth.uid()
    from public.friend_links l join public.profiles p on p.id = l.user_id
   where l.code = upper(p_code) and p.display_name is not null
$$;

create function public.friend_link_accept(p_code text) returns text language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  perform public.need_name();
  select user_id into other from public.friend_links where code = upper(p_code);
  if other is null then raise exception 'Dieser Freundes-Link gilt nicht mehr.'; end if;
  perform public.friend_set(other, true);
  return (select display_name from public.profiles where id = other);
end $$;

-- Anfrage an ein öffentliches Profil (z. B. aus der Rangliste)
create function public.friend_request(p_name text) returns void language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  perform public.need_name();
  select id into other from public.profiles where lower(display_name) = lower(p_name) and is_public;
  if other is null then raise exception 'Unter diesem Namen gibt es kein öffentliches Profil.'; end if;
  perform public.friend_set(other, false);
end $$;

create function public.friend_respond(p_other uuid, p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if p_accept then
    update public.friendships set status = 'accepted'
     where user_a = least(uid, p_other) and user_b = greatest(uid, p_other) and requested_by <> uid;
  else
    delete from public.friendships where user_a = least(uid, p_other) and user_b = greatest(uid, p_other);
  end if;
end $$;
create function public.friend_remove(p_other uuid) returns void language sql security definer set search_path = '' as $$
  delete from public.friendships where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other);
$$;

create function public.friends_list() returns table (id uuid, name text, avatar text, is_public boolean, status text, incoming boolean, rating integer, online jsonb, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(p.display_name, 'Gelöschtes Konto'), p.avatar, p.is_public, f.status, f.requested_by <> auth.uid(),
         case when f.status = 'accepted' then p.rating end, case when f.status = 'accepted' then p.online else '{}'::jsonb end, f.created_at
    from public.friendships f
    join public.profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
   where auth.uid() in (f.user_a, f.user_b)
   order by f.status desc, lower(p.display_name)
$$;

-- „Du gegen Freund“: EV-Verlust je Situation aus den einzelnen Entscheidungen (ab der Anmeldung)
create function public.friend_compare(p_other uuid) returns table (spot text, my_n integer, my_loss real, their_n integer, their_loss real)
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
   where d.user_id in (uid, p_other) and d.mode in ('arena', 'duel', 'flop', 'river')
   group by d.spot;
end $$;

-- ---------- Gruppen ----------
create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 3 and 40 and name !~ '[<>]'),
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('lead', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);
create table public.group_invites (
  group_id   uuid primary key references public.groups (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  expires_at timestamptz not null
);
-- Spot-Sets der Gruppenleitung: Auswahl von Situationen zum gezielten Üben
create table public.group_sets (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null check (length(name) between 3 and 60 and name !~ '[<>]'),
  note       text check (length(note) <= 500),
  spots      text[] not null check (cardinality(spots) between 1 and 12),
  created_at timestamptz not null default now()
);
create table public.group_set_progress (
  set_id     uuid not null references public.group_sets (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  n          integer not null default 0,
  wrong      integer not null default 0,
  loss       real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (set_id, user_id)
);

create function public.is_member(g uuid, u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = u)
$$;
create function public.is_lead(g uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid() and role = 'lead')
$$;
create function public.need_lead(g uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_lead(g) then raise exception 'Das darf nur die Gruppenleitung.'; end if;
end $$;

-- Verlässt die Leitung die Gruppe (auch durch Löschen des Kontos), übernimmt das am längsten dabei Mitglied;
-- ist niemand mehr da, verschwindet die Gruppe.
create function public.group_members_left() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
  elsif old.role = 'lead' and not exists (select 1 from public.group_members where group_id = old.group_id and role = 'lead') then
    update public.group_members set role = 'lead'
     where (group_id, user_id) = (select group_id, user_id from public.group_members where group_id = old.group_id order by joined_at limit 1);
  end if;
  return null;
end $$;
create trigger group_members_left after delete on public.group_members for each row execute function public.group_members_left();

create function public.group_create(p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  perform public.need_name();
  if (select count(*) from public.group_members where user_id = auth.uid()) >= 20 then raise exception 'Du bist schon in 20 Gruppen.'; end if;
  insert into public.groups (name) values (btrim(p_name)) returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, auth.uid(), 'lead');
  return g;
end $$;

create function public.my_groups() returns table (id uuid, name text, role text, members integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, m.role, (select count(*)::integer from public.group_members x where x.group_id = g.id), g.created_at
    from public.group_members m join public.groups g on g.id = m.group_id
   where m.user_id = auth.uid()
   order by lower(g.name)
$$;

-- Gruppe mit Mitgliedern, Spot-Sets und Übungsstand; nur für Mitglieder
create function public.group_info(p_group uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_group, auth.uid()) then raise exception 'Diese Gruppe gibt es nicht, oder du bist kein Mitglied.'; end if;
  return (select jsonb_build_object(
    'id', g.id, 'name', g.name, 'created_at', g.created_at,
    'role', (select role from public.group_members where group_id = g.id and user_id = auth.uid()),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(p.display_name, 'Gelöschtes Konto'), 'avatar', p.avatar,
        'is_public', p.is_public, 'role', m.role, 'joined_at', m.joined_at, 'me', m.user_id = auth.uid()) order by m.role, lower(p.display_name)), '[]'::jsonb)
      from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = g.id),
    'sets', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'note', s.note, 'spots', to_jsonb(s.spots), 'created_at', s.created_at,
        'progress', (select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'n', x.n, 'wrong', x.wrong, 'loss', x.loss, 'me', x.user_id = auth.uid()) order by x.n desc), '[]'::jsonb)
          from public.group_set_progress x join public.profiles p on p.id = x.user_id
         where x.set_id = s.id and public.is_member(g.id, x.user_id))) order by s.created_at desc), '[]'::jsonb)
      from public.group_sets s where s.group_id = g.id))
    from public.groups g where g.id = p_group);
end $$;

create function public.group_invite(p_group uuid, p_renew boolean default false) returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.need_lead(p_group);
  if p_renew or not exists (select 1 from public.group_invites i where i.group_id = p_group and i.expires_at > now()) then
    insert into public.group_invites (group_id, code, expires_at) values (p_group, public.new_code(), now() + interval '7 days')
    on conflict (group_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  end if;
  return query select i.code, i.expires_at from public.group_invites i where i.group_id = p_group;
end $$;

create function public.group_peek(p_code text) returns table (id uuid, name text, members integer, lead text, member boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, (select count(*)::integer from public.group_members x where x.group_id = g.id),
         (select p.display_name from public.group_members x join public.profiles p on p.id = x.user_id where x.group_id = g.id and x.role = 'lead' limit 1),
         public.is_member(g.id, auth.uid())
    from public.group_invites i join public.groups g on g.id = i.group_id
   where i.code = upper(p_code) and i.expires_at > now()
$$;

create function public.group_join(p_code text) returns uuid language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  perform public.need_name();
  select group_id into g from public.group_invites where code = upper(p_code) and expires_at > now() for update;
  if g is null then raise exception 'Diese Einladung ist abgelaufen. Bitte die Gruppenleitung um einen neuen Link.'; end if;
  if public.is_member(g, auth.uid()) then return g; end if;
  if (select count(*) from public.group_members where group_id = g) >= 50 then raise exception 'Die Gruppe ist voll (50 Mitglieder).'; end if;
  if (select count(*) from public.group_members where user_id = auth.uid()) >= 20 then raise exception 'Du bist schon in 20 Gruppen.'; end if;
  insert into public.group_members (group_id, user_id) values (g, auth.uid());
  return g;
end $$;

create function public.group_leave(p_group uuid) returns void language sql security definer set search_path = '' as $$
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
$$;
create function public.group_kick(p_group uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.need_lead(p_group);
  if p_user = auth.uid() then raise exception 'Zum Verlassen nutze „Gruppe verlassen“.'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end $$;
create function public.group_promote(p_group uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.need_lead(p_group);
  update public.group_members set role = 'lead' where group_id = p_group and user_id = p_user;
end $$;
create function public.group_rename(p_group uuid, p_name text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.need_lead(p_group);
  update public.groups set name = btrim(p_name) where id = p_group;
end $$;
create function public.group_delete(p_group uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.need_lead(p_group);
  delete from public.groups where id = p_group;
end $$;

create function public.group_set_save(p_group uuid, p_name text, p_spots text[], p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s uuid; k text;
begin
  perform public.need_lead(p_group);
  if (select count(*) from public.group_sets where group_id = p_group) >= 30 then raise exception 'Eine Gruppe hat höchstens 30 Spot-Sets.'; end if;
  foreach k in array p_spots loop
    -- dieselbe Liste steht als SPOT_KEYS in src/core/spots.js
    if k not in ('duel:root', 'duel:vsOpen', 'duel:vs3b', 'duel:vs4b', 'duel:vsJam',
                 'flop:f_root', 'flop:f_ip', 'flop:f_vsB33', 'flop:f_vsR33', 'flop:f_vsB75', 'flop:f_vsR75', 'flop:f_vsDonk', 'flop:f_vsDR',
                 'river:r_root', 'river:r_ip', 'river:r_vs33', 'river:r_vs75', 'river:r_vs150', 'river:r_vsR33', 'river:r_vsR75', 'river:r_vsR150', 'river:r_vsLead', 'river:r_vsLR')
    then raise exception 'Unbekannte Situation: %', k; end if;
  end loop;
  insert into public.group_sets (group_id, name, spots, note) values (p_group, btrim(p_name), p_spots, nullif(btrim(p_note), '')) returning id into s;
  return s;
end $$;
create function public.group_set_delete(p_set uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.need_lead((select group_id from public.group_sets where id = p_set));
  delete from public.group_sets where id = p_set;
end $$;
-- Übungsstand eines Mitglieds (aus dem Browser, zählt für keine Rangliste)
create function public.group_set_record(p_set uuid, p_n integer, p_wrong integer, p_loss real) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member((select group_id from public.group_sets where id = p_set), auth.uid()) then raise exception 'Kein Mitglied dieser Gruppe.'; end if;
  if p_n not between 1 and 50 or p_wrong not between 0 and p_n or not (p_loss between 0 and 1000 * p_n) then raise exception 'Ungültige Werte.'; end if;
  insert into public.group_set_progress (set_id, user_id, n, wrong, loss) values (p_set, auth.uid(), p_n, p_wrong, p_loss)
  on conflict (set_id, user_id) do update set n = public.group_set_progress.n + excluded.n, wrong = public.group_set_progress.wrong + excluded.wrong,
    loss = public.group_set_progress.loss + excluded.loss, updated_at = now();
end $$;

-- ---------- Ranglisten ----------
-- p_board: overall | arena | duel | flop | river | online_pf | online_duel
-- p_period: all (Rating) | week | month (Zuwachs seit Montag bzw. Monatsanfang, deutsche Zeit)
-- p_scope: all (öffentliche Profile, mind. 200 Entscheidungen bzw. 10 Matches, in den letzten 30 Tagen aktiv)
--          | friends | group (alle Mitglieder; wer beitritt oder befreundet ist, sieht Namen und Ratings der anderen)
create function public.leaderboard(p_board text, p_period text default 'all', p_scope text default 'all', p_group uuid default null, p_limit integer default 100)
returns table (pos bigint, name text, avatar text, rating integer, n integer, gain integer, me boolean, is_public boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Berlin')::date; since date;
begin
  if p_board not in ('overall', 'arena', 'duel', 'flop', 'river', 'online_pf', 'online_duel') then raise exception 'Unbekannte Rangliste.'; end if;
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

-- ---------- Wochen-Challenge ----------
-- Die Spots erzeugt der Server (Edge Function "challenge") beim ersten Aufruf einer Woche. Sie liegen mit
-- allen EVs hier und sind für Browser unsichtbar; jeder bekommt den nächsten Spot erst nach der Antwort.
create table public.weekly (
  week       text primary key check (week ~ '^\d{4}-W\d{2}$'),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  spots      jsonb not null,
  stats      jsonb,          -- Verteilung der Antworten, nach dem Abschluss
  final      boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.weekly_entries (
  week         text not null references public.weekly (week) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  answers      jsonb not null default '[]'::jsonb,   -- [{ c, ms }]
  n            integer not null default 0,
  served_at    timestamptz not null default now(),   -- seit wann der aktuelle Spot angezeigt wird
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  loss         real,          -- durchschnittlicher EV-Verlust in BB
  ms           integer,       -- Bedenkzeit insgesamt
  good         integer,
  primary key (week, user_id)
);
create index weekly_entries_rank on public.weekly_entries (week, loss, ms) where submitted_at is not null;

-- Global zählt der Platz unter allen Teilnehmenden (wie für das Podest-Abzeichen); angezeigt werden davon nur
-- öffentliche Profile und die eigene Zeile. Unter Freunden und in Gruppen zählt der Platz in diesem Kreis.
create function public.weekly_board(p_week text, p_scope text default 'all', p_group uuid default null, p_limit integer default 100)
returns table (pos bigint, total bigint, name text, avatar text, loss real, ms integer, good integer, me boolean, is_public boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid();
begin
  if p_scope not in ('all', 'friends', 'group') then raise exception 'Unbekannte Ansicht.'; end if;
  if p_scope = 'group' and (uid is null or not public.is_member(p_group, uid)) then raise exception 'Diese Gruppe gibt es nicht, oder du bist kein Mitglied.'; end if;
  return query
  with c as (
    select w.user_id, w.loss, w.ms, w.good, w.submitted_at, p.display_name, p.avatar, p.is_public,
           case p_scope
             when 'all' then (p.is_public and p.display_name is not null) or p.id = uid
             when 'friends' then p.id = uid or public.are_friends(uid, p.id)
             else public.is_member(p_group, p.id) end as visible
      from public.weekly_entries w join public.profiles p on p.id = w.user_id
     where w.week = p_week and w.submitted_at is not null
       and not exists (select 1 from public.fair_play f where f.user_id = p.id and f.banned)
  ), r as (
    select row_number() over (order by c.loss, c.ms, c.submitted_at) as rk, count(*) over () as n, c.*
      from c where p_scope = 'all' or c.visible
  )
  select r.rk, r.n, coalesce(r.display_name, 'Du'), r.avatar, r.loss, r.ms, r.good, r.user_id = uid, r.is_public
    from r where r.visible and (r.rk <= least(greatest(p_limit, 1), 200) or r.user_id = uid)
   order by r.rk;
end $$;

-- ---------- Rechte ----------
alter table public.rating_history enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_links enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_sets enable row level security;
alter table public.group_set_progress enable row level security;
alter table public.weekly enable row level security;
alter table public.weekly_entries enable row level security;
revoke all on public.rating_history, public.friendships, public.friend_links, public.groups, public.group_members, public.group_invites,
  public.group_sets, public.group_set_progress, public.weekly, public.weekly_entries from anon, authenticated;

do $$
declare f text;
begin
  -- interne Helfer: niemand von außen
  foreach f in array array['public.to_int(text)', 'public.board_values(public.profiles)', 'public.board_count(public.profiles, text)', 'public.new_code()',
    'public.my_name()', 'public.need_name()', 'public.are_friends(uuid, uuid)', 'public.is_member(uuid, uuid)', 'public.is_lead(uuid)', 'public.need_lead(uuid)',
    'public.profiles_activity()', 'public.profiles_history()', 'public.group_members_left()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- für angemeldete Nutzer
  foreach f in array array['public.friend_link(boolean)', 'public.friend_link_peek(text)', 'public.friend_link_accept(text)', 'public.friend_request(text)',
    'public.friend_respond(uuid, boolean)', 'public.friend_remove(uuid)', 'public.friends_list()', 'public.friend_compare(uuid)',
    'public.group_create(text)', 'public.my_groups()', 'public.group_info(uuid)', 'public.group_invite(uuid, boolean)', 'public.group_peek(text)',
    'public.group_join(text)', 'public.group_leave(uuid)', 'public.group_kick(uuid, uuid)', 'public.group_promote(uuid, uuid)', 'public.group_rename(uuid, text)',
    'public.group_delete(uuid)', 'public.group_set_save(uuid, text, text[], text)', 'public.group_set_delete(uuid)', 'public.group_set_record(uuid, integer, integer, real)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Ranglisten auch ohne Konto (nur öffentliche Profile)
  foreach f in array array['public.leaderboard(text, text, text, uuid, integer)', 'public.weekly_board(text, text, uuid, integer)'] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
-- Die Trigger-Helfer laufen als Teil der Trigger und brauchen kein Ausführungsrecht der Nutzer.
grant execute on function public.to_int(text), public.board_values(public.profiles), public.board_count(public.profiles, text) to service_role;
