const { ET } = require('../engine.js');
let n = 0, f = 0; const ok = (c, m) => { n++; if (!c) { f++; console.log('FAIL', m); } else console.log('PASS', m); };
const seq = (...v) => { let i = 0; return () => v[i++]; };
// rulebook examples
let d = ET.newDie(20, 8); let r = ET.chain(d, 2, seq()); ok(ET.total(r.dice) === 10 && r.left === 0, 'ex1: D20 roll 8 + 2 ET = 10');
d = ET.newDie(12, 12); r = ET.chain(d, 1, seq(4)); ok(ET.total(r.dice) === 16, 'ex2: D12 12 + 1 ET explodes, 4 -> 16');
d = ET.newDie(10, 9); r = ET.chain(d, 3, seq(6)); ok(ET.total(r.dice) === 17, 'ex3: D10 9 + 3 ET = 17');
d = ET.newDie(8, 8); r = ET.chain(d, 4, seq(6, 5)); ok(ET.total(r.dice) === 21 && r.dice.length === 3, 'ex4: D8 8 + 4 ET = 21 (two explosions)');
// ex5: 3D6 -> 3,5,6; 2 ET on the 5, 1 ET on the 6, then 1 ET on each new die
const dd = [ET.newDie(6, 3, 0), ET.newDie(6, 5, 1), ET.newDie(6, 6, 2)];
const roll = seq(2, 4); const out = [];
let a1 = ET.applyTo(dd[1], 2, roll); let a2 = ET.applyTo(dd[2], 1, roll);
ok(a1.used === 2 && a1.spawned && a2.used === 1 && a2.spawned, 'ex5: both explode');
const all = dd.concat([a1.spawned, a2.spawned]);
ET.applyTo(a1.spawned, 1, roll); ET.applyTo(a2.spawned, 1, roll);
ok(ET.total(all) === 23, 'ex5: total 23, got ' + ET.total(all));
ok(ET.total(all, 1) === 6 + 3 && ET.total(all, 2) === 6 + 5, 'groups follow their original die');
// an exploded die at max cannot take more
d = ET.newDie(6, 6); d.exploded = true; ok(!ET.canTake(d) && ET.applyTo(d, 3, seq(1)).used === 0, 'exploded die at max takes nothing');
console.log(f ? f + ' FAILED' : 'ALL ' + n + ' PASSED'); process.exit(f ? 1 : 0);
