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
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(200); };
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G); await bV.joinCampaign(G);
  const mk = async (A, b, name, created) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; c.created = created; if (name === 'Samwise') c.items = [{ name: 'Axe', qty: 1, weapon: true, weaponProps: { type: 'Melee', dmg: 'BP+30+1D6', cr: '2', cost: '2 AP', effect: 'Chop' } }, { name: 'Club', qty: 1, weapon: true, weaponProps: {} }, { name: 'Rope', qty: 1 }]; await b.saveCharacter(c); return c; };
  const sam = await mk(S, bS, 'Samwise', 2), ava = await mk(V, bV, 'Avalon', 1);
  for (const A of [R, S, V]) A.go('campaign-' + G);
  const row = (A, n) => [...A.d.querySelectorAll('#campChars .cchar')].find((r) => r.querySelector('.char-btn span').textContent === n);
  const btn = (root, t) => [...root.querySelectorAll('button')].find((b) => b.textContent === t);
  await until(() => row(S, 'Samwise') && row(S, 'Avalon'));
  const openActions = (A, n) => A.click(btn(row(A, n), 'ACTIONS'));
  const costs = (A) => [...A.$('actionsList').querySelectorAll('.acost')];
  const stored = async (b, id) => (await b.listCharacters()).find((c) => c.id === id) || (await b.listCampaignCharacters(G)).find((r) => r.ch.id === id).ch;
  const total = (c) => S.w.BSH.compute(c).stat;


  const rows = (A) => [...A.$('actionsList').querySelectorAll('.arow .btn')].map((b) => b.textContent);
  openActions(S, 'Samwise');
  const r = rows(S);
  ok(r.includes('Attack: Axe') && r.includes('Attack: Club') && !r.some((x) => /Rope/.test(x)), P('weapon rows only: ' + r.join(',')));
  ok(r.indexOf('Attack: Axe') > r.indexOf('Unarmed Strike') && r[r.length - 1] === 'Rest', P('placed before Rest'));
  const ab = [...S.$('actionsList').querySelectorAll('.arow')].find((e) => e.textContent.includes('Attack: Axe'));
  ab.querySelector('.btn').click(); await wait(50);
  const t = S.$('actionDetail').textContent;
  ok(/Cost: 2 AP/.test(t) && /Attack Dmg: BP\+30\+1D6/.test(t) && /CR: 2/.test(t) && /Effect: Chop/.test(t) && /Type: Melee/.test(t), P('detail card: ' + t.slice(0, 120)));
  S.click(S.$('actionBack'));
  const cb = [...S.$('actionsList').querySelectorAll('.arow')].find((e) => e.textContent.includes('Attack: Club'));
  ok(!cb.querySelector('.acost'), P('no cost -> no cost box'));
  S.click(S.$('actionsClose'));

  await bR.startEncounter(G); await bS.setInitiative(G, sam.id, 15, 0); await bV.setInitiative(G, ava.id, 5, 0);
  for (const A of [R, S, V]) await kick(A);
  await until(() => row(S, 'Samwise') && btn(row(S, 'Samwise'), 'ACTIONS'));
  const et = async (id) => Number(((await stored(bS, id)).info || {}).explodeTokens || 0);
  const setAb = async (b, c, abs) => { const x = await stored(b, c.id); x.abilities = abs.map((n) => ({ name: n, desc: '' })); await b.saveCharacter(x); };
  const pressIn = (A, re) => [...A.$('etBody').querySelectorAll('button')].find((b) => re.test(b.textContent));

  // ---- QM gives Explode Tokens ----
  await kick(R);
  const giveBtn = R.$('giveEtBtn'); ok(!!giveBtn, P('QM has a GIVE EXPLODE TOKENS button'));
  R.click(giveBtn); await wait(50);
  ok(!R.$('etModal').hidden && /Samwise/.test(R.$('etBody').textContent) && /Avalon/.test(R.$('etBody').textContent), P('lists the players'));
  R.$('etGiveAmt').value = '3'; R.click(R.$('etGiveGo')); await wait(500);
  ok((await et(sam.id)) === 3 && (await et(ava.id)) === 3, P('everyone ticked gets 3: ' + (await et(sam.id)) + '/' + (await et(ava.id))));
  R.click(R.$('etGiveGo')); await wait(500); R.click(R.$('etGiveGo')); await wait(500);
  ok((await et(sam.id)) === 9 || (await et(sam.id)) === 10, P('and more: ' + (await et(sam.id))));
  R.click(R.$('etGiveGo')); await wait(500);
  ok((await et(sam.id)) === 10, P('capped at 10'));
  R.click(R.$('etGiveClose'));
  ok((await bR.setExplodeTokens(sam.id, 4)) === undefined && (await et(sam.id)) === 4, P('reset to 4'));
  await bR.setExplodeTokens(ava.id, 0);
  for (const A of [R, S, V]) await kick(A);

  // ---- attacking with Explode Tokens ----
  const startAtk = async (die, declare) => {
    await bS.setVital(sam.id, 'apRemaining', 20); await kick(S);
    if (!S.$('actionsClose').hidden) S.click(S.$('actionsClose'));
    openActions(S, 'Samwise');
    [...S.$('actionsList').querySelectorAll('.arow')].find((e) => e.textContent.includes('Attack: Axe')).querySelector('button.acost').click(); await wait(80);
    const stp = S.$('actionDesc').querySelector('.etstep');
    for (let i = 0; i < 12; i++) { const mb = stp.querySelector('button[aria-label="Fewer Explode Tokens"]'); if (mb && !mb.disabled) mb.click(); }
    for (let i = 0; i < declare; i++) { stp.querySelector('button[aria-label="More Explode Tokens"]').click(); }
    S.$('atkDie').value = String(die);
    S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent))); await wait(200);
  };
  await bS.setVital(sam.id, 'apRemaining', 20);
  const SA = S.w.BSH.compute(sam).stat[S.w.BSH.STATS.findIndex((x) => x.key === 'SA')];
  await startAtk(6, 2);
  ok(!S.$('etModal').hidden && /Attack d12/.test(S.$('etBody').textContent) && /Damage d6/.test(S.$('etBody').textContent), P('declared ET opens the roller with the attack and damage dice'));
  ok(S.$('etDone').disabled, P('DONE waits until every token is placed'));
  const plus = [...S.$('etBody').querySelectorAll('button[aria-label="More tokens on this die"]')][0];
  plus.click(); S.$('etBody').querySelectorAll('button[aria-label="More tokens on this die"]')[0].click();
  S.click(S.$('etApply')); await wait(50);
  ok(!S.$('etDone').disabled && /Attack d12\s*8/.test(S.$('etBody').textContent), P('both tokens on the attack die: 6 -> 8'));
  S.click(S.$('etDone')); await wait(400);
  ok((await et(sam.id)) === 2 && /d12 6 \[ET 8\]/.test(S.$('atkOut').textContent) && new RegExp('SA ' + SA + ' = ' + (8 + SA)).test(S.$('atkOut').textContent), P('2 ET spent; text: ' + S.$('atkOut').textContent));
  // explosion: natural 12, one token
  await startAtk(12, 1);
  [...S.$('etBody').querySelectorAll('button[aria-label="More tokens on this die"]')][0].click(); S.click(S.$('etApply')); await wait(50);
  ok(/12 \+ \d+ = \d+/.test(S.$('etBody').textContent), P('12 + 1 ET explodes: ' + S.$('etBody').textContent.slice(0, 80)));
  S.click(S.$('etDone')); await wait(400);
  ok((await et(sam.id)) === 1 && /d12 12 \[ET 12 \+ \d+ = \d+\]/.test(S.$('atkOut').textContent) && /\+ 5/.test(S.$('atkOut').textContent), P('natural 12 still adds 5; ET text: ' + S.$('atkOut').textContent));
  // cancel keeps the tokens
  await startAtk(5, 1);
  S.click(S.$('etCancel')); await wait(100);
  ok((await et(sam.id)) === 1 && S.$('etModal').hidden, P('cancelling spends nothing'));
  // can't declare more than held
  const stp = S.$('actionDesc').querySelector('.etstep');
  ok(Number(stp.querySelector('[data-etn]').textContent) === 1 && stp.querySelector('button[aria-label="More Explode Tokens"]').disabled, P('declared ET is capped at the tokens held'));
  S.click(S.$('actionBack'));

  // ---- Lucky ----
  await bR.setExplodeTokens(sam.id, 5); await setAb(bS, sam, ['Lucky']);
  for (const A of [R, S]) await kick(A); await wait(400); await kick(S);
  await startAtk(2, 0);
  ok(!S.$('etModal').hidden && !!pressIn(S, /REROLL \(3 ET, LUCKY\)/), P('Lucky offers a reroll for 3 ET'));
  pressIn(S, /REROLL \(3 ET, LUCKY\)/).click(); await wait(30);
  ok(!pressIn(S, /REROLL \(3 ET, LUCKY\)/), P('only 2 ET left: no second reroll'));
  S.click(S.$('etDone')); await wait(400);
  ok((await et(sam.id)) === 2, P('3 ET spent on the reroll: ' + (await et(sam.id)) + ' / ' + S.$('atkOut').textContent + ' / ' + S.$('etBody').textContent));
  // Flashy
  await bR.setExplodeTokens(sam.id, 3); await setAb(bS, sam, ['Fighting Style: Flashy']);
  for (const A of [R, S]) await kick(A); await wait(400); await kick(S);
  await startAtk(5, 1);
  ok(/2 left to place/.test(S.$('etBody').textContent), P('Flashy: 1 ET counts as 2: ' + S.$('etBody').textContent.slice(0,150) + JSON.stringify((S.w.__dbg || 0))));
  [...S.$('etBody').querySelectorAll('button[aria-label="More tokens on this die"]')][0].click(); [...S.$('etBody').querySelectorAll('button[aria-label="More tokens on this die"]')][0].click(); S.click(S.$('etApply')); await wait(50);
  S.click(S.$('etDone')); await wait(400);
  ok((await et(sam.id)) === 2 && /d12 5 \[ET 7\]/.test(S.$('atkOut').textContent), P('and costs 1: ' + S.$('atkOut').textContent));

  // ---- block with Explode Tokens ----
  await setAb(bS, sam, []);
  const avaC = await stored(bV, ava.id); avaC.items = [{ name: 'Shield', qty: 1, eqL: true, weapon: true, weaponProps: { cr: '3' } }]; await bV.saveCharacter(avaC);
  await bR.setExplodeTokens(ava.id, 2); await bR.setExplodeTokens(sam.id, 0);
  for (const A of [R, S, V]) await kick(A); await wait(400); for (const A of [S, V]) await kick(A);
  await startAtk(12, 0);
  ok(/Waiting for Avalon/.test(S.$('atkOut').textContent), P('attack waits for the block'));
  await kick(V); await until(() => !V.$('defendModal').hidden);
  const vst = V.$('defendBody').querySelector('.etstep');
  vst.querySelector('button[aria-label="More Explode Tokens"]').click();
  V.$('defendBody').querySelector('input[type=number]').value = '5';
  V.click([...V.$('defendBody').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent))); await wait(100);
  ok(!V.$('etModal').hidden, P('defender gets the ET roller'));
  V.click(V.$('etApply')); await wait(30); V.click(V.$('etDone')); await wait(500);
  ok((await stored(bV, ava.id)).info.explodeTokens === 1, P('block spent 1 ET'));
  await kick(S); await until(() => !/Waiting/.test(S.$('atkOut').textContent));
  ok(/block \(d12 5 \[ET 6\] \+ CR 3 = 9, spent 1 AP\)/.test(S.$('atkOut').textContent), P('block text: ' + S.$('atkOut').textContent));

  // ---- skill check ----
  await bR.setExplodeTokens(sam.id, 2);
  for (const A of [R, S, V]) await kick(A); await wait(300); await kick(S);
  if (!S.$('actionsClose').hidden) S.click(S.$('actionsClose'));
  S.click(btn(row(S, 'Samwise'), 'SKILL CHECK')); await wait(50);
  const sst = S.$('skillEt').querySelector('.etstep'); sst.querySelector('button[aria-label="More Explode Tokens"]').click();
  const smod = S.w.BSH.compute(await stored(bS, sam.id)).skillMod[+S.$('skillSel').value];
  S.setv(S.$('skillDie'), '4'); S.click(S.$('skillSet')); await wait(100);
  ok(!S.$('etModal').hidden && /d20/.test(S.$('etBody').textContent), P('skill check opens the ET roller'));
  S.click(S.$('etApply')); await wait(30); S.click(S.$('etDone')); await wait(400);
  ok(/d20 4 \[ET 5\]/.test(S.$('skillOut').textContent) && S.$('skillOut').textContent.endsWith('= ' + (5 + smod)) && (await et(sam.id)) === 1, P('skill: ' + S.$('skillOut').textContent));
  S.click(S.$('skillClose'));

  // ---- Explosive Personality: +1 ET at each rest ----
  await setAb(bS, sam, ['Explosive Personality']);
  for (const A of [R, S]) await kick(A); await wait(300); await kick(S);
  openActions(S, 'Samwise');
  [...S.$('actionsList').querySelectorAll('.arow .btn')].find((b) => b.textContent === 'Rest').click();
  [...S.$('actionDesc').querySelectorAll('button')].find((b) => b.textContent === 'TAKE EXTENDED REST').click();
  [...S.$('actionDesc').querySelectorAll('button')].find((b) => b.textContent === 'APPLY REST').click(); await wait(500);
  ok((await et(sam.id)) === 2, P('resting gives +1 ET: ' + (await et(sam.id))));
  S.click(S.$('actionBack')); S.click(S.$('actionBack')); S.click(S.$('actionsClose'));

  // ---- initiative ----
  await bR.endEncounter(G); await bR.startEncounter(G);
  await bR.setExplodeTokens(sam.id, 2);
  for (const A of [R, S, V]) await kick(A); await wait(300); await kick(S);
  await until(() => !S.$('encounterModal').hidden);
  const ist = S.$('encRows').querySelector('.etstep');
  ok(!!ist, P('initiative prompt has the ET stepper'));
  ist.querySelector('button[aria-label="More Explode Tokens"]').click();
  S.$('encRows').querySelector('input[type=number]').value = '9';
  S.click([...S.$('encRows').querySelectorAll('button')].find((b) => b.textContent === 'SET ROLL')); await wait(100);
  S.click(S.$('etApply')); await wait(30); S.click(S.$('etDone')); await wait(500);
  const ib = (await bS.listCampaigns()).find((x) => x.id === G).encounter.initiatives[sam.id];
  ok(ib && ib.die === 9 && ib.total === 10 + S.w.BSH.compute(await stored(bS, sam.id)).stat[3] && (await et(sam.id)) === 1, P('initiative stored with the +1: ' + JSON.stringify(ib)));
  for (const A of [S, V]) ok(A.w.__errors.length === 0, P('no errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
