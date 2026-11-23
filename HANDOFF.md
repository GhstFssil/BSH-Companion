# Handoff
Last updated 2026-11-22 20:50 (backlog batched into releases; no code work started). Overwrite each time; keep under 40 lines. Change record: HISTORY.md (don't read unless asked).

## Goal
BLOODSOUP HELL Companion: one PWA for Ricky's homemade tabletop RPG, with Supabase accounts, campaigns, encounters and NPCs.

## Done
- Version 3 published 2026-11-22 (cache `bloodsoup-v59`). Ricky must re-run `supabase/campaigns.sql` (compendiums, `give_item` cref). Contents:
  - Attack lists, the Load action, QM item editing (see README "Attacks, loading, and QM item changes").
  - **Compendiums** (README "Compendiums"): home > COMPENDIUM; items, mobs (± ranges on talents/proficiencies, stat variation %, DROPS with chance and min-max), abilities, attacks, custom actions; export/import; FROM COMPENDIUM on sheets; UPDATE FROM COMPENDIUM on copies; campaign compendium (QM: ADD MOBS "Goblin 1, 2...", GIVE ITEM; co-QMs read only; players never see it).
  - RULES / GUIDE / NOTES together at the top of every screen (second row on phones).
  - Sheet export now includes the character's own attacks (were missing).
  - Tests: new `tests/compendium.js` (106), new SQL cases, `chars.js` / `rulesui.js` updated. Guide, README, ARCHITECTURE updated; `guide.js` rebuilt.

## In progress
- Nothing mid-flight.

## Decisions
- Ricky (2026-11-22, backlog review): mob variation lives on the compendium mob and applies automatically at spawn (no roll, no dialog setting); removing a spawned mob deletes it permanently; Undo reverses up to two actions, not after END TURN. Release plan is at the top of BACKLOG.md.
- Ricky (2026-11-22): copies keep a link + UPDATE button (no live link); all QMs of a campaign use its compendium, only the owner edits; compendium also holds abilities, attacks, custom actions; GUIDE and NOTES everywhere beside RULES.
- Assumptions Ricky has not reviewed:
  - Ranges are whole numbers 0-100, rolled evenly; rolled values never go below 0; a blank talent counts as 10.
  - Drops come only from the compendium's own items; each line rolls on its own; two lines for one item stack.
  - Mob copies are always numbered (even one), continuing from the highest number in the campaign, and start hidden.
  - UPDATE on an item keeps qty, charges, hands, loaded; on a mob NPC keeps name, vitals, tokens, items, money, alive, incarnation.
  - Players can use their own compendiums on their own sheets. QMs still can't add abilities to players' sheets (items only, as before).
  - Any QM may switch the campaign to their own compendium or none. Limits: 5 MB, 500 items, 200 mobs, 300 of each other kind.
  - An imported compendium is new: copies made from the original don't link to it.
- Earlier unreviewed assumptions (loading, combos, tokens, codex, mobs) are unchanged; see the version 2 notes in README and the previous handoff in HISTORY.

## Next steps
1. Confirm Ricky re-ran `campaigns.sql`; ask him to try compendiums (making a mob, ADD MOBS, GIVE ITEM, UPDATE) and the top bar on his phone; review the assumptions above.
2. When Ricky says go: Release 4 on `next` (see BACKLOG.md release plan), then 5, then rules automation. Wait for his go-ahead; no whiteboard.

## Gotchas
- Tests that use weapon attacks must put the weapon in a hand (`eqR: true`).
- UPDATE buttons on items/abilities are inside the folded details; tests find them with `[data-update]`.
- After editing `USER_GUIDE.md`, rebuild `guide.js` (`python3 tools/build_guide.py`). Write `&lt;x&gt;` for angle-bracket placeholders.
- SQL test counts vary a little between runs (random paths); compare FAIL lines, not totals.
