const B = require('../engine.js');
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const C = B.COMBAT, K = B.COMBO;
// classify
ok(C.classify(11, 10) === 'hit', 'hit'); ok(C.classify(10, 10) === 'miss', 'tie is a miss'); ok(C.classify(20, 10) === 'crit', '10 over is a crit');
ok(C.classify(19, 10) === 'hit', '9 over is a hit'); ok(C.classify(0, 10) === 'critfail', '10 under is a critical miss'); ok(C.classify(1, 10) === 'miss', '9 under is a miss');
ok(C.damage(10, 3, false) === 7 && C.damage(10, 3, true) === 14 && C.damage(2, 5, true) === 0, 'damage/crit doubles after AC, never below 0');
// level
ok(K.level(9) === 0 && K.level(10) === 10 && K.level(14) === 10 && K.level(15) === 15 && K.level(25) === 25 && K.level(40) === 25, 'levels');
ok(K.skills().length === 8 && Object.values(K.TABLE).every((r) => r.length === 5), 'table is 8 rows x 5 columns');
const base = { da: 10, ac: 2, skill: 'Athletics', level: 15 };
// both miss
let r = K.resolve({ ...base, L: { total: 8, power: 6 }, F: { total: 9, power: 7 } });
ok(r.kind === 'miss' && r.retry && r.damage === 0, 'both miss: retry offered');
// leader hits only, finisher misses even with the BP bonus (BP doesn't help to hit); diff 6 -> plain combo
r = K.resolve({ ...base, L: { total: 15, power: 6 }, F: { total: 9, power: 7 } });
ok(r.kind === 'hit' && r.L.hit && !r.F.hit && r.recv === 'finisher' && r.F.power === 10 && r.L.power === 6, 'leader-only hit: finisher gets BP+3 but misses; ' + JSON.stringify(r));
ok(r.damage === 4, 'leader-only hit damage = 6 - 2 AC; got ' + r.damage);
// both hit, big difference -> normal combo, both gain BP+3, damage summed
r = K.resolve({ ...base, L: { total: 12, power: 6 }, F: { total: 17, power: 7 } });
ok(r.kind === 'hit' && r.recv === 'both' && r.L.power === 9 && r.F.power === 10 && r.diff === 5, 'both hit: both get BP+3');
ok(r.damage === 9 + 10 - 2, 'summed as one instance vs AC: ' + r.damage);
// critical combo: diff 1-3 uses next column (CL20 BP+4)
r = K.resolve({ ...base, L: { total: 14, power: 6 }, F: { total: 16, power: 7 } });
ok(r.kind === 'critical' && r.bonus.bp === 4 && r.L.power === 10 && r.F.power === 11 && r.damage === 21 - 2, 'critical combo next level: ' + JSON.stringify(r.bonus) + ' dmg ' + r.damage);
// perfect combo: diff 0 -> BP+10, summed and doubled
r = K.resolve({ ...base, L: { total: 14, power: 6 }, F: { total: 14, power: 7 } });
ok(r.kind === 'perfect' && r.bonus.bp === 10 && r.damage === (16 + 17) * 2 - 2, 'perfect: ' + r.damage);
// perfectionist widens perfect to 0-1; critical reave widens critical to 1-4
r = K.resolve({ ...base, L: { total: 14, power: 6 }, F: { total: 15, power: 7 }, perfectMax: 1 });
ok(r.kind === 'perfect', 'perfectionist: diff 1 is perfect');
r = K.resolve({ ...base, L: { total: 14, power: 6 }, F: { total: 18, power: 7 } });
ok(r.kind === 'hit', 'diff 4 is not critical by default');
r = K.resolve({ ...base, L: { total: 14, power: 6 }, F: { total: 18, power: 7 }, critMax: 4 });
ok(r.kind === 'critical', 'critical reave: diff 4 is critical');
// below CL10: no bonus, but a Critical Combo uses CL10's
r = K.resolve({ ...base, level: 0, L: { total: 14, power: 6 }, F: { total: 16, power: 7 } });
ok(r.kind === 'critical' && r.bonus.bp === 2, 'no level: critical combo gets the CL10 bonus');
r = K.resolve({ ...base, level: 0, L: { total: 14, power: 6 }, F: { total: 22, power: 7 } });
ok(r.kind === 'hit' && r.bonus === null && r.damage === 6 + 7 - 2, 'no level, plain: no bonus');
// SA bonus (Tracking) applies retroactively to both and can make crits
r = K.resolve({ da: 10, ac: 0, skill: 'Tracking', level: 25, L: { total: 11, power: 5 }, F: { total: 9, power: 5 } });
// leader hits (11>10); finisher gets SA+10 -> 19 hits; leader gets +10 -> 21 = 11 over -> crit; diff 2 -> critical -> Perfect column (crit)
ok(r.kind === 'critical' && r.bonus.crit && r.L.hit && r.F.hit, 'tracking: upgraded to the Perfect column (critical hit) ' + JSON.stringify(r));
r = K.resolve({ da: 10, ac: 0, skill: 'Tracking', level: 10, L: { total: 16, power: 5 }, F: { total: 6, power: 5 } });
ok(r.kind === 'hit' && r.F.total === 9 && !r.F.hit && r.recv === 'finisher', 'tracking SA+3 is not enough for the finisher: 6 -> 9 still a miss');
r = K.resolve({ da: 10, ac: 0, skill: 'Tracking', level: 20, L: { total: 15, power: 5 }, F: { total: 5, power: 5 } });
ok(r.F.total === 12 && r.F.hit && r.recv === 'both' && r.L.total === 22 && r.L.crit, 'tracking SA+7: finisher is lifted into a hit and the leader into a crit (22 vs DA 10)');
// crit doubling only when both crit in a summed instance
r = K.resolve({ da: 10, ac: 0, skill: 'Athletics', level: 15, L: { total: 25, power: 4 }, F: { total: 12, power: 4 } });
ok(r.L.crit && !r.F.crit && r.damage === 14, 'one crit in a summed hit does not double: ' + r.damage);
r = K.resolve({ da: 10, ac: 0, skill: 'Athletics', level: 15, L: { total: 25, power: 4 }, F: { total: 22, power: 4 } });
ok(r.kind !== 'miss' && r.L.crit && r.F.crit && r.damage === (r.L.power + r.F.power) * (r.kind === 'perfect' ? 2 : 1) * 2, 'both crit doubles the summed instance: ' + r.damage);
// a single hit: the miss side contributes nothing; crit doubles
r = K.resolve({ da: 10, ac: 3, skill: 'Courage', level: 15, L: { total: 22, power: 8 }, F: { total: 4, power: 9 } });
ok(r.L.hit && !r.F.hit && r.L.crit && r.damage === 10 && r.effects.sp === 8 && r.kind === 'hit', 'crit single hit: (8-3)*2 = 10, courage SP 8, ' + JSON.stringify(r));
// effects: battlewise AP
r = K.resolve({ da: 10, ac: 0, skill: 'Battlewise', level: 25, L: { total: 12, power: 1 }, F: { total: 30, power: 1 } });
ok(r.effects.ap === 4, 'battlewise CL25 = 4 AP');
console.log(bad ? bad + ' FAILED of ' + n : 'ALL ' + n + ' PASSED');
