// Release 4: mobs made from the compendium (total level floors/ceilings, random looks, carried / equipped / loot drops, whole-number stats,
// no Explode/Totem/Legacy Tokens or money, kept off My Characters, deleted when removed), SAVE / EDIT locks, the item row layout, the attack Cost label
// (local and Supabase-mock backends)
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
  const B = R.w.BSH, buttons = (A, re) => [...A.d.querySelectorAll('button')].filter((x) => re.test(x.textContent) && !x.closest('[hidden]'));

  // a compendium with one mob: Strength 12 ± 3 and Agility 10 ± 3 (Talent level 85-91 kept to 88-89), random looks, three drops
  const tpl = B.blankCharacter(); tpl.info.name = 'Ghoul'; tpl.talents[0] = 12;
  const tv = Array(9).fill(null); tv[0] = 3; tv[1] = 3;
  const items = [
    { cid: 'club', name: 'Club', qty: 1, desc: '', weapon: true, weaponProps: { type: 'Club' }, attacks: [{ name: 'Bash', cost: '2 AP', dmg: 'BP' }], buffs: [], magicProps: {} },
    { cid: 'rags', name: 'Rags', qty: 1, desc: '', wearable: true, buffs: [], magicProps: {}, weaponProps: {} },
    { cid: 'gem', name: 'Gem', qty: 1, desc: '', buffs: [{ kind: 'talent', idx: 2, amt: 5, hold: false, wear: false }], magicProps: {}, weaponProps: {} }];
  const mob = { cid: 'ghoul', kind: 'mob', ch: tpl, var: { prof: Array(36).fill(null), talents: tv, statPct: 7, talentMin: 88, talentMax: 89 },
    rand: { sex: 'Male, Female', ageMin: 20, ageMax: 30, heightMin: 60, heightMax: 70, weightMin: 150, weightMax: 160 },
    drops: [{ e: 'club', chance: 100, min: 1, max: 1, carry: true, equip: 'R' }, { e: 'rags', chance: 100, min: 1, max: 1, carry: true, equip: 'B' },
      { e: 'gem', chance: 100, min: 2, max: 2, carry: false }] };
  const compId = R.w.crypto.randomUUID();
  await bR.saveCompendium({ id: compId, name: 'Crypt', data: { v: 1, items, mobs: [mob], abilities: [], attacks: [], customActions: [] } });
  const G = await bR.createCampaign('Crypt run'); await bS.joinCampaign(G);
  await bR.setCampaignCompendium(G, compId);
  const plain = B.blankCharacter(); plain.id = R.w.crypto.randomUUID(); plain.info.name = 'Innkeeper'; await bR.createNpc(G, plain);

  // MAKE MOBS goes to the campaign compendium's ADD MOBS
  R.go('home'); await wait(30); R.go('campaign-' + G); await waitFor(() => R.$('mobBtn'));
  R.click(R.$('mobBtn')); await waitFor(() => R.$('ccAddMobs') && !R.$('ccAddMobs').disabled, 6000);
  ok(R.d.activeElement === R.$('ccMob'), P('MAKE MOBS opens the compendium card at the mob picker'));
  R.setv(R.$('ccCount'), 8); R.click(R.$('ccAddMobs'));
  await waitFor(() => /Added Ghoul 1/.test(R.$('ccMsg').textContent), 8000);
  R.click(R.$('etCancel')); await wait(20);
  const ghouls = (await bR.listCampaignCharacters(G)).filter((r) => /^Ghoul \d$/.test(r.ch.info.name)).map((r) => r.ch);
  ok(ghouls.length === 8, P('eight ghouls were made (' + ghouls.length + ')'));
  const tl = (c) => c.talents.reduce((t, x) => t + (Number(x) || 0), 0);
  ok(ghouls.every((c) => tl(c) >= 88 && tl(c) <= 89), P('every Talent level stays between the floor and ceiling (' + ghouls.map(tl).join(' ') + ')'));
  ok(ghouls.every((c) => c.talents[0] >= 9 && c.talents[0] <= 15 && c.talents[1] >= 7 && c.talents[1] <= 13), P('and each talent stays inside its own range'));
  ok(ghouls.every((c) => ['Male', 'Female'].includes(c.info.sex) && +c.info.age >= 20 && +c.info.age <= 30 && c.info.weight >= 150 && c.info.weight <= 160), P('sex, age and weight are rolled from the lists and ranges'));
  ok(ghouls.every((c) => /^5'([0-9]|10)"$/.test(c.info.height)), P('height is written in feet and inches (' + ghouls.map((c) => c.info.height).join(' ') + ')'));
  ok(ghouls.every((c) => B.compute(c).stat.every((x) => Number.isInteger(x))), P('every stat of a mob is a whole number, variation included'));
  ok(ghouls.every((c) => !('explodeTokens' in c.info) && !('legacyTokens' in c.info) && !('totemTokens' in c.info) && !('money' in c.info)), P('mobs carry no Explode, Totem or Legacy Tokens and no money'));
  const g1 = ghouls.find((c) => c.info.name === 'Ghoul 1');
  const club = g1.items.find((x) => x.name === 'Club'), rags = g1.items.find((x) => x.name === 'Rags'), gem = g1.items.find((x) => x.name === 'Gem');
  ok(club && club.eqR && !club.eqL, P('a carried drop set to Right hand starts in the right hand'));
  ok(rags && rags.eqB, P('a carried wearable set to Worn starts on the body'));
  ok(gem && gem.loot && !gem.eqL && !gem.eqR && !gem.eqB && gem.qty === 2, P('a drop that is not carried is loot, never equipped'));
  ok(B.itemBuffs(g1).talent[2] === 0, P("loot's buffs never apply"));

  // the mob's sheet
  R.go('character-' + g1.id); await waitFor(() => !R.$('screen-sheet').hidden);
  R.tab('info');
  ok(!R.byLabel('info', 'Explode tokens') && !R.byLabel('info', 'Money') && !!R.byLabel('info', 'Weight'), P("a mob's INFO tab has no token or money fields"));
  R.tab('items');
  const gemCard = [...R.d.querySelectorAll('#panel-items .item')].find((c) => c.querySelector('[aria-label="Item name"]').value === 'Gem');
  ok(gemCard && /LOOT/.test(gemCard.querySelector('.htag').textContent) && !buttons(R, /^LEFT HAND$/).some((b) => gemCard.contains(b)), P('loot is tagged LOOT and has no hand buttons'));

  // My Characters leaves mobs out; removing a mob deletes it, removing a plain NPC keeps it
  R.go('characters'); await wait(80);
  ok(!/Ghoul/.test(R.$('npcList').textContent) && /Innkeeper/.test(R.$('npcList').textContent), P('My Characters lists the plain NPC but no mobs'));
  R.go('character-' + g1.id); await waitFor(() => !R.$('screen-sheet').hidden); R.tab('info');
  const del = buttons(R, /^REMOVE AND DELETE$/)[0];
  ok(!!del && /deletes it for good/.test(R.$('panel-info').textContent), P('a mob offers REMOVE AND DELETE'));
  R.click(del); await wait(10); R.click(buttons(R, /^TAP AGAIN TO DELETE$/)[0]);
  await waitFor(() => /campaign-/.test(R.w.location.hash), 6000); await wait(300);
  ok(!(await bR.listCharacters()).some((c) => c.id === g1.id) && !(await bR.listCampaignCharacters(G)).some((r) => r.ch.id === g1.id), P('the removed mob is gone for good'));
  await bR.unlinkNpc(plain.id);
  ok((await bR.listCharacters()).some((c) => c.id === plain.id && !c.campaignId), P('a plain NPC taken out of the campaign is kept'));
  const g2 = ghouls.find((c) => c.info.name === 'Ghoul 2');
  await bR.deleteCampaign(G);
  ok(!(await bR.listCharacters()).some((c) => c.id === g2.id), P('deleting the campaign deletes its mobs'));

  // SAVE / EDIT on an item, an ability, an attack and a custom action
  R.go('characters'); await wait(30); R.click(R.$('newCharBtn')); await waitFor(() => !R.$('screen-sheet').hidden);
  R.tab('items'); R.click(buttons(R, /^ADD ITEM$/)[0]); await wait(20);
  R.setv(R.byLabel('items', 'Item name'), 'Lantern');
  const card = () => R.d.querySelector('#panel-items .item');
  R.click(card().querySelector('.chev'));
  R.click(card().querySelector('[data-lock]')); await wait(20);
  ok(card().querySelector('[data-lock]').textContent === 'EDIT' && R.byLabel('items', 'Item name').disabled && R.byLabel('items', 'Item description').disabled, P('SAVE locks the item\'s fields'));
  ok(!R.byLabel('items', 'Quantity').disabled && !buttons(R, /^\+1$/)[0].disabled && !buttons(R, /^RIGHT HAND$/)[0].disabled, P('quantity and hands stay usable'));
  ok(buttons(R, /^REMOVE$/).filter((b) => card().contains(b)).every((b) => b.disabled), P('a locked item cannot be removed'));
  const me = R.w.location.hash.replace('#character-', '');
  await wait(900);
  ok((await bR.listCharacters()).find((c) => c.id === me).items[0].locked === true, P('the lock is saved'));
  R.click(card().querySelector('[data-lock]')); await wait(20);
  ok(!R.byLabel('items', 'Item name').disabled && card().querySelector('[data-lock]').textContent === 'SAVE', P('EDIT unlocks it'));
  R.tab('abilities');
  R.click(buttons(R, /^ADD ABILITY$/)[0]); await wait(20);
  const ab = R.d.querySelector('#panel-abilities .item'); R.click(ab.querySelector('.chev'));
  R.click(ab.querySelector('[data-lock]')); await wait(20);
  ok(R.byLabel('abilities', 'Ability name').disabled && R.byLabel('abilities', 'Ability description').disabled, P('an ability locks'));
  const atk = R.d.querySelector('#panel-abilities .atk');
  ok(/Cost/.test(atk.querySelector('.atkl').textContent) && /Name/.test(atk.querySelector('.atkl').textContent), P('the attack Name and Cost boxes are labelled'));
  R.click(atk.querySelector('[data-lock]')); await wait(20);
  ok(R.d.querySelector('#panel-abilities .atk [aria-label="Attack name"]').disabled && R.d.querySelector('#panel-abilities .atk [aria-label^="Attack cost"]').disabled, P('an attack locks'));
  R.click(R.$('addCustomAction')); await wait(20);
  R.click(R.d.querySelector('#panel-abilities .custom-action [data-lock]')); await wait(20);
  ok(R.d.querySelector('#panel-abilities [aria-label="Custom action name"]').disabled, P('a custom action locks'));

  // a compendium mob: SAVE MOB locks every tab
  R.go('compendium-' + compId); await waitFor(() => R.$('tab-mobs'), 6000);
  R.tab('mobs'); await wait(30);
  R.click(R.d.querySelector('#panel-mobs [data-mob="ghoul"]'));
  await waitFor(() => R.$('mobLock'), 4000);
  R.click(R.$('mobLock')); await wait(30);
  ok(R.$('mobLock').textContent === 'EDIT MOB' && R.byLabel('info', 'Mob name').disabled && R.byLabel('talents', 'Strength').disabled, P('SAVE MOB locks every tab'));
  R.click(R.$('mobLock')); await wait(30);
  ok(!R.byLabel('info', 'Mob name').disabled && !R.byLabel('talents', 'Strength').disabled, P('EDIT MOB unlocks it'));
  ok(!!R.byLabel('info', 'Random sex choices') && !!R.byLabel('info', 'Talent level floor') && !R.byLabel('info', 'Explode tokens'), P('the mob editor has the new fields and no tokens'));
  R.tab('drops');
  ok(!!R.d.querySelector('#dropList [aria-label="Drop 1 is carried"]') && R.d.querySelector('#dropList [aria-label="Drop 3 equipped"]').disabled, P('drops have Carried and where they are equipped'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
