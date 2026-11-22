# BLOODSOUP HELL companion app

A progressive web app (PWA): one codebase that runs in any browser and installs on iPhone, Android, Mac and Windows.

## Deploy (Netlify)
Needs HTTPS to install on phones. Drag this folder's contents (or the zip) onto Netlify's deploy area (Netlify Drop); GitHub Pages or Cloudflare Pages also work. Then open the link on each device:
- iPhone: Safari › Share › Add to Home Screen
- Android: Chrome › menu › Install app
- Mac / Windows: Chrome or Edge › install icon in the address bar

## Supabase setup (one time)
1. Create a free project at supabase.com.
2. SQL Editor › New query: paste all of `supabase/schema.sql` and press Run.
3. Same place: New query, paste all of `supabase/campaigns.sql` and press Run. (Run it after `schema.sql`. Safe to run again. If you ever re-run `schema.sql`, run `campaigns.sql` again after it.)
4. Same place: paste all of `supabase/username-login.sql` and press Run. (It lets players log in with a username instead of an email.)
5. Authentication › URL Configuration: set Site URL to your app's address (for example `https://verdant-stardust-605101.netlify.app`) and add the same address, with `/` or `/index.html` on the end if you like, under Redirect URLs. Without this the Forgot password email link will not bring players back to the app.
6. Authentication › Sign In / Providers › Email: turn off "Confirm email" and Save, so sign-up works without sending emails. Supabase's built-in email service only sends a few emails per hour; for more, add your own SMTP under Authentication › Emails › SMTP Settings.
7. `config.js` already holds your project URL and the publishable key. If the project ever changes, copy the new ones from Project Settings › API Keys (or API) into `config.js` before deploying.

Only the publishable key may go in `config.js` (it is public by design). Never use the secret or service_role key in the app.

Free Supabase projects can be paused after a stretch of no use; restore the project from the Supabase dashboard if that happens.

The Supabase JavaScript library (MIT license) is included in `vendor/` so the app works offline.

## Updating
The version is `APP_VERSION` in `app.js` and the cache name is `CACHE` in `sw.js`. Both are bumped with every push to `main` except a docs-only one, or installed copies may keep showing the old files. Each such push also makes a GitHub release with the app zip.

## Files
See `ARCHITECTURE.md` for what each file does.

## Items

- On each item (tap its line to open it): **-1 / +1** quantity, **LEFT HAND / RIGHT HAND** (one item per hand) and **BODY** for armor (only items ticked **Wearable**; any number at once; never in a hand and on the body together). Items can also be ticked **Weapon** and **Magic**; the Items tab shows what is in each hand and on the body, and **GIVE** to another character in the same campaign.
- Giving takes the quantity off the giver and adds it to the receiver (same-name items stack). Giving the last one removes the item.
- QMs get a **Give an item** form on the campaign page (any player character or NPC).
- Gifts are delivered through the `item_gifts` table and `give_item` function in `supabase/campaigns.sql` (re-run that file once). The receiving device adds the item and confirms within a few seconds.

- **Item buffs:** each item has an ITEM BUFFS card: pick a talent or skill, enter an amount (negatives allowed), and tick Hold (in a hand) and/or Wear (on the body). Neither ticked = always active while carried. Active buffs are added to the skill math automatically.
- **NPC sheets:** besides showing/hiding an NPC from the roster, a QM can HIDE SHEET: players see the name but cannot open the sheet (enforced in the database).

## Campaign roster
- Each character shows **HP, AP, SP, EP** (current / total) under its name. On your own characters (including NPCs you made) they are editable and change the same values on the sheet: HP remaining is editable on the sheet too (the old "Damage taken" field is gone; it is stored as damage behind the scenes), and AP, SP and EP have an "AP/SP/EP remaining" box on the STATS tab (blank means full). A **Damage/Healing** box with an ACCEPT button (on the sheet and on each roster entry) adds its number to HP remaining: positive heals, negative hurts. Other players' characters show the numbers read-only.
- **SKILL CHECK** opens a popup for that character: pick a skill (its modifier is listed), then ROLL D20 or type your own roll and SET ROLL. A natural 1 takes off 5, a natural 20 adds 5. The result is shown only to whoever is rolling. CLOSE (or Escape) closes it.

- **Actions > Rest** lists the five rests from the rulebook (Respite, Short, Full, Long, Extended). On your own characters, TAKE opens a roller: ROLL (or ROLL ALL) per die, or type the number from your own die (the natural 1 and 20 rule does not apply). APPLY REST then adds the HP and EP (never above the totals); Extended Rest restores both to full. Bleed Tokens, Wound Tokens and rest cooldowns are shown in the text but not tracked.

## Encounter turns
- The roster is PCs first, then NPCs, newest first. During an encounter it follows the turn order: highest initiative first, and equal totals are settled by a random tie-break drawn when each roll is saved (so every device shows the same order). Characters who have not rolled sit at the bottom.
- A **>** arrow and a highlight mark whose turn it is, starting with the first in initiative. That player gets **END TURN**; the QM gets **ADVANCE TURN** (ends the current turn, for a player or an NPC) and **ASSIGN TURN** (pick any character that has rolled). The **ROUND** counter starts at 1 and goes up when the turn passes from the last character back to the first; Assign Turn never changes it.
- **Spending points:** during an encounter the Actions card shows **AP Remaining** and **SP Remaining**, and each cost box becomes a button for the character's owner (the QM can do it for anyone). Pressing it shows "Action Performed" and takes the cost off. You can't spend more AP/SP than is left.
- **Weapon attacks:** every item marked as a weapon adds an "Attack: <name>" row to the Actions card, after Unarmed Strike. Its card shows the weapon's Type, Size, Weight, Dmg Type, Range, CR, Attack Dmg and Effect, and its cost box (the weapon's Cost, e.g. "2 AP") spends AP/SP like any other action. A weapon with no cost, or a cost not written as "N AP"/"N SP", shows no spend button.
- **Attacking:** during an encounter, the cost box on Unarmed Strike or an "Attack: <weapon>" row opens an attack card (for the character's owner, or the QM). Pick a target (anyone else in the encounter whose sheet you can see), then ROLL D12 or type your own d12 and press ATTACK WITH MY ROLL. The roll is d12 + your SA, with a 1 giving -5 and a 12 giving +5; a total **higher than the target's DA** hits. Attack Pwr is worked out from the weapon's Attack Dmg (BP, flat numbers and dice such as "BP+2+1D6"; Unarmed Strike is BP), the target's AC is subtracted, and what is left comes off the target's HP. The AP/SP cost is spent when you attack, hit or miss. If a weapon's Attack Dmg isn't a formula the app can read, a hit is reported and you apply the damage by hand. **Re-run `supabase/campaigns.sql`** (adds `deal_damage`).
- **Block / Parry:** if the target has at least 1 AP and an equipped item with a CR, an attack waits for them instead of landing at once. Their device shows an "under attack" box (a QM answers for NPCs): BLOCK / PARRY (ROLL D12, or type your own roll) spends 1 AP and adds the d12 plus their highest equipped CR to their DA for this attack; TAKE IT leaves the DA alone. The attacker sees the outcome on the attack card. If the defender doesn't respond, the QM sees an ATTACK WAITING banner on the campaign page with a **NO BLOCK** button, which finishes the attack with no change to the defender's DA. Only the first attack roll has the 1 = -5 and 12 = +5 rule; Attack Dmg dice and the block roll are plain. Targets who can't block are resolved straight away, as before.
- **Explode Tokens (ET):** a character holds 0 to 10 (INFO tab). The QM hands them out with **GIVE EXPLODE TOKENS** on the campaign page (tick the players, pick 1-3; dead characters can't gain them). Next to every roll button (initiative, skill checks, attack, block/parry, rests) there is a **Spend ET on this roll** stepper: declare how many tokens before you roll. After the dice land, the ET box lets you place each token on a die. A token adds 1 to a die; a token on a die already on its highest number makes it **explode** into another die of that type, and every die (including exploded ones) can explode once. With one die the tokens are placed for you; with several (an attack plus its damage dice, or rest dice) you choose, and you can place tokens in rounds. DONE takes the tokens off; CANCEL ROLL spends nothing. The 1 / highest-number rule on skill checks, attacks and initiative looks at the natural roll, before tokens. Typed-in numbers still work with tokens, except in rests (typed rest numbers are taken as they are). Initiative: the tokens are added into the stored Initiative Bonus. **Abilities:** *Lucky* offers a 3 ET reroll of a die; *Always So Defensive* offers a 1 ET reroll of a natural 1 on a skill check (only use it against an enemy's ability); *Flashy* makes each ET count as 2 on attack and damage rolls; *Explosive Personality* adds 1 ET each rest. Not handled: Spiritual Guidance (spending a dead character's ET on someone else's roll) and rolls inside Spawn Character. **Re-run `supabase/campaigns.sql`** (adds `set_explode_tokens`).
- **Start of turn:** the character gets all lost AP back and gains SP: 1, plus 1 for every 10 full points of max SP (nothing if AP was 0 going into the turn). The first turn of an encounter gets no recovery. It happens once per turn, from the owner's device or the QM's.
- **Events (QM):** **ADD EVENT** takes a name and an initiative number and drops it into the turn order. Events are hidden from players by default (**SHOW TO PLAYERS / HIDE FROM PLAYERS**, **REMOVE**); the QM presses END TURN / ADVANCE TURN for them. Tick **One Time** and pick a round to have the event exist in that round only (it sits at the bottom marked LATER until then). Hidden events are kept in their own table so players' devices never receive their names.
- Needs the updated `campaigns.sql` (turn functions, `set_vital`, `start_turn`, the events table and `add_event` / `set_event_visible` / `remove_event`; initiative rolls carry a tie-break).

## Spawn Character
- **SPAWN CHARACTER** (QM, campaign page) asks "Who is this character for?" with a checkbox for every member (tick any number, or none for an NPC), then starts a turn-based character creation. Everyone in the campaign is taken to the spawn page, which lists the non-QM players (by username) in a random order and has a **VIEW CHARACTER SHEET** button that opens the character as it stands (read only).
- Turns, in order (it wraps round if there are fewer players than steps): physical description (1-3 sentences) -> pick 1 of 2 random abilities -> pick 1 of 2 random fighting styles -> pick 1 of 2 random weapons (added as a weapon item) -> backstory -> motivation. Then every player at once does four sets of: +2 to a talent, -1 to a different talent, +1 proficiency to a skill.
- The database does the dice (player order, the two options, and which ticked player gets the character). The abilities (d20), fighting styles (d8) and weapons (all 12 weapon types, which fills the blank rows 6 and 12 of the Weapons Table) come from `spawndata.js`, copied from the rulebook.
- If the new owner has characters in the campaign whose **Alive** box is unticked, they pick one as the previous incarnation (or none); the new sheet's Incarnation is that character's number + 1 (a blank number counts as 1). The new character appears on the owner's device; with nobody ticked a QM's device saves it as a hidden NPC.
- The QM can **SEND BACK ONE STEP** (the rulebook gives the QM veto: that choice is wiped and fresh options are rolled) or **CANCEL SPAWN**.
- Special abilities (Battle Versatility, Indecisive, Highly Capable) are added as text; roll and apply their extra picks by hand. Needs the updated `campaigns.sql` (`campaigns.spawn` plus the `start_spawn`, `spawn_submit`, `spawn_points`, `spawn_incarnation`, `spawn_veto`, `cancel_spawn` and `finish_spawn` functions).

## Encounter maps
- On the campaign page the QM gets **CREATE ENCOUNTER MAP** and every member gets **VIEW ENCOUNTER MAPS**. The editor takes a name and a picture (shrunk to 1600 px and saved as JPEG), then you fit the grid: **square size**, **X / Y** position of the top-left corner (all in the picture's own pixels), and **columns / rows**. Changing size or position refills columns and rows to cover the picture until you type them by hand; **FILL THE PICTURE** refills them again.
- Maps start hidden. The QM shows or hides each one (**SHOW TO PLAYERS / HIDE FROM PLAYERS**), edits it (the picture is kept unless you choose a new one) or deletes it (tap twice). Players only receive the maps that are shown. The viewer has ZOOM IN / ZOOM OUT / FIT.
- **In an encounter:** the QM's encounter banner has **ADD MAP** (pick one of the campaign's maps; then CHANGE MAP / REMOVE MAP). Everyone gets a **MAP** tab on the left edge of the encounter page and an **ENCOUNTER** tab on the right edge of the map to flip between the two. The map is open to players for as long as the encounter lasts even if it is still hidden in the list; ending the encounter or removing the map closes it. Needs `set_encounter_map` from the updated `campaigns.sql`.
- **Tokens:** while the encounter map is open, a **Tokens** panel lists the characters you may place (your own; the QM gets everyone, NPCs too). **DROP ON MAP** puts the token on the first free grid square; drag it to move (it snaps to the grid), or tap it and use the arrows. Tap any token to see the character's name for 3 seconds. A token is a coloured circle with the character's initiative number unless the character has a **Map token** picture (INFO tab, shrunk to 96 px), which replaces it. Tokens last as long as the map is in the encounter (changing or removing the map, or ending the encounter, clears them). A hidden NPC's token is never sent to players. Needs `encounter_tokens`, `set_token` and `remove_token` from the updated `campaigns.sql`.
- Pictures live in the database (up to 30 maps per campaign). Needs the updated `campaigns.sql` (`encounter_maps` table and the `save_map`, `set_map_visible`, `delete_map` functions).

## Rules page and version

- **RULES** (center top of every screen) opens the rulebook, converted from `Rulebook_0.3.odt` into `rules.js`. The contents list is clickable. To update the rulebook, send a new .odt and it gets re-converted.
- **GUIDE** opens the user guide (how to use the app), on the same dark-gray page with a clickable contents list. It has a button on the title page and the home screen, and replaces RULES at the top center while you are reading the rulebook (and RULES is there while you read the guide). The text lives in `USER_GUIDE.md`; run `python3 tools/build_guide.py` after editing it to rebuild `guide.js`. Edit the .md, never `guide.js`.
- The app version shows at the bottom of the title page. It lives in `app.js` as `APP_VERSION` and only changes when Ricky asks.
- **Weapons:** ticking Weapon on an item shows the rulebook's weapon properties (Type, Size/Style, Weight, Dmg Type, Range, Cost, CR, Attack Dmg, Effect). They are free text and travel with the item when it is given.
- **Magic items:** ticking Magic shows Type, Attunement, Max Charges, Effect and a Spellbook checkbox. The Charges field on the item line appears only for magic items; it runs from 0 up to Max Charges (setting Max Charges fills it, lowering the max pulls it down). All of it travels with the item when it is given.

## Describe card, incarnation default, import / export
- When a spawned character is handed to a player, a **Describe Your Character** card opens on that player's device asking for name, species, sex, age, height, weight and money (SAVE, or LATER to fill it in on the sheet). NPCs skip it.
- New characters start with **Incarnation 1** (existing sheets with a blank Incarnation are left alone).
- **EXPORT SHEET** (top of any character sheet, including ones you are only viewing) downloads `<name>.bloodsoup.json`: the whole sheet, without its id, campaign or owner. **IMPORT CHARACTER** (on the Characters list) loads such a file as a new character of your own (new id, not in any campaign). The import rebuilds every field with limits (text lengths, number-only fields, 9 talents and so on) and refuses files that are not from this app, so a damaged or hand-edited file can't put anything odd on a sheet.

## Make NPC

A QM can turn any character in their campaign into an NPC, including one already handed to a player: open the sheet (yours, or a player's from the campaign page), go to the Info tab and tap MAKE NPC twice. The character moves to the QM as a hidden NPC of that campaign and the player loses it. Re-run `supabase/campaigns.sql` once (adds `make_npc`).

## NPC owners, the NPCs list, and managing NPCs

Every NPC has an **owner** (the QM who made it). NPCs are listed on the owner's Characters page under their own **NPCs** heading, whether or not they are in a campaign. An NPC outside any campaign simply stays there, on its owner's page, with "no campaign" beside it. Deleting a campaign, or a QM leaving it, no longer deletes its NPCs: they leave the campaign and stay with their owner (hidden).

On an NPC's sheet (Info tab, under the campaign field):
- In a campaign, a QM of that campaign sees **MOVE NPC** (to another campaign you are also QM of; its owner must be in that campaign; it arrives hidden), **GIVE CONTROL** (the NPC becomes that player's ordinary character) and **REMOVE FROM CAMPAIGN** (it is kept, with its owner).
- Outside a campaign, its owner sees **ADD TO CAMPAIGN** (a campaign they are QM of; it arrives hidden).
- To delete an NPC for good, the owner uses DELETE CHARACTER at the bottom of its sheet.

Each action needs a second tap. Taking an NPC out of a campaign, moving it or giving it away also takes it out of any running encounter (initiative, map token, and the turn if it was theirs).

Not changed: a QM who steps down still passes their NPCs in that campaign to a QM who stays. Re-run `supabase/campaigns.sql` once (adds `unlink_npc`, `move_npc`, `give_npc`, `add_npc_to_campaign`, and changes what happens to NPCs when a campaign is deleted).

## Critical hits, critical misses, and Combo Attacks
- **Absorbed hits:** a hit whose Attack Pwr is at or below the target's AC is still a hit; it just deals 0 damage.
- **Crits:** an attack that beats the target's DA by 10 or more is a **Critical Hit**: the damage after AC is doubled. An attack that misses by 10 or more is a **Critical Miss**: the attacker recovers 2 less AP when their next turn starts.
- **Combo Attack** (Actions menu, 3 AP): the Leader picks a Finisher (another character in the encounter), picks one of the 8 combo skills and rolls a d20 (Explode Tokens allowed). The result sets the Combo Level (0/10/15/20/25) and is held until the Leader's next turn begins.
- On their turn the Finisher ticks **Combo Attack with <Leader>** in a weapon attack card. The Leader then gets a prompt to pick an attack and roll, and the target defends against both as normal. The bonus applies to both attackers; a hit can become a crit retroactively. If both miss, the Finisher rerolls a plain d12.
- The Finisher can decline a waiting combo (the Leader gets the 3 AP back). A combo also ends if either character leaves the encounter.
- **Database:** re-run `supabase/campaigns.sql` (new RPCs and changed `start_turn`, `start_attack`, `resolve_attack`).

## Bleed and Wound Tokens, rest cooldowns, custom actions, mobs and the codex
- **Tokens:** `vitals.bt`, `vitals.wt` and `vitals.bleeding` (STATS tab, roster tags, roster BLEEDING button). Every 20 BT and every WT cuts all Aggregate Stats 10%; 2+ WT is -5 on Skill Checks and 3+ WT is disadvantage (the popup shows it); 20+ BT doubles SP costs; 50+ BT stuns and 100+ incapacitates (tags). Bleeding adds a BT at each turn start and each hit; a hit of 25/50/75% of max HP adds 1/2/3 WT. Rests roll how many BT come off; Extended Rest clears all BT and 1 WT. Respite and Short Rest lock until 2 / 6 EP are recovered by other rests (`vitals.restCd`). Engine: `BSH.TOKENS`.
- **Custom actions:** `customActions` on a character (ABILITIES tab): name, cost (`2 AP` / `1 SP` gets a spend button), description. Listed in the Actions menu before Rest. Included in sheet export/import.
- **MAKE MOBS** (QM, campaign page): copies a chosen NPC N times (1-20) as hidden NPCs, each combat stat's % adjustment moved by the boost plus a random amount within the variation. `info.kind` is `mob` or `boss`, `info.mobBase` the shared name.
- **CODEX** (campaign page): `campaigns.codex` holds `mobs` and `items` entries and a `removed` list. Any member's app records visible mobs/bosses and items once (`codex_record`); only a QM removes (`codex_remove`), and a removed key is not recorded again.
- **Database:** re-run `supabase/campaigns.sql` (`set_vital` now also sets `bt`, `wt`, `bleeding`; new `campaigns.codex` column and `codex_record` / `codex_remove`).
