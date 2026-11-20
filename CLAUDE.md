# BLOODSOUP HELL Companion: working rules
Companion PWA for Ricky's homemade tabletop RPG, BLOODSOUP HELL. Don't edit this file without Ricky's approval. Keep it under ~25 lines of rules.

## Session economy
- Search before reading. Never read a large file whole; read only the relevant range. Don't re-read unchanged files.
- Before a big read or wide change, say which files/sections. For multi-step work, propose a short plan and wait for go-ahead before large edits.
- Prefer small, targeted edits over rewrites.
- Filter command output: show failures and the last ~30 lines, not full logs.
- After two failed attempts at the same fix, stop, summarize what was tried, recommend reverting or starting fresh.
- Replies short: outcome first, no recaps, don't paste back code visible in the file.
- Ambiguous requirements: ask one focused question (only if the choice is costly to redo and unclear).
- When a task is done, say so and suggest continuing here or starting fresh.

## Docs
- Read HANDOFF.md first for the current state. Stable facts (files, backend, rules as implemented) live in ARCHITECTURE.md, not in conversation; read only the section you need.
- HANDOFF.md (repo root; overwrite each time; Goal, Done, In progress, Decisions, Next steps, Gotchas; under 40 lines): update after each completed step or major decision. If the session gets long, off-topic or cluttered, say so in one line, update HANDOFF.md first, then recommend a fresh session.
- BACKLOG.md: either of us logs bugs and ideas as `- [ ] (who, YYYY-MM-DD) text`. Don't act on entries unasked. Delete an entry when it's done.
- HISTORY.md: append-only record of every change since 2026-11-20. In the same commit as each change, add one line: `echo '- YYYY-MM-DD HH:MM | branch or version | what changed' >> HISTORY.md` (America/Chicago time). Never edit or delete earlier lines (correct with a new line). It is long, so don't read it unless Ricky asks.

## Testing
- Tests live in `tests/` (see `tests/README.md`). Setup: `cd tests && npm install`. Run all: `node run-all.js`. Before shipping, run the suite and click through the changed flows.
- A database change means updating three things together: `supabase/campaigns.sql`, the Supabase branch of `backend.js` (and its local-backend twin), and `tests/mock.js`. Add a case to `tests/sql.mjs`.

## Project
- Plain-JS PWA, hash-routed, no build step. Hosted on Netlify (https://verdant-stardust-605101.netlify.app); Ricky deploys by uploading a zip (or from this repo); Claude does not deploy.
- `backend.js` has two implementations, Supabase and a localStorage "local" backend. Keep both in step.
- `supabase/campaigns.sql` is idempotent. Ricky re-runs it in the Supabase SQL editor after any database change. Always tell him whether it must be re-run.
- Only the publishable Supabase key may go in `config.js`. Never the secret/service_role key. Don't belabor confirmations about the publishable key.
- `tools/build_artifact.py [out.html]` builds the single-file demo page Ricky previews as a Claude artifact (https://claude.ai/artifact/2qcasGSVxcbuwHbWt1gqGA). Optional; republishing is free.

## Shipping
- Ship only when asked or at a natural stopping point. Ricky is careful with Netlify free credits, so batch changes.
- `APP_VERSION` (app.js) changes only when Ricky says so; remind him periodically.
- Bump `CACHE` in `sw.js` on every release. Use a distinct zip name per release (e.g. "BSH 0.6 rev2.zip"), because re-uploading an old copy once caused "All files already uploaded" confusion.
- Ship checklist: bump cache; update README; zip the app folder (no node_modules); give Ricky `supabase/campaigns.sql` if the database changed; state clearly whether it must be re-run.

## Rules maintenance
- After each release (or on request), suggest changes in one short list: rules to add (friction seen), trim (redundant/outdated/something you'd do anyway), and wording to tighten.
