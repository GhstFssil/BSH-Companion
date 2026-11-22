-- BLOODSOUP HELL: campaigns. Run this AFTER schema.sql (Supabase dashboard > SQL Editor > New query > Run).
-- Safe to run more than once.
--
-- Rules, enforced here in the database (not just in the app):
--   * Any signed-in player can see every campaign and its members, and can join any campaign.
--   * Whoever creates a campaign becomes its first QM automatically.
--   * A QM can remove members, promote/demote members, and delete the campaign.
--   * A campaign can never be left without a QM (the last QM cannot leave, be removed or be demoted).
--   * Deleting a campaign removes its memberships too.

create table if not exists public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('member', 'qm')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists campaign_members_user_idx on public.campaign_members (user_id);

-- Is the signed-in player a QM of this campaign? (security definer so policies can use it without recursion)
create or replace function public.is_campaign_qm(p_campaign uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = auth.uid() and role = 'qm'
  );
$$;

-- The creator joins their new campaign as QM automatically.
create or replace function public.add_campaign_creator()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role) values (new.id, new.created_by, 'qm');
  return new;
end;
$$;

drop trigger if exists on_campaign_created on public.campaigns;
create trigger on_campaign_created after insert on public.campaigns
  for each row execute function public.add_campaign_creator();

-- A campaign must always keep at least one QM.
create or replace function public.protect_last_qm()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'qm'
     and (tg_op = 'DELETE' or new.role <> 'qm')
     -- when the whole campaign is being deleted its row is already gone, so this is allowed
     and exists (select 1 from public.campaigns where id = old.campaign_id)
     and not exists (
       select 1 from public.campaign_members
       where campaign_id = old.campaign_id and role = 'qm' and user_id <> old.user_id
     )
  then
    raise exception 'A campaign must always have at least one QM. Make someone else QM first.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_last_qm_trg on public.campaign_members;
create trigger protect_last_qm_trg before update or delete on public.campaign_members
  for each row execute function public.protect_last_qm();

-- Security rules
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;

drop policy if exists "campaigns readable" on public.campaigns;
create policy "campaigns readable" on public.campaigns
  for select to authenticated using (true);

drop policy if exists "campaigns create" on public.campaigns;
create policy "campaigns create" on public.campaigns
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "campaigns delete by qm" on public.campaigns;
create policy "campaigns delete by qm" on public.campaigns
  for delete to authenticated using (public.is_campaign_qm(id));

drop policy if exists "members readable" on public.campaign_members;
create policy "members readable" on public.campaign_members
  for select to authenticated using (true);

-- Joining: you can only add yourself, and only as a plain member.
-- (The creator's QM row is added by the trigger above, which bypasses this rule.)
drop policy if exists "members join" on public.campaign_members;
create policy "members join" on public.campaign_members
  for insert to authenticated with check (user_id = auth.uid() and role = 'member');

-- Leaving (your own row) or being removed (by a QM).
drop policy if exists "members leave or removed" on public.campaign_members;
create policy "members leave or removed" on public.campaign_members
  for delete to authenticated using (user_id = auth.uid() or public.is_campaign_qm(campaign_id));

-- Promote / demote: QMs only.
drop policy if exists "qm changes roles" on public.campaign_members;
create policy "qm changes roles" on public.campaign_members
  for update to authenticated using (public.is_campaign_qm(campaign_id)) with check (public.is_campaign_qm(campaign_id));

-- Access
revoke all on public.campaigns, public.campaign_members from anon;
grant select, insert, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_members to authenticated;
revoke execute on function public.is_campaign_qm(uuid) from public, anon;
grant execute on function public.is_campaign_qm(uuid) to authenticated;

-- ================= Linking characters to campaigns =================
-- A character can be linked to one campaign (or none). You can only link to a campaign you are in.
-- The link is cleared automatically when you leave or are removed, or when the campaign is deleted.
alter table public.characters
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
create index if not exists characters_campaign_idx on public.characters (campaign_id);

-- NPCs: characters a QM creates for a campaign. Only create_npc() and set_npc_visible() (below) can set these two columns.
alter table public.characters
  add column if not exists is_npc boolean not null default false,
  add column if not exists npc_visible boolean not null default false;

-- A QM can show an NPC on the roster (npc_visible) while keeping its sheet private (npc_sheet_hidden).
alter table public.characters
  add column if not exists npc_sheet_hidden boolean not null default false;

create or replace function public.check_character_campaign()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.campaign_id is not null
     and (tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id)
     and not exists (select 1 from public.campaign_members where campaign_id = new.campaign_id and user_id = new.owner)
  then
    raise exception 'Join that campaign before linking a character to it.';
  end if;
  if tg_op = 'UPDATE' and new.is_npc and new.campaign_id is not null and new.campaign_id is distinct from old.campaign_id
     and coalesce(current_setting('bsh.moving_npc', true), '') <> 'on' then   -- only a QM, through add_npc_to_campaign / move_npc (below), may put an NPC in a campaign
    raise exception 'Only a QM can put an NPC in a campaign.';
  end if;
  return new;
end;
$$;

drop trigger if exists check_character_campaign_trg on public.characters;
create trigger check_character_campaign_trg before insert or update on public.characters
  for each row execute function public.check_character_campaign();

create or replace function public.unlink_characters_on_leave()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- the player's characters in this campaign are unlinked. An NPC stays an NPC of its owner, just outside any campaign.
  update public.characters set campaign_id = null, npc_visible = false, npc_sheet_hidden = false
  where campaign_id = old.campaign_id and owner = old.user_id;
  return old;
end;
$$;

drop trigger if exists unlink_characters_on_leave_trg on public.campaign_members;
create trigger unlink_characters_on_leave_trg after delete on public.campaign_members
  for each row execute function public.unlink_characters_on_leave();

-- When a campaign is deleted its NPCs are kept: they leave the campaign and stay with their owner (hidden flags reset).
-- (The function keeps its old name so the trigger below needs no change.)
create or replace function public.delete_npcs_with_campaign()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.characters set campaign_id = null, npc_visible = false, npc_sheet_hidden = false
  where campaign_id = old.id and is_npc;
  return old;
end;
$$;

drop trigger if exists delete_npcs_with_campaign_trg on public.campaigns;
create trigger delete_npcs_with_campaign_trg before delete on public.campaigns
  for each row execute function public.delete_npcs_with_campaign();

-- ================= Seeing characters in a campaign =================
-- Members can read characters linked to their campaign (read only: editing stays owner-only).
-- An NPC is visible to members only while the QM has switched it on; QMs always see every NPC.
create or replace function public.is_campaign_member(p_campaign uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.campaign_members where campaign_id = p_campaign and user_id = auth.uid());
$$;

drop policy if exists "campaign characters readable" on public.characters;
create policy "campaign characters readable" on public.characters
  for select to authenticated
  using (
    campaign_id is not null
    and public.is_campaign_member(campaign_id)
    and (not is_npc or (npc_visible and not npc_sheet_hidden) or public.is_campaign_qm(campaign_id))
  );

-- Players may write only these columns directly. is_npc / npc_visible go through the two functions below.
revoke insert, update on public.characters from authenticated;
grant insert (id, owner, data, campaign_id), update (id, owner, data, campaign_id) on public.characters to authenticated;

create or replace function public.create_npc(p_campaign uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then
    raise exception 'Only a QM can create NPCs.';
  end if;
  insert into public.characters (id, owner, data, campaign_id, is_npc, npc_visible)
  values (p_id, auth.uid(), p_data, p_campaign, true, false);
  return p_id;
end;
$$;

create or replace function public.set_npc_visible(p_character uuid, p_visible boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare c uuid;
begin
  select campaign_id into c from public.characters where id = p_character and is_npc;
  if c is null or not public.is_campaign_qm(c) then
    raise exception 'Only a QM can change NPC visibility.';
  end if;
  update public.characters set npc_visible = p_visible where id = p_character;
end;
$$;

create or replace function public.set_npc_sheet_hidden(p_character uuid, p_hidden boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare c uuid;
begin
  select campaign_id into c from public.characters where id = p_character and is_npc;
  if c is null or not public.is_campaign_qm(c) then
    raise exception 'Only a QM can hide an NPC sheet.';
  end if;
  update public.characters set npc_sheet_hidden = p_hidden where id = p_character;
end;
$$;

-- The roster entry (name only) of shown NPCs whose sheets are hidden: the table itself no longer lets players read those rows.
create or replace function public.hidden_sheet_npcs(p_campaign uuid)
returns table (id uuid, owner uuid, name text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.owner, coalesce(c.data->'info'->>'name', '')
  from public.characters c
  where c.campaign_id = p_campaign and c.is_npc and c.npc_visible and c.npc_sheet_hidden
    and public.is_campaign_member(p_campaign);
$$;

revoke execute on function public.set_npc_sheet_hidden(uuid, boolean), public.hidden_sheet_npcs(uuid) from public, anon;
grant execute on function public.set_npc_sheet_hidden(uuid, boolean), public.hidden_sheet_npcs(uuid) to authenticated;

revoke execute on function public.create_npc(uuid, uuid, jsonb), public.set_npc_visible(uuid, boolean), public.is_campaign_member(uuid) from public, anon;
grant execute on function public.create_npc(uuid, uuid, jsonb), public.set_npc_visible(uuid, boolean), public.is_campaign_member(uuid) to authenticated;

-- ================= Handing a character to another player =================
-- The owner can give a character linked to a campaign to any other member of that campaign.
-- (Unlinked characters, and NPCs, cannot be handed over.) The new owner gets it in their Characters list.
create or replace function public.give_character(p_character uuid, p_player uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  select owner, campaign_id, is_npc into c from public.characters where id = p_character;
  if not found or c.owner is distinct from auth.uid() then
    raise exception 'You can only hand over your own characters.';
  end if;
  if c.is_npc then raise exception 'An NPC cannot be handed over.'; end if;
  if c.campaign_id is null then raise exception 'Link the character to a campaign before handing it over.'; end if;
  if not exists (select 1 from public.campaign_members where campaign_id = c.campaign_id and user_id = p_player) then
    raise exception 'That player is not in the campaign.';
  end if;
  update public.characters set owner = p_player where id = p_character;
end;
$$;

create or replace function public.make_npc(p_character uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  select campaign_id, is_npc into c from public.characters where id = p_character;
  if not found or c.campaign_id is null or not public.is_campaign_qm(c.campaign_id) then
    raise exception 'Only a QM can make a character an NPC.';
  end if;
  if c.is_npc then return; end if;
  update public.characters set is_npc = true, npc_visible = false, npc_sheet_hidden = false, owner = auth.uid() where id = p_character;
end;
$$;
-- Take a character out of a campaign's running encounter (its initiative, its token, and the turn if it was theirs).
create or replace function public.drop_from_encounter(p_campaign uuid, p_character uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare enc jsonb;
begin
  delete from public.encounter_tokens where character_id = p_character;
  select encounter into enc from public.campaigns where id = p_campaign;
  if enc is null then return; end if;
  enc := enc #- array['initiatives', p_character::text];
  if enc ? 'combos' then   -- a combo with them as Leader or Finisher is over
    enc := jsonb_set(enc, '{combos}', coalesce((select jsonb_object_agg(k, v) from jsonb_each(enc->'combos') e(k, v)
      where k <> p_character::text and v->>'finisher' <> p_character::text), '{}'::jsonb));
  end if;
  if enc->>'turn' = p_character::text then
    update public.campaigns set encounter = enc where id = p_campaign;   -- so encounter_order no longer lists them
    enc := jsonb_set(enc, '{turn}', coalesce(to_jsonb((public.encounter_order(p_campaign, enc))[1]), 'null'::jsonb));
  end if;
  update public.campaigns set encounter = enc where id = p_campaign;
end;
$$;
revoke execute on function public.drop_from_encounter(uuid, uuid) from public, anon, authenticated;

-- QM: take an NPC out of its campaign. It is not deleted: it stays with its owner, on their NPCs list.
drop function if exists public.remove_npc(uuid);
create or replace function public.unlink_npc(p_character uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  select campaign_id, is_npc into c from public.characters where id = p_character;
  if not found or not c.is_npc or c.campaign_id is null or not public.is_campaign_qm(c.campaign_id) then
    raise exception 'Only a QM can take an NPC out of a campaign.';
  end if;
  perform public.drop_from_encounter(c.campaign_id, p_character);
  update public.characters set campaign_id = null, npc_visible = false, npc_sheet_hidden = false where id = p_character;
end;
$$;
revoke execute on function public.unlink_npc(uuid) from public, anon;
grant execute on function public.unlink_npc(uuid) to authenticated;

-- QM of both campaigns: move an NPC to another campaign. It keeps its owner (who must be in that campaign) and arrives hidden.
create or replace function public.move_npc(p_character uuid, p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  select campaign_id, is_npc, owner into c from public.characters where id = p_character;
  if not found or not c.is_npc or c.campaign_id is null or not public.is_campaign_qm(c.campaign_id) then
    raise exception 'Only a QM can move an NPC.';
  end if;
  if p_campaign is null or not public.is_campaign_qm(p_campaign) then
    raise exception 'You must be a QM of the campaign you move the NPC to.';
  end if;
  if p_campaign = c.campaign_id then return; end if;
  if not exists (select 1 from public.campaign_members where campaign_id = p_campaign and user_id = c.owner) then
    raise exception 'The NPC''s owner is not in that campaign.';
  end if;
  perform public.drop_from_encounter(c.campaign_id, p_character);
  perform set_config('bsh.moving_npc', 'on', true);
  update public.characters set campaign_id = p_campaign, npc_visible = false, npc_sheet_hidden = false where id = p_character;
end;
$$;
revoke execute on function public.move_npc(uuid, uuid) from public, anon;
grant execute on function public.move_npc(uuid, uuid) to authenticated;

-- The owner of an NPC that is in no campaign can put it in a campaign they are QM of. It arrives hidden.
create or replace function public.add_npc_to_campaign(p_character uuid, p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  select campaign_id, is_npc, owner into c from public.characters where id = p_character;
  if not found or not c.is_npc or c.owner is distinct from auth.uid() then
    raise exception 'You can only add your own NPCs to a campaign.';
  end if;
  if c.campaign_id is not null then raise exception 'That NPC is already in a campaign.'; end if;
  if p_campaign is null or not public.is_campaign_qm(p_campaign) then
    raise exception 'You must be a QM of that campaign.';
  end if;
  perform set_config('bsh.moving_npc', 'on', true);
  update public.characters set campaign_id = p_campaign, npc_visible = false, npc_sheet_hidden = false where id = p_character;
end;
$$;
revoke execute on function public.add_npc_to_campaign(uuid, uuid) from public, anon;
grant execute on function public.add_npc_to_campaign(uuid, uuid) to authenticated;

-- QM: give an NPC to a player of the same campaign. It stops being an NPC and becomes that player's character.
create or replace function public.give_npc(p_character uuid, p_player uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  select campaign_id, is_npc into c from public.characters where id = p_character;
  if not found or not c.is_npc or c.campaign_id is null or not public.is_campaign_qm(c.campaign_id) then
    raise exception 'Only a QM can give an NPC to a player.';
  end if;
  if not exists (select 1 from public.campaign_members where campaign_id = c.campaign_id and user_id = p_player) then
    raise exception 'That player is not in the campaign.';
  end if;
  perform public.drop_from_encounter(c.campaign_id, p_character);   -- the player rolls their own initiative
  update public.characters set is_npc = false, npc_visible = false, npc_sheet_hidden = false, owner = p_player where id = p_character;
end;
$$;
revoke execute on function public.give_npc(uuid, uuid) from public, anon;
grant execute on function public.give_npc(uuid, uuid) to authenticated;

revoke execute on function public.make_npc(uuid) from public, anon;
grant execute on function public.make_npc(uuid) to authenticated;

revoke execute on function public.give_character(uuid, uuid) from public, anon;
grant execute on function public.give_character(uuid, uuid) to authenticated;

-- ================= Giving items =================
-- A gift waits in item_gifts until the receiving character's owner picks it up (the app adds it to the
-- character and then deletes the row). Only give_item can create rows; only the owner of the character can read or delete them.
create table if not exists public.item_gifts (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  from_name    text not null default '',
  item         jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists item_gifts_character_idx on public.item_gifts (character_id);
alter table public.item_gifts enable row level security;
drop policy if exists "own gifts readable" on public.item_gifts;
create policy "own gifts readable" on public.item_gifts for select to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.owner = auth.uid()));
drop policy if exists "own gifts deletable" on public.item_gifts;
create policy "own gifts deletable" on public.item_gifts for delete to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.owner = auth.uid()));
revoke all on public.item_gifts from anon, authenticated;
grant select, delete on public.item_gifts to authenticated;

-- p_from: the giving character (yours), or null when a QM hands out an item of their own making.
create or replace function public.give_item(p_from uuid, p_to uuid, p_item jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare t record; f record; nm text; q int; who text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  nm := btrim(coalesce(p_item->>'name', ''));
  if nm = '' then raise exception 'Give the item a name first.'; end if;
  begin q := (p_item->>'qty')::int; exception when others then q := null; end;
  if q is null or q < 1 or q > 9999 then raise exception 'Choose a quantity of at least 1.'; end if;
  select campaign_id, is_npc, npc_visible into t from public.characters where id = p_to;
  if not found or t.campaign_id is null or not public.is_campaign_member(t.campaign_id) then
    raise exception 'That character is not in your campaign.';
  end if;
  if p_from is not null then
    if p_from = p_to then raise exception 'Choose a different character.'; end if;
    select owner, campaign_id, data into f from public.characters where id = p_from;
    if not found or f.owner is distinct from auth.uid() then raise exception 'You can only give items from your own characters.'; end if;
    if f.campaign_id is distinct from t.campaign_id then raise exception 'Both characters must be in the same campaign.'; end if;
    who := coalesce(nullif(btrim(f.data->'info'->>'name'), ''), 'Someone');
  elsif not public.is_campaign_qm(t.campaign_id) then
    raise exception 'Only a QM can give items from nowhere.';
  else
    who := 'The QM';
  end if;
  if t.is_npc and not public.is_campaign_qm(t.campaign_id) then
    raise exception 'Only a QM can give items to NPCs.';
  end if;
  insert into public.item_gifts (character_id, from_name, item)
  values (p_to, who, jsonb_build_object('name', left(nm, 60), 'qty', q,
          'charges', p_item->'charges', 'desc', left(coalesce(p_item->>'desc', ''), 4000),
          'wearable', coalesce(p_item->>'wearable', 'false') = 'true',
          'weapon',   coalesce(p_item->>'weapon', 'false') = 'true',
          'magic',    coalesce(p_item->>'magic', 'false') = 'true',
          'magicProps', case when jsonb_typeof(p_item->'magicProps') = 'object' and length(p_item->>'magicProps') <= 3000 then p_item->'magicProps' else '{}'::jsonb end,
          'weaponProps', case when jsonb_typeof(p_item->'weaponProps') = 'object' and length(p_item->>'weaponProps') <= 3000 then p_item->'weaponProps' else '{}'::jsonb end,
          'buffs',    case when jsonb_typeof(p_item->'buffs') = 'array' and jsonb_array_length(p_item->'buffs') <= 30 then p_item->'buffs' else '[]'::jsonb end));
end;
$$;

revoke execute on function public.give_item(uuid, uuid, jsonb) from public, anon;
grant execute on function public.give_item(uuid, uuid, jsonb) to authenticated;

-- The player who created a campaign may delete their account without being blocked: the campaign stays (created_by becomes empty).
alter table public.campaigns alter column created_by drop not null;
alter table public.campaigns drop constraint if exists campaigns_created_by_fkey;
alter table public.campaigns add constraint campaigns_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- ================= Encounters =================
-- A QM can start an encounter in their campaign. While it is active every member sees it and each player
-- rolls initiative for their own characters (the QM can roll or enter it for anyone, and for NPCs).
-- The whole state lives in one column: { id, startedAt (ms), round, turn (character id), moved (bool),
--   seq (counts turn changes), initiatives: { <character id>: { die, ib, total, tb (random tie-break), by } } }.
-- Turn order: highest initiative first; equal totals are ordered by tb, which is drawn at random when the roll is saved.
-- Until the first End/Advance/Assign Turn, `turn` simply follows the top of the order. It is null when no encounter is running.
-- Only the functions below can change it.
alter table public.campaigns add column if not exists encounter jsonb;

create or replace function public.start_encounter(p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then
    raise exception 'Only a QM can start an encounter.';
  end if;
  if exists (select 1 from public.campaigns where id = p_campaign and encounter is not null) then
    raise exception 'An encounter is already active.';
  end if;
  delete from public.encounter_events where campaign_id = p_campaign;
  update public.campaigns
     set encounter = jsonb_build_object('id', gen_random_uuid(), 'startedAt', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'round', 1, 'seq', 0, 'moved', false, 'initiatives', '{}'::jsonb)
   where id = p_campaign;
end;
$$;

create or replace function public.end_encounter(p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then
    raise exception 'Only a QM can end an encounter.';
  end if;
  update public.campaigns set encounter = null where id = p_campaign;
  update public.characters set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}', coalesce(data->'vitals', '{}'::jsonb) - 'nextCrit')
   where campaign_id = p_campaign and coalesce(data->'vitals', '{}'::jsonb) ? 'nextCrit';
  delete from public.encounter_events where campaign_id = p_campaign;
end;
$$;

-- Records one character's initiative: d20 roll + Initiative Bonus, minus 5 on a natural 1, plus 5 on a natural 20.
-- A player can set their own character's initiative once; a QM can set (or change) anyone's, including NPCs.
create or replace function public.set_initiative(p_campaign uuid, p_character uuid, p_die int, p_ib numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c record; qm boolean; enc jsonb; total numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_die is null or p_die < 1 or p_die > 20 then raise exception 'The d20 roll must be between 1 and 20.'; end if;
  if p_ib is null or p_ib < -1000 or p_ib > 1000 then raise exception 'That Initiative Bonus is not valid.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if not found or enc is null then raise exception 'There is no active encounter.'; end if;
  select owner, campaign_id, is_npc into c from public.characters where id = p_character;
  if not found or c.campaign_id is distinct from p_campaign then raise exception 'That character is not in this campaign.'; end if;
  qm := public.is_campaign_qm(p_campaign);
  if c.is_npc then
    if not qm then raise exception 'Only a QM can roll for an NPC.'; end if;
  elsif c.owner is distinct from auth.uid() and not qm then
    raise exception 'You can only roll for your own characters.';
  end if;
  if not qm and enc->'initiatives' ? p_character::text then raise exception 'Initiative is already set for that character.'; end if;
  total := p_die + p_ib + case p_die when 1 then -5 when 20 then 5 else 0 end;
  enc := jsonb_set(enc, array['initiatives', p_character::text],
           jsonb_build_object('die', p_die, 'ib', p_ib, 'total', total, 'tb', random(), 'by', case when c.owner = auth.uid() then 'player' else 'qm' end));
  -- before anyone has moved the turn, it simply sits on the top of the order
  if not coalesce((enc->>'moved')::boolean, false) then
    enc := jsonb_set(enc, '{turn}', coalesce(to_jsonb((public.encounter_order(p_campaign, enc))[1]), 'null'::jsonb));
  end if;
  update public.campaigns set encounter = enc where id = p_campaign;
end;
$$;

-- Special events in the turn order (QM only; hidden from players until shown). Hidden events live in their own table so
-- players' queries never return their names: players can only read the rows marked visible.
create table if not exists public.encounter_events (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  visible     boolean not null default false,
  total       numeric not null check (total between -1000 and 1000),
  tb          double precision not null default random(),
  one_time    boolean not null default false,
  round       int
);
create index if not exists encounter_events_campaign_idx on public.encounter_events (campaign_id);
alter table public.encounter_events enable row level security;
drop policy if exists "events readable" on public.encounter_events;
create policy "events readable" on public.encounter_events for select to authenticated
  using (public.is_campaign_qm(campaign_id) or (visible and public.is_campaign_member(campaign_id)));
revoke all on public.encounter_events from anon, authenticated;
grant select on public.encounter_events to authenticated;

create or replace function public.add_event(p_campaign uuid, p_name text, p_total numeric, p_one_time boolean, p_round int)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare enc jsonb; nm text; nid uuid;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can add an event.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if not found or enc is null then raise exception 'There is no active encounter.'; end if;
  nm := btrim(coalesce(p_name, ''));
  if nm = '' then raise exception 'Give the event a name first.'; end if;
  if char_length(nm) > 60 then raise exception 'That name is too long.'; end if;
  if p_total is null or p_total < -1000 or p_total > 1000 then raise exception 'That initiative is not valid.'; end if;
  if coalesce(p_one_time, false) then
    if p_round is null or p_round < coalesce((enc->>'round')::int, 1) or p_round > 10000 then
      raise exception 'Pick a round that has not passed yet.';
    end if;
  end if;
  insert into public.encounter_events (campaign_id, name, total, one_time, round)
  values (p_campaign, nm, p_total, coalesce(p_one_time, false), case when coalesce(p_one_time, false) then p_round end)
  returning id into nid;
  -- before anyone has moved the turn, it simply sits on the top of the order
  if not coalesce((enc->>'moved')::boolean, false) then
    update public.campaigns set encounter = jsonb_set(enc, '{turn}', coalesce(to_jsonb((public.encounter_order(p_campaign, enc))[1]), 'null'::jsonb))
     where id = p_campaign;
  end if;
  return nid;
end;
$$;

create or replace function public.set_event_visible(p_event uuid, p_visible boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  select campaign_id into cid from public.encounter_events where id = p_event;
  if auth.uid() is null or cid is null or not public.is_campaign_qm(cid) then raise exception 'Only a QM can show or hide an event.'; end if;
  update public.encounter_events set visible = coalesce(p_visible, false) where id = p_event;
end;
$$;

create or replace function public.remove_event(p_event uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare cid uuid; enc jsonb;
begin
  select campaign_id into cid from public.encounter_events where id = p_event;
  if auth.uid() is null or cid is null or not public.is_campaign_qm(cid) then raise exception 'Only a QM can remove an event.'; end if;
  delete from public.encounter_events where id = p_event;
  -- if it was somebody's turn, the turn falls back to the top of the order
  select encounter into enc from public.campaigns where id = cid for update;
  if enc is not null and (enc->>'turn') = p_event::text then
    update public.campaigns set encounter = enc || jsonb_build_object('turn', (public.encounter_order(cid, enc))[1]) where id = cid;
  end if;
end;
$$;

-- The turn order of an encounter: characters of the campaign that have rolled, highest total first, ties by tb.
create or replace function public.encounter_order(p_campaign uuid, enc jsonb)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(x.id order by x.total desc, x.tb desc, x.id), '{}')
    from (
      select c.id, (enc->'initiatives'->(c.id::text)->>'total')::numeric as total,
             coalesce((enc->'initiatives'->(c.id::text)->>'tb')::numeric, 0) as tb
        from public.characters c
       where c.campaign_id = p_campaign and (enc->'initiatives') ? (c.id::text)
      union all
      select e.id, e.total, e.tb::numeric
        from public.encounter_events e
       where e.campaign_id = p_campaign
         and (not e.one_time or e.round = coalesce((enc->>'round')::int, 1))
    ) x;
$$;

-- End a turn: the owner of the character whose turn it is, or a QM, passes it to the next in line.
-- p_from must be the character whose turn it is (so a double tap cannot skip someone).
-- Passing from the last in line back to the first starts the next round.
create or replace function public.advance_turn(p_campaign uuid, p_from uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  enc jsonb; ord uuid[]; cur uuid; idx int; nxt uuid; rnd int; own uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if not found or enc is null then raise exception 'There is no active encounter.'; end if;
  ord := public.encounter_order(p_campaign, enc);
  if coalesce(array_length(ord, 1), 0) = 0 then raise exception 'Nobody has rolled initiative yet.'; end if;
  cur := nullif(enc->>'turn', '')::uuid;
  if cur is distinct from p_from then raise exception 'The turn has already moved on.'; end if;
  select owner into own from public.characters where id = cur;   -- null for an event: only a QM moves those
  if not public.is_campaign_qm(p_campaign) and own is distinct from auth.uid() then
    raise exception 'It is not your turn.';
  end if;
  idx := array_position(ord, cur);
  rnd := coalesce((enc->>'round')::int, 1);
  if idx is null then
    nxt := ord[1];
  elsif idx >= array_length(ord, 1) then
    rnd := rnd + 1;
    ord := public.encounter_order(p_campaign, enc || jsonb_build_object('round', rnd));   -- one-time events come and go with the round
    nxt := coalesce(ord[1], p_from);
  else
    nxt := ord[idx + 1];
  end if;
  update public.campaigns
     set encounter = (enc #- array['combos', nxt::text]) || jsonb_build_object('turn', nxt, 'round', rnd, 'moved', true, 'seq', coalesce((enc->>'seq')::int, 0) + 1)
   where id = p_campaign;
end;
$$;

-- A QM makes it any rolled character's turn. The round number does not change.
create or replace function public.assign_turn(p_campaign uuid, p_character uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  enc jsonb;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can assign a turn.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if not found or enc is null then raise exception 'There is no active encounter.'; end if;
  if not (p_character = any (public.encounter_order(p_campaign, enc))) then
    raise exception 'That character has not rolled initiative yet.';
  end if;
  update public.campaigns
     set encounter = (enc #- array['combos', p_character::text]) || jsonb_build_object('turn', p_character, 'moved', true, 'seq', coalesce((enc->>'seq')::int, 0) + 1)
   where id = p_campaign;
end;
$$;

-- Spending points during an encounter: the character's owner, or a QM of the campaign, sets AP or SP remaining.
-- (Only these two numbers, only while an encounter is running.) Bleed Tokens, Wound Tokens and the Bleeding condition
-- ('bt', 'wt', 'bleeding'; whole numbers 0-1000, bleeding 0 or 1) can be set any time by the owner or a QM.
create or replace function public.set_vital(p_character uuid, p_key text, p_value numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c record; enc jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_key not in ('apRemaining', 'spRemaining', 'bt', 'wt', 'bleeding') then raise exception 'That cannot be changed this way.'; end if;
  if p_value is null or p_value < -1000 or p_value > 100000 then raise exception 'That number is not valid.'; end if;
  if p_key in ('bt', 'wt', 'bleeding') and (p_value <> trunc(p_value) or p_value < 0 or p_value > 1000 or (p_key = 'bleeding' and p_value > 1)) then
    raise exception 'That number is not valid.';
  end if;
  select owner, campaign_id into c from public.characters where id = p_character;
  if not found or c.campaign_id is null then raise exception 'That character is not in a campaign.'; end if;
  select encounter into enc from public.campaigns where id = c.campaign_id;
  if enc is null and p_key in ('apRemaining', 'spRemaining') then raise exception 'Points can only be spent during an encounter.'; end if;
  if c.owner is distinct from auth.uid() and not public.is_campaign_qm(c.campaign_id) then
    raise exception 'You can only spend points for your own characters.';
  end if;
  update public.characters
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}', coalesce(data->'vitals', '{}'::jsonb) || jsonb_build_object(p_key, p_value))
   where id = p_character;
end;
$$;

-- Attacks: during an encounter a character's owner (or a QM) deals damage to another character in the same campaign.
-- The app works out the hit and the amount; this only adds it to the target's damage taken. Players can't hit NPCs that are
-- hidden from the roster or whose sheet is private.
create or replace function public.deal_damage(p_attacker uuid, p_target uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a record; t record; enc jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then raise exception 'That number is not valid.'; end if;
  select owner, campaign_id into a from public.characters where id = p_attacker;
  select campaign_id, is_npc, npc_visible, npc_sheet_hidden into t from public.characters where id = p_target;
  if a.campaign_id is null or t.campaign_id is distinct from a.campaign_id then raise exception 'Both characters must be in the same campaign.'; end if;
  select encounter into enc from public.campaigns where id = a.campaign_id;
  if enc is null then raise exception 'Attacks can only be made during an encounter.'; end if;
  if a.owner is distinct from auth.uid() and not public.is_campaign_qm(a.campaign_id) then
    raise exception 'You can only attack with your own characters.';
  end if;
  if t.is_npc and not public.is_campaign_qm(a.campaign_id) and (not t.npc_visible or t.npc_sheet_hidden) then
    raise exception 'You cannot attack that character.';
  end if;
  update public.characters
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}',
           coalesce(data->'vitals', '{}'::jsonb) || jsonb_build_object('damage', coalesce((data->'vitals'->>'damage')::numeric, 0) + p_amount))
   where id = p_target;
end;
$$;
revoke execute on function public.deal_damage(uuid, uuid, numeric) from public, anon;
grant execute on function public.deal_damage(uuid, uuid, numeric) to authenticated;

-- A QM applies damage they rolled by hand (traps, spells, anything outside a normal attack) to any character in their campaign, in or out of an encounter.
create or replace function public.qm_deal_damage(p_campaign uuid, p_target uuid, p_amount numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t record;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can do that.'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then raise exception 'That number is not valid.'; end if;
  select campaign_id into t from public.characters where id = p_target;
  if not found or t.campaign_id is distinct from p_campaign then raise exception 'That character is not in this campaign.'; end if;
  update public.characters
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}',
           coalesce(data->'vitals', '{}'::jsonb) || jsonb_build_object('damage', coalesce((data->'vitals'->>'damage')::numeric, 0) + p_amount))
   where id = p_target;
end;
$$;
revoke execute on function public.qm_deal_damage(uuid, uuid, numeric) from public, anon;
grant execute on function public.qm_deal_damage(uuid, uuid, numeric) to authenticated;

-- Inactive characters (a QM sets this; players' and NPCs' sheets are never touched). The list lives on the campaign and only this function changes it.
alter table public.campaigns add column if not exists inactive_ids uuid[] not null default '{}';
create or replace function public.set_character_inactive(p_campaign uuid, p_character uuid, p_inactive boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can do that.'; end if;
  if not exists (select 1 from public.characters where id = p_character and campaign_id = p_campaign) then raise exception 'That character is not in this campaign.'; end if;
  update public.campaigns
     set inactive_ids = case when coalesce(p_inactive, false)
           then (select coalesce(array_agg(distinct x), '{}') from unnest(inactive_ids || p_character) x)
           else array_remove(inactive_ids, p_character) end
   where id = p_campaign;
end;
$$;
revoke execute on function public.set_character_inactive(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_character_inactive(uuid, uuid, boolean) to authenticated;

-- Campaign codex: what the party has discovered. { mobs: { key: entry }, items: { key: entry } } on the campaign.
-- Any member's app records an entry the first time it sees it (an existing key is never overwritten); only a QM removes one,
-- and a removed key is remembered under codex.removed so the apps do not record it again.
alter table public.campaigns add column if not exists codex jsonb not null default '{}';
create or replace function public.codex_record(p_campaign uuid, p_kind text, p_key text, p_entry jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  cur jsonb; sect jsonb;
begin
  if auth.uid() is null or not public.is_campaign_member(p_campaign) then raise exception 'Only campaign members can do that.'; end if;
  if p_kind is null or p_kind not in ('mobs', 'items') then raise exception 'That is not a codex section.'; end if;
  if p_key is null or length(p_key) < 1 or length(p_key) > 80 then raise exception 'That name is not valid.'; end if;
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' or length(p_entry::text) > 4000 then raise exception 'That entry is not valid.'; end if;
  select coalesce(codex, '{}'::jsonb) into cur from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'That campaign does not exist.'; end if;
  sect := coalesce(cur->p_kind, '{}'::jsonb);
  if jsonb_exists(sect, p_key) or jsonb_exists(coalesce(cur->'removed'->p_kind, '{}'::jsonb), p_key) then return; end if;
  if (select count(*) from jsonb_object_keys(sect)) >= 300 then raise exception 'The codex is full.'; end if;
  update public.campaigns set codex = jsonb_set(cur, array[p_kind], sect || jsonb_build_object(p_key, p_entry)) where id = p_campaign;
end;
$$;
create or replace function public.codex_remove(p_campaign uuid, p_kind text, p_key text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  cur jsonb;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can do that.'; end if;
  if p_kind is null or p_kind not in ('mobs', 'items') then raise exception 'That is not a codex section.'; end if;
  if p_key is null or length(p_key) < 1 or length(p_key) > 80 then raise exception 'That name is not valid.'; end if;
  select coalesce(codex, '{}'::jsonb) into cur from public.campaigns where id = p_campaign for update;
  cur := jsonb_set(cur, array[p_kind], coalesce(cur->p_kind, '{}'::jsonb) - p_key);
  cur := jsonb_set(cur, '{removed}', coalesce(cur->'removed', '{}'::jsonb) || jsonb_build_object(p_kind, coalesce(cur->'removed'->p_kind, '{}'::jsonb) || jsonb_build_object(p_key, true)));
  update public.campaigns set codex = cur where id = p_campaign;
end;
$$;
revoke execute on function public.codex_record(uuid, text, text, jsonb), public.codex_remove(uuid, text, text) from public, anon;
grant execute on function public.codex_record(uuid, text, text, jsonb), public.codex_remove(uuid, text, text) to authenticated;

-- Blocking and parrying: an attack on a character who could block (AP and an equipped item with a CR) waits on the encounter
-- until the target's owner (or a QM, who can skip the block) answers. start_attack records it; resolve_attack applies the damage (if any) and posts the
-- outcome for the attacker to read. The app works out every number; these only store and apply them.
drop function if exists public.start_attack(uuid, uuid, numeric, numeric, text);
create or replace function public.start_attack(p_attacker uuid, p_target uuid, p_total numeric, p_power numeric, p_text text, p_combo uuid default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  a record; t record; enc jsonb; aid text := gen_random_uuid()::text; cb jsonb; atk jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_total is null or p_power is null or abs(p_total) > 100000 or abs(p_power) > 100000 then raise exception 'That number is not valid.'; end if;
  select owner, campaign_id into a from public.characters where id = p_attacker;
  select campaign_id, is_npc, npc_visible, npc_sheet_hidden into t from public.characters where id = p_target;
  if a.campaign_id is null or t.campaign_id is distinct from a.campaign_id then raise exception 'Both characters must be in the same campaign.'; end if;
  select encounter into enc from public.campaigns where id = a.campaign_id for update;
  if enc is null then raise exception 'Attacks can only be made during an encounter.'; end if;
  if a.owner is distinct from auth.uid() and not public.is_campaign_qm(a.campaign_id) then raise exception 'You can only attack with your own characters.'; end if;
  if t.is_npc and not public.is_campaign_qm(a.campaign_id) and (not t.npc_visible or t.npc_sheet_hidden) then raise exception 'You cannot attack that character.'; end if;
  if enc ? 'attack' then raise exception 'Another attack is waiting for a response.'; end if;
  atk := jsonb_build_object('id', aid, 'attacker', p_attacker, 'target', p_target, 'total', p_total, 'power', p_power, 'text', left(coalesce(p_text, ''), 300));
  if p_combo is not null then   -- the Finisher starts the Combo Attack their Leader set up; the Leader's own roll comes next
    cb := enc->'combos'->(p_combo::text);
    if cb is null or cb->>'finisher' is distinct from p_attacker::text then raise exception 'That combo is not waiting for this character.'; end if;
    if p_target in (p_combo, p_attacker) then raise exception 'Pick someone else to attack.'; end if;
    atk := atk || jsonb_build_object('combo', cb || jsonb_build_object('state', 'leader'));
    enc := enc #- array['combos', p_combo::text];
  end if;
  update public.campaigns set encounter = (enc - 'lastAttack') || jsonb_build_object('attack', atk) where id = a.campaign_id;
  return aid;
end;
$$;

drop function if exists public.resolve_attack(uuid, text, numeric, text);
drop function if exists public.resolve_attack(uuid, text, numeric, text, uuid[]);
create or replace function public.resolve_attack(p_campaign uuid, p_attack text, p_damage numeric, p_text text, p_crit_fail uuid[] default '{}', p_used_crit uuid[] default '{}', p_next_crit uuid[] default '{}')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  enc jsonb; tgt uuid; owner_ uuid; cf uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_damage is null or p_damage < 0 or p_damage > 100000 then raise exception 'That number is not valid.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if enc is null or not (enc ? 'attack') or enc->'attack'->>'id' is distinct from p_attack then raise exception 'That attack is no longer waiting.'; end if;
  tgt := (enc->'attack'->>'target')::uuid;
  select owner into owner_ from public.characters where id = tgt and campaign_id = p_campaign;
  if not found then raise exception 'That attack is no longer waiting.'; end if;
  if owner_ is distinct from auth.uid() and not public.is_campaign_qm(p_campaign) then raise exception 'Only the target''s player can answer this attack.'; end if;
  if p_damage > 0 then
    update public.characters
       set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}',
             coalesce(data->'vitals', '{}'::jsonb) || jsonb_build_object('damage', coalesce((data->'vitals'->>'damage')::numeric, 0) + p_damage))
     where id = tgt;
  end if;
  if enc->'attack'->>'combo' is not null and enc->'attack'->'combo'->>'state' is distinct from 'defend' then
    raise exception 'The combo partner has not rolled yet.';
  end if;
  -- a Critical Miss: the attacker (or the combo's Leader) recovers 2 less AP at the start of their next turn
  foreach cf in array coalesce(p_crit_fail, '{}') loop
    if cf::text = enc->'attack'->>'attacker' or cf::text = enc->'attack'->'combo'->>'leader' then
      update public.characters
         set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}', coalesce(data->'vitals', '{}'::jsonb) || jsonb_build_object('apPenalty', 2))
       where id = cf and campaign_id = p_campaign;
    end if;
  end loop;
  -- Next Hit Critical (Tracking Perfect Combo): a spent flag is cleared first, then a new one is set on both attackers
  foreach cf in array coalesce(p_used_crit, '{}') loop
    if cf::text = enc->'attack'->>'attacker' or cf::text = enc->'attack'->'combo'->>'leader' then
      update public.characters
         set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}', coalesce(data->'vitals', '{}'::jsonb) - 'nextCrit')
       where id = cf and campaign_id = p_campaign;
    end if;
  end loop;
  foreach cf in array coalesce(p_next_crit, '{}') loop
    if cf::text = enc->'attack'->>'attacker' or cf::text = enc->'attack'->'combo'->>'leader' then
      update public.characters
         set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}', coalesce(data->'vitals', '{}'::jsonb) || jsonb_build_object('nextCrit', true))
       where id = cf and campaign_id = p_campaign;
    end if;
  end loop;
  update public.campaigns set encounter = (encounter - 'attack') || jsonb_build_object('lastAttack',
    jsonb_build_object('id', p_attack, 'attacker', enc->'attack'->'attacker', 'target', enc->'attack'->'target', 'text', left(coalesce(p_text, ''), 500)))
   where id = p_campaign;
end;
$$;

drop function if exists public.cancel_attack(uuid);
revoke execute on function public.start_attack(uuid, uuid, numeric, numeric, text, uuid), public.resolve_attack(uuid, text, numeric, text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.start_attack(uuid, uuid, numeric, numeric, text, uuid), public.resolve_attack(uuid, text, numeric, text, uuid[], uuid[], uuid[]) to authenticated;

-- Combo Attacks. The Leader pays 3 AP and rolls the Combo Check on their own device; this stores the result on the encounter
-- (encounter.combos, keyed by Leader). It ends when the Leader's next turn begins, or if either of them leaves the encounter.
create or replace function public.set_combo(p_leader uuid, p_finisher uuid, p_skill text, p_level int, p_total numeric, p_text text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  l record; f record; enc jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_skill not in ('Battlewise', 'Intimidate', 'Athletics', 'Acrobatics', 'Grappling', 'Tracking', 'Courage', 'Handling') then raise exception 'That is not a combo skill.'; end if;
  if p_level not in (0, 10, 15, 20, 25) or p_total is null or abs(p_total) > 100000 then raise exception 'That number is not valid.'; end if;
  if p_leader = p_finisher then raise exception 'Pick another character as the Finisher.'; end if;
  select owner, campaign_id into l from public.characters where id = p_leader;
  select campaign_id into f from public.characters where id = p_finisher;
  if not found or l.campaign_id is null or f.campaign_id is distinct from l.campaign_id then raise exception 'Both characters must be in the same campaign.'; end if;
  if l.owner is distinct from auth.uid() and not public.is_campaign_qm(l.campaign_id) then raise exception 'You can only start a combo with your own characters.'; end if;
  select encounter into enc from public.campaigns where id = l.campaign_id for update;
  if enc is null then raise exception 'Combo Attacks can only be made during an encounter.'; end if;
  if not (p_leader = any (public.encounter_order(l.campaign_id, enc)) and p_finisher = any (public.encounter_order(l.campaign_id, enc))) then
    raise exception 'Both characters must be in the encounter.';
  end if;
  update public.campaigns set encounter = jsonb_set(enc, '{combos}', coalesce(enc->'combos', '{}'::jsonb) ||
    jsonb_build_object(p_leader::text, jsonb_build_object('leader', p_leader, 'finisher', p_finisher, 'skill', p_skill, 'level', p_level,
      'total', p_total, 'text', left(coalesce(p_text, ''), 300))))
   where id = l.campaign_id;
end;
$$;

-- Cancel a waiting combo. The Leader's player, the Finisher's player or a QM can. If anyone but the Leader's own player does (the
-- Finisher declines, or a QM calls it off), the Leader gets their 3 AP back.
create or replace function public.cancel_combo(p_leader uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  l record; enc jsonb; cb jsonb; fo uuid; qm boolean; ap numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select owner, campaign_id into l from public.characters where id = p_leader;
  if not found or l.campaign_id is null then raise exception 'That character is not in a campaign.'; end if;
  select encounter into enc from public.campaigns where id = l.campaign_id for update;
  cb := enc->'combos'->(p_leader::text);
  if cb is null then return; end if;
  select owner into fo from public.characters where id = (cb->>'finisher')::uuid;
  qm := public.is_campaign_qm(l.campaign_id);
  if l.owner is distinct from auth.uid() and fo is distinct from auth.uid() and not qm then raise exception 'You cannot cancel that combo.'; end if;
  update public.campaigns set encounter = enc #- array['combos', p_leader::text] where id = l.campaign_id;
  if l.owner is distinct from auth.uid() then   -- not the Leader's own call: give the 3 AP back
    select nullif(data->'vitals'->>'apRemaining', '')::numeric into ap from public.characters where id = p_leader;
    if ap is not null then
      update public.characters
         set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}', coalesce(data->'vitals', '{}'::jsonb) || jsonb_build_object('apRemaining', ap + 3))
       where id = p_leader;
    end if;
  end if;
end;
$$;

-- The Leader's half of a Combo Attack the Finisher has started: their attack roll and power are added, and the target can then answer.
create or replace function public.combo_leader_attack(p_campaign uuid, p_attack text, p_total numeric, p_power numeric, p_text text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  enc jsonb; lid uuid; lo uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_total is null or p_power is null or abs(p_total) > 100000 or abs(p_power) > 100000 then raise exception 'That number is not valid.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if enc is null or not (enc ? 'attack') or enc->'attack'->>'id' is distinct from p_attack or enc->'attack'->'combo'->>'state' is distinct from 'leader' then
    raise exception 'That combo attack is not waiting for the Leader.';
  end if;
  lid := (enc->'attack'->'combo'->>'leader')::uuid;
  select owner into lo from public.characters where id = lid and campaign_id = p_campaign;
  if not found then raise exception 'That combo attack is not waiting for the Leader.'; end if;
  if lo is distinct from auth.uid() and not public.is_campaign_qm(p_campaign) then raise exception 'Only the Leader''s player can roll for them.'; end if;
  update public.campaigns set encounter = jsonb_set(enc, '{attack,combo}', (enc->'attack'->'combo') ||
    jsonb_build_object('state', 'defend', 'lTotal', p_total, 'lPower', p_power, 'lText', left(coalesce(p_text, ''), 300)))
   where id = p_campaign;
end;
$$;

-- Call off a combo attack that is stuck waiting for the Leader (the Finisher's player, the Leader's player or a QM).
create or replace function public.cancel_combo_attack(p_campaign uuid, p_attack text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  enc jsonb; fo uuid; lo uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if enc is null or not (enc ? 'attack') or enc->'attack'->>'id' is distinct from p_attack or enc->'attack'->'combo'->>'state' is distinct from 'leader' then return; end if;
  select owner into fo from public.characters where id = (enc->'attack'->>'attacker')::uuid;
  select owner into lo from public.characters where id = (enc->'attack'->'combo'->>'leader')::uuid;
  if fo is distinct from auth.uid() and lo is distinct from auth.uid() and not public.is_campaign_qm(p_campaign) then raise exception 'You cannot call that off.'; end if;
  update public.campaigns set encounter = (encounter - 'attack') || jsonb_build_object('lastAttack',
    jsonb_build_object('id', p_attack, 'attacker', enc->'attack'->'attacker', 'target', enc->'attack'->'target', 'text', 'The combo attack was called off.'))
   where id = p_campaign;
end;
$$;
revoke execute on function public.set_combo(uuid, uuid, text, int, numeric, text), public.cancel_combo(uuid),
  public.combo_leader_attack(uuid, text, numeric, numeric, text), public.cancel_combo_attack(uuid, text) from public, anon;
grant execute on function public.set_combo(uuid, uuid, text, int, numeric, text), public.cancel_combo(uuid),
  public.combo_leader_attack(uuid, text, numeric, numeric, text), public.cancel_combo_attack(uuid, text) to authenticated;

-- Explode Tokens (ET): a character holds 0 to 10. The owner (spending on a roll) or a QM of the character's campaign (handing them out) sets the number.
create or replace function public.set_explode_tokens(p_character uuid, p_value int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c record;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_value is null or p_value < 0 or p_value > 10 then raise exception 'A character can hold 0 to 10 Explode Tokens.'; end if;
  select owner, campaign_id into c from public.characters where id = p_character;
  if not found then raise exception 'That character does not exist.'; end if;
  if c.owner is distinct from auth.uid() and not (c.campaign_id is not null and public.is_campaign_qm(c.campaign_id)) then
    raise exception 'You can only change your own characters.';
  end if;
  update public.characters
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{info}', coalesce(data->'info', '{}'::jsonb) || jsonb_build_object('explodeTokens', p_value))
   where id = p_character;
end;
$$;
revoke execute on function public.set_explode_tokens(uuid, int) from public, anon;
grant execute on function public.set_explode_tokens(uuid, int) to authenticated;

-- When a turn starts (after End Turn, Advance Turn or Assign Turn) the character regains all AP and some SP:
-- 1 + 1 per 10 full points of max SP (the app works that number out), but none if AP was 0 going in.
-- Runs once per turn change (the turn number is kept on the character), by the owner's or a QM's device.
drop function if exists public.start_turn(uuid, numeric, numeric);
create or replace function public.start_turn(p_character uuid, p_sp_gain numeric, p_sp_max numeric, p_ap_max numeric default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c record; enc jsonb; mark text; v jsonb; ap numeric; sp numeric; gain numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_sp_gain is null or p_sp_gain < 0 or p_sp_gain > 1000 or p_sp_max is null or p_sp_max < 0 or p_sp_max > 100000 then raise exception 'That number is not valid.'; end if;
  select owner, campaign_id, data into c from public.characters where id = p_character;
  if not found or c.campaign_id is null then raise exception 'That character is not in a campaign.'; end if;
  select encounter into enc from public.campaigns where id = c.campaign_id for update;
  if enc is null or coalesce((enc->>'seq')::int, 0) = 0 or (enc->>'turn') is distinct from p_character::text then
    return jsonb_build_object('applied', false);
  end if;
  if c.owner is distinct from auth.uid() and not public.is_campaign_qm(c.campaign_id) then
    raise exception 'You can only do this for your own characters.';
  end if;
  mark := (enc->>'id') || ':' || (enc->>'seq');
  v := coalesce(c.data->'vitals', '{}'::jsonb);
  if v->>'turnMark' = mark then return jsonb_build_object('applied', false); end if;
  ap := nullif(v->>'apRemaining', '')::numeric;
  sp := coalesce(nullif(v->>'spRemaining', '')::numeric, p_sp_max);
  gain := case when ap is not null and ap <= 0 then 0 else p_sp_gain end;
  v := v || jsonb_build_object('apRemaining', null, 'spRemaining', least(p_sp_max, greatest(sp, sp + gain)), 'turnMark', mark);
  -- a Critical Miss last turn: they fail to recover that much AP now
  if coalesce((v->>'apPenalty')::numeric, 0) > 0 then
    if p_ap_max is not null and p_ap_max >= 0 and p_ap_max <= 1000 then
      v := v || jsonb_build_object('apRemaining', greatest(0, p_ap_max - (v->>'apPenalty')::numeric));
    end if;
    v := v - 'apPenalty';
  end if;
  update public.characters set data = jsonb_set(coalesce(data, '{}'::jsonb), '{vitals}', v) where id = p_character;
  return jsonb_build_object('applied', true, 'spGain', least(p_sp_max, greatest(sp, sp + gain)) - sp, 'apRestored', ap is not null and ap > 0, 'sp', least(p_sp_max, greatest(sp, sp + gain)),
    'apRemaining', v->'apRemaining');
end;
$$;

revoke execute on function public.set_vital(uuid, text, numeric), public.start_turn(uuid, numeric, numeric, numeric),
  public.add_event(uuid, text, numeric, boolean, int), public.set_event_visible(uuid, boolean), public.remove_event(uuid) from public, anon;
grant execute on function public.set_vital(uuid, text, numeric), public.start_turn(uuid, numeric, numeric, numeric),
  public.add_event(uuid, text, numeric, boolean, int), public.set_event_visible(uuid, boolean), public.remove_event(uuid) to authenticated;

revoke execute on function public.start_encounter(uuid), public.end_encounter(uuid), public.set_initiative(uuid, uuid, int, numeric),
  public.encounter_order(uuid, jsonb), public.advance_turn(uuid, uuid), public.assign_turn(uuid, uuid) from public, anon;
grant execute on function public.start_encounter(uuid), public.end_encounter(uuid), public.set_initiative(uuid, uuid, int, numeric),
  public.advance_turn(uuid, uuid), public.assign_turn(uuid, uuid) to authenticated;

-- ================= QM hand-over, leaving, and "become a player" =================
-- A QM's NPCs always pass to a QM. Whenever a QM stops being a QM (leaves, is removed, is demoted, becomes a
-- player, or their account is deleted):
--   * if other QMs remain, their NPCs go to one of them (chosen at random);
--   * if they were the only QM, a random other member becomes QM and inherits the NPCs;
--   * if nobody else is in the campaign: leaving empties it and it is deleted; "become a player" is refused.
-- This replaces the earlier rule that a campaign's last QM could not leave.
create or replace function public.protect_last_qm()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare heir uuid;
begin
  if old.role = 'qm'
     and (tg_op = 'DELETE' or new.role <> 'qm')
     -- when the whole campaign is being deleted its row is already gone, so nothing needs handing over
     and exists (select 1 from public.campaigns where id = old.campaign_id)
  then
    select user_id into heir from public.campaign_members
      where campaign_id = old.campaign_id and role = 'qm' and user_id <> old.user_id order by random() limit 1;
    if heir is null then
      select user_id into heir from public.campaign_members
        where campaign_id = old.campaign_id and user_id <> old.user_id order by random() limit 1;
      if heir is not null then
        update public.campaign_members set role = 'qm' where campaign_id = old.campaign_id and user_id = heir;
      elsif tg_op = 'UPDATE' then
        raise exception 'You are the only player in this campaign, so you must stay QM.';
      end if;
    end if;
    if heir is not null then
      update public.characters set owner = heir where campaign_id = old.campaign_id and is_npc and owner = old.user_id;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- The last person leaving an empty campaign takes it with them.
create or replace function public.delete_empty_campaign()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.campaigns
   where id = old.campaign_id and not exists (select 1 from public.campaign_members where campaign_id = old.campaign_id);
  return old;
end;
$$;

drop trigger if exists delete_empty_campaign_trg on public.campaign_members;
create trigger delete_empty_campaign_trg after delete on public.campaign_members
  for each row execute function public.delete_empty_campaign();

-- A QM steps down to a plain player (the policy above only lets QMs edit rows while they are still QMs afterwards).
create or replace function public.become_player(p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then
    raise exception 'Only a QM can become a player.';
  end if;
  update public.campaign_members set role = 'member' where campaign_id = p_campaign and user_id = auth.uid();
end;
$$;
revoke execute on function public.become_player(uuid) from public, anon;
grant execute on function public.become_player(uuid) to authenticated;

-- Deleting an account: hand over its QM duties (and NPCs) first, before the account's own rows are removed.
create or replace function public.leave_campaigns_before_account_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.campaign_members where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists leave_campaigns_before_account_delete_trg on auth.users;
create trigger leave_campaigns_before_account_delete_trg before delete on auth.users
  for each row execute function public.leave_campaigns_before_account_delete();

-- ===== Spawn Character =====
-- A QM starts a turn-based character creation for the whole campaign. The state lives in campaigns.spawn:
--   { id, startedAt, qm, for: [user ids who may end up owning the character], order: [non-QM user ids, shuffled],
--     pos (0-6), step (appearance, ability, style, weapon, backstory, motivation, points, incarnation, build),
--     turn (whose go it is), options (two row numbers to pick from), data: { appearance, ability, style, weapon, backstory, motivation },
--     points: { <user id>: [ {up, down, prof} x4 ] }, assignee, charId, dead: [ {id, name, incarnation} ], prev: { id, incarnation }, seq }
-- The database does the dice (order, options, who gets the character); the table rows themselves live in the app
-- (abilities 20 rows, fighting styles 8, weapons 12). Only the functions below can change it.
alter table public.campaigns add column if not exists spawn jsonb;

create or replace function public.spawn_options(n int)
returns jsonb
language plpgsql
as $$
declare a int := floor(random() * n)::int; b int;
begin
  loop
    b := floor(random() * n)::int;
    exit when b <> a;
  end loop;
  return jsonb_build_array(a, b);
end;
$$;

create or replace function public.spawn_enter(sp jsonb)
returns jsonb
language plpgsql
as $$
declare pos int := (sp->>'pos')::int; n int := jsonb_array_length(sp->'order');
begin
  sp := jsonb_set(sp, '{step}', to_jsonb((array['appearance','ability','style','weapon','backstory','motivation','points'])[pos + 1]));
  if pos <= 5 then sp := jsonb_set(sp, '{turn}', sp->'order'->(pos % n)); else sp := sp - 'turn'; end if;
  if pos in (1, 2, 3) then sp := jsonb_set(sp, '{options}', public.spawn_options((array[20, 8, 12])[pos]));
  else sp := sp - 'options'; end if;
  return sp;
end;
$$;

create or replace function public.start_spawn(p_campaign uuid, p_for uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare sp jsonb; ord jsonb; fr jsonb;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can spawn a character.'; end if;
  perform 1 from public.campaigns where id = p_campaign for update;
  if exists (select 1 from public.campaigns where id = p_campaign and spawn is not null) then raise exception 'A character is already being spawned.'; end if;
  if exists (select 1 from unnest(coalesce(p_for, '{}'::uuid[])) u where not exists
       (select 1 from public.campaign_members m where m.campaign_id = p_campaign and m.user_id = u)) then
    raise exception 'That player is not in the campaign.';
  end if;
  select coalesce(jsonb_agg(user_id order by random()), '[]'::jsonb) into ord
    from public.campaign_members where campaign_id = p_campaign and role <> 'qm';
  if jsonb_array_length(ord) = 0 then raise exception 'There are no players to build a character.'; end if;
  select coalesce(jsonb_agg(u), '[]'::jsonb) into fr from (select distinct u from unnest(coalesce(p_for, '{}'::uuid[])) u) q;
  sp := jsonb_build_object('id', gen_random_uuid(), 'startedAt', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'qm', auth.uid(),
          'for', fr, 'order', ord, 'pos', 0, 'data', '{}'::jsonb, 'points', '{}'::jsonb, 'seq', 0);
  update public.campaigns set spawn = public.spawn_enter(sp) where id = p_campaign;
end;
$$;

-- The player whose turn it is hands in their part: text for appearance / backstory / motivation, 0 or 1 for the two options.
create or replace function public.spawn_submit(p_campaign uuid, p_value jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare sp jsonb; pos int; fld text; txt text;
begin
  if auth.uid() is null or not public.is_campaign_member(p_campaign) then raise exception 'You are not in this campaign.'; end if;
  select spawn into sp from public.campaigns where id = p_campaign for update;
  if sp is null then raise exception 'No character is being spawned.'; end if;
  pos := (sp->>'pos')::int;
  if sp->>'step' not in ('appearance','ability','style','weapon','backstory','motivation') then raise exception 'That step is not open.'; end if;
  if (sp->>'turn')::uuid is distinct from auth.uid() then raise exception 'It is not your turn.'; end if;
  fld := sp->>'step';
  if pos in (1, 2, 3) then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') not in ('0', '1') then raise exception 'Pick one of the two options.'; end if;
    sp := jsonb_set(sp, array['data', fld], sp->'options'->((p_value #>> '{}')::int));
  else
    if jsonb_typeof(p_value) <> 'string' then raise exception 'Write something first.'; end if;
    txt := btrim(p_value #>> '{}');
    if txt = '' then raise exception 'Write something first.'; end if;
    if char_length(txt) > 1000 then raise exception 'That is too long.'; end if;
    sp := jsonb_set(sp, array['data', fld], to_jsonb(txt));
  end if;
  sp := jsonb_set(sp, '{pos}', to_jsonb(pos + 1));
  sp := jsonb_set(sp, '{seq}', to_jsonb(coalesce((sp->>'seq')::int, 0) + 1));
  update public.campaigns set spawn = public.spawn_enter(sp) where id = p_campaign;
end;
$$;

-- Everyone, at once: four rounds of +2 to one talent, -1 to another talent, +1 to one skill's proficiency.
create or replace function public.spawn_points(p_campaign uuid, p_picks jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare sp jsonb; pk jsonb; k int; assignee uuid; dead jsonb; clean jsonb := '[]'::jsonb; u text;
begin
  if auth.uid() is null or not public.is_campaign_member(p_campaign) then raise exception 'You are not in this campaign.'; end if;
  select spawn into sp from public.campaigns where id = p_campaign for update;
  if sp is null then raise exception 'No character is being spawned.'; end if;
  if sp->>'step' <> 'points' then raise exception 'That step is not open.'; end if;
  if not (sp->'order') ? auth.uid()::text then raise exception 'The QM does not add points.'; end if;
  if sp->'points' ? auth.uid()::text then raise exception 'You have already added your points.'; end if;
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) <> 4 then raise exception 'Make all four sets of picks.'; end if;
  for k in 0..3 loop
    pk := p_picks->k;
    if jsonb_typeof(pk) <> 'object' or jsonb_typeof(pk->'up') <> 'number' or jsonb_typeof(pk->'down') <> 'number' or jsonb_typeof(pk->'prof') <> 'number'
       or (pk->>'up') !~ '^[0-8]$' or (pk->>'down') !~ '^[0-8]$' or (pk->>'prof') !~ '^([0-9]|[12][0-9]|3[0-5])$' then
      raise exception 'Those picks are not valid.';
    end if;
    if pk->>'up' = pk->>'down' then raise exception 'Add and subtract from different talents.'; end if;
    clean := clean || jsonb_build_object('up', (pk->>'up')::int, 'down', (pk->>'down')::int, 'prof', (pk->>'prof')::int);
  end loop;
  sp := jsonb_set(sp, array['points', auth.uid()::text], clean);
  sp := jsonb_set(sp, '{seq}', to_jsonb(coalesce((sp->>'seq')::int, 0) + 1));
  -- everyone in: the dice pick who gets the character
  if not exists (select 1 from jsonb_array_elements_text(sp->'order') o where not (sp->'points' ? o)) then
    sp := jsonb_set(sp, '{charId}', to_jsonb(gen_random_uuid()));
    if jsonb_array_length(sp->'for') > 0 then
      select e into u from jsonb_array_elements_text(sp->'for') e order by random() limit 1;
      assignee := u::uuid;
      sp := jsonb_set(sp, '{assignee}', to_jsonb(u));
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(data->'info'->>'name', ''), 'incarnation', data->'info'->'incarnation')
                                order by created_at), '[]'::jsonb) into dead
        from public.characters
       where campaign_id = p_campaign and owner = assignee and not is_npc and (data->'info'->>'alive') = 'false';
      sp := jsonb_set(sp, '{dead}', dead);
      sp := jsonb_set(sp, '{step}', to_jsonb(case when jsonb_array_length(dead) > 0 then 'incarnation' else 'build' end));
    else
      sp := jsonb_set(sp, '{step}', to_jsonb('build'::text));
    end if;
    sp := sp - 'turn' - 'options';
  end if;
  update public.campaigns set spawn = sp where id = p_campaign;
end;
$$;

-- The player who got the character picks which of their dead characters it follows (or none).
create or replace function public.spawn_incarnation(p_campaign uuid, p_prev uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare sp jsonb; d jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select spawn into sp from public.campaigns where id = p_campaign for update;
  if sp is null or sp->>'step' <> 'incarnation' then raise exception 'That step is not open.'; end if;
  if (sp->>'assignee')::uuid is distinct from auth.uid() then raise exception 'This character is not yours.'; end if;
  if p_prev is not null then
    select x into d from jsonb_array_elements(sp->'dead') x where x->>'id' = p_prev::text;
    if d is null then raise exception 'Pick one of your fallen characters.'; end if;
    sp := jsonb_set(sp, '{prev}', jsonb_build_object('id', p_prev, 'incarnation', d->'incarnation'));
  end if;
  sp := jsonb_set(sp, '{step}', to_jsonb('build'::text));
  sp := jsonb_set(sp, '{seq}', to_jsonb(coalesce((sp->>'seq')::int, 0) + 1));
  update public.campaigns set spawn = sp where id = p_campaign;
end;
$$;

-- The QM's veto: send the creation back one step (the choice is wiped and options are rolled again).
create or replace function public.spawn_veto(p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare sp jsonb; pos int;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can do that.'; end if;
  select spawn into sp from public.campaigns where id = p_campaign for update;
  if sp is null then raise exception 'No character is being spawned.'; end if;
  if sp->>'step' not in ('appearance','ability','style','weapon','backstory','motivation','points') then raise exception 'It is too late to send it back.'; end if;
  pos := (sp->>'pos')::int;
  if pos = 0 then raise exception 'There is nothing to send back yet.'; end if;
  sp := jsonb_set(sp, '{points}', '{}'::jsonb);
  sp := jsonb_set(sp, '{data}', (sp->'data') - ((array['appearance','ability','style','weapon','backstory','motivation'])[pos]));
  sp := jsonb_set(sp, '{pos}', to_jsonb(pos - 1));
  sp := jsonb_set(sp, '{seq}', to_jsonb(coalesce((sp->>'seq')::int, 0) + 1));
  update public.campaigns set spawn = public.spawn_enter(sp) where id = p_campaign;
end;
$$;

create or replace function public.cancel_spawn(p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can cancel it.'; end if;
  update public.campaigns set spawn = null where id = p_campaign;
end;
$$;

-- Called once the new character has been saved (by its new owner, or by a QM when it becomes an NPC).
create or replace function public.finish_spawn(p_campaign uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare sp jsonb; ok boolean;
begin
  if auth.uid() is null or not public.is_campaign_member(p_campaign) then raise exception 'You are not in this campaign.'; end if;
  select spawn into sp from public.campaigns where id = p_campaign for update;
  if sp is null then return; end if;
  if sp->>'step' <> 'build' then raise exception 'The character is not ready yet.'; end if;
  if sp ? 'assignee' then
    if (sp->>'assignee')::uuid is distinct from auth.uid() then raise exception 'This character is not yours.'; end if;
    ok := exists (select 1 from public.characters where id = (sp->>'charId')::uuid and owner = auth.uid() and campaign_id = p_campaign and not is_npc);
  else
    if not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can finish an NPC.'; end if;
    ok := exists (select 1 from public.characters where id = (sp->>'charId')::uuid and campaign_id = p_campaign and is_npc);
  end if;
  if not ok then raise exception 'The character has not been saved yet.'; end if;
  update public.campaigns set spawn = null where id = p_campaign;
end;
$$;

revoke execute on function public.spawn_options(int), public.spawn_enter(jsonb) from public, anon, authenticated;
revoke execute on function public.start_spawn(uuid, uuid[]), public.spawn_submit(uuid, jsonb), public.spawn_points(uuid, jsonb),
  public.spawn_incarnation(uuid, uuid), public.spawn_veto(uuid), public.cancel_spawn(uuid), public.finish_spawn(uuid) from public, anon;
grant execute on function public.start_spawn(uuid, uuid[]), public.spawn_submit(uuid, jsonb), public.spawn_points(uuid, jsonb),
  public.spawn_incarnation(uuid, uuid), public.spawn_veto(uuid), public.cancel_spawn(uuid), public.finish_spawn(uuid) to authenticated;

-- ===== Encounter maps =====
-- A QM uploads a picture (the app shrinks it first) and fits a grid of squares over it. Maps start hidden; players can read
-- only the ones the QM has shown. Everything is written through the functions below. The grid is measured in the picture's own
-- pixels: size = width of one square, ox/oy = where the top-left corner of the grid sits, cols x rows squares.
create table if not exists public.encounter_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  image text not null check (char_length(image) <= 2500000),
  img_w int not null check (img_w between 1 and 8000),
  img_h int not null check (img_h between 1 and 8000),
  cols int not null check (cols between 1 and 200),
  rows int not null check (rows between 1 and 200),
  size numeric not null check (size >= 4 and size <= 4000),
  ox numeric not null check (ox between -8000 and 8000),
  oy numeric not null check (oy between -8000 and 8000),
  visible boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists encounter_maps_campaign_idx on public.encounter_maps (campaign_id);
alter table public.encounter_maps enable row level security;
drop policy if exists "maps readable" on public.encounter_maps;
create policy "maps readable" on public.encounter_maps for select to authenticated
  using (public.is_campaign_qm(campaign_id) or (public.is_campaign_member(campaign_id) and (visible or exists
    (select 1 from public.campaigns c where c.id = encounter_maps.campaign_id and c.encounter->>'mapId' = encounter_maps.id::text))));
revoke all on public.encounter_maps from anon, authenticated;
grant select on public.encounter_maps to authenticated;


-- Tokens: where each character stands on the encounter map (a grid square). Players can read a token if they can see its
-- character (hidden NPCs stay hidden); the owner or a QM places and moves them through the functions below.
create table if not exists public.encounter_tokens (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  col int not null check (col between 0 and 199),
  row int not null check (row between 0 and 199),
  updated_at timestamptz not null default now()
);
create index if not exists encounter_tokens_campaign_idx on public.encounter_tokens (campaign_id);
alter table public.encounter_tokens enable row level security;
drop policy if exists "tokens readable" on public.encounter_tokens;
create policy "tokens readable" on public.encounter_tokens for select to authenticated
  using (public.is_campaign_qm(campaign_id) or (public.is_campaign_member(campaign_id) and exists
    (select 1 from public.characters c where c.id = character_id and c.campaign_id = encounter_tokens.campaign_id and (not c.is_npc or c.npc_visible))));
revoke all on public.encounter_tokens from anon, authenticated;
grant select on public.encounter_tokens to authenticated;

-- Create (p_id null) or change a map. On a change, a null p_image keeps the picture (and its size).
create or replace function public.save_map(p_campaign uuid, p_id uuid, p_name text, p_image text, p_img_w int, p_img_h int,
                                           p_cols int, p_rows int, p_size numeric, p_ox numeric, p_oy numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare nm text := btrim(coalesce(p_name, '')); nid uuid;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can make maps.'; end if;
  if nm = '' then raise exception 'Give the map a name first.'; end if;
  if char_length(nm) > 60 then raise exception 'That name is too long.'; end if;
  if p_cols is null or p_rows is null or p_cols not between 1 and 200 or p_rows not between 1 and 200 then raise exception 'The grid needs 1 to 200 columns and rows.'; end if;
  if p_size is null or p_size < 4 or p_size > 4000 then raise exception 'That square size is not valid.'; end if;
  if p_ox is null or p_oy is null or p_ox not between -8000 and 8000 or p_oy not between -8000 and 8000 then raise exception 'That grid position is not valid.'; end if;
  if p_id is null then
    if p_image is null or not (left(p_image, 11) = 'data:image/' and p_image like 'data:image/%;base64,%') then raise exception 'Pick a picture first.'; end if;
    if char_length(p_image) > 2500000 then raise exception 'That picture is too big.'; end if;
    if p_img_w is null or p_img_h is null or p_img_w not between 1 and 8000 or p_img_h not between 1 and 8000 then raise exception 'That picture is not valid.'; end if;
    if (select count(*) from public.encounter_maps where campaign_id = p_campaign) >= 30 then raise exception 'A campaign can have 30 maps.'; end if;
    insert into public.encounter_maps (campaign_id, name, image, img_w, img_h, cols, rows, size, ox, oy)
    values (p_campaign, nm, p_image, p_img_w, p_img_h, p_cols, p_rows, p_size, p_ox, p_oy) returning id into nid;
    return nid;
  end if;
  if not exists (select 1 from public.encounter_maps where id = p_id and campaign_id = p_campaign) then raise exception 'That map is gone.'; end if;
  if p_image is not null then
    if not (p_image like 'data:image/%;base64,%') then raise exception 'Pick a picture first.'; end if;
    if char_length(p_image) > 2500000 then raise exception 'That picture is too big.'; end if;
    if p_img_w is null or p_img_h is null or p_img_w not between 1 and 8000 or p_img_h not between 1 and 8000 then raise exception 'That picture is not valid.'; end if;
    update public.encounter_maps set image = p_image, img_w = p_img_w, img_h = p_img_h where id = p_id;
  end if;
  update public.encounter_maps set name = nm, cols = p_cols, rows = p_rows, size = p_size, ox = p_ox, oy = p_oy where id = p_id;
  return p_id;
end;
$$;

create or replace function public.set_map_visible(p_map uuid, p_visible boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  select campaign_id into cid from public.encounter_maps where id = p_map;
  if cid is null or auth.uid() is null or not public.is_campaign_qm(cid) then raise exception 'Only a QM can show or hide a map.'; end if;
  update public.encounter_maps set visible = coalesce(p_visible, false) where id = p_map;
end;
$$;

create or replace function public.delete_map(p_map uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  select campaign_id into cid from public.encounter_maps where id = p_map;
  if cid is null or auth.uid() is null or not public.is_campaign_qm(cid) then raise exception 'Only a QM can delete a map.'; end if;
  if exists (select 1 from public.campaigns where id = cid and encounter->>'mapId' = p_map::text) then
    delete from public.encounter_tokens where campaign_id = cid;
    update public.campaigns set encounter = encounter - 'mapId' where id = cid;
  end if;
  delete from public.encounter_maps where id = p_map;
end;
$$;

revoke execute on function public.save_map(uuid, uuid, text, text, int, int, int, int, numeric, numeric, numeric),
  public.set_map_visible(uuid, boolean), public.delete_map(uuid) from public, anon;
grant execute on function public.save_map(uuid, uuid, text, text, int, int, int, int, numeric, numeric, numeric),
  public.set_map_visible(uuid, boolean), public.delete_map(uuid) to authenticated;

-- The QM puts one of the campaign's maps into the running encounter (or takes it out with null). Everyone in the campaign can then
-- open that map for as long as the encounter lasts, even if it is still hidden in the map list. The id lives in encounter.mapId.
create or replace function public.set_encounter_map(p_campaign uuid, p_map uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare enc jsonb;
begin
  if auth.uid() is null or not public.is_campaign_qm(p_campaign) then raise exception 'Only a QM can add a map.'; end if;
  select encounter into enc from public.campaigns where id = p_campaign for update;
  if not found or enc is null then raise exception 'There is no active encounter.'; end if;
  delete from public.encounter_tokens where campaign_id = p_campaign and enc->>'mapId' is distinct from p_map::text;   -- tokens belong to one map's grid
  if p_map is null then
    enc := enc - 'mapId';
  else
    if not exists (select 1 from public.encounter_maps where id = p_map and campaign_id = p_campaign) then raise exception 'That map is gone.'; end if;
    enc := jsonb_set(enc, '{mapId}', to_jsonb(p_map::text));
  end if;
  update public.campaigns set encounter = enc where id = p_campaign;
end;
$$;
revoke execute on function public.set_encounter_map(uuid, uuid) from public, anon;
grant execute on function public.set_encounter_map(uuid, uuid) to authenticated;

create or replace function public.set_token(p_character uuid, p_col int, p_row int)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record; enc jsonb; m record;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select id, owner, campaign_id, is_npc into c from public.characters where id = p_character;
  if not found or c.campaign_id is null or not public.is_campaign_member(c.campaign_id) then raise exception 'That character is not in your campaign.'; end if;
  if not (public.is_campaign_qm(c.campaign_id) or (c.owner = auth.uid() and not c.is_npc)) then raise exception 'You can only move your own characters.'; end if;
  select encounter into enc from public.campaigns where id = c.campaign_id;
  if enc is null then raise exception 'There is no active encounter.'; end if;
  if enc->>'mapId' is null then raise exception 'The encounter has no map.'; end if;
  select cols, rows into m from public.encounter_maps where id = (enc->>'mapId')::uuid;
  if not found then raise exception 'The encounter has no map.'; end if;
  if p_col is null or p_row is null or p_col < 0 or p_row < 0 or p_col >= m.cols or p_row >= m.rows then raise exception 'That square is off the map.'; end if;
  insert into public.encounter_tokens (character_id, campaign_id, col, row) values (p_character, c.campaign_id, p_col, p_row)
  on conflict (character_id) do update set col = excluded.col, row = excluded.row, updated_at = now();
end;
$$;

create or replace function public.remove_token(p_character uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare c record;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select id, owner, campaign_id, is_npc into c from public.characters where id = p_character;
  if not found or c.campaign_id is null or not public.is_campaign_member(c.campaign_id) then raise exception 'That character is not in your campaign.'; end if;
  if not (public.is_campaign_qm(c.campaign_id) or (c.owner = auth.uid() and not c.is_npc)) then raise exception 'You can only move your own characters.'; end if;
  delete from public.encounter_tokens where character_id = p_character;
end;
$$;
revoke execute on function public.set_token(uuid, int, int), public.remove_token(uuid) from public, anon;
grant execute on function public.set_token(uuid, int, int), public.remove_token(uuid) to authenticated;

-- Tokens only last as long as the encounter.
create or replace function public.clear_tokens_with_encounter()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.encounter is null or (new.encounter->>'id') is distinct from (old.encounter->>'id') then
    delete from public.encounter_tokens where campaign_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists clear_tokens_with_encounter_trg on public.campaigns;
create trigger clear_tokens_with_encounter_trg after update of encounter on public.campaigns
  for each row execute function public.clear_tokens_with_encounter();
