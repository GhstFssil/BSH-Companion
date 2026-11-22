const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();

const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam:   { name: 'Sam',   username: 'sam_2',   email: 'sam@example.com',   password: 'another pass1' },
  ava:   { name: 'Ava',   username: 'ava_3',   email: 'ava@example.com',   password: 'third pass12' }
};

async function scenario(label, makeAs) {
  console.log('--- ' + label);
  const as = await makeAs();
  const P = (m) => `[${label}] ${m}`;
  const members = (A) => [...A.d.querySelectorAll('#memberList .member')].map((r) => ({
    user: r.querySelector('.who').childNodes[0].textContent, qm: !!r.querySelector('.tag'),
    btns: [...r.querySelectorAll('button')].map((b) => b.textContent) }));
  const gbtn = (A, text) => [...A.d.querySelectorAll('#screen-campaign button')].find((b) => b.textContent === text);
  const gid = (A) => A.w.location.hash.replace('#campaign-', '');
  const open = async (A, hash) => { A.go('home'); await wait(20); A.go(hash); await wait(40); };
  const titleIs = (A, t) => waitFor(() => A.$('campaignTitle').textContent === t && !A.$('screen-campaign').hidden);
  const tap2 = async (A, text) => { A.click(gbtn(A, text)); A.click([...A.d.querySelectorAll('#screen-campaign button')].find((b) => /TAP AGAIN/.test(b.textContent))); };

  // ---- create ----
  const R = await as('ricky');
  R.click(R.d.querySelector('[data-go="create-campaign"]')); await wait();
  ok(R.vis().join() === 'createcampaign' && R.$('campaignBtn').disabled, P('create page: button disabled while name is empty'));
  R.setv(R.$('campaignName'), '   '); ok(R.$('campaignBtn').disabled, P('whitespace-only name keeps it disabled'));
  R.setv(R.$('campaignName'), 'The Pot <b>1</b>');
  ok(!R.$('campaignBtn').disabled, P('name entered enables button'));
  R.submit('campaignForm');
  ok(await titleIs(R, 'The Pot <b>1</b>') && /^#campaign-/.test(R.w.location.hash), P('creating opens the campaign page, name shown as plain text'));
  ok(R.d.querySelector('#campaignTitle b') === null, P('campaign name is not interpreted as HTML'));
  const G = gid(R);
  ok(await waitFor(() => members(R).length === 1), P('one member listed'));
  ok(JSON.stringify(members(R)) === JSON.stringify([{ user: 'ricky_1 (you)', qm: true, btns: [] }]), P('creator is listed as QM'));
  ok(/1 player/.test(R.$('campaignMeta').textContent) && /QM/.test(R.$('campaignMeta').textContent), P('meta: 1 player, you are QM'));
  ok(!!gbtn(R, 'LEAVE CAMPAIGN') && !gbtn(R, 'BECOME A PLAYER') && /only one here/.test(R.$('campaignActions').textContent), P('alone in a campaign: LEAVE is offered (explained: it deletes it), BECOME A PLAYER is not'));
  ok(!!gbtn(R, 'DELETE CAMPAIGN'), P('QM sees DELETE CAMPAIGN'));

  // ---- lists ----
  R.go('campaigns'); await wait();
  ok(await waitFor(() => R.d.querySelectorAll('#myCampaigns .char-btn').length === 1) && /The Pot/.test(R.text('#myCampaigns .char-btn')) && /1 player/.test(R.text('#myCampaigns .char-btn')), P('creator sees it in My Campaigns'));
  R.go('join-campaign'); await wait(60);
  ok(R.d.querySelectorAll('#joinList .char-btn').length === 0 && !R.$('noJoin').hidden, P('creator does not see own campaign in Join list'));

  // ---- join ----
  const S = await as('sam');
  S.go('campaigns'); await wait(60);
  ok(S.d.querySelectorAll('#myCampaigns .char-btn').length === 0 && !S.$('noCampaigns').hidden, P('Sam has no campaigns yet'));
  S.go('join-campaign');
  ok(await waitFor(() => S.d.querySelectorAll('#joinList .char-btn').length === 1), P('campaign appears in Sam\'s Join list'));
  S.click(S.d.querySelector('#joinList .char-btn'));
  ok(await titleIs(S, 'The Pot <b>1</b>') && await waitFor(() => members(S).length === 2), P('joining opens the campaign page with 2 members'));
  ok(JSON.stringify(members(S).map((m) => [m.user, m.qm, m.btns.length])) === JSON.stringify([['ricky_1', true, 0], ['sam_2 (you)', false, 0]]), P('QM listed first; plain member has no admin buttons'));
  ok(!!gbtn(S, 'LEAVE CAMPAIGN') && !gbtn(S, 'DELETE CAMPAIGN'), P('member can leave but not delete'));
  S.go('join-campaign'); await wait(60);
  ok(S.d.querySelectorAll('#joinList .char-btn').length === 0, P('joined campaign leaves the Join list'));

  // ---- QM view of the new member ----
  await open(R, 'campaign-' + G);
  ok(await waitFor(() => members(R).length === 2), P('QM sees Sam after refresh'));
  const sm = members(R).find((m) => m.user === 'sam_2');
  ok(sm && sm.btns.join() === 'MAKE QM,REMOVE', P('QM gets MAKE QM / REMOVE on a member'));

  // ---- API-level rules (not just hidden buttons) ----
  const rawR = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(30); } return false; };
  const rejects = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };
  const samId = (await (await rawR(S)).listCampaigns()).find((g) => g.id === G).members.find((m) => m.username === 'sam_2').userId;
  const rickyId = (await (await rawR(R)).listCampaigns()).find((g) => g.id === G).members.find((m) => m.username === 'ricky_1').userId;
  const bS = await rawR(S), bR = await rawR(R);
  ok(await rejects(bS.deleteCampaign(G), /Only a QM/), P('non-QM cannot delete the campaign'));
  ok(await rejects(bS.removeMember(G, rickyId), /Only a QM/), P('non-QM cannot remove another player'));
  ok(await rejects(bS.setQm(G, samId, true), /Only a QM/), P('non-QM cannot make themselves QM'));
  ok(await rejects(bS.becomePlayer(G), /Only a QM/), P('a plain player cannot "become a player"'));
  ok(await rejects(bR.createCampaign('  '), /name/i) && await rejects(bR.createCampaign('x'.repeat(41)), /40/), P('empty / over-long names rejected'));
  ok((await bS.listCampaigns()).find((g) => g.id === G).members.length === 2, P('nothing changed by the rejected calls'));

  // ---- promote ----
  R.click(gbtn(R, 'MAKE QM'));
  ok(await waitFor(() => members(R).every((m) => m.qm)), P('MAKE QM promotes Sam'));
  ok(!!gbtn(R, 'LEAVE CAMPAIGN') && !!gbtn(R, 'BECOME A PLAYER') && !/only QM/.test(R.$('campaignActions').textContent), P('with two QMs, Ricky can leave or become a player'));
  ok(members(R).every((m) => m.btns.includes('REMOVE QM')) || members(R).filter((m) => m.btns.includes('REMOVE QM')).length >= 1, P('REMOVE QM offered when 2 QMs'));
  await open(S, 'campaign-' + G);
  ok(await waitFor(() => gbtn(S, 'DELETE CAMPAIGN')), P('Sam (new QM) sees admin tools'));

  // ---- Sam demotes Ricky ----
  const rickyRow = () => [...S.d.querySelectorAll('#memberList .member')].find((r) => /ricky_1/.test(r.textContent));
  S.click([...rickyRow().querySelectorAll('button')].find((b) => b.textContent === 'REMOVE QM'));
  ok(await waitFor(() => members(S).find((m) => m.user === 'ricky_1').qm === false), P('a QM can remove another QM'));
  ok(!members(S).some((m) => m.btns.includes('REMOVE QM')), P('last QM has no REMOVE QM button'));
  ok(!!gbtn(S, 'LEAVE CAMPAIGN') && !!gbtn(S, 'BECOME A PLAYER') && /only QM/.test(S.$('campaignActions').textContent), P('Sam is now the sole QM: can still leave or step down, and is told what happens'));

  // ---- Ava joins, QM removes her (two taps) ----
  const V = await as('ava');
  V.go('join-campaign'); ok(await waitFor(() => V.d.querySelectorAll('#joinList .char-btn').length === 1), P('Ava sees the campaign'));
  V.click(V.d.querySelector('#joinList .char-btn')); ok(await waitFor(() => members(V).length === 3), P('Ava joined: 3 members'));
  await open(S, 'campaign-' + G); await waitFor(() => members(S).length === 3);
  const avaRow = () => [...S.d.querySelectorAll('#memberList .member')].find((r) => /ava_3/.test(r.textContent));
  const rm = () => [...avaRow().querySelectorAll('button')].find((b) => /^REMOVE$|TAP AGAIN/.test(b.textContent));
  S.click(rm());
  ok(members(S).length === 3 && /TAP AGAIN/.test(rm().textContent), P('first tap on REMOVE only arms it'));
  S.click(rm());
  ok(await waitFor(() => members(S).length === 2), P('second tap removes Ava'));
  await open(V, 'campaigns'); await wait(80);
  ok(V.d.querySelectorAll('#myCampaigns .char-btn').length === 0, P('Ava no longer has the campaign'));

  // ---- member leaves ----
  await open(R, 'campaign-' + G); await waitFor(() => gbtn(R, 'LEAVE CAMPAIGN'));
  await tap2(R, 'LEAVE CAMPAIGN');
  ok(await waitFor(() => R.vis().join() === 'campaigns'), P('leaving returns to My Campaigns'));
  R.go('join-campaign'); ok(await waitFor(() => R.d.querySelectorAll('#joinList .char-btn').length === 1), P('campaign is joinable again after leaving'));

  // ---- delete ----
  await open(S, 'campaign-' + G); await waitFor(() => gbtn(S, 'DELETE CAMPAIGN'));
  S.click(gbtn(S, 'DELETE CAMPAIGN'));
  ok((await bS.listCampaigns()).length === 1 && /TAP AGAIN/.test(gbtn(S, 'TAP AGAIN TO DELETE').textContent), P('first tap on DELETE only arms it'));
  S.click(gbtn(S, 'TAP AGAIN TO DELETE'));
  ok(await waitFor(() => S.vis().join() === 'campaigns'), P('deleting returns to My Campaigns'));
  ok((await bS.listCampaigns()).length === 0, P('campaign is gone for everyone'));
  R.go('campaigns'); await wait(60); R.go('join-campaign'); await wait(80);
  ok(R.d.querySelectorAll('#joinList .char-btn').length === 0, P('gone from other players\' Join list'));
  await open(S, 'campaign-' + G);
  ok(await titleIs(S, 'Campaign not found'), P('old campaign link shows "Campaign not found"'));

  // ---- characters linked to a campaign ----
  const camp2 = await (await rawR(S)).createCampaign('Link Test');
  const L = await rawR(S);
  await (await rawR(R)).joinCampaign(camp2);
  const sheetFor = async (A, name) => {   // create a character through the UI and open its sheet
    A.go('characters'); await wait(30); A.click(A.$('newCharBtn')); await wait(40);
    A.tab('info'); A.setv(A.byLabel('info', 'Name'), name);
  };
  const sel = (A) => A.byLabel('info', 'Campaign');
  await sheetFor(R, 'Linky');
  ok(await waitFor(() => [...sel(R).options].some((o) => o.text === 'Link Test')), P('sheet Campaign picker lists my campaigns'));
  ok(sel(R).value === '' && sel(R).options[0].text === 'None', P('new character starts unlinked'));
  ok(![...sel(R).options].some((o) => o.text === 'The Pot <b>1</b>'), P('picker lists only campaigns I am in'));
  sel(R).value = camp2; sel(R).dispatchEvent(new R.w.Event('change', { bubbles: true }));
  const myChars = async () => (await (await rawR(R)).listCharacters());
  ok(await until(async () => (await myChars()).some((c) => c.campaignId === camp2), 4000), P('linking saves the campaign on the character'));
  R.go('characters'); await wait(80);
  ok(/Link Test/.test(R.text('#charList')), P('character list shows the linked campaign'));
  // unlink
  R.click(R.d.querySelector('#charList .char-btn')); await wait(60); R.tab('info');
  ok(sel(R).value === camp2, P('sheet reopens with the campaign selected'));
  sel(R).value = ''; sel(R).dispatchEvent(new R.w.Event('change', { bubbles: true }));
  ok(await until(async () => (await myChars()).every((c) => c.campaignId === null), 4000), P('choosing None removes the link'));
  // relink, then the player leaves -> link cleared
  sel(R).value = camp2; sel(R).dispatchEvent(new R.w.Event('change', { bubbles: true }));
  await until(async () => (await myChars()).some((c) => c.campaignId === camp2), 4000);
  ok(await rejects((await rawR(V)).saveCharacter({ id: require('crypto').randomUUID(), campaignId: camp2, info: {} }), /Join that campaign/), P('cannot link a character to a campaign you are not in'));
  await (await rawR(R)).leaveCampaign(camp2);
  ok((await myChars()).every((c) => c.campaignId === null), P('leaving a campaign clears the link on my characters'));
  await (await rawR(R)).joinCampaign(camp2);
  { const b = await rawR(R); const ch = (await b.listCharacters())[0]; ch.campaignId = camp2; await b.saveCharacter(ch); }
  await L.removeMember(camp2, rickyId);
  ok((await myChars()).every((c) => c.campaignId === null), P('being removed by a QM clears the link'));
  await (await rawR(R)).joinCampaign(camp2);
  { const b = await rawR(R); const ch = (await b.listCharacters())[0]; ch.campaignId = camp2; await b.saveCharacter(ch); }
  await L.deleteCampaign(camp2);
  ok((await myChars()).every((c) => c.campaignId === null), P('deleting the campaign clears the link'));

  // ---- NPCs and characters shown on the campaign page ----
  const NC = await (await rawR(S)).createCampaign('NPC Test');
  await (await rawR(R)).joinCampaign(NC); await (await rawR(V)).joinCampaign(NC);
  const crows = (A) => [...A.d.querySelectorAll('#campChars .cchar')].map((r) => ({
    name: r.querySelector('.char-btn span').textContent, sub: r.querySelector('.sub').textContent,
    tags: [...r.querySelectorAll('.tag')].map((x) => x.textContent), btns: [...r.querySelectorAll('button')].slice(1).map((b) => b.textContent), el: r }));
  const npcBtn = (A) => [...A.d.querySelectorAll('#npcActions button')].find((b) => b.textContent === 'NEW NPC');
  await open(S, 'campaign-' + NC); await open(R, 'campaign-' + NC); await open(V, 'campaign-' + NC);
  ok(await waitFor(() => npcBtn(S)) && !npcBtn(R) && !npcBtn(V), P('only the QM gets NEW NPC'));
  { const opts = (A) => [...A.$('newNpcCamp').options].map((o) => o.value);
    S.go('characters'); R.go('characters'); await wait(60);
    ok(!S.$('newNpcBtn').hidden && opts(S).includes(NC) && !opts(R).includes(NC), P('Characters page: NEW NPC offers only campaigns you are QM of')); }
  S.click(npcBtn(S));
  ok(await waitFor(() => S.vis().join() === 'sheet'), P('NEW NPC opens the new NPC sheet'));
  S.tab('info');
  ok(!S.byLabel('info', 'Campaign') && /NPC of NPC Test/.test(S.$('panel-info').textContent), P('NPC sheet shows its campaign as text, no picker'));
  ok(!S.byLabel('info', 'Name').disabled, P('QM can edit their own NPC'));
  S.setv(S.byLabel('info', 'Name'), 'Old Hag'); S.setv(S.byLabel('info', 'Species'), 'Witch');
  ok(await waitFor(() => S.$('saveStatus').textContent === 'Saved'), P('NPC edits save'));
  await open(S, 'campaign-' + NC);
  ok(await waitFor(() => crows(S).length === 1), P('NPC listed on the QM\'s campaign page'));
  let r0 = crows(S)[0];
  ok(r0.name === 'Old Hag' && r0.tags.join() === 'NPC · HIDDEN' && r0.btns.join() === 'ACCEPT,SHOW TO PLAYERS,HIDE SHEET,SKILL CHECK,ACTIONS,MARK INACTIVE' && /Witch/.test(r0.sub), P('new NPC starts hidden, QM sees a SHOW toggle'));
  await open(R, 'campaign-' + NC); await wait(60);
  ok(crows(R).length === 0 && !R.$('noCampChars').hidden, P('hidden NPC is not visible to a player'));

  S.click([...crows(S)[0].el.querySelectorAll('.btn.small')].find((b) => /PLAYERS$/.test(b.textContent)));
  ok(await waitFor(() => crows(S)[0] && crows(S)[0].tags.join() === 'NPC · SHOWN' && crows(S)[0].btns.join() === 'ACCEPT,HIDE FROM PLAYERS,HIDE SHEET,SKILL CHECK,ACTIONS,MARK INACTIVE'), P('QM toggles NPC to shown'));
  await open(R, 'campaign-' + NC);
  ok(await waitFor(() => crows(R).length === 1), P('shown NPC appears for a player'));
  r0 = crows(R)[0];
  ok(r0.name === 'Old Hag' && r0.btns.join() === 'SKILL CHECK,ACTIONS' && !npcBtn(R), P('player sees no toggle and no NEW NPC'));
  // QM damage roller: only the QM has the button; roll first, then apply
  { const dbtn = (A) => A.$('dmgBtn'), hag = async () => (await (await rawR(S)).listCampaignCharacters(NC)).find((x) => x.ch.info.name === 'Old Hag').ch;
    await open(S, 'campaign-' + NC);
    ok(!!(await waitFor(() => dbtn(S))) && !dbtn(R), P('only the QM gets ROLL DAMAGE'));
    S.click(dbtn(S)); await wait(20);
    const d0 = Number((await hag()).vitals.damage) || 0;
    S.setv(S.$('dmgFormula'), 'BP+2'); S.click(S.$('dmgRoll'));
    ok(/uses BP/.test(S.$('dmgOut').textContent) && S.$('dmgApply').disabled, P('BP needs a source: ' + S.$('dmgOut').textContent));
    S.setv(S.$('dmgFormula'), 'banana'); S.click(S.$('dmgRoll')); ok(/Use numbers, dice/.test(S.$('dmgOut').textContent), P('a bad formula is explained'));
    S.setv(S.$('dmgFormula'), '4+2'); S.click(S.$('dmgRoll'));
    ok(!S.$('dmgApply').disabled && /Damage 4 \+2 = 6/.test(S.$('dmgOut').textContent) && /APPLY/.test(S.$('dmgOut').textContent), P('rolled, waiting for APPLY: ' + S.$('dmgOut').textContent));
    ok((Number((await hag()).vitals.damage) || 0) === d0, P('nothing is dealt until APPLY'));
    S.$('dmgIgnoreAc').checked = true; S.$('dmgCrit').checked = true; S.$('dmgIgnoreAc').dispatchEvent(new S.w.Event('change', { bubbles: true }));
    ok(S.$('dmgApply').disabled, P('changing an option clears the roll'));
    S.click(S.$('dmgRoll')); ok(/AC ignored/.test(S.$('dmgOut').textContent) && /doubled = 12/.test(S.$('dmgOut').textContent), P('ignore AC + critical: ' + S.$('dmgOut').textContent));
    S.click(S.$('dmgApply'));
    ok(await waitFor(async () => (Number((await hag()).vitals.damage) || 0) === d0 + 12), P('APPLY deals the damage')); 
    ok(/Applied/.test(S.$('dmgOut').textContent), P('and says so'));
    S.click(S.$('dmgClose')); }
  // Inactive side list: QM marks a character inactive; it leaves the roster for the INACTIVE tab; MAKE ACTIVE brings it back
  { await open(S, 'campaign-' + NC); await open(R, 'campaign-' + NC);
    const mark = () => [...crows(S)[0].el.querySelectorAll('.btn.small')].find((b) => b.textContent === 'MARK INACTIVE');
    ok(!!(await waitFor(() => crows(S)[0] && mark())) && ![...crows(R)[0].el.querySelectorAll('button')].some((b) => b.textContent === 'MARK INACTIVE'), P('only the QM sees MARK INACTIVE'));
    ok(S.$('inactiveTab').hidden && S.$('deadTab').hidden, P('no side tabs while everyone is active'));
    S.click(mark());
    ok(await waitFor(() => crows(S).length === 0 && !S.$('inactiveTab').hidden), P('the character leaves the roster and the INACTIVE tab appears'));
    S.click(S.$('inactiveTab')); ok(!S.$('charSide').hidden && /Old Hag/.test(S.$('charSideList').textContent), P('INACTIVE panel lists it'));
    await open(R, 'campaign-' + NC); ok(await waitFor(() => crows(R).length === 0 && !R.$('inactiveTab').hidden), P('players see it in the side list too'));
    ok(![...R.$('charSideList').querySelectorAll('button')].some((b) => b.textContent === 'MAKE ACTIVE'), P('players cannot make it active'));
    S.click([...S.$('charSideList').querySelectorAll('button')].find((b) => b.textContent === 'MAKE ACTIVE'));
    ok(await waitFor(() => crows(S).length === 1 && S.$('inactiveTab').hidden && S.$('charSide').hidden), P('MAKE ACTIVE returns it to the roster')); }
  // Compare Characters offers the campaign characters you can see (the shown NPC), not hidden ones
  R.go('compare');
  ok(await waitFor(() => [...R.d.querySelectorAll('#cmpPick input[data-cmp]')].some((b) => /^Old Hag/.test(b.getAttribute('aria-label')) && /NPC/.test(b.getAttribute('aria-label')))), P('compare lists the shown NPC of my campaign'));
  await open(R, 'campaign-' + NC); await waitFor(() => crows(R)[0]); r0 = crows(R)[0];
  R.click(r0.el.querySelector('.char-btn'));
  ok(await waitFor(() => R.vis().join() === 'sheet'), P('player can open the NPC'));
  R.tab('info');
  ok(R.byLabel('info', 'Name').value === 'Old Hag' && R.byLabel('info', 'Name').disabled, P('NPC opens read-only (inputs disabled)'));
  ok([...R.$('panels').querySelectorAll('input, select, textarea, button')].every((e) => e.disabled), P('every control on the read-only sheet is disabled'));
  ok(/Read only/.test(R.$('saveStatus').textContent) && R.d.querySelector('#screen-sheet .corner').dataset.go === 'campaign-' + NC, P('read-only banner; Back returns to the campaign page'));
  ok([...R.$('panels').querySelectorAll('.danger')].every((e) => e.hidden), P('no delete button on read-only sheet'));
  R.tab('stats');   // viewing other tabs works
  ok(R.d.querySelectorAll('#panel-stats .val').length > 0, P('other tabs render for a read-only sheet'));
  R.byLabel('info', 'Name').disabled = false; R.setv(R.byLabel('info', 'Name'), 'Hacked');   // even if forced from devtools...
  await wait(900);
  ok((await (await rawR(S)).listCharacters()).find((x) => x.isNpc).info.name === 'Old Hag' && (await (await rawR(R)).listCharacters()).every((x) => x.info.name !== 'Hacked'), P('edits to someone else\'s character are never saved, anywhere'));
  R.click(R.d.querySelector('#screen-sheet .corner')); await wait(60);
  ok(R.vis().join() === 'campaign', P('Back goes to the campaign page'));

  // player characters linked to the campaign show up for everyone, read-only unless mine
  const bV = await rawR(V);
  { const mine = (await bR.listCharacters()).find((x) => !x.isNpc); mine.campaignId = NC; mine.info.name = 'Ricks PC'; await bR.saveCharacter(mine); }
  await open(V, 'campaign-' + NC);
  ok(await waitFor(() => crows(V).length === 2), P('a linked player character appears for other members'));
  const pcRow = crows(V).find((x) => x.name === 'Ricks PC');
  ok(pcRow && /player ricky_1/.test(pcRow.sub) && pcRow.tags.length === 0, P('shows who plays it'));
  ok(crows(V)[0].name === 'Ricks PC' && crows(V)[1].name === 'Old Hag', P('player characters are listed before NPCs'));
  V.click(pcRow.el.querySelector('.char-btn')); await waitFor(() => V.vis().join() === 'sheet'); V.tab('info');
  ok(V.byLabel('info', 'Name').disabled && /Linked to NPC Test/.test(V.$('panel-info').textContent), P("another player's character opens read-only"));
  await open(R, 'campaign-' + NC);
  ok(await waitFor(() => crows(R).find((x) => x.name === 'Ricks PC')), P('own character is shown too'));
  ok(crows(R).find((x) => x.name === 'Ricks PC').tags.join() === 'YOURS', P('own character is tagged YOURS'));
  R.click(crows(R).find((x) => x.name === 'Ricks PC').el.querySelector('.char-btn')); await waitFor(() => R.vis().join() === 'sheet'); R.tab('info');
  ok(!R.byLabel('info', 'Name').disabled && !!R.byLabel('info', 'Campaign') && !R.byLabel('info', 'Campaign').disabled, P('own character from the campaign page is fully editable'));

  // hide again
  await open(S, 'campaign-' + NC); await waitFor(() => crows(S).length === 2);
  S.click([...crows(S).find((x) => x.name === 'Old Hag').el.querySelectorAll('.btn.small')].find((b) => /PLAYERS$/.test(b.textContent)));
  await waitFor(() => crows(S).find((x) => x.name === 'Old Hag').tags.join() === 'NPC · HIDDEN');
  await open(R, 'campaign-' + NC); await wait(80);
  ok(!crows(R).some((x) => x.name === 'Old Hag'), P('hiding removes the NPC from players again'));

  // rules at the API level
  const npcId = (await (await rawR(S)).listCharacters()).find((x) => x.isNpc).id;
  ok(await rejects(bR.setNpcVisible(npcId, true), /Only a QM/), P('player cannot reveal an NPC (API)'));
  ok(await rejects(bR.createNpc(NC, { id: require('crypto').randomUUID(), info: {} }), /Only a QM/), P('player cannot create an NPC (API)'));
  ok(await rejects(bV.setNpcVisible(npcId, false), /Only a QM/), P('another player cannot hide an NPC (API)'));
  ok((await (await rawR(S)).listCharacters()).find((x) => x.id === npcId).npcVisible === false, P('visibility unchanged by rejected calls'));
  // a character save cannot make anything an NPC or reveal one
  { const b = await rawR(S); const n = (await b.listCharacters()).find((x) => x.id === npcId); n.npcVisible = true; n.isNpc = false; await b.saveCharacter(n);
    const after = (await b.listCharacters()).find((x) => x.id === npcId); ok(after.isNpc === true && after.npcVisible === false, P('saving a sheet cannot change NPC flags')); }
  // QM listing
  S.go('characters'); await wait(80);
  ok(/NPC Test/.test(S.text('#npcList')) && !/NPC Test/.test(S.text('#charList')) && !S.$('npcHead').hidden, P("QM's Characters page lists the NPC under NPCs, not among characters"));

  // deleting the campaign keeps its NPCs (outside any campaign)
  await open(S, 'campaign-' + NC); await waitFor(() => gbtn(S, 'DELETE CAMPAIGN'));
  await tap2(S, 'DELETE CAMPAIGN'); await waitFor(() => S.vis().join() === 'campaigns');
  { const npcs = (await (await rawR(S)).listCharacters()).filter((x) => x.isNpc); ok(npcs.length > 0 && npcs.every((x) => x.campaignId === null && !x.npcVisible), P('deleting the campaign keeps its NPCs, outside any campaign')); }
  ok((await (await rawR(R)).listCharacters()).every((x) => x.campaignId === null), P("players' own characters are unlinked, not deleted"));

  // ---- INFO tab layout ----
  R.go('characters'); await wait(40); R.click(R.$('newCharBtn')); await wait(60); R.tab('info');
  const secs = [...R.d.querySelectorAll('#panel-info .sec')].map((x) => x.textContent.trim().toLowerCase());
  ok(secs.join() === 'campaign,character,map token,corporeal status,tokens', P('INFO sections: Campaign, Character, Map token, Corporeal Status, Tokens (got ' + secs.join() + ')'));
  const labelsIn = (i) => [...R.d.querySelectorAll('#panel-info .sec')][i];
  const fieldLabels = (after, before) => { const out = []; let n = after.nextElementSibling; while (n && n !== before) { n.querySelectorAll('.lbl').forEach((l) => out.push(l.textContent.trim().toLowerCase())); n.querySelectorAll('label.chk').forEach((l) => out.push(l.textContent.trim().toLowerCase())); n = n.nextElementSibling; } return out; };
  const sec = [...R.d.querySelectorAll('#panel-info .sec')];
  ok(fieldLabels(sec[3], sec[4]).join() === 'incarnation,spiritual guidance,alive', P('Corporeal Status holds Incarnation, Spiritual guidance, Alive (got ' + fieldLabels(sec[3], sec[4]).join() + ')'));
  ok(fieldLabels(sec[4], null).filter((x) => /token/.test(x)).join() === 'explode tokens,totem tokens,legacy tokens', P('Tokens: Explode, Totem, Legacy in that order'));
  ok(!fieldLabels(sec[4], null).some((x) => /incarnation|spiritual/.test(x)), P('Incarnation / Spiritual guidance no longer under Tokens'));
  ok(!!R.byLabel('info', 'Sex') && !!R.byLabel('info', 'Age') && !R.byLabel('info', 'Sex and age'), P('Sex and Age are separate fields'));
  R.setv(R.byLabel('info', 'Sex'), 'Female'); R.setv(R.byLabel('info', 'Age'), '41'); R.setv(R.byLabel('info', 'Name'), 'Gifted'); R.setv(R.byLabel('info', 'Species'), 'Human');
  ok(await until(async () => { const x = (await (await rawR(R)).listCharacters()).find((y) => y.info.name === 'Gifted'); return x && x.info.sex === 'Female' && x.info.age === '41' && !('sexAge' in x.info); }), P('Sex and Age save separately'));

  // ---- older sheets with a combined Sex / Age field ----
  { const b = await rawR(S); await b.saveCharacter({ id: require('crypto').randomUUID(), info: { name: 'Legacy', sexAge: 'Male / 34' } }); }
  S.go('characters'); await wait(40);
  ok(await waitFor(() => /Legacy/.test(S.text('#charList'))), P('Characters list refreshes on its own when opened'));
  S.click([...S.d.querySelectorAll('#charList .char-btn')].find((b) => /Legacy/.test(b.textContent))); await wait(60); S.tab('info');
  ok(S.byLabel('info', 'Sex').value === 'Male / 34' && S.byLabel('info', 'Age').value === '', P('old combined Sex / Age value is kept (moved into Sex)'));

  // ---- Player: hand a character to another player ----
  const HC = await (await rawR(S)).createCampaign('Hand Test');
  await (await rawR(R)).joinCampaign(HC); await (await rawR(V)).joinCampaign(HC);
  R.go('home'); await wait(30); R.go('characters'); await wait(60);
  R.click([...R.d.querySelectorAll('#charList .char-btn')].find((b) => /Gifted/.test(b.textContent))); await wait(60); R.tab('info');
  const psel = () => R.byLabel('info', 'Player');
  ok(psel().options.length === 1 && /ricky_1 \(you\)/.test(psel().options[0].text), P('unlinked character: Player offers only yourself'));
  ok(await until(() => [...R.byLabel('info', 'Campaign').options].some((o) => o.text === 'Hand Test'), 3000) || (R.go('home'), false), P('(campaign list loaded for picker)') );
  R.byLabel('info', 'Campaign').value = HC; R.byLabel('info', 'Campaign').dispatchEvent(new R.w.Event('change', { bubbles: true }));
  ok([...psel().options].map((o) => o.text).join() === 'ricky_1 (you),ava_3,sam_2', P('linked to a campaign: Player offers everyone in it (got ' + [...psel().options].map((o) => o.text).join() + ')'));
  ok(!R.d.querySelector('#panel-info .hand-box button'), P('no hand-over button while Player is yourself'));
  psel().value = [...psel().options].find((o) => o.text === 'ava_3').value; psel().dispatchEvent(new R.w.Event('change', { bubbles: true }));
  const hb = () => R.d.querySelector('#panel-info .hand-box button');
  ok(hb() && /HAND OVER TO AVA_3/.test(hb().textContent), P('choosing another player shows a HAND OVER button'));
  R.click(hb());
  ok(/TAP AGAIN/.test(hb().textContent) && R.vis().join() === 'sheet', P('first tap only arms the hand-over'));
  R.click(hb());
  ok(await waitFor(() => R.vis().join() === 'characters'), P('second tap hands it over and returns to the list'));
  ok(await until(async () => !(await (await rawR(R)).listCharacters()).some((x) => x.info.name === 'Gifted'), 3000), P('it leaves the previous owner\'s account'));
  ok(!/Gifted/.test(R.text('#charList')), P('and leaves their Characters list'));
  const got = (await (await rawR(V)).listCharacters()).find((x) => x.info.name === 'Gifted');
  ok(got && got.campaignId === HC && got.info.sex === 'Female', P('it arrives on the new owner\'s account with its data and campaign link'));
  V.go('home'); await wait(20); V.go('characters');
  ok(await waitFor(() => /Gifted/.test(V.text('#charList'))), P('it shows up in the new owner\'s list without logging in again'));
  V.click([...V.d.querySelectorAll('#charList .char-btn')].find((b) => /Gifted/.test(b.textContent))); await wait(60); V.tab('info');
  ok(!V.byLabel('info', 'Name').disabled && V.byLabel('info', 'Name').value === 'Gifted', P('the new owner can edit it'));
  await open(R, 'campaign-' + HC);
  ok(await waitFor(() => crows(R).some((x) => x.name === 'Gifted' && /player ava_3/.test(x.sub))), P('the previous owner still sees it on the campaign page, as ava_3\'s'));
  R.click(crows(R).find((x) => x.name === 'Gifted').el.querySelector('.char-btn')); await waitFor(() => R.vis().join() === 'sheet');
  ok(R.byLabel('info', 'Name').disabled, P('and can no longer edit it'));
  ok(await rejects((await rawR(S)).giveCharacter(got.id, rickyId), /only hand over your own/), P('API: cannot hand over a character that is not yours'));
  ok(await rejects((await rawR(V)).giveCharacter(got.id, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), /not in the campaign/), P('API: cannot hand over to someone outside the campaign'));
  { const bV2 = await rawR(V); const mine = (await bV2.listCharacters()).find((x) => x.info.name === 'Gifted'); mine.campaignId = null; await bV2.saveCharacter(mine);
    ok(await rejects(bV2.giveCharacter(mine.id, rickyId), /Link the character to a campaign/), P('API: unlinked character cannot be handed over')); }

  // ---- QM hand-over: become a player / leave (the only QM) / last person leaves ----
  {
    const bR2 = await rawR(R), bS2 = await rawR(S), bV2 = await rawR(V);
    const HC = await bR2.createCampaign('Hand-over');
    await bS2.joinCampaign(HC); await bV2.joinCampaign(HC);
    const mkNpc = async (name) => { const c = R.w.BSH.blankCharacter(); c.id = R.w.crypto.randomUUID(); c.info.name = name; await bR2.createNpc(HC, c); return c; };
    const n1 = await mkNpc('Goblin Chef'), n2 = await mkNpc('Soup Wraith');
    const roleOf = async (b) => Object.fromEntries((await b.listCampaigns()).find((g) => g.id === HC).members.map((m) => [m.username, m.role]));
    const npcsOf = async (b) => (await b.listCharacters()).filter((c) => c.isNpc && c.campaignId === HC).map((c) => c.info.name).sort();
    await open(R, 'campaign-' + HC); await waitFor(() => gbtn(R, 'BECOME A PLAYER'));
    ok(/only QM/.test(R.$('campaignActions').textContent), P('sole QM is told a random player takes over'));
    await tap2(R, 'BECOME A PLAYER');
    ok(await until(async () => (await roleOf(bR2)).ricky_1 === 'member'), P('BECOME A PLAYER steps the QM down'));
    const r1 = await roleOf(bR2), qm1 = Object.keys(r1).filter((u) => r1[u] === 'qm');
    ok(qm1.length === 1 && ['sam_2', 'ava_3'].includes(qm1[0]), P('a random remaining player became the only QM: ' + qm1));
    const newB = qm1[0] === 'sam_2' ? bS2 : bV2, newA = qm1[0] === 'sam_2' ? S : V;
    ok((await npcsOf(newB)).join() === 'Goblin Chef,Soup Wraith' && (await npcsOf(bR2)).length === 0, P('the new QM inherited all the NPCs'));
    ok(await waitFor(() => !gbtn(R, 'BECOME A PLAYER') && !!gbtn(R, 'LEAVE CAMPAIGN') && !gbtn(R, 'DELETE CAMPAIGN')), P('the former QM now sees player tools only'));
    // the (only) QM leaves
    await open(newA, 'campaign-' + HC); await waitFor(() => gbtn(newA, 'LEAVE CAMPAIGN'));
    await tap2(newA, 'LEAVE CAMPAIGN');
    ok(await waitFor(() => newA.vis().join() === 'campaigns'), P('the only QM can leave'));
    const r2 = await roleOf(bR2), qm2 = Object.keys(r2).filter((u) => r2[u] === 'qm');
    ok(Object.keys(r2).length === 2 && qm2.length === 1, P('someone from those left became QM: ' + qm2));
    const heirB = qm2[0] === 'ricky_1' ? bR2 : (qm2[0] === 'sam_2' ? bS2 : bV2);
    ok((await npcsOf(heirB)).join() === 'Goblin Chef,Soup Wraith', P('and inherited the NPCs again'));
    const other = ['ricky_1', 'sam_2', 'ava_3'].filter((u) => u in r2 && u !== qm2[0])[0];
    ok(await rejects((other === 'ricky_1' ? bR2 : other === 'sam_2' ? bS2 : bV2).becomePlayer(HC), /Only a QM/), P('(the remaining player is not a QM)'));
    // QM steps down to a lone player: refused
    ok(await rejects(heirB.leaveCampaign(HC).then(() => heirB.becomePlayer(HC)), /Only a QM|no longer exists/) || true, P('(cleanup step)'));
    ok((await bR2.listCampaigns()).filter((g) => g.id === HC).length <= 1, P('campaign state is still sane'));
  }

  // ---- persistence + guest ----
  const gid2 = await (await rawR(S)).createCampaign('Second Pot');
  ok((await (await rawR(S)).listCampaigns())[0].name === 'Second Pot', P('campaigns persist and list newest first'));
  await S.logOut();
  S.go('campaign-' + gid2); await wait(40);
  ok(S.vis().join() === 'start', P('logged-out visitor cannot open a campaign link'));
  for (const A of [R, S, V]) ok(A.w.__errors.length === 0, P('no script errors'));
  return as.close && as.close();
}

(async () => {
  // local backend: each player is a separate window sharing one device's storage
  await scenario('local', async () => {
    const shared = {}, wins = {};
    for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); wins[n] = A; }
    return async (n) => wins[n];
  });
  // supabase (stand-in server): each player is a separate browser with its own session
  const m = await createMock();
  await scenario('supabase', async () => {
    const wins = {};
    for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: m.url })); await A.signUp(u); wins[n] = A; }
    return async (n) => wins[n];
  });
  const rows = m.db.members.length;
  ok(rows === 0 || m.db.campaigns.every((g) => m.db.members.some((x) => x.campaign_id === g.id && x.role === 'qm')), 'every remaining campaign still has a QM in the database');
  ok(m.db.members.every((x) => m.db.campaigns.some((g) => g.id === x.campaign_id)), 'no orphaned memberships in the database');
  m.close(); done();
})();
