# History
Append-only record of every change to this repo since 2026-11-20. Never edit or delete a line; correct a mistake with a new line. Sessions don't read this file unless Ricky asks. Times are America/Chicago.
Format: `- YYYY-MM-DD HH:MM | branch or version | what changed (and why, briefly)`
Add a line with `echo '- ...' >> HISTORY.md`.

- 2026-11-20 17:09 | main | Added HISTORY.md (append-only change record) and .gitattributes (union merge so parallel branches keep every line)
- 2026-11-20 17:09 | main | Added ARCHITECTURE.md (file list, backend notes, deploy, Rules as implemented moved out of CLAUDE.md, Docs list)
- 2026-11-20 17:09 | main | CLAUDE.md reorganised into the common sections (Session economy, Docs, Testing, Project, Shipping, Rules maintenance); added the session-economy, HISTORY, BACKLOG and rules-maintenance rules; version and cache values no longer hardcoded there (README Updating holds them)
- 2026-11-20 17:09 | main | HANDOFF.md is overwrite-only (old dated entries stay in git history); BACKLOG.md now Bugs/Ideas/Watch with checkboxes and the (who, date) format
- 2026-11-20 17:09 | main | README.md: Supabase setup, Deploy, Updating and Files sections unified with Lifebrained wording (Version and Cache lines added; file list moved to ARCHITECTURE.md)
- 2026-11-20 17:46 | main | README: removed the version and cache values (they live in app.js and sw.js); CLAUDE.md ship checklist says update README again, as before
- 2026-11-20 17:59 | main | Version rules: by default every push to main that isn't docs-only bumps APP_VERSION and CACHE to the next version (0.6 -> 0.7, v56 -> v57), docs-only pushes never change the version unless Ricky says so (CLAUDE.md, README, ARCHITECTURE)
- 2026-11-20 18:02 | main | Version rule: BSH-Companion now uses whole numbers, starting at 1 on the next non-docs push to main (0.6 -> 1); cache stays a counter (v56 -> v57) (CLAUDE.md, HANDOFF)
- 2026-11-20 20:34 | main, v1 | In-app user guide: USER_GUIDE.md -> guide.js (tools/build_guide.py), GUIDE screen/buttons (title, home, swaps with RULES on the rulebook); app version 0.6 -> 1, cache v57; tests: guideui.js added, button lists updated
- 2026-11-20 21:39 | main | Docs: shipping means pushing to main as the next version; never give zips or artifacts unless asked
- 2026-11-20 21:48 | main | Added .github/workflows/release.yml: every non-docs push to main publishes a vN GitHub release (app zip plus SQL script); docs updated
- 2026-11-20 22:06 | main | Docs: all work goes on next; publish merges main into next, bumps the version if not docs-only, then pushes next to main
- 2026-11-21 19:40 | next | Item/ability names and descriptions wrap and grow; NEW NPC button on Characters page; tests updated; backlog: abilities-mechanics track added, blank ability descriptions folded into it
- 2026-11-21 20:05 | next | Tracking Next Hit Critical automated for both attackers (vitals.nextCrit; resolve_attack p_used_crit/p_next_crit; end_encounter clears); engine/SQL/flow tests added
- 2026-11-21 21:10 | next | Advantage/disadvantage (ADV/DIS stepper, BSH.ADV, rulebook wording); QM ROLL DAMAGE card + qm_deal_damage RPC; user guide updated, guide.js rebuilt; tests added
