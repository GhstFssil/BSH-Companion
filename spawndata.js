/* Tables from the rulebook used by Spawn Character (generated from rules.js: Abilities Table d20, Fighting Styles Table d8,
 * Weapon Types d12 - the Weapons Table's blank rows 6 and 12 are Pike and Crossbow). The database only picks the row numbers. */
window.BSH_SPAWN_DATA = {
 "abilities": [
  {
   "name": "Meat Matron",
   "desc": "When you die, you may expend 1 Totem Token or 1 Legacy Token to cause up to 2 other dead characters in your party to reincarnate immediately."
  },
  {
   "name": "Battle Versatility",
   "desc": "Roll a fighting style; you are treated as having this fighting style in addition to any others you have."
  },
  {
   "name": "Prepared For the Worst",
   "desc": "You start with 3 general purpose items instead of 1."
  },
  {
   "name": "Bat Out Of Hell",
   "desc": "You can spend 4 SP to move twice your RD in a single move action."
  },
  {
   "name": "Explosive Personality",
   "desc": "You gain 1 ET each time you rest."
  },
  {
   "name": "Always So Defensive",
   "desc": "Once per action, you can expend 1 ET to reroll a 1 when making a skill check against an enemy’s ability."
  },
  {
   "name": "No Sell",
   "desc": "You can expend 8 EP to negate the damage done to you by a single hit."
  },
  {
   "name": "Rolling In Their Graves",
   "desc": "Other players have a total of 3 free uses of spiritual guidance on you while you’re alive. When you’re dead, you may use spiritual guidance 5 times instead of 3"
  },
  {
   "name": "Lazy",
   "desc": "The benefits you gain from resting are doubled, but your AP and RD are reduced by -20%"
  },
  {
   "name": "Indecisive",
   "desc": "Roll 2 abilities and select 1; you are treated as though you have that ability instead of this one until you are reincarnated."
  },
  {
   "name": "Spell Duelist",
   "desc": "You can equip a spellbook and open it to a Key Page as a single action for 2 AP."
  },
  {
   "name": "Making the Dream Work",
   "desc": "When you make a Skill Check to initiate a Combo Attack, you can expend 1 ET to reduce the AP cost by -1, to a minimum of 1."
  },
  {
   "name": "Lucky",
   "desc": "Any time you roll a die and don’t like the result, you may expend 3 ET to reroll it."
  },
  {
   "name": "Perfectionist",
   "desc": "Your Perfect Combo range is increased by +1 if you are the Leader; e.g. if it was a difference of 0, it becomes 0-1. This supersedes but does not change your Critical Combo range."
  },
  {
   "name": "Critical Reave Theory",
   "desc": "The maximum of your Critical Combo range is increased by +1 if you are the Leader; e.g. if it was a difference of 1-3, it becomes 1-4."
  },
  {
   "name": "Survivor",
   "desc": "If you are the only living member of your party, all of your aggregate stats are increased by 25% and you may expend 3 ET and 3 AP to restore your HP by 25% as an action for the duration."
  },
  {
   "name": "Shamanic Shuffle",
   "desc": "When another member of your party is reincarnated, you may swap this ability with one of their Legacy Bonuses (they now have this ability and you now have the one you selected)."
  },
  {
   "name": "Gone But Not Forgotten",
   "desc": "If another character in your party is dead, you may select one of their Legacy Bonuses; you are treated as having that ability until they are reincarnated."
  },
  {
   "name": "Forgotten But Not Gone",
   "desc": "When you die, you may expend a Totem Token or a Legacy Token to reincarnate immediately."
  },
  {
   "name": "Highly Capable",
   "desc": "Roll 2 abilities; you are treated as though you have both of them instead of this ability until you are reincarnated."
  }
 ],
 "styles": [
  {
   "name": "Defender",
   "desc": "Add +2 to your CR when blocking or parrying; you make rolls to hit with a D10 instead of a D12."
  },
  {
   "name": "Keen",
   "desc": "Your critical hit threshold is reduced by -3"
  },
  {
   "name": "Scrapper",
   "desc": "You have advantage to hit any combatant that hit you since the end of your last turn"
  },
  {
   "name": "Janitor",
   "desc": "You have advantage to hit any combatant that has been hit since the end of your last turn"
  },
  {
   "name": "Mobile",
   "desc": "You can expend 2 SP to take the shift action for 0 AP; cannot be used if your last action was a shift action"
  },
  {
   "name": "Flashy",
   "desc": "Any time you use an ET on an attack or damage roll, it is treated as 2 ET."
  },
  {
   "name": "Quickdraw",
   "desc": "Your AP cost for equipping a spellbook and accessing the keyrune is reduced by -1."
  },
  {
   "name": "Ambusher",
   "desc": "You have advantage to hit any combatant that is surprised or doesn’t detect you."
  }
 ],
 "weapons": [
  {
   "type": "Dagger",
   "size": "Light Melee",
   "weight": "1",
   "damage": "Sharp",
   "range": "0-1",
   "cost": "2 AP",
   "cr": "0",
   "dmg": "BP+1D4",
   "effect": "If you make a Weapon Attack as an Action using a different Light Weapon with your other hand, you can make a Weapon Attack using this weapon as a Reaction for 1 AP."
  },
  {
   "type": "Shortsword",
   "size": "Light Melee",
   "weight": "2",
   "damage": "Sharp",
   "range": "0-1",
   "cost": "2 AP",
   "cr": "1D4",
   "dmg": "BP+2+1D6",
   "effect": "none"
  },
  {
   "type": "Longsword",
   "size": "Balanced Melee",
   "weight": "4",
   "damage": "Sharp",
   "range": "1",
   "cost": "2 AP",
   "cr": "1+1D4",
   "dmg": "BP+3+1D6",
   "effect": "none"
  },
  {
   "type": "Greatsword",
   "size": "Heavy Melee",
   "weight": "7",
   "damage": "Sharp",
   "range": "1",
   "cost": "3 AP",
   "cr": "2+1D2",
   "dmg": "BP+4+1D8",
   "effect": "Must be wielded with two hands"
  },
  {
   "type": "Shortbow",
   "size": "Light Projectile",
   "weight": "1",
   "damage": "Sharp",
   "range": "5-20",
   "cost": "3 AP",
   "cr": "0",
   "dmg": "BP+1D6",
   "effect": "Must be used with 2 hands. You can only Attack with this weapon as a Readied Action. Attacking with this weapon expends 1 arrow. You can make a Weapon Attack at half or double range with disadvantage to hit."
  },
  {
   "type": "Hunting Bow",
   "size": "Balanced Projectile",
   "weight": "2",
   "damage": "Sharp",
   "range": "5-15",
   "cost": "3 AP",
   "cr": "0",
   "dmg": "BP+3+1D6",
   "effect": "Must be used with 2 hands. You can only Attack with this weapon as a Readied Action. Attacking with this weapon expends 1 arrow. You can make a Weapon Attack at half or double range with disadvantage to hit."
  },
  {
   "type": "Mace",
   "size": "Balanced Melee",
   "weight": "4",
   "damage": "Blunt",
   "range": "0-1",
   "cost": "2 AP",
   "cr": "1D4",
   "dmg": "BP+1D6",
   "effect": "Ignores up to 3 AC"
  },
  {
   "type": "Warhammer",
   "size": "Heavy Mid-Range",
   "weight": "10",
   "damage": "Blunt",
   "range": "1-2",
   "cost": "4 AP",
   "cr": "0",
   "dmg": "BP+1D10",
   "effect": "Must be wielded with two hands. Ignores up to 5 AC."
  },
  {
   "type": "Spear",
   "size": "Light Mid-Range",
   "weight": "2",
   "damage": "Sharp",
   "range": "1-2",
   "cost": "2 AP",
   "cr": "0",
   "dmg": "BP+2+1D6",
   "effect": "You can make a Weapon Attack treating this weapon as a Projectile with a range of 3-10 by throwing it. It is then removed from your inventory and must be retrieved to be used again."
  },
  {
   "type": "Glaive",
   "size": "Balanced Mid-Range",
   "weight": "4",
   "damage": "Sharp",
   "range": "1-2",
   "cost": "2 AP",
   "cr": "1D4",
   "dmg": "BP+3+1D6",
   "effect": "Must be wielded with two hands. If a target enters your range with this weapon, you can make a Weapon Attack against it as a Reaction for 1 AP."
  },
  {
   "type": "Pike",
   "size": "Light Mid-Range",
   "weight": "3",
   "damage": "Sharp",
   "range": "1-2",
   "cost": "2 AP",
   "cr": "1D4",
   "dmg": "BP+1D6",
   "effect": "If a target enters your range with this weapon, you can make a Weapon Attack against it as a Reaction for 1 AP."
  },
  {
   "type": "Crossbow",
   "size": "Heavy Projectile",
   "weight": "10",
   "damage": "Sharp",
   "range": "5-15",
   "cost": "3 AP",
   "cr": "0",
   "dmg": "BP+4+1D10",
   "effect": "You can only attack with this weapon if it’s armed; you may spend an action to arm it for 5 AP. Attacking with this weapon expends 1 crossbow bolt. You can make a Weapon Attack at half or double range with disadvantage to hit. Disadvantage to hit if used with one hand."
  }
 ]
};
