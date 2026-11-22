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
  const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(200); };
  const SD = R.w.BSH_SPAWN_DATA;
  ok(SD.abilities.length === 20 && SD.styles.length === 8 && SD.weapons.length === 12 && SD.weapons.every((w) => w.type && w.cost && w.dmg), P('spawn data: 20 abilities, 8 fighting styles, 12 weapons (matches the database dice)'));
  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G); await bV.joinCampaign(G);
  const byUser = { ricky_1: R, sam_2: S, ava_3: V };
  const btn = (A, t, root) => [...(root || A.d).querySelectorAll('button')].find((b) => b.textContent === t);
  const spawnOf = async () => (await bR.listCampaigns()).find((g) => g.id === G).spawn;
  const hash = (A) => A.w.location.hash;
  // an old, dead character for Sam (incarnation 2)
  const dead = S.w.BSH.blankCharacter(); dead.id = S.w.crypto.randomUUID(); dead.info.name = 'Old Sam'; dead.info.alive = false; dead.info.incarnation = 2; dead.campaignId = G; await bS.saveCharacter(dead);
  const live = S.w.BSH.blankCharacter(); live.id = S.w.crypto.randomUUID(); live.info.name = 'Live Sam'; live.campaignId = G; await bS.saveCharacter(live);
  for (const A of [R, S, V]) A.go('campaign-' + G);
  ok(await until(() => !!R.$('spawnBtn')), P('QM sees SPAWN CHARACTER'));
  ok(!S.$('spawnBtn') && !V.$('spawnBtn'), P('players do not'));
  R.click(R.$('spawnBtn'));
  const boxes = [...R.d.querySelectorAll('input[data-spawn-for]')];
  ok(R.d.body.textContent.includes('Who is this character for?') && boxes.length === 3, P('"Who is this character for?" lists every member with a checkbox'));
  ok(R.d.querySelector('#spawnBox').textContent.includes('sam_2') && R.d.querySelector('#spawnBox').textContent.includes('ricky_1 (QM)'), P('by username'));
  const samBox = boxes.find((b) => b.getAttribute('aria-label') === 'sam_2'); samBox.checked = true; samBox.dispatchEvent(new R.w.Event('input', { bubbles: true }));
  R.click(R.$('spawnStart'));
  ok(await until(async () => !!(await spawnOf())), P('spawn started'));
  for (const A of [R, S, V]) await kick(A);
  ok(await until(() => [R, S, V].every((A) => /^#spawn-/.test(hash(A)) && A.vis().join() === 'spawn')), P('everyone is taken to the spawn page'));
  let sp = await spawnOf();
  const order = [...R.d.querySelectorAll('#spawnOrder .member')].map((r) => r.querySelector('.ename').textContent);
  ok(order.length === 2 && order.includes('sam_2') && order.includes('ava_3') && !order.includes('ricky_1'), P('order shows the non-QM players by username: ' + order.join()));
  const turnName = (A) => (A.d.querySelector('#spawnOrder .cchar.turn .ename') || {}).textContent;
  ok(await until(() => !!turnName(R)), P('current turn marked'));
  ok(!!R.$('spawnSheetBtn') && !!S.$('spawnSheetBtn'), P('View Character Sheet button for everyone'));
  // ---- text step ----
  const t0 = turnName(R), A0 = byUser[t0], other0 = byUser[t0 === 'sam_2' ? 'ava_3' : 'sam_2'];
  ok(!!A0.$('spawnText') && A0.d.body.textContent.includes('Give a physical description of this character in 1-3 sentences'), P('the first player is asked for the physical description'));
  ok(!other0.$('spawnText') && /Waiting for .* to describe/.test(other0.$('spawnWait').textContent) && !R.$('spawnText'), P('everyone else just waits'));
  A0.setv(A0.$('spawnText'), 'A gaunt figure with ash-grey skin.'); A0.click(A0.$('spawnSubmit'));
  ok(await until(async () => (await spawnOf()).step === 'ability'), P('description handed in'));
  for (const A of [R, S, V]) await kick(A);
  // ---- ability choice ----
  const turn1 = async () => { let n; await until(() => (n = turnName(R))); return byUser[n]; };
  const choice = async (stepName, count) => {
    await until(async () => (await spawnOf()).step === stepName);
    for (const A of [R, S, V]) await kick(A);
    const A = await turn1();
    ok(await until(() => A.d.querySelectorAll('[data-choice]').length === 2), P(stepName + ': two options shown to the player whose turn it is'));
    const spx = await spawnOf(), txt = A.d.querySelector('[data-choice="1"]').textContent;
    ok(spx.options[0] !== spx.options[1] && spx.options.every((i) => i < count), P(stepName + ': two different rows'));
    A.click(A.d.querySelector('[data-choice="1"]'));
    ok(await until(async () => (await spawnOf()).data[stepName] === spx.options[1]), P(stepName + ': the picked row is stored'));
    return txt;
  };
  const abilityText = await choice('ability', 20);
  const styleText = await choice('style', 8);
  const weaponText = await choice('weapon', 12);
  ok(/Pike|Dagger|sword|Mace|Spear|bow|hammer|Glaive|Crossbow/i.test(weaponText) && /Cost/.test(weaponText), P('weapon option shows its stats: ' + weaponText.slice(0, 60)));
  // ---- view the sheet so far ----
  await until(async () => (await spawnOf()).step === 'backstory');
  for (const A of [R, S, V]) await kick(A);
  R.click(R.$('spawnSheetBtn'));
  ok(await until(() => R.vis().join() === 'sheet' && /^#spawnsheet-/.test(hash(R))), P('View Character Sheet opens the draft sheet'));
  R.tab('abilities');
  ok(await until(() => R.d.querySelectorAll('#panel-abilities .item:not(.custom-action) > .iline').length === 2), P('draft has the ability and fighting style'));
  R.tab('story');
  ok(R.d.querySelector('#panel-story textarea').value === 'A gaunt figure with ash-grey skin.', P('draft has the description'));
  ok(R.d.querySelector('#screen-sheet .corner').dataset.go === 'spawn-' + G, P('BACK returns to the spawn page'));
  R.click(R.d.querySelector('#screen-sheet .corner'));
  ok(await until(() => R.vis().join() === 'spawn'), P('back on the spawn page'));
  // ---- veto ----
  ok(!!btn(R, 'SEND BACK ONE STEP') && !btn(S, 'SEND BACK ONE STEP'), P('only the QM can send a step back'));
  R.click(btn(R, 'SEND BACK ONE STEP'));
  ok(await until(async () => (await spawnOf()).step === 'weapon' && (await spawnOf()).data.weapon === undefined), P('QM veto sends the weapon step back with new options'));
  for (const A of [R, S, V]) await kick(A);
  await choice('weapon', 12);
  // ---- backstory, motivation ----
  for (const [step, text, prompt] of [['backstory', 'Raised by crows.', 'backstory'], ['motivation', 'To find the drowned bell.', 'motivation']]) {
    await until(async () => (await spawnOf()).step === step);
    for (const A of [R, S, V]) await kick(A);
    const A = await turn1();
    ok(await until(() => !!A.$('spawnText') && A.d.body.textContent.includes(prompt)), P(step + ': asked for it'));
    A.setv(A.$('spawnText'), text); A.click(A.$('spawnSubmit'));
    ok(await until(async () => (await spawnOf()).data[step] === text), P(step + ': stored'));
  }
  // ---- points, all at once ----
  await until(async () => (await spawnOf()).step === 'points');
  for (const A of [R, S, V]) await kick(A);
  ok(await until(() => !!S.$('spawnPoints') && !!V.$('spawnPoints')) && !R.$('spawnPoints'), P('both players get the points form at once; the QM does not'));
  ok(S.d.querySelectorAll('.spawn-round').length === 4 && S.$('spawnPoints').disabled, P('four sets; DONE disabled until everything is chosen'));
  const fill = (A, up, down, prof) => { for (let r = 0; r < 4; r++) for (const [k, v] of [['up', up], ['down', down], ['prof', prof]]) { const sel = A.d.querySelector(`[data-pt="${r}:${k}"]`); sel.value = String(v); sel.dispatchEvent(new A.w.Event('change', { bubbles: true })); } };
  fill(S, 0, 0, 3);
  ok(S.$('spawnPoints').disabled && /different talents/.test(S.d.querySelector('#spawnBody').textContent), P('same talent twice is refused'));
  fill(S, 0, 1, 3); ok(!S.$('spawnPoints').disabled, P('valid picks enable DONE'));
  S.click(S.$('spawnPoints'));
  ok(await until(async () => !!(await spawnOf()).points.sam_2 || Object.keys((await spawnOf()).points || {}).length === 1), P('Sam\'s points are in'));
  fill(V, 2, 3, 4); V.click(V.$('spawnPoints'));
  // ---- assignment: Sam is the only checked player; he owns a dead character, so he is asked for an incarnation ----
  ok(await until(() => !!S.d.querySelector('[data-prev]'), 8000), P('Sam is asked to pick a previous incarnation'));
  const prevBtns = [...S.d.querySelectorAll('[data-prev]')];
  ok(prevBtns.length === 2 && prevBtns.some((b) => b.textContent.includes('Old Sam') && b.textContent.includes('Incarnation 2')) && !S.$('spawnBody').textContent.includes('Live Sam'), P('only the fallen character (and NONE OF THEM) are offered'));
  ok(!V.d.querySelector('[data-prev]') && /goes to sam_2/.test(V.$('spawnWait').textContent), P('the others see who it went to'));
  S.click(S.d.querySelector('[data-prev="' + dead.id + '"]'));
  // ---- built, saved and the spawn ends ----
  ok(await until(async () => !(await spawnOf()), 8000), P('the spawn ends once the character is saved'));
  const mine = await bS.listCharacters();
  const nc = mine.find((c) => c.id !== dead.id && c.id !== live.id);
  ok(!!nc && nc.campaignId === G, P('the new character is Sam\'s and linked to the campaign'));
  ok(nc.info.incarnation === 3 && nc.info.alive !== false, P('Incarnation = previous character\'s + 1: ' + nc.info.incarnation));
  ok(nc.appearance === 'A gaunt figure with ash-grey skin.' && nc.backstory === 'Raised by crows.' && nc.motivation === 'To find the drowned bell.', P('appearance, backstory and motivation are on the sheet'));
  ok(nc.abilities.length === 2 && nc.abilities[1].name.startsWith('Fighting Style: '), P('ability and fighting style added'));
  ok(nc.items.length === 1 && nc.items[0].weapon === true && !!nc.items[0].weaponProps.type && nc.items[0].qty === 1, P('weapon added as an item: ' + nc.items[0].name));
  ok(nc.talents[0] === 18 && nc.talents[1] === 6 && nc.talents[2] === 18 && nc.talents[3] === 6 && nc.talents[4] === 10, P('talents: +2 x4 and -1 x4 for both players: ' + nc.talents.join()));
  ok(nc.prof[3] === 4 && nc.prof[4] === 4, P('proficiency +1 x4 each'));
  ok(!S.$('describeModal').hidden && !V.$('describeModal').hidden === false, P('the new owner (only) gets the describe card'));
  const dIn = (lab) => S.$('describeBody').querySelector('[aria-label="' + lab + '"]');
  ok(['Name', 'Species', 'Sex', 'Age', 'Height', 'Weight', 'Money'].every((l) => !!dIn(l)), P('card asks for name, species, sex, age, height, weight and money'));
  [['Name', 'Corvin'], ['Species', 'Crowkin'], ['Sex', 'Male'], ['Age', '31'], ['Height', '5 ft 9'], ['Weight', '140'], ['Money', '12 gp']].forEach(([l, v]) => { dIn(l).value = v; });
  S.click(S.$('describeSave'));
  ok(await until(async () => { const c = (await bS.listCharacters()).find((x) => x.id === nc.id); return c && c.info.name === 'Corvin' && c.info.species === 'Crowkin' && c.info.sex === 'Male' && c.info.age === '31' && c.info.height === '5 ft 9' && c.info.weight === 140 && c.info.money === '12 gp'; }, 6000), P('details saved to the character'));
  ok(S.$('describeModal').hidden, P('card closes'));
  for (const A of [R, S, V]) await kick(A);
  ok(await until(() => [R, S, V].every((A) => A.vis().join() === 'campaign')), P('everyone returns to the campaign page'));
  // ---- nobody ticked: an NPC ----
  R.click(R.$('spawnBtn')); R.click(R.$('spawnStart'));
  ok(await until(async () => !!(await spawnOf())), P('second spawn (no boxes ticked)'));
  for (const A of [R, S, V]) await kick(A);
  ok(await until(() => [R, S, V].every((A) => A.vis().join() === 'spawn')), P('everyone taken to the page again (a new spawn)'));
  for (let i = 0; i < 6; i++) {
    const before = (await spawnOf()).pos; await until(() => !!turnName(R)); const A = byUser[turnName(R)];
    if (A.d.querySelector('[data-choice]')) A.click(A.d.querySelector('[data-choice="0"]')); else { A.setv(A.$('spawnText'), 'text ' + i); A.click(A.$('spawnSubmit')); }
    await until(async () => (await spawnOf()).pos > before); for (const X of [R, S, V]) await kick(X);
  }
  await until(() => !!S.$('spawnPoints') && !!V.$('spawnPoints'));
  fill(S, 5, 6, 7); S.click(S.$('spawnPoints')); fill(V, 5, 6, 7); V.click(V.$('spawnPoints'));
  ok(await until(async () => !(await spawnOf()), 8000), P('NPC spawn ends'));
  const npcs = (await bR.listCampaignCharacters(G)).filter((r) => r.ch.isNpc);
  ok(npcs.length === 1 && npcs[0].ch.talents[5] === 26 && npcs[0].ch.items.length === 1 && !npcs[0].ch.npcVisible, P('it became an NPC owned by the QM, hidden by default'));
  // ---- cancel ----
  await bR.startSpawn(G, []); for (const A of [R, S, V]) await kick(A);
  ok(await until(() => [R, S, V].every((A) => A.vis().join() === 'spawn')), P('third spawn'));
  ok(!btn(S, 'CANCEL SPAWN') && !!btn(R, 'CANCEL SPAWN'), P('only the QM can cancel'));
  R.click(btn(R, 'CANCEL SPAWN')); R.click(btn(R, 'TAP AGAIN TO CANCEL'));
  ok(await until(async () => !(await spawnOf())), P('cancelled'));
  for (const A of [R, S, V]) await kick(A);
  ok(await until(() => [R, S, V].every((A) => A.vis().join() === 'campaign')), P('everyone back on the campaign page'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const m = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  m.close(); done();
})();
