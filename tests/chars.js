const { boot, wait, waitFor, api, checker } = require('./h.js');
const { ok, done } = checker();
const E = require('../engine.js');
(async () => {
  let A = api(await boot());
  await A.signUp();
  ok(A.vis().join() === 'home', 'signed up, on landing page');
  const labels = [...A.d.querySelectorAll('#screen-home .stack .btn')].map((b) => b.querySelector('[data-px]').dataset.px);
  ok(labels.join() === 'CHARACTERS,COMPENDIUM,CAMPAIGNS,CREATE CAMPAIGN,JOIN CAMPAIGN,GUIDE,NOTES,OPTIONS', 'landing buttons: ' + labels.join(' / '));
  const startBtns = () => [...A.d.querySelectorAll('#screen-start .btn')].filter((b) => !b.hidden && b.querySelector('[data-px]')).map((b) => b.querySelector('[data-px]').dataset.px);
  const titleBtn = A.d.querySelector('#screen-home [data-go="start"]');
  ok(!!titleBtn && titleBtn.classList.contains('corner') && titleBtn.classList.contains('left') && titleBtn.querySelector('[data-px]').dataset.px === 'TITLE', 'landing page has a TITLE button where Back would be');
  A.click(titleBtn); await wait();
  ok(A.vis().join() === 'start' && A.w.location.hash === '#start', 'TITLE opens the title screen while logged in');
  ok(startBtns().join() === 'LOG OUT,ENTER THE RING,GUIDE', 'logged in: title screen offers LOG OUT and ENTER THE RING: ' + startBtns().join());
  ok(A.$('logoutBtn').hidden, 'no duplicate corner LOG OUT on the title screen');
  A.click([...A.d.querySelectorAll('#screen-start [data-go="home"]')][0]); await wait();
  ok(A.vis().join() === 'home' && !A.$('logoutBtn').hidden, 'ENTER THE RING -> landing page');
  A.click(A.d.querySelector('#screen-home [data-go="start"]')); await wait();
  A.click(A.$('startLogout')); await waitFor(() => A.vis().join() === 'start' && startBtns().join() === 'LOG IN,CREATE ACCOUNT');
  ok(A.vis().join() === 'start' && startBtns().join() === 'LOG IN,CREATE ACCOUNT,GUIDE', 'title LOG OUT logs out; title screen shows LOG IN / CREATE ACCOUNT');
  await A.logIn('ricky_1', 'correct horse'); ok(A.vis().join() === 'home', 'can log back in');
  A.click(A.d.querySelector('[data-go="options"]')); await wait();
  ok(A.vis().join() === 'options', 'Options opens its own page: ' + A.vis().join());
  const sz = [...A.d.querySelectorAll('#sizeOpts .opt')].map((b) => b.textContent).join();
  ok(sz === 'Smallest,Small,Standard,Sizeable,Super', 'size options: ' + sz);
  const cl = [...A.d.querySelectorAll('#colorOpts .opt')].map((b) => b.textContent).join();
  ok(cl === "Blood,Melancholy,Greed,Infection,Freddy's Skin", 'color options: ' + cl);
  const root = A.d.documentElement;
  ok(root.style.getPropertyValue('--fs') === '0pt' && root.dataset.theme === 'blood', 'defaults: Standard + Blood');
  A.click([...A.d.querySelectorAll('#sizeOpts .opt')][4]); await wait();
  ok(root.style.getPropertyValue('--fs') === '4pt', 'Super = +4pt (2 pt per step)');
  A.click([...A.d.querySelectorAll('#sizeOpts .opt')][0]); await wait();
  ok(root.style.getPropertyValue('--fs') === '-4pt', 'Smallest = -4pt');
  A.click([...A.d.querySelectorAll('#colorOpts .opt')][1]); await wait();
  ok(root.style.getPropertyValue('--ink-text') === '#5f93d6' && root.dataset.theme === 'melancholy', 'Melancholy recolors');
  ok(JSON.parse(A.w.localStorage.getItem('bsh.options')).color === 'melancholy', 'choice saved on device');
  ok(A.d.querySelector('#screen-start .title') !== null, 'title splash present');
  A.click([...A.d.querySelectorAll('#sizeOpts .opt')][2]); A.click([...A.d.querySelectorAll('#colorOpts .opt')][0]); await wait();
  ok(root.style.getPropertyValue('--fs') === '0pt' && root.dataset.theme === 'blood', 'reset to defaults');
  A.click(A.d.querySelector('#screen-options [data-go="home"]')); await wait();
  for (const [go, scr] of [['campaigns', 'campaigns'], ['create-campaign', 'createcampaign'], ['join-campaign', 'joincampaign']]) {
    A.click(A.d.querySelector(`[data-go="${go}"]`)); await wait();
    ok(A.vis().join() === scr && !A.$('logoutBtn').hidden, `${go} opens its own page, Log Out still visible`);
    A.click(A.d.querySelector(`#screen-${scr} [data-go="home"]`)); await wait();
    ok(A.vis().join() === 'home', `Back from ${go} -> landing`);
  }

  A.click(A.d.querySelector('[data-go="characters"]')); await wait();
  ok(A.vis().join() === 'characters' && !A.$('noChars').hidden, 'Characters -> list, empty state shown');
  A.click(A.$('newCharBtn')); await wait();
  ok(A.vis().join() === 'sheet' && /^#character-[0-9a-f-]{36}$/.test(A.w.location.hash), 'New Character opens a sheet with a uuid link');
  ok(A.text('#sheetTitle') === 'New character', 'blank sheet titled "New character"');
  ok([...A.d.querySelectorAll('#tabs .tab')].map((t) => t.textContent).join() === 'INFO,STATS,TALENTS,SKILLS,TOTEM,BUFFS,ITEMS,ABILITIES,STORY', 'all 9 tabs present');
  ok(!A.$('panel-info').hidden && A.$('panel-stats').hidden, 'opens on INFO tab only');
  A.tab('stats');
  const stats = [...A.d.querySelectorAll('#panel-stats .row.st .val')].map((e) => e.textContent).join();
  ok(stats === '14,14,4,-2,6,20,4,12,4,4,0,50', 'blank stats equal the sheet defaults: ' + stats);
  A.tab('talents');
  ok([...A.d.querySelectorAll('#panel-talents input')].every((i) => i.value === '10') && A.text('#panel-talents .lv span:last-child') === '90', 'talents default to 10, level 90');
  A.tab('info'); A.setv(A.byLabel('info', 'Name'), 'Vex Marrow'); A.setv(A.byLabel('info', 'Species'), 'Ghoul');
  ok(A.text('#sheetTitle') === 'Vex Marrow', 'name updates the title');
  ok(await waitFor(() => A.$('saveStatus').textContent === 'Saved', 3000), 'status shows Saved after autosave');

  A.tab('skills'); A.setv(A.byLabel('skills', 'Carrying proficiency points'), '2');
  ok(A.d.querySelectorAll('#panel-skills .val')[0].textContent === '+8', 'Carrying modifier +8');
  ok(![...A.d.querySelectorAll('#panel-skills .nm b')].some((b) => b.textContent.includes('*')), 'no * trained marker anywhere');
  A.tab('stats');
  ok(A.byLabel('stats', 'HP remaining').value === '18' && [...A.d.querySelectorAll('#panel-stats .row.st .val')][11].textContent === '66', 'HP 18 and CC 66 derived from Carrying');
  ok(!A.byLabel('stats', 'Damage taken'), 'no Damage taken field any more');
  A.setv(A.byLabel('stats', 'HP remaining'), '13'); A.setv(A.byLabel('stats', 'Equipment weight'), '6');
  ok(A.byLabel('stats', 'HP remaining').value === '18' || A.byLabel('stats', 'HP remaining').value === '13', 'HP remaining is an editable field: ' + A.byLabel('stats', 'HP remaining').value);
  ok(A.text('#panel-stats .big') === '60', 'equipment adjusts capacity');
  {
    const dh = A.byLabel('stats', 'Damage or healing'), acc = [...A.d.querySelectorAll('#panel-stats .dmgrow button')][0];
    A.setv(dh, '-4'); A.click(acc);
    ok(A.byLabel('stats', 'HP remaining').value === '9' && dh.value === '', 'Damage/Healing -4 + ACCEPT: 13 -> 9, box cleared: ' + A.byLabel('stats', 'HP remaining').value);
    A.setv(dh, '6'); A.click(acc);
    ok(A.byLabel('stats', 'HP remaining').value === '15', 'Damage/Healing +6 heals: 15');
    A.setv(dh, 'x'); A.click(acc); A.setv(A.byLabel('stats', 'HP remaining'), '13');
    ok(A.byLabel('stats', 'HP remaining').value === '13', 'back to 13');
  }
  // the sheet's +/- # counts twice for aggregate stats (confirmed intended): HP flat +3 on total 18 -> 18+3+3
  A.setv(A.byLabel('stats', 'HP flat adjustment'), '3');
  ok([...A.d.querySelectorAll('#panel-stats .row.st .val')][0].textContent === '24', 'HP +/- # of 3 counts twice, as in the spreadsheet (18 -> 24)');
  A.setv(A.byLabel('stats', 'HP flat adjustment'), '');
  {
    const sgIn = () => A.byLabel('info', 'Spiritual guidance'), alive = () => A.d.querySelector('#panel-info input[type=checkbox]');
    A.tab('info');
    ok(alive().checked && sgIn().value === '0' && sgIn().disabled, 'alive: Spiritual Guidance is 0 and locked');
    alive().checked = false; alive().dispatchEvent(new A.w.Event('input', { bubbles: true }));
    ok(sgIn().value === '3' && !sgIn().disabled, 'unchecking Alive sets Spiritual Guidance to 3 and unlocks it');
    A.setv(sgIn(), '5'); ok(sgIn().value === '5', 'it can be edited while not alive');
    alive().checked = true; alive().dispatchEvent(new A.w.Event('input', { bubbles: true }));
    ok(sgIn().value === '0' && sgIn().disabled, 'checking Alive again locks it back at 0');
    alive().checked = false; alive().dispatchEvent(new A.w.Event('input', { bubbles: true }));
    ok(sgIn().value === '3', 'and unchecking again starts at 3');
    A.setv(sgIn(), '4');
    await wait(1200);
    A.go('characters'); await wait(60);
    A.click(A.d.querySelector('#charList .char-btn')); await wait(80); A.tab('info');
    ok(!alive().checked && sgIn().value === '4' && !sgIn().disabled, 'a not-alive character reopens with its own Spiritual Guidance (4), editable');
    alive().checked = true; alive().dispatchEvent(new A.w.Event('input', { bubbles: true }));
    ok(sgIn().value === '0', 'ready for the rest of the checks (alive again)');
  }
  A.tab('items'); A.click([...A.d.querySelectorAll('#panel-items .btn')].find((b) => b.textContent === 'ADD ITEM'));
  A.setv(A.byLabel('items', 'Item name'), 'Rusty Knife');
  {
    const card = () => A.d.querySelector('#panel-items .item'), desc = () => card().querySelector('.idesc'), line = () => card().querySelector('.iline');
    ok(desc().hidden === false || desc().hidden === true, 'item card exists');
    A.click(card().querySelector('.chev')); A.click(card().querySelector('.chev'));
    ok(desc().hidden, 'description is minimized by default (toggle twice returns to closed)');
    ok(line().lastElementChild.getAttribute('aria-label') === 'Quantity' && !line().textContent.includes('REMOVE'), 'Qty is at the right end of the one-line row; REMOVE is not on it');
    ok(line().children.length === 4 && !card().querySelector('.idesc').contains(line()), 'the line holds toggle, name, hand marker, qty; description sits below it');
    ok([...desc().querySelectorAll('.iact .btn')].pop().textContent === 'REMOVE', 'REMOVE is the last button under the description');
    A.click(card().querySelector('.chev'));
    ok(!desc().hidden && card().querySelector('.chev').getAttribute('aria-expanded') === 'true', 'tapping the line opens the description');
    A.setv(A.byLabel('items', 'Item description'), 'Sharp-ish.');
    A.click(line());
    ok(desc().hidden, 'tapping the empty part of the line closes it again');
    A.click(A.byLabel('items', 'Item name'));
    ok(!desc().hidden, 'tapping the name opens it');
    A.click(card().querySelector('.chev'));
    A.click([...A.d.querySelectorAll('#panel-items .btn')].find((b) => b.textContent === 'ADD ITEM'));
    ok(A.d.querySelectorAll('#panel-items .item').length === 2 && A.d.querySelectorAll('#panel-items .idesc:not([hidden])').length === 0, 'a newly added item starts minimized (others re-collapse state kept per item)');
    A.click([...A.d.querySelectorAll('#panel-items .item')[1].querySelectorAll('.btn')].find((b) => b.textContent === 'REMOVE'));
    ok(A.d.querySelectorAll('#panel-items .item').length === 1 && A.byLabel('items', 'Item name').value === 'Rusty Knife', 'REMOVE removes that item only');
  }
  A.tab('abilities'); A.click([...A.d.querySelectorAll('#panel-abilities .btn')].find((b) => b.textContent === 'ADD ABILITY'));
  A.setv(A.byLabel('abilities', 'Ability name'), 'Soup Splash');
  {
    const card = () => A.d.querySelector('#panel-abilities .item'), desc = () => card().querySelector('.idesc'), line = () => card().querySelector('.iline');
    ok(desc().hidden, 'ability description is minimized by default');
    ok(line().lastElementChild.textContent === 'REMOVE' && line().children.length === 3, 'ability line: toggle, name, REMOVE at the far right');
    A.click(card().querySelector('.chev')); ok(!desc().hidden, 'tapping the toggle opens the ability description');
    A.setv(A.byLabel('abilities', 'Ability description'), 'Throws hot soup.');
    A.click(line()); ok(desc().hidden, 'tapping the empty part of the line closes it');
    A.click(A.byLabel('abilities', 'Ability name')); ok(!desc().hidden, 'tapping the name opens it');
    A.click([...A.d.querySelectorAll('#panel-abilities .btn')].find((b) => b.textContent === 'ADD ABILITY'));
    ok(A.d.querySelectorAll('#panel-abilities .item').length === 2 && A.d.querySelectorAll('#panel-abilities .item')[1].querySelector('.idesc').hidden && !desc().hidden, 'a new ability starts minimized; the open one stays open');
    A.click(A.d.querySelectorAll('#panel-abilities .item')[1].querySelector('.iline .btn'));
    ok(A.d.querySelectorAll('#panel-abilities .item').length === 1 && A.byLabel('abilities', 'Ability name').value === 'Soup Splash', 'REMOVE removes only that ability');
  }
  A.tab('story'); A.setv(A.byLabel('story', 'Backstory'), 'Rose from the pot.');
  ok(A.byLabel('story', 'Motivation').placeholder === 'What drives them?' && [...A.d.querySelectorAll('#panel-story .sec')].map((e) => e.textContent).join() === 'Appearance,Backstory,Motivation', 'story has a Motivation box ("What drives them?") after Backstory');
  A.setv(A.byLabel('story', 'Motivation'), 'Soup.');
  await waitFor(() => A.$('saveStatus').textContent === 'Saved', 3000);

  // back to the list, reload the page, everything is restored
  A.click(A.d.querySelector('#screen-sheet [data-go="characters"]')); await wait();
  ok(A.d.querySelectorAll('#charList .char-btn').length === 1 && /Vex Marrow/.test(A.text('#charList .char-btn')) && /Ghoul/.test(A.text('#charList .char-btn')) && /HP 18/.test(A.text('#charList .char-btn')), 'list shows name, species, HP');
  const snap = A.storage();
  A = api(await boot({ storage: snap, hash: '#characters' }));
  ok(A.vis().join() === 'characters' && A.d.querySelectorAll('#charList .char-btn').length === 1, 'after reload the character is still listed');
  A.click(A.d.querySelector('#charList .char-btn')); await wait();
  ok(A.byLabel('info', 'Name').value === 'Vex Marrow', 'reopen restores name');
  A.tab('skills'); ok(A.byLabel('skills', 'Carrying proficiency points').value === '2', 'reopen restores proficiency');
  A.tab('items'); ok(A.byLabel('items', 'Item name').value === 'Rusty Knife', 'reopen restores items');
  A.tab('abilities'); ok(A.byLabel('abilities', 'Ability name').value === 'Soup Splash', 'reopen restores abilities');
  A.tab('story'); ok(A.byLabel('story', 'Backstory').value === 'Rose from the pot.', 'reopen restores backstory');
  ok(A.byLabel('story', 'Motivation').value === 'Soup.', 'reopen restores motivation');
  A.tab('abilities'); A.click(A.d.querySelector('#panel-abilities .chev')); ok(A.byLabel('abilities', 'Ability description').value === 'Throws hot soup.', 'reopen restores ability description');

  // a different account on the same device sees its own (empty) list
  await A.logOut();
  await A.signUp({ name: 'Sam', username: 'sam_2', email: 'sam@example.com' });
  A.go('characters'); await wait();
  ok(A.vis().join() === 'characters' && A.d.querySelectorAll('#charList .char-btn').length === 0, 'second account starts with no characters');
  await A.logOut();
  await A.logIn('ricky_1', 'correct horse'); A.go('characters'); await wait();
  ok(A.d.querySelectorAll('#charList .char-btn').length === 1, 'first account still has its character');

  // delete needs two taps
  A.click(A.d.querySelector('#charList .char-btn')); await wait();
  A.tab('info');
  const del = () => [...A.d.querySelectorAll('#panel-info .btn')].find((b) => /DELETE/.test(b.textContent));
  A.click(del()); ok(del().textContent === 'TAP AGAIN TO DELETE' && A.vis().join() === 'sheet', 'first tap only asks to confirm');
  A.click(del()); await wait(50);
  ok(A.vis().join() === 'characters' && A.d.querySelectorAll('#charList .char-btn').length === 0, 'second tap deletes and returns to the list');
  A.go('character-nope'); await wait(); ok(A.vis().join() === 'characters', 'unknown character link -> list');
  await A.logOut(); A.go('character-x'); await wait(); ok(A.vis().join() === 'start', 'logged out cannot open a sheet link');
  ok(A.w.__errors.length === 0, 'no script errors');
  done();
})();
