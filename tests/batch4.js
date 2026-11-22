// Custom actions, mobs and bosses, the codex, Bleed/Wound tokens and rest cooldowns (local and Supabase-mock backends)
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
  const rows = async (b) => await b.listCampaignCharacters(G);
  const row = async (b, id) => (await rows(b)).find((r) => r.ch.id === id);
  const buttons = (A, re) => [...A.d.querySelectorAll('button')].filter((x) => re.test(x.textContent));

  // ----- custom actions in the Actions menu -----
  const hero = mk(S, 'Hero');
  hero.customActions = [{ name: 'Taunt', cost: '1 AP', desc: 'Draw attention.' }, { name: 'Howl', cost: 'a lot', desc: 'Loud.' }, { name: '', cost: '1 AP', desc: 'unnamed is skipped' }];
  hero.vitals = Object.assign({}, hero.vitals, { bt: 20, wt: 1, epRemaining: 1 });
  await bS.saveCharacter(hero);
  S.go('home'); await wait(30); S.go('campaign-' + G); await wait(300);
  const heroRow = () => [...S.d.querySelectorAll('#campChars .cchar')].find((r) => r.textContent.includes('Hero'));
  ok(!!heroRow(), P('player sees their character on the campaign page'));
  ok(/BT 20 · SP COST x2/.test(heroRow().textContent) && /WT 1/.test(heroRow().textContent), P('roster shows BT and WT tags'));
  ok(/BLEEDING/.test(heroRow().textContent), P('roster has a BLEEDING button'));
  S.click(buttons(S, /^ACTIONS$/)[0]); await wait(100);
  const list = S.$('actionsList').textContent;
  ok(/Taunt/.test(list) && /Howl/.test(list) && !/unnamed is skipped/.test(list), P('custom actions are listed, unnamed ones skipped'));
  const tauntBtn = [...S.d.querySelectorAll('#actionsList .arow button')].find((x) => x.textContent === 'Taunt');
  S.click(tauntBtn); await wait(50);
  ok(/Draw attention/.test(S.$('actionDesc').textContent) && /Cost: 1 AP/.test(S.$('actionDesc').textContent), P('a custom action opens its card with the cost'));
  S.click(S.$('actionBack')); await wait(30);
  const howlBtn = [...S.d.querySelectorAll('#actionsList .arow button')].find((x) => x.textContent === 'Howl');
  S.click(howlBtn); await wait(50);
  ok(/Cost: a lot/.test(S.$('actionDesc').textContent), P('a cost that is not "N AP/SP" is shown as text'));
  S.click(S.$('actionBack')); await wait(30);

  // ----- Respite and Short Rest: Bleed Tokens come off, cooldowns lock the rest -----
  const restCard = () => { S.click([...S.d.querySelectorAll('#actionsList .arow button')].find((x) => x.textContent === 'Rest')); };
  const takeRest = async (name, dice) => {
    restCard(); await wait(40);
    S.click(buttons(S, new RegExp('^TAKE ' + name.toUpperCase() + '$'))[0]); await wait(40);
    const ins = [...S.d.querySelectorAll('#actionDesc .rest-die input')];
    ins.forEach((el, i) => S.setv(el, String(dice[i])));
    S.click(buttons(S, /^APPLY REST$/)[0]); await wait(300);
  };
  await takeRest('Respite', [1, 2, 3]);   // HP D2, EP D2, BT D4
  let v = (await row(bS, hero.id)).ch.vitals;
  ok(v.bt === 17 && v.restCd && v.restCd.Respite === 2, P('Respite: 3 BT removed and it is locked until 2 EP are recovered (' + JSON.stringify([v.bt, v.restCd]) + ')'));
  restCard(); await wait(40);
  const respBtn = buttons(S, /^TAKE RESPITE$/)[0];
  ok(respBtn && respBtn.disabled && /Locked: recover 2/.test(S.$('actionDesc').textContent), P('the locked rest cannot be taken again'));
  S.click(S.$('actionBack')); await wait(30);
  await takeRest('Short Rest', [4, 2, 3, 3]);   // HP D4, EP D2, BT 2D4
  v = (await row(bS, hero.id)).ch.vitals;
  ok(v.bt === 11 && v.restCd && !('Respite' in v.restCd) && v.restCd['Short Rest'] === 6, P('Short Rest: 6 BT off, EP recovered clears the Respite lock, Short Rest is now locked (' + JSON.stringify([v.bt, v.restCd]) + ')'));
  S.click(S.$('actionsClose')); await wait(30);

  // ----- Bleeding switch on the roster -----
  S.click(buttons(S, /^BLEEDING$/)[0]); await wait(300);
  ok((await row(bS, hero.id)).ch.vitals.bleeding === 1, P('the BLEEDING button saves the condition'));
  ok(/STOP BLEEDING/.test(heroRow().textContent), P('and flips to STOP BLEEDING'));
  S.click(buttons(S, /^STOP BLEEDING$/)[0]); await wait(300);
  ok(!(await row(bS, hero.id)).ch.vitals.bleeding, P('it can be switched off again'));
  // the QM can set it on a player's character too
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(300);
  const rHero = () => [...R.d.querySelectorAll('#campChars .cchar')].find((r) => r.textContent.includes('Hero'));
  R.click([...rHero().querySelectorAll('button')].find((x) => /^BLEEDING$/.test(x.textContent))); await wait(300);
  ok((await row(bR, hero.id)).ch.vitals.bleeding === 1, P('a QM sets Bleeding on a player character'));

  // ----- mobs and bosses -----
  const orc = mk(R, 'Orc'); orc.campaignId = G; orc.isNpc = true; orc.npcVisible = false;
  orc.items = [{ name: 'Notched Axe', qty: 1, desc: 'Heavy and chipped.', weapon: true, weaponProps: { dmg: 'BP+2' }, buffs: [], magicProps: {} }];
  await bR.createNpc(G, orc);
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(300);
  R.click(R.$('mobBtn')); await wait(60);
  ok(!R.$('etModal').hidden && R.$('etTitle').textContent === 'Make mobs and bosses', P('MAKE MOBS opens the card'));
  ok(![...R.$('mobTpl').options].some((o) => o.text === 'Hero'), P('only NPCs can be copied'));
  R.$('mobTpl').value = orc.id; R.$('mobTpl').dispatchEvent(new R.w.Event('change', { bubbles: true }));
  R.setv(R.$('mobCount'), '3'); R.setv(R.$('mobVary'), '10'); R.setv(R.$('mobBoost'), '0');
  R.click(R.$('mobGo')); await wait(900);
  let all = await rows(bR);
  const mobs = all.filter((r) => r.ch.info.mobBase === 'Orc');
  ok(mobs.length === 3 && mobs.map((r) => r.ch.info.name).sort().join() === 'Orc 1,Orc 2,Orc 3', P('three mobs Orc 1-3 were made (' + mobs.map((r) => r.ch.info.name) + ')'));
  const hpIx = R.w.BSH.STATS.findIndex((x) => x.key === 'HP'), apIx = R.w.BSH.STATS.findIndex((x) => x.key === 'AP');
  ok(mobs.every((r) => r.ch.isNpc && !r.ch.npcVisible && r.ch.info.kind === 'mob' && r.ch.id !== orc.id), P('mobs are hidden NPCs of kind mob'));
  ok(mobs.every((r) => Math.abs(r.ch.statAdjPct[hpIx]) <= 10 && r.ch.statAdjPct[apIx] === 0 && Math.abs(r.ch.statAdjPct[0]) <= 10), P('HP varies by at most 10%, AP is left alone'));
  ok(mobs.every((r) => r.ch.items.length === 1 && r.ch.items[0].name === 'Notched Axe') && mobs.every((r) => r.ch.vitals.damage == null), P('items come along, vitals start fresh'));
  R.setv(R.$('mobBoost'), '50'); R.setv(R.$('mobCount'), '1'); R.setv(R.$('mobVary'), '0'); R.$('mobKind').value = 'boss';
  R.setv(R.$('mobBoost'), '50'); R.setv(R.$('mobName'), 'Orc Warlord'); R.setv(R.$('mobCount'), '1'); R.setv(R.$('mobVary'), '0');
  R.click(R.$('mobGo')); await wait(600);
  all = await rows(bR);
  const boss = all.find((r) => r.ch.info.name === 'Orc Warlord');
  ok(boss && boss.ch.statAdjPct[hpIx] === 50 && boss.ch.statAdjPct[apIx] === 0, P('a boss gets the +50% boost with no variation'));
  ok(boss && boss.ch.info.kind === 'boss', P('the boss is marked as a boss'));
  const bad = (await bS.listCampaignCharacters(G)).filter((r) => r.ch.isNpc);
  ok(bad.length === 0, P('players do not see the hidden mobs'));
  R.click(buttons(R, /^CLOSE$/)[0]); await wait(30);

  // ----- codex -----
  const o1 = (await rows(bR)).find((r) => r.ch.info.name === 'Orc 1');
  await bR.setNpcVisible(o1.ch.id, true);
  S.go('home'); await wait(30); S.go('campaign-' + G); await wait(500);
  let cx = (await bS.listCampaigns()).find((g) => g.id === G).codex;
  ok(cx.mobs && cx.mobs.orc && cx.mobs.orc.kind === 'mob' && cx.mobs.orc.hp > 0, P('a shown mob is recorded when a player opens the campaign (' + JSON.stringify(cx.mobs && Object.keys(cx.mobs)) + ')'));
  ok(cx.items && cx.items['notched axe'] && cx.items['notched axe'].weapon === true, P('its item is recorded too'));
  ok(!cx.mobs['orc warlord'] && !cx.mobs['orc 2'], P('hidden mobs are not recorded'));
  S.click(S.$('codexBtn')); await wait(60);
  ok(/Orc/.test(S.$('etBody').textContent) && /Notched Axe/.test(S.$('etBody').textContent), P('the CODEX card lists them'));
  ok(buttons(S, /^REMOVE /).length === 0, P('a player sees no remove buttons'));
  S.click(buttons(S, /^CLOSE$/)[0]); await wait(30);
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(400);
  R.click(R.$('codexBtn')); await wait(60);
  const rm = buttons(R, /^REMOVE NOTCHED AXE$/)[0];
  ok(!!rm, P('a QM sees remove buttons'));
  R.click(rm); await wait(300);
  cx = (await bR.listCampaigns()).find((g) => g.id === G).codex;
  ok(!cx.items['notched axe'], P('the QM removed the entry'));
  R.click(buttons(R, /^CLOSE$/)[0]); await wait(30);
  S.go('home'); await wait(30); S.go('campaign-' + G); await wait(500);
  cx = (await bS.listCampaigns()).find((g) => g.id === G).codex;
  ok(!cx.items['notched axe'], P('and it is not recorded again'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
