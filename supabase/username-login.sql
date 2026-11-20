-- BLOODSOUP HELL: log in with a username. Paste into Supabase SQL Editor > New query > Run. Safe to run more than once.
--
-- Supabase signs people in by email, so the login screen asks the database "which email belongs to this username?"
-- and then signs in with that email and the password. Only the email for the one username asked about is returned,
-- and the password is still required.

create or replace function public.login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;

revoke all on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;
