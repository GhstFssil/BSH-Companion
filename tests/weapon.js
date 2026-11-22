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
  const labels = [...card().querySelectorAll('.wprops > .wpgrid > .fld .lbl, .wprops > .wpgrid > .wp-wide .lbl')].map((x) => x.textContent);
  ok(labels.join('|') === 'Type|Size/Style|Weight|CR|Load Cost|Ammo|Effect', 'weapon fields: ' + labels.join('|'));
  ok(card().querySelectorAll('.atk').length === 1 && card().querySelector('[aria-label="Attack name"]').value === 'Mace', 'ticking Weapon gives it one attack named after it');
  const vals = { 'Weapon Type': 'Mace', 'Weapon Size/Style': 'Balanced Melee', 'Weapon Weight': '4', 'Weapon CR': '1D4', 'Weapon Effect': 'Ignores up to 3 AC',
    'Attack cost, for example 2 AP': '2 AP', 'Attack Dmg': 'BP+1D6', 'Attack range': '0-1', 'Attack damage type': 'Blunt' };
  for (const [k, v] of Object.entries(vals)) { const el = card().querySelector(`[aria-label="${k}"]`); ok(!!el, 'field ' + k); if (el) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); } }
  A.click(card().querySelector('[data-add-attack="weapon"]')); await wait(30);
  if (card().querySelector('.idesc').hidden) A.click(card().querySelector('.chev'));
  const n2 = card().querySelectorAll('[aria-label="Attack name"]')[1]; n2.value = 'Bash'; n2.dispatchEvent(new w.Event('input', { bubbles: true }));
  const nl = card().querySelectorAll('[aria-label="Needs the weapon loaded"]')[1]; nl.checked = true; nl.dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(700);
  const st = (await b.listCharacters()).find((x) => x.id === c.id).items[0];
  ok(st.weapon === true && JSON.stringify(st.weaponProps) === JSON.stringify({ type: 'Mace', size: 'Balanced Melee', weight: '4', cr: '1D4', effect: 'Ignores up to 3 AC' }), 'properties saved: ' + JSON.stringify(st.weaponProps));
  ok(JSON.stringify(st.attacks) === JSON.stringify([{ name: 'Mace', cost: '2 AP', dmg: 'BP+1D6', range: '0-1', damage: 'Blunt', effect: '' }, { name: 'Bash', cost: '', dmg: '', range: '', damage: '', effect: '', needsLoad: true }]), 'attacks saved: ' + JSON.stringify(st.attacks));
  ok(typeof st.uid === 'string' && st.uid.length > 8 && st.loaded === false && st.twoHanded === false, 'weapon has an id, not loaded, one-handed');
  wcb().checked = false; wcb().dispatchEvent(new w.Event('change', { bubbles: true })); await wait(30);
  ok(!card().querySelector('.wpgrid'), 'unticking Weapon hides the fields');
  wcb().checked = true; wcb().dispatchEvent(new w.Event('change', { bubbles: true })); await wait(30);
  if (card().querySelector('.idesc').hidden) A.click(card().querySelector('.chev'));
  ok(card().querySelector('[aria-label="Weapon Type"]').value === 'Mace', 'ticking it again keeps what was typed');
  ok(w.__errors.length === 0, 'no script errors: ' + w.__errors.join('|'));
  done();
})();
