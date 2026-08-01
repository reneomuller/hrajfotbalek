-- Rollback for 20260802100100_game_organizer_contacts.sql
--
-- Drops the table, and with it every organizer phone number recorded. That is
-- the correct direction for a rollback of this table: the numbers are
-- reconstructible from whoever is organizing, and leaving a table with no
-- readers would leave PII with no purpose.

drop function if exists public.set_game_organizer(uuid, text, text);
drop function if exists public.game_organizer_phone(uuid);
drop function if exists public.game_organizer_public(uuid);
drop table if exists public.game_organizer_contacts;
