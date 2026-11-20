# Session handoff

Newest entry first. Add a new dated section at the top at the end of each session.

## 2026-11-20: repo created
- App pushed to GitHub (`GhstFssil/BSH-Companion`, branch `main`) as the first commit, from the 0.6 build.
- Added `CLAUDE.md` (project instructions), this file, and `BACKLOG.md`.

## 2026-11-17: version 0.6 released
- Shipped as "BSH 0.6 rev2.zip", cache `bloodsoup-v56`, version 0.6, with `supabase/campaigns.sql`. Ricky still had to run `campaigns.sql` in Supabase and upload the zip to Netlify. Confirm he did both if bugs get reported. Next cache is **v57**.
- Built this stretch:
  - **NPC owners:** each NPC has an owner (the QM who made it), shown on that QM's Characters page under "NPCs". Sheet controls: MOVE NPC, GIVE CONTROL, REMOVE FROM CAMPAIGN (unlinks, never deletes), ADD TO CAMPAIGN. A QM stepping down passes their NPCs to another QM. Deleting a campaign unlinks its NPCs. Make NPC is a QM button on the Info tab.
  - **Crits** and **absorbed hits** as described in `CLAUDE.md`.
  - **Combo Attacks** in the Actions menu, with the Leader/Finisher flow. New RPCs: `set_combo`, `cancel_combo`, `combo_leader_attack`, `cancel_combo_attack`; changed `start_attack`, `resolve_attack`, `start_turn`.
- Tests at the time: all suites passed (SQL 355, combat 94, and the rest of the regression set). Combos and crits had only been tested in simulation, not in real play.

## Design assumptions Ricky has not explicitly reviewed
- Combo bonus upgrades replace the lower bonus rather than add to it; the margin is measured after the base bonus.
- A combined combo hit doubles for a crit only if both attackers crit.
- Tracking's "next hit is critical" bonus is text only.
- A combo below Combo Level 10 is allowed and gives no bonus.
- If both combo attacks miss, the Finisher rerolls a plain d12 and keeps the better roll.

## Next steps
See `BACKLOG.md`.
