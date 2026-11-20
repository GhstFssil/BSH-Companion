const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam:   { name: 'Sam',   username: 'sam_2',   email: 'sam@example.com',   password: 'another pass1' }
};
async function scenario(label, makeAs) {
  console.log('--- ' + label);
  const as = await makeAs(), P = (m) => `[${label}] ${m}`;
  const R = await as('ricky'), S = await as('sam');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const rejects = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(150); };
  const btn = (root, t) => [...root.querySelectorAll('button')].find((x) => x.textContent === t);
  const rows = (A) => [...A.d.querySelectorAll('#campChars .cchar')].map((r) => ({ el: r, name: r.querySelector('.char-btn span').textContent, main: r.querySelector('.char-btn'),
    tags: [...r.querySelectorAll('.tag')].map((t) => t.textContent), sub: r.querySelector('.char-btn .sub').textContent }));
  const goto = async (A, G) => { A.go('home'); await wait(30); A.go('campaign-' + G); await wait(250); };
  const bR = await raw(R), bS = await raw(S);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G);
  const npc = R.w.BSH.blankCharacter(); npc.id = R.w.crypto.randomUUID(); npc.info.name = 'Lich'; npc.items = [{ name: 'Secret', qty: 1 }];
  await bR.createNpc(G, npc);
  await goto(R, G); await goto(S, G);
  const R1 = () => rows(R).find((x) => x.name === 'Lich'), S1 = () => rows(S).find((x) => x.name === 'Lich');
  ok(!S1(), P('a hidden NPC is not on the players\' roster'));
  ok(!!btn(R1().el, 'HIDE SHEET') && !!btn(R1().el, 'SHOW TO PLAYERS'), P('QM sees SHOW TO PLAYERS and HIDE SHEET'));
  R.click(btn(R1().el, 'SHOW TO PLAYERS')); await wait(200); await goto(S, G);
  ok(!!S1() && !S1().main.disabled && !S1().tags.includes('SHEET HIDDEN'), P('shown NPC: players can open the sheet (as before)'));
  R.click(btn(R1().el, 'HIDE SHEET')); await wait(250);
  ok(R1().tags.includes('SHEET HIDDEN') && !!btn(R1().el, 'SHOW SHEET'), P('QM sees SHEET HIDDEN and SHOW SHEET'));
  ok(!R.$('screen-campaign').hidden && !R1().main.disabled, P('the QM can still open it'));
  await goto(S, G);
  ok(!!S1() && S1().main.disabled && S1().tags.includes('SHEET HIDDEN') && S1().tags.includes('NPC · SHOWN'), P('player: name on the roster, button disabled, SHEET HIDDEN tag'));
  ok(!/HP|species/.test(S1().sub) && /NPC of ricky_1/.test(S1().sub), P('player sees no stats on the roster line: ' + S1().sub));
  ok(!btn(S1().el, 'SHOW SHEET') && !btn(S1().el, 'HIDE SHEET'), P('players have no sheet buttons'));
  S.click(S1().main); await wait(100);
  ok(S.vis().join() === 'campaign', P('clicking it does nothing'));
  S.go('character-' + npc.id); await wait(150);
  ok(S.vis().join() !== 'sheet', P('typing the sheet address does not open it: ' + S.vis()));
  const rowsS = await bS.listCampaignCharacters(G); const stub = rowsS.find((r) => r.ch.id === npc.id);
  ok(!!stub && !JSON.stringify(stub.ch).includes('Secret') && Object.keys(stub.ch.info).join() === 'name', P('the data given to the player has only the name'));
  ok(await rejects(bS.setNpcSheetHidden(npc.id, false), /Only a QM/), P('API: a player cannot change it'));
  R.click(btn(R1().el, 'SHOW SHEET')); await wait(250); await goto(S, G);
  ok(!S1().main.disabled && !S1().tags.includes('SHEET HIDDEN'), P('SHOW SHEET gives the sheet back'));
  S.click(S1().main); await wait(150);
  ok(S.vis().join() === 'sheet', P('and players can open it again'));
  // QM hides the sheet, then hides the NPC entirely, then shows again: flags are independent
  R.click(btn(R1().el, 'HIDE SHEET')); await wait(200);
  R.click(btn(R1().el, 'HIDE FROM PLAYERS')); await wait(200); await goto(S, G);
  ok(!S1(), P('NPC hidden from the roster: gone, whatever the sheet setting'));
  R.click(btn(R1().el, 'SHOW TO PLAYERS')); await wait(200); await goto(S, G);
  ok(!!S1() && S1().main.disabled, P('shown again: the sheet is still hidden (independent settings)'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
