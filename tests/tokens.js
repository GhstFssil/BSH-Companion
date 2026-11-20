const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam: { name: 'Sam', username: 'sam_2', email: 'sam@example.com', password: 'another pass1' },
  ava: { name: 'Ava', username: 'ava_3', email: 'ava@example.com', password: 'third pass12' }
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function scenario(label, makeAs) {
  console.log('--- ' + label); const P = (m) => `[${label}] ${m}`;
  const as = await makeAs(); const R = await as('ricky'), S = await as('sam'), V = await as('ava');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 7000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G); await bV.joinCampaign(G);
  const hero = S.w.BSH.blankCharacter(); hero.id = S.w.crypto.randomUUID(); hero.info.name = 'Hero'; hero.campaignId = G; await bS.saveCharacter(hero);
  const npc = R.w.BSH.blankCharacter(); npc.id = R.w.crypto.randomUUID(); npc.info.name = 'Ogre'; await bR.createNpc(G, npc);
  const mapId = await bR.saveMap(G, { name: 'Pit floor', image: PNG, imgW: 500, imgH: 400, cols: 5, rows: 4, size: 100, ox: 0, oy: 0 });
  await bR.startEncounter(G); await bS.setInitiative(G, hero.id, 12, 0); await bR.setInitiative(G, npc.id, 7, 0);
  await bR.setEncounterMap(G, mapId);
  const toks = async (b) => (await b.listTokens(G));
  const btn = (A, t) => [...A.d.querySelectorAll('button')].find((b) => b.textContent === t);
  const tokEls = (A) => [...A.d.querySelectorAll('#mapViewBody .token')];
  for (const A of [R, S, V]) A.go('campaign-' + G);
  ok(await until(() => !S.$('encMapTab').hidden), P('map tab is there'));
  S.click(S.$('encMapTab'));
  ok(await until(() => S.vis().join() === 'mapview' && !!S.$('tokenPanel') && !!S.d.querySelector('[data-drop]')), P('player opens the map and sees the token panel'));
  ok(S.d.querySelectorAll('[data-row]').length === 1 && S.$('tokenPanel').textContent.includes('Hero') && !S.$('tokenPanel').textContent.includes('Ogre'), P('player can place only their own character'));
  ok(tokEls(S).length === 0, P('no tokens yet'));
  S.click(S.d.querySelector('[data-drop]'));
  ok(await until(() => tokEls(S).length === 1), P('DROP ON MAP puts the token on the map'));
  const t1 = tokEls(S)[0];
  ok(t1.querySelector('.disc').textContent === '12' && /hsl\(/.test(t1.querySelector('.disc').getAttribute('style')), P('default token: coloured circle with the initiative number (12)'));
  ok(t1.style.left === '0%' && t1.style.top === '0%' && t1.style.width === '20%' && t1.style.height === '25%', P('it snaps to the first grid square (size 100 of 500 x 400)'));
  ok((await toks(bR)).length === 1 && (await toks(bR))[0].col === 0, P('saved: the QM sees it too'));
  // name on click
  S.click(tokEls(S)[0]);
  ok(!!S.d.querySelector('.token-name') && S.d.querySelector('.token-name').textContent === 'Hero', P('tapping a token shows the character\'s name'));
  // arrows
  ok(await until(() => !!S.$('tokRight')), P('arrows appear for the selected token'));
  S.click(S.$('tokRight')); S.click(S.$('tokDown'));
  ok(await until(async () => { const t = (await toks(bR))[0]; return t.col === 1 && t.row === 1; }), P('arrows move it one square at a time'));
  S.click(S.$('tokLeft')); S.click(S.$('tokLeft')); S.click(S.$('tokUp')); S.click(S.$('tokUp'));
  ok(await until(async () => { const t = (await toks(bR))[0]; return t.col === 0 && t.row === 0; }), P('and cannot leave the grid'));
  ok(await until(() => !S.d.querySelector('.token-name'), 5000), P('the name disappears after 3 seconds'));
  // drag
  const stage = S.d.querySelector('#mapViewBody .map-stage');
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400, right: 500, bottom: 400 });
  const ev = (type, x, y) => new S.w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  const te = tokEls(S)[0];
  te.dispatchEvent(ev('pointerdown', 50, 50)); te.dispatchEvent(ev('pointermove', 260, 160));
  ok(te.style.left === '40%' && te.style.top === '25%', P('dragging snaps to the grid as it moves'));
  te.dispatchEvent(ev('pointerup', 260, 160));
  ok(await until(async () => { const t = (await toks(bR))[0]; return t.col === 2 && t.row === 1; }), P('dropping saves the square (col 2, row 1)'));
  // QM
  R.click(R.$('encMapTab'));
  ok(await until(() => R.vis().join() === 'mapview' && R.d.querySelectorAll('[data-row]').length === 2), P('the QM can place every character, NPCs included'));
  ok(tokEls(R).length === 1 || await until(() => tokEls(R).length === 1), P('the QM sees the player\'s token'));
  R.click(R.d.querySelector('[data-drop="' + npc.id + '"]'));
  ok(await until(async () => (await toks(bR)).length === 2), P('QM drops the NPC token'));
  ok(S.d.querySelectorAll('#mapViewBody .token').length === 1 && (await toks(bS)).length === 1, P('a hidden NPC\'s token is not sent to players'));
  await bR.setNpcVisible(npc.id, true);
  ok(await until(() => tokEls(S).length === 2, 9000), P('shown NPC: players see the token'));
  const ogre = S.d.querySelector('[data-token="' + npc.id + '"]');
  ok(!ogre.classList.contains('mine') && !S.d.querySelector('[data-drop="' + npc.id + '"]'), P('but players cannot move it'));
  let denied = false; try { await bS.setToken(npc.id, 1, 1); } catch (e) { denied = true; } ok(denied, P('server refuses a player moving an NPC'));
  denied = false; try { await bV.setToken(hero.id, 1, 1); } catch (e) { denied = true; } ok(denied, P('server refuses another player moving my character'));
  denied = false; try { await bS.setToken(hero.id, 9, 9); } catch (e) { denied = /off the map/.test(e.message); } ok(denied, P('server refuses squares off the grid'));
  await bR.setToken(hero.id, 4, 3);
  ok(await until(() => { const e = S.d.querySelector('[data-token="' + hero.id + '"]'); return e && e.style.left === '80%' && e.style.top === '75%'; }), P('the QM can move a player\'s token, and the player sees it move'));
  // token picture on the sheet
  S.go('character-' + hero.id);
  ok(await until(() => S.vis().join() === 'sheet'), P('sheet opens'));
  S.tab('info');
  const tf = S.$('tokenFile'); ok(!!tf && !!S.$('tokenClear'), P('INFO tab has a token picture field'));
  Object.defineProperty(tf, 'files', { value: [new S.w.File([Buffer.from(PNG.split(',')[1], 'base64')], 't.png', { type: 'image/png' })], configurable: true });
  tf.dispatchEvent(new S.w.Event('change', { bubbles: true }));
  ok(await until(() => /url\(/.test(S.$('tokenPreview').getAttribute('style') || ''), 5000), P('picture previews'));
  ok(await until(async () => !!(await bS.listCharacters()).find((c) => c.id === hero.id).tokenImage, 6000), P('saved on the character'));
  ok(await until(() => { const d = R.d.querySelector('[data-token="' + hero.id + '"] .disc'); return d && /url\(/.test(d.getAttribute('style')) && d.textContent === ''; }, 12000), P('the QM\'s map shows the picture instead of the numbered circle'));
  // map removed -> tokens gone
  R.click(R.d.querySelector('#mapBackTab'));
  await until(() => R.vis().join() === 'campaign');
  R.click(R.$('mapRemove'));
  ok(await until(async () => (await toks(bR)).length === 0), P('removing the map clears the tokens'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const mk = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: mk.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  mk.close(); done();
})();
