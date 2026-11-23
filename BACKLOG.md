# Backlog
Either of us adds items here (bugs, ideas, questions). Newest at the top of each section. Delete an item when it's done (HISTORY.md records the change).
Format: `- [ ] (who, YYYY-MM-DD) short description; where/how to reproduce`

## Release plan (agreed 2026-11-22, not started)
- Release 4, mobs and sheet cleanup (DB change): every mob item in Ideas, plus Qty/name layout, cost label, Save/Edit lock.
- Release 5, running the table (likely DB change): QM column, QM edits player current values, QM ends NPC turn, Undo Action, visual feedback track.
- Release 6+, rules automation: magic items track, then all-abilities track (blank descriptions first), with the wound-conditions idea.

## Bugs
_none logged yet_

## Tracks
- [ ] (Ricky, 2026-11-21) Give mechanics to all abilities: go through every ability (class, totem, talent) and automate its effect where it is text only. Covers filling in the blank descriptions (Gary's Meat Matron, Spell Duelist) first.
- [ ] (Ricky, 2026-11-21) Create mechanics for magic items, namely attunement, charge recovery, and spellcasting.
- [ ] Improve visual feedback to players; half-second delays before changes, bigger text size for calculations, the result of a roll big and bright and in a highlighted box, etc.

## Ideas
- [ ] (Claude, 2026-11-21) Wound conditions beyond the tokens (Severely/Fatally Wounded extra penalties, Bodily Harm/Disaster tables), the Bleeding condition's duration, and SP spent adding a BT are not automated.
- [ ] (Ricky, 2026-11-21) Squish the Qty box over to the right side of the item, move charges and delete down, and fill the rest of the space with the name box.
- [ ] (Ricky, 2026-11-21) The cost field in the weapon attack section is unlabeled.
- [ ] (Ricky, 2026-11-21) Items and abilities should have a Save/Edit button that toggles whether or not the fields are locked. This should also extend to the compendium in general.
- [ ] (Ricky, 2026-11-21) Mobs don't need Explode, Legacy, or Totem tokens. Money can also be removed.
- [ ] (Ricky, 2026-11-21) Mobs should be able to be spawned with randomly assigned sex, age, height, and weight values.
- [ ] (Ricky, 2026-11-21) There needs to be an ability to set a total talent/proficiency level floor or ceiling on mobs, that the random variation can't exceed in either direction.
- [ ] (Ricky, 2026-11-21) The drops tab in mobs should have the option to either treat the drop like an item the mob itself is carrying or not; and if so, whether or not it spawns with that item equipped, and where.
- [ ] (Ricky, 2026-11-21) Move the QM actions in campaigns to a second column alongside the player/character roster.
- [ ] (Ricky, 2026-11-21) The Make Mobs function should create mobs from the campaign compendium, not copy NPCs. Any function to mass-copy an NPC can be removed from the code. And the stat variation should be handled solely n the mob's campaign entry, not when they're being created. Ricky (2026-11-22): variation is set on the compendium mob and applied automatically at creation; no roll step or spawn-dialog setting.
- [ ] (Ricky, 2026-11-21) Stat variation, boosts, etc. should always round to the nearest whole number, like how it works on character sheets.
- [ ] (Ricky, 2026-11-21) QMs should be able to modify current values for stats like HP on all players.
- [ ] (Ricky, 2026-11-21) Undo Action button for all players. Ricky (2026-11-22): undoes up to the last two actions; not available after the player ends their turn.
- [ ] (Ricky, 2026-11-21) QM should be able to end an NPC's turn from their preview box.
- [ ] (Ricky, 2026-11-21) Generated mobs don't need to go into my characters roster. They can just be gone when they're removed from the campaign. Ricky (2026-11-22): removal deletes them permanently.

## Watch (untested)
