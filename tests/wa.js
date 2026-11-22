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
  const mk = async (A, b, name, created) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; c.created = created; if (name === 'Samwise') c.items = [{ name: 'Axe', qty: 1, eqR: true, weapon: true, weaponProps: { type: 'Melee', dmg: 'BP+30+1D6', cr: '2', cost: '2 AP', effect: 'Chop' } }, { name: 'Club', qty: 1, eqL: true, weapon: true, weaponProps: {} }, { name: 'Rope', qty: 1 }]; await b.saveCharacter(c); return c; };
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
  openActions(S, 'Samwise');
  const AP0 = Number(S.$('actionAp').textContent);
  const axe = [...S.$('actionsList').querySelectorAll('.arow')].find((e) => e.textContent.includes('Attack: Axe')).querySelector('button.acost');
  ok(!!axe, P('axe cost is a button'));
  axe.click(); await wait(80);
  ok(!!S.$('atkTarget') && [...S.$('atkTarget').options].map((o) => o.textContent).join() === 'Avalon' && Number(S.$('actionAp').textContent) === AP0, P('attack card: only Avalon (in the encounter) is a target; nothing spent yet'));
  const tc = ava; const sa = S.w.BSH.compute(sam).stat[S.w.BSH.STATS.findIndex((x) => x.key === 'SA')];
  const tst = S.w.BSH.compute(ava).stat, DA = tst[S.w.BSH.STATS.findIndex((x) => x.key === 'DA')], AC = tst[S.w.BSH.STATS.findIndex((x) => x.key === 'AC')], BP = S.w.BSH.compute(sam).stat[S.w.BSH.STATS.findIndex((x) => x.key === 'BP')];
  const hp0 = async () => (await stored(bV, ava.id)).vitals && (await stored(bV, ava.id)).vitals.damage || 0;
  const d0 = await hp0();
  S.$('atkDie').value = '0'; S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent))); await wait(80);
  ok(/1 to 12/.test(S.$('atkOut').textContent) && Number(S.$('actionAp').textContent) === AP0, P('bad die: message, nothing spent'));
  // pick a roll that misses/hits deterministically
  const need = DA - sa;                       // total = sa + die (+-5); hit when > DA
  const missDie = need >= 12 ? 11 : null;
  if (missDie) {
    S.$('atkDie').value = String(missDie); S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent))); await wait(300);
    ok(/MISS/.test(S.$('atkOut').textContent) && Number(S.$('actionAp').textContent) === AP0 - 2 && (await hp0()) === d0, P('miss: AP spent, no damage: ' + S.$('atkOut').textContent));
  }
  const hitDie = need < 12 ? Math.max(1, Math.min(12, need + 1)) : 12;
  const hitTotal = sa + hitDie + (hitDie === 12 ? 5 : hitDie === 1 ? -5 : 0);
  S.$('atkDie').value = String(hitDie); S.click([...S.$('actionDesc').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent))); await wait(400);
  const txt = S.$('atkOut').textContent, d1 = await hp0();
  if (hitTotal > DA) {
    ok(/HIT/.test(txt) && d1 >= d0, P('hit text: ' + txt));
    const m = /= (-?[\d.]+) damage/.exec(txt);
    ok(!!m && Math.abs((d1 - d0) - Number(m[1])) < 0.01 && Number(m[1]) >= 0, P('stored damage matches the text: +' + (d1 - d0) + ' / ' + txt));
    ok(Math.abs(Number(m[1]) - Math.max(0, S.w.BSH.compute(sam).stat[0] * 0 + (Number(/Pwr [^=]*= (-?[\d.]+)/.exec(txt)[1]) - AC))) < 0.01, P('damage = power - AC'));
  } else ok(/MISS/.test(txt), P('no hit possible: ' + txt));

  // ---- block / parry ----
  const avaC = await stored(bV, ava.id); avaC.items = [{ name: 'Shield', qty: 1, eqL: true, weapon: true, weaponProps: { cr: '3' } }]; await bV.saveCharacter(avaC);
  await bS.setVital(sam.id, 'apRemaining', 10);
  for (const A of [R, S, V]) await kick(A);
  const avAP0 = Number((await stored(bV, ava.id)).vitals.apRemaining ?? V.w.BSH.compute(avaC).stat[4]);
  const gB = (A, re) => [...A.$('actionDesc').querySelectorAll('button')].find((b) => re.test(b.textContent));
  const startAtk = async (die) => {
    S.$('actionsClose').hidden ? null : S.click(S.$('actionsClose'));
    openActions(S, 'Samwise');
    [...S.$('actionsList').querySelectorAll('.arow')].find((e) => e.textContent.includes('Attack: Axe')).querySelector('button.acost').click(); await wait(80);
    S.$('atkDie').value = String(die); S.click(gB(S, /MY ROLL/)); await wait(500);
  };
  await startAtk(12);
  ok(/Waiting for Avalon/.test(S.$('atkOut').textContent), P('attacker waits: ' + S.$('atkOut').textContent));
  await kick(V); await until(() => !V.$('defendModal').hidden);
  ok(!V.$('defendModal').hidden && /Samwise attacks/.test(V.$('defendBody').textContent) && /BLOCK/.test(V.$('defendBody').textContent), P('defender is prompted: ' + V.$('defendBody').textContent.slice(0, 100)));
  const apBefore = V.w.BSH.compute(await stored(bV, ava.id)).stat[4];
  V.$('defendBody').querySelector('input').value = '12';
  V.click([...V.$('defendBody').querySelectorAll('button')].find((b) => /MY ROLL/.test(b.textContent))); await wait(500);
  ok(V.$('defendModal').hidden, P('defender prompt closes'));
  const avAfter = await stored(bV, ava.id);
  ok(Number(avAfter.vitals.apRemaining) === Number(avAfter.vitals.apRemaining) && Number(avAfter.vitals.apRemaining) === (avAP0 - 1), P('block spent 1 AP: ' + avAfter.vitals.apRemaining));
  await kick(S); await until(() => !/Waiting/.test(S.$('atkOut').textContent));
  const rt = S.$('atkOut').textContent;
  ok(/block \(d12 12 \+ CR 3 = 15, spent 1 AP\)/.test(rt) && /MISS/.test(rt), P('attacker sees the block result: ' + rt));
  // take it
  const dB = (await stored(bV, ava.id)).vitals.damage || 0;
  await startAtk(12);
  await kick(V); await until(() => !V.$('defendModal').hidden);
  V.click([...V.$('defendBody').querySelectorAll('button')].find((b) => /TAKE IT/.test(b.textContent))); await wait(500);
  await kick(S); await until(() => !/Waiting/.test(S.$('atkOut').textContent));
  const rt2 = S.$('atkOut').textContent;
  ok(/HIT/.test(rt2) && !/block/.test(rt2) && ((await stored(bV, ava.id)).vitals.damage || 0) > dB, P('take it: damage lands: ' + rt2));
  // QM: no block
  const dN = (await stored(bV, ava.id)).vitals.damage || 0;
  await startAtk(12);
  await kick(R); await until(() => R.$('noBlock'));
  ok(!!R.$('noBlock') && /ATTACK WAITING/.test(R.$('attackWait').textContent) && !S.$('actionDesc').textContent.includes('CALL OFF'), P('QM sees the waiting banner; no call-off button'));
  R.click(R.$('noBlock')); await wait(500);
  await kick(S); await until(() => !/Waiting/.test(S.$('atkOut').textContent));
  ok(/\(no block\)/.test(S.$('atkOut').textContent) && /HIT/.test(S.$('atkOut').textContent) && ((await stored(bV, ava.id)).vitals.damage || 0) > dN, P('no block: damage lands: ' + S.$('atkOut').textContent));
  await kick(V); await kick(R); await wait(200);
  ok(V.$('defendModal').hidden && !R.$('noBlock'), P('prompt and banner gone'));
  // no AP: no block option
  await bV.setVital(ava.id, 'apRemaining', 0);
  for (const A of [R, S, V]) await kick(A);
  await startAtk(12);
  ok(!/Waiting/.test(S.$('atkOut').textContent) && /HIT|MISS/.test(S.$('atkOut').textContent), P('target with no AP: resolved straight away: ' + S.$('atkOut').textContent));
  ok(V.$('defendModal').hidden, P('and no prompt'));
  for (const A of [S, V]) ok(A.w.__errors.length === 0, P('no errors: ' + A.w.__errors.join('|')));
  ok(S.w.__errors.length === 0, P('no errors'));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
