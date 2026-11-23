# Handoff
Last updated 2026-11-23 17:22 (version 4 published: Releases 4 and 5). Overwrite each time; keep under 40 lines. Change record: HISTORY.md (don't read unless asked).

## Goal
BLOODSOUP HELL Companion: one PWA for Ricky's homemade tabletop RPG, with Supabase accounts, campaigns, encounters and NPCs.

## Done
- Version 4 published 2026-11-23 (cache `bloodsoup-v60`) = Releases 4 and 5. Ricky must re-run `campaigns.sql`. Version 3 was 2026-11-22.
- Release 4 (README "Mobs and sheet cleanup (version 4)"): mobs only from the compendium, deleted on removal, floors/ceilings, random looks, carried/loot drops, whole-number mob stats, SAVE/EDIT locks, item row layout.
- Release 5 (README "Running the table (version 5)"): QM tools column on wide screens; QM edits any character's HP/AP/SP/EP and DMG/HEAL (`qm_set_vitals`); QM END TURN on NPC rows; Undo Action (`push_undo`/`undo_action`, private `encounter_undo` table, two per character, cleared by END TURN, reverses finished attacks); roll results in a big highlighted box with larger calculation text; changed roster values hold 0.5 s then flash.
- Tests: `tests/release5.js` (56), 18 new SQL cases; roster.js/enc.js updated for QM value boxes. Full suite passes (compendium.js "gift carries the compendium link" failed once on supabase, passed twice on rerun: timing).
- Both releases change the database: `campaigns.sql` must be re-run when they ship.

## In progress
- Nothing mid-flight. Version 4 not yet seen in a real browser (BACKLOG Watch).

## Decisions
- Ricky (2026-11-23): Undo must reverse a finished attack too; feedback = result box, bigger calculation text, half-second delay (nothing more this round). Approved Release 4 plan incl. random looks and carried drops.
- Ricky (2026-11-22): Undo up to two actions, not after END TURN; removal deletes a mob.
- Assumptions Ricky has not reviewed:
  - Release 5: Undo covers attacks, combos, spends, loads and rests during an encounter (not skill checks or sheet edits). It restores whole snapshots (vitals, Explode Tokens, loaded marks) of the actor and those touched, so other changes to them in between are undone too; Load's ammo isn't returned. A QM can undo for NPCs and for players' characters. The half-second delay is a fade-in of the result and a hold-then-flash on roster numbers. The QM column needs 1000px+ width.
  - Release 4: floor/ceiling on totals (Talent/Proficiency level); height in inches shown 5'10"; UPDATE keeps rolled looks; loot = `loot: true` item; locked entries allow qty/charges/hands/GIVE/UPDATE; a leaving QM hands mobs on.

## Next steps
1. Confirm Ricky re-ran `campaigns.sql` and tried version 4 on phone and desktop (BACKLOG Watch items).
2. Release 6+ (rules automation: magic items track first) on his go-ahead, in a fresh session.

## Gotchas
- `waitFor` in tests/h.js does not await async predicates (a Promise counts as true): use an `until` helper for server checks.
- Under jsdom `FX_DELAY` is 0, so roster values change at once in tests.
- Weapon attacks in tests need the weapon in a hand (`eqR: true`). Item charges: `[aria-label="Charges (0 to Max Charges)"]`; REMOVE is in the item's `.iact` row.
- After editing `USER_GUIDE.md`, rebuild `guide.js` (`python3 tools/build_guide.py`).
- Late SQL test blocks must use `kim`/`sam`/`ava` (ricky's account is gone by then). Don't bump `seq` on undo: it marks turn starts.
