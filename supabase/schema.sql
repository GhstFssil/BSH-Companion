-- BLOODSOUP HELL companion app: database setup
-- Run this ONCE in Supabase: Dashboard > SQL Editor > New query > paste all of it > Run.
-- Safe to read first: it only creates the two tables the app uses, locks them down so each
-- player can only touch their own characters, and adds a helper that checks if a username is free.

-- =========================================================
-- Profiles: one row per account (public handle + display name)
-- =========================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint name_length     check (char_length(name) between 1 and 40)
);

-- Usernames are unique regardless of capitalization
create unique index if not exists profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- Signed-in players can see each other's username and name (needed for campaigns).
drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

-- Players can edit only their own profile.
drop policy if exists "players update own profile" on public.profiles;
create policy "players update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Profiles are created automatically when someone signs up (no insert policy for players).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, name)
  values (new.id, new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The sign-up screen uses this to say "username taken" before creating the account.
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(p_username)
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- =========================================================
-- Characters: the whole character sheet is stored as JSON in "data"
-- =========================================================
create table if not exists public.characters (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint data_size check (pg_column_size(data) < 200000)
);

create index if not exists characters_owner_idx on public.characters (owner);

alter table public.characters enable row level security;

drop policy if exists "owners read their characters" on public.characters;
create policy "owners read their characters"
  on public.characters for select to authenticated using (auth.uid() = owner);

drop policy if exists "owners create their characters" on public.characters;
create policy "owners create their characters"
  on public.characters for insert to authenticated with check (auth.uid() = owner);

drop policy if exists "owners update their characters" on public.characters;
create policy "owners update their characters"
  on public.characters for update to authenticated
  using (auth.uid() = owner) with check (auth.uid() = owner);

drop policy if exists "owners delete their characters" on public.characters;
create policy "owners delete their characters"
  on public.characters for delete to authenticated using (auth.uid() = owner);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists characters_touch on public.characters;
create trigger characters_touch
  before update on public.characters
  for each row execute function public.touch_updated_at();

-- Explicit permissions for signed-in players (row-level security above still limits which rows).
grant select, update on public.profiles   to authenticated;
grant select, insert, update, delete on public.characters to authenticated;
