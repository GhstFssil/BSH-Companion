# Handoff
Last updated 2026-11-21 (evening). Overwrite each time; keep under 40 lines. Change record: HISTORY.md (don't read unless asked).

## Goal
BLOODSOUP HELL Companion: one PWA for Ricky's homemade tabletop RPG, with Supabase accounts, campaigns, encounters and NPCs.

## Done
- 0.6 released 2026-11-17 as "BSH 0.6 rev2.zip" (cache `bloodsoup-v56`) with `supabase/campaigns.sql`:
  - NPC owners (each NPC has an owner, the QM who made it). Sheet controls: MOVE NPC, GIVE CONTROL, REMOVE FROM CAMPAIGN (unlinks, never deletes), ADD TO CAMPAIGN. A QM stepping down passes their NPCs to another QM; deleting a campaign unlinks its NPCs.
  - Crits and absorbed hits (see ARCHITECTURE.md, Rules as implemented).
  - Combo Attacks in the Actions menu, with the Leader/Finisher flow. New RPCs: `set_combo`, `cancel_combo`, `combo_leader_attack`, `cancel_combo_attack`; changed `start_attack`, `resolve_attack`, `start_turn`.
- 2026-11-20: app pushed to GitHub (`GhstFssil/BSH-Companion`, `main`) from the 0.6 build; tests moved into `tests/`; docs aligned with the other Ricky repos (ARCHITECTURE.md, HISTORY.md, common CLAUDE.md sections).
- 2026-11-20: **user guide added** (version 1, cache `bloodsoup-v57`; no database change, so `campaigns.sql` need not be re-run). `USER_GUIDE.md` is the source; `python3 tools/build_guide.py` builds `guide.js`. GUIDE button on the title page and home screen; on the rulebook the centre button becomes GUIDE (and RULES shows on the guide). Needs Ricky to upload the new zip to Netlify.
- Tests at the last full run (2026-11-20): every file passed, including new `guideui.js`.

## In progress
- On `next` (unpublished, no database change, tests pass): item/ability names and descriptions now wrap and grow (no cut-off text); NEW NPC button on the Characters page for QMs (campaign picker when QM of several). Test selectors for the item name changed to `.iline .wrapname`.
- Batch plan: 1 quick wins (Tracking crit automation still open: needs Ricky's answer on whose next hit, and a database change), 2 combat rules (advantage/disadvantage, manual damage), 3 campaign/UI, 4 bigger features. New Tracks section in BACKLOG.md: mechanics for all abilities.
-  `main` is version 1 (guide); the last build Ricky deployed is 0.6 rev2 until he uploads the new zip.

## Decisions
- Design assumptions Ricky has not explicitly reviewed:
  - Combo bonus upgrades replace the lower bonus rather than add to it; the margin is measured after the base bonus.
  - A combined combo hit doubles for a crit only if both attackers crit.
  - Tracking's "next hit is critical" bonus is text only.
  - A combo below Combo Level 10 is allowed and gives no bonus.
  - If both combo attacks miss, the Finisher rerolls a plain d12 and keeps the better roll.

## Next steps
1. Ask Ricky whether `campaigns.sql` was run and 0.6 rev2 is live (and that version 1 is deployed), and about any bugs from real play. Ask him to read the guide on his phone and flag wrong or missing wording (TOTEM/ABILITIES tabs are only named; install steps are generic).
2. See BACKLOG.md.

## Gotchas
- Versions are whole numbers now. Next non-docs push makes version 2 and cache `bloodsoup-v58`.
- After editing `USER_GUIDE.md`, rebuild `guide.js` or the app shows the old text. In `USER_GUIDE.md` write `&lt;x&gt;` for angle-bracket placeholders.
- Combos and crits have only been tested in simulation, not in real play.
- Ricky still had to run `campaigns.sql` in Supabase and upload the 0.6 zip to Netlify; confirm he did both if bugs get reported.
