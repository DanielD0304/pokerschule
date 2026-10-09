-- Prüft die Sicherheitsregeln des Online-Spiels: Niemand liest Deck oder Karten des Gegners.
-- Ausführen mit: supabase test db   (lokale Supabase-Instanz, pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

-- der Server legt ein Match an (Service-Rolle)
set local role service_role;
select lives_ok($$ select public.online_create(
  '10000000-0000-0000-0000-000000000001', 'pf15',
  array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b']::uuid[], array['Anna', 'Bea'],
  '{"deck":[1,2,3]}', '[{"cards":"A"}, {"cards":"B"}]') $$, 'Server legt ein Match an');
select is(public.online_save('10000000-0000-0000-0000-000000000001', 7, '{}', '[{}, {}]'), false, 'Speichern mit veralteter Version scheitert');
reset role;

-- als Spieler A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.matches), 1, 'A sieht das eigene Match');
select is((select count(*)::int from public.match_seats), 1, 'A sieht nur den eigenen Platz');
select is((select view ->> 'cards' from public.match_seats), 'A', 'A sieht die eigene Sicht');
select throws_ok($$ select * from public.match_secrets $$, '42501', null, 'A liest den Spielzustand mit Deck nicht');
select throws_ok($$ select * from public.online_queue $$, '42501', null, 'A liest die Warteschlange nicht');
select throws_ok($$ update public.match_seats set view = '{}' $$, '42501', null, 'A ändert die eigene Sicht nicht');
select throws_ok($$ insert into public.matches (id, format, players, names) values (gen_random_uuid(), 'pf10', array[auth.uid(), auth.uid()], array['x','y']) $$, '42501', null, 'A legt keine Matches an');
select throws_ok($$ select public.online_save('10000000-0000-0000-0000-000000000001', 1, '{}', '[{}, {}]') $$, '42501', null, 'A ruft die Server-Funktionen nicht auf');
select throws_ok($$ update public.profiles set online = '{"pf":{"rating":3000}}' where id = auth.uid() $$, '42501', null, 'A setzt das eigene Online-Rating nicht');
select lives_ok($$ select public.match_ping('10000000-0000-0000-0000-000000000001') $$, 'A sendet Lebenszeichen');
select lives_ok($$ insert into public.reports (reported, match_id, reason) values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'solver') $$, 'A meldet den Gegner');
select throws_ok($$ insert into public.reports (reported, match_id, reason) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'solver') $$, '42501', null, 'A meldet niemanden, gegen den er nicht gespielt hat');

-- als Unbeteiligter C
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.matches), 0, 'C sieht fremde Matches nicht');
select is((select count(*)::int from public.match_seats), 0, 'C sieht fremde Plätze nicht');

-- Konto löschen: der Name verschwindet aus dem Match des Gegners
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.delete_account();
reset role;
select is((select names[2] from public.matches where id = '10000000-0000-0000-0000-000000000001'), 'Gelöschtes Konto', 'Name des gelöschten Kontos ist entfernt');

select * from finish();
rollback;
