# BLOODSOUP HELL Companion: project instructions

Companion PWA for Ricky's homemade tabletop RPG, BLOODSOUP HELL. Read `HANDOFF.md` first for the current state, and `BACKLOG.md` for planned work.

## Overview
- One codebase serves iPhone, Android, Mac, Windows and the browser. A hash-routed single-page app in plain JS with **no build step**.
- Files: `index.html`, `app.js` (UI), `engine.js` (rules and stat math), `backend.js` (data layer), `rules.js`, `spawndata.js`, `sw.js` (service worker), `manifest.webmanifest`, `config.js`, `supabase/`.
- Hosted on Netlify (https://verdant-stardust-605101.netlify.app). Ricky deploys by uploading a zip (or from this repo); Claude does not deploy.
- Backend is Supabase. `backend.js` exposes one async API with two implementations, Supabase and a localStorage "local" backend. **Keep both in step.**
- `supabase/campaigns.sql` is idempotent. Ricky re-runs it in the Supabase SQL editor after any database change. Always tell him whether it must be re-run.
- Campaigns poll every 5 s. Encounter state (`attack`, `lastAttack`, `combos`) lives in `campaigns.encounter` jsonb.

## Standing rules
- **Security is important.** Only the public publishable key may appear in `config.js`. Never a service_role or secret key. Don't belabor confirmations about the publishable key.
- **Version** (`APP_VERSION` in `app.js`, shown on the title page) changes only when Ricky says so. Remind him periodically. Currently **0.6**.
- Ricky is careful with Netlify free credits. Batch changes, and ship only when asked or at a natural stopping point.
- Use a **distinct zip name** per release (e.g. "BSH 0.6 rev2.zip"), because re-uploading an old copy once caused "All files already uploaded" confusion.
- Bump `CACHE` in `sw.js` on every release (last shipped: `bloodsoup-v56`).
- Ship checklist: bump cache; update README; zip the app folder (no node_modules); give Ricky `supabase/campaigns.sql` if the database changed; state clearly whether it must be re-run.

## Game rules as implemented
- Attack = d12 + SA (natural 1 gives -5, natural 12 gives +5). Hit if total > target DA. Damage = max(0, Attack Pwr - AC). No chip damage: a hit that AC absorbs is still a hit, with 0 damage.
- Critical Hit: total - DA >= 10, damage after AC doubled. Critical Miss: total - DA <= -10, attacker recovers 2 less AP at next turn start (`vitals.apPenalty`).
- Block/Parry costs 1 AP and adds d12 + best equipped CR to DA. Explode Tokens (ET) via `BSH.ET`. AP resets to full at turn start.
- Combo Attacks (3 AP): Leader picks Finisher + skill, rolls d20; Combo Level 0/10/15/20/25; held until the Leader's next turn begins; Finisher ticks it on a weapon attack; Leader rolls an attack; target defends against both. Engine: `BSH.COMBAT`, `BSH.COMBO`.

## Testing
Tests live in `tests/` (see `tests/README.md`). Setup: `cd tests && npm install`. Run all: `node run-all.js`.
- Before shipping, run the suite and click through the changed flows. A database change means updating **three** things together: `supabase/campaigns.sql`, the Supabase branch of `backend.js` (and its local-backend twin), and `tests/mock.js`. Add a case to `tests/sql.mjs`.
- `tools/build_artifact.py [out.html]` builds the single-file demo page that Ricky previews as a Claude artifact (https://claude.ai/artifact/2qcasGSVxcbuwHbWt1gqGA). Republishing it is free. It is optional.
