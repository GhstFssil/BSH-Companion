const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam:   { name: 'Sam',   username: 'sam_2',   email: 'sam@example.com',   password: 'another pass1' },
  ava:   { name: 'Ava',   username: 'ava_3',   email: 'ava@example.com',   password: 'third pass12' }
};
const it = (name, qty, extra = {}) => Object.assign({ name, qty, charges: null, desc: '' }, extra);

async function scenario(label, makeAs) {
  console.log('--- ' + label);
  const as = await makeAs();
  const P = (m) => `[${label}] ${m}`;
  const R = await as('ricky'), S = await as('sam'), V = await as('ava');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(40); } return false; };
  const rejects = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(150); };
  const btn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  const mk = async (A, G, name, extra = {}) => {
    const b = await raw(A), c = A.w.BSH.blankCharacter();
    c.id = A.w.crypto.randomUUID(); c.info.name = name; c.campaignId = G; Object.assign(c, extra);
    await b.saveCharacter(c); return c;
  };
  const sheet = async (A, c) => { A.go('characters'); await wait(150); A.go('character-' + c.id); await wait(100); A.tab('items'); await wait(30); };
  const cards = (A) => [...A.d.querySelectorAll('#panel-items .item')];
  const cardOf = (A, name) => cards(A).find((c) => c.querySelector('.iline .wrapname').value === name);
  const qtyOf = (A, name) => { const c = cardOf(A, name); return c ? c.querySelector('.iline input.num').value : null; };
  const expand = (c) => { if (c.querySelector('.idesc').hidden) c.querySelector('.chev').dispatchEvent(new (c.ownerDocument.defaultView.MouseEvent)('click', { bubbles: true })); };
  const stored = async (A, c) => (await (await raw(A)).listCharacters()).find((x) => x.id === c.id);

  const bR = await raw(R), bS = await raw(S), bV = await raw(V);
  const G = await bR.createCampaign('Pit of Soup');
  await bS.joinCampaign(G); await bV.joinCampaign(G);
  const alpha = await mk(S, G, 'Alpha', { items: [it('Rope', 3), it('Sword', 1), it('Lamp', null)] });
  const beta = await mk(S, G, 'Beta'), gamma = await mk(V, G, 'Gamma', { items: [it('Rope', 1)] });
  const loner = await mk(S, null, 'Loner', { items: [it('Pebble', 2)] });
  const npc = V.w.BSH.blankCharacter(); npc.id = R.w.crypto.randomUUID(); npc.info.name = 'Goblin';
  await bR.createNpc(G, npc);

  // ---- +1 / -1 ----
  await sheet(S, alpha);
  let rope = cardOf(S, 'Rope'); expand(rope);
  const act = (name, text) => btn(cardOf(S, name).querySelector('.iact'), text);
  S.click(act('Rope', '+1')); ok(qtyOf(S, 'Rope') === '4', P('+1 raises Rope 3 to 4'));
  S.click(act('Rope', '-1')); S.click(act('Rope', '-1')); ok(qtyOf(S, 'Rope') === '2', P('-1 twice gives 2'));
  expand(cardOf(S, 'Lamp')); S.click(act('Lamp', '+1')); ok(qtyOf(S, 'Lamp') === '2', P('a blank quantity counts as 1, so +1 gives 2'));
  expand(cardOf(S, 'Sword')); S.click(act('Sword', '-1')); S.click(act('Sword', '-1')); ok(qtyOf(S, 'Sword') === '0', P('-1 stops at 0 (never negative)'));
  S.click(act('Sword', '+1')); S.click(act('Rope', '+1')); S.click(act('Rope', '+1')); // Rope 4, Sword 1
  await wait(700);
  ok(JSON.stringify((await stored(S, alpha)).items.map((x) => [x.name, x.qty])) === '[["Rope",4],["Sword",1],["Lamp",2]]', P('quantities are saved'));

  // ---- hands ----
  const hands = () => S.$('handsLine').textContent;
  ok(/Left hand: empty.*Right hand: empty/.test(hands()), P('both hands start empty'));
  expand(cardOf(S, 'Rope')); expand(cardOf(S, 'Sword'));
  S.click(act('Rope', 'LEFT HAND'));
  ok(/Left hand: Rope.*Right hand: empty/.test(hands()) && cardOf(S, 'Rope').querySelector('.htag').textContent === 'L', P('Rope in the left hand: summary + L marker'));
  expand(cardOf(S, 'Rope'));
  ok(act('Rope', 'LEFT HAND').getAttribute('aria-pressed') === 'true' && cardOf(S, 'Rope').classList.contains('held'), P('the button shows pressed and the card is highlighted'));
  expand(cardOf(S, 'Sword')); S.click(act('Sword', 'LEFT HAND'));
  ok(/Left hand: Sword/.test(hands()) && cardOf(S, 'Rope').querySelector('.htag').textContent === '', P('a hand holds one thing: Sword takes the left hand from Rope'));
  expand(cardOf(S, 'Sword')); S.click(act('Sword', 'RIGHT HAND'));
  ok(cardOf(S, 'Sword').querySelector('.htag').textContent === 'LR' && /Right hand: Sword/.test(hands()), P('one item can be in both hands (LR)'));
  await wait(700);
  const st = await stored(S, alpha);
  ok(st.items[1].eqL === true && st.items[1].eqR === true && !st.items[0].eqL, P('equipment is saved'));
  expand(cardOf(S, 'Sword')); S.click(act('Sword', 'LEFT HAND'));
  ok(/Left hand: empty.*Right hand: Sword/.test(hands()), P('pressing again takes it out of that hand'));
  expand(cardOf(S, 'Sword')); S.click(act('Sword', 'RIGHT HAND'));
  ok(/Left hand: empty.*Right hand: empty/.test(hands()), P('and out of the other'));

  // ---- character -> character ----
  expand(cardOf(S, 'Rope'));
  const form = () => cardOf(S, 'Rope').querySelector('.igive');
  ok(form().hidden, P('the give form starts closed'));
  S.click(act('Rope', 'GIVE'));
  ok(!form().hidden && await waitFor(() => form().querySelectorAll('option').length > 1), P('GIVE opens a list of characters'));
  const opts = [...form().querySelectorAll('option')].map((o) => o.textContent);
  ok(opts.join('|') === 'Give to...|Beta (yours)|Gamma (ava_3)', P('lists the other characters in the campaign, not itself and not NPCs: ' + opts));
  const send = () => btn(form(), 'SEND');
  S.click(send()); ok(/Choose who/.test(form().querySelector('.lbl').textContent), P('must choose a recipient'));
  const sel = () => form().querySelector('select'), q = () => form().querySelector('input');
  const gammaOpt = [...form().querySelectorAll('option')].find((o) => /Gamma/.test(o.textContent)).value;
  S.setv(sel(), gammaOpt); S.setv(q(), '9'); S.click(send());
  ok(/only have 4/.test(form().querySelector('.lbl').textContent) && qtyOf(S, 'Rope') === '4', P('cannot give more than you have'));
  S.setv(q(), '0'); S.click(send()); ok(/at least 1/.test(form().querySelector('.lbl').textContent), P('quantity must be at least 1'));
  S.setv(q(), '3'); S.click(send());
  ok(await waitFor(() => qtyOf(S, 'Rope') === '1'), P('giving 3 of 4 leaves 1'));
  ok(/Gave 3 Rope to Gamma\./.test(S.$('panel-items').textContent), P('the sheet confirms: Gave 3 Rope to Gamma.'));
  // Ava picks it up
  await kick(V);
  ok(await until(async () => { const g = await stored(V, gamma); return g.items.find((x) => x.name === 'Rope').qty === 4; }), P('Gamma\'s Rope stack grew from 1 to 4 (same name stacks)'));
  ok(!V.$('toast').hidden && /3 Rope from Alpha/.test(V.$('toast').textContent), P('Ava gets a message: ' + V.$('toast').textContent));
  ok((await (await raw(V)).pendingGifts()).length === 0, P('the gift is confirmed and gone from the queue'));
  await kick(V);
  ok((await stored(V, gamma)).items.find((x) => x.name === 'Rope').qty === 4, P('picking up again does not add it twice'));
  // give everything left
  expand(cardOf(S, 'Rope')); S.click(act('Rope', 'GIVE'));
  await waitFor(() => form().querySelectorAll('option').length > 1);
  S.setv(sel(), [...form().querySelectorAll('option')].find((o) => /Beta/.test(o.textContent)).value); S.setv(q(), '1'); S.click(send());
  ok(await waitFor(() => !cardOf(S, 'Rope')), P('giving the last one removes the item from the giver'));
  await kick(S);
  ok(await until(async () => (await stored(S, beta)).items.some((x) => x.name === 'Rope' && x.qty === 1)), P('Sam\'s other character Beta receives it (to your own characters too)'));
  ok(/Left hand: empty/.test(hands()), P('hands unaffected'));

  // ---- open sheet receives gifts in place ----
  await sheet(V, gamma);
  await bS.giveItem(alpha.id, gamma.id, { name: 'Sword', qty: 1, charges: 2, desc: 'sharp', magic: true, magicProps: { maxCharges: 5 } });
  await kick(V);
  ok(await waitFor(() => cardOf(V, 'Sword')), P('a gift shows up on an open sheet'));
  expand(cardOf(V, 'Sword'));
  ok(cardOf(V, 'Sword').querySelector('textarea[aria-label="Item description"]').value === 'sharp' && cardOf(V, 'Sword').querySelectorAll('.iline input.num')[1].value === '2', P('with its charges and description'));
  await wait(700);
  ok((await stored(V, gamma)).items.some((x) => x.name === 'Sword'), P('and is saved'));
  ok(await rejects(bS.giveItem(alpha.id, gamma.id, { name: 'Sword', qty: 1 }), /./) === false, P('(Alpha has Sword, so the API itself allowed it)'));

  // ---- not linked ----
  await sheet(S, loner);
  expand(cardOf(S, 'Pebble')); S.click(act('Pebble', 'GIVE'));
  ok(/Link this character to a campaign/.test(cardOf(S, 'Pebble').querySelector('.igive').textContent), P('an unlinked character is told to join a campaign first'));

  // ---- QM gives items ----
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(250);
  ok(!R.$('giveHead').hidden && !!R.$('giveTo'), P('QM sees the Give an item form'));
  const names = [...R.$('giveTo').querySelectorAll('option')].map((o) => o.textContent);
  ok(names.join('|') === 'Give to...|Alpha (sam_2)|Beta (sam_2)|Gamma (ava_3)|Goblin (NPC)', P('QM can pick any character, NPCs included: ' + names));
  const val = (n) => [...R.$('giveTo').querySelectorAll('option')].find((o) => o.textContent.startsWith(n)).value;
  R.click(R.$('giveBtn')); ok(/Choose who/.test(R.$('giveMsg').textContent), P('QM must choose who'));
  R.setv(R.$('giveTo'), val('Beta')); R.click(R.$('giveBtn')); ok(/name/.test(R.$('giveMsg').textContent), P('and name the item'));
  R.setv(R.$('giveName'), 'Healing Potion'); R.setv(R.$('giveQty'), '0'); R.click(R.$('giveBtn')); ok(/at least 1/.test(R.$('giveMsg').textContent), P('quantity at least 1'));
  R.setv(R.$('giveQty'), '2'); R.click(R.d.querySelectorAll('#giveBox .iflags input')[2]); R.setv(R.$('giveMmaxCharges'), '3'); R.setv(R.$('giveDesc'), 'Heals a bit');
  R.click(R.$('giveBtn'));
  ok(await waitFor(() => /Gave 2 Healing Potion to Beta\./.test(R.$('giveMsg').textContent)), P('QM gets a confirmation'));
  ok(R.$('giveName').value === '' && R.$('giveQty').value === '1' && R.$('giveTo').value === val('Beta'), P('form clears but keeps the recipient for the next item'));
  await kick(S);
  ok(await until(async () => { const b = await stored(S, beta); const p = b.items.find((x) => x.name === 'Healing Potion'); return p && p.qty === 2 && p.charges === 3 && p.desc === 'Heals a bit'; }), P('Beta received 2 Healing Potion with charges and description'));
  ok(/from The QM/.test(S.$('toast').textContent), P('Sam is told it came from The QM: ' + S.$('toast').textContent));
  R.setv(R.$('giveTo'), val('Goblin')); R.setv(R.$('giveName'), 'Club'); R.click(R.$('giveBtn'));
  await waitFor(() => /Gave 1 Club to Goblin/.test(R.$('giveMsg').textContent));
  await kick(R);
  ok(await until(async () => (await stored(R, npc)).items.some((x) => x.name === 'Club')), P('an NPC gets its item through the QM'));
  S.go('home'); await wait(30); S.go('campaign-' + G); await wait(200);
  ok(S.$('giveHead').hidden && S.$('giveBox').children.length === 0, P('players do not see the QM form'));


  // ---- body slot + item types ----
  await sheet(S, alpha);
  const flag = (name, label) => cardOf(S, name).querySelector(`.iflags input[aria-label="${label}"]`);
  const toggle = (name, label) => { const c = flag(name, label); c.checked = !c.checked; c.dispatchEvent(new S.w.Event('change', { bubbles: true })); };
  const body = (name) => btn(cardOf(S, name).querySelector('.iact'), 'BODY');
  expand(cardOf(S, 'Sword'));
  ok(!!flag('Sword', 'Wearable') && !!flag('Sword', 'Weapon') && !!flag('Sword', 'Magic') && !flag('Sword', 'Wearable').checked, P('each item has Wearable, Weapon and Magic checkboxes (off by default)'));
  ok(!body('Sword'), P('no BODY button until the item is Wearable'));
  toggle('Sword', 'Wearable'); expand(cardOf(S, 'Sword'));
  ok(!!body('Sword'), P('ticking Wearable shows BODY'));
  toggle('Lamp', 'Wearable'); expand(cardOf(S, 'Lamp'));
  S.click(body('Sword')); expand(cardOf(S, 'Lamp')); expand(cardOf(S, 'Sword'));
  S.click(body('Lamp'));
  ok(/Body: Sword, Lamp/.test(hands()) && cardOf(S, 'Sword').querySelector('.htag').textContent === 'B', P('any number of things on the body: ' + hands()));
  expand(cardOf(S, 'Sword')); S.click(act('Sword', 'LEFT HAND'));
  ok(/Left hand: Sword/.test(hands()) && /Body: Lamp\b/.test(hands()) && cardOf(S, 'Sword').querySelector('.htag').textContent === 'L', P('putting it in a hand takes it off the body'));
  expand(cardOf(S, 'Sword')); S.click(body('Sword'));
  ok(/Left hand: empty/.test(hands()) && /Body: Sword, Lamp/.test(hands()), P('and body takes it out of the hand'));
  expand(cardOf(S, 'Sword')); toggle('Sword', 'Wearable');
  ok(!/Body: .*Sword/.test(hands()), P('un-ticking Wearable takes it off the body'));
  toggle('Sword', 'Weapon'); toggle('Sword', 'Magic');
  await wait(700);
  const sr = (await stored(S, alpha)).items.find((x) => x.name === 'Sword');
  ok(sr.weapon === true && sr.magic === true && sr.wearable === false, P('item types are saved'));
  const lampS = (await stored(S, alpha)).items.find((x) => x.name === 'Lamp');
  ok(lampS.wearable === true && lampS.eqB === true, P('body equipment is saved'));
  // types travel with gifts
  expand(cardOf(S, 'Sword')); S.click(act('Sword', 'GIVE'));
  await until(() => cardOf(S, 'Sword').querySelectorAll('.igive option').length > 1);
  const gf = cardOf(S, 'Sword').querySelector('.igive');
  S.setv(gf.querySelector('select'), [...gf.querySelectorAll('option')].find((o) => /Beta/.test(o.textContent)).value); S.setv(gf.querySelector('input'), '1'); S.click(btn(gf, 'SEND'));
  await until(() => qtyOf(S, 'Sword') !== '1' && true, 300);
  await kick(S);
  ok(await until(async () => { const r = (await stored(S, beta)).items.find((x) => x.name === 'Sword'); return r && r.weapon === true && r.magic === true && r.wearable === false; }), P('flags arrive with a given item'));
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(250);
  R.setv(R.$('giveTo'), val('Beta')); R.setv(R.$('giveName'), 'Plate Mail');
  for (const l of ['Wearable', 'Magic']) { R.$('give' + l).checked = true; }
  R.click(R.$('giveBtn')); await wait(200); await kick(S);
  ok(await until(async () => { const r = (await stored(S, beta)).items.find((x) => x.name === 'Plate Mail'); return r && r.wearable === true && r.magic === true && r.weapon === false; }), P('the QM form can mark a gift Wearable/Weapon/Magic'));
  ok(!R.$('giveWearable').checked && !R.$('giveMagic').checked, P('and the boxes clear after giving'));

  // weapon properties travel with gifts (QM form shows the fields only when Weapon is ticked)
  R.go('home'); await wait(30); R.go('campaign-' + G); await wait(250);
  ok(R.$('giveWtype').closest('.wpgrid').hidden, P('QM form: weapon fields start hidden'));
  R.$('giveWeapon').checked = true; R.$('giveWeapon').dispatchEvent(new R.w.Event('change', { bubbles: true }));
  ok(!R.$('giveWtype').closest('.wpgrid').hidden, P('QM form: ticking Weapon shows them'));
  R.setv(R.$('giveTo'), val('Beta')); R.setv(R.$('giveName'), 'Mace');
  R.setv(R.$('giveWtype'), 'Mace'); R.setv(R.$('giveWdmg'), 'BP+1D6'); R.setv(R.$('giveWeffect'), 'Ignores up to 3 AC');
  R.click(R.$('giveBtn')); await wait(200); await kick(S);
  ok(await until(async () => { const r = (await stored(S, beta)).items.find((x) => x.name === 'Mace'); return r && r.weapon === true && r.weaponProps.type === 'Mace' && r.attacks[0].dmg === 'BP+1D6' && r.attacks[0].name === 'Mace' && r.weaponProps.effect === 'Ignores up to 3 AC' && r.attacks[0].range === '' && !('dmg' in r.weaponProps); }), P('weapon properties arrive with a QM gift'));
  ok(R.$('giveWtype').value === '' && R.$('giveWtype').closest('.wpgrid').hidden, P('and the weapon fields clear and hide after giving'));
  await bS.giveItem(beta.id, alpha.id, { name: 'Mace', qty: 1, weapon: true, weaponProps: { type: 'Mace', cr: '1D4' } });
  await sheet(S, alpha); await kick(S);
  ok(await until(async () => { const r = (await stored(S, alpha)).items.find((x) => x.name === 'Mace'); return r && r.weaponProps.cr === '1D4'; }), P('weapon properties also travel between characters'));

  // buffs travel with gifts and are cleaned on arrival
  await bR.giveItem(null, beta.id, { name: 'Ring', qty: 1, buffs: [{ kind: 'talent', idx: 1, amt: 2, hold: false, wear: true }, { kind: 'bogus', idx: 0, amt: 1 }] });
  await kick(S);
  ok(await until(async () => { const r = (await stored(S, beta)).items.find((x) => x.name === 'Ring'); return r && r.buffs.length === 1 && r.buffs[0].kind === 'talent' && r.buffs[0].amt === 2 && r.buffs[0].wear === true; }), P('item buffs arrive with a gift (invalid ones dropped)'));

  // ---- the rules (API level) ----
  ok(await rejects(bS.giveItem(null, gamma.id, { name: 'Gold', qty: 5 }), /Only a QM/), P('API: a player cannot create items from nowhere'));
  ok(await rejects(bS.giveItem(alpha.id, npc.id, { name: 'Rope', qty: 1 }), /not in your campaign|NPC/), P('API: a player cannot give to a hidden NPC'));
  ok(await rejects(bS.giveItem(gamma.id, alpha.id, { name: 'Rope', qty: 1 }), /own characters/), P('API: cannot give from someone else\'s character'));
  ok(await rejects(bS.giveItem(alpha.id, loner.id, { name: 'Rope', qty: 1 }), /same campaign|not in your campaign/), P('API: cannot give to a character outside the campaign'));
  ok(await rejects(bS.giveItem(alpha.id, alpha.id, { name: 'Rope', qty: 1 }), /different/), P('API: cannot give to itself'));
  ok(await rejects(bS.giveItem(alpha.id, beta.id, { name: 'Rope', qty: 1.5 }), /quantity/), P('API: whole quantities only'));
  ok(await rejects(bS.giveItem(alpha.id, beta.id, { name: '  ', qty: 1 }), /name/), P('API: needs a name'));
  ok((await bS.pendingGifts()).every((g) => g.characterId !== gamma.id), P('API: Sam cannot see Ava\'s gifts'));
  ok((await bR.pendingGifts()).length === 0, P('API: nothing left waiting for the QM'));
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
