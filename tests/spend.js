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
  const mk = async (A, b, name, created) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; c.created = created; await b.saveCharacter(c); return c; };
  const sam = await mk(S, bS, 'Samwise', 2), ava = await mk(V, bV, 'Avalon', 1);
  for (const A of [R, S, V]) A.go('campaign-' + G);
  const row = (A, n) => [...A.d.querySelectorAll('#campChars .cchar')].find((r) => r.querySelector('.char-btn span').textContent === n);
  const btn = (root, t) => [...root.querySelectorAll('button')].find((b) => b.textContent === t);
  await until(() => row(S, 'Samwise') && row(S, 'Avalon'));
  const openActions = (A, n) => A.click(btn(row(A, n), 'ACTIONS'));
  const costs = (A) => [...A.$('actionsList').querySelectorAll('.acost')];
  const stored = async (b, id) => (await b.listCharacters()).find((c) => c.id === id) || (await b.listCampaignCharacters(G)).find((r) => r.ch.id === id).ch;
  const total = (c) => S.w.BSH.compute(c).stat;

  // ---- no encounter: no boxes, costs are plain ----
  openActions(S, 'Samwise');
  ok(!S.$('actionAp') && costs(S).every((e) => e.tagName === 'SPAN'), P('outside an encounter: no AP/SP boxes and the cost boxes are not buttons'));
  S.click(S.$('actionsClose'));

  // ---- encounter ----
  await bR.startEncounter(G); await bS.setInitiative(G, sam.id, 15, 0); await bV.setInitiative(G, ava.id, 5, 0);
  for (const A of [R, S, V]) await kick(A);
  const AP = total(sam)[4], SP = total(sam)[1];
  await until(() => row(S, 'Samwise') && btn(row(S, 'Samwise'), 'ACTIONS'));
  openActions(S, 'Samwise');
  ok(!!S.$('actionAp') && S.$('actionAp').textContent === String(AP) && S.$('actionSp').textContent === String(SP), P('AP / SP Remaining boxes at the top: ' + S.$('actionAp').textContent + ' / ' + S.$('actionSp').textContent));
  ok(costs(S).slice(0, 7).every((e) => e.tagName === 'BUTTON'), P('cost boxes are buttons for the owner'));
  S.click(costs(S)[0]);   // Movement 3 AP
  ok(await until(() => /Action Performed: Movement \(-3 AP\)/.test(S.$('actionFeedback').textContent)), P('feedback: ' + S.$('actionFeedback').textContent));
  ok(S.$('actionAp').textContent === String(AP - 3), P('AP box drops by 3'));
  ok(await until(async () => (await stored(bS, sam.id)).vitals.apRemaining === AP - 3), P('saved to the sheet'));
  S.click(costs(S)[0]); await wait(150); S.click(costs(S)[0]); await wait(150);
  ok(await until(() => /Not enough AP/.test(S.$('actionFeedback').textContent)), P('cannot spend AP you do not have: ' + S.$('actionFeedback').textContent));
  S.click(S.$('actionsClose'));
  // another player: boxes shown but not clickable
  openActions(V, 'Samwise'); ok(!!V.$('actionAp') && costs(V).every((e) => e.tagName === 'SPAN'), P("another player's character: values shown, costs not clickable")); V.click(V.$('actionsClose'));
  // QM can spend for anyone
  openActions(R, 'Avalon'); ok(costs(R)[2].tagName === 'BUTTON', P('QM gets clickable costs on every character'));
  R.click(costs(R)[2]);   // Shift 1 AP
  ok(await until(async () => (await stored(bR, ava.id)).vitals.apRemaining === total(ava)[4] - 1), P("QM spent 1 AP on Ava's character"));
  R.click(R.$('actionsClose'));

  // ---- turn start: AP back to full, SP + 1 + floor(max/10) ----
  await bS.setVital(sam.id, 'spRemaining', 2); await bS.setVital(sam.id, 'apRemaining', 3);
  await kick(S);
  const SPmax = total(sam)[1], gain = 1 + Math.floor(SPmax / 10);
  const before = await stored(bS, sam.id);
  ok(before.vitals.apRemaining === AP - 3 || before.vitals.apRemaining < AP, P('Samwise is down on AP before ending the turn'));
  await bS.advanceTurn(G, sam.id);   // Sam's turn ends; Ava is up
  await kick(V); await kick(R);
  ok(await until(async () => (await stored(bV, ava.id)).vitals.apRemaining == null), P("Ava's turn starts: AP back to full"));
  const av = await stored(bV, ava.id);
  ok(typeof av.vitals.turnMark === 'string', P('turn marker recorded'));
  ok(await until(() => /Your turn, Avalon/.test(V.$('toast').textContent)), P('Ava gets a note: ' + V.$('toast').textContent));
  await bV.advanceTurn(G, ava.id);   // round 2, Sam up again
  await kick(S); await kick(R);
  ok(await until(async () => { const c = await stored(bS, sam.id); return c.vitals.apRemaining == null && c.vitals.spRemaining === Math.min(SPmax, 2 + gain); }), P('Samwise: AP full, SP 2 + ' + gain + ' = ' + Math.min(SPmax, 2 + gain)));
  // no SP when AP was 0 going in
  await bS.setVital(sam.id, 'apRemaining', 0); await bS.setVital(sam.id, 'spRemaining', 3);
  await bS.advanceTurn(G, sam.id); await bV.advanceTurn(G, ava.id); await kick(S); await kick(R);
  ok(await until(async () => { const c = await stored(bS, sam.id); return c.vitals.apRemaining == null && c.vitals.spRemaining === 3; }), P('AP was 0 going into the turn: AP restored, no SP recovered'));
  // repeated polling does not stack
  await kick(S); await kick(S); await kick(R); await wait(200);
  ok((await stored(bS, sam.id)).vitals.spRemaining === 3, P('only once per turn change'));
  // end of encounter: boxes go away
  await bR.endEncounter(G); await kick(R); await kick(S);
  openActions(S, 'Samwise'); ok(!S.$('actionAp'), P('no boxes once the encounter is over'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
