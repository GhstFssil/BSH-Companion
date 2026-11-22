# Handoff
Last updated 2026-11-22 (afternoon). Overwrite each time; keep under 40 lines. Change record: HISTORY.md (don't read unless asked).

## Goal
BLOODSOUP HELL Companion: one PWA for Ricky's homemade tabletop RPG, with Supabase accounts, campaigns, encounters and NPCs.

## Done
- Version 2 published 2026-11-21 (cache `bloodsoup-v58`): batches 1-4 (tokens, custom actions, mobs, codex and the rest).
- On `next` (unpublished; full suite incl. slow files passing; **database changed**, so `campaigns.sql` must be re-run when it ships):
  - Attack lists: `ch.attacks` (ABILITIES tab, Unarmed Strike by default) and weapon `item.attacks`. Own attacks always in Actions; weapon attacks only while held (both hands if Two-handed). Old weapons converted automatically (`fixWeapon`).
  - Load action: weapon Load Cost + Ammo; `load_weapon` RPC spends AP, uses 1 ammo, sets loaded in one step; attacks ticked Needs loading show LOAD FIRST; firing calls `set_loaded`.
  - QM item editing: QM edits the ITEMS tab on any campaign character (`set_items`); player gets a popup; `protect_items_trg` stops stale autosaves undoing it. `give_item` now carries attacks / twoHanded.
  - Tests: new `tests/loadatk.js`, new SQL cases; fixtures in wa, et2, combat2, weapon, imp3, imp7, gifts, spawn updated (weapons must be held now). Guide, README, ARCHITECTURE updated; `guide.js` rebuilt.

## In progress
- Nothing mid-flight.

## Decisions
- Ricky (2026-11-22): QM edits items on player sheets with a popup; one-step load RPC; per-attack Needs loading; two-handed weapons need both hands; Unarmed Strike is an editable default attack; CR stays on the weapon.
- Assumptions Ricky has not reviewed:
  - Loading only in an encounter and only for a held weapon; a weapon stays loaded until fired (also across encounters). The sheet's Loaded box can be ticked by hand.
  - Ammo matched by item name, any case; first stack with 1+ is used; it drops to 0 and stays on the sheet. A blank Ammo loads with no ammo.
  - Same-name weapons stacked as one item share one loaded mark. A called-off combo does not give the load back (it gives no AP back either).
  - Spawn's Crossbow was not given a Load Cost / Ammo; Ricky can say if it should (rulebook: arm for 5 AP, uses 1 bolt).
- Earlier unreviewed assumptions (combo bonus upgrades, combo crits, CL below 10, combo rerolls, tokens, codex, mobs) are unchanged; see the version 2 notes in README.

## Next steps
1. Ask Ricky to try Load / attacks / QM item edits and review the assumptions above; ask about the Spawn Crossbow.
2. When he says publish: merge `main` into `next`, bump to version 3 / cache `bloodsoup-v59`, push to `main`, tell him to re-run `campaigns.sql`.
3. BACKLOG.md: Tracks (mechanics for all abilities) and the not-automated token details.

## Gotchas
- Tests that use weapon attacks must put the weapon in a hand (`eqR: true`).
- A gift saved from a stale copy right after a QM item change loses to the QM's items (rare; `itemsSync` runs before `collectGifts` to avoid it).
- After editing `USER_GUIDE.md`, rebuild `guide.js` (`python3 tools/build_guide.py`). Write `&lt;x&gt;` for angle-bracket placeholders.
- Ricky still has to deploy the newest release and run `campaigns.sql`; confirm if bugs get reported.
