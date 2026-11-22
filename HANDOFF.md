# Handoff
Last updated 2026-11-21 (night). Overwrite each time; keep under 40 lines. Change record: HISTORY.md (don't read unless asked).

## Goal
BLOODSOUP HELL Companion: one PWA for Ricky's homemade tabletop RPG, with Supabase accounts, campaigns, encounters and NPCs.

## Done
- 0.6 released 2026-11-17 (cache `bloodsoup-v56`); user guide added on `main` as version 1 (cache `bloodsoup-v57`, no database change).
- On `next` (unpublished; all batches done, full test suite passing; **database changed**, so `campaigns.sql` must be re-run when it ships):
  - Batch 1: wrapping item/ability text, NEW NPC button on Characters page, Tracking's Next Hit Critical automated.
  - Batch 2: ADV/DIS stepper, d12 rulebook wording, QM ROLL DAMAGE card (`qm_deal_damage`).
  - Batch 3: DEAD/INACTIVE side lists (`set_character_inactive`), COMPARE screen, device-only NOTES.
  - Batch 4: Bleed/Wound Tokens (`BSH.TOKENS`; `set_vital` accepts `bt`/`wt`/`bleeding`; STATS tab, roster tags, BLEEDING button; auto WT on big hits, BT while Bleeding; rests remove BT; Respite/Short Rest cooldowns in `vitals.restCd`); custom actions (ABILITIES tab, Actions menu); MAKE MOBS (mob/boss copies of an NPC with variation and boost; no DB change); CODEX (`campaigns.codex`, `codex_record`, `codex_remove`, auto-recorded when players can see a mob/item). USER_GUIDE, README, ARCHITECTURE updated; `guide.js` rebuilt; new tests `bleed.js`, `batch4.js`.

## In progress
- Nothing mid-flight. `next` is ready to publish when Ricky says so (merge `main` into `next`, bump version to 2 and cache `bloodsoup-v58`, push to `main`).

## Decisions
- Design assumptions Ricky has not explicitly reviewed:
  - Combo bonus upgrades replace the lower bonus rather than add to it; the margin is measured after the base bonus.
  - A combined combo hit doubles for a crit only if both attackers crit.
  - A combo below Combo Level 10 is allowed and gives no bonus.
  - If both combo attacks miss, the Finisher rerolls a plain d12 and keeps the better roll.
  - Tokens: WT come from a single hit's damage as a share of max HP (not psychic damage, not QM ROLL DAMAGE of unknown type); a hit also adds 1 BT while Bleeding; Bleeding has no timer (switched off by hand). A rest cooldown clears only from EP recovered by other rests.
  - Codex: records every mob/boss NPC the players can see and every named item on any sheet they can see; a QM-removed entry stays removed.
  - Mobs: variation and boost change `statAdjPct` for HP, SP, RD, IB, EP, SA, DA, BP, AC only.

## Next steps
1. Ask Ricky whether `campaigns.sql` was run and 0.6 rev2 / version 1 are live, and about bugs from real play (crits, combos and tokens are tested in simulation only). Ask him to try MAKE MOBS and the codex and review the assumptions above.
2. See BACKLOG.md: Tracks (mechanics for all abilities) and the not-automated token details.

## Gotchas
- Versions are whole numbers. Next non-docs push to `main` makes version 2 and cache `bloodsoup-v58`.
- After editing `USER_GUIDE.md`, rebuild `guide.js` (`python3 tools/build_guide.py`). Write `&lt;x&gt;` for angle-bracket placeholders.
- QM roster rows now have a BLEEDING button; tests that list roster buttons must include it.
- Ricky still has to run `campaigns.sql` in Supabase and deploy the newest release; confirm if bugs get reported.
