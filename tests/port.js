const { boot, wait, waitFor, api, checker } = require('./h.js');
const { ok, done } = checker();
(async () => {
  const A = api(await boot());
  await A.signUp();
  let blob = null;
  A.w.URL.createObjectURL = (b) => { blob = b; return 'blob:test'; }; A.w.URL.revokeObjectURL = () => {};
  const readBlob = (b) => new Promise((res) => { const r = new A.w.FileReader(); r.onload = () => res(r.result); r.readAsText(b); });
  const chosen = (text, name) => { const f = new A.w.File([text], name || 's.json', { type: 'application/json' }); Object.defineProperty(A.$('importFile'), 'files', { value: [f], configurable: true }); A.$('importFile').dispatchEvent(new A.w.Event('change', { bubbles: true })); };
  A.go('characters'); await wait();
  ok(!A.$('importCharBtn').hidden, 'IMPORT CHARACTER button on the list');
  A.click(A.$('newCharBtn')); await wait(100);
  ok(A.vis().join() === 'sheet' && A.w.BSH.blankCharacter().info.incarnation === 1, 'new sheet; incarnation defaults to 1');
  const set = (aria, v) => { const e = A.d.querySelector('[aria-label="' + aria + '"]'); A.setv(e, v); e.dispatchEvent(new A.w.Event('input', { bubbles: true })); };
  set('Name', 'Dwight'); set('Species', 'Goblin'); set('Money', '12 gp');
  await wait(50);
  A.click(A.$('exportBtn')); await wait(50);
  ok(!!blob, 'EXPORT SHEET makes a file');
  const text = await readBlob(blob), data = JSON.parse(text);
  ok(data.format === 'bloodsoup-hell-character' && data.character.info.name === 'Dwight' && !('id' in data.character) && !('campaignId' in data.character), 'file holds the sheet without id or campaign');
  A.go('characters'); await wait();
  const n0 = A.d.querySelectorAll('#charList .char-btn').length;
  chosen(text); await waitFor(() => A.vis().join() === 'sheet');
  ok(A.vis().join() === 'sheet' && A.$('sheetTitle').textContent === 'Dwight', 'import opens the new sheet: ' + A.$('sheetTitle').textContent);
  A.go('characters'); await wait(100);
  ok(A.d.querySelectorAll('#charList .char-btn').length === n0 + 1, 'import adds a character (a copy, new id)');
  // bad files
  const bad = async (t, re, label) => { chosen(t); await wait(150); ok(A.vis().join() === 'characters' && re.test(A.$('listMsg').textContent), label + ': ' + A.$('listMsg').textContent); };
  await bad('not json', /not a character sheet/, 'rejects garbage');
  await bad(JSON.stringify({ hello: 1 }), /not a character sheet from this app/, 'rejects other json');
  await bad(JSON.stringify({ format: 'bloodsoup-hell-character', version: 9, character: {} }), /newer version/, 'rejects a newer format');
  // hostile content is cleaned
  const evil = { format: 'bloodsoup-hell-character', version: 1, character: { id: 'x', campaignId: 'c1', isNpc: true, owner: 'z',
    info: { name: 'X'.repeat(500), weight: 'abc', explodeTokens: 99, alive: false, incarnation: '', __proto__x: 1 }, talents: [1, 'q', { a: 1 }], items: [{ name: 'Axe', qty: 'x', weapon: true, eqL: true, eqB: true, weaponProps: { dmg: 'BP', bogus: 'y' }, buffs: [{ kind: 'talent', idx: 99, amt: 1 }, { kind: 'skill', idx: 3, amt: 2 }] }, 5, null],
    abilities: [{ name: 'Lucky', desc: 'd', evil: 1 }, 'x'], tokenImage: 'javascript:alert(1)', backstory: 'b'.repeat(20000) } };
  chosen(JSON.stringify(evil)); await waitFor(() => A.vis().join() === 'sheet');
  A.go('characters'); await wait(100);
  let stored;
  for (let i = 0; i < 40 && !stored; i++) {
    for (let k = 0; k < A.w.localStorage.length; k++) { try { const v = JSON.parse(A.w.localStorage.getItem(A.w.localStorage.key(k))); if (Array.isArray(v)) { const f = v.find((c) => c && c.info && String(c.info.name).startsWith('XXXX')); if (f) stored = f; } } catch (er) { /* not json */ } }
    if (!stored) await wait(100);
  }
  ok(!!stored && stored.info.name.length === 60 && stored.info.weight === null && stored.info.explodeTokens === 10 && stored.info.incarnation === 1 && stored.info.alive === false, 'info cleaned');
  ok(!stored.isNpc && !stored.campaignId && stored.id !== 'x', 'identity fields are ignored');
  ok(stored.talents.length === 9 && stored.talents[0] === 1 && stored.talents.slice(1).every((v) => typeof v === 'number'), 'talents kept to 9 numbers');
  ok(stored.items.length === 1 && stored.items[0].qty === 1 && stored.items[0].eqB === true && !stored.items[0].eqL && !('bogus' in stored.items[0].weaponProps) && stored.items[0].buffs.length === 1, 'items cleaned: ' + JSON.stringify(stored.items[0]).slice(0, 160));
  ok(stored.abilities.length === 1 && !('evil' in stored.abilities[0]) && !stored.tokenImage && stored.backstory.length === 10000, 'abilities, image and text cleaned');
  ok(A.w.__errors.length === 0, 'no script errors: ' + A.w.__errors.join('|'));
  done();
})();
