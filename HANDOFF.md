# Handoff
Last updated 2026-11-23 12:06 (Release 4 built on `next`, not published). Overwrite each time; keep under 40 lines. Change record: HISTORY.md (don't read unless asked).

## Goal
BLOODSOUP HELL Companion: one PWA for Ricky's homemade tabletop RPG, with Supabase accounts, campaigns, encounters and NPCs.

## Done
- Version 3 published 2026-11-22 (cache `bloodsoup-v59`).
- Release 4 on `next` (README "Mobs and sheet cleanup (version 4)"); DB change, so `campaigns.sql` must be re-run when it ships:
  - MAKE MOBS opens the campaign compendium's ADD MOBS; old copy-an-NPC maker removed. Mobs are off My Characters and deleted when removed from the campaign or when it is deleted (`is_mob_npc`).
  - Compendium mob: Talent/Proficiency level floor and ceiling, random sex/age/height/weight, drops Carried (equip R/L/both/worn) or loot. Mob stats round to whole numbers. No ET/Totem/Legacy/money on mobs.
  - SAVE / EDIT lock on items, abilities, attacks, custom actions, compendium mobs (SAVE MOB). Item row: Qty at the right; Charges and REMOVE inside the item. Attack Name/Cost labelled.
  - Tests: new `tests/release4.js` (68), 5 new SQL cases; batch4/chars/magic/gifts updated. Full suite and slow tests pass. USER_GUIDE, README, ARCHITECTURE updated; guide.js rebuilt.

## In progress
- Nothing mid-flight. Not yet looked at in a real browser (see BACKLOG Watch).

## Decisions
- Ricky (2026-11-23): approved the Release 4 plan, including random looks (sex list + age/height/weight ranges) and carried/equipped drops.
- Ricky (2026-11-22): mob variation applies at spawn with no dialog setting; removal deletes a mob; Undo up to two actions, not after END TURN.
- Assumptions Ricky has not reviewed (Release 4):
  - Floor/ceiling is on the totals (Talent level, Proficiency level), as the backlog worded it, not per talent. Entries are nudged within their own ranges; if they can't reach the limit, it stops short.
  - Height range is in inches and written 5'10"; weight is a plain number. UPDATE on a mob keeps its rolled looks.
  - Mob stat rounding happens in `BSH.compute` for any `info.kind` mob/boss (ordinary sheets unchanged).
  - Loot = an item with `loot: true` on the mob (LOOT tag, no hands, no buffs). Old drops count as carried, not equipped.
  - Locked entries still allow qty, charges, hands/body, GIVE and UPDATE; REMOVE is blocked. Weapon attacks lock with their weapon.
  - A QM leaving still hands their mobs to another QM (they are not deleted).
- Earlier unreviewed assumptions (compendiums, loading, combos, tokens, codex) unchanged; see README and HISTORY.

## Next steps
1. Ricky reviews Release 4 (try it on his phone; review assumptions). When he says publish: merge `main` into `next`, bump to version 4 / `bloodsoup-v60`, push `next` to `main`, tell him to re-run `campaigns.sql`.
2. Then Release 5 (see BACKLOG.md release plan) on his go-ahead.

## Gotchas
- Tests that use weapon attacks must put the weapon in a hand (`eqR: true`).
- UPDATE buttons on items/abilities are inside the folded details; tests find them with `[data-update]`. Item charges: `[aria-label="Charges (0 to Max Charges)"]`; REMOVE is in the item's `.iact` row.
- After editing `USER_GUIDE.md`, rebuild `guide.js` (`python3 tools/build_guide.py`). Write `&lt;x&gt;` for angle-bracket placeholders.
- SQL test counts vary a little between runs (random paths); compare FAIL lines, not totals. Late SQL blocks must use `kim`/`sam` (ricky's account is gone by then).
- jsdom has no `scrollIntoView`; guard it.
