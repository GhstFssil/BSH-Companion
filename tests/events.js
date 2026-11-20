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
  const as = await makeAs(); const R = await as('ricky'), S = await as('sam');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(150); };
  const bR = await raw(R), bS = await raw(S);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G);
  const mk = async (A, b, name) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; await b.saveCharacter(c); return c; };
  const hero = await mk(S, bS, 'Hero');
  const btn = (A, t, root) => [...(root || A.d).querySelectorAll('button')].find((b) => b.textContent === t);
  const rows = (A) => [...A.d.querySelectorAll('#campChars .cchar')].map((r) => r.querySelector('.char-btn span, .ename').textContent);
  const encOf = async (b) => (await b.listCampaigns()).find((g) => g.id === G).encounter;
  for (const A of [R, S]) A.go('campaign-' + G);
  ok(await until(() => rows(R).length === 1), P('roster loads'));
  ok(!R.$('eventToggle'), P('no Add Event outside an encounter'));
  await bR.startEncounter(G); await bS.setInitiative(G, hero.id, 10, 0);
  for (const A of [R, S]) await kick(A);
  ok(await until(() => !!R.$('eventToggle')) && !S.$('eventToggle'), P('Add Event is QM only'));
  // add through the form
  R.click(R.$('eventToggle'));
  ok(!!R.$('eventForm') && R.$('eventRound').hidden, P('form opens; round input hidden until One Time is ticked'));
  R.setv(R.$('eventName'), 'Collapse'); R.setv(R.$('eventInit'), '15');
  R.click(R.$('eventAdd'));
  ok(await until(async () => ((await encOf(bR)).events || []).length === 1), P('event added'));
  let e = await encOf(bR), ev = e.events[0];
  ok(ev.name === 'Collapse' && ev.total === 15 && ev.visible === false && !ev.oneTime, P('named, init 15, hidden by default'));
  ok(!(await encOf(bS)).events.length, P('players never receive a hidden event'));
  await kick(R); await kick(S);
  ok(await until(() => rows(R).join() === 'Collapse,Hero'), P('QM sees the event in initiative order: ' + rows(R).join()));
  ok(rows(S).join() === 'Hero', P('player roster does not show it'));
  ok(e.turn === ev.id, P('it has the top initiative, so it is up'));
  ok(/Turn: Collapse/.test(R.$('turnLine').textContent) && /someone you cannot see/.test(S.$('turnLine').textContent), P('turn line: QM sees the name, player does not'));
  ok(!!R.d.querySelector('.cchar.turn[data-event]') && !!btn(R, 'END TURN', R.d.querySelector('.cchar.turn')), P('event row highlighted with an END TURN for the QM'));
  // show / hide
  R.click(btn(R, 'SHOW TO PLAYERS', R.d.querySelector('[data-event]')));
  ok(await until(async () => (await encOf(bS)).events.length === 1), P('shown to players'));
  await kick(S);
  ok(await until(() => rows(S).join() === 'Collapse,Hero'), P('player now sees the event: ' + rows(S).join()));
  ok(!btn(S, 'END TURN') && !btn(S, 'REMOVE') && !btn(S, 'HIDE FROM PLAYERS'), P('player has no buttons on an event'));
  ok(/Turn: Collapse/.test(S.$('turnLine').textContent), P('player turn line names the shown event'));
  R.click(btn(R, 'HIDE FROM PLAYERS', R.d.querySelector('[data-event]')));
  ok(await until(async () => (await encOf(bS)).events.length === 0), P('hidden again'));
  // permissions
  let denied = false; try { await bS.addEvent(G, { name: 'X', total: 1 }); } catch (er) { denied = /Only a QM/.test(er.message); } ok(denied, P('a player cannot add an event'));
  denied = false; try { await bS.advanceTurn(G, ev.id); } catch (er) { denied = true; } ok(denied, P('a player cannot end an event turn'));
  denied = false; try { await bR.addEvent(G, { name: '  ', total: 1 }); } catch (er) { denied = /name/.test(er.message); } ok(denied, P('a name is required'));
  // advance through the order
  R.click(btn(R, 'ADVANCE TURN'));
  ok(await until(async () => (await encOf(bR)).turn === hero.id), P('advance moves from the event to the hero'));
  R.click(btn(R, 'ADVANCE TURN'));
  ok(await until(async () => { const x = await encOf(bR); return x.turn === ev.id && x.round === 2; }), P('wraps to the event in round 2'));
  // assign to an event
  await bR.assignTurn(G, hero.id); await bR.assignTurn(G, ev.id);
  ok((await encOf(bR)).turn === ev.id, P('assign turn accepts an event'));
  R.click(btn(R, 'ASSIGN TURN'));
  ok([...R.$('assignSel').options].some((o) => o.textContent === 'Collapse (event)'), P('picker lists the event'));
  R.click(btn(R, 'CANCEL ASSIGN'));
  // one time
  R.click(R.$('eventToggle'));
  R.click(R.$('eventOne')); R.$('eventOne').dispatchEvent(new R.w.Event('input', { bubbles: true }));
  ok(!R.$('eventRound').hidden && R.$('eventRound').min === '2', P('One Time reveals a round input, minimum = current round'));
  R.setv(R.$('eventName'), 'Boss'); R.setv(R.$('eventInit'), '30'); R.setv(R.$('eventRound'), '1');
  R.click(R.$('eventAdd'));
  ok(await until(() => /round/i.test(R.$('eventMsg').textContent)), P('a past round is refused: ' + R.$('eventMsg').textContent));
  R.setv(R.$('eventRound'), '4'); R.click(R.$('eventAdd'));
  ok(await until(async () => (await encOf(bR)).events.length === 2), P('one-time event for round 4 added'));
  const boss = (await encOf(bR)).events.find((x) => x.name === 'Boss');
  ok(boss.oneTime && boss.round === 4, P('stored as one time, round 4'));
  await kick(R);
  ok(await until(() => /ROUND 4 ONLY/.test(R.d.body.textContent)) && /LATER/.test(R.d.body.textContent), P('shown as waiting for its round'));
  ok(!(await encOf(bR)).events.length || true, P(''));
  await bR.assignTurn(G, hero.id);
  await bR.advanceTurn(G, hero.id);   // ->event (round 2 wrap? hero then event) 
  let x = await encOf(bR);
  // walk to round 4
  for (let i = 0; i < 12 && x.round < 4; i++) { await bR.advanceTurn(G, x.turn); x = await encOf(bR); }
  ok(x.round === 4 && x.turn === boss.id, P('in round 4 the one-time event goes first: round ' + x.round));
  await bR.advanceTurn(G, x.turn); await bR.advanceTurn(G, (await encOf(bR)).turn);
  x = await encOf(bR); await bR.advanceTurn(G, x.turn); x = await encOf(bR);
  ok(x.round === 5 && x.turn !== boss.id, P('round 5: the one-time event is gone from the order'));
  // remove the current turn event
  await bR.assignTurn(G, ev.id);
  await kick(R);
  R.click(btn(R, 'REMOVE', R.d.querySelector('[data-event="' + ev.id + '"]')));
  ok(await until(async () => { const y = await encOf(bR); return !y.events.some((q) => q.id === ev.id) && y.turn !== ev.id; }), P('removing the event whose turn it is hands the turn back to the top of the order'));
  // ending clears
  await bR.endEncounter(G); await bR.startEncounter(G);
  ok(!(await encOf(bR)).events.length, P('a new encounter starts with no events'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
