// Compendiums: making one (items, mobs with ranges and drops, abilities, attacks, custom actions), export/import,
// a campaign's compendium (QM only: add mobs, give items), copies with UPDATE FROM COMPENDIUM (local and Supabase-mock backends)
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
  const bR = await raw(R), bS = await raw(S);
  const buttons = (A, re) => [...A.d.querySelectorAll('button')].filter((x) => re.test(x.textContent) && !x.closest('[hidden]'));
  const lbl = (A, panel, l) => A.byLabel(panel, l);
  const saved = async () => { await wait(900); return (await bR.listCompendiums()).find((b) => b.mine); };

  // ----- a new compendium -----
  R.go('home'); await wait(30);
  ok(!!R.d.querySelector('#screen-home [data-go="compendiums"]'), P('the home screen has COMPENDIUM'));
  R.go('compendiums'); await wait(100);
  ok(!R.$('screen-compendiums').hidden && !R.$('noComps').hidden, P('the compendium list opens, empty'));
  R.click(R.$('newCompBtn')); await waitFor(() => !R.$('screen-sheet').hidden);
  const tabs = [...R.d.querySelectorAll('#tabs .tab')].map((t) => t.textContent).join(',');
  ok(tabs === 'INFO,ITEMS,MOBS,ABILITIES', P('a compendium opens with INFO, ITEMS, MOBS and ABILITIES (' + tabs + ')'));
  ok(R.$('exportBtn').textContent === 'EXPORT COMPENDIUM' && !R.$('exportBtn').hidden, P('the export button exports the compendium'));
  R.setv(lbl(R, 'info', 'Compendium name'), 'Monsters');
  let B = await saved();
  ok(B && B.name === 'Monsters', P('renaming it is saved'));
  ok(R.$('sheetTitle').textContent === 'Monsters', P('the title is its name'));

  // items
  R.tab('items');
  ok(!R.$('handsLine') && !buttons(R, /^FROM COMPENDIUM$/).length, P('no hands line and no FROM COMPENDIUM inside a compendium'));
  const addItem = async (name) => { R.click(buttons(R, /^ADD ITEM$/)[0]); await wait(20); const ins = R.d.querySelectorAll('#panel-items [aria-label="Item name"]'); R.setv(ins[ins.length - 1], name); };
  await addItem('Club');
  const weaponCb = R.d.querySelectorAll('#panel-items [aria-label="Weapon"]')[0];
  weaponCb.checked = true; weaponCb.dispatchEvent(new R.w.Event('change', { bubbles: true })); await wait(20);
  ok(!buttons(R, /^LEFT HAND$|^RIGHT HAND$|^GIVE$/).length, P('no hand or GIVE buttons on compendium items'));
  await addItem('Arrow'); R.setv(R.d.querySelectorAll('#panel-items [aria-label="Quantity"]')[1], 5);
  B = await saved();
  ok(B.data.items.length === 2 && B.data.items[0].weapon && B.data.items[0].attacks.length === 1 && B.data.items.every((x) => x.cid), P('items are saved with ids; the weapon has an attack'));

  // abilities, attacks, custom actions
  R.tab('abilities');
  ok(!R.$('abFromComp'), P('no ADD FROM COMPENDIUM inside a compendium'));
  R.click(buttons(R, /^ADD ABILITY$/)[0]); await wait(20); R.setv(lbl(R, 'abilities', 'Ability name'), 'Stench');
  R.click(buttons(R, /^ADD ATTACK$/)[0]); await wait(20); R.setv(lbl(R, 'abilities', 'Attack name'), 'Bite');
  R.click(buttons(R, /^ADD CUSTOM ACTION$/)[0]); await wait(20); R.setv(lbl(R, 'abilities', 'Custom action name'), 'Howl');
  B = await saved();
  ok(B.data.abilities[0].name === 'Stench' && B.data.attacks.length === 1 && B.data.attacks[0].name === 'Bite' && B.data.customActions[0].name === 'Howl', P('abilities, attacks and custom actions are saved'));
  ok(B.data.abilities[0].cid && B.data.attacks[0].cid && B.data.customActions[0].cid, P('each gets an id'));

  // a mob
  R.tab('mobs');
  R.click(R.$('addMob')); await waitFor(() => /compmob-/.test(R.w.location.hash) && R.$('tab-drops'));
  const mtabs = [...R.d.querySelectorAll('#tabs .tab')].map((t) => t.textContent).join(',');
  ok(/DROPS/.test(mtabs) && !/ITEMS/.test(mtabs) && /TALENTS/.test(mtabs), P('a mob opens as a sheet with DROPS instead of ITEMS (' + mtabs + ')'));
  ok(R.$('exportBtn').hidden, P('no export on a mob'));
  R.setv(lbl(R, 'info', 'Mob name'), 'Goblin');
  R.setv(lbl(R, 'info', 'Stat variation percent'), 10);
  R.tab('talents');
  R.setv(lbl(R, 'talents', 'Strength'), 12);
  R.setv(lbl(R, 'talents', 'Strength range (each copy rolls this much up or down)'), 2);
  const sk0 = R.w.BSH.SKILLS[0].name;
  R.tab('skills');
  R.setv(lbl(R, 'skills', sk0 + ' proficiency points'), 3);
  R.setv(lbl(R, 'skills', sk0 + ' proficiency range (each copy rolls this much up or down)'), 1);
  R.tab('drops');
  R.click(R.$('addDrop')); await wait(20); R.click(R.$('addDrop')); await wait(20);
  const dsel = R.d.querySelectorAll('#dropList select');
  dsel[1].value = B.data.items[1].cid; dsel[1].dispatchEvent(new R.w.Event('change', { bubbles: true }));
  R.setv(R.d.querySelectorAll('#dropList [aria-label="Chance percent"]')[1], 0);
  B = await saved();
  const gob = B.data.mobs[0];
  ok(gob && gob.ch.info.name === 'Goblin' && gob.ch.talents[0] === 12 && gob.var.talents[0] === 2 && gob.ch.prof[0] === 3 && gob.var.prof[0] === 1 && gob.var.statPct === 10, P('the mob, its ranges and its variation are saved'));
  ok(gob.drops.length === 2 && gob.drops[0].e === B.data.items[0].cid && gob.drops[0].chance === 100 && gob.drops[1].chance === 0, P('its drops are saved'));
  ok(R.$('sheetTitle').textContent === 'Goblin (mob)', P('the title shows the mob'));
  R.click(R.d.querySelector('#screen-sheet .corner')); await wait(60);
  ok(R.w.location.hash === '#compendium-' + B.id, P('BACK from a mob goes to its compendium'));
  R.tab('mobs');
  ok(/Goblin/.test(R.$('panel-mobs').textContent) && /2 drops/.test(R.$('panel-mobs').textContent), P('the MOBS tab lists it'));

  // export, then import as a new compendium
  let blob = null; R.w.URL.createObjectURL = (b) => { blob = b; return 'blob:x'; }; R.w.URL.revokeObjectURL = () => {};
  R.click(R.$('exportBtn')); await wait(30);
  const fileText = blob ? await blob.text() : '';
  const file = fileText ? JSON.parse(fileText) : {};
  ok(file.format === 'bloodsoup-hell-compendium' && file.compendium.name === 'Monsters' && file.compendium.data.mobs.length === 1, P('EXPORT COMPENDIUM makes a compendium file'));
  R.go('compendiums'); await wait(150);
  const imp = R.$('compFile');
  Object.defineProperty(imp, 'files', { value: [new R.w.File([fileText.replace('"Monsters"', '"Monsters 2"')], 'm.json', { type: 'application/json' })], configurable: true });
  imp.dispatchEvent(new R.w.Event('change')); await waitFor(() => !R.$('screen-sheet').hidden);
  const all = (await bR.listCompendiums()).filter((b) => b.mine);
  const B2 = all.find((b) => b.name === 'Monsters 2');
  ok(all.length === 2 && B2 && B2.id !== B.id && B2.data.mobs[0].drops[0].e === B2.data.items[0].cid, P('IMPORT COMPENDIUM brings it back as a new one, links inside intact'));
  Object.defineProperty(imp, 'files', { value: [new R.w.File(['{"format":"bloodsoup-hell-character"}'], 'x.json')], configurable: true });
  R.go('compendiums'); await wait(100);
  imp.dispatchEvent(new R.w.Event('change')); await waitFor(() => R.$('compMsg').textContent);
  ok(/not a compendium/.test(R.$('compMsg').textContent), P('a file that is not a compendium is refused'));
  await bR.deleteCompendium(B2.id);

  // ----- a campaign uses it -----
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G);
  const hero = S.w.BSH.blankCharacter(); hero.id = S.w.crypto.randomUUID(); hero.info.name = 'Hero'; hero.campaignId = G; await bS.saveCharacter(hero);
  R.go('home'); await wait(30); R.go('campaign-' + G); await waitFor(() => R.$('compBtn'));
  ok(!!R.$('compBtn'), P('a QM has a COMPENDIUM button on the campaign page'));
  S.go('home'); await wait(30); S.go('campaign-' + G); await wait(400);
  ok(!S.$('compBtn'), P('a player does not'));
  R.click(R.$('compBtn')); await waitFor(() => R.$('ccBook'));
  R.$('ccBook').value = B.id; R.$('ccBook').dispatchEvent(new R.w.Event('change')); await waitFor(() => R.$('ccAddMobs'));
  ok((await bR.listCampaigns()).find((g) => g.id === G).compendiumId === B.id, P('the QM chooses it for the campaign'));
  ok((await bS.listCompendiums()).length === 0, P('the player cannot read it'));
  R.setv(R.$('ccCount'), 3); R.click(R.$('ccAddMobs'));
  await waitFor(() => /Added Goblin 1, Goblin 2, Goblin 3/.test(R.$('ccMsg').textContent), 6000);
  ok(/Added Goblin 1, Goblin 2, Goblin 3/.test(R.$('ccMsg').textContent), P('ADD MOBS makes Goblin 1, 2 and 3 (' + R.$('ccMsg').textContent + ')'));
  let rows = (await bR.listCampaignCharacters(G)).filter((r) => /^Goblin \d$/.test(r.ch.info.name));
  ok(rows.length === 3 && rows.every((r) => r.ch.isNpc && !r.ch.npcVisible), P('they are hidden NPCs'));
  ok(rows.every((r) => r.ch.talents[0] >= 10 && r.ch.talents[0] <= 14 && r.ch.prof[0] >= 2 && r.ch.prof[0] <= 4), P('talents and proficiencies fall inside their ranges (' + rows.map((r) => r.ch.talents[0] + '/' + r.ch.prof[0]).join(' ') + ')'));
  ok(rows.every((r) => [0, 3, 6, 7, 8].every((i) => Math.abs(r.ch.statAdjPct[i]) <= 10)), P('stat variation stays within 10%'));
  ok(rows.every((r) => r.ch.items.length === 1 && r.ch.items[0].name === 'Club' && r.ch.items[0].cref.c === B.id && r.ch.items[0].uid), P('each carries the sure drop (Club, linked) and never the 0% one'));
  ok(rows.every((r) => r.ch.info.kind === 'mob' && r.ch.info.mobBase === 'Goblin' && r.ch.info.cref.e === gob.cid), P('each is a mob linked to its entry'));
  ok(rows.every((r) => r.ch.abilities.length === 0 && r.ch.items.every((x) => !x.eqL)), P('copies are clean'));
  R.setv(R.$('ccCount'), 2); R.click(R.$('ccAddMobs'));
  await waitFor(() => /Added Goblin 4, Goblin 5/.test(R.$('ccMsg').textContent), 6000);
  ok(/Added Goblin 4, Goblin 5/.test(R.$('ccMsg').textContent), P('numbering carries on (' + R.$('ccMsg').textContent + ')'));
  // give an item from it
  await waitFor(() => R.$('ccTo') && [...R.$('ccTo').options].some((o) => /Hero/.test(o.textContent)));
  R.$('ccItem').value = B.data.items[1].cid; R.$('ccItem').dispatchEvent(new R.w.Event('change'));
  ok(R.$('ccQty').value === '5', P('the quantity starts at the compendium item\'s'));
  R.$('ccTo').value = hero.id; R.click(R.$('ccGive'));
  await waitFor(() => /Gave 5 Arrow to Hero/.test(R.$('ccMsg').textContent));
  ok(/Gave 5 Arrow to Hero/.test(R.$('ccMsg').textContent), P('GIVE ITEM sends it to a player\'s character'));
  const gifts = await bS.pendingGifts();
  ok(gifts.length === 1 && gifts[0].item.cref && gifts[0].item.cref.e === B.data.items[1].cid && gifts[0].item.qty === 5, P('the gift carries the compendium link'));
  R.click(R.$('etCancel')); await wait(20);

  // ----- a co-QM can use it, not change it -----
  const sm = (await bR.listCampaigns()).find((g) => g.id === G).members.find((m) => m.username === 'sam_2');
  await bR.setQm(G, sm.userId, true);
  const sb = (await bS.listCompendiums());
  ok(sb.length === 1 && sb[0].id === B.id && !sb[0].mine, P('a co-QM can read the campaign\'s compendium'));
  S.go('home'); await wait(30); S.go('compendium-' + B.id); await waitFor(() => !S.$('screen-sheet').hidden);
  ok(S.d.querySelector('#panel-info [aria-label="Compendium name"]').disabled && /Read only/.test(S.$('saveStatus').textContent), P('it opens read only for them'));
  S.go('compendiums'); await wait(300);
  ok(!S.$('compOtherHead').hidden && /Monsters/.test(S.$('compOther').textContent), P('their list shows it under the campaigns\' compendiums'));
  await bR.setQm(G, sm.userId, false);

  // ----- UPDATE FROM COMPENDIUM -----
  R.go('compendium-' + B.id); await waitFor(() => !R.$('screen-sheet').hidden);
  R.tab('items');
  R.setv(R.d.querySelectorAll('#panel-items [aria-label="Item description"]')[0], 'A heavy club.');
  await saved();
  const g1 = (await bR.listCampaignCharacters(G)).find((r) => r.ch.info.name === 'Goblin 1');
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(300);
  R.go('character-' + g1.ch.id); await waitFor(() => !R.$('screen-sheet').hidden);
  R.tab('items');
  await waitFor(() => R.d.querySelector('#panel-items [data-update]'));
  const up = R.d.querySelector('#panel-items [data-update="items"]');
  ok(!!up, P('a copied item has UPDATE FROM COMPENDIUM'));
  if (up) R.click(up); await wait(700);
  let gNow = (await bR.listCampaignCharacters(G)).find((r) => r.ch.id === g1.ch.id).ch;
  ok(gNow.items[0].desc === 'A heavy club.' && gNow.items[0].cref && gNow.items[0].uid === g1.ch.items[0].uid, P('UPDATE takes the new description, keeps its id and link'));
  R.tab('info');
  ok(/Made from Goblin in the compendium Monsters/.test(R.$('panel-info').textContent), P('the mob\'s INFO tab says where it came from'));
  const mu = buttons(R, /^UPDATE FROM COMPENDIUM$/).find((b) => b.closest('#panel-info'));
  R.click(mu); await wait(10); R.click(buttons(R, /^TAP AGAIN TO UPDATE$/)[0]); await wait(700);
  gNow = (await bR.listCampaignCharacters(G)).find((r) => r.ch.id === g1.ch.id).ch;
  ok(gNow.info.name === 'Goblin 1' && gNow.talents[0] >= 10 && gNow.talents[0] <= 14 && gNow.items.length === 1, P('UPDATE on the mob re-rolls it but keeps its name and items'));

  // ----- FROM COMPENDIUM on your own sheet -----
  R.go('characters'); await wait(30); R.click(R.$('newCharBtn')); await waitFor(() => !R.$('screen-sheet').hidden);
  R.tab('items'); R.click(R.$('itemFromComp')); await waitFor(() => R.$('cpEntry'));
  R.$('cpEntry').value = B.data.items[0].cid; R.$('cpEntry').dispatchEvent(new R.w.Event('change'));
  R.setv(R.$('cpQty'), 2); R.click(R.$('cpAdd')); await wait(30);
  ok(/Added Club/.test(R.$('cpMsg').textContent), P('FROM COMPENDIUM adds an item to your sheet'));
  R.click(R.$('etCancel')); await wait(20);
  R.tab('abilities'); R.click(R.$('abFromComp')); await waitFor(() => R.$('cpKind'));
  R.$('cpKind').value = 'attacks'; R.$('cpKind').dispatchEvent(new R.w.Event('change')); R.click(R.$('cpAdd')); await wait(20);
  R.$('cpKind').value = 'customActions'; R.$('cpKind').dispatchEvent(new R.w.Event('change')); R.click(R.$('cpAdd')); await wait(20);
  R.$('cpKind').value = 'abilities'; R.$('cpKind').dispatchEvent(new R.w.Event('change')); R.click(R.$('cpAdd')); await wait(20);
  R.click(R.$('etCancel')); await wait(800);
  const mine = (await bR.listCharacters()).find((c) => c.items.some((x) => x.name === 'Club') && !c.isNpc);
  ok(mine && mine.items[0].qty === 2 && mine.items[0].cref.c === B.id, P('the copy is saved with the quantity and its link'));
  ok(mine && mine.attacks.some((a) => a.name === 'Bite' && a.cref) && mine.customActions.some((a) => a.name === 'Howl' && a.cref) && mine.abilities.some((a) => a.name === 'Stench' && a.cref), P('attacks, custom actions and abilities copy too, linked'));
  ok(mine && mine.attacks.every((a) => !a.cid), P('copies do not take the compendium\'s own ids'));
  ok(R.d.querySelectorAll('#panel-abilities [data-update]').length === 3, P('each copied ability, attack and custom action has UPDATE'));

  // ----- deleting the compendium -----
  R.go('compendium-' + B.id); await waitFor(() => !R.$('screen-sheet').hidden && R.$('tab-mobs'));
  R.click(buttons(R, /^DELETE COMPENDIUM$/)[0]); await wait(10); R.click(buttons(R, /^TAP AGAIN TO DELETE$/)[0]); await wait(400);
  ok(R.w.location.hash === '#compendiums' && (await bR.listCompendiums()).length === 0, P('DELETE COMPENDIUM removes it'));
  ok(!(await bR.listCampaigns()).find((g) => g.id === G).compendiumId, P('and the campaign no longer uses it'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
