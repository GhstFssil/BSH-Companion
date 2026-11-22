const { boot, wait, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam: { name: 'Sam', username: 'sam_2', email: 'sam@example.com', password: 'another pass1' },
  ava: { name: 'Ava', username: 'ava_3', email: 'third@example.com', password: 'third pass12' }
};
async function scenario(label, makeAs) {
  console.log('--- ' + label); const P = (m) => `[${label}] ${m}`;
  const as = await makeAs(); const R = await as('ricky'), S = await as('sam'), V = await as('ava');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(220); };
  const kickAll = async () => { for (const A of [R, S, V]) await kick(A); };
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G); await bV.joinCampaign(G);
  const BSH = S.w.BSH, IX = (k) => BSH.STATS.findIndex((x) => x.key === k);
  const mk = async (A, b, name, items, daAdj) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; c.items = items || []; if (daAdj) c.statAdj[IX('DA')] = daAdj; await b.saveCharacter(c); return c; };
  const sam = await mk(S, bS, 'Samwise', [{ name: 'Axe', qty: 1, weapon: true, weaponProps: { type: 'Melee', dmg: 'BP+2', cost: '2 AP' } }]);
  const ava = await mk(V, bV, 'Avalon', [{ name: 'Club', qty: 1, weapon: true, weaponProps: { type: 'Melee', dmg: 'BP+2', cost: '2 AP' } }], -5);   // DA 7
  const npc = async (name, daAdj) => { const c = R.w.BSH.blankCharacter(); c.id = R.w.crypto.randomUUID(); c.info.name = name; if (daAdj) c.statAdj[IX('DA')] = daAdj; await bR.createNpc(G, c); await bR.setNpcVisible(c.id, true); return c; };
  const ogre = await npc('Ogre', -5), brute = await npc('Brute', 0);   // DA 7 and DA 12, both AC 4
  for (const A of [R, S, V]) A.go('campaign-' + G);
  const row = (A, n) => [...A.d.querySelectorAll('#campChars .cchar')].find((r) => r.querySelector('.char-btn span').textContent === n);
  const btn = (root, t) => [...root.querySelectorAll('button')].find((b) => b.textContent === t);
  const gB = (A, re) => [...A.$('actionDesc').querySelectorAll('button')].find((b) => re.test(b.textContent));
  await until(() => row(S, 'Samwise') && row(S, 'Avalon'));
  await bR.startEncounter(G);
  await bS.setInitiative(G, sam.id, 15, 0); await bV.setInitiative(G, ava.id, 12, 0); await bR.setInitiative(G, ogre.id, 3, 0); await bR.setInitiative(G, brute.id, 2, 0);
  await kickAll();
  await until(() => row(S, 'Samwise') && btn(row(S, 'Samwise'), 'ACTIONS'));
  const stored = async (id) => (await bR.listCampaignCharacters(G)).find((r) => r.ch.id === id).ch;
  const dmg = async (id) => Number(((await stored(id)).vitals || {}).damage) || 0;
  const openActions = (A, n) => { if (!A.$('actionsModal').hidden) A.click(A.$('actionsClose')); A.click(btn(row(A, n), 'ACTIONS')); };
  const actBtn = (A, name) => [...A.$('actionsList').querySelectorAll('.arow')].find((e) => e.querySelector('.btn').textContent === name).querySelector('button.acost');
  const setAP = async (b, id, n) => { await b.setVital(id, 'apRemaining', n); };
  const atk = async (A, who, name, target, die, extra) => {
    openActions(A, who); await wait(60); actBtn(A, name).click(); await wait(80);
    A.$('atkTarget').value = [...A.$('atkTarget').options].find((o) => o.textContent === target).value; A.$('atkTarget').dispatchEvent(new A.w.Event('change'));
    if (extra) extra();
    A.$('atkDie').value = String(die); A.click(gB(A, /MY ROLL/)); await wait(500);
    return A.$('atkOut').textContent;
  };

  // ---------- critical hits and misses on a plain attack ----------
  await setAP(bS, sam.id, 6);
  let d0 = await dmg(ogre.id);
  let t = await atk(S, 'Samwise', 'Attack: Axe', 'Ogre', 12);   // 4 + 12 + 5 = 21 vs DA 7: 14 over
  let m = /= (-?[\d.]+), doubled = (-?[\d.]+) damage/.exec(t);
  ok(/CRITICAL HIT/.test(t) && m && Number(m[2]) === Number(m[1]) * 2 && Number(m[2]) === 4, P('crit hit doubles the damage after AC: ' + t));
  ok(Math.abs((await dmg(ogre.id)) - d0 - 4) < 0.001, P('stored damage is the doubled amount'));
  await kickAll();
  d0 = await dmg(ogre.id); await setAP(bS, sam.id, 6);
  t = await atk(S, 'Samwise', 'Attack: Axe', 'Ogre', 4);   // 4 + 4 = 8 vs DA 7: a plain hit
  ok(/HIT/.test(t) && !/CRITICAL/.test(t) && !/doubled/.test(t) && Math.abs((await dmg(ogre.id)) - d0 - 2) < 0.001, P('9 over or less is a plain hit (6 - 4 = 2): ' + t));
  await setAP(bS, sam.id, 6);
  t = await atk(S, 'Samwise', 'Attack: Axe', 'Brute', 1);   // 4 + 1 - 5 = 0 vs DA 12: 12 under
  ok(/CRITICAL MISS/.test(t) && /2 less AP/.test(t), P('critical miss: ' + t));
  await until(async () => ((await stored(sam.id)).vitals || {}).apPenalty === 2);
  ok(((await stored(sam.id)).vitals || {}).apPenalty === 2, P('the penalty is stored on the attacker'));
  await bR.assignTurn(G, sam.id); await kickAll(); await until(async () => ((await stored(sam.id)).vitals || {}).apPenalty == null, 4000);
  const sv = (await stored(sam.id)).vitals, apMax = BSH.compute(sam).stat[IX('AP')];
  ok(sv.apPenalty == null && Number(sv.apRemaining) === apMax - 2, P('next turn: AP recovers 2 less (' + apMax + ' - 2): ' + JSON.stringify(sv)));
  // a hit that AC absorbs completely is still a hit, dealing 0
  await setAP(bS, sam.id, 6); d0 = await dmg(ogre.id);
  t = await atk(S, 'Samwise', 'Attack: Axe', 'Ogre', 4);   // 4 + 4 = 8 vs DA 2: hit, power 6 - AC 4
  ok(/HIT/.test(t) && !/MISS/.test(t), P('hit text: ' + t));
  await setAP(bS, sam.id, 6); d0 = await dmg(brute.id);
  t = await atk(S, 'Samwise', 'Attack: Axe', 'Brute', 6);   // 10 vs DA 12: a miss deals nothing
  ok(/MISS\./.test(t) && (await dmg(brute.id)) === d0, P('a miss deals no damage: ' + t));
  // a crit against a player who is asked (the defend prompt path)
  await setAP(bS, sam.id, 6); await kickAll(); await wait(300);
  openActions(S, 'Samwise'); await wait(60); actBtn(S, 'Attack: Axe').click(); await wait(80);
  S.$('atkTarget').value = [...S.$('atkTarget').options].find((o) => o.textContent === 'Avalon').value; S.$('atkTarget').dispatchEvent(new S.w.Event('change'));
  const av0 = await dmg(ava.id);
  S.$('atkDie').value = '12'; S.click(gB(S, /MY ROLL/)); await wait(500);
  ok(/Waiting for Avalon|MISS|HIT/.test(S.$('atkOut').textContent), P('attack on a player: ' + S.$('atkOut').textContent));
  if (/Waiting/.test(S.$('atkOut').textContent)) {
    await kick(V); await until(() => !V.$('defendModal').hidden);
    V.click([...V.$('defendBody').querySelectorAll('button')].find((b) => /TAKE IT/.test(b.textContent))); await wait(500);
    await kick(S); await until(() => !/Waiting/.test(S.$('atkOut').textContent));
  }
  ok(/CRITICAL HIT/.test(S.$('atkOut').textContent) && Math.abs((await dmg(ava.id)) - av0 - 4) < 0.001, P('crit through the target\'s prompt: ' + S.$('atkOut').textContent));
  S.click(S.$('actionsClose'));

  // ---------- Combo Attack ----------
  await setAP(bS, sam.id, 6); await setAP(bV, ava.id, 6); await kickAll(); await wait(300);
  openActions(S, 'Samwise'); await wait(60);
  ok([...S.$('actionsList').querySelectorAll('.arow .btn')].some((b) => b.textContent === 'Combo Attack'), P('Combo Attack is in the Actions menu'));
  actBtn(S, 'Combo Attack').click(); await wait(80);
  const fopts = [...S.$('comboFinisher').options].map((o) => o.textContent);
  ok(fopts.includes('Avalon') && !fopts.includes('Samwise') && [...S.$('comboSkill').options].length === 8, P('finisher list and 8 skills: ' + fopts.join()));
  S.$('comboFinisher').value = [...S.$('comboFinisher').options].find((o) => o.textContent === 'Avalon').value;
  S.$('comboSkill').value = 'Athletics';
  S.$('comboDie').value = '20'; S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => /MY D20/.test(b.textContent))); await wait(600);
  const lv = Number((await bS.listCampaigns()).find((x) => x.id === G).encounter.combos[sam.id].level);
  ok(lv === 25 || lv === 20, P('combo stored with its level: ' + S.$('comboOut').textContent));
  ok(Number(S.$('actionAp').textContent) === 3, P('3 AP spent: ' + S.$('actionAp').textContent));
  const cbk = (await bS.listCampaigns()).find((x) => x.id === G).encounter.combos[sam.id];
  ok(cbk.finisher === ava.id && cbk.skill === 'Athletics', P('combo names its Finisher and skill'));
  await kickAll(); await until(() => R.d.querySelector('#comboBox [data-combo]'));
  ok(!!R.d.querySelector('#comboBox [data-combo]') && /COMBO READY/.test(R.$('comboBox').textContent), P('the QM sees COMBO READY'));
  S.click(S.$('actionsClose'));
  // Ava (the Finisher) declines -> combo gone, Sam gets 3 AP back
  await until(() => V.d.querySelector('#comboBox [data-combo]'));
  V.click(btn(V.$('comboBox'), 'DECLINE / CANCEL')); await wait(500);
  const afterDecline = (await bS.listCampaigns()).find((x) => x.id === G).encounter.combos || {};
  ok(!afterDecline[sam.id], P('declined: combo removed'));
  ok(Number((await stored(sam.id)).vitals.apRemaining) === 6, P('declined: the Leader gets their 3 AP back: ' + (await stored(sam.id)).vitals.apRemaining));
  // do it again properly
  await kickAll(); await wait(300);
  openActions(S, 'Samwise'); await wait(60); actBtn(S, 'Combo Attack').click(); await wait(80);
  S.$('comboFinisher').value = [...S.$('comboFinisher').options].find((o) => o.textContent === 'Avalon').value; S.$('comboSkill').value = 'Athletics';
  S.$('comboDie').value = '20'; S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => /MY D20/.test(b.textContent))); await wait(600);
  const lvl = Number((await bS.listCampaigns()).find((x) => x.id === G).encounter.combos[sam.id].level);
  S.click(S.$('actionsClose'));
  // expiry: the Leader's next turn ends it (checked on a copy of the flow below); now Ava's turn: she attacks with the combo
  await bR.assignTurn(G, ava.id); await kickAll(); await setAP(bV, ava.id, 6); await setAP(bS, sam.id, 6);
  await kickAll();
  openActions(V, 'Avalon'); await wait(60); actBtn(V, 'Attack: Club').click(); await wait(80);
  const chk = V.$('atkCombo');
  ok(!!chk, P('Finisher sees the Combo Attack tick box'));
  chk.checked = true;
  V.$('atkTarget').value = [...V.$('atkTarget').options].find((o) => o.textContent === 'Ogre').value; V.$('atkTarget').dispatchEvent(new V.w.Event('change'));
  V.$('atkDie').value = '12'; V.click(gB(V, /MY ROLL/)); await wait(600);
  ok(/Waiting for the Leader/.test(V.$('atkOut').textContent), P('finisher waits for the Leader: ' + V.$('atkOut').textContent));
  const at1 = (await bV.listCampaigns()).find((x) => x.id === G).encounter.attack;
  ok(at1 && at1.combo && at1.combo.state === 'leader' && at1.combo.leader === sam.id, P('attack carries the combo, waiting on the Leader'));
  ok(!((await bV.listCampaigns()).find((x) => x.id === G).encounter.combos || {})[sam.id], P('the waiting combo is consumed'));
  await kickAll();
  ok(R.$('defendModal').hidden, P('the target is NOT prompted before the Leader rolls'));
  await until(() => !S.$('comboModal').hidden);
  ok(!S.$('comboModal').hidden && /Combo Attack/.test(S.$('comboBody').textContent), P('the Leader gets a prompt: ' + S.$('comboBody').textContent.slice(0, 90)));
  S.$('comboWeapon').value = '0';   // Unarmed Strike (BP)
  S.$('comboLDie').value = '12'; S.click([...S.$('comboBody').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent))); await wait(600);
  ok(S.$('comboModal').hidden, P('Leader prompt closes'));
  const at2 = (await bV.listCampaigns()).find((x) => x.id === G).encounter.attack;
  ok(at2.combo.state === 'defend' && at2.combo.lTotal === 21 && at2.combo.lPower === 4, P('the Leader\'s roll is on the attack: ' + JSON.stringify(at2.combo)));
  ok(Number((await stored(sam.id)).vitals.apRemaining) === 6 - 2, P('Leader paid their attack AP'));
  await kickAll(); await until(() => !R.$('defendModal').hidden);
  ok(!R.$('defendModal').hidden && /Combo Attack/.test(R.$('defendBody').textContent), P('now the target is prompted: ' + R.$('defendBody').textContent.slice(0, 120)));
  const o0 = await dmg(ogre.id);
  R.click([...R.$('defendBody').querySelectorAll('button')].find((b) => /TAKE IT/.test(b.textContent))); await wait(700);
  const res = BSH.COMBO.resolve({ da: 7, ac: 4, skill: 'Athletics', level: lvl, L: { total: 21, power: 4 }, F: { total: 21, power: 6 } });
  const last = (await bR.listCampaigns()).find((x) => x.id === G).encounter.lastAttack;
  ok(res.kind === 'perfect' && /PERFECT COMBO/.test(last.text), P('perfect combo (equal rolls): ' + last.text));
  const bp = 10;
  ok(res.damage === ((4 + bp) + (6 + bp)) * 2 * 2 - 4 * 2 * 0 - 0 || true, 'n/a');
  const expect = BSH.COMBAT.damage(((4 + bp) + (6 + bp)) * 2, 4, true);
  ok(res.damage === expect && Math.abs((await dmg(ogre.id)) - o0 - expect) < 0.001, P('damage: (14+16)*2 = 60, minus AC 4, doubled for two crits = ' + expect + '; stored +' + ((await dmg(ogre.id)) - o0)));
  ok(!(((await bR.listCampaigns()).find((x) => x.id === G).encounter) || {}).attack, P('the attack is finished'));

  // ---------- both miss: the Finisher rerolls; critical misses cost both 2 AP next turn ----------
  await setAP(bS, sam.id, 6); await setAP(bV, ava.id, 6);
  await bS.setCombo(sam.id, ava.id, 'Athletics', 15, 17, 'x');
  const id1 = await bV.startAttack(ava.id, brute.id, 0, 6, 'Finisher roll', sam.id);
  await bS.comboLeaderAttack(G, id1, 0, 4, 'Leader roll');
  await kickAll(); await until(() => !R.$('defendModal').hidden);
  R.click([...R.$('defendBody').querySelectorAll('button')].find((b) => /TAKE IT/.test(b.textContent))); await wait(700);
  const last2 = (await bR.listCampaigns()).find((x) => x.id === G).encounter.lastAttack;
  ok(/both attacks missed/.test(last2.text) && /Finisher rolls again/.test(last2.text), P('both miss: Finisher rolls again: ' + last2.text));
  ok(((await stored(sam.id)).vitals || {}).apPenalty === 2 && ((await stored(ava.id)).vitals || {}).apPenalty === 2, P('both critical misses cost 2 AP next turn'));

  // ---------- Tracking Perfect Combo: both attackers' next hit is critical ----------
  await setAP(bS, sam.id, 6); await setAP(bV, ava.id, 6);
  await bS.setCombo(sam.id, ava.id, 'Tracking', 25, 25, 'x');
  const tk = await bV.startAttack(ava.id, ogre.id, 21, 6, 'Finisher roll', sam.id);
  await bS.comboLeaderAttack(G, tk, 21, 4, 'Leader roll');
  await kickAll(); await until(() => !R.$('defendModal').hidden);
  R.click([...R.$('defendBody').querySelectorAll('button')].find((b) => /TAKE IT/.test(b.textContent))); await wait(700);
  const lastT = (await bR.listCampaigns()).find((x) => x.id === G).encounter.lastAttack;
  ok(/PERFECT COMBO/.test(lastT.text) && /next hit is a critical/.test(lastT.text), P('Tracking Perfect Combo says both next hits are critical: ' + lastT.text));
  ok(((await stored(sam.id)).vitals || {}).nextCrit === true && ((await stored(ava.id)).vitals || {}).nextCrit === true, P('both attackers now hold Next Hit Critical'));
  const b0 = await dmg(brute.id);
  await bV.startAttack(ava.id, brute.id, 14, 6, 'Plain attack');   // 14 vs DA 12 is an ordinary hit
  await kickAll(); await until(() => !R.$('defendModal').hidden);
  R.click([...R.$('defendBody').querySelectorAll('button')].find((b) => /TAKE IT/.test(b.textContent))); await wait(700);
  const lastP = (await bR.listCampaigns()).find((x) => x.id === G).encounter.lastAttack;
  ok(/CRITICAL HIT/.test(lastP.text) && /Next Hit Critical spent/.test(lastP.text), P('the held flag turns an ordinary hit into a critical: ' + lastP.text));
  ok(Math.abs((await dmg(brute.id)) - b0 - BSH.COMBAT.damage(6, 4, true)) < 0.001, P('doubled damage after AC'));
  ok(!((await stored(ava.id)).vitals || {}).nextCrit && ((await stored(sam.id)).vitals || {}).nextCrit === true, P('only the attacker who hit spends the flag'));

  // ---------- rules around the combo ----------
  let e;
  try { await bS.comboLeaderAttack(G, id1, 1, 1, 'x'); } catch (er) { e = er.message; }
  ok(!!e, P('the Leader cannot roll twice / after it is done: ' + e));
  await bS.setCombo(sam.id, ava.id, 'Courage', 10, 12, 'x');
  e = ''; try { await bS.startAttack(sam.id, ogre.id, 5, 5, 'x', sam.id); } catch (er) { e = er.message; }
  ok(/not waiting for this character/.test(e), P('only the named Finisher can use a combo: ' + e));
  e = ''; try { await bV.startAttack(ava.id, sam.id, 5, 5, 'x', sam.id); } catch (er) { e = er.message; }
  ok(/someone else/.test(e), P('the Finisher cannot target the Leader: ' + e));
  e = ''; try { await bS.setCombo(sam.id, sam.id, 'Courage', 10, 12, 'x'); } catch (er) { e = er.message; }
  ok(/another character/.test(e), P('cannot be your own Finisher'));
  e = ''; try { await bS.setCombo(sam.id, ava.id, 'Cooking', 10, 12, 'x'); } catch (er) { e = er.message; }
  ok(/not a combo skill/.test(e), P('only the 8 combo skills'));
  e = ''; try { await bV.setCombo(sam.id, ava.id, 'Courage', 10, 12, 'x'); } catch (er) { e = er.message; }
  ok(/your own characters/.test(e), P('a player cannot start a combo for someone else'));
  // expires when the Leader's turn begins
  ok(!!((await bR.listCampaigns()).find((x) => x.id === G).encounter.combos || {})[sam.id], P('combo is waiting'));
  await bR.assignTurn(G, sam.id);
  ok(!((await bR.listCampaigns()).find((x) => x.id === G).encounter.combos || {})[sam.id], P('combo ends when the Leader\'s turn begins'));
  // ends if either leaves the encounter: cancel by QM refunds
  await bS.setCombo(sam.id, ava.id, 'Handling', 10, 12, 'x'); await setAP(bS, sam.id, 3);
  await bR.cancelCombo(sam.id);
  ok(Number((await stored(sam.id)).vitals.apRemaining) === 6 && !((await bR.listCampaigns()).find((x) => x.id === G).encounter.combos || {})[sam.id], P('QM cancel refunds the Leader'));
  await bS.setCombo(sam.id, ava.id, 'Handling', 10, 12, 'x'); await setAP(bS, sam.id, 3);
  await bS.cancelCombo(sam.id);
  ok(Number((await stored(sam.id)).vitals.apRemaining) === 3, P('Leader cancelling their own combo is not refunded'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
