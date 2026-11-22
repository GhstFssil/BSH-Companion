const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam:   { name: 'Sam',   username: 'sam_2',   email: 'sam@example.com',   password: 'another pass1' },
  ava:   { name: 'Ava',   username: 'ava_3',   email: 'ava@example.com',   password: 'third pass12' }
};

async function scenario(label, makeAs) {
  console.log('--- ' + label);
  const as = await makeAs();
  const P = (m) => `[${label}] ${m}`;
  const R = await as('ricky'), S = await as('sam'), V = await as('ava');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const rejects = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(60); };   // same as the tab coming to the front: polls now
  const modal = (A) => A.$('encounterModal');
  const modalUp = (A) => !modal(A).hidden;
  const rowsOf = (A) => [...A.d.querySelectorAll('#encRows .enc-row')].map((r) => ({
    el: r, name: r.querySelector('.enc-name span').textContent, ib: +r.querySelector('.enc-name .tag').textContent.replace('IB ', ''),
    done: (r.querySelector('.enc-done') || {}).textContent || null, btns: [...r.querySelectorAll('button')].map((b) => b.textContent) }));
  const btn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  const crows = (A) => [...A.d.querySelectorAll('#campChars .cchar')].map((r) => ({
    el: r, name: r.querySelector('.char-btn span').textContent, tags: [...r.querySelectorAll('.tag')].map((t) => t.textContent),
    qm: !!r.querySelector('.enc-qm') }));
  const initOf = (A, name) => { const r = crows(A).find((x) => x.name === name); const t = r && r.tags.find((x) => /^INIT /.test(x)); return t ? +t.slice(5) : null; };
  const open = async (A, hash) => { A.go('home'); await wait(20); A.go(hash); await wait(80); };
  const mk = async (A, G, name, extra = {}) => {
    const b = await raw(A), c = A.w.BSH.blankCharacter();
    c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; Object.assign(c, extra);
    await b.saveCharacter(c); return c;
  };

  // ---- set-up: Ricky QM, Sam (2 characters) and Ava (1 character) players, one NPC ----
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit of Soup');
  await bS.joinCampaign(G); await bV.joinCampaign(G);
  const alpha = await mk(S, G, 'Alpha'), beta = await mk(S, G, 'Beta', { statAdj: [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0] }), gamma = await mk(V, G, 'Gamma');
  const npc = V.w.BSH.blankCharacter(); npc.id = R.w.crypto.randomUUID(); npc.info.name = 'Goblin';
  await bR.createNpc(G, npc);
  await open(R, 'campaign-' + G);
  const btnR = (t) => btn(R.$('screen-campaign'), t);
  ok(!!btnR('START ENCOUNTER') && R.$('encounterBox').querySelector('.enc-banner') === null, P('QM sees START ENCOUNTER, no banner yet'));
  await open(S, 'campaign-' + G);
  ok(!btn(S.$('screen-campaign'), 'START ENCOUNTER'), P('players do not see START ENCOUNTER'));
  S.go('home'); await wait(20);
  ok(!modalUp(S) && !modalUp(V), P('nobody is prompted before an encounter'));
  ok(await rejects(bS.startEncounter(G), /Only a QM/), P('API: a player cannot start an encounter'));
  ok(await rejects(bS.endEncounter(G), /Only a QM/), P('API: a player cannot end an encounter'));
  ok(await rejects(bS.setInitiative(G, alpha.id, 10, 0), /no active encounter/), P('API: no initiative without an encounter'));

  // ---- start ----
  R.click(btnR('START ENCOUNTER'));
  ok(await waitFor(() => R.$('encounterBox').querySelector('.enc-banner')), P('QM sees the ENCOUNTER banner right away'));
  ok(/AN ENCOUNTER IS ACTIVE/.test(R.$('encounterBox').textContent) && !!btnR('END ENCOUNTER'), P('banner has END ENCOUNTER for the QM'));
  ok(!btnR('START ENCOUNTER'), P('START is replaced while one is active'));
  ok(await rejects(bR.startEncounter(G), /already active/), P('API: cannot start a second encounter'));
  ok(!modalUp(R), P('QM with no characters is not prompted'));
  await kick(S); await kick(V);
  ok(await waitFor(() => modalUp(S)) && modalUp(V), P('players are prompted (without refreshing)'));
  ok(/An Encounter Has Begun!/.test(S.$('encTitle').textContent) && S.$('encCampaign').textContent === 'Pit of Soup', P('prompt says "An Encounter Has Begun!" and names the campaign'));
  const sr = rowsOf(S);
  ok(sr.map((r) => r.name).join() === 'Alpha,Beta', P('Sam gets one row per own character, nothing else: ' + sr.map((r) => r.name)));
  ok(sr[0].ib === -2 && sr[1].ib === 2, P('each row shows that character\'s IB (' + sr.map((r) => r.ib) + ')'));
  ok(sr[0].btns.join() === 'DIS,ADV,ROLL D20,SET ROLL' && !!sr[0].el.querySelector('input'), P('each row has DIS/ADV, ROLL D20, a die box and SET ROLL'));
  ok(rowsOf(V).map((r) => r.name).join() === 'Gamma', P('Ava only gets Gamma'));

  // ---- player rolls ----
  const inp = (row) => row.el.querySelector('input');
  S.setv(inp(sr[0]), '25'); S.click(btn(sr[0].el, 'SET ROLL')); await wait(80);
  ok(/between 1 and 20|1 to 20/.test(S.$('encMsg').textContent) && rowsOf(S)[0].done === null, P('an out-of-range die is refused'));
  S.setv(inp(sr[0]), 'x'); S.click(btn(sr[0].el, 'SET ROLL')); await wait(60);
  ok(rowsOf(S)[0].done === null, P('junk is refused'));
  S.setv(inp(rowsOf(S)[0]), '15'); S.click(btn(rowsOf(S)[0].el, 'SET ROLL'));
  ok(await waitFor(() => rowsOf(S)[0].done), P('typing a physical roll sets it'));
  ok(/Initiative 13 .*d20 15 - IB 2 = 13/.test(rowsOf(S)[0].done), P('15 with IB -2 = 13, breakdown shown: ' + rowsOf(S)[0].done));
  S.click(btn(rowsOf(S)[1].el, 'ROLL D20'));
  ok(await waitFor(() => rowsOf(S)[1].done), P('ROLL D20 rolls for Beta'));
  const m = /Initiative (-?[\d.]+) .*d20 (\d+) \+ IB 2( [+-] 5)? = (-?[\d.]+)/.exec(rowsOf(S)[1].done);
  ok(!!m, P('virtual roll text: ' + rowsOf(S)[1].done));
  const die = +m[2], exp = die + 2 + (die === 1 ? -5 : die === 20 ? 5 : 0);
  ok(+m[1] === exp && +m[4] === exp && (die === 1 || die === 20 ? !!m[3] : !m[3]), P(`virtual d20 ${die} + 2 (+/-5 on 1/20) = ${exp}`));
  ok(!rowsOf(S)[0].el.querySelector('button') && !rowsOf(S)[1].el.querySelector('button'), P('rolled characters cannot be rolled again from the prompt'));
  ok(await rejects(bS.setInitiative(G, alpha.id, 20, -2), /already set/), P('API: a player cannot re-roll'));
  ok(await rejects(bS.setInitiative(G, gamma.id, 10, 0), /your own/), P('API: a player cannot roll for someone else\'s character'));
  ok(await rejects(bS.setInitiative(G, npc.id, 10, 0), /Only a QM/), P('API: a player cannot roll for an NPC'));
  ok(await rejects(bV.setInitiative(G, gamma.id, 21, 0), /between 1 and 20/) && await rejects(bV.setInitiative(G, gamma.id, 0, 0), /between 1 and 20/), P('API: die must be 1-20'));

  // ---- exit ----
  S.click(S.$('encExit'));
  ok(!modalUp(S), P('EXIT closes the prompt'));
  await kick(S); await wait(100);
  ok(!modalUp(S), P('and it does not pop up again for the same encounter'));
  await open(S, 'campaign-' + G);
  ok(/All of your characters have rolled/.test(S.$('encounterBox').textContent) && !!btn(S.$('encounterBox'), 'VIEW INITIATIVE'), P('campaign page banner: all rolled, VIEW INITIATIVE'));
  ok(await waitFor(() => initOf(S, 'Alpha') === 13 && initOf(S, 'Beta') === exp), P('initiative shows next to each character card'));
  ok(crows(S).find((x) => x.name === 'Gamma').tags.includes('WAITING'), P('a character that has not rolled shows WAITING'));
  ok(crows(S).map((x) => x.name).slice(-1)[0] === 'Gamma' || crows(S).map((x) => x.name).indexOf('Gamma') >= 2, P('characters still to roll sort after those that have'));
  const order = crows(S).filter((x) => x.tags.some((t) => /^INIT/.test(t))).map((x) => +x.tags.find((t) => /^INIT/.test(t)).slice(5));
  ok(order.join() === order.slice().sort((a, b) => b - a).join(), P('rolled characters are listed highest initiative first: ' + order));

  // ---- QM steps in after 10 seconds ----
  await open(R, 'campaign-' + G);
  ok(await waitFor(() => initOf(R, 'Alpha') === 13), P('the QM sees the players\' initiatives too'));
  ok(crows(R).find((x) => x.name === 'Goblin').qm, P('QM can roll for an NPC straight away'));
  const early = crows(R).find((x) => x.name === 'Gamma');
  const age = Date.now() - (await (await raw(R)).listCampaigns()).find((g) => g.id === G).encounter.startedAt;
  if (age < 10000) ok(!early.qm, P('no QM controls for a player before 10 seconds'));
  await wait(Math.max(0, 10300 - age));
  ok(await waitFor(() => crows(R).find((x) => x.name === 'Gamma').qm, 3000), P('after 10 seconds the QM gets ROLL FOR THEM / SET ROLL for the player who has not answered'));
  ok(!crows(R).find((x) => x.name === 'Alpha').qm, P('...but not for a player who already rolled'));
  const gr = () => crows(R).find((x) => x.name === 'Gamma').el;
  R.setv(gr().querySelector('input'), '20'); R.click(btn(gr(), 'SET ROLL'));
  ok(await waitFor(() => initOf(R, 'Gamma') !== null), P('QM enters 20 for Gamma'));
  ok(initOf(R, 'Gamma') === 20 - 2 + 5, P('natural 20 adds 5: 20 - 2 + 5 = ' + initOf(R, 'Gamma')));
  ok(/set by the QM/.test(gr().textContent), P('marked as set by the QM'));
  await kick(V);
  ok(await waitFor(() => /Initiative 23/.test(rowsOf(V)[0].done || ''), 3000), P('Ava\'s open prompt updates to show the QM\'s roll: ' + (rowsOf(V)[0].done || '')) );
  const gob = () => crows(R).find((x) => x.name === 'Goblin').el;
  R.click(btn(gob(), 'ROLL FOR THEM'));
  ok(await waitFor(() => initOf(R, 'Goblin') !== null), P('QM rolls for the NPC'));
  await bR.setInitiative(G, alpha.id, 1, -2); ok(true, P('API: the QM may change someone\'s initiative'));
  await kick(R);
  ok(await waitFor(() => initOf(R, 'Alpha') === 1 - 2 - 5), P('natural 1 subtracts 5: 1 - 2 - 5 = ' + initOf(R, 'Alpha')));

  // ---- end ----
  R.click(btnR('END ENCOUNTER')); R.click([...R.d.querySelectorAll('#encounterBox button')].find((b) => /TAP AGAIN/.test(b.textContent)));
  ok(await waitFor(() => !R.$('encounterBox').querySelector('.enc-banner') && !!btnR('START ENCOUNTER')), P('QM ends it: banner gone, START ENCOUNTER back'));
  ok(crows(R).every((x) => !x.tags.some((t) => /INIT|WAITING/.test(t))), P('initiative tags are cleared'));
  await kick(V);
  ok(await waitFor(() => !modalUp(V)), P('an open prompt closes when the encounter ends'));
  ok(await rejects(bV.setInitiative(G, gamma.id, 10, 0), /no active encounter/), P('API: no rolling after it ends'));

  // ---- a second encounter notifies again, even for players who exited the first ----
  R.click(btnR('START ENCOUNTER')); await waitFor(() => R.$('encounterBox').querySelector('.enc-banner'));
  await kick(S);
  ok(await waitFor(() => modalUp(S)) && rowsOf(S).every((r) => r.done === null), P('a new encounter prompts again with fresh rolls'));
  // leaving the campaign / logging out
  S.click(S.$('logoutBtn')); await wait(120);
  ok(!modalUp(S), P('logging out closes the prompt'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}

(async () => {
  await scenario('local', async () => {
    const shared = {}, wins = {};
    for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); wins[n] = A; }
    return async (n) => wins[n];
  });
  const m = await createMock();
  await scenario('supabase', async () => {
    const wins = {};
    for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); wins[n] = A; }
    return async (n) => wins[n];
  });
  m.close(); done();
})();
