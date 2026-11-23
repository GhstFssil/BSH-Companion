# Backlog
Either of us adds items here (bugs, ideas, questions). Newest at the top of each section. Delete an item when it's done (HISTORY.md records the change).
Format: `- [ ] (who, YYYY-MM-DD) short description; where/how to reproduce`

## Release plan (agreed 2026-11-22)
- Release 4, mobs and sheet cleanup (DB change): built on `next` 2026-11-23, not yet published.
- Release 5, running the table (DB change): built on `next` 2026-11-23, not yet published.
- Release 6+, rules automation: magic items track, then all-abilities track (blank descriptions first), with the wound-conditions idea.

## Bugs
_none logged yet_

## Tracks
- [ ] (Ricky, 2026-11-21) Give mechanics to all abilities: go through every ability (class, totem, talent) and automate its effect where it is text only. Covers filling in the blank descriptions (Gary's Meat Matron, Spell Duelist) first.
- [ ] (Ricky, 2026-11-21) Create mechanics for magic items, namely attunement, charge recovery, and spellcasting.

## Ideas
- [ ] (Claude, 2026-11-21) Wound conditions beyond the tokens (Severely/Fatally Wounded extra penalties, Bodily Harm/Disaster tables), the Bleeding condition's duration, and SP spent adding a BT are not automated.

## Watch (untested)
- [ ] (Claude, 2026-11-23) Version 4 layout (item row with Qty at the right, Charges/REMOVE inside the item, drop Carried row, SAVE/EDIT buttons, labelled attack Cost) is tested in jsdom only, not seen in a real browser; check on a phone.
- [ ] (Claude, 2026-11-23) Version 5 QM column, UNDO button, roll result box and value flashes are tested in jsdom only, not seen in a real browser.
- [ ] (Claude, 2026-11-23) Undo restores whole snapshots: anything else that happened to those characters in between is undone too, and ammo spent by Load is not given back.
