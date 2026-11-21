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
