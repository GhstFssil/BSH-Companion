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
  const G = await bR.createCampaign('Pit'), G2 = await bR.createCampaign('Tower'); await bS.joinCampaign(G);
  const mk = (n) => { const c = R.w.BSH.blankCharacter(); c.id = R.w.crypto.randomUUID(); c.info.name = n; return c; };
  const n1 = mk('Lich'), n2 = mk('Imp'), n3 = mk('Ogre');
  for (const n of [n1, n2, n3]) await bR.createNpc(G, n);
  const rej = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };
  ok(await rej(bS.unlinkNpc(n1.id), /Only a QM/), P('player cannot take an NPC out of a campaign'));
  ok(await rej(bS.moveNpc(n1.id, G2), /Only a QM/), P('player cannot move'));
  ok(await rej(bS.giveNpc(n1.id, 'x'), /Only a QM/), P('player cannot give'));
  const rowsOf = async (b, g) => (await b.listCampaignCharacters(g)).map((r) => r.ch.info.name);
  const btn = (root, t) => [...root.querySelectorAll('button')].find((x) => x.textContent === t);
  const open = async (id) => { R.go('home'); await wait(30); R.go('campaign-' + G); await wait(250); R.go('character-' + id); await wait(300); };
  const scr = () => R.$('screen-sheet');
  await open(n1.id);
  ok(!!btn(scr(), 'MOVE NPC') && !!btn(scr(), 'GIVE CONTROL') && !!btn(scr(), 'REMOVE FROM CAMPAIGN'), P('NPC sheet shows MOVE NPC, GIVE CONTROL, REMOVE FROM CAMPAIGN'));
  ok(![...scr().querySelectorAll('button')].some((b) => /^REMOVE NPC|ADD TO CAMPAIGN/.test(b.textContent)), P('no delete-style or add button while in a campaign'));
  const mv = scr().querySelector('[data-npc=move] select'); ok(mv && mv.options.length === 1 && mv.options[0].text === 'Tower', P('move list holds the other campaign'));
  R.click(btn(scr(), 'MOVE NPC')); await wait(30); R.click(btn(scr(), 'TAP AGAIN TO MOVE')); await wait(500);
  ok(!(await rowsOf(bR, G)).includes('Lich') && (await rowsOf(bR, G2)).includes('Lich'), P('Lich moved to the other campaign'));
  ok(R.vis().join() === 'campaign', P('goes back to the campaign page: ' + R.vis()));
  const lm = (await bR.listCampaignCharacters(G2)).find((r) => r.ch.info.name === 'Lich');
  ok(lm.ch.isNpc && !lm.ch.npcVisible && lm.mine, P('it arrives as a hidden NPC, still owned by Ricky'));
  // give Imp to Sam
  await open(n2.id);
  const gv = scr().querySelector('[data-npc=give] select'); gv.value = [...gv.options].find((o) => o.text === 'sam_2').value; gv.dispatchEvent(new R.w.Event('change'));
  R.click(btn(scr(), 'GIVE CONTROL')); await wait(30); R.click(btn(scr(), 'TAP AGAIN TO GIVE')); await wait(500);
  const im = (await bS.listCharacters()).find((c) => c.id === n2.id);
  ok(!!im && !im.isNpc, P('Sam now owns Imp as a normal character'));
  // take Ogre out of the campaign: it is kept
  await open(n3.id);
  R.click(btn(scr(), 'REMOVE FROM CAMPAIGN')); await wait(30);
  ok((await rowsOf(bR, G)).includes('Ogre'), P('one tap does nothing'));
  R.click(btn(scr(), 'TAP AGAIN TO REMOVE')); await wait(500);
  ok(!(await rowsOf(bR, G)).includes('Ogre'), P('Ogre is out of the campaign'));
  const og = (await bR.listCharacters()).find((c) => c.id === n3.id);
  ok(!!og && og.isNpc && !og.campaignId, P('but still Ricky\'s NPC, with no campaign'));
  ok(R.vis().join() === 'characters', P('lands on the characters page: ' + R.vis()));
  const head = R.$('npcHead'), npcBtns = [...R.d.querySelectorAll('#npcList button')];
  ok(!head.hidden && npcBtns.some((b) => /Ogre/.test(b.textContent) && /no campaign/.test(b.textContent)), P('it is listed under NPCs on the characters page'));
  ok(![...R.d.querySelectorAll('#charList button')].some((b) => /Ogre|Lich/.test(b.textContent)), P('NPCs are not in the main character list'));
  ok(npcBtns.some((b) => /Lich/.test(b.textContent) && /Tower/.test(b.textContent)), P('Lich (in a campaign) is listed under NPCs too'));
  ok(!(await rowsOf(bS, G)).includes('Ogre') && !(await bS.listCharacters()).some((c) => c.id === n3.id), P('the player never sees it'));
  // add Ogre back into a campaign
  R.click(npcBtns.find((b) => /Ogre/.test(b.textContent))); await wait(300);
  ok(!!btn(scr(), 'ADD TO CAMPAIGN') && !btn(scr(), 'MOVE NPC'), P('an unattached NPC offers ADD TO CAMPAIGN'));
  const ad = scr().querySelector('[data-npc=add] select'); ad.value = G; ad.dispatchEvent(new R.w.Event('change'));
  R.click(btn(scr(), 'ADD TO CAMPAIGN')); await wait(30); R.click(btn(scr(), 'TAP AGAIN TO ADD')); await wait(500);
  const og2 = (await bR.listCampaignCharacters(G)).find((r) => r.ch.id === n3.id);
  ok(og2 && og2.ch.isNpc && !og2.ch.npcVisible, P('Ogre is back in the campaign, hidden'));
  ok(await rej(bS.addNpcToCampaign(n3.id, G), /own NPCs|QM/), P('a player cannot add NPCs'));
  // the owner can still delete an NPC from the sheet; the campaign being deleted keeps NPCs
  await bR.deleteCampaign(G2);
  const lich = (await bR.listCharacters()).find((c) => c.id === n1.id);
  ok(!!lich && lich.isNpc && !lich.campaignId, P('deleting a campaign keeps its NPCs, outside any campaign'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
