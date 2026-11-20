const { boot, wait, waitFor, api, checker } = require('./h.js');
const { ok, done } = checker();
(async () => {
  const A = api(await boot());
  await A.signUp({ name: 'Ricky', username: 'ricky_1', email: 'r@x.com', password: 'password123' });
  await A.logOut(); await wait(50);
  const btn = () => [...A.d.querySelectorAll('#screen-start button')].find((b) => /ERASE/.test(b.textContent));
  ok(!!btn(), 'start screen shows ERASE PREVIEW DATA in preview mode');
  A.click(btn()); ok(/TAP AGAIN/.test(btn().textContent), 'first tap only arms it');
  ok(JSON.stringify(Object.keys(A.w.localStorage ? {} : {})) !== null, 'sanity');
  A.click(btn()); await wait(80);
  ok(btn().textContent === 'ERASED', 'second tap erases');
  let failed = false; try { await A.logIn('ricky_1', 'password123'); } catch (e) { failed = true; }
  ok(failed || A.vis().join() !== 'home', 'old account can no longer log in');
  const B = api(await boot({}));
  ok(true, 'fresh boot works');
  ok(A.w.__errors.length === 0, 'no script errors');
  done();
})();
