// Attack lists (character + held weapons), the Load action, firing, and a QM changing a player's items.
const { boot, wait, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam: { name: 'Sam', username: 'sam_2', email: 'sam@example.com', password: 'another pass1' },
  ava: { name: 'Ava', username: 'ava_3', email: 'ava@example.com', password: 'third pass12' }
};
async function scenario(label, makeAs) {
  console.log('--- ' + label); const P = (m) => `[${label}] ${m}`;
  const as = await makeAs(); const R = await as('ricky'), S = await as('sam'), V = await as('ava');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(250); };
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G); await bV.joinCampaign(G);
  const sam = S.w.BSH.blankCharacter(); sam.id = S.w.crypto.randomUUID(); sam.info.name = 'Samwise'; sam.campaignId = G; sam.created = 2;
  sam.attacks = [{ name: 'Unarmed Strike', cost: '2 AP', dmg: 'BP', range: '0-1', damage: '', effect: 'Make an Attack without a Weapon.' }, { name: 'Bite', cost: '1 AP', dmg: 'BP', range: '0', damage: 'Sharp', effect: '' }];
  sam.items = [
    { name: 'Crossbow', qty: 1, eqR: true, weapon: true, uid: 'xb1', weaponProps: { type: 'Crossbow', loadCost: '3 AP', ammo: 'Bolt' },
      attacks: [{ name: 'Shoot', cost: '2 AP', dmg: '5', range: '10', damage: 'Sharp', effect: '', needsLoad: true }, { name: 'Bash', cost: '2 AP', dmg: 'BP', range: '0-1', damage: 'Blunt', effect: '' }] },
    { name: 'Bolt', qty: 1 },
    { name: 'Greatsword', qty: 1, eqL: true, weapon: true, twoHanded: true, weaponProps: {}, attacks: [{ name: 'Cleave', cost: '3 AP', dmg: 'BP+4' }] },
    { name: 'Dagger', qty: 1, weapon: true, weaponProps: { dmg: 'BP+1', cost: '1 AP' } }   // old-style weapon, not held
  ];
  await bS.saveCharacter(sam);
  const ava = V.w.BSH.blankCharacter(); ava.id = V.w.crypto.randomUUID(); ava.info.name = 'Avalon'; ava.campaignId = G; ava.created = 1; await bV.saveCharacter(ava);
  const row = (A, n) => [...A.d.querySelectorAll('#campChars .cchar')].find((r) => r.querySelector('.char-btn span').textContent === n);
  const btn = (root, t) => [...root.querySelectorAll('button')].find((b) => b.textContent === t);
  const stored = async (b, id) => (await b.listCharacters()).find((c) => c.id === id) || (await b.listCampaignCharacters(G)).find((r) => r.ch.id === id).ch;
  const arow = (A, name) => [...A.$('actionsList').querySelectorAll('.arow')].find((e) => e.querySelector('.btn').textContent === name);
  const names = (A) => [...A.$('actionsList').querySelectorAll('.arow > .btn')].map((b) => b.textContent);
  const item = (c, n) => c.items.find((x) => x.name === n);

  await bR.startEncounter(G); await bS.setInitiative(G, sam.id, 15, 0); await bV.setInitiative(G, ava.id, 5, 0);
  for (const A of [R, S, V]) { A.go('campaign-' + G); }
  await until(() => row(S, 'Samwise') && btn(row(S, 'Samwise'), 'ACTIONS'));
  S.click(btn(row(S, 'Samwise'), 'ACTIONS'));
  let n = names(S);
  ok(n.includes('Unarmed Strike') && n.includes('Bite') && n.indexOf('Bite') < n.indexOf('Combo Attack'), P('own attacks listed, before Combo Attack: ' + n.join(',')));
  ok(n.includes('Crossbow: Shoot') && n.includes('Crossbow: Bash') && n.includes('Load: Crossbow'), P('held weapon: its attacks and Load'));
  ok(!n.some((x) => /Greatsword|Cleave/.test(x)), P('two-handed weapon in one hand: no attacks'));
  ok(!n.some((x) => /Dagger/.test(x)), P('weapon not in a hand: no attacks'));
  ok(!arow(S, 'Crossbow: Shoot').querySelector('button.acost') && arow(S, 'Crossbow: Shoot').querySelector('.acost').textContent === 'LOAD FIRST', P('Shoot needs loading: LOAD FIRST, no button'));
  ok(!!arow(S, 'Crossbow: Bash').querySelector('button.acost'), P('Bash does not need loading'));
  const AP0 = Number(S.$('actionAp').textContent);

  // ---- Load: AP, 1 Bolt and the loaded mark together ----
  S.click(arow(S, 'Load: Crossbow').querySelector('button.acost'));
  ok(await until(() => /Action Performed: Load: Crossbow \(-3 AP, -1 Bolt\)/.test(S.$('actionFeedback').textContent)), P('load feedback: ' + S.$('actionFeedback').textContent));
  let c = await stored(bS, sam.id);
  ok(c.vitals.apRemaining === AP0 - 3 && item(c, 'Bolt').qty === 0 && item(c, 'Crossbow').loaded === true && c.itemsEdit && c.itemsEdit.why === 'load', P('stored: AP -3, Bolt 0, loaded'));
  ok(Number(S.$('actionAp').textContent) === AP0 - 3 && arow(S, 'Load: Crossbow').querySelector('.acost').textContent === 'LOADED', P('menu: AP box and LOADED'));
  ok(arow(S, 'Crossbow: Shoot').querySelector('button.acost').textContent === '2 AP', P('Shoot now has its cost button'));

  // ---- Fire: the shot empties the crossbow ----
  S.click(arow(S, 'Crossbow: Shoot').querySelector('button.acost')); await wait(80);
  S.$('atkDie').value = '6'; S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent)));
  ok(await until(async () => item(await stored(bS, sam.id), 'Crossbow').loaded === false), P('firing empties it'));
  ok(await until(() => /MISS|HIT/.test(S.$('atkOut').textContent)), P('the attack went ahead: ' + S.$('atkOut').textContent));
  c = await stored(bS, sam.id);
  ok(c.vitals.apRemaining === AP0 - 5, P('Shoot cost 2 AP'));
  S.click(S.$('actionsClose')); await bS.setVital(sam.id, 'apRemaining', 10); await kick(S);
  S.click(btn(row(S, 'Samwise'), 'ACTIONS')); await wait(50);
  ok(arow(S, 'Crossbow: Shoot').querySelector('.acost').textContent === 'LOAD FIRST', P('LOAD FIRST again'));
  S.click(arow(S, 'Load: Crossbow').querySelector('button.acost'));
  ok(await until(() => /No Bolt left/.test(S.$('actionFeedback').textContent)), P('no ammo: ' + S.$('actionFeedback').textContent));
  ok((await stored(bS, sam.id)).vitals.apRemaining === 10, P('no ammo: no AP spent'));
  S.click(S.$('actionsClose'));

  // ---- a QM changes a player's items from the sheet ----
  await until(() => row(R, 'Samwise'));
  R.go('character-' + sam.id); await wait(150); R.tab('items'); await wait(50);
  ok(/change the items/.test(R.$('saveStatus').textContent), P('QM sheet says items can be changed: ' + R.$('saveStatus').textContent));
  const qtyR = [...R.d.querySelectorAll('#panel-items .item')].find((e) => e.querySelector('textarea.wrapname').value === 'Bolt').querySelector('input.num');
  ok(!qtyR.disabled && R.$('panel-info').querySelector('input').disabled, P('items editable, the rest read only'));
  qtyR.value = '5'; qtyR.dispatchEvent(new R.w.Event('input', { bubbles: true }));
  ok(await until(async () => { const x = await stored(bS, sam.id); return item(x, 'Bolt').qty === 5 && x.itemsEdit.why === 'qm'; }), P('saved to Samwise'));
  await kick(S);
  ok(await until(() => /The QM changed the items of Samwise/.test(S.$('toast').textContent)), P('player popup: ' + S.$('toast').textContent));
  S.go('character-' + sam.id); await wait(150); S.tab('items'); await wait(50);
  const qtyS = [...S.d.querySelectorAll('#panel-items .item')].find((e) => e.querySelector('textarea.wrapname').value === 'Bolt').querySelector('input.num');
  ok(qtyS.value === '5', P("the player's sheet shows the QM's change"));
  // a stale copy saved by the owner does not undo it
  const stale = JSON.parse(JSON.stringify(c)); item(stale, 'Bolt').qty = 99; stale.info.name = 'Samwise';
  await bS.saveCharacter(stale);
  ok(item(await stored(bS, sam.id), 'Bolt').qty === 5, P('stale save keeps the QM items'));
  // the player keeps editing as normal once up to date
  qtyS.value = '4'; qtyS.dispatchEvent(new S.w.Event('input', { bubbles: true }));
  ok(await until(async () => item(await stored(bS, sam.id), 'Bolt').qty === 4), P('player edits still save'));
  // another player only reads
  await until(() => row(V, 'Samwise'));
  V.go('character-' + sam.id); await wait(150); V.tab('items'); await wait(50);
  ok([...V.d.querySelectorAll('#panel-items input, #panel-items textarea')].every((e) => e.disabled), P('non-QM: items read only'));
  // only a QM may use setItems
  let err = ''; try { await bV.setItems(sam.id, []); } catch (e) { err = e.message; }
  ok(/Only a QM/.test(err), P('setItems refused for a player: ' + err));

  // ---- two hands: the Greatsword's attacks appear when held in both ----
  S.go('campaign-' + G); await wait(100);
  c = await stored(bS, sam.id);
  c.items.forEach((x) => { x.eqL = false; x.eqR = false; }); item(c, 'Greatsword').eqL = true; item(c, 'Greatsword').eqR = true;
  await bS.saveCharacter(c); await kick(S);
  await until(() => row(S, 'Samwise') && btn(row(S, 'Samwise'), 'ACTIONS'));
  S.click(btn(row(S, 'Samwise'), 'ACTIONS'));
  ok(await until(() => names(S).includes('Greatsword: Cleave') && !names(S).some((x) => /Crossbow/.test(x))), P('both hands: Cleave shown, crossbow gone: ' + names(S).join(',')));
  S.click(S.$('actionsClose'));
  // old-style weapon was converted: one attack named after it
  const dg = item(c, 'Dagger');
  ok(Array.isArray(dg.attacks) && dg.attacks.length === 1 && dg.attacks[0].name === 'Dagger' && dg.attacks[0].dmg === 'BP+1' && dg.attacks[0].cost === '1 AP' && !('dmg' in dg.weaponProps), P('old weapon converted: ' + JSON.stringify(dg.attacks)));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
