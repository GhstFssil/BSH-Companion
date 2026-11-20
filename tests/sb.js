const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
(async () => {
  const m = await createMock();
  const open = async (storage, hash) => api(await boot({ supabaseUrl: m.url, storage, hash }));

  let A = await open();
  ok(A.vis().join() === 'start' && A.$('modeNote').hidden, 'supabase mode: no preview-mode note');

  // ---- sign up ----
  ok((await A.signUp({ name: 'Ricky', username: 'ricky_1', email: 'Ricky@Example.com', password: 'correct horse' })) === '' && A.vis().join() === 'home', 'sign up -> landing page');
  ok(A.$('welcomeName').textContent === 'Ricky', 'welcome shows the profile name');
  const rpc = m.db.log.find((r) => r.path.endsWith('username_available'));
  ok(rpc && rpc.body.p_username === 'ricky_1', 'checked username availability first');
  const su = m.db.log.find((r) => r.path === '/auth/v1/signup');
  ok(su.body.email === 'ricky@example.com' && su.body.data.name === 'Ricky' && su.body.data.username === 'ricky_1', 'signup sent lowercased email + name/username metadata');
  ok(su.apikey === 'sb_publishable_TESTKEY', 'every request carries the publishable key');
  ok(!JSON.stringify(m.db.log.filter((r) => r.path.startsWith('/rest'))).includes('correct horse'), 'password only goes to the auth endpoint');

  // ---- character is created and saved in the database ----
  A.go('characters'); await wait();
  A.click(A.$('newCharBtn')); await wait();
  ok(A.vis().join() === 'sheet', 'New Character opens a sheet');
  ok(await waitFor(() => m.db.characters.length === 1, 3000), 'character row created in the database');
  A.tab('info'); A.setv(A.byLabel('info', 'Name'), 'Vex Marrow'); A.tab('skills'); A.setv(A.byLabel('skills', 'Carrying proficiency points'), '2');
  ok(await waitFor(() => A.$('saveStatus').textContent === 'Saved' && m.db.characters[0].data.info.name === 'Vex Marrow', 3000), 'edits autosave to the database, status says Saved');
  const row = m.db.characters[0], uid = m.db.users[0].id;
  ok(row.owner === uid && /^[0-9a-f-]{36}$/.test(row.id) && row.data.prof[0] === 2 && row.data.id === undefined, 'row owned by the player, id is a uuid, data holds the sheet');
  const up = m.db.log.filter((r) => r.method === 'POST' && r.path === '/rest/v1/characters').pop();
  ok(/on_conflict=id/.test(up.query) && /merge-duplicates/.test(up.prefer), 'saves are upserts (insert or update)');
  ok(up.auth.startsWith('Bearer ') && up.auth.split('.').length === 3, 'saves are made with the signed-in player token');

  // ---- save failure shows a message and recovers ----
  m.db.failSaves = true; A.tab('story'); A.setv(A.byLabel('story', 'Backstory'), 'Rose from the pot.');
  ok(await waitFor(() => /Not saved/.test(A.$('saveStatus').textContent), 4000), 'failed save shows "Not saved. Retrying..."');
  m.db.failSaves = false;
  ok(await waitFor(() => A.$('saveStatus').textContent === 'Saved' && m.db.characters[0].data.backstory === 'Rose from the pot.', 8000), 'retry succeeds once the server is back');

  // ---- reload restores the session and loads characters from the server ----
  const snap = A.storage();
  ok(Object.keys(snap).some((k) => /^sb-.*auth-token$/.test(k)), 'login session persisted by supabase-js');
  A = await open(snap, '#characters');
  ok(A.vis().join() === 'characters' && A.d.querySelectorAll('#charList .char-btn').length === 1 && /Vex Marrow/.test(A.text('#charList .char-btn')), 'after reload: still logged in, character loaded from the server');
  A.click(A.d.querySelector('#charList .char-btn')); await wait();
  A.tab('skills');
  ok(A.byLabel('skills', 'Carrying proficiency points').value === '2', 'sheet restored from the database');

  // ---- another player cannot see it ----
  const B = await open();
  ok(await B.signUp({ name: 'Sam', username: 'sam_2', email: 'sam@example.com', password: 'another pass1' }) === '', 'second player signs up');
  B.go('characters'); await wait();
  ok(B.d.querySelectorAll('#charList .char-btn').length === 0, "second player does not see the first player's character");
  ok(/already taken/.test(await (async () => { await B.logOut(); return B.signUp({ name: 'X', username: 'RICKY_1', email: 'x@example.com', password: 'whatever pw1' }); })()), 'username taken is reported (case-insensitive)');
  ok(/already has an account/.test(await B.signUp({ name: 'X', username: 'x_user', email: 'sam@example.com', password: 'whatever pw1' })), 'email already registered is reported');

  // ---- log in / out ----
  ok(/incorrect/.test(await B.logIn('sam_2', 'wrong password')), 'wrong password -> friendly message');
  ok((await B.logIn('SAM_2', 'another pass1')) === '' && B.$('welcomeName').textContent === 'Sam', 'correct login works');
  await B.logOut();
  ok(m.db.log.some((r) => r.path === '/auth/v1/logout'), 'log out calls the server');
  ok(!Object.keys(B.storage()).some((k) => /auth-token/.test(k)), 'saved session removed on log out');

  // ---- delete removes the row ----
  A.tab('info');
  const del = () => [...A.d.querySelectorAll('#panel-info .btn')].find((b) => /DELETE/.test(b.textContent));
  A.click(del()); A.click(del());
  ok(await waitFor(() => m.db.characters.length === 0, 3000), 'delete removes the database row');
  ok(A.w.__errors.length === 0 && B.w.__errors.length === 0, 'no script errors');
  m.close(); done();
})();
