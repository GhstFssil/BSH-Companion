// Release 5: QM tools column, QM edits any character's current values, QM ends an NPC's turn, Undo Action (incl. a finished attack),
// roll results in a highlighted box (local and Supabase-mock backends)
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
  const as = await makeAs(), P = (m) => `[${label}] ${m}`;
  const R = await as('ricky'), S = await as('sam'), V = await as('ava');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Hall'); await bS.joinCampaign(G); await bV.joinCampaign(G);
  const mk = (A, n) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = n; c.campaignId = G; return c; };
  const hero = mk(S, 'Hero'); hero.customActions = [{ name: 'Taunt', cost: '1 AP', desc: 'Draw attention.' }]; await bS.saveCharacter(hero);
  const foe = mk(V, 'Foe'); await bV.saveCharacter(foe);
  const orc = mk(R, 'Orc'); orc.isNpc = true; await bR.createNpc(G, orc); await bR.setNpcVisible(orc.id, true);
  const B = R.w.BSH, hpOf = async (b, id) => B.compute((await b.listCampaignCharacters(G)).find((r) => r.ch.id === id).ch).hpRemaining;
  const rowOf = (A, n) => [...A.d.querySelectorAll('#campChars .cchar')].find((r) => (r.querySelector('.char-btn span') || {}).textContent === n);
  const btn = (el, re) => el && [...el.querySelectorAll('button')].find((b) => re.test(b.textContent));
  const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(40); } return false; };
  const open = async (A) => { A.go('home'); await wait(30); A.go('campaign-' + G); await wait(250); };

  // QM column
  await open(R); await open(S);
  ok(R.$('campCols').classList.contains('qm') && !R.$('qmColHead').hidden && R.$('campQmCol').contains(R.$('npcActions')), P('the QM gets the QM tools column'));
  ok(!S.$('campCols').classList.contains('qm') && S.$('qmColHead').hidden, P('a player does not'));

  // the QM changes a player's character's values
  const hp0 = await hpOf(bR, foe.id);
  R.setv(R.d.querySelector('[data-vit="' + foe.id + ':HP"]'), String(hp0 - 4)); R.d.querySelector('[data-vit="' + foe.id + ':HP"]').dispatchEvent(new R.w.Event('change'));
  ok(await until(async () => (await hpOf(bV, foe.id)) === hp0 - 4, 4000), P("the QM sets a player's HP from the roster (the player sees it)"));
  R.setv(R.d.querySelector('[data-vit="' + foe.id + ':DH"]'), '3'); R.click(btn(rowOf(R, 'Foe'), /^ACCEPT$/));
  ok(await until(async () => (await hpOf(bV, foe.id)) === hp0 - 1, 4000), P("the QM heals a player's character with DMG/HEAL"));
  R.setv(R.d.querySelector('[data-vit="' + foe.id + ':EP"]'), '2'); R.d.querySelector('[data-vit="' + foe.id + ':EP"]').dispatchEvent(new R.w.Event('change'));
  ok(await until(async () => (await bV.listCharacters()).find((c) => c.id === foe.id).vitals.epRemaining === 2, 4000), P("the QM sets a player's EP"));
  await open(S);
  ok(!S.d.querySelector('[data-vit="' + foe.id + ':HP"]'), P("a player still cannot change someone else's values"));

  // encounter: Hero, Orc, Foe
  await bR.startEncounter(G);
  await bS.setInitiative(G, hero.id, 20, 0); await bR.setInitiative(G, orc.id, 15, 0); await bV.setInitiative(G, foe.id, 5, 0);
  await open(S); await wait(300);

  // Undo a spend
  S.click(btn(rowOf(S, 'Hero'), /^ACTIONS$/)); await wait(100);
  const apBefore = S.$('actionAp').textContent;
  S.click(S.d.querySelector('#actionsList [aria-label="Perform Taunt for 1 AP"]')); await wait(250);
  ok(Number(S.$('actionAp').textContent) === Number(apBefore) - 1, P('Taunt spends 1 AP'));
  S.click(S.$('actionsClose')); await open(S); await wait(200);
  let ub = btn(rowOf(S, 'Hero'), /^UNDO: TAUNT$/);
  ok(!!ub, P('the roster offers UNDO: TAUNT'));
  ok(!btn(rowOf(S, 'Foe'), /^UNDO/), P("no UNDO on someone else's character"));
  // Undo a finished attack (made the way the app makes one: snapshot, AP, damage, last attack)
  const foeHp = await hpOf(bS, foe.id);
  await bS.pushUndo(G, hero.id, 'Sword on Foe', [foe.id]);
  await bS.setVital(hero.id, 'apRemaining', 0); await bS.dealDamage(hero.id, foe.id, 5);
  ok((await hpOf(bS, foe.id)) === foeHp - 5, P('the attack hurt Foe'));
  await open(S); await wait(200);
  ub = btn(rowOf(S, 'Hero'), /^UNDO: SWORD ON FOE$/);
  ok(!!ub, P('the newest action is offered first'));
  S.click(ub); await wait(10); S.click(ub);
  ok(await until(async () => (await hpOf(bS, foe.id)) === foeHp, 5000), P("UNDO puts back the target's HP (a finished attack)"));
  ok(await waitFor(() => /Undone: Sword on Foe/.test(S.$('campaignMsg').textContent), 3000), P('and says what was undone'));
  const heroNow = (await bS.listCharacters()).find((c) => c.id === hero.id);
  ok(Number(heroNow.vitals.apRemaining) === Number(apBefore) - 1, P("and the attacker's AP (" + heroNow.vitals.apRemaining + ')'));
  ok(await waitFor(() => !!btn(rowOf(S, 'Hero'), /^UNDO: TAUNT$/), 4000), P('the earlier action can still be undone'));
  ub = btn(rowOf(S, 'Hero'), /^UNDO: TAUNT$/); S.click(ub); await wait(10); ok(ub.textContent === 'TAP AGAIN TO UNDO', P('UNDO asks for a second tap')); S.click(ub);
  ok(await until(async () => (await bS.listCharacters()).find((c) => c.id === hero.id).vitals.apRemaining == null, 5000), P('undoing Taunt gives the AP back'));
  ok(await waitFor(() => rowOf(S, 'Hero') && !btn(rowOf(S, 'Hero'), /^UNDO/), 4000), P('nothing left to undo'));
  // only the last two; END TURN clears them
  for (const l of ['One', 'Two', 'Three']) await bS.pushUndo(G, hero.id, l, []);
  await open(S); await wait(200);
  ok(!!btn(rowOf(S, 'Hero'), /^UNDO: THREE$/), P('three actions: the newest is offered'));
  S.click(btn(rowOf(S, 'Hero'), /^END TURN$/)); await wait(400);
  ok(await waitFor(() => rowOf(S, 'Hero') && !btn(rowOf(S, 'Hero'), /^UNDO/), 4000), P('after END TURN there is no UNDO'));
  let err = ''; try { await bS.undoAction(G, hero.id); } catch (e) { err = e.message; }
  ok(/Nothing to undo/.test(err), P('the server agrees: nothing to undo after END TURN'));

  // the QM ends the NPC's turn from its roster row
  await open(R); await wait(300);
  ok(await waitFor(() => rowOf(R, 'Orc') && rowOf(R, 'Orc').classList.contains('turn'), 4000), P("it is the Orc's turn"));
  await open(V); await wait(200);
  ok(!btn(rowOf(V, 'Orc'), /^END TURN$/), P('a player gets no END TURN on the NPC'));
  R.click(btn(rowOf(R, 'Orc'), /^END TURN$/));
  ok(await until(async () => { const g = (await bR.listCampaigns()).find((x) => x.id === G); return g.encounter.turn === foe.id; }, 5000), P("the QM's END TURN moves the NPC's turn on"));

  // a roll result in a highlighted box
  await open(S);
  S.click(btn(rowOf(S, 'Hero'), /^SKILL CHECK$/)); await wait(50);
  S.setv(S.$('skillDie'), '11'); S.click(S.$('skillSet')); await wait(200);
  ok(await waitFor(() => S.d.querySelector('#skillOut .roll-big') && /^TOTAL /.test(S.d.querySelector('#skillOut .roll-big').textContent) && !!S.d.querySelector('#skillOut .calc'), 3000), P('a skill check shows TOTAL big in a box, with the calculation under it'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
