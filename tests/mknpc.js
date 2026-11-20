const { boot, wait, api, checker } = require('./h.js');
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
  const bR = await raw(R), bS = await raw(S);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G);
  const mk = (A, n) => { const c = A.w.BSH.blankCharacter(); c.id = A.w.crypto.randomUUID(); c.info.name = n; c.campaignId = G; return c; };
  const a = mk(S, 'Gruk'), b = mk(R, 'Mine');
  await bS.saveCharacter(a); await bR.saveCharacter(b);
  let bad = false; try { await bS.makeNpc(a.id); } catch (e) { bad = /Only a QM/.test(e.message); }
  ok(bad, P('a player cannot make an NPC'));
  // QM views Sam's character and uses the button
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(250);
  const row = [...R.d.querySelectorAll('#campChars .cchar')].find((r) => r.textContent.includes('Gruk'));
  R.click(row.querySelector('.char-btn')); await wait(250);
  const mb = () => [...R.d.querySelectorAll('button')].find((x) => /MAKE NPC/.test(x.textContent));
  ok(!!mb(), P('QM sees MAKE NPC on a player-owned sheet'));
  R.click(mb()); await wait(50); R.click(mb()); await wait(400);
  const rows = await bR.listCampaignCharacters(G);
  const g = rows.find((r) => r.ch.id === a.id);
  ok(g && g.ch.isNpc && g.mine && !g.ch.npcVisible, P('it is now a hidden NPC owned by the QM'));
  const sRows = await bS.listCampaignCharacters(G);
  ok(!sRows.some((r) => r.ch.id === a.id), P('the player no longer sees it'));
  // own character
  R.go('character-' + b.id); await wait(250);
  ok(!!mb(), P('QM sees MAKE NPC on their own character'));
  R.click(mb()); await wait(50); R.click(mb()); await wait(400);
  ok((await bR.listCampaignCharacters(G)).find((r) => r.ch.id === b.id).ch.isNpc, P('own character became an NPC'));
  // player sees no button
  S.go('character-' + a.id); await wait(200);
  ok(![...S.d.querySelectorAll('button')].some((x) => /MAKE NPC/.test(x.textContent)), P('player has no MAKE NPC'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
