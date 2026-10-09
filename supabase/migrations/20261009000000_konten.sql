-- Konten und Synchronisierung (Roadmap 01, Lastenheft D-04).
-- Jede Tabelle hat Row Level Security: Nutzer lesen und schreiben nur eigene Zeilen;
-- öffentliche Profile sind für alle lesbar.

-- ---------- Profile ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_public    boolean not null default false,
  avatar       text,
  rating       integer,
  ratings      jsonb not null default '{}'::jsonb,
  decisions    integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint display_name_format check (display_name is null or display_name ~ '^[A-Za-z0-9ÄÖÜäöüß_.-]{3,24}$'),
  constraint public_needs_name check (not is_public or display_name is not null),
  constraint avatar_choice check (avatar is null or avatar in ('spade', 'heart', 'diamond', 'club', 'chip', 'crown')),
  constraint ratings_object check (jsonb_typeof(ratings) = 'object')
);
create unique index profiles_display_name_key on public.profiles (lower(display_name));

-- ---------- Speicherstand (Schema v2 als Ganzes) ----------
create table public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint data_object check (jsonb_typeof(data) = 'object'),
  constraint data_size check (pg_column_size(data) < 524288)
);

-- ---------- Einzelne Entscheidungen (Grundlage für Statistik und Ranglisten) ----------
create table public.decisions (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode       text not null check (mode in ('arena', 'duel', 'flop', 'river', 'quiz', 'review')),
  spot       text not null check (length(spot) <= 64),
  grade      text not null check (grade in ('best', 'sharp', 'eq', 'inacc', 'mist', 'blun')),
  ev_loss    real not null check (ev_loss >= 0 and ev_loss <= 1000),
  made_at    timestamptz not null,
  created_at timestamptz not null default now()
);
create index decisions_user_made on public.decisions (user_id, made_at);

-- ---------- Zeitstempel ----------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger progress_touch before update on public.progress for each row execute function public.touch_updated_at();

-- ---------- Profil beim Anlegen des Kontos ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.decisions enable row level security;

create policy "Profile: eigenes oder öffentliches lesen" on public.profiles
  for select using (is_public or id = (select auth.uid()));
create policy "Profile: eigenes ändern" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Fortschritt: eigenen lesen" on public.progress
  for select using (user_id = (select auth.uid()));
create policy "Fortschritt: eigenen anlegen" on public.progress
  for insert with check (user_id = (select auth.uid()));
create policy "Fortschritt: eigenen ändern" on public.progress
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Entscheidungen: eigene lesen" on public.decisions
  for select using (user_id = (select auth.uid()));
create policy "Entscheidungen: eigene anlegen" on public.decisions
  for insert with check (user_id = (select auth.uid()));

-- Anonyme Besucher dürfen nur öffentliche Profile lesen.
revoke all on public.progress, public.decisions from anon;
revoke insert, update, delete on public.profiles from anon;
-- Profile entstehen nur über den Trigger; id und Zeitstempel ändert niemand von außen.
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, is_public, avatar, rating, ratings, decisions) on public.profiles to authenticated;
revoke update, delete on public.decisions from authenticated;
revoke delete on public.progress from authenticated;

-- ---------- Konto löschen (ohne Support) ----------
-- Löscht den Auth-Nutzer; alle Zeilen in profiles, progress und decisions folgen per Cascade.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
