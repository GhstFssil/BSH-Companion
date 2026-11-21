const { boot, wait, api, checker } = require('./h.js');
const { ok, done } = checker();
(async () => {
  const w = await boot({}); const A = api(w);
  const hit = []; w.Element.prototype.scrollIntoView = function () { hit.push(this.id); };
  await wait(100);
  // title page
  const startGuide = A.$('screen-start').querySelector('[data-go="guide"]');
  ok(!!startGuide, 'title page has a GUIDE button');
  A.click(startGuide); await wait(50);
  ok(!A.$('screen-guide').hidden && A.vis().join() === 'guide', 'GUIDE opens the user guide');
  ok(w.document.body.classList.contains('on-rules'), 'guide uses the same dark-gray page as the rulebook');
  ok(!A.$('rulesBtn').hidden && A.$('guideBtn').hidden, 'on the guide, RULES is shown and GUIDE is hidden');
  const doc = A.$('guideDoc');
  ok(doc.querySelector('h1').textContent === 'Bloodsoup Hell Companion: User Guide', 'title');
  const heads = [...doc.querySelectorAll('h2[id]')].filter((h) => !h.closest('.rtoc'));
  const links = [...doc.querySelectorAll('.rtoc a[data-goto]')];
  ok(heads.length === 7 && links.length === 7, `7 sections, 7 contents links (${heads.length}/${links.length})`);
  ok(links.every((a) => doc.querySelector('#' + a.dataset.goto)), 'every contents link points at a real heading');
  ok(links.every((a, i) => a.textContent === heads[i].firstChild.textContent), 'contents entries are in order and match the headings');
  ok(new Set([...doc.querySelectorAll('[id]')].map((e) => e.id)).size === doc.querySelectorAll('[id]').length, 'no duplicate ids');
  const rulesIds = new Set([...A.$('rulesDoc').querySelectorAll('[id]')].map((e) => e.id));
  ok([...doc.querySelectorAll('[id]')].every((e) => !rulesIds.has(e.id)), 'guide ids never clash with rulebook ids');
  A.click(links[4]); await wait(20);
  ok(hit.pop() === links[4].dataset.goto && w.document.activeElement.id === links[4].dataset.goto && w.location.hash === '#guide', 'a contents link scrolls to and focuses its heading and stays on #guide');
  doc.querySelectorAll('.totop')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(hit.pop() === 'guide-top', '^ CONTENTS returns to the top');
  ok(/Explode Tokens/.test(doc.textContent) && /Combo Attack/.test(doc.textContent) && doc.querySelectorAll('table').length === 1, 'text and the home-screen table came across');
  ok(/<weapon>/.test(doc.textContent) && /<Leader>/.test(doc.textContent), 'angle-bracket placeholders show as text');
  // guide <-> rules
  A.click(A.$('rulesBtn')); await wait(50);
  ok(A.vis().join() === 'rules' && A.$('rulesBtn').hidden && !A.$('guideBtn').hidden, 'RULES on the guide opens the rulebook, where GUIDE appears');
  A.click(A.$('guideBtn')); await wait(50);
  ok(A.vis().join() === 'guide', 'GUIDE on the rulebook returns to the guide');
  A.click(A.$('guideBack')); await wait(50);
  ok(A.vis().join() === 'start', 'BACK skips the rulebook and returns to where you came from');
  // logged in
  await A.signUp(); await wait(100);
  ok(A.vis().join() === 'home' && !A.$('screen-home').querySelector('[data-go="guide"]') === false, 'home screen has a GUIDE button');
  A.click(A.$('screen-home').querySelector('[data-go="guide"]')); await wait(50);
  ok(A.vis().join() === 'guide' && A.$('logoutBtn').hidden, 'logged-in users can open the guide (no redirect home, no log out button)');
  A.click(A.$('guideBack')); await wait(50);
  ok(A.vis().join() === 'home', 'BACK returns to Home');
  done();
})().catch((e) => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
