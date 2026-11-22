const { boot, wait, waitFor, api, checker } = require('./h.js');
const { ok, done } = checker();
(async () => {
  const w = await boot({}); const A = api(w);
  await wait(100); await A.signUp(); await wait(100);
  const blobs = [];
  w.URL.createObjectURL = (b) => { blobs.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { this.dataset.clicked = this.download; };
  const readBlob = (b) => new Promise((res) => { const r = new w.FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
  const msg = () => A.$('notesMsg').textContent;
  ok(!!A.$('screen-home').querySelector('[data-go="notes"]'), 'home has a NOTES button');
  A.click(A.$('screen-home').querySelector('[data-go="notes"]')); await wait(50);
  ok(A.vis().join() === 'notes' && w.document.body.classList.contains('on-rules'), 'NOTES opens the notes page in the rulebook look');
  ok(/only in this browser, on this device/.test(A.$('notesWarn').textContent) && /Back them up regularly/.test(A.$('notesWarn').textContent), 'the local-only warning is on the page');
  ok(/not backed these notes up yet/.test(A.$('notesBackupInfo').textContent), 'says there is no backup yet');
  ok(!A.$('rulesBtn').hidden && A.$('notesBtn').hidden, 'RULES is reachable from notes; the NOTES corner button is hidden here');
  A.click(A.$('notesBackup')); ok(/no notes to back up/.test(msg()), 'backup with nothing to save says so');
  // pages
  A.click(A.$('notesNew')); await wait(20);
  A.setv(A.$('notesTitle'), 'Session 1'); A.setv(A.$('notesText'), 'The pot is bubbling.');
  const key = () => Object.keys(w.localStorage).find((k) => /^bsh-notes-(?!backup)/.test(k));
  const stored = () => JSON.parse(w.localStorage.getItem(key()));
  ok(stored().length === 1 && stored()[0].title === 'Session 1' && stored()[0].text === 'The pot is bubbling.', 'a page autosaves to this device');
  ok(/Saved on this device/.test(msg()), 'says it saved');
  A.click(A.$('notesNew')); await wait(20);
  A.setv(A.$('notesTitle'), 'Session 2'); A.setv(A.$('notesText'), 'Ghouls at the gate.');
  ok(stored().length === 2 && A.$('notesSel').options.length === 2, 'a second page is added');
  A.$('notesSel').value = [...A.$('notesSel').options].find((o) => /Session 1/.test(o.textContent)).value; A.$('notesSel').dispatchEvent(new w.Event('change', { bubbles: true })); await wait(20);
  ok(A.$('notesText').value === 'The pot is bubbling.' && A.$('notesTitle').value === 'Session 1', 'switching pages shows the other page');
  // go away and come back: still there
  A.click(A.$('notesBack')); await wait(50); A.click(A.$('screen-home').querySelector('[data-go="notes"]')); await wait(50);
  ok([...A.$('notesSel').options].length === 2, 'notes survive leaving the page');
  // backup
  A.click(A.$('notesBackup')); await wait(30);
  ok(blobs.length === 1 && /Backup downloaded \(2 pages\)/.test(msg()), 'BACK UP NOTES downloads a file: ' + msg());
  const file = JSON.parse(await readBlob(blobs[0]));
  ok(file.format === 'bloodsoup-hell-notes' && file.notes.length === 2 && file.notes.some((n) => n.text === 'Ghouls at the gate.'), 'the backup holds every page');
  ok(/Last backup:/.test(A.$('notesBackupInfo').textContent), 'last backup time is shown');
  // delete one, restore from the backup
  A.click([...A.$('notesDoc').querySelectorAll('button')].find((b) => b.textContent === 'DELETE PAGE'));
  A.click([...A.$('notesDoc').querySelectorAll('button')].find((b) => /TAP AGAIN/.test(b.textContent))); await wait(30);
  ok(stored().length === 1, 'DELETE PAGE removes it (after a second tap)');
  const pick = (text) => { Object.defineProperty(A.$('notesFile'), 'files', { configurable: true, value: [new w.File([text], 'n.json')] }); A.$('notesFile').dispatchEvent(new w.Event('change', { bubbles: true })); };
  pick(JSON.stringify(file)); await waitFor(() => /Restored/.test(msg()));
  ok(/Restored 1 page \(1 already here\)/.test(msg()) && stored().length === 2, 'RESTORE adds the missing page and skips the one already here: ' + msg());
  pick('{"hello":1}'); await waitFor(() => /not a notes backup/.test(msg()));
  ok(/not a notes backup/.test(msg()) && stored().length === 2, 'a wrong file is refused and changes nothing');
  pick('not json'); await waitFor(() => /not a notes backup/.test(msg())); ok(stored().length === 2, 'a damaged file is refused');
  pick(JSON.stringify({ format: 'bloodsoup-hell-notes', notes: [{ title: 'x'.repeat(500), text: 'y', id: { bad: 1 } }, null, 7] })); await waitFor(() => /Restored 1/.test(msg()));
  ok(stored().length === 3 && stored().every((n) => n.title.length <= 60 && typeof n.id === 'string'), 'restored pages are cleaned (title length, ids)');
  // from the rulebook and guide there is a NOTES button
  A.click(A.$('rulesBtn')); await wait(50);
  ok(A.vis().join() === 'rules' && !A.$('notesBtn').hidden, 'the rulebook has a NOTES button');
  A.click(A.$('notesBtn')); await wait(50);
  ok(A.vis().join() === 'notes', 'NOTES from the rulebook opens the notes');
  A.click(A.$('notesBack')); await wait(50);
  ok(A.vis().join() === 'home', 'BACK from notes returns to where you came from');
  done();
})().catch((e) => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
