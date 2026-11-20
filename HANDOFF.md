# Handoff
Last updated 2026-11-20. Overwrite each time; keep under 40 lines. Change record: HISTORY.md (don't read unless asked).

## Goal
BLOODSOUP HELL Companion: one PWA for Ricky's homemade tabletop RPG, with Supabase accounts, campaigns, encounters and NPCs.

## Done
- 0.6 released 2026-11-17 as "BSH 0.6 rev2.zip" (cache `bloodsoup-v56`) with `supabase/campaigns.sql`:
  - NPC owners (each NPC has an owner, the QM who made it). Sheet controls: MOVE NPC, GIVE CONTROL, REMOVE FROM CAMPAIGN (unlinks, never deletes), ADD TO CAMPAIGN. A QM stepping down passes their NPCs to another QM; deleting a campaign unlinks its NPCs.
  - Crits and absorbed hits (see ARCHITECTURE.md, Rules as implemented).
  - Combo Attacks in the Actions menu, with the Leader/Finisher flow. New RPCs: `set_combo`, `cancel_combo`, `combo_leader_attack`, `cancel_combo_attack`; changed `start_attack`, `resolve_attack`, `start_turn`.
- 2026-11-20: app pushed to GitHub (`GhstFssil/BSH-Companion`, `main`) from the 0.6 build; tests moved into `tests/`; docs aligned with the other Ricky repos (ARCHITECTURE.md, HISTORY.md, common CLAUDE.md sections).
- Tests at the last full run (2026-11-20): every file passed (SQL 355, combat 94, and the rest).

## In progress
- Nothing mid-flight. No unreleased changes; the last shipped build is 0.6, identical to `main`.

## Decisions
- Design assumptions Ricky has not explicitly reviewed:
  - Combo bonus upgrades replace the lower bonus rather than add to it; the margin is measured after the base bonus.
  - A combined combo hit doubles for a crit only if both attackers crit.
  - Tracking's "next hit is critical" bonus is text only.
  - A combo below Combo Level 10 is allowed and gives no bonus.
  - If both combo attacks miss, the Finisher rerolls a plain d12 and keeps the better roll.

## Next steps
1. Ask Ricky whether `campaigns.sql` was run and 0.6 rev2 is live, and about any bugs from real play.
2. See BACKLOG.md.

## Gotchas
- Next cache is `bloodsoup-v57`.
- Combos and crits have only been tested in simulation, not in real play.
- Ricky still had to run `campaigns.sql` in Supabase and upload the 0.6 zip to Netlify; confirm he did both if bugs get reported.
