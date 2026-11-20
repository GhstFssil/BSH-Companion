const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock, jwt } = require('./mock.js');
const { ok, done } = checker();
(async () => {
  const m = await createMock();
  const open = async (hash, storage) => api(await boot({ supabaseUrl: m.url, hash, storage }));
  let A = await open('');
  await A.signUp({ username: 'ricky_1', email: 'ricky@example.com', password: 'old password 1' });
  A.click(A.$('logoutBtn')); await wait(50);
  A.go('login'); await wait();
  ok(!!A.$('screen-login').querySelector('[data-go="forgot"]'), 'login page has a FORGOT PASSWORD button');
  A.click(A.$('screen-login').querySelector('[data-go="forgot"]')); await wait();
  ok(A.vis().join() === 'forgot' && A.$('forgotBtn').disabled, 'forgot page opens, button disabled while empty');
  // by username
  A.setv(A.$('forgotWho'), 'ricky_1'); ok(!A.$('forgotBtn').disabled, 'enabled once typed');
  A.click(A.$('forgotBtn')); ok(await waitFor(() => /on its way/.test(A.$('forgotMsg').textContent)), 'confirmation shown');
  ok(m.db.recover.length === 1 && m.db.recover[0].email === 'ricky@example.com', 'link sent to the account email (looked up from username)');
  ok(/^http:\/\/localhost\/index\.html$/.test(m.db.recover[0].redirect), 'redirects back to the app: ' + m.db.recover[0].redirect);
  // by email
  A.setv(A.$('forgotWho'), 'Ricky@Example.com'); A.click(A.$('forgotBtn')); await waitFor(() => m.db.recover.length === 2);
  ok(m.db.recover[1].email === 'ricky@example.com', 'works with email too');
  // unknown account: same message, nothing sent
  const msg1 = A.$('forgotMsg').textContent;
  A.setv(A.$('forgotWho'), 'nobody_9'); A.click(A.$('forgotBtn')); await wait(300);
  ok(m.db.recover.length === 2 && A.$('forgotMsg').textContent === msg1, 'unknown username: no email, identical message (no account enumeration)');
  A.setv(A.$('forgotWho'), 'ghost@example.com'); A.click(A.$('forgotBtn')); await wait(300);
  ok(A.$('forgotMsg').textContent === msg1, 'unknown email: identical message');

  // ---- coming back from the email link ----
  const uid = m.db.users[0].id;
  const hash = '#access_token=' + jwt(uid) + '&refresh_token=r-x&expires_in=3600&expires_at=' + (Math.floor(Date.now() / 1000) + 3600) + '&token_type=bearer&type=recovery';
  const B = await open(hash);
  ok(B.vis().join() === 'reset', 'recovery link opens the new-password page: ' + B.vis().join());
  ok(!/access_token|refresh_token/.test(B.d.defaultView.location.href), 'tokens removed from the address bar: ' + B.d.defaultView.location.href);
  B.setv(B.$('resetPass'), 'short'); B.setv(B.$('resetPass2'), 'short'); B.click(B.$('resetBtn')); await wait(50);
  ok(/8 characters/.test(B.$('resetMsg').textContent), 'too short is rejected');
  B.setv(B.$('resetPass'), 'brand new pass'); B.setv(B.$('resetPass2'), 'different one'); B.click(B.$('resetBtn')); await wait(50);
  ok(/do not match/.test(B.$('resetMsg').textContent), 'mismatch is rejected');
  B.setv(B.$('resetPass2'), 'brand new pass'); B.click(B.$('resetBtn'));
  ok(await waitFor(() => B.vis().join() === 'home'), 'success -> landing page');
  ok(m.db.users[0].password === 'brand new pass', 'password changed on the server');
  const C = await open('');
  await C.logIn('ricky_1', 'brand new pass'); ok(C.vis().join() === 'home', 'can log in with the new password');
  const D = await open(''); await D.logIn('ricky_1', 'old password 1'); ok(D.vis().join() !== 'home', 'old password no longer works');

  // ---- expired / used link ----
  const E = await open('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  ok(E.vis().join() === 'forgot' && /expired/.test(E.$('forgotMsg').textContent), 'expired link -> forgot page with a message');
  // reset page without a session
  const F = await open('#reset'); ok(F.vis().join() === 'login', 'reset page needs a session');
  // local mode
  const L = api(await boot({})); L.go('forgot'); await wait();
  L.setv(L.$('forgotWho'), 'x@y.com'); L.click(L.$('forgotBtn')); await wait(50);
  ok(/online version/.test(L.$('forgotMsg').textContent), 'preview mode explains email recovery needs the online version');
  
  done();
})();
