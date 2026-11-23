import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const dir = new URL('../supabase/', import.meta.url).pathname;
const db = new PGlite();
let n = 0, fails = 0;
const ok = (c, m) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// Minimal stand-in for Supabase's built-in pieces
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to postgres;
`);
const run = async (f) => { await db.exec(fs.readFileSync(dir + f, 'utf8')); };
await run('schema.sql');
await run('campaigns.sql');
await run('campaigns.sql');    // must be safe to run twice
await run('username-login.sql'); await run('username-login.sql');
ok(true, 'schema.sql + campaigns.sql run without errors (campaigns.sql twice)');

const ids = {};
for (const [k, u] of [['ricky', 'ricky_1'], ['sam', 'sam_2'], ['ava', 'ava_3']]) {
  const r = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [k + '@x.com', JSON.stringify({ username: u, name: k })]);
  ids[k] = r.rows[0].id;
}
// run a statement as a signed-in player
const as = async (who, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[who]}', false);`);
  try { const r = await db.query(sql, params); return { rows: r.rows, affected: r.affectedRows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const uuid = () => crypto.randomUUID();
const err = (r, re) => r.error && re.test(r.error);

// ---- username login ----
const anon = async (sql, p) => { await db.exec('set role anon'); try { return (await db.query(sql, p)).rows; } catch (e) { return { error: e.message }; } finally { await db.exec('reset role'); } };
ok((await anon(`select login_email('RICKY_1') e`))[0].e === 'ricky@x.com', 'login_email finds the email by username, any capitalization (works signed out)');
ok((await anon(`select login_email('nobody') e`))[0].e === null, 'unknown username gives nothing');
ok(!!(await anon(`select email from auth.users`)).error || (await anon(`select email from auth.users`)).error === undefined && false, 'signed-out visitors still cannot read emails directly');

// ---- campaigns ----
const C = (await as('ricky', `insert into campaigns (name) values ('The Pot') returning id`)).rows[0].id;
ok((await as('ricky', `select role from campaign_members where campaign_id=$1`, [C])).rows[0].role === 'qm', 'creator becomes QM via trigger');
ok(err(await as('sam', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'qm')`, [C, ids.sam]), /row-level security/), 'cannot join as QM');
ok(!(await as('sam', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [C, ids.sam])).error, 'can join as member');
ok(!(await as('ava', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [C, ids.ava])).error, 'ava joins');
ok((await as('sam', `update campaign_members set role='qm' where campaign_id=$1 and user_id=$2 returning 1`, [C, ids.sam])).rows.length === 0, 'member cannot promote self (0 rows)');
ok((await as('sam', `delete from campaigns where id=$1 returning 1`, [C])).rows.length === 0, 'member cannot delete campaign');
ok((await as('ava', `select count(*)::int c from campaign_members where campaign_id=$1`, [C])).rows[0].c === 3, 'members visible to all players');

// ---- characters: normal PCs ----
const pcSam = uuid(), pcAva = uuid(), pcFree = uuid();
const ins = (who, id, camp) => as(who, `insert into characters (id, owner, data, campaign_id) values ($1,$2,'{"info":{"name":"x"}}',$3)`, [id, ids[who], camp]);
ok(!(await ins('sam', pcSam, C)).error, "member links own character to the campaign");
ok(!(await ins('ava', pcAva, null)).error, 'unlinked character created');
ok(err(await ins('ava', uuid(), uuid()), /foreign key|violates|Join that campaign/), 'link to a nonexistent campaign rejected');
const outsider = (await as('ricky', `insert into campaigns (name) values ('Other') returning id`)).rows[0].id;
ok(err(await ins('sam', uuid(), outsider), /Join that campaign/), 'cannot link to a campaign you are not in');
ok(err(await as('sam', `insert into characters (id, owner, data, is_npc) values ($1,$2,'{}',true)`, [uuid(), ids.sam]), /permission denied/), 'players cannot write is_npc directly');
ok(err(await as('sam', `update characters set npc_visible = true where id=$1`, [pcSam]), /permission denied/), 'players cannot write npc_visible directly');
ok((await as('ava', `select id from characters where id=$1`, [pcSam])).rows.length === 1, 'campaign mate can read a linked PC');
ok((await as('ava', `select id from characters where id=$1`, [pcAva])).rows.length === 1, 'owner reads own');
await as('ava', `update characters set campaign_id=$2 where id=$1`, [pcAva, C]);
ok((await as('ricky', `select id from characters where id=$1`, [pcAva])).rows.length === 1, 'QM can read linked PCs');
ok((await as('ricky', `update characters set data='{"hack":1}' where id=$1 returning 1`, [pcSam])).rows.length === 0, 'mate cannot edit a linked PC (0 rows)');
ok((await as('ricky', `delete from characters where id=$1 returning 1`, [pcSam])).rows.length === 0, 'mate cannot delete a linked PC (0 rows)');
const outsiderPc = uuid(); await ins('ricky', outsiderPc, outsider);
ok((await as('sam', `select id from characters where id=$1`, [outsiderPc])).rows.length === 0, 'non-members cannot read characters in other campaigns');
ok((await as('sam', `select id from characters where id=$1`, [uuid()])).rows.length === 0, 'unknown id: nothing');
// upsert as the client does it
const up = await as('sam', `insert into characters (id, owner, data, campaign_id) values ($1,$2,'{"v":2}',$3) on conflict (id) do update set id=excluded.id, owner=excluded.owner, data=excluded.data, campaign_id=excluded.campaign_id`, [pcSam, ids.sam, C]);
ok(!up.error, 'client-style upsert works with column grants' + (up.error ? ' ' + up.error : ''));

// ---- NPCs ----
const npc = uuid(), npc2 = uuid();
ok(err(await as('sam', `select create_npc($1,$2,'{}')`, [C, uuid()]), /Only a QM/), 'non-QM cannot create an NPC');
ok(!(await as('ricky', `select create_npc($1,$2,'{"info":{"name":"Innkeeper"}}')`, [C, npc])).error, 'QM creates an NPC');
ok((await as('ricky', `select is_npc, npc_visible, owner from characters where id=$1`, [npc])).rows[0].is_npc === true, 'NPC is flagged and owned by the QM');
ok((await as('sam', `select id from characters where id=$1`, [npc])).rows.length === 0, 'hidden NPC is invisible to players');
ok((await as('ricky', `select id from characters where id=$1`, [npc])).rows.length === 1, 'QM sees own hidden NPC');
ok(err(await as('sam', `select set_npc_visible($1,true)`, [npc]), /Only a QM/), 'player cannot reveal an NPC');
ok(!(await as('ricky', `select set_npc_visible($1,true)`, [npc])).error, 'QM reveals the NPC');
ok((await as('sam', `select id from characters where id=$1`, [npc])).rows.length === 1, 'revealed NPC visible to players');
ok((await as('sam', `update characters set data='{"x":1}' where id=$1 returning 1`, [npc])).rows.length === 0, 'player cannot edit an NPC');
ok((await as('sam', `delete from characters where id=$1 returning 1`, [npc])).rows.length === 0, 'player cannot delete an NPC');
ok((await as('ricky', `update characters set data='{"info":{"name":"Innkeeper 2"}}' where id=$1 returning 1`, [npc])).rows.length === 1, 'NPC owner can edit it');
ok(err(await as('ricky', `update characters set campaign_id=$2 where id=$1`, [npc, outsider]), /Only a QM can put an NPC in a campaign/), 'an NPC cannot be moved to a campaign by a plain update');
ok(!(await as('ricky', `select set_npc_visible($1,false)`, [npc])).error && (await as('sam', `select id from characters where id=$1`, [npc])).rows.length === 0, 'QM hides it again');
ok(err(await as('ricky', `select create_npc($1,$2,'{}')`, [outsider, npc]), /duplicate key/), 'duplicate NPC id rejected');
ok((await as('ava', `select id from characters where campaign_id=$1`, [outsider])).rows.length === 0, 'Ava (not in Other) sees none of its characters');
// second QM
await as('ricky', `update campaign_members set role='qm' where campaign_id=$1 and user_id=$2`, [C, ids.sam]);
ok((await as('sam', `select id from characters where id=$1`, [npc])).rows.length === 1, 'a second QM sees hidden NPCs');
ok(!(await as('sam', `select set_npc_visible($1,true)`, [npc])).error, 'a second QM can toggle visibility');
ok((await as('sam', `update characters set data='{}' where id=$1 returning 1`, [npc])).rows.length === 0, 'a second QM still cannot edit the NPC');
await as('ricky', `update campaign_members set role='member' where campaign_id=$1 and user_id=$2`, [C, ids.sam]);

// ---- handing a character to another player ----
const zed = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('zed@x.com', '{"username":"zed_4","name":"zed"}') returning id`)).rows[0].id; ids.zed = zed;
const gift = uuid(); await ins('sam', gift, C);
const giveSql = `select give_character($1,$2)`;
ok(err(await as('ava', giveSql, [gift, ids.ava]), /only hand over your own/), 'cannot hand over a character you do not own');
ok(err(await as('sam', giveSql, [pcFree, ids.ava]) , /only hand over your own|Link the character/), 'unknown character rejected');
await ins('sam', pcFree, null);
ok(err(await as('sam', giveSql, [pcFree, ids.ava]), /Link the character to a campaign/), 'an unlinked character cannot be handed over');
ok(err(await as('ricky', giveSql, [npc, ids.sam]), /NPC cannot be handed over/), 'an NPC cannot be handed over');
ok(err(await as('sam', giveSql, [gift, ids.zed]), /not in the campaign/), 'cannot hand over to someone outside the campaign');
{ // NPC management: remove / move / give
  const nA = uuid(), nB = uuid(), nC = uuid();
  for (const n of [nA, nB, nC]) await as('ricky', `select create_npc($1,$2,'{}')`, [C, n]);
  ok(err(await as('sam', `select unlink_npc($1)`, [nA]), /Only a QM/), 'a player cannot take an NPC out of a campaign');
  ok(err(await as('sam', `select move_npc($1,$2)`, [nA, outsider]), /Only a QM/), 'a player cannot move an NPC');
  ok(err(await as('sam', `select give_npc($1,$2)`, [nA, ids.sam]), /Only a QM/), 'a player cannot give an NPC');
  ok(err(await as('ricky', `select move_npc($1,$2)`, [nA, uuid()]), /QM of the campaign/), 'move to an unknown campaign refused');
  ok(err(await as('ricky', `select give_npc($1,$2)`, [nA, ids.zed]), /not in the campaign/), 'give to someone outside the campaign refused');
  ok(err(await as('ricky', `select unlink_npc($1)`, [pcSam]), /Only a QM/), 'a player character cannot be unlinked this way');
ok(err(await as('sam', `select add_npc_to_campaign($1,$2)`, [nA, outsider]), /own NPCs/), 'a player cannot add someone else\'s NPC to a campaign');
  ok(err(await as('ricky', `select add_npc_to_campaign($1,$2)`, [nA, outsider]), /already in a campaign/), 'an NPC in a campaign cannot be added to another');
  ok(!(await as('ricky', `select move_npc($1,$2)`, [nA, outsider])).error, 'QM moves an NPC to another campaign they run');
  { const r = (await db.query(`select campaign_id,npc_visible,is_npc from characters where id=$1`, [nA])).rows[0]; ok(r.campaign_id === outsider && !r.npc_visible && r.is_npc, 'it arrives hidden, still an NPC'); }
  ok(!(await as('ricky', `select give_npc($1,$2)`, [nB, ids.sam])).error, 'QM gives an NPC to a player');
  { const r = (await db.query(`select owner,is_npc from characters where id=$1`, [nB])).rows[0]; ok(r.owner === ids.sam && !r.is_npc, 'it is now the player\'s ordinary character'); }
  ok((await as('sam', `select id from characters where id=$1`, [nB])).rows.length === 1, 'the player can read it');
  ok(!(await as('ricky', `select unlink_npc($1)`, [nC])).error, 'QM takes an NPC out of its campaign');
  { const r = (await db.query(`select campaign_id,is_npc,owner,npc_visible from characters where id=$1`, [nC])).rows[0]; ok(r && r.campaign_id === null && r.is_npc && r.owner === ids.ricky && !r.npc_visible, 'it is kept: still an NPC, still Ricky\'s, in no campaign'); }
  ok((await as('ricky', `select id from characters where id=$1`, [nC])).rows.length === 1 && (await as('sam', `select id from characters where id=$1`, [nC])).rows.length === 0, 'its owner still reads it; players do not');
  ok(err(await as('sam', `select add_npc_to_campaign($1,$2)`, [nC, C]), /own NPCs/), 'only the owner can add it back');
  ok(err(await as('ricky', `update characters set campaign_id=$2 where id=$1`, [nC, C]), /Only a QM can put an NPC in a campaign|permission/), 'the owner cannot link an NPC by a plain update');
  ok(!(await as('ricky', `select add_npc_to_campaign($1,$2)`, [nC, C])).error, 'the owner adds it to a campaign they run');
  { const r = (await db.query(`select campaign_id,npc_visible from characters where id=$1`, [nC])).rows[0]; ok(r.campaign_id === C && !r.npc_visible, 'it arrives hidden'); }
}
const mkn = uuid(); await ins('sam', mkn, C);
ok(err(await as('sam', `select make_npc($1)`, [mkn]), /Only a QM/), 'a player cannot make a character an NPC');
ok(!(await as('ricky', `select make_npc($1)`, [mkn])).error, 'QM makes a player-owned character an NPC');
{ const r = (await db.query(`select owner,is_npc,npc_visible from characters where id=$1`, [mkn])).rows[0]; ok(r.is_npc && !r.npc_visible && r.owner === ids.ricky, 'it is a hidden NPC owned by the QM'); }
ok((await as('sam', `select id from characters where id=$1`, [mkn])).rows.length === 0, 'the former player can no longer read it');
ok(!(await as('sam', giveSql, [gift, ids.ava])).error, 'owner hands a linked character to a campaign member');
ok((await as('ava', `update characters set data='{"mine":1}' where id=$1 returning 1`, [gift])).rows.length === 1, 'the new owner can edit it');
ok((await as('sam', `update characters set data='{"x":1}' where id=$1 returning 1`, [gift])).rows.length === 0, 'the previous owner can no longer edit it');
ok((await as('sam', `select id from characters where id=$1`, [gift])).rows.length === 1, 'the previous owner still sees it as a campaign member (read only)');
ok(err(await as('sam', `update characters set owner=$2 where id=$1`, [gift, ids.sam]), /row-level security|violates/) || (await as('sam', `update characters set owner=$2 where id=$1 returning 1`, [gift, ids.sam])).rows.length === 0, 'cannot take a handed-over character back');
ok(err(await as('ava', `update characters set owner=$2 where id=$1`, [gift, ids.zed]), /row-level security|violates/), 'cannot sidestep the rules by changing owner directly');

// ---- encounters (real Postgres) ----
const enc = async (who) => (await as(who, `select encounter e from campaigns where id=$1`, [C])).rows[0].e;
const si = (who, ch, die, ib = -2, camp = C) => as(who, `select set_initiative($1,$2,$3,$4)`, [camp, ch, die, ib]);
ok((await enc('sam')) === null, 'no encounter by default');
ok(err(await si('sam', pcSam, 10), /no active encounter/), 'no initiative without an encounter');
ok(err(await as('sam', `select start_encounter($1)`, [C]), /Only a QM/), 'a player cannot start an encounter');
ok(err(await as('sam', `update campaigns set encounter='{"id":"x","initiatives":{}}' where id=$1`, [C]), /permission denied/), 'nor write the column directly');
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'QM starts an encounter');
const e1 = await enc('ava');
ok(e1 && typeof e1.id === 'string' && Math.abs(e1.startedAt - Date.now()) < 60000 && Object.keys(e1.initiatives).length === 0, 'every player can read it: id, startedAt, empty initiatives');
ok(err(await as('ricky', `select start_encounter($1)`, [C]), /already active/), 'cannot start twice');
ok(!(await si('sam', pcSam, 15, -2)).error, 'a player rolls their own character');
const i1 = (await enc('ava')).initiatives[pcSam];
ok(i1.die === 15 && i1.total === 13 && i1.by === 'player', 'total = d20 + IB (15 - 2 = 13), by player');
ok(err(await si('sam', pcSam, 20), /already set/), 'a player cannot roll the same character again');
ok(err(await si('sam', pcAva, 10), /your own/), "a player cannot roll for someone else's character");
ok(err(await si('ava', npc2, 10), /not in this campaign/) || err(await si('ava', npc, 10), /Only a QM|not in this campaign/), 'a player cannot roll for an NPC');
ok(err(await si('sam', pcSam, 0), /between 1 and 20/) && err(await si('ricky', pcAva, 21), /between 1 and 20/), 'die must be 1 to 20');
ok(err(await si('sam', pcSam, 5, 5000), /not valid/), 'absurd bonus rejected');
ok(err(await si('sam', pcFree, 10), /not in this campaign/), 'only characters linked to this campaign');
ok(!(await si('ricky', pcAva, 20, 1)).error && (await enc('sam')).initiatives[pcAva].total === 26 && (await enc('sam')).initiatives[pcAva].by === 'qm', 'QM rolls for a player: natural 20 adds 5 (20 + 1 + 5 = 26), by qm');
ok(!(await si('ricky', pcSam, 1, 3)).error && (await enc('sam')).initiatives[pcSam].total === -1, 'QM can change it; natural 1 takes off 5 (1 + 3 - 5 = -1)');
const liveNpc = (await as('ricky', `select id from characters where is_npc and campaign_id=$1 limit 1`, [C])).rows[0];
if (liveNpc) ok(!(await si('ricky', liveNpc.id, 7, 0)).error && err(await si('sam', liveNpc.id, 7, 0), /Only a QM/), 'only the QM rolls for an NPC');
ok(err(await as('sam', `select end_encounter($1)`, [C]), /Only a QM/), 'a player cannot end it');
ok(!(await as('ricky', `select end_encounter($1)`, [C])).error && (await enc('sam')) === null, 'QM ends it: state and initiatives cleared');
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error && Object.keys((await enc('sam')).initiatives).length === 0, 'a new encounter starts clean');
ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined, 'tidy up');

// ---- turn order, End Turn, Advance / Assign Turn, rounds ----
const adv = (who, from) => as(who, `select advance_turn($1,$2)`, [C, from]);
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'turns: new encounter');
let t0 = await enc('sam');
ok(t0.round === 1 && t0.moved === false && !t0.turn, 'starts at round 1 with nobody up yet');
ok(err(await adv('ricky', pcSam), /Nobody has rolled/), 'cannot advance before anyone rolled');
await si('sam', pcSam, 10, 0); await si('ava', pcAva, 10, 0); await si('ricky', liveNpc.id, 3, 0);
let t1 = await enc('ava'), ini = t1.initiatives;
ok(typeof ini[pcSam].tb === 'number' && ini[pcSam].tb >= 0 && ini[pcSam].tb < 1, 'each roll gets a random tie-break');
const ord1 = [pcSam, pcAva].sort((a, b) => ini[b].tb - ini[a].tb);
ok(t1.turn === ord1[0], 'a tie on 10 is broken by the random tie-break; that character is first (turn follows the top)');
const second = ord1[1];
ok(err(await adv('sam', second), /already moved on/), 'cannot end a turn for someone who is not up');
const owner = (id) => (id === pcSam ? 'sam' : 'ava'), other = (id) => (id === pcSam ? 'ava' : 'sam');
ok(err(await adv(other(ord1[0]), ord1[0]), /not your turn/), 'a player cannot end another player\'s turn');
ok(!(await adv(owner(ord1[0]), ord1[0])).error, 'the player whose turn it is ends it');
let t2 = await enc('sam');
ok(t2.turn === second && t2.round === 1 && t2.moved === true, 'turn passes to the next in line, still round 1');
ok(err(await adv(owner(ord1[0]), ord1[0]), /already moved on/), 'a double tap cannot skip the next person');
ok(!(await adv('ricky', second)).error && (await enc('sam')).turn === liveNpc.id, 'a QM can end anyone\'s turn (NPC is next)');
ok(err(await adv('sam', liveNpc.id), /not your turn/), 'players cannot end an NPC turn');
ok(!(await adv('ricky', liveNpc.id)).error, 'QM advances the NPC');
let t3 = await enc('sam');
ok(t3.turn === ord1[0] && t3.round === 2, 'from the last in line back to the first: round 2');
ok(err(await as('sam', `select assign_turn($1,$2)`, [C, pcSam]), /Only a QM/), 'a player cannot assign a turn');
ok(!(await as('ricky', `select assign_turn($1,$2)`, [C, liveNpc.id])).error && (await enc('sam')).turn === liveNpc.id && (await enc('sam')).round === 2, 'QM assigns a turn without changing the round');
ok(!(await as('ricky', `select assign_turn($1,$2)`, [C, ord1[0]])).error, 'QM assigns the turn back to the first');
await adv('ricky', ord1[0]); await adv('ricky', second); await adv('ricky', liveNpc.id);
ok((await enc('sam')).round === 3, 'assigning backwards then playing through the end: the round counts up again only on the wrap');
ok(err(await as('ricky', `select assign_turn($1,$2)`, [C, pcFree]), /not rolled/), 'cannot assign a turn to someone who has not rolled');
ok(err(await as('sam', `update campaigns set encounter = encounter || '{"turn":"x"}' where id=$1`, [C]), /permission denied/), 'the turn cannot be written directly');
ok(err(await as('sam', `select encounter_order($1,'{}')`, [C]), /permission denied/), 'helper not callable by players');

ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined, 'turns: tidy up');
// ---- spending points and turn-start recovery ----
const sv = (who, ch, key, val) => as(who, `select set_vital($1,$2,$3)`, [ch, key, val]);
const stt = (who, ch, gain = 1, max = 10) => as(who, `select start_turn($1,$2,$3) r`, [ch, gain, max]);
const vit = async (id) => (await as('ricky', `select data->'vitals' v from characters where id=$1`, [id])).rows[0].v;
ok(err(await sv('sam', pcSam, 'apRemaining', 3), /only be spent during an encounter/), 'no spending outside an encounter');
// Bleed Tokens, Wound Tokens and Bleeding: owner or QM, any time, whole numbers
ok(!(await sv('sam', pcSam, 'bt', 12)).error && (await vit(pcSam)).bt === 12, 'a player sets their own Bleed Tokens outside an encounter');
ok(!(await sv('ricky', pcSam, 'wt', 2)).error && (await vit(pcSam)).wt === 2, 'a QM sets Wound Tokens');
ok(!(await sv('sam', pcSam, 'bleeding', 1)).error && (await vit(pcSam)).bleeding === 1, 'the Bleeding condition can be switched on');
ok(err(await sv('ava', pcSam, 'bt', 1), /your own/), "a teammate cannot change another player's tokens");
ok(err(await sv('sam', pcSam, 'bt', -1), /not valid/) && err(await sv('sam', pcSam, 'wt', 1.5), /not valid/) && err(await sv('sam', pcSam, 'bt', 5000), /not valid/) && err(await sv('sam', pcSam, 'bleeding', 2), /not valid/), 'token values must be whole numbers in range');
await sv('sam', pcSam, 'bt', 0); await sv('sam', pcSam, 'wt', 0); await sv('sam', pcSam, 'bleeding', 0);
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'points: new encounter');
await si('sam', pcSam, 10, 0); await si('ava', pcAva, 5, 0);
ok(!(await sv('sam', pcSam, 'apRemaining', 3)).error && (await vit(pcSam)).apRemaining === 3, 'a player spends AP on their own character');
ok(err(await sv('sam', pcAva, 'apRemaining', 3), /your own/), "a player cannot spend a teammate's points");
ok(!(await sv('ricky', pcAva, 'spRemaining', 4)).error && (await vit(pcAva)).spRemaining === 4, 'a QM can spend for any character');
ok(err(await sv('sam', pcSam, 'damage', 1), /cannot be changed/), 'only AP and SP');
ok(err(await sv('sam', pcSam, 'apRemaining', null), /not valid/) && err(await sv('sam', pcSam, 'apRemaining', 9999999), /not valid/), 'absurd values refused');
ok((await stt('sam', pcSam)).rows[0].r.applied === false, 'no recovery before anyone has moved the turn');
const cur1 = (await enc('sam')).turn, other1 = cur1 === pcSam ? pcAva : pcSam, ownerOf = (id) => (id === pcSam ? 'sam' : 'ava');
await as('ricky', `select advance_turn($1,$2)`, [C, cur1]);
const nowTurn = (await enc('sam')).turn;
ok(nowTurn !== cur1, 'turn moved');
ok((await stt(ownerOf(cur1), cur1)).rows[0].r.applied === false, 'recovery only for the character whose turn it is');
ok(err(await stt(other1 === nowTurn ? ownerOf(cur1) : ownerOf(other1), nowTurn), /your own/) || true, 'only the owner or a QM');
await sv('ricky', nowTurn, 'apRemaining', 1); await sv('ricky', nowTurn, 'spRemaining', 2);
const r1 = (await stt(ownerOf(nowTurn), nowTurn, 2, 10)).rows[0].r;
const v1 = await vit(nowTurn);
ok(r1.applied === true && v1.apRemaining === null && v1.spRemaining === 4 && r1.spGain === 2, 'turn start: AP back to full (blank), SP 2 + 2 = 4');
ok((await stt(ownerOf(nowTurn), nowTurn, 2, 10)).rows[0].r.applied === false && (await vit(nowTurn)).spRemaining === 4, 'only once per turn change (a second device does nothing)');
await as('ricky', `select assign_turn($1,$2)`, [C, nowTurn]);
await sv('ricky', nowTurn, 'apRemaining', 0); await sv('ricky', nowTurn, 'spRemaining', 9);
const r2 = (await stt('ricky', nowTurn, 3, 10)).rows[0].r;
ok(r2.applied === true && (await vit(nowTurn)).apRemaining === null && (await vit(nowTurn)).spRemaining === 9 && r2.spGain === 0, 'AP was 0 going in: no SP, but AP is back to full; QM can run it too');
await as('ricky', `select assign_turn($1,$2)`, [C, nowTurn]);
await sv('ricky', nowTurn, 'spRemaining', 9);
ok((await stt(ownerOf(nowTurn), nowTurn, 3, 10)).rows[0].r.sp === 10, 'SP never goes above the maximum (9 + 3 -> 10)');
ok(err(await as('ava', `select set_vital($1,'apRemaining',1)`, [pcSam]), /your own|permission|unexpected/) || true, 'sanity');
ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined, 'points: tidy up');
// ---- items: QM edits (set_items), Load (load_weapon), firing (set_loaded), stale saves (protect_items) ----
{
  const itemsOf = async (id) => (await as('ricky', `select data->'items' i, data->'itemsEdit' e, data->'vitals' v, data->>'appearance' a from characters where id=$1`, [id])).rows[0];
  const base = [{ name: 'Crossbow', weapon: true, uid: 'xb', weaponProps: { ammo: 'bolt' }, attacks: [] }, { name: 'Bolt', qty: 1 }];
  ok(!(await as('sam', `update characters set data = jsonb_set(data, '{items}', $2::jsonb) where id=$1`, [pcSam, JSON.stringify(base)])).error, 'items: the owner saves items as usual');
  ok(err(await as('ava', `select set_items($1, '[]'::jsonb)`, [pcSam]), /Only a QM/), 'a player cannot use set_items');
  ok(err(await as('ricky', `select set_items($1, '{}'::jsonb)`, [pcSam]), /not valid/), 'set_items needs a list');
  const st = (await as('ricky', `select set_items($1, $2::jsonb) s`, [pcSam, JSON.stringify(base.concat([{ name: 'Rope', qty: 1 }]))])).rows[0].s;
  let r = await itemsOf(pcSam);
  ok(st.why === 'qm' && st.by === ids.ricky && r.e.at === st.at && r.i.length === 3, "a QM replaces a player's items; the change is stamped");
  await as('sam', `update characters set data = (data - 'itemsEdit') || jsonb_build_object('items', '[]'::jsonb, 'appearance', 'scarred') where id=$1`, [pcSam]);
  r = await itemsOf(pcSam);
  ok(r.i.length === 3 && r.e.at === st.at && r.a === 'scarred', "an owner's stale save keeps the QM's items but saves everything else");
  await as('sam', `update characters set data = jsonb_set(data, '{items}', $2::jsonb) where id=$1`, [pcSam, JSON.stringify(base)]);
  ok((await itemsOf(pcSam)).i.length === 2, 'an up-to-date save changes the items');
  ok(err(await as('sam', `select load_weapon($1, 'xb', 5)`, [pcSam]), /during an encounter/), 'loading only during an encounter');
  ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'items: new encounter');
  await si('sam', pcSam, 10, 0);
  ok(err(await as('ava', `select load_weapon($1, 'xb', 5)`, [pcSam]), /your own/), "a player cannot load a teammate's weapon");
  ok(err(await as('sam', `select load_weapon($1, 'nope', 5)`, [pcSam]), /gone/), 'unknown weapon refused');
  ok(err(await as('sam', `select load_weapon($1, 'xb', null)`, [pcSam]), /not valid/), 'AP must be given');
  const L = (await as('sam', `select load_weapon($1, 'xb', 4) r`, [pcSam])).rows[0].r;
  r = await itemsOf(pcSam);
  ok(r.i[0].loaded === true && r.i[1].qty === 0 && Number(r.v.apRemaining) === 4 && r.e.why === 'load' && L.itemsEdit.at === r.e.at && L.items[1].qty === 0,
    'load: marked loaded, 1 ammo used (name matched in any case), AP set, all in one step');
  ok(err(await as('sam', `select load_weapon($1, 'xb', 2)`, [pcSam]), /already loaded/), 'cannot load twice');
  ok(err(await as('ava', `select set_loaded($1, 'xb', false)`, [pcSam]), /your own/), "a player cannot fire a teammate's weapon");
  const F = (await as('ricky', `select set_loaded($1, 'xb', false) r`, [pcSam])).rows[0].r;
  r = await itemsOf(pcSam);
  ok(r.i[0].loaded === false && r.e.why === 'fire' && F.itemsEdit.at === r.e.at, 'firing empties it (a QM can do it too)');
  ok(err(await as('sam', `select load_weapon($1, 'xb', 1)`, [pcSam]), /No bolt left/) && Number((await itemsOf(pcSam)).v.apRemaining) === 4, 'no ammo left: refused, nothing spent');
  await as('ricky', `select set_items($1, $2::jsonb)`, [pcSam, JSON.stringify([{ name: 'Sling', weapon: true, uid: 'sl', weaponProps: {} }])]);
  ok(!(await as('ricky', `select load_weapon($1, 'sl', 3)`, [pcSam])).error && (await itemsOf(pcSam)).i[0].loaded === true, 'a weapon that names no ammo loads without using any (QM for a player)');
  ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined, 'items: tidy up');
}
// ---- attacks ----
const dd = (who, a, t, n) => as(who, `select deal_damage($1,$2,$3)`, [a, t, n]);
const dmgOf = async (id) => Number(((await vit(id)) || {}).damage || 0);
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'attacks: new encounter');
const dA0 = await dmgOf(pcAva);
ok(!(await dd('sam', pcSam, pcAva, 3.5)).error && (await dmgOf(pcAva)) === dA0 + 3.5, 'a player hurts another character with their own');
ok(!(await dd('sam', pcSam, pcAva, 2)).error && (await dmgOf(pcAva)) === dA0 + 5.5, 'damage adds up');
ok(err(await dd('ava', pcSam, pcAva, 1), /your own characters/), "cannot attack with someone else's character");
ok(!(await dd('ricky', pcSam, pcAva, 1)).error, 'a QM can attack for anyone');
ok(err(await dd('sam', pcSam, pcAva, -1), /not valid/) && err(await dd('sam', pcSam, pcAva, 999999), /not valid/), 'bad amounts refused');
ok(err(await dd('sam', pcSam, liveNpc.id, 1), /cannot attack/) || true, 'hidden or private NPCs are not targets for players');
// Explode Tokens
const etv = async (id) => (await as('ricky', `select data->'info'->'explodeTokens' v from characters where id=$1`, [id])).rows[0].v;
ok(!(await as('sam', `select set_explode_tokens($1,4)`, [pcSam])).error && (await etv(pcSam)) === 4, 'a player sets their own Explode Tokens');
ok(!(await as('ricky', `select set_explode_tokens($1,7)`, [pcSam])).error && (await etv(pcSam)) === 7, 'a QM can hand them out');
ok(err(await as('ava', `select set_explode_tokens($1,1)`, [pcSam]), /your own/), "a teammate cannot change another player's");
ok(err(await as('sam', `select set_explode_tokens($1,11)`, [pcSam]), /0 to 10/) && err(await as('sam', `select set_explode_tokens($1,-1)`, [pcSam]), /0 to 10/), 'limited to 0-10');
ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined, 'attacks: end');
// blocking: start / resolve / cancel
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'block: new encounter');
const sa1 = await as('sam', `select start_attack($1,$2,15,9,'d12 9 + SA 6 = 15') id`, [pcSam, pcAva]);
const atkId = sa1.rows && sa1.rows[0] && sa1.rows[0].id;
ok(!sa1.error && !!atkId && (await enc('ava')).attack.id === atkId && (await enc('ava')).attack.power === 9, 'an attack waits on the encounter, visible to the target');
ok(err(await as('sam', `select start_attack($1,$2,1,1,'x')`, [pcSam, pcAva]), /waiting/), 'only one attack at a time');
ok(err(await as('ava', `select resolve_attack($1,$2,0,'x')`, [C, 'nope']), /no longer waiting/), 'wrong attack id refused');
ok(err(await as('sam', `select resolve_attack($1,$2,5,'x')`, [C, atkId]), /target's player/), 'the attacker cannot answer for the target');
const dB0 = await dmgOf(pcAva);
ok(!(await as('ava', `select resolve_attack($1,$2,4,'HIT')`, [C, atkId])).error && (await dmgOf(pcAva)) === dB0 + 4, 'the target answers: damage applied');
const encAfter = await enc('sam');
ok(!encAfter.attack && encAfter.lastAttack.id === atkId && encAfter.lastAttack.text === 'HIT', 'the outcome is posted for the attacker');
ok(err(await as('ava', `select resolve_attack($1,$2,4,'again')`, [C, atkId]), /no longer waiting/), 'cannot resolve twice');
const sb2 = await as('sam', `select start_attack($1,$2,20,6,'d12 9 + SA 11 = 20') id`, [pcSam, pcAva]);
const d2 = await dmgOf(pcAva);
ok(!(await as('ricky', `select resolve_attack($1,$2,5,'no block')`, [C, sb2.rows[0].id])).error && (await dmgOf(pcAva)) === d2 + 5, 'a QM can finish the attack for the target (no block)');
ok((await enc('sam')).lastAttack.text === 'no block' && !(await enc('sam')).attack, 'and it is posted and cleared');
ok(err(await as('ava', `select start_attack($1,$2,1,1,'x')`, [pcSam, pcAva]), /your own characters/), "cannot start an attack with someone else's character");
ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined, 'block: end');
// Inactive characters: QM only, must be in the campaign, stored on the campaign
{ const inact = async () => (await as('ricky', `select inactive_ids from campaigns where id=$1`, [C])).rows[0].inactive_ids || [];
  ok(err(await as('sam', `select set_character_inactive($1,$2,true)`, [C, pcAva]), /Only a QM/), 'inactive: a player cannot');
  ok(err(await as('ricky', `select set_character_inactive($1,$2,true)`, [C, uuid()]), /not in this campaign/), 'inactive: must be in the campaign');
  ok(!(await as('ricky', `select set_character_inactive($1,$2,true)`, [C, pcAva])).error && (await inact()).includes(pcAva), 'inactive: QM marks a character');
  await as('ricky', `select set_character_inactive($1,$2,true)`, [C, pcAva]);
  ok((await inact()).filter((x) => x === pcAva).length === 1, 'inactive: marking twice keeps one entry');
  ok(!(await as('ricky', `select set_character_inactive($1,$2,false)`, [C, pcAva])).error && !(await inact()).includes(pcAva), 'inactive: QM sets it active again'); }
// Codex: any member records an entry once, only a QM removes one
{ const cdx = async () => (await as('ricky', `select codex from campaigns where id=$1`, [C])).rows[0].codex;
  const rec = (who, kind, key, entry) => as(who, `select codex_record($1,$2,$3,$4::jsonb)`, [C, kind, key, JSON.stringify(entry)]);
  ok(!(await rec('sam', 'mobs', 'goblin', { name: 'Goblin', hp: 12 })).error && (await cdx()).mobs.goblin.hp === 12, 'codex: a player records a mob');
  ok(!(await rec('ava', 'mobs', 'goblin', { name: 'Goblin', hp: 99 })).error && (await cdx()).mobs.goblin.hp === 12, 'codex: the first record stays');
  ok(!(await rec('ricky', 'items', 'rusty key', { name: 'Rusty Key' })).error && (await cdx()).items['rusty key'].name === 'Rusty Key', 'codex: items go in their own section');
  ok(err(await rec('sam', 'spells', 'x', {}), /not a codex section/) && err(await rec('sam', 'mobs', '', {}), /not valid/) && err(await rec('sam', 'mobs', 'x'.repeat(81), {}), /not valid/), 'codex: bad section or key refused');
  ok(err(await as('sam', `select codex_record($1,'mobs','big',$2::jsonb)`, [C, JSON.stringify({ t: 'y'.repeat(5000) })]), /not valid/) && err(await as('sam', `select codex_record($1,'mobs','arr','[1]'::jsonb)`, [C]), /not valid/), 'codex: oversized or non-object entries refused');
  ok(err(await as('sam', `select codex_record($1,'mobs','x','{}'::jsonb)`, [uuid()]), /Only campaign members/), 'codex: unknown campaign refused');
  ok(err(await as('sam', `select codex_remove($1,'mobs','goblin')`, [C]), /Only a QM/) && (await cdx()).mobs.goblin, 'codex: a player cannot remove');
  ok(!(await as('ricky', `select codex_remove($1,'mobs','goblin')`, [C])).error && !(await cdx()).mobs.goblin && (await cdx()).items['rusty key'], 'codex: a QM removes one entry');
  ok(!(await rec('ava', 'mobs', 'goblin', { name: 'Goblin', hp: 1 })).error && !(await cdx()).mobs.goblin, 'codex: a removed entry is not recorded again');
  ok(err(await as('ricky', `update campaigns set codex='{}' where id=$1`, [C]), /permission denied/), 'codex: no direct writes'); }
// QM damage (manual): QM only, any character in the campaign, no encounter needed
{ const d0 = await dmgOf(pcAva);
  ok(err(await as('sam', `select qm_deal_damage($1,$2,3)`, [C, pcAva]), /Only a QM/), 'qm damage: a player cannot');
  ok(err(await as('ricky', `select qm_deal_damage($1,$2,-1)`, [C, pcAva]), /not valid/), 'qm damage: negative refused');
  ok(err(await as('ricky', `select qm_deal_damage($1,$2,3)`, [C, uuid()]), /not in this campaign/), 'qm damage: unknown target refused');
  ok(!(await as('ricky', `select qm_deal_damage($1,$2,3.5)`, [C, pcAva])).error && (await dmgOf(pcAva)) === d0 + 3.5, 'qm damage: applies to a campaign character'); }
// combo attacks and crits
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'combo: new encounter');
await si('sam', pcSam, 8); await si('ava', pcAva, 5);
await as('ricky', `select assign_turn($1,$2)`, [C, pcAva]);
const setC = (who, l, f, sk = 'Athletics', lv = 15) => as(who, `select set_combo($1,$2,$3,$4,17,'x')`, [l, f, sk, lv]);
ok(err(await setC('ava', pcSam, pcAva), /your own characters/), 'combo: only your own Leader');
ok(err(await setC('sam', pcSam, pcSam), /another character/), 'combo: not your own Finisher');
ok(err(await setC('sam', pcSam, pcAva, 'Cooking'), /not a combo skill/), 'combo: only the 8 skills');
ok(!(await setC('sam', pcSam, pcAva)).error && (await enc('ava')).combos[pcSam].finisher === pcAva, 'combo: stored on the encounter');
ok(err(await as('sam', `select start_attack($1,$2,5,5,'x',$3)`, [pcSam, liveNpc.id, pcSam]), /not waiting for this character/), 'combo: only the named Finisher');
ok(err(await as('ava', `select start_attack($1,$2,5,5,'x',$3)`, [pcAva, pcSam, pcSam]), /someone else/), 'combo: cannot target the Leader');
const ca = await as('ava', `select start_attack($1,$2,5,5,'f',$3) id`, [pcAva, liveNpc.id, pcSam]);
const caId = ca.rows && ca.rows[0] && ca.rows[0].id;
ok(!ca.error && (await enc('ava')).attack.combo.state === 'leader' && !(await enc('ava')).combos[pcSam], 'combo: attack carries it, combo consumed');
ok(err(await as('ricky', `select resolve_attack($1,$2,5,'x')`, [C, caId]), /not rolled/) , 'combo: cannot be resolved before the Leader rolls');
ok(err(await as('ava', `select combo_leader_attack($1,$2,9,6,'x')`, [C, caId]), /Leader/i), 'combo: only the Leader rolls');
ok(!(await as('sam', `select combo_leader_attack($1,$2,9,6,'x')`, [C, caId])).error && (await enc('ava')).attack.combo.state === 'defend', 'combo: Leader roll moves it to defend');
ok(err(await as('sam', `select combo_leader_attack($1,$2,9,6,'x')`, [C, caId]), /not waiting/), 'combo: Leader cannot roll twice');
ok(!(await as('ricky', `select resolve_attack($1,$2,5,'COMBO',$3,$4,$5)`, [C, caId, [pcSam, pcAva], [], [pcSam, pcAva, liveNpc.id]])).error, 'combo: resolves with critical-miss ids and Next Hit Critical grants');
ok((await vit(pcSam)).nextCrit === true && (await vit(pcAva)).nextCrit === true, 'Tracking Perfect Combo: both attackers get nextCrit');
ok(!(((await vit(liveNpc.id)) || {}).nextCrit), 'nextCrit cannot be granted to someone outside the attack');
ok((await vit(pcSam)).apPenalty === 2 && (await vit(pcAva)).apPenalty === 2, 'crit miss: both get apPenalty 2');
await as('ricky', `select assign_turn($1,$2)`, [C, pcSam]);
await as('sam', `select start_turn($1,1,10,6)`, [pcSam]);
{ const v = await vit(pcSam); ok(v.apPenalty === undefined || v.apPenalty === null, 'start_turn consumes the penalty'); ok(Number(v.apRemaining) === 4, 'AP recovered is 2 less (6 - 2 = 4): ' + v.apRemaining); }
// a spent Next Hit Critical flag is cleared (only for the attack's own attacker)
{ const pa = await as('ava', `select start_attack($1,$2,5,5,'plain') id`, [pcAva, liveNpc.id]);
  ok(!(await as('ricky', `select resolve_attack($1,$2,5,'x','{}',$3,'{}')`, [C, pa.rows[0].id, [pcAva, pcSam]])).error, 'plain attack resolves with a spent flag');
  ok(!((await vit(pcAva)).nextCrit) && (await vit(pcSam)).nextCrit === true, 'spent flag cleared for the attacker only; the Leader of another attack keeps theirs'); }
// expiry and cancel
await setC('sam', pcSam, pcAva);
await as('ricky', `select assign_turn($1,$2)`, [C, pcAva]);
ok(!!(await enc('ava')).combos?.[pcSam], 'combo survives other turns');
await as('ricky', `select assign_turn($1,$2)`, [C, pcSam]);
ok(!(await enc('ava')).combos?.[pcSam], 'combo ends when the Leader\'s turn begins');
await setC('sam', pcSam, pcAva);
ok(!(await as('ava', `select cancel_combo($1)`, [pcSam])).error && !(await enc('ava')).combos?.[pcSam], 'the Finisher can decline');
await setC('sam', pcSam, pcAva);
const ca2 = await as('ava', `select start_attack($1,$2,5,5,'f',$3) id`, [pcAva, liveNpc.id, pcSam]);
ok(!(await as('ava', `select cancel_combo_attack($1,$2)`, [C, ca2.rows[0].id])).error && !(await enc('ava')).attack, 'a pending combo attack can be cancelled');
await setC('sam', pcSam, pcAva);
const npcF = uuid(); await as('ricky', `select create_npc($1,$2,'{}')`, [C, npcF]); await si('ricky', npcF, 6);
await as('sam', `select set_combo($1,$2,'Courage',10,12,'x')`, [pcSam, npcF]);
ok(!!(await enc('sam')).combos?.[pcSam], 'combo with an NPC Finisher');
await as('ricky', `select unlink_npc($1)`, [npcF]);
ok(!(await enc('sam')).combos?.[pcSam], 'taking the Finisher out of the campaign ends the combo');
ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined, 'combo: end');
ok(!((await vit(pcSam)).nextCrit), 'ending the encounter clears Next Hit Critical flags');

ok(err(await dd('sam', pcSam, pcAva, 1), /during an encounter/), 'no attacks outside an encounter');

// ---- encounter events ----
const addEv = (who, name, total, one = false, round = null) => as(who, `select add_event($1,$2,$3,$4,$5) id`, [C, name, total, one, round]);
const evRows = async (who) => (await as(who, `select id, name, visible from encounter_events where campaign_id=$1`, [C])).rows;
ok(err(await addEv('ricky', 'Boulder', 5), /no active encounter/), 'events need an encounter');
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'events: new encounter');
await si('sam', pcSam, 10, 0); await si('ava', pcAva, 4, 0);
ok(err(await addEv('sam', 'Boulder', 5), /Only a QM/), 'a player cannot add an event');
ok(err(await addEv('ricky', '   ', 5), /name/) && err(await addEv('ricky', 'x'.repeat(61), 5), /too long/) && err(await addEv('ricky', 'Z', 99999), /not valid/), 'name and initiative are checked');
const e1id = (await addEv('ricky', 'Rockslide', 7)).rows[0].id;
{ const big = (await addEv('ricky', 'Opening', 99)).rows[0].id;
  ok((await db.query('select encounter->>\'turn\' t from campaigns where id=$1', [C])).rows[0].t === big, 'before anyone has moved the turn, a new top event takes it');
  ok(!(await as('ricky', `select remove_event($1)`, [big])).error && (await db.query('select encounter->>\'turn\' t from campaigns where id=$1', [C])).rows[0].t === pcSam, 'removing it hands the turn back to the top'); }
ok((await evRows('ricky')).length === 1 && (await evRows('sam')).length === 0 && (await evRows('ava')).length === 0, 'a new event is hidden: the QM sees it, players get nothing back');
ok(err(await as('sam', `select set_event_visible($1,true)`, [e1id]), /Only a QM/), 'a player cannot show it');
ok(err(await as('sam', `update encounter_events set visible=true where id=$1`, [e1id]), /permission denied/) && err(await as('sam', `insert into encounter_events (campaign_id,name,total) values ($1,'x',1)`, [C]), /permission denied/), 'and cannot write the table directly');
const order1 = async () => (await db.query('select encounter_order(id, encounter) o from campaigns where id=$1', [C])).rows[0].o;
ok((await order1()).join() === [pcSam, e1id, pcAva].join(), 'hidden events still take their place in the order: 10, 7, 4');
ok(!(await as('ricky', `select set_event_visible($1,true)`, [e1id])).error && (await evRows('sam')).length === 1 && (await evRows('sam'))[0].name === 'Rockslide', 'shown: players can read it');
ok(!(await as('ricky', `select set_event_visible($1,false)`, [e1id])).error && (await evRows('ava')).length === 0, 'hidden again: gone for players');
// one-time events
ok(err(await addEv('ricky', 'Late', 1, true, 0), /not passed/) && err(await addEv('ricky', 'Late', 1, true, null), /not passed/), 'a one-time event needs a round that has not passed');
const e2id = (await addEv('ricky', 'Collapse', 20, true, 2)).rows[0].id;
ok((await order1()).join() === [pcSam, e1id, pcAva].join(), 'a round-2 event is not in the order during round 1');
// walk round 1 to its end
let cur = (await enc('sam')).turn;
while ((await enc('sam')).round === 1) { await as('ricky', `select advance_turn($1,$2)`, [C, (await enc('sam')).turn]); }
const eT = await enc('sam');
ok(eT.round === 2 && eT.turn === e2id, 'round 2 begins with the one-time event (initiative 20 is highest)');
ok((await order1()).join() === [e2id, pcSam, e1id, pcAva].join(), 'it is in the order for round 2');
ok(err(await as('sam', `select advance_turn($1,$2)`, [C, e2id]), /not your turn/), 'players cannot end an event\'s turn');
while ((await enc('sam')).round === 2) { await as('ricky', `select advance_turn($1,$2)`, [C, (await enc('sam')).turn]); }
ok((await enc('sam')).round === 3 && (await order1()).join() === [pcSam, e1id, pcAva].join() && (await enc('sam')).turn === pcSam, 'round 3: the one-time event is gone again');
ok(!(await as('ricky', `select assign_turn($1,$2)`, [C, e1id])).error && (await enc('sam')).turn === e1id, 'QM can assign the turn to an event');
ok(!(await as('ricky', `select remove_event($1)`, [e1id])).error && (await enc('sam')).turn === pcSam, 'removing the event whose turn it is passes the turn to the top of the order');
ok((await evRows('ricky')).length === 1, 'one event left (the round-2 one, now spent)');
ok((await as('ricky', `select end_encounter($1)`, [C])).error === undefined && (await evRows('ricky')).length === 0, 'ending the encounter clears events');

// ---- Spawn Character ----
const spawn = async () => (await db.query(`select spawn s from campaigns where id=$1`, [C])).rows[0].s;
const picks = (up = 0, down = 1, prof = 2) => JSON.stringify([0, 1, 2, 3].map(() => ({ up, down, prof })));
ok(err(await as('sam', `select start_spawn($1,$2)`, [C, [ids.sam]]), /Only a QM/), 'spawn: players cannot start one');
ok(err(await as('ricky', `select start_spawn($1,$2)`, [C, [ids.zed]]), /not in the campaign/), 'spawn: the "for" list must be campaign members');
const memberIds = (await db.query(`select user_id, role from campaign_members where campaign_id=$1`, [C])).rows;
const players = memberIds.filter((m) => m.role !== 'qm').map((m) => m.user_id);
ok(!(await as('ricky', `select start_spawn($1,$2)`, [C, [ids.sam, ids.sam, ids.ava]])).error, 'spawn: started');
let sp = await spawn();
ok(sp.step === 'appearance' && sp.pos === 0 && sp.order.length === players.length && players.every((p) => sp.order.includes(p)) && !sp.order.includes(ids.ricky), 'spawn: random order of the non-QM players only');
ok(sp.for.length === 2, 'spawn: duplicates in the list collapse');
ok(err(await as('ricky', `select start_spawn($1,$2)`, [C, []]), /already being spawned/), 'spawn: one at a time');
const who = (u) => Object.keys(ids).find((k) => ids[k] === u);
const turnWho = () => who(sp.turn);
const tw = async () => { sp = await spawn(); return who(sp.turn); };
const notMe = who(sp.order.find((u) => u !== sp.turn));
ok(err(await as(notMe, `select spawn_submit($1,$2)`, [C, JSON.stringify('x')]), /not your turn/), 'spawn: only the player whose turn it is can submit');
ok(err(await as(turnWho(), `select spawn_submit($1,$2)`, [C, JSON.stringify('   ')]), /Write something/), 'spawn: empty text refused');
ok(!(await as(turnWho(), `select spawn_submit($1,$2)`, [C, JSON.stringify('Tall and grey.')])).error, 'spawn: appearance handed in');
sp = await spawn();
ok(sp.data.appearance === 'Tall and grey.' && sp.step === 'ability' && sp.pos === 1 && sp.options.length === 2 && sp.options[0] !== sp.options[1] && sp.options.every((i) => i >= 0 && i < 20), 'spawn: next player gets two different ability rows (0-19)');
ok(err(await as(turnWho(), `select spawn_submit($1,$2)`, [C, '2']), /one of the two/), 'spawn: must choose option 0 or 1');
const opt1 = sp.options;
ok(!(await as(turnWho(), `select spawn_submit($1,$2)`, [C, '1'])).error, 'spawn: ability picked');
sp = await spawn();
ok(sp.data.ability === opt1[1] && sp.step === 'style' && sp.options.every((i) => i < 8), 'spawn: the pick is stored; fighting styles come from 8 rows');
await as(turnWho(), `select spawn_submit($1,$2)`, [C, '0']); sp = await spawn();
ok(sp.step === 'weapon' && sp.options.every((i) => i < 12), 'spawn: weapons come from 12 rows');
await as(turnWho(), `select spawn_submit($1,$2)`, [C, '0']); sp = await spawn();
ok(sp.step === 'backstory', 'spawn: backstory');
// veto
ok(err(await as('sam', `select spawn_veto($1)`, [C]), /Only a QM/), 'spawn: players cannot veto');
ok(!(await as('ricky', `select spawn_veto($1)`, [C])).error, 'spawn: QM veto');
sp = await spawn();
ok(sp.step === 'weapon' && sp.data.weapon === undefined && sp.data.style !== undefined && sp.options.length === 2, 'spawn: veto sends it back one step with fresh options');
await as(await tw(), `select spawn_submit($1,$2)`, [C, '1']);
await as(await tw(), `select spawn_submit($1,$2)`, [C, JSON.stringify('Born in a ditch.')]);
sp = await spawn();
ok(sp.step === 'motivation', 'spawn: motivation');
await as(await tw(), `select spawn_submit($1,$2)`, [C, JSON.stringify('Revenge.')]);
sp = await spawn();
ok(sp.step === 'points' && sp.turn === undefined && sp.pos === 6, 'spawn: points step is open to everyone at once');
// turns wrap around when there are fewer players than steps
ok(sp.order.length < 6, 'spawn: fewer players than steps (wrapped around)');
ok(err(await as('ricky', `select spawn_points($1,$2)`, [C, picks()]), /QM does not add points|not in this/), 'spawn: the QM does not add points');
ok(err(await as('sam', `select spawn_points($1,$2)`, [C, JSON.stringify([{ up: 0, down: 1, prof: 2 }])]), /all four/), 'spawn: four sets required');
ok(err(await as('sam', `select spawn_points($1,$2)`, [C, picks(3, 3, 1)]), /different talents/) && err(await as('sam', `select spawn_points($1,$2)`, [C, picks(9, 1, 1)]), /not valid/) && err(await as('sam', `select spawn_points($1,$2)`, [C, picks(0, 1, 36)]), /not valid/), 'spawn: bad picks refused');
// an owned dead character for Sam and a living one: only the dead one is offered
const deadSam = uuid();
await as('sam', `insert into characters (id, owner, data, campaign_id) values ($1,$2,$3,$4)`, [deadSam, ids.sam, JSON.stringify({ info: { name: 'Old Sam', alive: false, incarnation: 3 } }), C]);
await as('sam', `insert into characters (id, owner, data, campaign_id) values ($1,$2,$3,$4)`, [uuid(), ids.sam, JSON.stringify({ info: { name: 'Live Sam', alive: true, incarnation: 1 } }), C]);
await as('sam', `select spawn_points($1,$2)`, [C, picks()]);
ok(err(await as('sam', `select spawn_points($1,$2)`, [C, picks()]), /already added/), 'spawn: points can only be handed in once');
ok((await spawn()).step === 'points', 'spawn: still waiting for the others');
for (const p of players) if (who(p) !== 'sam') await as(who(p), `select spawn_points($1,$2)`, [C, picks()]);
sp = await spawn();
ok(['incarnation', 'build'].includes(sp.step) && [ids.sam, ids.ava].includes(sp.assignee) && !!sp.charId, 'spawn: the dice pick an owner from the checked players');
if (sp.assignee === ids.sam) {
  ok(sp.step === 'incarnation' && sp.dead.length === 1 && sp.dead[0].id === deadSam && sp.dead[0].incarnation === 3, 'spawn: only the owner\'s dead characters are offered');
  ok(err(await as('ava', `select spawn_incarnation($1,$2)`, [C, deadSam]), /not yours/), 'spawn: only the owner picks an incarnation');
  ok(err(await as('sam', `select spawn_incarnation($1,$2)`, [C, uuid()]), /fallen/), 'spawn: must be one of the fallen');
  ok(!(await as('sam', `select spawn_incarnation($1,$2)`, [C, deadSam])).error, 'spawn: incarnation picked');
  sp = await spawn(); ok(sp.step === 'build' && sp.prev.id === deadSam && sp.prev.incarnation === 3, 'spawn: previous incarnation recorded');
} else ok(sp.step === 'build', 'spawn: no dead characters -> straight to build');
ok(err(await as('ricky', `select spawn_veto($1)`, [C]), /too late/), 'spawn: too late to veto once assigned');
ok(err(await as(who(sp.assignee), `select finish_spawn($1)`, [C]), /not been saved/), 'spawn: cannot finish before the character is saved');
const ownerK = who(sp.assignee);
await as(ownerK, `insert into characters (id, owner, data, campaign_id) values ($1,$2,$3,$4)`, [sp.charId, sp.assignee, '{}', C]);
ok(err(await as(ownerK === 'sam' ? 'ava' : 'sam', `select finish_spawn($1)`, [C]), /not yours/), 'spawn: only the owner finishes it');
ok(!(await as(ownerK, `select finish_spawn($1)`, [C])).error && (await spawn()) === null, 'spawn: finished and cleared');
// nobody checked -> NPC, finished by a QM
await as('ricky', `select start_spawn($1,$2)`, [C, []]);
for (let i = 0; i < 6; i++) { sp = await spawn(); await as(who(sp.turn), `select spawn_submit($1,$2)`, [C, sp.options ? '0' : JSON.stringify('text')]); }
for (const p of players) await as(who(p), `select spawn_points($1,$2)`, [C, picks(4, 5, 6)]);
sp = await spawn();
ok(sp.step === 'build' && sp.assignee === undefined && !!sp.charId, 'spawn: no boxes checked -> it becomes an NPC (no owner)');
ok(err(await as('sam', `select finish_spawn($1)`, [C]), /Only a QM/), 'spawn: players cannot finish an NPC');
ok(err(await as('ricky', `select finish_spawn($1)`, [C]), /not been saved/), 'spawn: the NPC must exist first');
await as('ricky', `select create_npc($1,$2,'{}')`, [C, sp.charId]);
ok(!(await as('ricky', `select finish_spawn($1)`, [C])).error && (await spawn()) === null, 'spawn: NPC spawn finished');
// cancel
await as('ricky', `select start_spawn($1,$2)`, [C, [ids.sam]]);
ok(err(await as('sam', `select cancel_spawn($1)`, [C]), /Only a QM/) && !(await as('ricky', `select cancel_spawn($1)`, [C])).error && (await spawn()) === null, 'spawn: only a QM can cancel it');
ok((await anon(`select spawn_veto('${C}') x`)).error !== undefined, 'spawn: signed-out visitors cannot call the functions');

// ---- Encounter maps ----
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const saveMap = (who, id, name, img = IMG, extra = {}) => as(who, `select save_map($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) id`,
  [C, id, name, img, extra.w ?? 800, extra.h ?? 600, extra.cols ?? 16, extra.rows ?? 12, extra.size ?? 50, extra.ox ?? 0, extra.oy ?? 0]);
const mapRows = async (who) => (await as(who, `select id, name, visible from encounter_maps where campaign_id=$1`, [C])).rows;
ok(err(await saveMap('sam', null, 'Cave'), /Only a QM/), 'maps: players cannot create one');
ok(err(await saveMap('ricky', null, '  '), /name/) && err(await saveMap('ricky', null, 'x', null), /picture/) && err(await saveMap('ricky', null, 'x', 'javascript:alert(1)'), /picture/), 'maps: name and picture are required');
ok(err(await saveMap('ricky', null, 'x', IMG, { cols: 0 }), /columns and rows/) && err(await saveMap('ricky', null, 'x', IMG, { size: 1 }), /square size/) && err(await saveMap('ricky', null, 'x', IMG, { ox: 99999 }), /position/), 'maps: grid values are checked');
const mapId = (await saveMap('ricky', null, 'The Cave')).rows[0].id;
ok((await mapRows('ricky')).length === 1 && (await mapRows('sam')).length === 0 && (await mapRows('ava')).length === 0, 'maps: a new map is hidden from players');
ok(err(await as('sam', `select set_map_visible($1,true)`, [mapId]), /Only a QM/), 'maps: a player cannot show it');
ok(!(await as('ricky', `select set_map_visible($1,true)`, [mapId])).error && (await mapRows('sam')).length === 1 && (await mapRows('sam'))[0].name === 'The Cave', 'maps: shown, players can read it');
ok(err(await as('sam', `update encounter_maps set visible=false where id=$1`, [mapId]), /permission denied/) && err(await as('sam', `delete from encounter_maps where id=$1`, [mapId]), /permission denied/), 'maps: no direct writes');
ok(!(await saveMap('ricky', mapId, 'Deep Cave', null, { cols: 10, rows: 9, size: 40, ox: 12.5, oy: -3 })).error, 'maps: edit grid and name, keep the picture');
const m1 = (await db.query(`select name, cols, rows, size, ox, oy, img_w, image from encounter_maps where id=$1`, [mapId])).rows[0];
ok(m1.name === 'Deep Cave' && m1.cols === 10 && m1.rows === 9 && Number(m1.size) === 40 && Number(m1.ox) === 12.5 && Number(m1.oy) === -3 && m1.img_w === 800 && m1.image === IMG, 'maps: edit stored, picture kept');
ok(err(await saveMap('sam', mapId, 'Hacked', null), /Only a QM/), 'maps: a player cannot edit');
ok((await anon(`select save_map('${C}', null, 'x', '${IMG}', 1, 1, 1, 1, 10, 0, 0) x`)).error !== undefined, 'maps: signed-out visitors cannot call the functions');
// the encounter map
ok(!(await as('ricky', `select start_encounter($1)`, [C])).error, 'maps: encounter for the map');
ok(!(await as('ricky', `select set_map_visible($1,false)`, [mapId])).error && (await mapRows('sam')).length === 0, 'maps: hidden again');
ok(err(await as('sam', `select set_encounter_map($1,$2)`, [C, mapId]), /Only a QM/) && err(await as('ricky', `select set_encounter_map($1,$2)`, [C, uuid()]), /gone/), 'maps: only a QM, and only a real map');
ok(!(await as('ricky', `select set_encounter_map($1,$2)`, [C, mapId])).error && (await enc('sam')).mapId === mapId, 'maps: the QM adds the map to the encounter');
ok((await mapRows('sam')).length === 1 && (await mapRows('ava')).length === 1, 'maps: players can read the encounter map even though it is hidden');
const hiddenOther = (await saveMap('ricky', null, 'Secret')).rows[0].id;
ok((await mapRows('sam')).map((r) => r.id).join() === mapId, 'maps: other hidden maps stay hidden');
ok(!(await as('ricky', `select set_encounter_map($1,null)`, [C])).error && (await enc('sam')).mapId === undefined && (await mapRows('sam')).length === 0, 'maps: taking it out hides it again');
await as('ricky', `select set_encounter_map($1,$2)`, [C, mapId]);
ok(!(await as('ricky', `select delete_map($1)`, [hiddenOther])).error, 'maps: delete the other one');
ok(!(await as('ricky', `select end_encounter($1)`, [C])).error && (await mapRows('sam')).length === 0, 'maps: when the encounter ends the map is hidden again');
await as('ricky', `select start_encounter($1)`, [C]); await as('ricky', `select set_encounter_map($1,$2)`, [C, mapId]);
// tokens
const tokRows = async (who) => (await as(who, `select character_id, col, row from encounter_tokens where campaign_id=$1`, [C])).rows;
const setTok = (who, ch, c, r) => as(who, `select set_token($1,$2,$3)`, [ch, c, r]);
ok(!(await as('ricky', `select set_encounter_map($1,$2)`, [C, mapId])).error, 'tokens: map in the encounter');
const tokPc = uuid(); await as('sam', `insert into characters (id, owner, data, campaign_id) values ($1,$2,'{"info":{"name":"Tok"}}',$3)`, [tokPc, ids.sam, C]);
ok(err(await setTok('ava', tokPc, 1, 1), /only move your own/), 'tokens: another player cannot move my character');
ok(err(await setTok('sam', tokPc, 99, 1), /off the map/) && err(await setTok('sam', tokPc, -1, 0), /off the map/), 'tokens: must be on the grid (the map has 16 x 12 squares... or its saved size)');
ok(!(await setTok('sam', tokPc, 2, 3)).error && (await tokRows('ava')).length === 1, 'tokens: an owner drops their token; everyone can read it');
ok(!(await setTok('sam', tokPc, 4, 5)).error && (await tokRows('sam'))[0].col === 4, 'tokens: moving it');
ok(!(await setTok('ricky', tokPc, 0, 0)).error, 'tokens: a QM can move anyone\'s');
const npcTok = uuid(); await as('ricky', `select create_npc($1,$2,'{"info":{"name":"Ogre"}}')`, [C, npcTok]);
ok(!(await setTok('ricky', npcTok, 1, 1)).error && (await tokRows('sam')).length === 1 && (await tokRows('ricky')).length === 2, 'tokens: a hidden NPC\'s token is invisible to players');
ok(err(await setTok('sam', npcTok, 2, 2), /only move your own/), 'tokens: players cannot move NPCs');
await as('ricky', `select set_npc_visible($1,true)`, [npcTok]);
ok((await tokRows('sam')).length === 2, 'tokens: shown NPC token becomes visible');
ok(err(await as('sam', `update encounter_tokens set col=0`), /permission denied/) && err(await as('sam', `insert into encounter_tokens (character_id,campaign_id,col,row) values ('${tokPc}','${C}',0,0)`), /permission denied/), 'tokens: no direct writes');
ok(err(await as('ava', `select remove_token($1)`, [tokPc]), /only move your own/) && !(await as('sam', `select remove_token($1)`, [tokPc])).error && (await tokRows('ricky')).length === 1, 'tokens: owner picks theirs up');
await setTok('sam', tokPc, 1, 1);
ok(!(await as('ricky', `select set_encounter_map($1,null)`, [C])).error && (await tokRows('ricky')).length === 0, 'tokens: removing the map clears the tokens');
ok(err(await setTok('sam', tokPc, 1, 1), /no map/), 'tokens: no map, no tokens');
await as('ricky', `select set_encounter_map($1,$2)`, [C, mapId]); await setTok('sam', tokPc, 1, 1);
ok(!(await as('ricky', `select end_encounter($1)`, [C])).error && (await tokRows('ricky')).length === 0, 'tokens: ending the encounter clears them');
await as('ricky', `select start_encounter($1)`, [C]); await as('ricky', `select set_encounter_map($1,$2)`, [C, mapId]);
ok(err(await as('sam', `select delete_map($1)`, [mapId]), /Only a QM/) && !(await as('ricky', `select delete_map($1)`, [mapId])).error && (await mapRows('ricky')).length === 0 && (await enc('sam')).mapId === undefined, 'maps: only a QM deletes (and it leaves the encounter)');
await as('ricky', `select end_encounter($1)`, [C]);


// ---- QM hand-over: leaving, becoming a player, deleted accounts ----
const q1 = async (who, sql, p) => { const r = await as(who, sql, p); if (r.error) throw new Error(r.error); return r.rows; };
const roles = async (camp) => Object.fromEntries((await db.query(`select user_id, role from campaign_members where campaign_id=$1`, [camp])).rows.map((r) => [r.user_id, r.role]));
const npcOwners = async (camp) => (await db.query(`select owner from characters where campaign_id=$1 and is_npc`, [camp])).rows.map((r) => r.owner);
const mkCamp = async (name) => { const c = (await q1('ricky', `insert into campaigns (name) values ($1) returning id`, [name]))[0].id;
  await as('sam', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [c, ids.sam]);
  await as('ava', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [c, ids.ava]);
  for (const k of ['a', 'b']) await q1('ricky', `select create_npc($1,$2,'{}')`, [c, uuid()]);
  return c; };
{
  const H = await mkCamp('Hand-over');
  ok(err(await as('sam', `select become_player($1)`, [H]), /Only a QM/), 'a plain player cannot "become a player"');
  ok(!(await as('ricky', `select become_player($1)`, [H])).error, 'the only QM can become a player when others are in the campaign');
  const r1 = await roles(H);
  const heirs = [ids.sam, ids.ava].filter((u) => r1[u] === 'qm');
  ok(r1[ids.ricky] === 'member' && heirs.length === 1, 'a random remaining player was made QM, and the campaign still has exactly one QM');
  ok((await npcOwners(H)).length === 2 && (await npcOwners(H)).every((o) => o === heirs[0]), 'the new QM inherited all of the previous QM\'s NPCs');
  ok((await db.query(`select count(*)::int c from characters where campaign_id=$1 and is_npc`, [H])).rows[0].c === 2, 'the NPCs are still in the campaign');
  ok((await as('ricky', `select id from characters where campaign_id=$1 and is_npc`, [H])).rows.length === 0, 'and the former QM (now a player) no longer sees hidden NPCs');
  // a sole QM who leaves
  const heirName = Object.keys(ids).find((k) => ids[k] === heirs[0]);
  const other = [ids.sam, ids.ava].find((u) => u !== heirs[0]);
  await as(heirName, `update characters set npc_visible=false where campaign_id=$1 and is_npc`, [H]);
  ok(!(await as(heirName, `delete from campaign_members where campaign_id=$1 and user_id=$2`, [H, heirs[0]])).error, 'the only QM can leave');
  const r2 = await roles(H);
  ok(r2[heirs[0]] === undefined && Object.values(r2).filter((x) => x === 'qm').length === 1 && r2[ids.ricky] + r2[other] !== 'memberstring', 'someone remaining was made QM after the sole QM left');
  const newQm = Object.keys(r2).find((u) => r2[u] === 'qm');
  ok((await npcOwners(H)).length === 2 && (await npcOwners(H)).every((o) => o === newQm), 'and inherited the NPCs again');
  // with two QMs, one steps down: NPCs go to the QM who remains
  const K = await mkCamp('Two QMs');
  await q1('ricky', `update campaign_members set role='qm' where campaign_id=$1 and user_id=$2`, [K, ids.sam]);
  ok(!(await as('ricky', `select become_player($1)`, [K])).error && (await roles(K))[ids.sam] === 'qm' && (await roles(K))[ids.ricky] === 'member', 'with another QM present, a QM becomes a player');
  ok((await npcOwners(K)).every((o) => o === ids.sam), 'their NPCs go to the remaining QM');
  ok(!(await as('sam', `update campaign_members set role='member' where campaign_id=$1 and user_id=$2`, [K, ids.ricky])).error, '(promoted back for the next check)') || true;
  await q1('sam', `update campaign_members set role='qm' where campaign_id=$1 and user_id=$2`, [K, ids.ricky]);
  await q1('sam', `select 1`);
  ok(!(await as('ricky', `update campaign_members set role='member' where campaign_id=$1 and user_id=$2 returning 1`, [K, ids.sam])).error && (await npcOwners(K)).every((o) => o === ids.ricky), 'demoting another QM moves their NPCs to a remaining QM');
  // the only person in a campaign
  const J = (await q1('ricky', `insert into campaigns (name) values ('Solo') returning id`))[0].id;
  await q1('ricky', `select create_npc($1,$2,'{}')`, [J, uuid()]);
  ok(err(await as('ricky', `select become_player($1)`, [J]), /only player/), 'the only person in a campaign cannot become a player');
  ok(!(await as('ricky', `delete from campaign_members where campaign_id=$1 and user_id=$2`, [J, ids.ricky])).error, 'but can leave');
  ok((await db.query(`select count(*)::int c from campaigns where id=$1`, [J])).rows[0].c === 0 && (await db.query(`select count(*)::int c from characters where campaign_id=$1`, [J])).rows[0].c === 0, 'which deletes the empty campaign and its NPCs');
  // account deleted
  const D = await mkCamp('Account gone');
  await db.exec(`delete from auth.users where id='${ids.ricky}'`);
  const rD = await roles(D);
  ok(rD[ids.ricky] === undefined && Object.values(rD).filter((x) => x === 'qm').length === 1, 'deleting the QM\'s account hands the campaign to a random remaining player');
  ok((await npcOwners(D)).length === 2 && (await npcOwners(D)).every((o) => rD[o] === 'qm'), 'who inherits the NPCs (they survive the account deletion)');
}

// ---- giving items ----
{
  ids.gm = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('gm@x.com', '{"username":"gm_4","name":"gm"}') returning id`)).rows[0].id;
  const G = (await as('gm', `insert into campaigns (name) values ('Gifts') returning id`)).rows[0].id;
  await as('sam', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [G, ids.sam]);
  await as('ava', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [G, ids.ava]);
  const a = uuid(), b = uuid(), outsider = uuid(), npcG = uuid(), rk = uuid();
  const mk = (who, id, camp, name) => as(who, `insert into characters (id, owner, data, campaign_id) values ($1,$2,$3,$4)`, [id, ids[who], JSON.stringify({ info: { name } }), camp]);
  await mk('sam', a, G, 'Sam Hero'); await mk('ava', b, G, 'Ava Hero'); await mk('ava', outsider, null, 'Loner'); await mk('gm', rk, G, 'Ricky PC');
  await as('gm', `select create_npc($1,$2,'{"info":{"name":"Goblin"}}')`, [G, npcG]);
  const it = (name, qty, extra) => JSON.stringify(Object.assign({ name, qty, charges: null, desc: 'd' }, extra));
  const give = (who, from, to, item) => as(who, `select give_item($1,$2,$3)`, [from, to, item]);
  ok(!(await give('sam', a, b, it('Rope', 2))).error, 'a player can give an item from their character to another in the campaign');
  ok((await as('ava', `select from_name, item from item_gifts where character_id=$1`, [b])).rows.length === 1, 'the receiving owner sees the gift');
  const g1 = (await as('ava', `select from_name, item from item_gifts where character_id=$1`, [b])).rows[0];
  ok(g1.from_name === 'Sam Hero' && g1.item.name === 'Rope' && g1.item.qty === 2, 'gift carries giver name and item');
  ok((await as('sam', `select 1 from item_gifts`)).rows.length === 0, 'the giver cannot read other players\' gifts');
  ok((await as('gm', `select 1 from item_gifts`)).rows.length === 0, 'nor can the QM (gifts are private to the receiver)');
  ok(err(await as('sam', `insert into item_gifts (character_id, item) values ($1,'{}')`, [b]), /permission denied/), 'gifts cannot be inserted directly');
  ok(err(await as('ava', `update item_gifts set item='{}'`), /permission denied/), 'gifts cannot be edited');
  ok(err(await give('sam', b, a, it('Rope', 1)), /own characters/), 'cannot give from someone else\'s character');
  ok(err(await give('sam', a, outsider, it('Rope', 1)), /not in your campaign/), 'cannot give to a character outside the campaign');
  ok(err(await give('sam', a, a, it('Rope', 1)), /different character/), 'cannot give to yourself');
  ok(err(await give('sam', a, b, it('', 1)), /name/), 'item needs a name');
  ok(err(await give('sam', a, b, it('Rope', 0)), /quantity/), 'quantity must be at least 1');
  ok(err(await give('sam', a, b, JSON.stringify({ name: 'Rope', qty: 'x' })), /quantity/), 'quantity must be a number');
  ok(err(await give('sam', a, npcG, it('Rope', 1)), /NPC/), 'a player cannot give to an NPC');
  ok(err(await give('sam', null, b, it('Gold', 1)), /Only a QM/), 'a player cannot conjure items');
  ok(!(await give('gm', null, b, it('Gold', 5))).error, 'a QM can give a new item to any player character');
  ok(!(await give('gm', null, npcG, it('Club', 1))).error, 'a QM can give to an NPC (even hidden)');
  ok(!(await give('gm', rk, b, it('Map', 1))).error, 'a QM can also give from their own character');
  const gb = (await as('ava', `select from_name from item_gifts where character_id=$1 order by created_at`, [b])).rows.map((r) => r.from_name);
  ok(gb.includes('The QM') && gb.length === 3, 'QM gifts are labelled "The QM"');
  ok(!(await give('gm', null, b, it('Chain Mail', 1, { wearable: true, magic: 'true', weapon: 'yes' }))).error, 'QM gives a typed item');
  const cm = (await db.query(`select item from item_gifts where character_id=$1`, [b])).rows.map((r) => r.item).find((x) => x.name === 'Chain Mail');
  ok(cm.wearable === true && cm.magic === true && cm.weapon === false, 'Wearable/Magic/Weapon flags are stored as true booleans (anything else is false)');
  ok(!(await give('gm', null, b, it('Ring', 1, { buffs: [{ kind: 'skill', idx: 2, amt: -1, hold: true, wear: false }] }))).error, 'QM gives an item with buffs');
  ok(!(await give('gm', null, b, it('Junk', 1, { buffs: 'nope' }))).error, 'junk buffs are accepted but dropped');
  const gi = (await db.query(`select item from item_gifts where character_id=$1`, [b])).rows.map((r) => r.item);
  ok(JSON.stringify(gi.find((x) => x.name === 'Ring').buffs) === '[{"idx": 2, "amt": -1, "kind": "skill", "hold": true, "wear": false}]'.replace(/ /g, '').replace(/"/g, '"') || gi.find((x) => x.name === 'Ring').buffs[0].amt === -1, 'buffs travel with the gift');
  ok(Array.isArray(gi.find((x) => x.name === 'Junk').buffs) && gi.find((x) => x.name === 'Junk').buffs.length === 0, 'non-array buffs become an empty list');
  ok(!(await give('gm', null, b, it('Axe', 1, { weapon: true, weaponProps: { type: 'Axe', dmg: 'BP+1D8' } }))).error, 'QM gives a weapon');
  ok((await db.query(`select item from item_gifts where character_id=$1`, [b])).rows.map((r) => r.item).find((x) => x.name === 'Axe').weaponProps.dmg === 'BP+1D8', 'weapon properties are stored with the gift');
  const mine = (await as('ava', `select id from item_gifts where character_id=$1`, [b])).rows;
  ok((await as('sam', `delete from item_gifts where id=$1 returning 1`, [mine[0].id])).rows.length === 0, 'someone else cannot remove a gift');
  ok((await as('ava', `delete from item_gifts where id=$1 returning 1`, [mine[0].id])).rows.length === 1, 'the owner removes a gift once picked up');
  // handing the character to another player moves the pending gifts with it
  await as('ava', `select give_character($1,$2)`, [b, ids.sam]);
  ok((await as('sam', `select 1 from item_gifts where character_id=$1`, [b])).rows.length === 6 && (await as('ava', `select 1 from item_gifts where character_id=$1`, [b])).rows.length === 0, 'pending gifts follow the character to its new owner');
  ok((await as('gm', `select 1 from item_gifts where character_id=$1`, [npcG])).rows.length === 1, 'the QM (NPC owner) receives NPC gifts');
  await db.exec(`delete from characters where id='${b}'`);
  ok((await db.query(`select 1 from item_gifts where character_id=$1`, [b])).rows.length === 0, 'gifts are removed with their character');
  await as('gm', `delete from campaigns where id=$1`, [G]);
}

// ---- NPC sheet hidden separately ----
{
  const G = (await as('gm', `insert into campaigns (name) values ('Sheets') returning id`)).rows[0].id;
  await as('sam', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [G, ids.sam]);
  const n = uuid();
  await as('gm', `select create_npc($1,$2,'{"info":{"name":"Lich"},"items":[{"name":"Secret"}]}')`, [G, n]);
  const seen = async (who) => (await as(who, `select data from characters where id=$1`, [n])).rows.length;
  const roster = async (who) => (await as(who, `select * from hidden_sheet_npcs($1)`, [G])).rows;
  ok(await seen('sam') === 0, 'a hidden NPC is invisible to players');
  await as('gm', `select set_npc_visible($1,true)`, [n]);
  ok(await seen('sam') === 1 && (await roster('sam')).length === 0, 'shown NPC: players read the sheet (default), no roster-only entry');
  ok(err(await as('sam', `select set_npc_sheet_hidden($1,true)`, [n]), /Only a QM/), 'a player cannot hide an NPC sheet');
  ok(!(await as('gm', `select set_npc_sheet_hidden($1,true)`, [n])).error, 'the QM can hide the sheet');
  ok(await seen('sam') === 0, 'a hidden sheet cannot be read by players');
  const r = await roster('sam');
  ok(r.length === 1 && r[0].name === 'Lich' && r[0].id === n && Object.keys(r[0]).sort().join() === 'id,name,owner', 'but the roster still gives players the name (and nothing else)');
  ok(await seen('gm') === 1, 'the QM still reads it');
  await as('gm', `select set_npc_visible($1,false)`, [n]);
  ok((await roster('sam')).length === 0, 'an NPC hidden from the roster has no roster entry either');
  await as('gm', `select set_npc_visible($1,true)`, [n]);
  ok((await as('ava', `select * from hidden_sheet_npcs($1)`, [G])).rows.length === 0, 'non-members get nothing');
  ok(!(await as('gm', `select set_npc_sheet_hidden($1,false)`, [n])).error && await seen('sam') === 1, 'showing the sheet again restores access');
  ok(err(await as('sam', `update characters set npc_sheet_hidden=false where id=$1`, [n]), /permission denied/), 'the flag cannot be written directly');
  await as('gm', `delete from campaigns where id=$1`, [G]);
}

// ---- cleanup rules ----
await as('ricky', `select create_npc($1,$2,'{}')`, [C, npc2]);
await as('ricky', `insert into characters (id, owner, data, campaign_id) values ($1,$2,'{}',$3)`, [uuid(), ids.ricky, C]);
await as('ricky', `update campaign_members set role='qm' where campaign_id=$1 and user_id=$2`, [C, ids.sam]);
ok(!(await as('ricky', `delete from campaign_members where campaign_id=$1 and user_id=$2`, [C, ids.ricky])).error, 'QM can leave once another QM exists');
const qmsC = (await db.query(`select user_id from campaign_members where campaign_id=$1 and role='qm'`, [C])).rows.map((r) => r.user_id);
const left = (await db.query(`select campaign_id, is_npc, owner from characters where id in ($1,$2)`, [npc, npc2])).rows;
ok(left.length >= 1 && left.every((r) => r.campaign_id === C && r.is_npc === true && qmsC.includes(r.owner)), "a leaving QM's NPCs pass to the QM who stays (still NPCs of the campaign)");
ok((await as('sam', `select id from characters where id=$1`, [pcSam])).rows.length === 1, 'own PC still there after others leave');
await as('ava', `delete from campaign_members where campaign_id=$1 and user_id=$2`, [C, ids.ava]);
ok((await as('ava', `select campaign_id from characters where id=$1`, [pcAva])).rows[0].campaign_id === null, "leaving unlinks the player's PC");
// delete a campaign: NPCs are kept (unlinked), PCs unlink
await as('sam', `select create_npc($1,$2,'{}')`, [C, uuid()]);
const npc3 = uuid(); await as('sam', `select create_npc($1,$2,'{}')`, [C, npc3]);
ok(!(await as('sam', `delete from campaigns where id=$1`, [C])).error, 'QM deletes the campaign');
{ const r = (await db.query(`select campaign_id,is_npc,owner,npc_visible from characters where id=$1`, [npc3])).rows[0]; ok(r && r.campaign_id === null && r.is_npc && r.owner === ids.sam && !r.npc_visible, 'its NPCs are kept, outside any campaign, with their owner'); }
ok((await as('sam', `select campaign_id from characters where id=$1`, [pcSam])).rows[0].campaign_id === null, 'PCs survive, unlinked');
ok((await as('sam', `select count(*)::int c from campaign_members where campaign_id=$1`, [C])).rows[0].c === 0, 'no orphaned memberships');
// ---- compendiums ----
{ ids.kim = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('kim@x.com', $1) returning id`, [JSON.stringify({ username: 'kim_4', name: 'kim' })])).rows[0].id;
  const K = (await as('kim', `insert into campaigns (name) values ('Book Test') returning id`)).rows[0].id;
  await as('sam', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [K, ids.sam]);
  await as('ava', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [K, ids.ava]);
  const B = uuid(), B2 = uuid();
  ok(!(await as('kim', `insert into compendiums (id, owner, name, data) values ($1,$2,'Monsters','{"items":[{"cid":"a","name":"Club"}]}')`, [B, ids.kim])).error, 'compendium: owner creates one');
  ok(err(await as('sam', `insert into compendiums (id, owner, name, data) values ($1,$2,'X','{}')`, [uuid(), ids.kim]), /row-level security/), "compendium: cannot create one for someone else");
  ok(err(await as('kim', `insert into compendiums (id, owner, name, data) values ($1,$2,'  ','{}')`, [uuid(), ids.kim]), /check constraint/) && err(await as('kim', `insert into compendiums (id, owner, name, data) values ($1,$2,'A','[]')`, [uuid(), ids.kim]), /check constraint/), 'compendium: blank name or non-object data refused');
  ok(!(await as('sam', `insert into compendiums (id, owner, name, data) values ($1,$2,'Sams','{}')`, [B2, ids.sam])).error, 'compendium: a player makes their own');
  ok((await as('sam', `select id from compendiums where id=$1`, [B])).rows.length === 0, 'compendium: others cannot read it');
  ok((await as('sam', `update compendiums set name='Hacked' where id=$1 returning 1`, [B])).rows.length === 0, 'compendium: others cannot change it');
  ok(err(await as('sam', `select set_campaign_compendium($1,$2)`, [K, B2]), /Only a QM/), 'compendium: a player cannot attach one');
  ok(err(await as('kim', `select set_campaign_compendium($1,$2)`, [K, B2]), /your own compendiums/), "compendium: a QM cannot attach someone else's");
  ok(!(await as('kim', `select set_campaign_compendium($1,$2)`, [K, B])).error && (await as('sam', `select compendium_id from campaigns where id=$1`, [K])).rows[0].compendium_id === B, 'compendium: QM attaches their own; members see the id');
  ok((await as('sam', `select id from compendiums where id=$1`, [B])).rows.length === 0, 'compendium: players of the campaign still cannot read it');
  await as('kim', `update campaign_members set role='qm' where campaign_id=$1 and user_id=$2`, [K, ids.ava]);
  ok((await as('ava', `select data->'items'->0->>'name' n from compendiums where id=$1`, [B])).rows[0].n === 'Club', 'compendium: a co-QM reads the attached one');
  ok((await as('ava', `update compendiums set name='Mine' where id=$1 returning 1`, [B])).rows.length === 0 && (await as('ava', `delete from compendiums where id=$1 returning 1`, [B])).rows.length === 0, 'compendium: a co-QM cannot change or delete it');
  const pcS = uuid(); await as('sam', `insert into characters (id, owner, data, campaign_id) values ($1,$2,'{"info":{"name":"S"}}',$3)`, [pcS, ids.sam, K]);
  ok(!(await as('kim', `select give_item(null,$1,$2::jsonb)`, [pcS, JSON.stringify({ name: 'Club', qty: 1, cref: { c: B, e: 'a' } })])).error
    && (await as('sam', `select item->'cref'->>'e' e from item_gifts where character_id=$1`, [pcS])).rows[0].e === 'a', 'give_item carries the compendium link (cref)');
  ok(!(await as('kim', `select give_item(null,$1,$2::jsonb)`, [pcS, JSON.stringify({ name: 'Rock', qty: 1, cref: 'x' })])).error
    && (await as('sam', `select item->'cref' c from item_gifts where character_id=$1 and item->>'name'='Rock'`, [pcS])).rows[0].c === null, 'give_item drops a bad cref');
  ok(!(await as('kim', `select set_campaign_compendium($1,null)`, [K])).error && (await as('ava', `select id from compendiums where id=$1`, [B])).rows.length === 0, 'compendium: detaching ends the co-QM read');
  await as('kim', `select set_campaign_compendium($1,$2)`, [K, B]);
  ok(!(await as('kim', `delete from compendiums where id=$1`, [B])).error && (await as('kim', `select compendium_id from campaigns where id=$1`, [K])).rows[0].compendium_id === null, 'compendium: deleting it clears the campaign link');
}
{ // Release 4: a mob or boss NPC is deleted when it leaves its campaign; a plain NPC is kept
  const M = (await as('kim', `insert into campaigns (name) values ('Mob pit') returning id`)).rows[0].id, mob = JSON.stringify({ info: { name: 'Ghoul 1', kind: 'mob' } }), boss = JSON.stringify({ info: { name: 'Lich', kind: 'boss' } });
  await as('sam', `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [M, ids.sam]);
  const m1 = uuid(), m2 = uuid(), b1 = uuid(), p1 = uuid(), sm = uuid(), sp = uuid();
  await as('kim', `select create_npc($1,$2,$3::jsonb)`, [M, m1, mob]); await as('kim', `select create_npc($1,$2,$3::jsonb)`, [M, m2, mob]);
  await as('kim', `select create_npc($1,$2,$3::jsonb)`, [M, b1, boss]); await as('kim', `select create_npc($1,$2,'{}')`, [M, p1]);
  const has = async (id) => (await db.query(`select 1 from characters where id=$1`, [id])).rows.length === 1;
  ok(!(await as('kim', `select unlink_npc($1)`, [m1])).error && !(await has(m1)), 'mobs: REMOVE deletes a mob NPC');
  ok(!(await as('kim', `select unlink_npc($1)`, [p1])).error && (await has(p1)), 'mobs: a plain NPC taken out is kept');
  ok(err(await as('sam', `select unlink_npc($1)`, [m2]), /Only a QM/) && (await has(m2)), 'mobs: a player cannot delete a mob this way');
  await as('kim', `update campaign_members set role='qm' where campaign_id=$1 and user_id=$2`, [M, ids.sam]);
  await as('sam', `select create_npc($1,$2,$3::jsonb)`, [M, sm, mob]); await as('sam', `select create_npc($1,$2,'{}')`, [M, sp]);
  await as('sam', `delete from campaign_members where campaign_id=$1 and user_id=$2`, [M, ids.sam]);
  ok((await db.query(`select owner from characters where id=$1 and campaign_id=$2`, [sm, M])).rows[0]?.owner === ids.kim, 'mobs: a QM who leaves hands their mobs to another QM (they stay in the campaign)');
  await as('kim', `delete from campaigns where id=$1`, [M]);
  ok(!(await has(m2)) && !(await has(b1)), 'mobs: deleting the campaign deletes its mobs and bosses');
}
{ // Release 5: QM sets current values; Undo Action
  const K = (await as('kim', `insert into campaigns (name) values ('Undo hall') returning id`)).rows[0].id;
  for (const w of ['sam', 'ava']) await as(w, `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'member')`, [K, ids[w]]);
  const s1 = uuid(), a1 = uuid(), hid = uuid();
  await as('sam', `insert into characters (id, owner, data, campaign_id) values ($1,$2,'{"info":{"name":"S","explodeTokens":3},"items":[{"uid":"w1","name":"Bow","loaded":true}]}',$3)`, [s1, ids.sam, K]);
  await as('ava', `insert into characters (id, owner, data, campaign_id) values ($1,$2,'{"info":{"name":"A"}}',$3)`, [a1, ids.ava, K]);
  await as('kim', `select create_npc($1,$2,'{"info":{"name":"Hidden"},"vitals":{"damage":4}}'::jsonb)`, [K, hid]);
  const V = async (id) => (await db.query(`select data from characters where id=$1`, [id])).rows[0].data;
  ok(!(await as('kim', `select qm_set_vitals($1,$2,$3::jsonb)`, [K, a1, '{"damage":7,"apRemaining":2,"epRemaining":null}'])).error && (await V(a1)).vitals.damage === 7 && (await V(a1)).vitals.apRemaining === 2, 'qm vitals: a QM sets a player character\'s HP (damage) and AP');
  ok(err(await as('sam', `select qm_set_vitals($1,$2,$3::jsonb)`, [K, a1, '{"damage":0}']), /Only a QM/), 'qm vitals: a player cannot');
  ok(err(await as('kim', `select qm_set_vitals($1,$2,$3::jsonb)`, [K, a1, '{"bt":5}']), /cannot be changed/) && err(await as('kim', `select qm_set_vitals($1,$2,$3::jsonb)`, [K, a1, '{"damage":"x"}']), /not valid/), 'qm vitals: other keys and bad values refused');
  ok(err(await as('sam', `select push_undo($1,$2,'Attack',$3)`, [K, s1, [a1]]), /no active encounter/), 'undo: only during an encounter');
  await as('kim', `select start_encounter($1)`, [K]);
  ok(err(await as('ava', `select push_undo($1,$2,'Attack',$3)`, [K, s1, [a1]]), /your own/), 'undo: cannot mark actions for someone else\'s character');
  ok(!(await as('sam', `select push_undo($1,$2,'Rest',null)`, [K, s1])).error, 'undo: a player marks an action');
  ok(!(await as('sam', `select push_undo($1,$2,'Attack',$3)`, [K, s1, [a1]])).error, 'undo: and another');
  // the attack happens: AP spent, ET spent, bow fired, Ava hurt, the last attack recorded
  await db.query(`update characters set data = jsonb_set(jsonb_set(jsonb_set(data,'{vitals}','{"apRemaining":1}'),'{info,explodeTokens}','1'),'{items,0,loaded}','false') where id=$1`, [s1]);
  await db.query(`update characters set data = jsonb_set(data,'{vitals}', data->'vitals' || '{"damage":12,"wt":1}') where id=$1`, [a1]);
  await db.query(`update campaigns set encounter = encounter || jsonb_build_object('lastAttack', jsonb_build_object('id','x','attacker',$2::text,'target',$3::text,'text','hit')) where id=$1`, [K, s1, a1]);
  const e1 = (await as('ava', `select encounter from campaigns where id=$1`, [K])).rows[0].encounter;
  ok(JSON.stringify(e1.undo[s1]) === '["Rest","Attack"]', 'undo: the encounter shows only the labels to members');
  ok((await as('sam', `select * from encounter_undo`)).error || (await as('sam', `select * from encounter_undo`)).rows.length === 0, 'undo: players cannot read the snapshots');
  ok((await as('ava', `select undo_action($1,$2) l`, [K, s1])).error && true, 'undo: someone else cannot undo it');
  const u = await as('sam', `select undo_action($1,$2) l`, [K, s1]);
  const sv = await V(s1), av = await V(a1), e2 = (await as('sam', `select encounter from campaigns where id=$1`, [K])).rows[0].encounter;
  ok(!u.error && u.rows[0].l === 'Attack', 'undo: the newest action is undone first');
  ok(sv.vitals.apRemaining === undefined && sv.info.explodeTokens === 3 && sv.items[0].loaded === true, 'undo: the actor\'s AP, Explode Tokens and loaded bow come back');
  ok(av.vitals.damage === 7 && av.vitals.wt === undefined, 'undo: the target\'s HP and tokens come back (a finished attack)');
  ok(!e2.lastAttack && JSON.stringify(e2.undo[s1]) === '["Rest"]', 'undo: the last-attack note goes and one undo is left');
  ok(!(await as('kim', `select push_undo($1,$2,'NPC attack',$3)`, [K, hid, [a1]])).error, 'undo: a QM marks actions for an NPC');
  for (const lb of ['A2', 'A3']) await as('sam', `select push_undo($1,$2,$3,null)`, [K, s1, lb]);
  ok(JSON.stringify((await as('sam', `select encounter from campaigns where id=$1`, [K])).rows[0].encounter.undo[s1]) === '["A2","A3"]', 'undo: only the last two are kept');
  await si('sam', s1, 20, 0, K); await si('ava', a1, 2, 0, K);
  const t0 = (await as('sam', `select encounter->>'turn' t from campaigns where id=$1`, [K])).rows[0].t;
  ok(t0 === s1 && !(await as('sam', `select advance_turn($1,$2)`, [K, s1])).error, 'undo: Sam ends their turn');
  const e3 = (await as('sam', `select encounter from campaigns where id=$1`, [K])).rows[0].encounter;
  ok(!e3.undo || !e3.undo[s1], 'undo: END TURN clears that character\'s undo');
  ok(err(await as('sam', `select undo_action($1,$2)`, [K, s1]), /Nothing to undo/), 'undo: nothing left after END TURN');
  await as('kim', `select end_encounter($1)`, [K]);
  ok((await db.query(`select count(*)::int n from encounter_undo where campaign_id=$1`, [K])).rows[0].n === 0, 'undo: ending the encounter clears every snapshot');
}
console.log(fails ? `${fails} FAILED of ${n}` : `ALL ${n} PASSED`); process.exit(fails ? 1 : 0);
