/* BLOODSOUP HELL character engine
 * A direct port of BSH_Skillsheet_3.2 (Aggregate / Base / Totem / Buffs-Debuffs tabs).
 * Pure functions, no DOM: works in the browser (window.BSH) and in Node (module.exports).
 * Percent inputs are WHOLE percents here (10 means 10%), matching how they are typed in the sheet.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BSH = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- Static definitions ---------- */

  // Order matches the sheet's 3x3 talent blocks: STR DEX FOR / PER INS WIS / CON CHA WIL
  const TALENTS = [
    { key: 'STR', name: 'Strength' },    { key: 'DEX', name: 'Dexterity' },  { key: 'FOR', name: 'Fortitude' },
    { key: 'PER', name: 'Perception' },  { key: 'INS', name: 'Instinct' },   { key: 'WIS', name: 'Wisdom' },
    { key: 'CON', name: 'Constitution' },{ key: 'CHA', name: 'Charisma' },   { key: 'WIL', name: 'Willpower' }
  ];

  // 36 skills: indices 0-17 are the sheet's left column, 18-35 the right column. t = [talentA, talentB] indices.
  const SKILLS = [
    { name: 'Carrying', t: [0, 2] },   { name: 'Estimation', t: [0, 4] },  { name: 'Battlewise', t: [0, 5] },
    { name: 'Intimidate', t: [0, 7] }, { name: 'Athletics', t: [0, 8] },   { name: 'Guard', t: [1, 2] },
    { name: 'Reflex', t: [1, 4] },     { name: 'Investigation', t: [3, 4] },{ name: 'Soundness', t: [6, 7] },
    { name: 'Acrobatics', t: [0, 1] }, { name: 'Grappling', t: [0, 3] },  { name: 'Fitness', t: [0, 6] },
    { name: 'Stealth', t: [1, 3] },    { name: 'Recovery', t: [1, 6] },   { name: 'Bluff', t: [2, 7] },
    { name: 'Tracking', t: [3, 8] },   { name: 'Survival', t: [5, 6] },   { name: 'Deception', t: [5, 7] },
    { name: 'Medicine', t: [1, 5] },   { name: 'Performance', t: [1, 7] },{ name: 'Gossip', t: [2, 3] },
    { name: 'Religion', t: [2, 5] },   { name: 'Diplomacy', t: [3, 7] },  { name: 'Nature', t: [4, 5] },
    { name: 'Self Aw.', t: [4, 6] },   { name: 'History', t: [5, 8] },    { name: 'Mentality', t: [6, 8] },
    { name: 'Clockwork', t: [1, 8] },  { name: 'Danger Aw.', t: [2, 4] }, { name: 'Resistance', t: [2, 6] },
    { name: 'Courage', t: [2, 8] },    { name: 'Knowledge', t: [3, 5] },  { name: 'Handling', t: [3, 6] },
    { name: 'Insight', t: [4, 7] },    { name: 'Arcana', t: [4, 8] },     { name: 'Persuasion', t: [7, 8] }
  ];
  SKILLS.forEach((s) => { s.talents = s.t.map((i) => TALENTS[i].key).join(', '); });

  // 12 aggregate stats: indices 0-5 left column, 6-11 right column
  const STATS = [
    { key: 'HP', name: 'Health Points' },     { key: 'SP', name: 'Stamina Points' },
    { key: 'RD', name: 'Run Distance' },      { key: 'IB', name: 'Initiative Bonus' },
    { key: 'AP', name: 'Action Points' },     { key: 'EP', name: 'Endurance Points' },
    { key: 'SA', name: 'Strike Accuracy' },   { key: 'DA', name: 'Damage Avoid.' },
    { key: 'BP', name: 'Base Power' },        { key: 'AC', name: 'Armor Class' },
    { key: 'WC', name: 'Weight Class' },      { key: 'CC', name: 'Carry Capacity' }
  ];

  // Classes and their subclasses; each subclass level = sum of three skill helpers (pre-adjustment values)
  const CLASSES = [
    { name: 'Fighter', subs: [
      { name: 'Knight',   skills: [2, 8, 5] },   { name: 'Bruiser',  skills: [4, 3, 0] },   { name: 'Hunter',  skills: [6, 7, 1] } ] },
    { name: 'Speaker', subs: [
      { name: 'Bard',     skills: [19, 22, 20] },{ name: 'Monk',     skills: [24, 23, 26] },{ name: 'Cleric',  skills: [21, 25, 18] } ] },
    { name: 'Explorer', subs: [
      { name: 'Ranger',   skills: [15, 11, 16] },{ name: 'Dancer',   skills: [9, 13, 10] }, { name: 'Rogue',   skills: [17, 12, 14] } ] },
    { name: 'Supporter', subs: [
      { name: 'Shepherd', skills: [28, 35, 33] },{ name: 'Professor',skills: [34, 31, 27] },{ name: 'Tamer',   skills: [32, 29, 30] } ] }
  ];

  const DEFAULT_TALENT = 10;

  /* ---------- Helpers ---------- */

  const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
  const arr = (a, n) => Array.from({ length: n }, (_, i) => num(a && a[i]));

  // Spreadsheet ROUND(x, 0): halves round away from zero (JS Math.round does not do this for negatives).
  // The tiny epsilon keeps values like 2.4999999999 (float noise from percents) behaving like the sheet.
  function round(x) {
    const s = x < 0 ? -1 : 1;
    return s * Math.round(Math.abs(x) + 1e-9);
  }

  /* ---------- Blank character ---------- */

  function blankCharacter() {
    const z = (n) => Array.from({ length: n }, () => null);
    return {
      info: { name: '', species: '', sex: '', age: '', height: '', weight: null, money: '', alive: true,
              incarnation: 1, totemTokens: null, explodeTokens: null, legacyTokens: null, spiritualGuidance: null },
      vitals: { damage: null, tempHp: null, apRemaining: null, spRemaining: null, epRemaining: null, equipWeight: null, overallPct: null },
      talents: TALENTS.map(() => DEFAULT_TALENT),
      totemTalents: z(9), buffTalents: z(9),
      prof: z(36), totemProf: z(36), skillBuff: z(36), skillAdj: z(36), skillAdjPct: z(36),
      statBuff: z(12), statAdj: z(12), statAdjPct: z(12),
      items: [], abilities: [], customActions: [], appearance: '', backstory: '', motivation: ''
    };
  }

  /* ---------- Item buffs ---------- */
  // item.buffs = [{kind:'talent'|'skill', idx, amt, hold, wear}]. A buff counts when the item is in a hand (hold), on the body (wear),
  // or, with neither box ticked, simply while the character has the item.
  function itemBuffs(ch) {
    const talent = Array(9).fill(0), skill = Array(36).fill(0), list = [];
    ((ch && ch.items) || []).forEach((it) => {
      if (it && it.loot) return;   // a mob's loot is not carried: its buffs never apply
      const held = !!(it && (it.eqL || it.eqR)), worn = !!(it && it.eqB);
      ((it && Array.isArray(it.buffs)) ? it.buffs : []).forEach((b) => {
        if (!b || typeof b !== 'object') return;
        const n = Number(b.amt), size = b.kind === 'talent' ? 9 : b.kind === 'skill' ? 36 : 0;
        if (!Number.isFinite(n) || !Number.isInteger(b.idx) || b.idx < 0 || b.idx >= size) return;
        const on = (!b.hold && !b.wear) || (b.hold && held) || (b.wear && worn);
        if (!on) return;
        (b.kind === 'talent' ? talent : skill)[b.idx] += n;
        list.push({ item: it.name, kind: b.kind, idx: b.idx, amt: n });
      });
    });
    return { talent, skill, list };
  }

  /* ---------- Calculation ---------- */

  function compute(ch) {
    const talents = arr(ch.talents, 9), totemT = arr(ch.totemTalents, 9), buffT = arr(ch.buffTalents, 9);
    const prof = arr(ch.prof, 36), totemP = arr(ch.totemProf, 36), skillBuff = arr(ch.skillBuff, 36);
    const skillAdj = arr(ch.skillAdj, 36), skillPct = arr(ch.skillAdjPct, 36).map((p) => p / 100);
    const statBuff = arr(ch.statBuff, 12), statAdj = arr(ch.statAdj, 12), statPct = arr(ch.statAdjPct, 12).map((p) => p / 100);
    const ib = itemBuffs(ch);
    const v = ch.vitals || {};
    const tokenCut = TOKENS.cut(v.bt, v.wt);
    const overall = num(v.overallPct) / 100 - tokenCut;   // Bleed and Wound Tokens reduce every Aggregate Stat
    const weight = num(ch.info && ch.info.weight);

    // Skill helpers (Aggregate!M27:N44) and final modifiers (Aggregate!D27:H44)
    const helper = SKILLS.map((s, i) => {
      const [a, b] = s.t;
      return talents[a] + talents[b] - 20 + prof[i] * 4
        + skillBuff[i] + ib.skill[i] + buffT[a] + buffT[b] + ib.talent[a] + ib.talent[b]
        + totemT[a] + totemT[b] + totemP[i] * 4;
    });
    const skillMod = helper.map((h, i) => round(h + skillAdj[i] + h * skillPct[i]));

    // Base values for the 12 stats (Base!D3:F8), driven by skill helpers
    const H = helper;
    const wcBase = round(weight / 10);
    const base = [
      round(14 + H[0] / 2 + H[11] / 2 + H[26] / 2),            // HP
      round(14 + H[11] / 2 + H[13] / 2 + H[29] / 2),           // SP
      round(4 + H[4] / 4 + H[9] / 4 + H[11] / 4),              // RD
      round((H[6] + H[23] + H[30]) / 2 - 2),                   // IB
      round(H[9] / 10 + H[6] / 10 + H[7] / 10) + 6,            // AP
      round(20 + H[13] / 2 + H[26] / 2 + H[29] / 2),           // EP
      round(4 + H[2] / 2 + H[9] / 2 + H[15] / 2),              // SA
      round(12 + H[2] / 2 + H[6] / 2 + H[28] / 2),             // DA
      round(4 + H[4] / 2 + H[1] / 2 + H[30] / 2),              // BP
      round(4 + H[5] / 2 + H[8] / 2 + H[29] / 2),              // AC
      wcBase,                                                   // WC
      round(50 + wcBase + H[4] + H[0] * 2)                     // CC
    ];

    // Stat helpers (Aggregate!M17:N22) and totals (Aggregate!D17:H22).
    // NOTE: faithful to the sheet, the +/- # adjustment is added in the helper AND again in the total.
    const statHelper = base.map((b, i) => b + statBuff[i] + statAdj[i]);
    const mob = !!(ch.info && (ch.info.kind === 'mob' || ch.info.kind === 'boss'));   // a mob's or boss's stats (variation, % changes) round to whole numbers
    const stat = statHelper.map((h, i) => { const x = h + statAdj[i] + h * statPct[i] + h * overall; return mob ? round(x) : x; });

    const subLevels = [];
    const classLevels = CLASSES.map((c) => {
      const lv = c.subs.map((s) => s.skills.reduce((t, k) => t + helper[k], 0));
      subLevels.push(...lv);
      return lv.reduce((t, x) => t + x, 0);
    });

    const hpTotal = stat[0];
    const hpRemaining = hpTotal + num(v.tempHp) - num(v.damage);
    const capacityAvailable = stat[11] - num(v.equipWeight);

    return {
      helper, skillMod, base, statHelper, stat,
      subLevels, classLevels,
      talentLevel: talents.reduce((t, x) => t + x, 0),
      profLevel: prof.reduce((t, x) => t + x, 0),
      skillLevel: helper.reduce((t, x) => t + x, 0),
      hpRemaining, capacityAvailable, itemBuffs: ib, tokenCut
    };
  }


  // ---- Bleed Tokens (BT) and Wound Tokens (WT) (rulebook: Conditions) ----
  // Every 20 BT and every WT cuts each Aggregate Stat by 10%. 20+ BT doubles SP costs, 50+ stuns, 100+ incapacitates; each BT beyond 100 costs 1 HP instead.
  // 2+ WT gives -5 to Skill Check modifiers, 3+ WT gives disadvantage on Skill Checks. A single hit of 25% / 50% / 75% of max HP gives 1 / 2 / 3 WT.
  const TOKENS = {
    MAX_BT: 100,
    count(n) { n = Math.trunc(Number(n) || 0); return n > 0 ? n : 0; },
    cut(bt, wt) { return Math.min(1, 0.1 * Math.floor(TOKENS.count(bt) / 20) + 0.1 * TOKENS.count(wt)); },
    woundsFor(dmg, maxHp) {
      dmg = Number(dmg) || 0; maxHp = Number(maxHp) || 0;
      if (dmg <= 0 || maxHp <= 0) return 0;
      const f = dmg / maxHp; return f >= 0.75 ? 3 : f >= 0.5 ? 2 : f >= 0.25 ? 1 : 0;
    },
    skillMod(wt) { return TOKENS.count(wt) >= 2 ? -5 : 0; },
    skillDisadvantage(wt) { return TOKENS.count(wt) >= 3; },
    flags(bt) { bt = TOKENS.count(bt); return { spDouble: bt >= 20, stunned: bt >= 50, incapacitated: bt >= 100 }; },
    // Gain n BT: up to 100 they are tokens; each one beyond that is 1 HP of damage instead.
    gainBt(bt, n) { bt = TOKENS.count(bt); n = TOKENS.count(n); const top = Math.max(bt, TOKENS.MAX_BT), next = Math.min(top, bt + n); return { bt: next, hpLoss: bt + n - next }; },
    // Wound Tokens a hit adds, with the condition it causes; 2 WT at once is Severely Wounded, 3 is Fatally Wounded (roll the matching Bodily table)
    woundNote(n) { return n >= 3 ? 'Fatally Wounded: roll on the Bodily Disaster table.' : n === 2 ? 'Severely Wounded: roll on the Bodily Harm table.' : ''; }
  };

  // ---- Explode Tokens (ET) ----
  // Each ET applied to a die adds 1 to it. An ET applied to a die already on its highest number makes it explode: roll another die of
  // that type and add it. Every die (including an exploded one) can explode once. Dice are {sides, value, natural, exploded, group}.
  const ET = {
    MAX: 10,
    newDie(sides, value, group) { return { sides, value, natural: value, exploded: false, group: group || 0 }; },
    canTake(d) { return d.value < d.sides || !d.exploded; },
    // Put up to n tokens on one die. Stops when the die explodes (the new die comes back so the caller can place the rest).
    applyTo(d, n, roll) {
      let used = 0;
      while (used < n) {
        if (d.value < d.sides) { d.value += 1; used += 1; }
        else if (!d.exploded) { d.exploded = true; used += 1; const nd = ET.newDie(d.sides, roll(d.sides), d.group); nd.spawned = true; return { used, spawned: nd }; }
        else break;
      }
      return { used, spawned: null };
    },
    // All n tokens onto one die and whatever it explodes into. Returns every die in the chain and the tokens that could not be used.
    chain(d, n, roll) {
      const dice = [d]; let cur = d, left = n;
      while (left > 0) {
        const r = ET.applyTo(cur, left, roll); left -= r.used;
        if (r.spawned) { dice.push(r.spawned); cur = r.spawned; } else break;
      }
      return { dice, left };
    },
    total(dice, group) { return dice.filter((d) => group == null || d.group === group).reduce((t, d) => t + d.value, 0); }
  };


  // ---- Combat: critical hits and misses, and Combo Attacks ----
  const r2 = (x) => Math.round(x * 100) / 100;
  const COMBAT = {
    // Against the target's DA (block included): 10 or more over is a Critical Hit, over by 1+ a hit, 10 or more under a Critical Miss.
    classify(total, da) { const d = total - da; return d >= 10 ? 'crit' : d > 0 ? 'hit' : d <= -10 ? 'critfail' : 'miss'; },
    // Damage is the attack's power minus the target's AC (never below 0); a Critical Hit doubles what is left after AC.
    damage(power, ac, crit) { const base = Math.max(0, r2(power - ac)); return crit ? r2(base * 2) : base; },
    CRIT_FAIL_AP: 2   // a Critical Miss costs the attacker 2 AP of recovery at the start of their next turn
  };

  // Combo Attacks. The Leader rolls a Skill Check from the Combo Check table (and pays 3 AP); on the Finisher's turn both attack at once.
  // The check total reaches a level (CL 10/15/20/25), which sets a bonus. A Critical Combo uses the next level's bonus, a Perfect Combo the last column.
  const COMBO = {
    COST: 3,
    LEVELS: [10, 15, 20, 25],
    // one row per skill: five entries (CL 10, CL 15, CL 20, CL 25, Perfect); ap/sp = target loses that much, sa/bp = bonus to the attack, crit = critical hit
    TABLE: {
      Battlewise: [{ t: 'Target loses 1 AP.', ap: 1 }, { t: 'Target loses 2 AP.', ap: 2 }, { t: 'Target loses 3 AP.', ap: 3 }, { t: 'Target loses 4 AP.', ap: 4 }, { t: 'Target loses 4 AP and skips its next turn.', ap: 4 }],
      Intimidate: [{ t: 'Target shifts away 1 as a reaction.' }, { t: 'Target moves away 3 as a reaction.' }, { t: 'Target moves away RD as a reaction.' },
        { t: 'Target moves away RD as a reaction, and again as an action next turn.' }, { t: 'Target moves away RD as a reaction and cannot attack you next turn.' }],
      Athletics: [{ t: 'BP +2', bp: 2 }, { t: 'BP +3', bp: 3 }, { t: 'BP +4', bp: 4 }, { t: 'BP +5', bp: 5 }, { t: 'BP +10', bp: 10 }],
      Acrobatics: [{ t: 'You may Shift as a free action.' }, { t: 'You may move up to 2 as a free action.' }, { t: 'You may move up to half your RD as a free action.' },
        { t: 'You may move up to your RD as a free action.' }, { t: 'You may move up to your RD as a free action and regain 50% of your max SP.' }],
      Grappling: [{ t: 'Target is knocked prone.' }, { t: 'Target is knocked prone and drops whatever it is holding.' }, { t: 'Target is knocked prone and whatever it is holding is thrown 5 m away.' },
        { t: 'Target is knocked prone and you may take an item it is holding with your free hand.' }, { t: 'Target is knocked prone and stunned and you may take an item it is holding with your free hand.' }],
      Tracking: [{ t: 'SA +3', sa: 3 }, { t: 'SA +5', sa: 5 }, { t: 'SA +7', sa: 7 }, { t: 'SA +10', sa: 10 }, { t: "Critical hit, and both attackers' next hit is a critical hit.", crit: true }],
      Courage: [{ t: 'Target loses 5 SP.', sp: 5 }, { t: 'Target loses 8 SP.', sp: 8 }, { t: 'Target loses 10 SP.', sp: 10 }, { t: 'Target loses 12 SP.', sp: 12 }, { t: 'Target is winded and stunned.' }],
      Handling: [{ t: 'Target has -2 to its next Skill Check.' }, { t: 'Target has -4 to its next Skill Check.' }, { t: 'Target has -6 to its next Skill Check.' },
        { t: 'Target has -8 to its next Skill Check.' }, { t: 'Target fails its next Skill Check.' }]
    },
    skills() { return Object.keys(COMBO.TABLE); },
    // check total -> level reached (0 = below CL 10, no bonus)
    level(total) { let lv = 0; COMBO.LEVELS.forEach((cl) => { if (total >= cl) lv = cl; }); return lv; },
    bonus(skill, col) { const row = COMBO.TABLE[skill]; return row && col >= 0 ? row[Math.min(col, 4)] : null; },
    // column of a level: -1 below CL 10, 0..3 for CL 10..25, 4 = Perfect
    column(level) { return level ? COMBO.LEVELS.indexOf(level) : -1; },
    /* Works out a Combo Attack once both attackers have rolled.
       o: { da, ac, skill, level, L: {total, power}, F: {total, power}, critMax (3, or 4 with Critical Reave Theory), perfectMax (0, or 1 with Perfectionist), forceCrit: {L, F} (that attacker holds a Next Hit Critical) }
       Returns { kind: 'miss'|'hit'|'critical'|'perfect', retry (nobody hit: the Finisher may roll again), L, F (final totals and powers, hit/crit flags),
                 diff, bonus (applied), recv ('both'|'finisher'|null), damage (one instance against AC, or 0), effects: {ap, sp}, notes: [] } */
    resolve(o) {
      const da = o.da, ac = o.ac || 0, col0 = COMBO.column(o.level), critMax = o.critMax || 3, perfectMax = o.perfectMax || 0, notes = [];
      const lHit0 = o.L.total > da, fHit0 = o.F.total > da;
      const base = col0 >= 0 ? COMBO.bonus(o.skill, col0) : null;
      // Applies bonus b: the Finisher gets it if the Leader hit, and the Leader also gets it if both then hit (an SA bonus can lift either into a hit or a crit).
      const apply = (b, lHit, forceF) => {
        const F = { total: o.F.total, power: o.F.power }, L = { total: o.L.total, power: o.L.power };
        let recv = null;
        if (b && (lHit || forceF)) { F.total = r2(F.total + (b.sa || 0)); F.power = r2(F.power + (b.bp || 0)); recv = 'finisher'; }
        if (b && recv && L.total > da && F.total > da) { L.total = r2(L.total + (b.sa || 0)); L.power = r2(L.power + (b.bp || 0)); recv = 'both'; }
        return { L, F, recv };
      };
      if (!lHit0 && !fHit0) return { kind: 'miss', retry: true, L: { total: o.L.total, power: o.L.power, hit: false, crit: false }, F: { total: o.F.total, power: o.F.power, hit: false, crit: false },
        diff: null, bonus: null, recv: null, damage: 0, effects: {}, notes: ['Both attacks missed.'] };
      let res = apply(base, lHit0, false), bonus = base, kind = 'hit';
      const res1 = res;
      const diff = Math.abs(res.L.total - res.F.total);
      if (diff <= perfectMax) kind = 'perfect';
      else if (diff >= 1 && diff <= critMax) kind = 'critical';
      if (kind === 'perfect') { bonus = COMBO.bonus(o.skill, 4); res = apply(bonus, lHit0, true); }
      else if (kind === 'critical') { bonus = COMBO.bonus(o.skill, col0 < 0 ? 0 : Math.min(col0 + 1, 4)); res = apply(bonus, lHit0, true); }
      // a hit or crit already earned at the first stage is kept when a Critical or Perfect bonus replaces the base one
      const L = { total: res.L.total, power: res.L.power }, F = { total: res.F.total, power: res.F.power };
      L.hit = L.total > da || res1.L.total > da; F.hit = F.total > da || res1.F.total > da;
      L.crit = COMBAT.classify(L.total, da) === 'crit' || COMBAT.classify(res1.L.total, da) === 'crit';
      F.crit = COMBAT.classify(F.total, da) === 'crit' || COMBAT.classify(res1.F.total, da) === 'crit';
      if (bonus && bonus.crit) { if (L.hit) L.crit = true; if (F.hit) F.crit = true; }
      // a held Next Hit Critical makes that attacker's hit critical, and is spent
      const fc = o.forceCrit || {}, used = { L: !!fc.L && L.hit, F: !!fc.F && F.hit };
      if (used.L) L.crit = true; if (used.F) F.crit = true;
      let damage = 0;
      if (L.hit && F.hit) {
        let sum = r2(L.power + F.power); if (kind === 'perfect') sum = r2(sum * 2);
        damage = COMBAT.damage(sum, ac, L.crit && F.crit);
      } else {
        const one = L.hit ? L : F;
        damage = COMBAT.damage(kind === 'perfect' ? r2(one.power * 2) : one.power, ac, one.crit);
      }
      const effects = {};
      if (bonus && bonus.ap) effects.ap = bonus.ap;
      if (bonus && bonus.sp) effects.sp = bonus.sp;
      return { kind, retry: false, L, F, diff, bonus, recv: res.recv, damage, effects, notes, anyHit: L.hit || F.hit, used };
    }
  };

  // ---- Advantage and Disadvantage (rulebook): net advantage 1 rolls two dice and keeps the best, net 2 rolls three; disadvantage keeps the worst.
  // Advantage and disadvantage cancel. Beyond 2 either way you simply count as having rolled the highest (adv) or a 1 (dis).
  const ADV = {
    MAX: 3,
    clamp(n) { n = Math.trunc(Number(n) || 0); return Math.max(-ADV.MAX, Math.min(ADV.MAX, n)); },
    dice(net) { const a = Math.abs(ADV.clamp(net)); return a >= 3 ? 0 : a + 1; },   // 0 = nothing is rolled
    label(net) { return ['SEVERE DISADV. (AUTO 1)', 'SEVERE DISADVANTAGE', 'DISADVANTAGE', 'NORMAL', 'ADVANTAGE', 'GREAT ADVANTAGE', 'GREAT ADV. (AUTO MAX)'][ADV.clamp(net) + 3]; },
    // roll(net, sides, rollFn) -> { die, rolls, text }; rollFn(sides) returns one die
    roll(net, sides, rollFn) {
      const n = ADV.clamp(net);
      if (n === 0) { const d = rollFn(sides); return { die: d, rolls: [d], text: '' }; }
      if (Math.abs(n) >= 3) { const d = n > 0 ? sides : 1; return { die: d, rolls: [], text: (n > 0 ? 'great advantage' : 'severe disadvantage') + ': counts as ' + d }; }
      const rolls = []; for (let i = 0; i < ADV.dice(n); i++) rolls.push(rollFn(sides));
      const die = n > 0 ? Math.max.apply(null, rolls) : Math.min.apply(null, rolls);
      return { die, rolls, text: (Math.abs(n) === 1 ? '' : (n > 0 ? 'great ' : 'severe ')) + (n > 0 ? 'advantage' : 'disadvantage') + ': rolled ' + rolls.join(', ') + ', kept ' + die };
    }
  };

  return { TALENTS, SKILLS, STATS, CLASSES, DEFAULT_TALENT, blankCharacter, compute, itemBuffs, round, ET, COMBAT, COMBO, ADV, TOKENS };
});
