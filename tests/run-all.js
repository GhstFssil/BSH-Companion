// Runs every test file and prints one line each. Usage: node run-all.js [--slow]
// gifts.js and spawn.js take ~100 s each and can time out, so they only run with --slow.
// et2.js uses real dice and is occasionally flaky; rerun it before assuming a regression.
const { spawnSync } = require('child_process');
const fs = require('fs');
const skip = new Set(['h.js', 'mock.js', 'run-all.js']);
const slow = new Set(['gifts.js', 'spawn.js']);
const withSlow = process.argv.includes('--slow');
const files = fs.readdirSync(__dirname).filter((f) => /\.(js|mjs)$/.test(f) && !skip.has(f) && (withSlow || !slow.has(f))).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync('node', [f], { cwd: __dirname, encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter((l) => /^FAIL/.test(l));
  const all = out.split('\n').find((l) => /^ALL \d+ PASSED/.test(l));
  console.log((all && !fails.length ? 'ok   ' : 'FAIL ') + f + '  ' + (all || (fails[0] || out.trim().split('\n').pop() || 'no output').slice(0, 120)));
  if (!all || fails.length) bad++;
}
console.log(bad ? bad + ' file(s) FAILED' : 'all test files passed');
process.exit(bad ? 1 : 0);
