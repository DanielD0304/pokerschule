-- Prüft die Sicherheitsregeln: Niemand liest oder schreibt Daten anderer.
-- Ausführen mit: supabase test db   (lokale Supabase-Instanz, pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- zwei Nutzer; der Trigger legt die Profile an
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select is((select count(*)::int from public.profiles), 2, 'Trigger legt für jedes Konto ein Profil an');

insert into public.progress (user_id, data) values
  ('00000000-0000-0000-0000-00000000000a', '{"version":2}'),
  ('00000000-0000-0000-0000-00000000000b', '{"version":2}');
insert into public.decisions (id, user_id, mode, spot, grade, ev_loss, made_at) values
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'flop', 'flop:f_ip', 'best', 0, now());
update public.profiles set display_name = 'Bea', is_public = true where id = '00000000-0000-0000-0000-00000000000b';

-- ab hier als Nutzer A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.progress), 1, 'A sieht nur den eigenen Fortschritt');
select is((select count(*)::int from public.decisions), 0, 'A sieht keine Entscheidungen von B');
select is((select count(*)::int from public.profiles), 2, 'A sieht das eigene und das öffentliche Profil von B');

update public.progress set data = '{"version":2,"x":1}' where user_id = '00000000-0000-0000-0000-00000000000b';
select is((select data from public.progress where user_id = '00000000-0000-0000-0000-00000000000b'), null, 'A kann den Fortschritt von B nicht lesen');
select throws_ok(
  $$ insert into public.progress (user_id, data) values ('00000000-0000-0000-0000-00000000000b', '{}') $$,
  '42501', null, 'A kann keinen Fortschritt für B anlegen');
select throws_ok(
  $$ insert into public.decisions (id, user_id, mode, spot, grade, ev_loss, made_at) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'flop', 'x', 'best', 0, now()) $$,
  '42501', null, 'A kann keine Entscheidungen für B anlegen');
select lives_ok(
  $$ insert into public.decisions (id, mode, spot, grade, ev_loss, made_at) values (gen_random_uuid(), 'river', 'river:r_ip', 'mist', 0.5, now()) $$,
  'A kann eigene Entscheidungen anlegen');
select throws_ok($$ delete from public.decisions $$, '42501', null, 'Entscheidungen lassen sich nicht löschen');

update public.profiles set display_name = 'Gekapert' where id = '00000000-0000-0000-0000-00000000000b';
select lives_ok($$ update public.profiles set display_name = 'Anna' where id = '00000000-0000-0000-0000-00000000000a' $$, 'A ändert das eigene Profil');
select throws_ok($$ update public.profiles set id = gen_random_uuid() where id = '00000000-0000-0000-0000-00000000000a' $$, '42501', null, 'Die Profil-id ist nicht änderbar');

-- als Besucher ohne Konto
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.profiles), 1, 'Besucher sehen nur öffentliche Profile');
select throws_ok($$ select * from public.progress $$, '42501', null, 'Besucher lesen keinen Fortschritt');

reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'Bea', 'Profil von B blieb unverändert');

select * from finish();
rollback;
