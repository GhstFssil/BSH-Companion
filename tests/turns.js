const { boot, wait, waitFor, api, checker } = require('./h.js');
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
  const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(150); };
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G); await bV.joinCampaign(G);
  const mk = async (A, b, name, created) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; c.created = created; await b.saveCharacter(c); return c; };
  const old = await mk(S, bS, 'Older', 1000), mid = await mk(V, bV, 'Middle', 2000), neu = await mk(S, bS, 'Newest', 3000);
  const npc = R.w.BSH.blankCharacter(); npc.id = R.w.crypto.randomUUID(); npc.info.name = 'Goblin'; npc.created = 9000; await bR.createNpc(G, npc);
  await bR.setNpcVisible(npc.id, true);
  const names = (A) => [...A.d.querySelectorAll('#campChars .cchar .char-btn span:first-child')].map((x) => x.textContent);
  const btn = (A, t, root) => [...(root || A.d).querySelectorAll('button')].find((b) => b.textContent === t);
  for (const A of [R, S, V]) { A.go('campaign-' + G); }
  ok(await until(() => names(R).length === 4), P('roster loads'));
  ok(names(R).join() === 'Newest,Middle,Older,Goblin', P('no encounter: PCs first, newest first, then NPCs: ' + names(R).join()));
  ok(!R.d.querySelector('.cchar.turn') && !R.$('roundTracker'), P('no arrow or round outside an encounter'));

  // ---- encounter with a tie ----
  await bR.startEncounter(G);
  await bS.setInitiative(G, old.id, 10, 0); await bV.setInitiative(G, mid.id, 10, 0); await bS.setInitiative(G, neu.id, 18, 0); await bR.setInitiative(G, npc.id, 3, 0);
  for (const A of [R, S, V]) await kick(A);
  const enc = (await bR.listCampaigns()).find((g) => g.id === G).encounter;
  const tieOrder = [old.id, mid.id].sort((a, b) => enc.initiatives[b].tb - enc.initiatives[a].tb);
  const expect = [neu.id, ...tieOrder, npc.id], nameOf = { [old.id]: 'Older', [mid.id]: 'Middle', [neu.id]: 'Newest', [npc.id]: 'Goblin' };
  ok(await until(() => names(R).join() === expect.map((i) => nameOf[i]).join()), P('roster in initiative order; the 10 / 10 tie is settled by the random tie-break: ' + names(R).join()));
  ok(names(S).join() === names(R).join() && names(V).join() === names(R).join(), P('every device shows the same order'));
  ok(enc.round === 1 && enc.turn === neu.id, P('round 1, first in initiative is up'));
  const turnRows = (A) => [...A.d.querySelectorAll('#campChars .cchar.turn')];
  ok(await until(() => turnRows(S).length === 1), P('one highlighted box'));
  const top = turnRows(S)[0];
  ok(top.querySelector('.turnmark').textContent === '>' && top.querySelector('.char-btn span').textContent === 'Newest', P('the > arrow and highlight are on the first in initiative'));
  ok(R.$('roundTracker').textContent === 'ROUND 1' && /Turn: Newest/.test(R.$('turnLine').textContent), P('round tracker + turn line: ' + R.$('roundTracker').textContent));
  ok(!!btn(S, 'END TURN', top) && !btn(V, 'END TURN'), P('End Turn shows only for the player whose turn it is'));
  ok(!btn(S, 'ADVANCE TURN') && !btn(S, 'ASSIGN TURN') && !!btn(R, 'ADVANCE TURN') && !!btn(R, 'ASSIGN TURN'), P('Advance / Assign Turn are QM only'));
  // player ends turn
  S.click(btn(S, 'END TURN'));
  ok(await until(async () => (await bR.listCampaigns()).find((g) => g.id === G).encounter.turn === tieOrder[0]), P('End Turn passes the turn to the next in line'));
  await kick(R); await kick(V);
  ok(await until(() => turnRows(R).length === 1 && turnRows(R)[0].querySelector('.char-btn span').textContent === nameOf[tieOrder[0]]), P('highlight moved for everyone'));
  ok(!btn(S, 'END TURN') || tieOrder[0] === old.id, P('Newest\'s owner loses the button unless it is their other character'));
  // QM advances for the player
  R.click(btn(R, 'ADVANCE TURN'));
  ok(await until(async () => (await bR.listCampaigns()).find((g) => g.id === G).encounter.turn === tieOrder[1]), P('QM Advance Turn ends the current turn'));
  R.click(btn(R, 'ADVANCE TURN'));
  ok(await until(async () => (await bR.listCampaigns()).find((g) => g.id === G).encounter.turn === npc.id), P('...and again (NPC is up)'));
  R.click(btn(R, 'ADVANCE TURN'));
  ok(await until(async () => { const e = (await bR.listCampaigns()).find((g) => g.id === G).encounter; return e.turn === neu.id && e.round === 2; }), P('last in line back to first: round 2'));
  ok(await until(() => R.$('roundTracker').textContent === 'ROUND 2'), P('round tracker shows ROUND 2'));
  // assign
  R.click(btn(R, 'ASSIGN TURN'));
  const sel = R.$('assignSel'); ok(!!sel && sel.options.length === 4, P('Assign Turn opens a picker of the characters in order'));
  R.setv(sel, npc.id); sel.dispatchEvent(new R.w.Event('change', { bubbles: true }));
  R.click(btn(R, 'MAKE IT THEIR TURN'));
  ok(await until(async () => { const e = (await bR.listCampaigns()).find((g) => g.id === G).encounter; return e.turn === npc.id && e.round === 2; }), P('Assign Turn moves the turn without changing the round'));
  ok(!R.$('assignSel'), P('picker closes'));
  R.click(btn(R, 'ASSIGN TURN')); R.setv(R.$('assignSel'), neu.id); R.$('assignSel').dispatchEvent(new R.w.Event('change', { bubbles: true })); R.click(btn(R, 'MAKE IT THEIR TURN'));
  ok(await until(async () => (await bR.listCampaigns()).find((g) => g.id === G).encounter.turn === neu.id), P('assigning backwards works'));
  ok((await bR.listCampaigns()).find((g) => g.id === G).encounter.round === 2, P('round still 2 (assign never adds a round)'));
  // players can't
  let denied = false; try { await bS.assignTurn(G, old.id); } catch (e) { denied = /Only a QM/.test(e.message); } ok(denied, P('a player cannot assign a turn'));
  denied = false; try { await bV.advanceTurn(G, neu.id); } catch (e) { denied = /not your turn/.test(e.message); } ok(denied, P("a player cannot end someone else's turn"));
  // end encounter clears it
  await bR.endEncounter(G); await kick(R);
  ok(await until(() => !R.$('roundTracker') && !R.d.querySelector('.cchar.turn')), P('ending the encounter removes the arrow and tracker'));
  ok(await until(() => names(R).join() === 'Newest,Middle,Older,Goblin'), P('and the roster returns to PCs first, newest first'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
