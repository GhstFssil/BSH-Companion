# Architecture (stable facts; update when they change)

**What:** BLOODSOUP HELL Companion, an app for Ricky's homemade tabletop RPG. One PWA for iPhone, Android, Mac, Windows and the browser: a hash-routed single-page app in plain JS, no build step.

## Files
- `index.html`, `app.js`: screens and behavior (UI).
- `engine.js`: the character sheet math (a direct port of BSH_Skillsheet_3.2) and the rules and stat math (`BSH.ET`, `BSH.COMBAT`, `BSH.COMBO`).
- `backend.js`: accounts and saving. One async API with two implementations: Supabase, and a device-only localStorage "local" backend (used when Supabase is not configured).
- `rules.js`: the rulebook, converted from `Rulebook_0.3.odt`. `guide.js`: the in-app user guide, generated from `USER_GUIDE.md` by `tools/build_guide.py` (don't edit it by hand). `spawndata.js`: abilities, fighting styles and weapons for Spawn Character, copied from the rulebook.
- `config.js`: Supabase URL + publishable key.
- `vendor/supabase.js`: the Supabase browser library (MIT, see `vendor/supabase-LICENSE.txt`).
- `supabase/schema.sql`: accounts and character tables and security rules.
- `supabase/username-login.sql`: lets players log in with a username instead of an email.
- `supabase/campaigns.sql`: campaigns, QM rules, linking characters to campaigns, NPCs, and encounters with initiative rolls (creator is QM, a campaign always keeps a QM: if the last QM leaves or their account is deleted a random player takes over and inherits the NPCs, only QMs remove players, change QMs, delete the campaign, create NPCs or show/hide them).
- `sw.js`, `manifest.webmanifest`, icons: offline use and installing. `CACHE` in `sw.js` changes with every version bump.
- `tests/`: Node scripts, see `tests/README.md`. `tools/build_artifact.py`: builds the single-file demo page. `tools/build_guide.py`: rebuilds `guide.js`.

## Backend (Supabase)
- `backend.js` keeps the Supabase and local implementations in step; the API is the same for both.
- `supabase/campaigns.sql` is idempotent, so it is re-run after any database change (and after `schema.sql` if that is ever re-run).
- Campaigns poll every 5 s. Encounter state (`attack`, `lastAttack`, `combos`) lives in `campaigns.encounter` jsonb.

## Deploy
Hosted on Netlify (https://verdant-stardust-605101.netlify.app). Ricky publishes to Netlify himself; Claude does not deploy. `.github/workflows/release.yml` publishes a `vN` release (N = `APP_VERSION`) with the app zip and `campaigns.sql` on every non-docs push to `main`; docs, tests and tools changes make none. Branches: `next` (all agent work), `main` (published versions). Release steps are in CLAUDE.md.

## Rules as implemented
- Attack = d12 + SA (natural 1 gives -5, natural 12 gives +5). Hit if total > target DA. Damage = max(0, Attack Pwr - AC). No chip damage: a hit that AC absorbs is still a hit, with 0 damage.
- Critical Hit: total - DA >= 10, damage after AC doubled. Critical Miss: total - DA <= -10, attacker recovers 2 less AP at next turn start (`vitals.apPenalty`).
- Next Hit Critical: a Tracking Perfect Combo (or Critical Combo at CL 25) sets `vitals.nextCrit` on both attackers. Their next hit is critical (plain or combo) and spends the flag; a miss keeps it; `end_encounter` clears it. Applied by the target's device in `resolveAttackNow`, stored via `resolve_attack`'s `p_used_crit` / `p_next_crit`.
- Advantage/Disadvantage (`BSH.ADV` in engine.js, `advStepper()` in app.js): net advantage 1 rolls 2 dice and keeps the best (worst for disadvantage), net 2 rolls 3, beyond that the roll counts as the die's max (or 1). Dice are the roll's own size (d12 attacks/blocks, d20 else). It only drives the app's ROLL buttons; typed rolls are taken as entered. Rulebook text in `rules.js` matches.
- QM damage roller (`damageCard` in app.js): formula via `parsePower`, minus AC unless ignored, doubled on a critical; applied with `qm_deal_damage(p_campaign, p_target, p_amount)` (QM only, any campaign character, no encounter needed).
- Bleed/Wound Tokens (`BSH.TOKENS`, `vitals.bt` / `wt` / `bleeding`): every 20 BT and every WT cuts all Aggregate Stats 10% (in `compute`, as `tokenCut`, stacked on `overallPct`); 2+ WT is -5 on Skill Checks, 3+ WT is disadvantage; 20+ BT doubles SP costs, 50+ stuns, 100+ incapacitates (tags only). A hit gives WT by share of max HP (25/50/75% = 1/2/3) and, while Bleeding, 1 BT (BT beyond 100 cost 1 HP); Bleeding also gives 1 BT per turn start. Applied by the target's device (`applyHitTokens`, `applyTurnStarts`) via `set_vital`, which accepts `bt` / `wt` / `bleeding` at any time for the owner or a QM. Rests remove BT; Extended Rest also removes 1 WT. `vitals.restCd` locks Respite (2 EP) and Short Rest (6 EP) until that much EP is recovered by other rests.
- Block/Parry costs 1 AP and adds d12 + best equipped CR to DA. Explode Tokens (ET) via `BSH.ET`. AP resets to full at turn start.
- Combo Attacks (3 AP): Leader picks Finisher + skill, rolls d20; Combo Level 0/10/15/20/25; held until the Leader's next turn begins; Finisher ticks it on a weapon attack; Leader rolls an attack; target defends against both. Engine: `BSH.COMBAT`, `BSH.COMBO`.

## Run and test
See `tests/README.md` (setup, run commands, what each file covers). Rules for database changes are in CLAUDE.md (Testing).

## Docs
- `README.md`: what it is, deploy, Supabase setup, updating, files, and the feature notes for each feature.
- `USER_GUIDE.md`: the player-facing user guide, shown in the app under GUIDE (rebuild `guide.js` after editing).
- `CLAUDE.md`: working rules for sessions (Ricky approves edits).
- `ARCHITECTURE.md`: this file.
- `HANDOFF.md`: current state; overwritten each time.
- `BACKLOG.md`: open bugs and ideas.
- `HISTORY.md`: append-only record of every change since 2026-11-20; not read unless Ricky asks.
- Custom actions: `customActions: [{name, cost, desc}]` on a character; cost `N AP` / `N SP` makes a spend button.
- Attacks: `ch.attacks` and weapon `item.attacks` = `[{name, cost, dmg, range, damage, effect, needsLoad?}]` (`cleanAttack`). `attackActions(c)` in app.js builds the menu rows: own attacks always, weapon attacks only for `heldWeapons(c)` (eqL/eqR; `item.twoHanded` needs both). `fixWeapon` (run by `normalizeChar`, import, gifts, Spawn) converts old weapons' `weaponProps.cost/dmg/range/damage` into one attack and gives each weapon a `uid` and `loaded`.
- Loading: `weaponProps.loadCost` / `weaponProps.ammo`; `load_weapon(p_character, p_item uid, p_ap)` spends AP, uses 1 ammo (item name, any case) and sets `loaded` in one step; `set_loaded(p_character, p_item, p_loaded)` empties it on firing. Owner or QM.
- Items changed by others: `set_items(p_character, p_items)` (QM only), `load_weapon` and `set_loaded` stamp `data.itemsEdit = {at, by, why}` ('qm' / 'load' / 'fire'). Trigger `protect_items_trg` keeps the stored items when a plain save carries a different stamp. The owner's device (`itemsSync` in app.js, every poll) adopts newer items and shows a popup for `why = 'qm'` by someone else. On a QM's view of another character's sheet, `cur.qmItems` leaves the ITEMS tab editable and saves it with `setItems`.
- Mobs: made only from a compendium (`rollMob`, ADD MOBS in `compCard`; MAKE MOBS opens it). `info.kind` (`mob` | `boss`), `info.mobBase`, `info.cref`. `BSH.compute` rounds a mob's stat totals. Mob NPCs are hidden from My Characters while in a campaign and deleted when they leave it (`is_mob_npc(is_npc, data)` in `unlink_npc`, `unlink_characters_on_leave`, `delete_npcs_with_campaign`; local backend `isMobNpc`). Items with `loot: true` (drops not carried) are never equipped and give no buffs.
- Undo Action: `push_undo` / `undo_action` with snapshots in the private `encounter_undo` table; `encounter.undo` holds only labels. Client: `undoMark`, `undoButton` in app.js. QM value edits: `qm_set_vitals` (`qmSaveVital`).
- Feedback: `showRoll` (roll results), `fxChange` (roster values). Campaign page columns: `#campCols` / `#campQmCol`.
- SAVE / EDIT: `locked: true` on items, abilities, attacks, custom actions and compendium mobs (`lockToggle` / `applyLock`, `mobLockButton` in app.js); elements marked `data-keep` stay usable.
- Codex: `campaigns.codex jsonb` = `{ mobs: {key: entry}, items: {key: entry}, removed: {mobs: {key: true}, items: {...}} }`, written only by `codex_record` (any member, first record wins, max 300 per section) and `codex_remove` (QM, leaves a `removed` mark). The app's `codexSync` records visible mob/boss NPCs and items on visible sheets whenever the campaign page renders.
- Inactive characters: `campaigns.inactive_ids uuid[]`, changed only by `set_character_inactive(p_campaign, p_character, p_inactive)` (QM only). `listCampaigns` returns it as `campaign.inactive`. The campaign page moves dead (`info.alive === false`) and inactive characters to DEAD / INACTIVE right-edge side lists, unless they are in the running encounter.
- Notes (`renderNotes` in app.js): device-only. localStorage key `bsh-notes-<user id>` holds the pages; `bsh-notes-backup-<user id>` holds the last-backup time. BACK UP NOTES / RESTORE NOTES use the file format `bloodsoup-hell-notes` (restore skips pages already present, cleans every field). Never in the database.
- Compendiums: table `compendiums (id, owner, name, data jsonb, updated_at)`; RLS: owner reads/writes, `compendium_qm_reads(id)` lets a QM of a campaign whose `campaigns.compendium_id` is that id read it. `set_campaign_compendium(p_campaign, p_compendium)` (QM; own compendium or null). Deleting a compendium sets `compendium_id` null. `data = {v, items, mobs, abilities, attacks, customActions}`, every entry with a `cid`; a mob is `{cid, kind, ch, var: {prof[36], talents[9], statPct, talentMin, talentMax, profMin, profMax}, rand: {sex, ageMin, ageMax, heightMin, heightMax, weightMin, weightMax}, drops: [{e, chance, min, max, carry, equip}], locked?}`. App: compendium section in app.js (`cleanBook`, `rollMob`, `copyFrom` / `updateFrom`, `compPicker`, `compCard`); the editor reuses the sheet screen via `openSheet(ch, viewOnly, book)` (`cur.book = {comp, mob}`; `bookChar` shares the book's lists; saves through `queueBookSave` / `flushBook`). Routes `#compendiums`, `#compendium-<id>`, `#compmob-<id>~<cid>`. Copies carry `cref = {c, e}` (items, abilities, attacks, custom actions; a mob NPC in `info.cref`); `give_item` passes it on.
- Top bar: `#docBar` holds RULES / GUIDE / NOTES on every screen (second row at 640px wide or less).
- Compare screen (`openCompare`): own characters plus `listCampaignCharacters` for each campaign you belong to (stubs skipped); up to 4; highest value per row highlighted except Weight Class.
