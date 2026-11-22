const { boot, wait, waitFor, api, checker } = require('./h.js');
const fs = require('fs');
const { ok, done } = checker();
(async () => {
  const A = api(await boot()); await A.signUp(); A.go('characters'); await wait();
  const dir = require('path').join(__dirname, 'fixtures/npcs/');
  for (const n of require('fs').readdirSync(dir).filter((x) => x.endsWith('.bloodsoup.json')).map((x) => x.replace('.bloodsoup.json', ''))) {
    const text = fs.readFileSync(dir + n + '.bloodsoup.json', 'utf8'), src = JSON.parse(text).character;
    const f = new A.w.File([text], n + '.json', { type: 'application/json' });
    Object.defineProperty(A.$('importFile'), 'files', { value: [f], configurable: true });
    A.$('importFile').dispatchEvent(new A.w.Event('change', { bubbles: true }));
    await waitFor(() => A.vis().join() === 'sheet'); A.go('characters'); await wait(100);
    let st; for (let i = 0; i < 40 && !st; i++) { for (let k = 0; k < A.w.localStorage.length; k++) { try { const v = JSON.parse(A.w.localStorage.getItem(A.w.localStorage.key(k))); if (Array.isArray(v)) { const x = v.find((c) => c && c.info && c.info.name === src.info.name); if (x) st = x; } } catch (e) {} } if (!st) await wait(100); }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // a weapon's old Cost / Attack Dmg / Range / Dmg Type become its first attack; the rest stays a weapon property
    const sameWeapon = (got, it) => { const w = it.weaponProps || {}, s = (k) => (w[k] == null ? '' : String(w[k]));
      return same(got.weaponProps, { type: s('type'), size: s('size'), weight: s('weight'), cr: s('cr'), loadCost: '', ammo: '', effect: s('effect') })
        && same(got.attacks, [{ name: it.name, cost: s('cost'), dmg: s('dmg'), range: s('range'), damage: s('damage'), effect: '' }]); };
    ok(!!st, n + ' imported');
    ['talents', 'totemTalents', 'buffTalents', 'prof', 'totemProf', 'skillBuff', 'skillAdj', 'skillAdjPct', 'statBuff', 'statAdj', 'statAdjPct'].forEach((k) => ok(same(st[k], src[k].map((v, i) => (k === 'talents' ? (v === null ? 10 : v) : v))), n + ' ' + k + ' kept'));
    ok(src.items.every((it, i) => st.items[i].name === it.name && st.items[i].qty === it.qty && st.items[i].weapon === it.weapon && st.items[i].magic === it.magic && (it.weapon ? sameWeapon(st.items[i], it) : same(st.items[i].weaponProps, {})) && st.items[i].charges === it.charges), n + ' items kept');
    ok(same(st.abilities, src.abilities) && st.backstory === src.backstory && st.appearance === src.appearance, n + ' abilities and story kept');
    const r = A.w.BSH.compute(st); ok(r.stat[0] > 0, n + ' computes: HP ' + r.stat[0]);
  }
  ok(A.w.__errors.length === 0, 'no errors');
  done();
})();
