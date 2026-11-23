# Tests

Plain Node scripts, no test framework. Each prints `PASS`/`FAIL` lines and a final `ALL n PASSED`.

## Setup
```
cd tests && npm install      # jsdom and @electric-sql/pglite
```

## Run
- Everything (except the two slow files): `node run-all.js`. Add `--slow` to include them.
- One file: `node roster.js | grep -E "FAIL|^ALL"` (use `timeout 115` if your shell limits commands to ~2 minutes).

## How they work
- `h.js`: a jsdom harness that boots the real `index.html` and `app.js` against either the local backend or a mock Supabase. Helpers: `boot`, `api`, `checker`, `wait`, `waitFor`.
- `mock.js`: a mock Supabase (REST + RPC) that mirrors `supabase/campaigns.sql` behaviour. **When an RPC changes in `campaigns.sql`, update `mock.js` and the local backend in `backend.js` to match.**
- `sql.mjs`: runs `supabase/schema.sql` and `supabase/campaigns.sql` (twice, to prove idempotence) in PGlite and exercises the RPCs and RLS as different users.
- Most UI tests run each scenario twice: local backend, then Supabase mock. Fixtures for the import tests are in `fixtures/`.

## Notes
- `bleed.js`: Bleed/Wound Token maths (`BSH.TOKENS`). `batch4.js`: custom actions, mobs and bosses, the codex, token tags, the BLEEDING button and rest cooldowns, on both backends.
- `gifts.js` and `spawn.js` take about 100 s each and can time out.
- `et2.js` uses real dice and is occasionally flaky. Rerun before assuming a regression.
- Last full run from this folder (2026-11-20): every file passed (sql 355, combat2 94, roster 116, campaigns 266, enc 114, and the rest). The only slow-to-pass issue seen was combat2 racing the 5 s poll once; fixed by refreshing devices after changing AP.
- `compendium.js`: compendiums end to end (editor, mob ranges and drops, export/import, campaign compendium for QMs, ADD MOBS numbering, GIVE ITEM, co-QM read only, UPDATE FROM COMPENDIUM, FROM COMPENDIUM on sheets) on both backends.
- `release5.js`: Release 5 (shipped in version 4) on both backends: the QM tools column, the QM changing a player's HP / EP and DMG/HEAL, UNDO of a spend and of a finished attack (two deep, gone after END TURN), the QM's END TURN for an NPC, the roll result box.
- `release4.js`: Release 4 (version 4) on both backends: MAKE MOBS via the compendium, Talent level floor/ceiling, random looks, carried / equipped / loot drops, whole-number mob stats, no tokens or money on mobs, mobs off My Characters and deleted on removal, SAVE / EDIT locks (items, abilities, attacks, custom actions, compendium mobs), the attack Cost label.
- Areas: `combat2.js` crits and Combo Attacks, `wa.js` weapon attacks and defending, `loadatk.js` attack lists, held weapons, the Load action and QM item changes, `npcmgr.js` / `mknpc.js` NPC owner features, `enc.js` / `turns.js` encounters, `combo.js` the combo engine alone.
