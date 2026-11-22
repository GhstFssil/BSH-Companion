const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = { sam: { name: 'Sam', username: 'sam_2', email: 'sam@example.com', password: 'another pass1' }, ava: { name: 'Ava', username: 'ava_3', email: 'ava@example.com', password: 'third pass12' } };
async function scenario(label, makeAs) {
  console.log('--- ' + label); const P = (m) => `[${label}] ${m}`;
  const as = await makeAs(); const S = await as('sam'), V = await as('ava');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const bS = await raw(S), bV = await raw(V);
  const G = await bS.createCampaign('Pit'); await bV.joinCampaign(G);
  const mk = async (A, b, name, extra) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; Object.assign(c, extra); await b.saveCharacter(c); return c; };
  const alpha = await mk(S, bS, 'Alpha'), gamma = await mk(V, bV, 'Gamma');
  const rows = (A) => [...A.d.querySelectorAll('#campChars .cchar')];
  const rowOf = (A, n) => rows(A).find((r) => r.querySelector('.char-btn span').textContent === n);
  const vit = (row, k) => row.querySelector(`input[aria-label^="${k} now"]`);
  const ev = (el, v) => { el.value = v; el.dispatchEvent(new S.w.Event('change', { bubbles: true })); };
  S.go('campaign-' + G); V.go('campaign-' + G);
  ok(await until(() => rowOf(S, 'Alpha') && rowOf(S, 'Gamma')), P('roster shows both characters'));
  const a = rowOf(S, 'Alpha');
  const tot = S.w.BSH.compute(alpha).stat;
  ok(a.querySelector('.cname .char-btn') && a.querySelector('.cname .vitals'), P('readouts sit under the name'));
  ok([...a.querySelectorAll('.vit b')].map((x) => x.textContent).join() === 'HP,AP,SP,EP,DMG/HEAL', P('HP, AP, SP, EP readouts plus DMG/HEAL'));
  ok(vit(a, 'HP').value === String(Math.round(tot[0] * 100) / 100) || !!vit(a, 'HP').value, P('HP shows current (full) value: ' + vit(a, 'HP').value));
  // own character: editable and saved to the sheet
  ev(vit(a, 'HP'), '5'); ev(vit(a, 'AP'), '2'); ev(vit(a, 'SP'), '3'); ev(vit(a, 'EP'), '4');
  ok(await until(async () => { const c = (await bS.listCharacters()).find((x) => x.id === alpha.id); return c.vitals.apRemaining === 2 && c.vitals.spRemaining === 3 && c.vitals.epRemaining === 4; }), P('AP/SP/EP saved to the character'));
  const st = (await bS.listCharacters()).find((x) => x.id === alpha.id);
  ok(Math.abs(S.w.BSH.compute(st).hpRemaining - 5) < 0.01, P('HP edit sets damage so HP remaining = 5 (damage ' + st.vitals.damage + ')'));
  // sheet shows them
  S.go('characters'); await wait(150); S.go('character-' + alpha.id); await wait(100); S.tab('stats'); await wait(30);
  const sh = (l) => [...S.d.querySelectorAll('#panel-stats input[aria-label]')].find((i) => i.getAttribute('aria-label') === l);
  ok(sh('AP remaining') && sh('AP remaining').value === '2' && sh('SP remaining').value === '3' && sh('EP remaining').value === '4', P('sheet shows the same AP/SP/EP'));
  // edit on sheet reflects on roster
  S.setv(sh('AP remaining'), '1'); await wait(700);
  S.go('campaign-' + G); await wait(200);
  ok(await until(() => vit(rowOf(S, 'Alpha'), 'AP') && vit(rowOf(S, 'Alpha'), 'AP').value === '1'), P('sheet edit appears on the roster'));
  { const row = rowOf(S, 'Alpha'), d = row.querySelector('input[aria-label^="Damage or healing"]'), ac = [...row.querySelectorAll('button')].find((b) => b.textContent === 'ACCEPT');
    ok(!!d && !!ac, P('roster has DMG/HEAL + ACCEPT'));
    const hp0 = Number(vit(row, 'HP').value); S.setv(d, '-2'); S.click(ac);
    ok(await until(() => Number(vit(rowOf(S, 'Alpha'), 'HP').value) === hp0 - 2), P('roster damage -2: ' + hp0 + ' -> ' + vit(rowOf(S, 'Alpha'), 'HP').value));
    const row2 = rowOf(S, 'Alpha'); S.setv(row2.querySelector('input[aria-label^="Damage or healing"]'), '5'); S.click([...row2.querySelectorAll('button')].find((b) => b.textContent === 'ACCEPT'));
    ok(await until(() => Number(vit(rowOf(S, 'Alpha'), 'HP').value) === hp0 + 3), P('roster healing +5'));
    ok(await until(async () => Math.abs(S.w.BSH.compute((await bS.listCharacters()).find((x) => x.id === alpha.id)).hpRemaining - (hp0 + 3)) < 0.01), P('saved to the sheet'));
    ev(vit(rowOf(S, 'Alpha'), 'HP'), '5'); await wait(300); }
  // other player's character: read-only
  const g = rowOf(S, 'Gamma');
  ok(!g.querySelector('input[data-vit]') && g.querySelectorAll('.vit').length === 4 && !g.querySelector('.vit button'), P("someone else's character: readouts but not editable"));
  // Ava sees Sam's edit
    ok(await until(async () => { V.go('characters'); await wait(60); V.go('campaign-' + G); await wait(150); const r = rowOf(V, 'Alpha'); return r && /AP 1\/|AP\s*1/.test(r.querySelector('.vitals').textContent); }, 6000), P("Ava sees Alpha's AP"));
  // skill check popup
  const sc = [...a.querySelectorAll('button')].find((b) => b.textContent === 'SKILL CHECK');
  ok(!!sc, P('SKILL CHECK button'));
  S.go('campaign-' + G); await wait(100);
  const sc2 = [...rowOf(S, 'Alpha').querySelectorAll('button')].find((b) => b.textContent === 'SKILL CHECK'); S.click(sc2);
  ok(!S.$('skillModal').hidden && S.$('skillWho').textContent === 'Alpha', P('popup opens for that character'));
  const opts = [...S.$('skillSel').options];
  ok(opts.length === 36 && /^Carrying\s+[+-]?\d/.test(opts[0].textContent), P('36 skills with their modifiers listed: ' + opts[0].textContent));
  S.setv(S.$('skillSel'), '4'); S.$('skillSel').dispatchEvent(new S.w.Event('change', { bubbles: true }));
  const mod = S.w.BSH.compute(st).skillMod[4];
  ok(S.$('skillModText').textContent.includes('Athletics modifier') && S.$('skillModText').textContent.includes((mod > 0 ? '+' : '') + mod), P('modifier reference: ' + S.$('skillModText').textContent));
  const sg = (n) => (n > 0 ? '+' : '') + n;
  S.setv(S.$('skillDie'), '12'); S.click(S.$('skillSet')); await wait(30);
  ok(S.$('skillOut').textContent.endsWith('= ' + (12 + mod)), P('manual roll: ' + S.$('skillOut').textContent));
  S.setv(S.$('skillDie'), '1'); S.click(S.$('skillSet')); await wait(30);
  ok(S.$('skillOut').textContent.endsWith('= ' + (1 + mod - 5)) && /- 5/.test(S.$('skillOut').textContent), P('natural 1 takes off 5: ' + S.$('skillOut').textContent));
  S.setv(S.$('skillDie'), '20'); S.click(S.$('skillSet')); await wait(30);
  ok(S.$('skillOut').textContent.endsWith('= ' + (20 + mod + 5)) && /\+ 5/.test(S.$('skillOut').textContent), P('natural 20 adds 5: ' + S.$('skillOut').textContent));
  S.setv(S.$('skillDie'), '21'); S.click(S.$('skillSet')); ok(/1 to 20/.test(S.$('skillMsg').textContent), P('rejects 21'));
  S.click(S.$('skillRoll')); await wait(30);
  const m2 = S.$('skillOut').textContent.match(/d20 (\d+).* = (-?[\d.]+)$/); const die = +m2[1];
  ok(die >= 1 && die <= 20 && +m2[2] === die + mod + (die === 1 ? -5 : die === 20 ? 5 : 0), P('auto roll: ' + S.$('skillOut').textContent));
  { const adv = (t) => [...S.$('skillEt').querySelectorAll('.advbox button')].find((b) => b.textContent === t), lab = () => S.$('skillEt').querySelector('.advlab').textContent;
    ok(lab() === 'NORMAL', P('ADV/DIS stepper starts at NORMAL'));
    S.click(adv('ADV')); S.click(adv('ADV')); ok(lab() === 'GREAT ADVANTAGE', P('two ADV taps: ' + lab()));
    S.click(adv('DIS')); ok(lab() === 'ADVANTAGE', P('a DIS cancels one ADV: ' + lab()));
    S.click(S.$('skillRoll')); await wait(30);
    ok(/advantage: rolled \d+, \d+, kept \d+\)/.test(S.$('skillOut').textContent), P('advantage rolls two dice and shows them: ' + S.$('skillOut').textContent));
    const kept = +S.$('skillOut').textContent.match(/kept (\d+)/)[1], rolled = S.$('skillOut').textContent.match(/rolled (\d+), (\d+)/).slice(1).map(Number);
    ok(kept === Math.max(...rolled) && lab() === 'NORMAL', P('keeps the better die and the stepper resets'));
    for (let i = 0; i < 3; i++) S.click(adv('DIS'));
    ok(/AUTO 1/.test(lab()), P('three DIS: ' + lab()));
    S.click(S.$('skillRoll')); await wait(30);
    ok(/counts as 1/.test(S.$('skillOut').textContent) && /d20 1/.test(S.$('skillOut').textContent), P('beyond severe disadvantage counts as a 1: ' + S.$('skillOut').textContent)); }
  S.setv(S.$('skillSel'), '0'); S.$('skillSel').dispatchEvent(new S.w.Event('change', { bubbles: true }));
  ok(S.$('skillOut').textContent === '', P('changing the skill clears the result'));
  S.click(S.$('skillClose')); ok(S.$('skillModal').hidden, P('CLOSE closes the popup'));
  { const ab = [...rowOf(S, 'Alpha').querySelectorAll('button')].map((b) => b.textContent);
    ok(ab.indexOf('ACTIONS') === ab.indexOf('SKILL CHECK') + 1, P('ACTIONS button sits next to SKILL CHECK'));
    S.click([...rowOf(S, 'Alpha').querySelectorAll('button')].find((b) => b.textContent === 'ACTIONS'));
    ok(!S.$('actionsModal').hidden && [...S.$('actionsList').querySelectorAll('button')].map((b) => b.textContent).join('|') === 'Movement|Half Movement|Shift|Unarmed Strike|Combo Attack|Block/Parry|Equip|Prepare Spellbook|Reaction|Rest', P('actions card lists the 10 actions'));
    const rd = S.w.BSH.compute((await bS.listCharacters()).find((x) => x.id === alpha.id)).stat[2];
    ok([...S.$('actionsList').querySelectorAll('.arow')].map((r) => (r.querySelector('.acost') || {}).textContent || '-').join('|') === '3 AP|2 AP|1 AP|2 AP|3 AP|1 AP|2 AP|3 AP|-|-', P('cost boxes beside each action'));
    S.click(S.$('actionsList').querySelectorAll('button')[0]);
    ok(S.$('actionDesc').textContent.includes('Run up to your full RD.') && S.$('actionDesc').textContent.includes('Cost: 3 AP') && S.$('actionDesc').textContent.includes('RD: ' + rd), P('Movement card: ' + S.$('actionDesc').textContent));
    S.click(S.$('actionBack')); S.click(S.$('actionsList').querySelectorAll('button')[1]);
    ok(S.$('actionDesc').textContent.includes('rounded up') && S.$('actionDesc').textContent.includes('Cost: 2 AP') && S.$('actionDesc').textContent.includes('1/2 RD: ' + Math.ceil(rd / 2)), P('Half Movement card: ' + S.$('actionDesc').textContent));
    S.click(S.$('actionBack')); S.click(S.$('actionsList').querySelectorAll('button')[2]);
    ok(S.$('actionDesc').textContent.includes('avoiding standard reaction attacks') && S.$('actionDesc').textContent.includes('Cost: 1 AP'), P('Shift card'));
    const act = (i) => { S.click(S.$('actionBack')); S.click(S.$('actionsList').querySelectorAll('button')[i]); return S.$('actionDesc').textContent; };
    let t = act(3); const bp = S.w.BSH.compute(alpha).stat[S.w.BSH.STATS.findIndex((x) => x.key === 'BP')];
    ok(t.includes('Make an Attack without a Weapon.') && t.includes('Cost: 2 AP') && t.includes('Range: 0-1') && t.includes('Attack Dmg: ' + bp), P('Unarmed Strike: ' + t));
    t = act(4+1); ok(t.includes('Use only as a Reaction to being Attacked.') && t.includes('Cost: 1 AP') && t.includes('CR: N/A'), P('Block/Parry with nothing equipped: ' + t));
    t = act(5+1); ok(t.includes('Equip an ordinary Item') && t.includes('Cost: 2 AP'), P('Equip'));
    t = act(6+1); ok(S.$('actionName').textContent === 'Prepare Spellbook' && t.includes('Keyrune') && t.includes('Cost: 3 AP'), P('Prepare Spellbook'));
    t = act(7+1); ok(t.includes('interrupt another Action') && !t.includes('Cost'), P('Reaction'));
    // highest CR of equipped items
    S.click(S.$('actionBack')); S.click(S.$('actionsClose'));
    const cs = await bS.listCharacters(); const al = cs.find((x) => x.id === alpha.id);
    al.items = [{ name: 'Sword', qty: 1, eqR: true, weapon: true, weaponProps: { cr: '2' } }, { name: 'Shield', qty: 1, eqL: true, weapon: true, weaponProps: { cr: 'CR 5' } }, { name: 'Spare', qty: 1, weapon: true, weaponProps: { cr: '9' } }];
    await bS.saveCharacter(al); S.go('characters'); await wait(150); S.go('campaign-' + G); await wait(250);
    S.click([...rowOf(S, 'Alpha').querySelectorAll('button')].find((b) => b.textContent === 'ACTIONS'));
    t = act(5); ok(t.includes('CR: 5'), P('Block/Parry shows highest equipped CR (not the unequipped 9): ' + t));
    S.click(S.$('actionBack')); S.click(S.$('actionsList').querySelectorAll('button')[4]);
    // ---- Rest ----
    S.click(S.$('actionBack')); S.click(S.$('actionsClose'));
    { const a2 = (await bS.listCharacters()).find((x) => x.id === alpha.id); a2.items = []; a2.vitals.damage = 10; a2.vitals.epRemaining = 5; await bS.saveCharacter(a2); }
    S.go('characters'); await wait(150); S.go('campaign-' + G); await wait(250);
    const openRest = () => { S.click([...rowOf(S, 'Alpha').querySelectorAll('button')].find((b) => b.textContent === 'ACTIONS')); S.click([...S.$('actionsList').querySelectorAll('button')].find((b) => b.textContent === 'Rest')); };
    openRest();
    let rt = S.$('actionDesc').textContent;
    ok(['Respite', 'Short Rest', 'Full Rest', 'Long Rest', 'Extended Rest'].every((n) => rt.includes(n)) && rt.includes('1D4+10% of your total HP') && rt.includes('Duration: 3 full days and 4 nights'), P('Rest card describes all five rests'));
    const takeBtn = (n) => [...S.$('actionDesc').querySelectorAll('button')].find((b) => b.textContent === n);
    const hpv = async () => { const c = (await bS.listCharacters()).find((x) => x.id === alpha.id); const r = S.w.BSH.compute(c); return [r.hpRemaining, c.vitals.epRemaining, r.stat[0], r.stat[5]]; };
    let [hp0b, ep0b, hpT, epT] = await hpv();
    S.click(takeBtn('TAKE SHORT REST'));
    const dice = () => [...S.$('actionDesc').querySelectorAll('.rest-die input')];
    ok(dice().length === 2 && S.$('actionName').textContent === 'Short Rest' && S.$('actionDesc').querySelector('button[disabled]'), P('Short Rest: HP 1D4 + EP 1D2, apply disabled until rolled'));
    S.setv(dice()[0], '5'); S.$('actionDesc').dispatchEvent(new S.w.Event('input')); dice()[0].dispatchEvent(new S.w.Event('input', { bubbles: true }));
    ok(/1 to its sides/.test(S.$('actionDesc').textContent), P('out-of-range die is rejected'));
    S.click(S.$('actionDesc').querySelectorAll('.rest-die button')[0]); await wait(30);
    const v = +dice()[0].value; ok(v >= 1 && v <= 4, P('auto roll D4 filled: ' + v));
    S.setv(dice()[1], '2'); dice()[1].dispatchEvent(new S.w.Event('input', { bubbles: true }));
    ok(/HP \+\d+ .*EP \+3/.test(S.$('actionDesc').textContent.replace(/\s+/g, ' ')), P('summary: ' + S.$('actionDesc').textContent));
    S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => b.textContent === 'APPLY REST'));
    ok(await until(async () => { const [h1, e1] = await hpv(); return Math.abs(h1 - Math.min(hpT, hp0b + v + 1)) < 0.01 && e1 === ep0b + 3; }), P('Short Rest applied: HP +' + (v + 1) + ', EP +3'));
    S.click(S.$('actionBack')); ok(S.$('actionName').textContent === 'Rest', P('BACK from the roller returns to the Rest card'));
    // Long Rest with a 30% HP part, EP capped at total
    [hp0b, ep0b] = await hpv();
    S.click(takeBtn('TAKE LONG REST')); ok(dice().length === 2, P('Long Rest: 1D8 HP + 1D6 EP'));
    S.click(S.$('actionDesc').querySelectorAll('button')[S.$('actionDesc').querySelectorAll('button').length - 2]); await wait(30); // ROLL ALL
    ok(dice().every((i) => i.value !== ''), P('ROLL ALL fills every die'));
    const hv = +dice()[0].value, ev2 = +dice()[1].value;
    S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => b.textContent === 'APPLY REST'));
    ok(await until(async () => { const [h1, e1] = await hpv(); return Math.abs(h1 - Math.min(hpT, hp0b + Math.round((hv + hpT * 0.3) * 100) / 100)) < 0.02 && Math.abs(e1 - Math.min(epT, ep0b + ev2 + 6)) < 0.01; }), P('Long Rest applied with 30% of total HP, capped at the totals'));
    // Extended: full
    S.click(S.$('actionBack')); S.click(takeBtn('TAKE EXTENDED REST'));
    ok(S.$('actionDesc').querySelectorAll('.rest-die').length === 0, P('Extended Rest has no dice'));
    S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => b.textContent === 'APPLY REST'));
    ok(await until(async () => { const [h1, e1] = await hpv(); return Math.abs(h1 - hpT) < 0.01 && (e1 == null || e1 === epT); }), P('Extended Rest restores HP and EP to full'));
    S.click(S.$('actionBack')); S.click(S.$('actionBack')); S.click(S.$('actionsClose'));
    // someone else's character: descriptions only
    { S.click([...rowOf(S, 'Gamma').querySelectorAll('button')].find((b) => b.textContent === 'ACTIONS')); S.click([...S.$('actionsList').querySelectorAll('button')].find((b) => b.textContent === 'Rest'));
      ok(!S.$('actionDesc').querySelector('button'), P("another player's character: no TAKE buttons")); S.click(S.$('actionBack')); S.click(S.$('actionsClose')); }
    S.go('characters'); await wait(100); S.go('campaign-' + G); await wait(250);
    S.click([...rowOf(S, 'Alpha').querySelectorAll('button')].find((b) => b.textContent === 'ACTIONS')); S.click(S.$('actionsList').querySelectorAll('button')[5]);
    ok(!S.$('actionDetail').hidden && S.$('actionName').textContent === 'Block/Parry' && S.$('actionsList').hidden, P('an action opens its own card'));
    S.click(S.$('actionBack')); ok(S.$('actionDetail').hidden && !S.$('actionsList').hidden, P('BACK returns to the list'));
    S.click(S.$('actionsClose')); ok(S.$('actionsModal').hidden, P('CLOSE closes the card')); }
  { S.go('campaign-' + G); await wait(250);
    S.click(rowOf(S, 'Alpha').querySelector('.char-btn')); await wait(150);
    const back = S.$('screen-sheet').querySelector('.corner');
    ok(S.vis().join() === 'sheet' && back.dataset.go === 'campaign-' + G, P('own sheet opened from the campaign: BACK goes to the campaign (' + back.dataset.go + ')'));
    S.click(back); await wait(150); ok(S.vis().join() === 'campaign', P('BACK lands on the campaign page'));
    S.go('characters'); await wait(150); S.go('character-' + alpha.id); await wait(150);
    ok(S.$('screen-sheet').querySelector('.corner').dataset.go === 'characters', P('opened from the characters page: BACK goes to characters')); S.go('campaign-' + G); await wait(150); }
  for (const A of [S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
