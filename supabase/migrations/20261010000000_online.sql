-- Online-Spiel gegen Menschen (Roadmap 02).
-- Der Server (Edge Function "online", Service-Rolle) ist autoritativ: Er mischt, teilt aus, prüft Aktionen
-- und bewertet. Browser lesen nur die Sicht ihres eigenen Platzes; Deck und Spielzustand sind für sie unsichtbar.

-- ---------- Online-Ratings im Profil (öffentlich wie die übrigen Ratings, nur der Server schreibt) ----------
alter table public.profiles add column online jsonb not null default '{}'::jsonb;
alter table public.profiles add constraint online_object check (jsonb_typeof(online) = 'object');
-- Die Update-Freigabe für authenticated ist spaltenweise (Migration konten) und enthält "online" nicht.

-- ---------- Warteschlange ----------
create table public.online_queue (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  format    text not null check (format in ('pf10', 'pf15', 'pf20', 'duel')),
  rating    integer not null,
  joined_at timestamptz not null default now(),
  seen_at   timestamptz not null default now()
);
create index online_queue_format on public.online_queue (format, joined_at);

-- ---------- Matches ----------
create table public.matches (
  id          uuid primary key,
  format      text not null check (format in ('pf10', 'pf15', 'pf20', 'duel')),
  players     uuid[] not null check (cardinality(players) = 2),
  names       text[] not null check (cardinality(names) = 2),
  status      text not null default 'active' check (status in ('active', 'finished')),
  record      jsonb,           -- Analyse beider Spieler, alle Karten, Decks mit Salt; erst nach dem Match
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index matches_players on public.matches using gin (players);

-- Sicht je Platz: eigene Karten, öffentliche Aktionen. Über Realtime an den Browser des Platzes.
create table public.match_seats (
  match_id  uuid not null references public.matches (id) on delete cascade,
  seat      smallint not null check (seat in (0, 1)),
  user_id   uuid not null references auth.users (id) on delete cascade,
  view      jsonb not null,
  done      boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (match_id, seat)
);
create index match_seats_open on public.match_seats (user_id) where not done;

-- Vollständiger Zustand mit Deck. Kein Zugriff für Browser.
create table public.match_secrets (
  match_id uuid primary key references public.matches (id) on delete cascade,
  state    jsonb not null,
  version  integer not null default 1
);

-- Einladungen per Link
create table public.challenges (
  code       text primary key check (code ~ '^[A-Z2-9]{8}$'),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  format     text not null check (format in ('pf10', 'pf15', 'pf20', 'duel')),
  created_at timestamptz not null default now()
);

-- Meldungen und Fair Play (nur für den Betreiber)
create table public.reports (
  id         uuid primary key default gen_random_uuid(),
  reporter   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported   uuid not null references auth.users (id) on delete cascade,
  match_id   uuid not null references public.matches (id) on delete cascade,
  reason     text not null check (reason in ('solver', 'name', 'stalling', 'other')),
  note       text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter, match_id)
);
create table public.fair_play (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  recent     jsonb not null default '{}'::jsonb,  -- Spielqualität und Bedenkzeit-Streuung der letzten Matches je Format-Typ
  flag       text,            -- automatischer Hinweis, z. B. auffällig konstante Genauigkeit
  flagged_at timestamptz,
  banned     boolean not null default false,  -- setzt der Betreiber im Dashboard
  note       text
);

-- ---------- Row Level Security ----------
alter table public.online_queue enable row level security;
alter table public.matches enable row level security;
alter table public.match_seats enable row level security;
alter table public.match_secrets enable row level security;
alter table public.challenges enable row level security;
alter table public.reports enable row level security;
alter table public.fair_play enable row level security;

create policy "Matches: eigene lesen" on public.matches
  for select using ((select auth.uid()) = any (players));
create policy "Plätze: eigenen lesen" on public.match_seats
  for select using (user_id = (select auth.uid()));
create policy "Meldungen: nur über eigene Gegner" on public.reports
  for insert with check (
    reporter = (select auth.uid()) and reported <> reporter
    and exists (select 1 from public.matches m where m.id = match_id and reporter = any (m.players) and reported = any (m.players))
  );
-- Warteschlange, Geheimnisse, Einladungen und Fair Play: keine Richtlinie, also kein Zugriff außer für den Server.

revoke all on public.online_queue, public.match_secrets, public.challenges, public.fair_play from anon, authenticated;
revoke all on public.matches, public.match_seats, public.reports from anon;
revoke insert, update, delete on public.matches, public.match_seats from authenticated;
revoke select, update, delete on public.reports from authenticated;

-- Realtime: Änderungen an der eigenen Sicht kommen sofort im Browser an (RLS gilt auch hier).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match_seats;
  end if;
end $$;

-- ---------- Lebenszeichen (Wiederverbindung innerhalb von 60 s) ----------
create function public.match_ping(p_match uuid) returns void
language sql security definer set search_path = '' as $$
  update public.match_seats set last_seen = now() where match_id = p_match and user_id = auth.uid() and not done;
$$;
revoke execute on function public.match_ping(uuid) from public, anon;
grant execute on function public.match_ping(uuid) to authenticated;

-- ---------- Nur für den Server (Service-Rolle) ----------

-- Sucht einen Gegner im selben Format; das Rating-Fenster wächst mit der Wartezeit. Entfernt beide aus der Schlange.
create function public.online_pair(p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me public.online_queue; partner uuid;
begin
  select * into me from public.online_queue where user_id = p_user for update;
  if not found then return null; end if;
  select q.user_id into partner from public.online_queue q
   where q.user_id <> p_user and q.format = me.format and q.seen_at > now() - interval '20 seconds'
     and abs(q.rating - me.rating) <= 150 + 10 * extract(epoch from now() - least(q.joined_at, me.joined_at))
     and not exists (select 1 from public.match_seats s where s.user_id = q.user_id and not s.done)
   order by q.joined_at
   limit 1
   for update skip locked;
  if partner is null then return null; end if;
  delete from public.online_queue where user_id in (p_user, partner);
  return partner;
end $$;

-- Legt ein Match mit Zustand und beiden Sichten in einem Schritt an.
create function public.online_create(p_match uuid, p_format text, p_players uuid[], p_names text[], p_state jsonb, p_views jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.matches (id, format, players, names) values (p_match, p_format, p_players, p_names);
  insert into public.match_secrets (match_id, state) values (p_match, p_state);
  insert into public.match_seats (match_id, seat, user_id, view) values
    (p_match, 0, p_players[1], p_views -> 0),
    (p_match, 1, p_players[2], p_views -> 1);
end $$;

-- Speichert einen neuen Zustand nur, wenn seit dem Lesen niemand anderes geschrieben hat (Version).
-- p_finish (optional) beim Matchende: { record, online: [{id, kind, value}], fair: [{id, kind, recent, flag}] }.
create function public.online_save(p_match uuid, p_version integer, p_state jsonb, p_views jsonb, p_finish jsonb default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare x jsonb;
begin
  update public.match_secrets set state = p_state, version = version + 1 where match_id = p_match and version = p_version;
  if not found then return false; end if;
  update public.match_seats set view = p_views -> seat::int, done = done or p_finish is not null where match_id = p_match;
  if p_finish is not null then
    update public.matches set status = 'finished', record = p_finish -> 'record', finished_at = now() where id = p_match;
    for x in select * from jsonb_array_elements(coalesce(p_finish -> 'online', '[]'::jsonb)) loop
      update public.profiles set online = jsonb_set(online, array[x ->> 'kind'], x -> 'value')
       where id = (x ->> 'id')::uuid;
    end loop;
    for x in select * from jsonb_array_elements(coalesce(p_finish -> 'fair', '[]'::jsonb)) loop
      insert into public.fair_play (user_id, recent, flag, flagged_at)
      values ((x ->> 'id')::uuid, jsonb_build_object(x ->> 'kind', x -> 'recent'), x ->> 'flag', case when x ->> 'flag' is not null then now() end)
      on conflict (user_id) do update set
        recent = public.fair_play.recent || excluded.recent,
        flag = coalesce(excluded.flag, public.fair_play.flag),
        flagged_at = coalesce(excluded.flagged_at, public.fair_play.flagged_at);
    end loop;
  end if;
  return true;
end $$;

revoke execute on function public.online_pair(uuid), public.online_create(uuid, text, uuid[], text[], jsonb, jsonb),
  public.online_save(uuid, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.online_pair(uuid), public.online_create(uuid, text, uuid[], text[], jsonb, jsonb),
  public.online_save(uuid, integer, jsonb, jsonb, jsonb) to service_role;

-- ---------- Konto löschen: Matches anderer Spieler bleiben, der Name wird entfernt ----------
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'nicht angemeldet'; end if;
  -- Namen in Match-Liste, veröffentlichter Analyse und Sicht des Gegners ersetzen
  update public.matches m set names[array_position(m.players, uid)] = 'Gelöschtes Konto',
    record = case when m.record is null then null
      else jsonb_set(m.record, array['players', (array_position(m.players, uid) - 1)::text, 'name'], '"Gelöschtes Konto"') end
   where uid = any (m.players);
  update public.match_seats s set view = jsonb_set(s.view, '{opp,name}', '"Gelöschtes Konto"')
   where s.user_id <> uid and s.match_id in (select id from public.matches where uid = any (players));
  delete from public.match_secrets where match_id in (select id from public.matches where uid = any (players) and status = 'finished');
  delete from auth.users where id = uid;
end $$;
