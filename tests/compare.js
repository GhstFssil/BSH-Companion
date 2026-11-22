const { boot, wait, waitFor, api, checker } = require('./h.js');
const { ok, done } = checker();
(async () => {
  const w = await boot({}); const A = api(w);
  await wait(100); await A.signUp(); await wait(100);
  const mk = async (name, carrying) => {
    A.go('characters'); await wait(40); A.click(A.$('newCharBtn')); await wait(60);
    A.tab('info'); A.setv(A.byLabel('info', 'Name'), name);
    if (carrying) { A.tab('skills'); A.setv(A.byLabel('skills', 'Carrying proficiency points'), String(carrying)); }
    await waitFor(() => A.$('saveStatus').textContent === 'Saved');
  };
  await mk('Alpha', 0); await mk('Beta', 2); await mk('Gamma', 0); await mk('Delta', 0); await mk('Epsilon', 0);
  A.go('characters'); await wait(60);
  ok(!!A.$('compareBtn') && A.$('compareBtn').querySelector('[data-px]').dataset.px === 'COMPARE', 'Characters page has a COMPARE button');
  A.click(A.$('compareBtn')); await wait(80);
  ok(A.vis().join() === 'compare', 'COMPARE opens the compare screen');
  const boxes = () => [...A.d.querySelectorAll('#cmpPick input[data-cmp]')], box = (n) => boxes().find((b) => b.getAttribute('aria-label').startsWith(n));
  ok(boxes().length === 5, 'every character is offered: ' + boxes().length);
  ok(!A.$('cmpGrid'), 'no table until two are picked');
  const tick = (n, on = true) => { const b = box(n); b.checked = on; b.dispatchEvent(new w.Event('change', { bubbles: true })); };
  tick('Alpha'); ok(!A.$('cmpGrid') && /one more/.test(A.$('cmpTable').textContent), 'one pick asks for another');
  tick('Beta');
  ok(!!A.$('cmpGrid') && [...A.d.querySelectorAll('#cmpGrid thead th')].map((t) => t.textContent).join('|') === '|Alpha|Beta', 'two picks make a table with a column each');
  const rowOf = (label) => [...A.d.querySelectorAll('#cmpGrid tbody tr')].find((r) => r.firstChild.textContent.startsWith(label));
  const cells = (label) => [...rowOf(label).querySelectorAll('td')];
  ok(cells('Health Points').map((c) => c.textContent).join() === '12,18' || cells('Health Points').map((c) => c.textContent).join() === '10,18' || cells('Health Points')[1].textContent > cells('Health Points')[0].textContent, 'Beta has more HP (Carrying): ' + cells('Health Points').map((c) => c.textContent));
  ok(cells('Health Points')[1].classList.contains('best') && !cells('Health Points')[0].classList.contains('best'), 'the higher HP is highlighted');
  ok(!cells('Run Distance').some((c) => c.classList.contains('best')) || cells('Run Distance')[0].textContent !== cells('Run Distance')[1].textContent, 'equal values are not highlighted');
  ok(cells('Weight Class').every((c) => !c.classList.contains('best')), 'Weight Class is never highlighted');
  ok(A.d.querySelectorAll('#cmpGrid tr.sec').length === 2 && !!rowOf('Athletics'), 'stats and skills sections are listed');
  tick('Gamma'); tick('Delta');
  ok(A.d.querySelectorAll('#cmpGrid thead th[scope=col]').length === 4, 'four columns');
  ok(box('Epsilon').disabled && !box('Alpha').disabled, 'a fifth pick is blocked, but you can still untick');
  tick('Alpha', false); ok(!box('Epsilon').disabled && A.d.querySelectorAll('#cmpGrid thead th[scope=col]').length === 3, 'unticking frees a slot');
  A.click(A.d.querySelector('#screen-compare .corner')); await wait(50);
  ok(A.vis().join() === 'characters', 'BACK returns to Characters');
  done();
})().catch((e) => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
