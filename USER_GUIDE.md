# Bloodsoup Hell Companion: User Guide

This guide explains how to use the Companion app. For how the game itself works, tap **RULES** (top center of every screen).

## 1. Getting started

**Install it.** The app runs in any browser, and you can install it like an app. On iPhone, open it in Safari, tap Share, then Add to Home Screen. On Android or desktop Chrome, use the Install option in the browser menu. Once installed it opens full screen like any other app. You still need an internet connection to log in and play with your group.

**Create an account.** On the title page tap **CREATE ACCOUNT** and fill in:
- **Name**: what the app calls you.
- **Username**: 3 to 20 letters, numbers or underscores. This is how you log in and how other players see you.
- **Email**: used to reset your password if you forget it.
- **Password**: at least 8 characters.

**Log in** with your username and password. If you forget your password, tap **FORGOT PASSWORD** and follow the emailed link (it works once and expires).

After logging in, tap **ENTER THE RING** on the title page to reach the home screen.

## 2. The home screen

| Button | What it does |
|---|---|
| **CHARACTERS** | Your characters and NPCs |
| **CAMPAIGNS** | Campaigns you belong to |
| **CREATE CAMPAIGN** | Start a new campaign (you become its QM) |
| **JOIN CAMPAIGN** | Join a campaign that already exists |
| **OPTIONS** | Text size and color (saved on this device only) |

The **RULES** button stays at the top center of every screen.

## 3. Characters

Tap **NEW CHARACTER** to make a blank sheet, or **IMPORT CHARACTER** to load a `.bloodsoup.json` file exported from another copy of the app. Tap a character to open its sheet.

Sheets save automatically. The sheet has nine tabs:

- **INFO**: name, species and other details, incarnation, the campaign this character is linked to, a map token picture, and the Explode Token count.
- **STATS**: the calculated numbers, plus the AP, SP and EP "remaining" boxes.
- **TALENTS** and **SKILLS**: the core of the Coriander System. The app does the math for you.
- **TOTEM**
- **BUFFS**: item and other buffs that feed into your skills.
- **ITEMS**: what you carry, and what is in each hand and on your body.
- **ABILITIES**
- **STORY**

**Tracking HP and other points.** HP remaining is editable right on the sheet. AP, SP and EP have "remaining" boxes on the STATS tab (leave blank for full). The **Damage/Healing** box with **ACCEPT** adds its number to HP remaining: positive heals, negative hurts.

**Items.** Tap an item to open it. You can change its quantity (**-1 / +1**), put it in your **LEFT HAND** or **RIGHT HAND** (one item per hand), or wear it on your **BODY** (only items ticked Wearable). Tick **Weapon** to get weapon fields (Type, Size, Weight, Damage Type, Range, Cost, CR, Attack Dmg, Effect) and **Magic** for magic fields (Type, Attunement, Max Charges, Effect, Spellbook). **GIVE** passes an item to another character in your campaign.

**Item buffs.** Each item has an ITEM BUFFS card: pick a talent or skill, enter an amount (negatives allowed), then tick **Hold** (active while in a hand) and/or **Wear** (active on the body). If neither is ticked, the buff is active whenever you carry the item.

**Sharing a sheet.** **EXPORT SHEET** at the top of a sheet downloads it as a file. Anyone can load it with IMPORT CHARACTER as a new character of their own.

**Deleting.** DELETE CHARACTER is at the bottom of the sheet. Each destructive button needs a second tap to confirm.

## 4. Campaigns

A campaign is your group. Whoever creates it is its **QM** (the game master role).

**Joining.** Tap **JOIN CAMPAIGN**, then choose a campaign from the list.

**Linking a character.** Open the character's sheet, go to the INFO tab and pick the campaign under **Linked campaign**. You can unlink at any time. Once linked, other members can see your character on the campaign page (read-only), and you can use it in encounters.

**On the campaign page you will see:**
- The member list, with each character's **HP, AP, SP and EP**. Your own characters are editable here too. Other people's are read-only.
- **SKILL CHECK** on any of your characters. Pick a skill, then **ROLL D20** or type your own roll and tap **SET ROLL**. A natural 1 takes off 5 and a natural 20 adds 5. Only the person rolling sees the result.
- **Actions > Rest** for the five rests from the rulebook. Tap **TAKE**, roll the dice (or type your own numbers), then **APPLY REST**. Bleed and Wound tokens and rest cooldowns are shown in the text but not tracked by the app.
- **VIEW ENCOUNTER MAPS**.
- **LEAVE CAMPAIGN**, or **BECOME A PLAYER** if you are a QM and want to step down. Both need a second tap.

## 5. Encounters

When the QM starts an encounter, a popup appears on everyone's device: **An Encounter Has Begun!** Roll initiative for each of your characters with **ROLL D20** (or type your own roll). The result adds your Initiative Bonus. A 1 takes off 5 and a 20 adds 5.

**Turn order.** The roster re-sorts by initiative, highest first. A **>** arrow and highlight mark whose turn it is. The **ROUND** counter goes up each time the turn passes from the last character back to the first. When you finish, tap **END TURN**. (The QM uses **ADVANCE TURN**, which also works for NPCs.)

**Start of your turn.** You get back the AP you spent and gain some SP, automatically. The first turn of an encounter gets no recovery.

**Spending points.** In an encounter, each action's cost box on the Actions card becomes a button. Tap it to spend the AP or SP. You can't spend more than you have.

**Attacking.**
1. Tap the cost box on **Unarmed Strike** or an **Attack: &lt;weapon&gt;** row.
2. Pick a target.
3. Tap **ROLL D12** (or type your own roll), then **ATTACK WITH MY ROLL**.

Your roll is a d12 plus your SA. A natural 1 gives -5 and a natural 12 gives +5. If the total is **higher than the target's DA**, it hits. Damage is your Attack Power minus the target's AC, never below 0. A hit that AC fully absorbs still counts as a hit, it just does 0 damage.

**Critical results.** Beat the target's DA by **10 or more** and it is a **Critical Hit**: damage after AC is doubled. Miss by 10 or more and it is a **Critical Miss**: you recover 2 less AP at the start of your next turn.

**Being attacked.** If you have at least 1 AP and an equipped item with a CR, an "under attack" box appears on your device. **BLOCK / PARRY** spends 1 AP and adds a d12 plus your best equipped CR to your DA for that attack. **TAKE IT** leaves your DA alone. If you don't answer, the QM can finish the attack with **NO BLOCK**.

**Combo Attacks** (3 AP). From the Actions menu, the **Leader** picks a **Finisher** (another character in the encounter) and one of the 8 combo skills, then rolls a d20. The result sets the Combo Level (0, 10, 15, 20 or 25), and the combo is held until the Leader's next turn begins. On their turn, the Finisher ticks **Combo Attack with &lt;Leader&gt;** when making a weapon attack. The Leader is then prompted to roll an attack, and the target defends against both. The bonus applies to both attackers. If both miss, the Finisher rerolls a plain d12. The Finisher can decline, which refunds the Leader's 3 AP. A combo also ends if either character leaves the encounter.

**Advantage and disadvantage.** Next to the roll buttons (skill checks, initiative, attacks, combo rolls and block/parry) is an **ADV / DIS** stepper. Tap **ADV** once for advantage: the app rolls two dice and keeps the better one. Tap twice for great advantage (three dice, keep the best). **DIS** does the same with the worse die, and one ADV and one DIS cancel out. Past two taps in either direction the roll simply counts as the highest number on the die (or a 1). Attacks and blocks use d12s; other rolls use d20s. The stepper only affects the app's own ROLL button and resets after each roll. If you roll your own dice, enter the one you keep.

**Explode Tokens (ET).** A character holds 0 to 10 (INFO tab), handed out by the QM. Beside every roll button is a **Spend ET on this roll** stepper: choose how many tokens before you roll. After the dice land, place each token on a die. A token adds 1 to a die, and a token on a die already showing its highest number makes it **explode** into another die of that type. Tap **DONE** to spend them, or **CANCEL ROLL** to spend nothing. A natural 1 or highest-number check looks at the roll before tokens.

**The map.** If the QM has added a map, a **MAP** tab appears on the left edge of the encounter page. In the **Tokens** panel, **DROP ON MAP** puts your token on the grid. Drag it to move (it snaps to squares), or tap it and use the arrows. Tap any token to see whose it is.

## 6. For QMs

Everything above, plus:

**Running a campaign**
- **MAKE QM / REMOVE QM** on any member, and removing players. A campaign always keeps at least one QM: if the last one leaves, a random player takes over.
- **DELETE CAMPAIGN** (second tap to confirm). Its NPCs are kept, not deleted.

**Encounters**
- **START ENCOUNTER** and **END ENCOUNTER**.
- **ASSIGN TURN** picks any character that has rolled initiative. It never changes the round number.
- **ADD EVENT** drops a named event into the turn order (for example "the ceiling collapses" at initiative 15). Events are hidden from players by default, and you can **SHOW TO PLAYERS**, **HIDE FROM PLAYERS** or **REMOVE** them. Tick **One Time** to have an event exist in one round only.
- **GIVE EXPLODE TOKENS**: tick the players, pick 1 to 3.
- **ROLL DAMAGE**: for traps, spells and anything outside a normal attack. Pick the target, type a formula such as `BP+3+1D6` or `2D8+4`, and (if it uses BP) whose BP to use. Tick **Ignore AC** or **Critical** if they apply. **ROLL** shows the dice and the result, then **APPLY** deals it. Changing anything after a roll clears it, so you must roll again.
- **ADD MAP** attaches one of the campaign's maps to the current encounter.

**NPCs**
- Make an NPC by opening any character's sheet in your campaign (even a player's), going to the INFO tab and tapping **MAKE NPC** twice. It moves to you as a hidden NPC and the player loses it.
- Show or hide each NPC from the roster. **HIDE SHEET** lets players see an NPC's name but not open its sheet.
- NPCs appear on your Characters page under **NPCs**. On an NPC's INFO tab: **MOVE NPC** (to another campaign you run), **GIVE CONTROL** (turns it into a player's ordinary character), **REMOVE FROM CAMPAIGN** (kept, not deleted), or **ADD TO CAMPAIGN** if it is currently in none.
- You can roll and act for any NPC in an encounter.

**Items.** Use the **Give an item** form on the campaign page to give an item to any player character or NPC.

**Spawn Character.** **SPAWN CHARACTER** runs the turn-based character creation from the rulebook. Choose who the character is for (tick players, or none for an NPC), and everyone in the campaign is taken to the spawn page. Players take turns choosing a description, an ability, a fighting style, a weapon, a backstory and a motivation, then everyone adjusts talents and skills together. You can **SEND BACK ONE STEP** to veto a choice or **CANCEL SPAWN**. When it finishes, the new owner fills in a **Describe Your Character** card.

**Maps.** **CREATE ENCOUNTER MAP** takes a name and a picture, then you fit the grid (square size, X/Y position, columns and rows, or **FILL THE PICTURE**). Maps start hidden. Use **SHOW TO PLAYERS / HIDE FROM PLAYERS** to reveal them.

## 7. Options and tips

- **OPTIONS** changes text size and color. These settings stay on the device you set them on.
- Campaign screens refresh about every 5 seconds, so a change by another player may take a moment to appear.
- If the app seems out of date after an update, close it fully and reopen it. The version number is at the bottom of the title page.
- Bleed Tokens, Wound Tokens and rest cooldowns are not tracked yet. Keep track of those at the table.
