const { boot, wait, api, checker } = require('./h.js');
const { ok, done } = checker();
(async () => {
  const w = await boot({}); const A = api(w);
  await A.signUp();
  const b = w.BSHBackend.create(w.BSH_CONFIG); await b.init();
  const c = w.BSH.blankCharacter(); c.id = w.crypto.randomUUID(); c.info.name = 'T'; c.items = [{ name: 'Mace', qty: 1, charges: null, desc: '' }];
  await b.saveCharacter(c);
  A.go('characters'); await wait(150); A.go('character-' + c.id); await wait(100); A.tab('items'); await wait(30);
  const card = () => A.d.querySelector('#panel-items .item');
  A.click(card().querySelector('.chev'));
  ok(!card().querySelector('.wpgrid'), 'no weapon fields until Weapon is ticked');
  const wcb = () => card().querySelector('.iflags input[aria-label="Weapon"]');
  wcb().checked = true; wcb().dispatchEvent(new w.Event('change', { bubbles: true })); await wait(30);
  A.click(card().querySelector('.chev')); // keep open
  if (card().querySelector('.idesc').hidden) A.click(card().querySelector('.chev'));
  const labels = [...card().querySelectorAll('.wpgrid .lbl')].map((x) => x.textContent);
  ok(labels.join('|') === 'Type|Size/Style|Weight|Dmg Type|Range|Cost|CR|Attack Dmg|Effect', 'weapon fields match the rulebook list: ' + labels.join('|'));
  const vals = { 'Weapon Type': 'Mace', 'Weapon Size/Style': 'Balanced Melee', 'Weapon Weight': '4', 'Weapon Dmg Type': 'Blunt', 'Weapon Range': '0-1', 'Weapon Cost': '2 AP', 'Weapon CR': '1D4', 'Weapon Attack Dmg': 'BP+1D6', 'Weapon Effect': 'Ignores up to 3 AC' };
  for (const [k, v] of Object.entries(vals)) { const el = card().querySelector(`[aria-label="${k}"]`); ok(!!el, 'field ' + k); if (el) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); } }
  await wait(700);
  const st = (await b.listCharacters()).find((x) => x.id === c.id).items[0];
  ok(st.weapon === true && JSON.stringify(st.weaponProps) === JSON.stringify({ type: 'Mace', size: 'Balanced Melee', weight: '4', damage: 'Blunt', range: '0-1', cost: '2 AP', cr: '1D4', dmg: 'BP+1D6', effect: 'Ignores up to 3 AC' }), 'properties saved: ' + JSON.stringify(st.weaponProps));
  wcb().checked = false; wcb().dispatchEvent(new w.Event('change', { bubbles: true })); await wait(30);
  ok(!card().querySelector('.wpgrid'), 'unticking Weapon hides the fields');
  wcb().checked = true; wcb().dispatchEvent(new w.Event('change', { bubbles: true })); await wait(30);
  if (card().querySelector('.idesc').hidden) A.click(card().querySelector('.chev'));
  ok(card().querySelector('[aria-label="Weapon Type"]').value === 'Mace', 'ticking it again keeps what was typed');
  ok(w.__errors.length === 0, 'no script errors: ' + w.__errors.join('|'));
  done();
})();
