# Architecture (stable facts; update when they change)

**What:** BLOODSOUP HELL Companion, an app for Ricky's homemade tabletop RPG. One PWA for iPhone, Android, Mac, Windows and the browser: a hash-routed single-page app in plain JS, no build step.

## Files
- `index.html`, `app.js`: screens and behavior (UI).
- `engine.js`: the character sheet math (a direct port of BSH_Skillsheet_3.2) and the rules and stat math (`BSH.ET`, `BSH.COMBAT`, `BSH.COMBO`).
- `backend.js`: accounts and saving. One async API with two implementations: Supabase, and a device-only localStorage "local" backend (used when Supabase is not configured).
- `rules.js`: the rulebook, converted from `Rulebook_0.3.odt`. `spawndata.js`: abilities, fighting styles and weapons for Spawn Character, copied from the rulebook.
- `config.js`: Supabase URL + publishable key.
- `vendor/supabase.js`: the Supabase browser library (MIT, see `vendor/supabase-LICENSE.txt`).
- `supabase/schema.sql`: accounts and character tables and security rules.
- `supabase/username-login.sql`: lets players log in with a username instead of an email.
- `supabase/campaigns.sql`: campaigns, QM rules, linking characters to campaigns, NPCs, and encounters with initiative rolls (creator is QM, a campaign always keeps a QM: if the last QM leaves or their account is deleted a random player takes over and inherits the NPCs, only QMs remove players, change QMs, delete the campaign, create NPCs or show/hide them).
- `sw.js`, `manifest.webmanifest`, icons: offline use and installing. `CACHE` in `sw.js` changes with every version bump.
- `tests/`: Node scripts, see `tests/README.md`. `tools/build_artifact.py`: builds the single-file demo page.

## Backend (Supabase)
- `backend.js` keeps the Supabase and local implementations in step; the API is the same for both.
- `supabase/campaigns.sql` is idempotent, so it is re-run after any database change (and after `schema.sql` if that is ever re-run).
- Campaigns poll every 5 s. Encounter state (`attack`, `lastAttack`, `combos`) lives in `campaigns.encounter` jsonb.

## Deploy
Hosted on Netlify (https://verdant-stardust-605101.netlify.app). Ricky deploys by uploading a zip (or from this repo); Claude does not deploy. Release steps are in CLAUDE.md.

## Rules as implemented
- Attack = d12 + SA (natural 1 gives -5, natural 12 gives +5). Hit if total > target DA. Damage = max(0, Attack Pwr - AC). No chip damage: a hit that AC absorbs is still a hit, with 0 damage.
- Critical Hit: total - DA >= 10, damage after AC doubled. Critical Miss: total - DA <= -10, attacker recovers 2 less AP at next turn start (`vitals.apPenalty`).
- Block/Parry costs 1 AP and adds d12 + best equipped CR to DA. Explode Tokens (ET) via `BSH.ET`. AP resets to full at turn start.
- Combo Attacks (3 AP): Leader picks Finisher + skill, rolls d20; Combo Level 0/10/15/20/25; held until the Leader's next turn begins; Finisher ticks it on a weapon attack; Leader rolls an attack; target defends against both. Engine: `BSH.COMBAT`, `BSH.COMBO`.

## Run and test
See `tests/README.md` (setup, run commands, what each file covers). Rules for database changes are in CLAUDE.md (Testing).

## Docs
- `README.md`: what it is, deploy, Supabase setup, updating, files, and the user guide for each feature.
- `CLAUDE.md`: working rules for sessions (Ricky approves edits).
- `ARCHITECTURE.md`: this file.
- `HANDOFF.md`: current state; overwritten each time.
- `BACKLOG.md`: open bugs and ideas.
- `HISTORY.md`: append-only record of every change since 2026-11-20; not read unless Ricky asks.
