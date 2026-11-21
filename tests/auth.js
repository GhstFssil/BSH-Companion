const { boot, wait, api, checker } = require('./h.js');
const { ok, done } = checker();
(async () => {
  let A = api(await boot());
  ok(A.vis().join() === 'start', 'opens on start after loading');
  ok(!A.$('modeNote').hidden && /Preview mode/.test(A.$('modeNote').textContent), 'local backend shows the preview-mode note');
  ok([...A.d.querySelectorAll('#screen-start .btn')].filter((b) => !b.hidden && !/ERASE/.test(b.textContent)).length === 3, 'start has three main buttons: LOG IN, CREATE ACCOUNT, GUIDE (plus the preview-only erase button)');
  A.click(A.d.querySelector('[data-go="login"]')); await wait();
  ok(A.vis().join() === 'login', 'Log In -> login page');
  ok(['loginUser', 'loginPass'].every((id) => A.$(id)) && A.$('loginPass').type === 'password', 'login asks username + password (hidden)');
  ok(A.$('loginBtn').disabled, 'login disabled when empty');
  A.setv(A.$('loginUser'), 'someone'); ok(A.$('loginBtn').disabled, 'login still disabled with only a username');
  A.click(A.d.querySelector('#screen-login [data-go=""]')); await wait();
  ok(A.vis().join() === 'start', 'login Back -> start');

  A.click(A.d.querySelector('[data-go="create"]')); await wait();
  ok(A.vis().join() === 'create' && A.$('createPass').type === 'password', 'Create Account page, password hidden');
  ok(A.$('createBtn').disabled, 'create disabled when empty');
  A.setv(A.$('createName'), 'Ricky'); A.setv(A.$('createUser'), 'ricky_1'); A.setv(A.$('createEmail'), 'ricky@example.com');
  ok(A.$('createBtn').disabled, 'create disabled until password filled');
  A.setv(A.$('createPass'), 'short'); ok(!A.$('createBtn').disabled, 'create enabled with all four fields');
  A.submit('createForm'); await wait();
  ok(/at least 8/.test(A.$('createMsg').textContent), 'rejects short password');
  A.setv(A.$('createPass'), 'long enough pw'); A.setv(A.$('createUser'), 'ab'); A.submit('createForm'); await wait();
  ok(/3 to 20/.test(A.$('createMsg').textContent), 'rejects bad username');
  A.setv(A.$('createUser'), 'ricky_1'); A.setv(A.$('createEmail'), 'not-an-email'); A.submit('createForm'); await wait();
  ok(/valid email/.test(A.$('createMsg').textContent), 'rejects bad email');
  A.setv(A.$('createEmail'), 'Ricky@Example.com'); A.submit('createForm');
  await require('./h.js').waitFor(() => A.vis().join() === 'home');
  ok(A.vis().join() === 'home' && A.$('welcomeName').textContent === 'Ricky', 'valid create -> home, welcome shows name');
  ok(!A.$('logoutBtn').hidden, 'Log Out visible when logged in');
  const stored = A.storage();
  ok(!/long enough pw/.test(JSON.stringify(stored)), 'password is not stored in plain text');
  A.go('login'); await wait(); ok(A.vis().join() === 'home', 'logged-in user redirected away from login');

  // reload: session restored
  const saved = A.storage();
  A = api(await boot({ storage: saved }));
  ok(A.vis().join() === 'home' && A.$('welcomeName').textContent === 'Ricky', 'reload restores the session');

  await A.logOut();
  ok(A.vis().join() === 'start' && A.$('logoutBtn').hidden, 'Log Out -> start, button hidden');

  ok(/incorrect/.test(await A.logIn('nobody_9', 'whatever pw1')), 'unknown username rejected');
  ok(/incorrect/.test(await A.logIn('ricky_1', 'wrong password')), 'wrong password rejected');
  ok(A.vis().join() === 'login', 'stays on login after failure');
  ok((await A.logIn(' RICKY_1 ', 'long enough pw')) === '' && A.vis().join() === 'home', 'correct login works (username case/spacing ignored)');
  await A.logOut();

  ok(/already has an account/.test(await A.signUp({ username: 'other_1', email: 'ricky@example.com' })), 'duplicate email rejected');
  ok(/already taken/.test(await A.signUp({ username: 'RICKY_1', email: 'new@example.com' })), 'duplicate username rejected (any capitalization)');
  A.click(A.d.querySelector('#screen-create [data-go=""]')); await wait();
  ok(A.vis().join() === 'start', 'create Back -> start');
  ok(A.w.__errors.length === 0, 'no script errors');
  done();
})();
