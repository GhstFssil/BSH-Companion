(() => {
  'use strict';
  const BSH = window.BSH;

  /* ================= Pixel text ================= */
  const GLYPHS = {
    A:['01110','10001','10001','11111','10001','10001','10001'],
    B:['11110','10001','10001','11110','10001','10001','11110'],
    C:['01110','10001','10000','10000','10000','10001','01110'],
    D:['11110','10001','10001','10001','10001','10001','11110'],
    E:['11111','10000','10000','11110','10000','10000','11111'],
    F:['11111','10000','10000','11110','10000','10000','10000'],
    G:['01110','10001','10000','10111','10001','10001','01111'],
    H:['10001','10001','10001','11111','10001','10001','10001'],
    I:['01110','00100','00100','00100','00100','00100','01110'],
    J:['00111','00010','00010','00010','00010','10010','01100'],
    K:['10001','10010','10100','11000','10100','10010','10001'],
    L:['10000','10000','10000','10000','10000','10000','11111'],
    M:['10001','11011','10101','10101','10001','10001','10001'],
    N:['10001','11001','10101','10011','10001','10001','10001'],
    O:['01110','10001','10001','10001','10001','10001','01110'],
    P:['11110','10001','10001','11110','10000','10000','10000'],
    Q:['01110','10001','10001','10001','10101','10010','01101'],
    R:['11110','10001','10001','11110','10100','10010','10001'],
    S:['01111','10000','10000','01110','00001','00001','11110'],
    T:['11111','00100','00100','00100','00100','00100','00100'],
    U:['10001','10001','10001','10001','10001','10001','01110'],
    V:['10001','10001','10001','10001','10001','01010','00100'],
    W:['10001','10001','10001','10101','10101','11011','10001'],
    X:['10001','10001','01010','00100','01010','10001','10001'],
    Y:['10001','10001','01010','00100','00100','00100','00100'],
    Z:['11111','00001','00010','00100','01000','10000','11111'],
    '<':['00010','00100','01000','10000','01000','00100','00010']
  };
  const NS = 'http://www.w3.org/2000/svg';

  function lineWidth(text) {
    let x = 0;
    for (const ch of text) x += ch === ' ' ? 4 : 6;
    return Math.max(0, x - 1);
  }

  function pixelSVG(lines, fluid) {
    const gap = 3;
    const W = Math.max(...lines.map(lineWidth));
    const H = lines.length * 7 + (lines.length - 1) * gap;
    let d = '';
    lines.forEach((text, i) => {
      let x = Math.floor((W - lineWidth(text)) / 2);
      const y0 = i * (7 + gap);
      for (const ch of text) {
        if (ch === ' ') { x += 4; continue; }
        (GLYPHS[ch] || []).forEach((bits, r) => {
          for (let c = 0; c < 5; c++) if (bits[c] === '1') d += `M${x + c} ${y0 + r}h1v1h-1z`;
        });
        x += 6;
      }
    });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    if (!fluid) {            // size from the element's font-size: 1em = 7 pixel rows
      svg.style.height = (H / 7) + 'em';
      svg.style.width = (W / 7) + 'em';
    }
    return svg;
  }

  function setPx(el, raw) {
    el.classList.add('px');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', raw.replace('<', '').replace('|', ' ').trim().toLowerCase());
    el.replaceChildren(pixelSVG(raw.split('|'), el.hasAttribute('data-fluid')));
  }
  document.querySelectorAll('[data-px]').forEach((el) => setPx(el, el.dataset.px));

  /* ================= Accounts + storage (see backend.js) ================= */
  const backend = window.BSHBackend.create(window.BSH_CONFIG);
  const state = { user: null, chars: [], campaigns: [], campChars: [], campCharsFor: null };
  let booted = false;
  let curCampaignId = null;

  function normalizeChar(raw) {
    const c = Object.assign(BSH.blankCharacter(), raw);
    c.info = Object.assign(BSH.blankCharacter().info, raw.info || {});
    if (c.info.sexAge) {   // older sheets had one combined field
      if (!c.info.sex && !c.info.age) c.info.sex = c.info.sexAge;
    }
    delete c.info.sexAge;
    c.vitals = Object.assign(BSH.blankCharacter().vitals, raw.vitals || {});
    return c;
  }
  // Pick up changes made elsewhere (another device, or a character handed to you) when the list opens
  async function refreshChars() {
    if (!state.user || pending || saving || saveTimer) return;
    try {
      const list = (await backend.listCharacters()).map(normalizeChar);
      if (!state.user || pending || saving || saveTimer) return;
      state.chars = list;
    } catch (e) { return; }
    if (campaignsLoaded) syncCharLinks();
    if (!$('screen-characters').hidden) renderCharList();
  }
  async function loadChars() {
    try {
      state.chars = (await backend.listCharacters()).map(normalizeChar);
      $('listMsg').textContent = '';
    } catch (e) {
      state.chars = [];
      $('listMsg').textContent = e.message;
    }
  }
  const findChar = (id) => state.chars.find((c) => c.id === id) || null;

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  /* ================= Small helpers ================= */
  function $(id) { return document.getElementById(id); }
  function h(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null) e.append(c); });
    return e;
  }
  const fmt = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));
  const signed = (x) => (x > 0 ? '+' + x : String(x));

  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, val) {
    const ks = path.split('.');
    const last = ks.pop();
    const parent = ks.reduce((a, k) => a[k], o);
    parent[last] = val;
  }

  /* ================= Routing ================= */
  const SCREENS = ['loading', 'start', 'rules', 'guide', 'notes', 'compare', 'login', 'forgot', 'reset', 'create', 'home', 'options', 'campaigns', 'createcampaign', 'joincampaign', 'campaign', 'spawn', 'maps', 'mapedit', 'mapview', 'characters', 'sheet'];
  const LOGGED_IN_ONLY = ['notes', 'compare', 'home', 'options', 'campaigns', 'createcampaign', 'joincampaign', 'campaign', 'spawn', 'maps', 'mapedit', 'mapview', 'characters', 'sheet'];
  const ROUTE_SCREEN = { 'campaigns': 'campaigns', 'create-campaign': 'createcampaign', 'join-campaign': 'joincampaign' };

  const loginUser = $('loginUser'), loginPass = $('loginPass'), loginBtn = $('loginBtn'), loginMsg = $('loginMsg');
  const createName = $('createName'), createUser = $('createUser'), createEmail = $('createEmail'), createPass = $('createPass');
  const createBtn = $('createBtn'), createMsg = $('createMsg');
  const logoutBtn = $('logoutBtn');
  const forgotWho = $('forgotWho'), forgotBtn = $('forgotBtn'), forgotMsg = $('forgotMsg');
  const resetPass = $('resetPass'), resetPass2 = $('resetPass2'), resetBtn = $('resetBtn'), resetMsg = $('resetMsg');
  let keepMsg = false;
  const authInputs = [loginUser, loginPass, createName, createUser, createEmail, createPass, forgotWho, resetPass, resetPass2];

  // The app's version. Changed only when Ricky says so (not automatically).
  const APP_VERSION = '1';
  $('appVersion').textContent = 'v' + APP_VERSION;
  let lastRoute = 'start', sheetBack = null;

  /* ================= Rules and user guide ================= */
  let rulesBuilt = false;
  function renderRules() {
    const doc = $('rulesDoc');
    if (!rulesBuilt) {
      const R = window.BSH_RULES || { title: 'Rules', html: '<p>The rulebook could not be loaded.</p>' };
      doc.innerHTML = '<h1>' + R.title + '</h1>' + R.html;
      rulesBuilt = true;
    }
  }
  let guideBuilt = false;
  function renderGuide() {
    if (guideBuilt) return;
    const G = window.BSH_GUIDE || { title: 'User Guide', html: '<p>The user guide could not be loaded.</p>' };
    $('guideDoc').innerHTML = '<h1>' + G.title + '</h1>' + G.html;
    guideBuilt = true;
  }
  // contents links and ^ CONTENTS links, for both the rulebook and the guide
  const docClick = (e) => {
    const a = e.target.closest('a[data-goto]');
    if (!a) return;
    e.preventDefault();
    const t = document.getElementById(a.dataset.goto);
    if (!t) return;
    if (t.scrollIntoView) t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
  };
  $('rulesDoc').addEventListener('click', docClick);
  $('guideDoc').addEventListener('click', docClick);
  const docBack = () => go(lastRoute && lastRoute !== 'rules' && lastRoute !== 'guide' && lastRoute !== 'notes' ? lastRoute : state.user ? 'home' : 'start');
  $('rulesBack').addEventListener('click', docBack);
  $('notesBack').addEventListener('click', docBack);
  $('guideBack').addEventListener('click', docBack);

  function go(name) { location.hash = name; }
  const homeUrl = () => location.pathname + location.search;

  function route() {
    if (!booted) return;
    let raw = location.hash.replace('#', '');
    try { raw = decodeURIComponent(raw); } catch (e) { /* keep raw */ }
    raw = raw || 'start';

    let name = raw, charId = null, campaignId = null, spawnSheetFor = null;
    if (raw.startsWith('character-')) { name = 'sheet'; charId = raw.slice('character-'.length); }
    else if (raw.startsWith('campaign-')) { name = 'campaign'; campaignId = raw.slice('campaign-'.length); }
    else if (raw.startsWith('spawn-')) { name = 'spawn'; campaignId = raw.slice('spawn-'.length); }
    else if (raw.startsWith('maps-')) { name = 'maps'; mapCid = raw.slice(5); }
    else if (raw.startsWith('mapnew-')) { name = 'mapedit'; mapCid = raw.slice(7); mapEditId = null; }
    else if (raw.startsWith('mapedit-')) { name = 'mapedit'; [mapCid, mapEditId] = raw.slice(8).split('~'); }
    else if (raw.startsWith('mapview-')) { name = 'mapview'; [mapCid, mapViewId] = raw.slice(8).split('~'); }
    else if (raw.startsWith('spawnsheet-')) { name = 'sheet'; spawnSheetFor = raw.slice('spawnsheet-'.length); }
    else if (Object.prototype.hasOwnProperty.call(ROUTE_SCREEN, raw)) name = ROUTE_SCREEN[raw];
    const known = ['start', 'rules', 'guide', 'notes', 'compare', 'login', 'forgot', 'reset', 'create', 'home', 'options', 'campaigns', 'createcampaign', 'joincampaign', 'campaign', 'spawn', 'maps', 'mapedit', 'mapview', 'characters', 'sheet'].includes(name);
    if (!known) name = 'start';

    const user = state.user;
    const loggedInOnly = LOGGED_IN_ONLY.includes(name);
    const titleWhileIn = user && name === 'start' && location.hash === '#start';   // logged-in players may visit the title screen on purpose
    if (name === 'reset' && !user) name = 'login';
    if (user && !loggedInOnly && !titleWhileIn && name !== 'rules' && name !== 'guide' && name !== 'reset') { name = 'home'; history.replaceState(null, '', '#home'); }
    if (!user && loggedInOnly) { name = 'start'; history.replaceState(null, '', homeUrl()); }

    let ch = null, viewOnly = null;
    if (name === 'sheet' && spawnSheetFor) {   // the character being spawned, as it stands: look only
      const g = state.campaigns.find((x) => x.id === spawnSheetFor);
      if (g && g.spawn && myMembership(g)) { ch = buildSpawnChar(g.spawn, g.id); viewOnly = { owner: '', draft: true }; }
      else { name = 'campaign'; campaignId = spawnSheetFor; history.replaceState(null, '', '#campaign-' + spawnSheetFor); }
    } else if (name === 'sheet') {
      ch = findChar(charId);
      if (!ch) {   // not mine: a character shown on a campaign page opens read-only
        const row = state.campChars.find((r) => r.ch.id === charId);
        if (row && !row.stub) { ch = row.ch; viewOnly = row; }   // a roster-only NPC (private sheet) has nothing to open
      }
      if (!ch) { name = 'characters'; history.replaceState(null, '', '#characters'); }
    }

    const screen = name;
    if (screen !== 'sheet' && pending) flushSave();     // leaving a sheet: push pending edits out now
    if (screen === 'campaign' && campaignId !== curCampaignId) { state.campChars = []; state.campCharsFor = null; }
    if (screen === 'spawn') spawnCampaignId = campaignId;
    curCampaignId = screen === 'campaign' ? campaignId : curCampaignId && screen === 'sheet' ? curCampaignId : null;
    SCREENS.forEach((s) => { $('screen-' + s).hidden = s !== screen; });
    if (screen !== 'rules' && screen !== 'guide' && screen !== 'notes') {
      const prev = lastRoute;
      lastRoute = location.hash.replace('#', '') || 'start';
      // where a sheet's BACK goes: the campaign page if that is where you came from (kept while you stay on the sheet)
      if (screen === 'sheet') { if (/^campaign-/.test(prev)) sheetBack = prev; else if (!/^character-/.test(prev)) sheetBack = null; }
    }
    const onDoc = screen === 'rules' || screen === 'guide' || screen === 'notes';   // the rulebook, the user guide and the notes share one look
    document.documentElement.classList.toggle('on-rules', onDoc); document.body.classList.toggle('on-rules', onDoc);
    $('rulesBtn').hidden = screen === 'rules';
    $('notesBtn').hidden = !user || !onDoc || screen === 'notes';   // on the rulebook and the guide, NOTES sits where LOG OUT is elsewhere
    $('guideBtn').hidden = screen !== 'rules';   // on the rulebook, GUIDE sits where RULES is everywhere else
    logoutBtn.hidden = !user || screen === 'start' || onDoc;   // the title screen has its own LOG OUT
    document.querySelectorAll('#screen-start [data-auth]').forEach((b) => { b.hidden = (b.dataset.auth === 'in') !== !!user; });

    if (screen === 'login' || screen === 'create') {
      authInputs.forEach((i) => { i.value = ''; });
      loginMsg.textContent = createMsg.textContent = '';
      syncButtons();
      if (matchMedia('(hover: hover)').matches) (screen === 'login' ? loginUser : createName).focus();
    }
    if (screen === 'forgot') { forgotWho.value = ''; if (!keepMsg) forgotMsg.textContent = ''; keepMsg = false; syncButtons(); if (matchMedia('(hover: hover)').matches) forgotWho.focus(); }
    if (screen === 'reset') { resetPass.value = resetPass2.value = ''; resetMsg.textContent = ''; syncButtons(); }
    if (screen === 'home') $('welcomeName').textContent = user.name;
    if (screen === 'characters') { renderCharList(); refreshChars(); refreshCampaigns(); }
    if (screen === 'sheet') {
      openSheet(ch, viewOnly);
      $('screen-sheet').querySelector('.corner').dataset.go = viewOnly && viewOnly.draft ? 'spawn-' + ch.campaignId : viewOnly && ch.campaignId ? 'campaign-' + ch.campaignId : sheetBack || 'characters';
      refreshCampaigns();
    }
    if (screen === 'createcampaign') { $('campaignName').value = ''; $('campaignFormMsg').textContent = ''; $('campaignBtn').disabled = true; }
    if (screen === 'options') renderOptions();
    if (screen === 'rules') renderRules();
    if (screen === 'guide') renderGuide();
    if (screen === 'notes') renderNotes();
    if (screen === 'compare') openCompare();
    if (['campaigns', 'joincampaign', 'campaign'].includes(screen)) { renderCampaigns(); refreshCampaigns(); }
    if (screen === 'spawn') { spawnSig = ''; renderSpawnPage(); refreshCampaigns(); }
    if (screen === 'maps') renderMapList();
    if (screen === 'mapedit') openMapEditor();
    if (screen === 'mapview') openMapViewer();
    if (screen === 'campaign') refreshChars().then(() => { if (!$('screen-campaign').hidden) renderCampaignPage(); });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  window.addEventListener('hashchange', route);

  /* ================= Auth forms ================= */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let busy = false;

  function syncButtons() {
    loginBtn.disabled = busy || !(loginUser.value.trim() && loginPass.value);
    forgotBtn.disabled = busy || !forgotWho.value.trim();
    resetBtn.disabled = busy || !(resetPass.value && resetPass2.value);
    createBtn.disabled = busy || !(createName.value.trim() && createUser.value.trim() && createEmail.value.trim() && createPass.value);
  }
  function setBusy(v) { busy = v; syncButtons(); }
  authInputs.forEach((i) => i.addEventListener('input', () => {
    syncButtons();
    loginMsg.textContent = createMsg.textContent = forgotMsg.textContent = resetMsg.textContent = '';
  }));

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUser.value.trim(), password = loginPass.value;
    if (!username || !password || busy) return;
    setBusy(true); loginMsg.textContent = '';
    try {
      state.user = await backend.signIn({ username, password });
      await loadChars();
      go('home'); route(); pollCampaigns();
    } catch (err) {
      loginMsg.textContent = err.message;
    } finally { setBusy(false); }
  });

  $('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const who = forgotWho.value.trim();
    if (!who || busy) return;
    setBusy(true); forgotMsg.textContent = '';
    try {
      await backend.requestReset(who);
      forgotMsg.textContent = 'If that matches an account, a link to choose a new password is on its way. Check your email (and spam). The link works once and expires after a while.';
    } catch (err) {
      forgotMsg.textContent = err.message;
    } finally { setBusy(false); }
  });

  $('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = resetPass.value, b = resetPass2.value;
    if (!a || !b || busy) return;
    if (a.length < 8) { resetMsg.textContent = 'Passwords need at least 8 characters.'; return; }
    if (a !== b) { resetMsg.textContent = 'The two passwords do not match.'; return; }
    setBusy(true); resetMsg.textContent = '';
    try {
      state.user = await backend.setNewPassword(a);
      await loadChars();
      go('home'); route(); pollCampaigns();
    } catch (err) {
      resetMsg.textContent = err.message;
    } finally { setBusy(false); }
  });

  $('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = createName.value.trim(), username = createUser.value.trim();
    const email = createEmail.value.trim().toLowerCase(), password = createPass.value;
    if (!name || !username || !email || !password || busy) return;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      createMsg.textContent = 'Usernames are 3 to 20 letters, numbers or underscores (no spaces).';
      return;
    }
    if (!EMAIL_RE.test(email)) { createMsg.textContent = 'Enter a valid email address.'; return; }
    if (password.length < 8) { createMsg.textContent = 'Passwords need at least 8 characters.'; return; }
    setBusy(true); createMsg.textContent = '';
    try {
      state.user = await backend.signUp({ name, username, email, password });
      state.chars = [];
      go('home'); route();
    } catch (err) {
      createMsg.textContent = err.message;
    } finally { setBusy(false); }
  });

  $('startLogout').addEventListener('click', () => logoutBtn.click());
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    await Promise.race([flushSave(), new Promise((r) => setTimeout(r, 2500))]);
    try { await backend.signOut(); } catch (e) { /* signed out locally either way */ }
    state.user = null; state.chars = []; state.campaigns = []; campaignsLoaded = false; cur = null; pending = null;
    clearTimeout(saveTimer); saveTimer = null;
    closeEncModal(); closeSkillCheck(); closeActions(); dismissedEnc.clear(); pollSig = '';
    logoutBtn.disabled = false;
    history.replaceState(null, '', homeUrl());
    route();
  });

  /* ================= Saving ================= */
  let pending = null, saveTimer = null, saving = false;
  const setStatus = (t) => { $('saveStatus').textContent = t; };

  function queueSave(ch) {
    pending = ch;
    setStatus('Saving...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }

  async function flushSave() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!pending) return;
    if (saving) { saveTimer = setTimeout(flushSave, 300); return; }
    const ch = pending; pending = null; saving = true;
    try {
      await backend.saveCharacter(JSON.parse(JSON.stringify(ch)));
      if (!pending) setStatus('Saved');
    } catch (e) {
      if (!pending) pending = ch;
      setStatus('Not saved. Retrying...');
      if (!saveTimer) saveTimer = setTimeout(flushSave, 5000);
    } finally {
      saving = false;
      if (pending && !saveTimer) saveTimer = setTimeout(flushSave, 300);
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', () => { flushSave(); });
  window.addEventListener('online', () => { flushSave(); });

  /* ================= Campaigns ================= */
  const myMembership = (g) => g.members.find((m) => m.userId === state.user.id) || null;
  const iAmQm = (g) => { const m = myMembership(g); return !!m && m.role === 'qm'; };
  const countText = (g) => g.members.length + (g.members.length === 1 ? ' player' : ' players');

  let campaignsLoaded = false, campaignsLoading = false;
  async function refreshCampaigns() {
    if (!state.user || campaignsLoading) return;
    campaignsLoading = true;
    try {
      state.campaigns = await backend.listCampaigns();
      campaignsLoaded = true;
      setCampaignMsgs('');
      if (curCampaignId && !$('screen-campaign').hidden) {
        state.campChars = await backend.listCampaignCharacters(curCampaignId);
        state.campChars.forEach((r) => { r.ch = normalizeChar(r.ch); });
        state.campCharsFor = curCampaignId;
      }
      syncCharLinks();
    } catch (e) {
      setCampaignMsgs(e.message);
    } finally { campaignsLoading = false; }
    renderCampaigns();
  }
  // A character can only be linked to a campaign its player is in. Drop links that no longer hold
  // (left, removed, or campaign deleted; the database has already cleared them) and refresh what is on screen.
  function syncCharLinks() {
    const mineIds = new Set(state.campaigns.filter((g) => myMembership(g)).map((g) => g.id));
    state.chars.forEach((c) => { if (c.campaignId && !mineIds.has(c.campaignId)) { c.campaignId = null; c.isNpc = false; c.npcVisible = false; c.sheetHidden = false; } });
    if (cur && cur.campSel) fillCampSel();
    if (cur && cur.playerSel) fillPlayerSel();
    if (cur && cur.campText) cur.campText.textContent = campLabel();
    if (!$('screen-characters').hidden) renderCharList();
  }
  const campLabel = () => (cur.ch.isNpc ? 'NPC of ' : 'Linked to ') + (campaignName(cur.ch.campaignId) || (cur.ch.campaignId ? '...' : 'no campaign'));
  const campaignName = (id) => { const g = state.campaigns.find((x) => x.id === id); return g ? g.name : ''; };
  function fillCampSel() {
    const sel = cur.campSel, want = cur.ch.campaignId || '';
    const mine = state.campaigns.filter((g) => myMembership(g)).sort((a, b) => a.name.localeCompare(b.name));
    sel.replaceChildren(h('option', { value: '', text: 'None' }), ...mine.map((g) => h('option', { value: g.id, text: g.name })));
    if (want && !mine.some((g) => g.id === want)) sel.append(h('option', { value: want, text: 'Loading...' }));
    sel.value = want;
  }
  function setCampaignMsgs(t) { $('campaignsMsg').textContent = t; $('joinMsg').textContent = t; $('campaignMsg').textContent = t; }
  // poll while a campaign screen is open so new members and role changes show up
  setInterval(() => {
    if (document.visibilityState === 'visible' && ['campaigns', 'joincampaign', 'campaign'].some((s) => !$('screen-' + s).hidden)) refreshCampaigns();
  }, 15000);

  // Button that needs a second tap to confirm (no pop-up dialogs)
  function confirmButton(label, armedLabel, action, cls = 'btn small') {
    const b = h('button', { class: cls, type: 'button', text: label });
    let timer = null;
    b.addEventListener('click', () => {
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = armedLabel;
        timer = setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = label; } }, 4000);
        return;
      }
      clearTimeout(timer);
      delete b.dataset.armed; b.textContent = label;
      action();
    });
    return b;
  }

  async function campaignAction(fn, then) {
    setCampaignMsgs('');
    try { await fn(); if (then) then(); } catch (e) { setCampaignMsgs(e.message); }
    await refreshCampaigns();
  }

  function campaignCard(g, onTap) {
    return h('button', { class: 'btn char-btn', type: 'button', onclick: onTap },
      h('span', { text: g.name }),
      h('span', { class: 'sub', text: countText(g) + (iAmQm(g) ? ' · you are QM' : '') }));
  }

  function renderCampaigns() {
    if (!state.user) return;
    const mine = state.campaigns.filter((g) => myMembership(g));
    const open = state.campaigns.filter((g) => !myMembership(g));

    if (!$('screen-campaigns').hidden) {
      $('noCampaigns').hidden = !campaignsLoaded || mine.length > 0;
      $('myCampaigns').replaceChildren(...mine.map((g) => campaignCard(g, () => go('campaign-' + g.id))));
    }
    if (!$('screen-joincampaign').hidden) {
      $('noJoin').hidden = !campaignsLoaded || open.length > 0;
      $('joinList').replaceChildren(...open.map((g) => campaignCard(g, () => campaignAction(
        () => backend.joinCampaign(g.id), () => go('campaign-' + g.id)))));
    }
    if (!$('screen-campaign').hidden) renderCampaignPage();
    if (!$('screen-spawn').hidden) renderSpawnPage();
    syncMapViewTab();
  }

  function renderCampaignPage() {
    const g = state.campaigns.find((x) => x.id === curCampaignId);
    const list = $('memberList'), acts = $('campaignActions');
    if (!g) {
      $('campaignTitle').textContent = campaignsLoaded ? 'Campaign not found' : '';
      $('campaignMeta').textContent = campaignsLoaded ? 'It may have been deleted.' : 'Loading...';
      list.replaceChildren(); acts.replaceChildren(); $('encounterBox').replaceChildren();
      $('campChars').replaceChildren(); $('campCharsHead').hidden = true; $('noCampChars').hidden = true; $('npcActions').replaceChildren();
      return;
    }
    const me = myMembership(g), qm = iAmQm(g);
    const qmCount = g.members.filter((m) => m.role === 'qm').length;
    $('campaignTitle').textContent = g.name;
    $('campaignMeta').textContent = countText(g) + (qm ? ' · you are QM' : me ? '' : ' · you are not in this campaign');

    list.replaceChildren(...g.members.map((m) => {
      const isMe = m.userId === state.user.id;
      const row = h('div', { class: 'member' },
        h('div', { class: 'who' }, m.username + (isMe ? ' (you)' : ''), h('small', { text: m.name })),
        m.role === 'qm' ? h('span', { class: 'tag', text: 'QM' }) : null);
      if (qm) {
        const bar = h('div', { class: 'acts' });
        if (m.role === 'qm') {
          if (qmCount > 1) bar.append(h('button', { class: 'btn small', type: 'button', text: 'REMOVE QM',
            onclick: () => campaignAction(() => backend.setQm(g.id, m.userId, false)) }));
        } else {
          bar.append(h('button', { class: 'btn small', type: 'button', text: 'MAKE QM',
            onclick: () => campaignAction(() => backend.setQm(g.id, m.userId, true)) }));
        }
        if (!isMe) bar.append(confirmButton('REMOVE', 'TAP AGAIN TO REMOVE', () => campaignAction(() => backend.removeMember(g.id, m.userId))));
        if (bar.children.length) row.append(bar);
      }
      return row;
    }));

    renderEncounterBox(g, me, qm);
    renderSpawnBanner(g, me);
    renderAttackWait();
    renderComboBox();
    renderSpawnBox(g, me, qm);
    renderMapButtons(g, me, qm);
    renderCampaignChars(g, me, qm);

    acts.replaceChildren();
    if (!me) {
      acts.append(h('button', { class: 'btn small', type: 'button', text: 'JOIN CAMPAIGN',
        onclick: () => campaignAction(() => backend.joinCampaign(g.id)) }));
      return;
    }
    const alone = g.members.length === 1;
    if (qm && !alone) {
      acts.append(confirmButton('BECOME A PLAYER', 'TAP AGAIN TO STEP DOWN',
        () => campaignAction(() => backend.becomePlayer(g.id))));
    }
    acts.append(confirmButton('LEAVE CAMPAIGN', 'TAP AGAIN TO LEAVE',
      () => campaignAction(() => backend.leaveCampaign(g.id), () => go('campaigns'))));
    if (qm) acts.append(confirmButton('DELETE CAMPAIGN', 'TAP AGAIN TO DELETE',
      () => campaignAction(() => backend.deleteCampaign(g.id), () => go('campaigns'))));
    if (alone) acts.append(h('p', { class: 'note', style: 'text-align:left', text: 'You are the only one here, so leaving deletes the campaign and its NPCs.' }));
    else if (qm && qmCount < 2) acts.append(h('p', { class: 'note', style: 'text-align:left', text: 'You are the only QM. If you leave or become a player, a random player becomes QM and takes over your NPCs.' }));
    else if (qm) acts.append(h('p', { class: 'note', style: 'text-align:left', text: 'If you leave or become a player, your NPCs pass to another QM.' }));
  }


  // QM: give a new item to any character in the campaign (players or NPCs). The form is kept between refreshes so typing is not lost.
  let giveUi = null;
  function renderGiveBox(g, qm, rows) {
    const box = $('giveBox'), head = $('giveHead');
    head.hidden = !qm;
    if (!qm) { box.replaceChildren(); giveUi = null; return; }
    if (!giveUi || giveUi.gid !== g.id) {
      const sel = h('select', { id: 'giveTo', 'aria-label': 'Give to which character' });
      const name = h('input', { type: 'text', id: 'giveName', maxlength: '60', placeholder: 'Item name', 'aria-label': 'Item name', autocomplete: 'off' });
      const qty = h('input', { type: 'number', id: 'giveQty', class: 'num', min: '1', step: '1', value: '1', 'aria-label': 'Quantity' });
      const fl = FLAGS.map(([k, label]) => { const cb = h('input', { type: 'checkbox', id: 'give' + label, 'aria-label': label }); return { k, cb, el: h('label', { class: 'chk' }, cb, h('span', { text: label })) }; });
      const wf = {}, wbox = h('div', { class: 'wpgrid', hidden: true }, WEAPON_PROPS.map(([k, label]) => {
        wf[k] = k === 'effect' ? h('textarea', { id: 'giveW' + k, 'aria-label': 'Weapon ' + label, placeholder: label }) : h('input', { type: 'text', id: 'giveW' + k, maxlength: '200', 'aria-label': 'Weapon ' + label, placeholder: label, autocomplete: 'off' });
        return k === 'effect' ? h('div', { class: 'wp-wide' }, wf[k]) : wf[k];
      }));
      fl[1].cb.addEventListener('change', () => { wbox.hidden = !fl[1].cb.checked; });
      const mf = {}, mbox = h('div', { class: 'wpgrid', hidden: true, id: 'giveMagic' },
        ['type', 'attunement', 'maxCharges'].map((k) => {
          const label = { type: 'Type', attunement: 'Attunement', maxCharges: 'Max Charges' }[k];
          mf[k] = h('input', { type: k === 'maxCharges' ? 'number' : 'text', id: 'giveM' + k, maxlength: '200', min: '0', step: '1', 'aria-label': 'Magic ' + label, placeholder: label, autocomplete: 'off' }); return mf[k]; }),
        (mf.spellbook = h('input', { type: 'checkbox', id: 'giveMspellbook', 'aria-label': 'Spellbook' })) && h('label', { class: 'chk' }, mf.spellbook, h('span', { text: 'Spellbook' })),
        h('div', { class: 'wp-wide' }, (mf.effect = h('textarea', { id: 'giveMeffect', 'aria-label': 'Magic Effect', placeholder: 'Effect' }))));
      fl[2].cb.addEventListener('change', () => { mbox.hidden = !fl[2].cb.checked; });
      const desc = h('textarea', { id: 'giveDesc', placeholder: 'Description (optional)', 'aria-label': 'Item description' });
      const msg = h('p', { class: 'msg', id: 'giveMsg', role: 'status' });
      const btn = h('button', { class: 'btn small', type: 'button', id: 'giveBtn', text: 'GIVE ITEM' });
      btn.addEventListener('click', async () => {
        msg.textContent = '';
        const to = giveUi.rows.find((r) => r.ch.id === sel.value), n = Number(qty.value);
        if (!to) { msg.textContent = 'Choose who gets it.'; return; }
        if (!name.value.trim()) { msg.textContent = 'Give the item a name.'; return; }
        if (!Number.isInteger(n) || n < 1) { msg.textContent = 'Choose a quantity of at least 1.'; return; }
        btn.disabled = true;
        try {
          const mp = fl[2].cb.checked ? cleanMagic({ type: mf.type.value, attunement: mf.attunement.value, maxCharges: mf.maxCharges.value, effect: mf.effect.value, spellbook: mf.spellbook.checked }) : {};
          await backend.giveItem(null, to.ch.id, { name: name.value.trim(), qty: n, charges: mp.maxCharges === '' || mp.maxCharges == null ? null : mp.maxCharges, desc: desc.value, magicProps: mp,
            wearable: fl[0].cb.checked, weapon: fl[1].cb.checked, magic: fl[2].cb.checked,
            weaponProps: fl[1].cb.checked ? cleanWeapon(Object.fromEntries(WEAPON_PROPS.map(([k]) => [k, wf[k].value]))) : {} });
          msg.textContent = 'Gave ' + n + ' ' + name.value.trim() + ' to ' + (to.ch.info.name || 'Unnamed character') + '.';
          name.value = ''; desc.value = ''; qty.value = '1'; mbox.hidden = true; ['type', 'attunement', 'maxCharges', 'effect'].forEach((k) => { mf[k].value = ''; }); mf.spellbook.checked = false; fl.forEach((f) => { f.cb.checked = false; }); wbox.hidden = true; WEAPON_PROPS.forEach(([k]) => { wf[k].value = ''; });
        } catch (e) { msg.textContent = e.message; } finally { btn.disabled = false; }
      });
      giveUi = { gid: g.id, rows: [], sel, el: [h('div', { class: 'row2' }, sel), name,
        h('div', { class: 'row2' }, h('label', { class: 'lbl', text: 'Qty' }, qty)), h('div', { class: 'iflags' }, fl.map((f) => f.el)), wbox, mbox, desc, btn, msg] };
      box.replaceChildren(...giveUi.el);
    }
    giveUi.rows = rows;
    const keep = giveUi.sel.value, nm = (r) => (r.ch.info.name || 'Unnamed character') + (r.ch.isNpc ? ' (NPC)' : ' (' + r.owner + ')');
    giveUi.sel.replaceChildren(h('option', { value: '', text: rows.length ? 'Give to...' : 'No characters here yet' }),
      ...rows.map((r) => h('option', { value: r.ch.id, text: nm(r) })));
    giveUi.sel.value = rows.some((r) => r.ch.id === keep) ? keep : '';
  }

  let encTimer = null;
  // DEAD and INACTIVE side lists on the campaign page (right-edge tabs). Only a QM can set a character inactive or active again.
  let charSideOpen = null, charSideData = null;
  function renderCharSide(g, qm, dead, inactive) {
    charSideData = { g, qm, dead, inactive };
    $('deadTab').hidden = !dead.length; $('inactiveTab').hidden = !inactive.length;
    if (charSideOpen && !(charSideOpen === 'dead' ? dead : inactive).length) charSideOpen = null;
    paintCharSide();
  }
  function paintCharSide() {
    const box = $('charSide'); box.hidden = !charSideOpen;
    if (!charSideOpen || !charSideData) return;
    const { g, qm } = charSideData, list = charSideOpen === 'dead' ? charSideData.dead : charSideData.inactive;
    $('charSideTitle').textContent = charSideOpen === 'dead' ? 'Dead' : 'Inactive';
    $('charSideList').replaceChildren(...list.map((r) => {
      const c = r.ch, locked = !!r.stub, sub = [c.isNpc ? 'NPC of ' + r.owner : 'player ' + r.owner];
      return h('div', { class: 'member cchar' },
        h('div', { class: 'cname' }, h('button', { class: 'btn char-btn', type: 'button', disabled: locked, onclick: () => { if (!locked) go('character-' + c.id); } },
          h('span', { text: c.info.name || 'Unnamed character' }), h('span', { class: 'sub', text: sub.join(' · ') }))),
        charSideOpen === 'inactive' && qm ? h('button', { class: 'btn small', type: 'button', text: 'MAKE ACTIVE', onclick: () => campaignAction(() => backend.setCharacterInactive(g.id, c.id, false)) }) : null);
    }));
  }
  $('deadTab').addEventListener('click', () => { charSideOpen = charSideOpen === 'dead' ? null : 'dead'; paintCharSide(); });
  $('inactiveTab').addEventListener('click', () => { charSideOpen = charSideOpen === 'inactive' ? null : 'inactive'; paintCharSide(); });
  $('charSideClose').addEventListener('click', () => { charSideOpen = null; paintCharSide(); });

  function renderCampaignChars(g, me, qm) {
    const box = $('campChars'), head = $('campCharsHead'), none = $('noCampChars'), npcBar = $('npcActions');
    npcBar.replaceChildren();
    clearTimeout(encTimer);
    if (!me) { box.replaceChildren(); head.hidden = true; none.hidden = true; renderGiveBox(g, false, []); return; }
    head.hidden = false;
    const enc = g.encounter, inits = enc ? enc.initiatives : {};
    const allRows = state.campCharsFor === g.id ? state.campChars : [];
    // dead and inactive characters leave the roster for the side lists (unless they are still part of the running encounter)
    const inactiveSet = new Set(g.inactive || []), isDead = (r) => !r.stub && r.ch.info && r.ch.info.alive === false;
    const away = (r) => (isDead(r) || inactiveSet.has(r.ch.id)) && !(enc && inits && inits[r.ch.id]);
    const rows = allRows.filter((r) => !away(r));
    renderCharSide(g, qm, allRows.filter((r) => away(r) && isDead(r)), allRows.filter((r) => away(r) && !isDead(r)));
    renderGiveBox(g, qm, allRows.slice().sort((a, b) => (a.ch.isNpc - b.ch.isNpc) || (a.ch.info.name || '').localeCompare(b.ch.info.name || '')));
    none.hidden = state.campCharsFor !== g.id || allRows.length > 0;
    const kept = {};   // what the QM has typed in an initiative box survives a refresh
    box.querySelectorAll('input[data-init]').forEach((i) => { kept[i.dataset.init] = i.value; });
    const ae = document.activeElement, focusVit = ae && ae.dataset && ae.dataset.vit && box.contains(ae) ? ae.dataset.vit : null;
    const focusPos = focusVit ? ae.selectionStart : null;
    box.querySelectorAll('input[data-vit]').forEach((i) => { if (i.value !== i.defaultValue) kept[i.dataset.vit] = i.value; });
    // players' characters first, then NPCs; by name. During an encounter: highest initiative first, those still to roll last
    const nm = (r) => (r.ch.info.name || 'Unnamed character').toLowerCase();
    // not in an encounter: PCs first, then NPCs, newest first within each. In an encounter: turn order (highest initiative first,
    // ties settled by the random tie-break drawn when the roll was saved), then those who have not rolled in the usual order
    const base = (a, b) => (a.ch.isNpc - b.ch.isNpc) || ((b.ch.created || 0) - (a.ch.created || 0)) || nm(a).localeCompare(nm(b));
    const byId = new Map(rows.map((r) => [r.ch.id, r]));
    const evs = enc ? (enc.events || []) : [], evById = new Map(evs.map((ev) => [ev.id, ev]));
    const rolled = enc ? BSHBackend.turnOrder(BSHBackend.turnSlots(enc), rows.map((r) => r.ch.id).concat(evs.map((ev) => ev.id))).map((id) => byId.get(id) || evById.get(id)) : [];
    const later = evs.filter((ev) => !rolled.includes(ev));   // one-time events waiting for their round (the QM sees these)
    const sorted = enc ? rolled.concat(rows.filter((r) => !inits[r.ch.id]).sort(base), later) : rows.slice().sort(base);
    const turnId = enc && enc.turn || null;
    let nextWait = Infinity;
    box.replaceChildren(...sorted.map((r) => {
      if (!r.ch) return eventRow(g, r, qm, turnId, enc);
      const c = r.ch, res = BSH.compute(c), i = enc && inits[c.id];
      const locked = !!r.stub;   // a shown NPC whose sheet the QM keeps private
      const sub = locked ? [] : [c.info.species, c.info.sex, c.info.age].filter(Boolean);
      sub.push(c.isNpc ? 'NPC of ' + r.owner : 'player ' + r.owner);
      const myTurn = !!turnId && c.id === turnId;
      const row = h('div', { class: 'member cchar' + (myTurn ? ' turn' : '') },
        myTurn ? h('span', { class: 'turnmark', role: 'img', 'aria-label': 'Current turn', text: '>' }) : null,
        h('div', { class: 'cname' },
          h('button', { class: 'btn char-btn', type: 'button', disabled: locked, 'aria-disabled': String(locked), onclick: () => { if (!locked) go('character-' + c.id); } },
            h('span', { text: c.info.name || 'Unnamed character' }),
            h('span', { class: 'sub', text: sub.join(' · ') })),
          locked ? null : vitalsRow(r, res, kept)),
        i ? h('span', { class: 'tag init', title: initText(i), text: 'INIT ' + fmt(i.total) }) : null,
        enc && !i && !c.isNpc ? h('span', { class: 'tag', text: 'WAITING' }) : null,
        c.isNpc ? h('span', { class: 'tag', text: c.npcVisible ? 'NPC · SHOWN' : 'NPC · HIDDEN' }) : null,
        c.isNpc && c.sheetHidden ? h('span', { class: 'tag', text: 'SHEET HIDDEN' }) : null,
        c.vitals && c.vitals.nextCrit ? h('span', { class: 'tag', text: 'NEXT HIT CRIT' }) : null,
        r.mine && !c.isNpc ? h('span', { class: 'tag', text: 'YOURS' }) : null);
      if (c.isNpc && qm) {
        row.append(h('button', { class: 'btn small', type: 'button', text: c.npcVisible ? 'HIDE FROM PLAYERS' : 'SHOW TO PLAYERS',
          onclick: () => campaignAction(() => backend.setNpcVisible(c.id, !c.npcVisible)) }),
          h('button', { class: 'btn small', type: 'button', text: c.sheetHidden ? 'SHOW SHEET' : 'HIDE SHEET',
            onclick: () => campaignAction(() => backend.setNpcSheetHidden(c.id, !c.sheetHidden)) }));
      }
      if (myTurn && r.mine && !c.isNpc) row.append(h('button', { class: 'btn small', type: 'button', text: 'END TURN',
        onclick: () => campaignAction(() => backend.advanceTurn(g.id, c.id)).then(() => pollCampaigns(true)) }));
      if (!locked) row.append(h('button', { class: 'btn small', type: 'button', text: 'SKILL CHECK', onclick: () => openSkillCheck(c) }),
        h('button', { class: 'btn small', type: 'button', text: 'ACTIONS', onclick: () => openActions(c, r.mine && !!findChar(c.id)) }));
      if (qm) row.append(h('button', { class: 'btn small', type: 'button', text: 'MARK INACTIVE', onclick: () => campaignAction(() => backend.setCharacterInactive(g.id, c.id, true)) }));
      if (i) row.append(h('p', { class: 'note', style: 'flex:1 1 100%;text-align:left;margin:0', text: initText(i) + (i.by === 'qm' && !c.isNpc ? ' (set by the QM)' : '') }));
      // the QM can roll or enter initiative for a player who has not answered in 10 seconds (NPCs: any time)
      if (enc && qm && !i) {
        const wait = c.isNpc ? 0 : enc.startedAt + ENC_WAIT_MS - Date.now();
        if (wait > 0) nextWait = Math.min(nextWait, wait);
        else {
          const input = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '20', placeholder: 'd20', 'data-init': c.id, 'aria-label': 'd20 roll for ' + (c.info.name || 'this character') });
          if (kept[c.id]) input.value = kept[c.id];
          const err = h('span', { class: 'lbl', role: 'alert' });
          const say = (m) => { err.textContent = m; };
          const adv = advStepper();
          row.append(h('div', { class: 'enc-qm' },
            h('span', { class: 'lbl', text: c.isNpc ? 'Roll for NPC' : 'No roll yet' }), etStepper(c), adv.el,
            h('button', { class: 'btn small', type: 'button', text: 'ROLL FOR THEM', onclick: () => saveInit(g, c, adv.roll(20), say) }),
            input,
            h('button', { class: 'btn small', type: 'button', text: 'SET ROLL', onclick: () => saveInit(g, c, dieFrom(input.value), say) }),
            err));
        }
      }
      return row;
    }));
    if (focusVit) { const f = box.querySelector('input[data-vit="' + focusVit + '"]'); if (f) { f.focus(); try { f.setSelectionRange(focusPos, focusPos); } catch (e) { /* number inputs */ } } }
    if (nextWait < Infinity) encTimer = setTimeout(() => { if (!$('screen-campaign').hidden) renderCampaignPage(); }, nextWait + 100);
    if (qm) {
      npcBar.append(h('button', { class: 'btn small', type: 'button', text: 'NEW NPC', onclick: async () => {
        setCampaignMsgs('');
        const c = normalizeChar({ id: uuid(), created: Date.now(), updated: Date.now() });
        try {
          await backend.createNpc(g.id, c);
          c.campaignId = g.id; c.isNpc = true; c.npcVisible = false;
          state.chars.unshift(c);
          go('character-' + c.id);
        } catch (e) { setCampaignMsgs(e.message); }
      } }));
      npcBar.append(spawnButton(g), giveEtButton(g), h('button', { class: 'btn small', type: 'button', id: 'dmgBtn', text: 'ROLL DAMAGE', onclick: () => damageCard(g) }));
    }
  }

  $('campaignName').addEventListener('input', () => {
    $('campaignBtn').disabled = !$('campaignName').value.trim();
    $('campaignFormMsg').textContent = '';
  });
  $('campaignForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('campaignName').value;
    if (!name.trim() || $('campaignBtn').disabled) return;
    $('campaignBtn').disabled = true;
    try {
      const id = await backend.createCampaign(name);
      await refreshCampaigns();
      go('campaign-' + id);
    } catch (err) {
      $('campaignFormMsg').textContent = err.message;
      $('campaignBtn').disabled = false;
    }
  });


  /* ----- roster readouts: current HP / AP / SP / EP, editable on your own characters ----- */
  // HP is stored as damage taken (the sheet shows HP remaining); AP, SP and EP are stored as "remaining"
  // (blank on the sheet = full). Typing here changes the same fields on the character's sheet.
  const r2 = (x) => Math.round(x * 100) / 100;
  const setHp = (ch, v) => { ch.vitals = ch.vitals || {}; ch.vitals.damage = r2(BSH.compute(ch).stat[0] + (Number(ch.vitals.tempHp) || 0) - v); };   // HP remaining is stored as damage taken
  const changeHp = (ch, delta) => { ch.vitals = ch.vitals || {}; ch.vitals.damage = r2((Number(ch.vitals.damage) || 0) - delta); };            // + heals, - damages
  const VITALS = [['HP', 0], ['AP', 4], ['SP', 1], ['EP', 5]];
  function vitalNow(c, res, key) {
    const v = c.vitals || {};
    if (key === 'HP') return res.hpRemaining;
    const f = v[key.toLowerCase() + 'Remaining'];
    return f == null || f === '' ? res.stat[VITALS.find((x) => x[0] === key)[1]] : Number(f);
  }
  function vitalsRow(r, res, kept) {
    const c = r.ch, mine = r.mine && !!findChar(c.id);
    const dh = !mine ? null : (() => {
      const id = c.id + ':DH';
      const input = h('input', { type: 'number', step: 'any', class: 'num', 'data-vit': id, placeholder: '+/-', 'aria-label': 'Damage or healing for ' + (c.info.name || 'this character') });
      if (kept[id] != null) input.value = kept[id];
      const go = () => { const n = Number(input.value); if (input.value === '' || Number.isNaN(n)) return; input.value = ''; saveVital(r, 'HP', null, null, n); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      return h('span', { class: 'vit' }, h('b', { text: 'DMG/HEAL' }), input, h('button', { class: 'btn small', type: 'button', text: 'ACCEPT', onclick: go }));
    })();
    return h('div', { class: 'vitals' }, VITALS.map(([key, si]) => {
      const total = res.stat[si], now = vitalNow(c, res, key);
      if (!mine) return h('span', { class: 'vit' }, h('b', { text: key }), ' ' + fmt(now), h('span', { class: 'of', text: '/' + fmt(total) }));
      const id = c.id + ':' + key;
      const input = h('input', { type: 'number', step: 'any', class: 'num', 'data-vit': id, 'aria-label': key + ' now for ' + (c.info.name || 'this character'), placeholder: fmt(total) });
      input.value = fmt(now); input.defaultValue = input.value;
      if (kept[id] != null) input.value = kept[id];
      input.addEventListener('change', () => saveVital(r, key, input.value === '' ? null : Number(input.value), input));
      return h('span', { class: 'vit' }, h('b', { text: key }), input, h('span', { class: 'of', text: '/' + fmt(total) }));
    }), dh);
  }
  async function saveVital(r, key, value, input, delta) {
    const mine = findChar(r.ch.id);
    if (!mine || (value != null && Number.isNaN(value))) return;
    const apply = (ch) => {
      ch.vitals = ch.vitals || {};
      if (key === 'HP' && delta != null) changeHp(ch, delta);
      else if (key === 'HP') { if (value == null) ch.vitals.damage = null; else setHp(ch, value); }
      else ch.vitals[key.toLowerCase() + 'Remaining'] = value;
      ch.updated = Date.now();
    };
    apply(mine); apply(r.ch);
    try {
      await backend.saveCharacter(JSON.parse(JSON.stringify(mine)));
      setCampaignMsgs('');
    } catch (e) { setCampaignMsgs('Could not save ' + key + ': ' + e.message); }
    if (input) input.defaultValue = input.value;
    if (delta != null && typeof renderCampaignPage === 'function') { try { renderCampaignPage(); } catch (e) { /* page not open */ } }
  }


  /* ===== Explode Tokens (ET) =====
     A character holds 0-10 ET (INFO tab). Before a roll the player declares how many to spend (the ET stepper next to the roll
     button); after the dice land, etRoll lets them place each token on a die. Each token adds 1; a token on a die already on its
     highest number explodes it into another die. Lucky, Always So Defensive and Flashy change how tokens are spent. */
  const etHeld = (c) => Math.max(0, Math.min(10, Math.floor(Number(c && c.info && c.info.explodeTokens) || 0)));
  const hasAb = (c, re) => !!c && (c.abilities || []).some((a) => a && re.test(String(a.name || '')));
  const etDeclared = new Map();     // character id -> tokens declared for the next roll
  const etSteppers = new Set();
  const etLive = (c) => findChar(c.id) || (state.campChars.find((r) => r.ch.id === c.id) || {}).ch || c;
  function etSetLocal(c, v) {
    [c, findChar(c.id)].concat(state.campChars.filter((r) => r.ch.id === c.id).map((r) => r.ch)).forEach((x) => { if (x) { x.info = x.info || {}; x.info.explodeTokens = v; } });
  }
  async function etSave(c, v) { await backend.setExplodeTokens(c.id, v); etSetLocal(c, v); etRefresh(); }
  function etRefresh() { etSteppers.forEach((s) => { if (s.el.isConnected) s.render(); else etSteppers.delete(s); }); }
  function etStepper(c) {
    const el = h('div', { class: 'etstep', 'data-et': c.id });
    const s = { el, render() {
      const held = etHeld(etLive(c)), want = Math.min(held, etDeclared.get(c.id) || 0);
      etDeclared.set(c.id, want);
      if (!held) { el.replaceChildren(h('span', { class: 'lbl', text: 'Explode Tokens: none held' })); return; }
      el.replaceChildren(h('span', { class: 'lbl', text: 'Spend ET on this roll' }),
        h('button', { class: 'btn small', type: 'button', 'aria-label': 'Fewer Explode Tokens', text: '-', disabled: want <= 0, onclick: () => { etDeclared.set(c.id, want - 1); s.render(); } }),
        h('b', { 'data-etn': '1', text: String(want) }),
        h('button', { class: 'btn small', type: 'button', 'aria-label': 'More Explode Tokens', text: '+', disabled: want >= held, onclick: () => { etDeclared.set(c.id, want + 1); s.render(); } }),
        h('span', { class: 'lbl', text: '(' + held + ' held)' }));
    } };
    etSteppers.add(s); s.render();
    return el;
  }
  // Roll dice with Explode Tokens. o: { ch, title, sides: [..], labels?, typed?: [value|null..], flashy?, defensive? }.
  // Resolves null if cancelled, else { groups: [{ natural, total, text }], spent }. Opens nothing when there is nothing to decide.
  function etRoll(o) {
    return new Promise((resolve) => {
      const ET = BSH.ET, ch = etLive(o.ch), held = etHeld(ch);
      const declared = Math.min(held, etDeclared.get(ch.id) || 0);
      const mult = o.flashy && hasAb(ch, /flashy/i) ? 2 : 1;
      const lucky = hasAb(ch, /^\s*lucky\s*$/i), defensive = !!o.defensive && hasAb(ch, /always so defensive/i);
      let dice = o.sides.map((sd, i) => ET.newDie(sd, o.typed && o.typed[i] != null ? o.typed[i] : rollDie(sd), i));
      let pool = declared * mult, lr = 0, dr = 0, applied = false, msg = '';
      const assign = new Map();
      const free = () => held - declared - 3 * lr - dr;
      const first = (i) => dice.find((d) => d.group === i && !d.spawned);
      const result = () => ({ spent: declared + 3 * lr + dr, groups: o.sides.map((sd, i) => {
        const ds = dice.filter((d) => d.group === i), nat = first(i).natural, tot = ET.total(dice, i);
        const changed = ds.length > 1 || ds[0].value !== nat;
        return { natural: nat, total: tot, text: 'd' + sd + ' ' + nat + (changed ? ' [ET ' + (ds.length > 1 ? ds.map((d) => d.value).join(' + ') + ' = ' + tot : tot) + ']' : '') };
      }) });
      const canNothing = !declared && !(lucky && free() >= 3) && !(defensive && free() >= 1 && dice.some((d) => d.natural === 1));
      if (canNothing) { resolve(result()); return; }
      const close = (v) => { $('etModal').hidden = true; $('etBody').replaceChildren(); resolve(v); };
      const live = () => dice.filter((d) => ET.canTake(d));
      function apply() {
        const lv = live();
        if (lv.length === 1) { const r = ET.chain(lv[0], pool, rollDie); dice = dice.concat(r.dice.slice(1)); pool = r.left; }
        else {
          dice.slice().forEach((d) => {
            const n = Math.min(assign.get(d) || 0, pool); if (!n) return;
            const r = ET.applyTo(d, n, rollDie); pool -= r.used; if (r.spawned) dice.push(r.spawned);
          });
        }
        assign.clear(); applied = true; draw();
      }
      function draw() {
        $('etTitle').textContent = o.title || 'Roll';
        const lv = live(), nodes = [];
        if (declared) nodes.push(h('p', { class: 'note', text: 'Spending ' + declared + ' ET' + (mult > 1 ? ' (Flashy: each counts as 2)' : '') + '. ' + (pool ? pool + ' left to place.' : 'All placed.') }));
        o.sides.forEach((sd, i) => {
          const ds = dice.filter((d) => d.group === i), nat = first(i);
          const row = h('div', { class: 'etdie' }, h('span', { class: 'lbl', text: (o.labels && o.labels[i]) || 'd' + sd }),
            h('span', { class: 'val', text: ds.map((d) => d.value).join(' + ') + (ds.length > 1 ? ' = ' + ET.total(dice, i) : '') }));
          if (!applied && lucky && free() >= 3) row.append(h('button', { class: 'btn small', type: 'button', text: 'REROLL (3 ET, LUCKY)', onclick: () => { dice[dice.indexOf(nat)] = ET.newDie(sd, rollDie(sd), i); lr++; draw(); } }));
          if (!applied && defensive && !dr && nat.natural === 1 && free() >= 1) row.append(h('button', { class: 'btn small', type: 'button', text: 'REROLL THE 1 (1 ET, ALWAYS SO DEFENSIVE)', onclick: () => { dice[dice.indexOf(nat)] = ET.newDie(sd, rollDie(sd), i); dr++; draw(); } }));
          if (pool && lv.length > 1) ds.filter((d) => ET.canTake(d)).forEach((d) => {
            const n = assign.get(d) || 0, left = pool - [...assign.values()].reduce((a, b) => a + b, 0);
            row.append(h('button', { class: 'btn small', type: 'button', 'aria-label': 'Fewer tokens on this die', text: '-', disabled: n <= 0, onclick: () => { assign.set(d, n - 1); draw(); } }),
              h('b', { 'data-ass': '1', text: String(n) }),
              h('button', { class: 'btn small', type: 'button', 'aria-label': 'More tokens on this die', text: '+', disabled: left <= 0, onclick: () => { assign.set(d, n + 1); draw(); } }));
          });
          nodes.push(row);
        });
        if (pool) {
          const sum = [...assign.values()].reduce((a, b) => a + b, 0);
          nodes.push(h('button', { class: 'btn small', type: 'button', id: 'etApply', text: lv.length === 1 ? 'APPLY ' + pool + ' ET' : 'APPLY', disabled: lv.length > 1 && !sum, onclick: apply }));
        }
        nodes.push(h('p', { class: 'skill-out', role: 'alert', text: msg }));
        let busy = false;
        nodes.push(h('button', { class: 'btn', type: 'button', id: 'etDone', text: 'DONE', disabled: pool > 0, onclick: async () => {
          if (busy) return; busy = true;
          const r = result();
          try { if (r.spent > 0) await etSave(ch, held - r.spent); etDeclared.set(ch.id, 0); etRefresh(); close(r); }
          catch (e) { msg = e.message; busy = false; draw(); }
        } }), h('button', { class: 'btn small', type: 'button', id: 'etCancel', text: 'CANCEL ROLL', onclick: () => close(null) }));
        $('etBody').replaceChildren(...nodes);
      }
      draw();
      $('etModal').hidden = false;
      $('etTitle').focus({ preventScroll: true });
    });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('etModal').hidden) { const b = $('etCancel'); if (b) b.click(); } });

  // The QM hands out Explode Tokens (1-3 is the usual reward) to some or all player characters in the campaign.
  function giveEtCard(g) {
    const rows = state.campChars.filter((r) => !r.ch.isNpc && !r.stub && r.ch.info.alive !== false);
    $('etTitle').textContent = 'Give Explode Tokens';
    const checks = rows.map((r) => ({ r, cb: h('input', { type: 'checkbox', checked: true, 'aria-label': r.ch.info.name || 'Unnamed character' }) }));
    const amt = h('select', { id: 'etGiveAmt', 'aria-label': 'How many' }, [1, 2, 3].map((n) => h('option', { value: String(n), text: String(n) })));
    const msg = h('p', { class: 'skill-out', role: 'status', id: 'etGiveMsg' });
    const go = h('button', { class: 'btn', type: 'button', id: 'etGiveGo', text: 'GIVE', onclick: async () => {
      go.disabled = true; const n = Number(amt.value), done = [];
      for (const { r, cb } of checks) {
        if (!cb.checked) continue;
        const now = etHeld(r.ch), next = Math.min(10, now + n);
        try { if (next !== now) await etSave(r.ch, next); done.push((r.ch.info.name || 'Unnamed') + ' ' + next); }
        catch (e) { msg.textContent = e.message; go.disabled = false; return; }
      }
      msg.textContent = done.length ? 'Now holding: ' + done.join(', ') + ' (10 is the most).' : 'No one picked.'; go.disabled = false;
      try { renderCampaignPage(); } catch (e) { /* page not open */ }
    } });
    $('etBody').replaceChildren(
      h('p', { class: 'note', text: 'Hand out Explode Tokens. A character holds up to 10; a dead character cannot gain them.' }),
      ...checks.map(({ r, cb }) => h('label', { class: 'fld inline' }, cb, h('span', { text: (r.ch.info.name || 'Unnamed character') + '  (' + etHeld(r.ch) + ')' }))),
      h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'Each gets' }), amt), go, msg,
      h('button', { class: 'btn small', type: 'button', id: 'etGiveClose', text: 'CLOSE', onclick: () => { $('etModal').hidden = true; $('etBody').replaceChildren(); } }));
    $('etModal').hidden = false; $('etTitle').focus({ preventScroll: true });
  }
  // QM damage roller: a formula like "BP+3+1D6" or "2D8+4" is rolled, AC comes off (unless ignored), a critical doubles it, and the QM applies it to the target
  function damageCard(g) {
    const rows = state.campChars.filter((r) => !r.stub);
    const nm = (r) => (r.ch.info.name || 'Unnamed character') + (r.ch.isNpc ? ' (NPC)' : '');
    const target = h('select', { id: 'dmgTarget', 'aria-label': 'Target' }, rows.map((r) => h('option', { value: r.ch.id, text: nm(r) })));
    const bpFrom = h('select', { id: 'dmgBp', 'aria-label': 'Whose BP' }, [h('option', { value: '', text: '(no one)' })].concat(rows.map((r) => h('option', { value: r.ch.id, text: nm(r) }))));
    const formula = h('input', { id: 'dmgFormula', type: 'text', maxlength: '60', placeholder: 'BP+3+1D6', autocomplete: 'off', 'aria-label': 'Damage formula' });
    const noAc = h('input', { type: 'checkbox', id: 'dmgIgnoreAc', 'aria-label': 'Ignore AC' }), crit = h('input', { type: 'checkbox', id: 'dmgCrit', 'aria-label': 'Critical: double the damage after AC' });
    const out = h('p', { class: 'skill-out', id: 'dmgOut', role: 'status' });
    let pending = null;   // { id, dmg } waiting to be applied
    const apply = h('button', { class: 'btn', type: 'button', id: 'dmgApply', text: 'APPLY', disabled: true, onclick: async () => {
      if (!pending) return;
      apply.disabled = true;
      const tr = state.campChars.find((r) => r.ch.id === pending.id);
      try {
        if (pending.dmg > 0) await backend.qmDealDamage(g.id, pending.id, pending.dmg);
        if (tr && pending.dmg > 0) { tr.ch.vitals = tr.ch.vitals || {}; tr.ch.vitals.damage = r2((Number(tr.ch.vitals.damage) || 0) + pending.dmg); }
        out.textContent = pending.line + (pending.dmg > 0 ? ' Applied. ' : ' Nothing to apply. ') + pending.hp;
        pending = null;
        try { renderCampaignPage(); } catch (e) { /* page not open */ }
      } catch (e) { out.textContent = e.message; apply.disabled = false; }
    } });
    const stale = () => { pending = null; apply.disabled = true; };
    [target, bpFrom, formula, noAc, crit].forEach((el) => { el.addEventListener('input', stale); el.addEventListener('change', stale); });
    const roll = h('button', { class: 'btn', type: 'button', id: 'dmgRoll', text: 'ROLL', onclick: () => {
      stale();
      const tr = state.campChars.find((r) => r.ch.id === target.value), pp = parsePower(formula.value);
      if (!tr) { out.textContent = 'Pick a target.'; return; }
      if (!pp) { out.textContent = 'Use numbers, dice like 2D6, and BP, joined with + or -. Example: BP+3+1D6.'; return; }
      const src = bpFrom.value && state.campChars.find((r) => r.ch.id === bpFrom.value);
      if (pp.terms.some((t) => t.k === 'bp') && !src) { out.textContent = 'The formula uses BP. Pick whose BP to use.'; return; }
      const dice = pp.sides.map((sd) => rollDie(sd));
      const pw = powerFrom(pp, src ? BSH.compute(src.ch).stat : [], dice);
      const tres = BSH.compute(tr.ch), ac = noAc.checked ? 0 : tres.stat[BSH.STATS.findIndex((x) => x.key === 'AC')];
      const dmg = BSH.COMBAT.damage(pw.total, ac, crit.checked), before = tres.hpRemaining;
      const line = (dice.length ? 'Dice ' + dice.join(', ') + '. ' : '') + 'Damage ' + pw.text + ' = ' + fmt(pw.total) + (noAc.checked ? ', AC ignored' : ', minus AC ' + fmt(ac)) + ' = ' + fmt(BSH.COMBAT.damage(pw.total, ac, false))
        + (crit.checked ? ', doubled = ' + fmt(dmg) : '') + ' damage.';
      const hp = nm(tr) + ' HP ' + fmt(before) + ' to ' + fmt(before - dmg) + '.';
      pending = { id: tr.ch.id, dmg, line, hp };
      out.textContent = line + ' ' + hp + ' Tap APPLY to deal it.'; apply.disabled = false;
    } });
    $('etTitle').textContent = 'Roll Damage';
    $('etBody').replaceChildren(
      h('p', { class: 'note', text: 'Roll damage for a trap, a spell or anything outside a normal attack. Roll first, check the result, then apply it. Damage is attack power minus AC, never below 0.' }),
      h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'Target' }), target),
      h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'Formula (numbers, dice, BP)' }), formula),
      h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'BP comes from' }), bpFrom),
      h('label', { class: 'fld inline' }, noAc, h('span', { text: 'Ignore AC' })),
      h('label', { class: 'fld inline' }, crit, h('span', { text: 'Critical (double after AC)' })),
      roll, apply, out,
      h('button', { class: 'btn small', type: 'button', id: 'dmgClose', text: 'CLOSE', onclick: () => { $('etModal').hidden = true; $('etBody').replaceChildren(); } }));
    $('etModal').hidden = false; $('etTitle').focus({ preventScroll: true });
  }
  function giveEtButton(g) {
    return h('button', { class: 'btn small', type: 'button', id: 'giveEtBtn', text: 'GIVE EXPLODE TOKENS', onclick: () => giveEtCard(g) });
  }

  /* ----- skill check popup ----- */
  let skillChar = null;
  const skillAdv = advStepper();
  function skillRes() { return BSH.compute(skillChar); }
  function skillSync() {
    const i = +$('skillSel').value, m = skillRes().skillMod[i];
    $('skillModText').textContent = BSH.SKILLS[i].name + ' modifier ' + signed(m);
    $('skillOut').textContent = ''; $('skillMsg').textContent = '';
  }
  async function skillRoll(die) {
    const advNote = skillAdv.take();
    if (die == null) { $('skillMsg').textContent = 'Enter the number on your d20 (1 to 20).'; return; }
    const ch = skillChar, i = +$('skillSel').value, m = skillRes().skillMod[i];
    const r = await etRoll({ ch, title: BSH.SKILLS[i].name + ' check', sides: [20], typed: [die], labels: ['d20'], defensive: true });
    if (!r || skillChar !== ch) return;
    const g = r.groups[0], adj = g.natural === 1 ? -5 : g.natural === 20 ? 5 : 0, total = m + adj + g.total;
    $('skillMsg').textContent = '';
    $('skillOut').textContent = BSH.SKILLS[i].name + (advNote ? ' (' + advNote + ')' : '') + ': ' + g.text + (m < 0 ? ' - ' : ' + ') + fmt(Math.abs(m)) + (adj ? (adj < 0 ? ' - 5' : ' + 5') : '') + ' = ' + fmt(total);
  }
  function openSkillCheck(c) {
    skillChar = c;
    $('skillWho').textContent = c.info.name || 'Unnamed character';
    const mods = skillRes().skillMod;
    $('skillSel').replaceChildren(...BSH.SKILLS.map((s, i) => h('option', { value: String(i), text: s.name + '  ' + signed(mods[i]) })));
    $('skillDie').value = '';
    skillAdv.reset();
    $('skillEt').replaceChildren(etStepper(c), skillAdv.el);
    skillSync();
    $('skillModal').hidden = false;
    $('skillTitle').focus({ preventScroll: true });
  }
  function closeSkillCheck() { $('skillModal').hidden = true; skillChar = null; }
  $('skillSel').addEventListener('change', skillSync);
  $('skillRoll').addEventListener('click', () => skillRoll(skillAdv.roll(20)));
  $('skillSet').addEventListener('click', () => skillRoll(dieFrom($('skillDie').value)));
  $('skillClose').addEventListener('click', closeSkillCheck);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('skillModal').hidden) closeSkillCheck(); });

  /* ----- actions card: a list of actions, each opening a description card ----- */
  // Each action: a description, an AP cost, and optional reference lines worked out from the character (ref(stats) -> [label, value])
  const ACTIONS = [
    { name: 'Movement', desc: 'Run up to your full RD.', cost: '3 AP', refs: (st) => [['RD', fmt(st[2])]] },
    { name: 'Half Movement', desc: 'Run up to half your RD, rounded up.', cost: '2 AP', refs: (st) => [['1/2 RD', String(Math.ceil(st[2] / 2))]] },
    { name: 'Shift', desc: 'Move 1 space, avoiding standard reaction attacks.', cost: '1 AP' },
    { name: 'Unarmed Strike', attack: true, power: 'BP', desc: 'Make an Attack without a Weapon.', cost: '2 AP',
      refs: (st) => [['Range', '0-1'], ['Attack Dmg', fmt(st[BSH.STATS.findIndex((x) => x.key === 'BP')])]] },
    { name: 'Combo Attack', combo: true, desc: 'Declare a Combo Attack with another character in the encounter (the Finisher) and roll a Skill Check from the Combo Check table. It then waits for the Finisher\'s turn and ends when your next turn begins.', cost: '3 AP' },
    { name: 'Block/Parry', desc: 'Attempt to stop an Attack with an Equipped Weapon or Shield that has a CR. Use only as a Reaction to being Attacked.', cost: '1 AP',
      refs: (st, c) => [['CR', highestCr(c)]] },
    { name: 'Equip', desc: 'Equip an ordinary Item you have at the ready.', cost: '2 AP' },
    { name: 'Prepare Spellbook', desc: 'Equip a Spellbook and turn it to the Keyrune, enabling yourself to cast Spells from it.', cost: '3 AP' },
    { name: 'Reaction', desc: 'Use an Action to interrupt another Action. The Action must be Readied, or be useable as a Reaction.' },
    { name: 'Rest', card: true }
  ];
  let actionChar = null, actionMine = false;
  // Highest CR among items currently equipped (hands or body); CR is free text, so the number in it is what counts
  function bestCr(c) {
    let best = null;
    (c.items || []).forEach((it) => {
      if (!it || !(it.eqL || it.eqR || it.eqB)) return;
      const t = it.weaponProps && it.weaponProps.cr != null ? String(it.weaponProps.cr) : '', m = t.match(/-?\d+(\.\d+)?/);
      if (m && (best === null || Number(m[0]) > best)) best = Number(m[0]);
    });
    return best;
  }
  function highestCr(c) { const b = bestCr(c); return b === null ? 'N/A' : fmt(b); }
  // Rests from the rulebook (Travel, Rest, and Sustenance). hp/ep: dice [count, sides], flat add, pct of total HP.
  const REST_TYPES = [
    { name: 'Respite', duration: '1 hour', effect: 'You can roll a Med Check to make and apply a Salve if you are Trained in it. You recover 1D2 HP and 1D2-1 EP; this effect cannot be used again until you recover at least 2 EP.',
      bt: '1D4', hp: { dice: [1, 2] }, ep: { dice: [1, 2], add: -1 } },
    { name: 'Short Rest', duration: '4 hours', effect: 'You can sleep for up to 3 hours and/or eat a full meal if you wish. You recover 1D4+1 HP and 1D2+1 EP; this effect cannot be used again until you recover at least 6 EP.',
      bt: '2D4', hp: { dice: [1, 4], add: 1 }, ep: { dice: [1, 2], add: 1 } },
    { name: 'Full Rest', duration: '12 hours', effect: 'You can set up and take down camp, eat two full meals, and/or have a full sleep. You recover 1D4+10% of your total HP and 2D2+2 EP.',
      bt: '10+2D8', hp: { dice: [1, 4], pct: 0.1 }, ep: { dice: [2, 2], add: 2 } },
    { name: 'Long Rest', duration: '1 full day and 2 nights', effect: 'You recover 1D8+30% of your total HP and 1D6+6 EP.',
      bt: '20+2D12', hp: { dice: [1, 8], pct: 0.3 }, ep: { dice: [1, 6], add: 6 } },
    { name: 'Extended Rest', duration: '3 full days and 4 nights', effect: 'Your HP and EP are restored to full.', bt: 'all', full: true }
  ];
  const rollDie = (sides) => {
    const a = new Uint32Array(1), lim = Math.floor(4294967296 / sides) * sides;
    if (window.crypto && window.crypto.getRandomValues) { do { window.crypto.getRandomValues(a); } while (a[0] >= lim); return (a[0] % sides) + 1; }
    return 1 + Math.floor(Math.random() * sides);
  };
  // ADV/DIS stepper next to a ROLL button. Each tap adds one advantage (ADV) or one disadvantage (DIS); they cancel.
  // roll(sides) rolls the extra dice for the ROLL button; the stepper resets afterwards. take() returns (and clears) the note about the last roll.
  function advStepper() {
    let net = 0, last = '';
    const lab = h('span', { class: 'advlab', role: 'status' }), note = h('span', { class: 'advnote' });
    const sync = () => { lab.textContent = BSH.ADV.label(net); lab.classList.toggle('on', net !== 0); };
    const bump = (d) => { net = BSH.ADV.clamp(net + d); last = ''; note.textContent = ''; sync(); };
    const el = h('div', { class: 'advbox' },
      h('button', { class: 'btn small', type: 'button', text: 'DIS', 'aria-label': 'Add a disadvantage to the next roll', onclick: () => bump(-1) }), lab,
      h('button', { class: 'btn small', type: 'button', text: 'ADV', 'aria-label': 'Add an advantage to the next roll', onclick: () => bump(1) }), note);
    sync();
    return {
      el,
      roll(sides) { const r = BSH.ADV.roll(net, sides, rollDie); last = r.text; note.textContent = r.text; net = 0; sync(); return r.die; },
      take() { const t = last; last = ''; return t; },
      reset() { net = 0; last = ''; note.textContent = ''; sync(); }
    };
  }
  let actionBack = null;   // what BACK does on the card that is open
  function showActionCard(title, nodes, back) {
    $('actionName').textContent = title;
    $('actionDesc').replaceChildren(...nodes);
    actionBack = back;
    $('actionsList').hidden = true; $('actionsClose').hidden = true; $('actionsTitle').hidden = true; $('actionDetail').hidden = false;
    $('actionBack').focus({ preventScroll: true });
  }
  function restCard() {
    const mine = actionMine;
    showActionCard('Rest', [
      ...REST_TYPES.flatMap((t) => [
        h('span', { class: 'dline rest-name', text: t.name }),
        h('span', { class: 'dline', text: 'Duration: ' + t.duration }),
        h('span', { class: 'dline', text: 'Effect: ' + t.effect }),
        h('span', { class: 'dline dim', text: 'Bleed Tokens: removes ' + (t.bt === 'all' ? 'all' : t.bt) + ' BT (not tracked in the app).' }),
        mine ? h('button', { class: 'btn small', type: 'button', text: 'TAKE ' + t.name.toUpperCase(), onclick: () => restRoller(t) }) : null,
        h('hr', { class: 'rest-sep' })
      ].filter(Boolean))
    ], showActionList);
  }
  function restRoller(t) {
    const ch = actionChar, res = BSH.compute(ch), totHp = res.stat[0], totEp = res.stat[5];
    const hpNow = res.hpRemaining, epNow = vitalNow(ch, res, 'EP');
    const back = () => restCard();
    if (t.full) {
      const go = h('button', { class: 'btn', type: 'button', text: 'APPLY REST' }), msg = h('span', { class: 'dline', role: 'status' });
      go.addEventListener('click', async () => { go.disabled = true; await applyRest(ch, (c) => { setHp(c, totHp); c.vitals.epRemaining = null; }); msg.textContent = 'Done. HP and EP are full.'; });
      showActionCard(t.name, [h('span', { class: 'dline', text: 'No dice. HP ' + fmt(hpNow) + ' to ' + fmt(totHp) + ', EP ' + fmt(epNow) + ' to ' + fmt(totEp) + '.' }), go, msg], back);
      return;
    }
    const groups = [['HP', t.hp], ['EP', t.ep]], rows = [];
    async function rollRows(list) {
      const r = await etRoll({ ch, title: t.name, sides: list.map((x) => x.sides), labels: list.map((x) => x.key + ' D' + x.sides) });
      if (!r) return;
      list.forEach((x, i) => { x.input.value = r.groups[i].total; x.over = r.groups[i].total > x.sides; });
      update();
    }
    const nodes = [h('span', { class: 'dline', text: 'Roll each die, or type the number from your own die (typed numbers are taken as they are). The 1 and 20 rule does not apply to rests.' }), etStepper(ch)];
    groups.forEach(([key, g]) => {
      for (let i = 0; i < g.dice[0]; i++) {
        const input = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: String(g.dice[1]), class: 'num', 'aria-label': key + ' die ' + (i + 1) + ' (D' + g.dice[1] + ')', placeholder: 'D' + g.dice[1] });
        const roll = h('button', { class: 'btn small', type: 'button', text: 'ROLL', onclick: async () => { await rollRows([rows.find((x) => x.input === input)]); } });
        input.addEventListener('input', () => { const rr = rows.find((x) => x.input === input); if (rr) rr.over = false; update(); });
        rows.push({ key, sides: g.dice[1], input });
        nodes.push(h('div', { class: 'dmgrow rest-die' }, h('span', { class: 'dlbl', text: key + ' D' + g.dice[1] }), input, roll));
      }
    });
    const all = h('button', { class: 'btn small', type: 'button', text: 'ROLL ALL', onclick: async () => { await rollRows(rows); } });
    const sum = h('span', { class: 'dline', role: 'status' }), go = h('button', { class: 'btn', type: 'button', text: 'APPLY REST', disabled: true });
    nodes.push(all, sum, go);
    let gains = null;
    function update() {
      const vals = rows.map((r) => ({ r, v: r.input.value.trim() === '' ? null : Number(r.input.value) }));
      const bad = vals.some((x) => x.v !== null && (!Number.isInteger(x.v) || x.v < 1 || (x.v > x.r.sides && !x.r.over)));
      const done = vals.every((x) => x.v !== null) && !bad;
      sum.textContent = bad ? 'Each die must be a whole number from 1 to its sides.' : '';
      go.disabled = !done; gains = null;
      if (!done) return;
      const tot = (key) => vals.filter((x) => x.r.key === key).reduce((a, x) => a + x.v, 0);
      const hpGain = Math.max(0, r2(tot('HP') + (t.hp.add || 0) + (t.hp.pct ? totHp * t.hp.pct : 0)));
      const epGain = Math.max(0, r2(tot('EP') + (t.ep.add || 0)));
      const hpTo = Math.max(hpNow, Math.min(totHp, r2(hpNow + hpGain))), epTo = Math.max(epNow, Math.min(totEp, r2(epNow + epGain)));
      gains = { hpTo, epTo };
      sum.textContent = 'HP +' + fmt(hpGain) + ' (' + fmt(hpNow) + ' to ' + fmt(hpTo) + ')   EP +' + fmt(epGain) + ' (' + fmt(epNow) + ' to ' + fmt(epTo) + ')';
    }
    go.addEventListener('click', async () => {
      if (!gains) return; go.disabled = true; all.disabled = true; rows.forEach((r) => { r.input.disabled = true; });
      const g = gains; await applyRest(ch, (c) => { setHp(c, g.hpTo); c.vitals.epRemaining = g.epTo; });
      sum.textContent += '   Done.';
    });
    showActionCard(t.name, nodes, back);
  }
  // Writes a rest's result to the character (the roster row's copy and your own sheet copy)
  async function applyRest(rowCh, change) {
    const mine = findChar(rowCh.id);
    if (!mine) return;
    [mine, rowCh].forEach((c) => { c.vitals = c.vitals || {}; change(c); mine.updated = Date.now(); });
    if (hasAb(mine, /explosive personality/i) && mine.info.alive !== false && etHeld(mine) < 10) {   // Explosive Personality: +1 ET each rest
      const plusOne = etHeld(mine) + 1;
      [mine, rowCh].forEach((c) => { c.info = c.info || {}; c.info.explodeTokens = plusOne; });
    }
    try { await backend.saveCharacter(JSON.parse(JSON.stringify(mine))); } catch (e) { setCampaignMsgs('Could not save the rest: ' + e.message); }
    try { renderCampaignPage(); } catch (e) { /* page not open */ }
  }
  function showActionList() {
    actionBack = null; $('actionDetail').hidden = true; $('actionsList').hidden = false; $('actionsClose').hidden = false; $('actionsTitle').hidden = false;
  }
  // The character the card is about: the freshest copy from the roster, else the one it was opened with
  const actionCh = () => { const r = state.campChars.find((x) => x.ch.id === (actionChar && actionChar.id)); return r ? r.ch : actionChar; };
  const actionEncounter = () => { const c = actionCh(), g = c && state.campaigns.find((x) => x.id === c.campaignId); return g && g.encounter ? g : null; };
  let actionFeedback = '';

  // ----- Attacks: pick a target, roll a d12 (+SA; 1 is -5, 12 is +5); a total above the target's DA hits, and the
  // Attack Pwr minus the target's AC comes off its HP. Attack Pwr is the weapon's Attack Dmg (e.g. "BP+2+1D6"). -----
  // Attack Dmg like "BP+2+1D6" is split into terms; its dice are rolled together with the attack die (so Explode Tokens can go on any of them)
  function parsePower(expr) {
    const parts = String(expr || '').replace(/\s+/g, '').toUpperCase().match(/[+-]?[^+-]+/g);
    if (!parts) return null;
    const terms = [], sides = [];
    for (const p of parts) {
      const sign = p[0] === '-' ? -1 : 1, t = p.replace(/^[+-]/, ''); let m;
      if (t === 'BP') terms.push({ k: 'bp', sign });
      else if ((m = /^(\d+)D(\d+)$/.exec(t))) {
        const n = Math.min(+m[1], 100), sd = Math.max(1, +m[2]);
        if (sides.length + n > 100) return null;
        terms.push({ k: 'dice', sign, first: sides.length, n }); for (let i = 0; i < n; i++) sides.push(sd);
      } else if (/^\d+(\.\d+)?$/.test(t)) terms.push({ k: 'num', sign, v: Number(t) });
      else return null;
    }
    return { terms, sides };
  }
  function powerFrom(pp, st, diceTotals) {
    let total = 0; const shown = [];
    pp.terms.forEach((t) => {
      const v = t.k === 'bp' ? st[BSH.STATS.findIndex((x) => x.key === 'BP')] : t.k === 'num' ? t.v : diceTotals.slice(t.first, t.first + t.n).reduce((a, b) => a + b, 0);
      total += t.sign * v; shown.push((t.sign < 0 ? '-' : shown.length ? '+' : '') + fmt(v));
    });
    return { total: r2(total), text: shown.join(' ') };
  }

  // ----- Block / Parry: the target answers an attack aimed at them -----
  const canBlock = (c) => bestCr(c) !== null && vitalNow(c, BSH.compute(c), 'AP') >= 1;
  let atkWatch = null;
  function attackWatchTick() {
    if (!atkWatch) return;
    const w = atkWatch, g = state.campaigns.find((x) => x.id === w.campaignId), e = g && g.encounter;
    const done = (txt) => {
      w.out.textContent = txt;
      [w.rollBtn, w.goBtn, w.die, w.sel].forEach((x) => { x.hidden = false; }); w.die.value = '';
      atkWatch = null; try { renderCampaignPage(); } catch (er) { /* page not open */ }
    };
    if (!e) { done('The encounter ended.'); return; }
    if (e.lastAttack && e.lastAttack.id === w.attackId) done(e.lastAttack.text);
    else if (!e.attack || e.attack.id !== w.attackId) done('The attack is no longer waiting.');
  }
  const dismissedAtk = new Set();
  let defendOpen = null;
  async function defendCheck() {
    try {
      if (!state.user) { if (defendOpen) closeDefend(); return; }
      if (defendOpen) {
        const g = state.campaigns.find((x) => x.id === defendOpen.campaignId), at = g && g.encounter && g.encounter.attack;
        if (!at || at.id !== defendOpen.id) closeDefend();
        return;
      }
      for (const g of state.campaigns) {
        const at = g.encounter && g.encounter.attack;
        if (!at || dismissedAtk.has(at.id) || !myMembership(g) || (at.combo && at.combo.state !== 'defend')) continue;
        let tc = state.chars.find((x) => x.id === at.target && x.campaignId === g.id);
        let ac = state.chars.find((x) => x.id === at.attacker) || null;
        if (!tc && iAmQm(g)) {
          const rows = await backend.listCampaignCharacters(g.id);
          rows.forEach((r) => { r.ch = normalizeChar(r.ch); });
          const t = rows.find((r) => r.ch.id === at.target && !r.stub); tc = t && t.ch;
          const a = rows.find((r) => r.ch.id === at.attacker); ac = a && a.ch;
        } else if (tc && !ac) {
          const rows = await backend.listCampaignCharacters(g.id); const a = rows.find((r) => r.ch.id === at.attacker); ac = a && a.ch;
        }
        if (!tc) continue;
        dismissedAtk.add(at.id);
        openDefend(g, at, tc, ac); return;
      }
    } catch (e) { /* try again next tick */ }
  }

  // Works out an attack on a target (their DA, plus any block already added) and applies it; the target's player or a QM runs this.
  // The characters of a campaign as I can see them (mine, or everything a QM can open); used to look up the Leader and Finisher of a combo.
  async function campaignChar(g, id) {
    const own = state.chars.find((x) => x.id === id) || (state.campChars.find((r) => r.ch.id === id && !r.stub) || {}).ch;
    if (own) return own;
    try { const rows = await backend.listCampaignCharacters(g.id); const r = rows.find((x) => x.ch.id === id && !x.stub); return r ? normalizeChar(r.ch) : null; } catch (e) { return null; }
  }
  const SA_IX = () => BSH.STATS.findIndex((x) => x.key === 'SA');
  async function resolveAttackNow(g, at, tc, blockText, daEff) {
    const res = BSH.compute(tc), ix = (k) => BSH.STATS.findIndex((x) => x.key === k), da = res.stat[ix('DA')], ar = res.stat[ix('AC')];
    const tn = tc.info.name || 'Unnamed character', eff = daEff == null ? da : daEff, before = res.hpRemaining, C = BSH.COMBAT;
    const head = ' vs ' + tn + "'s DA " + fmt(da) + (blockText || '') + ': ';
    const hpLine = (d) => ' ' + tn + ' HP ' + fmt(before) + ' to ' + fmt(before - d) + '.';
    let dmg = 0, txt = '', eff2 = {}; const critFail = [], usedCrit = [], nextCrit = [];
    const holds = (c) => !!(c && c.vitals && c.vitals.nextCrit);   // Next Hit Critical (from a Tracking Perfect Combo)
    if (!at.combo) {
      const atkr = await campaignChar(g, at.attacker);
      let kind = C.classify(at.total, eff);
      if (holds(atkr) && (kind === 'hit' || kind === 'crit')) { kind = 'crit'; usedCrit.push(at.attacker); }
      const plain = C.damage(at.power, ar, false);
      if (kind === 'crit' || kind === 'hit') {
        dmg = C.damage(at.power, ar, kind === 'crit');
        txt = at.text + head + (kind === 'crit' ? 'CRITICAL HIT. ' : 'HIT. ') + 'Attack Pwr ' + fmt(at.power) + ' minus AC ' + fmt(ar) + ' = ' + fmt(plain)
          + (kind === 'crit' ? ', doubled = ' + fmt(dmg) : '') + ' damage.' + (usedCrit.length ? ' (Next Hit Critical spent.)' : '') + hpLine(dmg) + (kind === 'crit' ? " It has disadvantage on Skill Checks that are part of the attack's effect." : '');
      } else if (kind === 'critfail') { critFail.push(at.attacker); txt = at.text + head + 'CRITICAL MISS. The attacker recovers 2 less AP at the start of their next turn.'; }
      else txt = at.text + head + 'MISS.';
    } else {
      const lead = await campaignChar(g, at.combo.leader), fin = await campaignChar(g, at.attacker);
      const L0 = { total: Number(at.combo.lTotal), power: Number(at.combo.lPower) }, F0 = { total: Number(at.total), power: Number(at.power) };
      const name = at.combo.skill + (at.combo.level ? ' CL ' + at.combo.level : ' (no level)');
      let r = BSH.COMBO.resolve({ da: eff, ac: ar, skill: at.combo.skill, level: at.combo.level, L: L0, F: F0,
        critMax: hasAb(lead, /^Critical Reave Theory$/i) ? 4 : 3, perfectMax: hasAb(lead, /^Perfectionist$/i) ? 1 : 0, forceCrit: { L: holds(lead), F: holds(fin) } });
      let fTotal = F0.total, again = '';
      if (r.retry) {   // both missed: the Finisher rolls again and keeps the better roll; a hit that way is a normal attack
        const sa = fin ? BSH.compute(fin).stat[SA_IX()] : 0, d = rollDie(12), adj = d === 1 ? -5 : d === 12 ? 5 : 0, t2 = r2(sa + adj + d);
        again = ' Finisher rolls again: ' + d + (adj ? (adj < 0 ? ' - 5' : ' + 5') : '') + ' + SA ' + fmt(sa) + ' = ' + fmt(t2) + '.';
        if (t2 > fTotal) fTotal = t2;
        let kind = C.classify(fTotal, eff);
        if (holds(fin) && (kind === 'hit' || kind === 'crit')) { kind = 'crit'; usedCrit.push(at.attacker); }
        if (kind === 'crit' || kind === 'hit') { dmg = C.damage(F0.power, ar, kind === 'crit'); again += ' ' + (kind === 'crit' ? 'CRITICAL HIT' : 'HIT') + ' as a normal attack, ' + fmt(dmg) + ' damage.'; }
        txt = 'Combo Attack (' + name + ')' + head + 'both attacks missed.' + again + (dmg > 0 ? hpLine(dmg) : '');
      } else {
        dmg = r.damage; eff2 = r.effects;
        if (r.used && r.used.L) usedCrit.push(at.combo.leader);
        if (r.used && r.used.F) usedCrit.push(at.attacker);
        if (r.bonus && r.bonus.crit) nextCrit.push(at.combo.leader, at.attacker);   // Tracking Perfect Combo: both attackers' next hit is critical
        const label = r.kind === 'perfect' ? 'PERFECT COMBO' : r.kind === 'critical' ? 'CRITICAL COMBO' : 'COMBO HIT';
        txt = 'Combo Attack (' + name + ')' + head + label + ' (rolls ' + fmt(L0.total) + ' and ' + fmt(F0.total) + ', ' + fmt(r.diff) + ' apart). '
          + (r.bonus ? (r.recv === 'both' ? 'Both gain: ' : 'Finisher gains: ') + r.bonus.t + ' ' : '')
          + (r.L.hit && r.F.hit ? 'Both hit' : r.L.hit ? 'Leader hit' : 'Finisher hit') + (r.L.crit || r.F.crit ? ' (a critical hit)' : '') + '. '
          + fmt(dmg) + ' damage after AC ' + fmt(ar) + '.' + hpLine(dmg)
          + (usedCrit.length ? ' Next Hit Critical spent.' : '') + (nextCrit.length ? " Both attackers' next hit is a critical hit." : '');
      }
      if (C.classify(L0.total, eff) === 'critfail') critFail.push(at.combo.leader);
      if (C.classify(F0.total, eff) === 'critfail') critFail.push(at.attacker);
      if (critFail.length) txt += ' Critical Miss: ' + (critFail.length > 1 ? 'both recover' : 'one recovers') + ' 2 less AP next turn.';
    }
    // the target's own points: a block spends 1 AP; some combo bonuses drain AP or SP
    let ap = vitalNow(tc, res, 'AP'), sp = vitalNow(tc, res, 'SP'), apNew = ap, spNew = sp;
    if (blockText && /spent 1 AP/.test(blockText)) apNew = r2(apNew - 1);
    if (eff2.ap) apNew = Math.max(0, r2(apNew - eff2.ap));
    if (eff2.sp) spNew = Math.max(0, r2(spNew - eff2.sp));
    tc.vitals = tc.vitals || {};
    if (apNew !== ap) { await backend.setVital(tc.id, 'apRemaining', apNew); tc.vitals.apRemaining = apNew; }
    if (spNew !== sp) { await backend.setVital(tc.id, 'spRemaining', spNew); tc.vitals.spRemaining = spNew; }
    await backend.resolveAttack(g.id, at.id, dmg, txt.slice(0, 500), critFail, usedCrit, nextCrit);
    try { renderCampaignPage(); } catch (e) { /* page not open */ }
  }

  // QM only: an attack on a player's character is waiting for them; the QM can finish it with no block.
  function renderAttackWait() {
    const box = $('attackWait');
    if (!box) return;
    box.replaceChildren();
    const g = state.campaigns.find((x) => x.id === curCampaignId), at = g && g.encounter && g.encounter.attack;
    if (!at || (at.combo && at.combo.state !== 'defend') || !iAmQm(g) || state.campCharsFor !== g.id) return;
    const tr = state.campChars.find((r) => r.ch.id === at.target && !r.stub), ar = state.campChars.find((r) => r.ch.id === at.attacker);
    if (!tr || tr.ch.isNpc) return;   // a QM already gets the block prompt for NPCs
    const tn = tr.ch.info.name || 'Unnamed character', an = (ar && ar.ch.info.name) || 'Someone';
    const msg = h('span', { text: an + ' attacked ' + tn + ' (' + at.text + '). Waiting for their player to block, parry or take it.' });
    box.append(h('div', { class: 'enc-banner', role: 'status' }, h('strong', { text: 'ATTACK WAITING' }), msg,
      h('div', { class: 'acts' }, h('button', { class: 'btn small', type: 'button', id: 'noBlock', text: 'NO BLOCK', onclick: async (ev) => {
        ev.target.disabled = true;
        try { await resolveAttackNow(g, at, tr.ch, ' (no block)', null); } catch (e) { msg.textContent = e.message; ev.target.disabled = false; }
      } }))));
  }
  function closeDefend() { $('defendModal').hidden = true; $('defendBody').replaceChildren(); defendOpen = null; }
  function openDefend(g, at, tc, ac) {
    defendOpen = { campaignId: g.id, id: at.id };
    const res = BSH.compute(tc), ix = (k) => BSH.STATS.findIndex((x) => x.key === k), da = res.stat[ix('DA')], ar = res.stat[ix('AC')];
    const tn = tc.info.name || 'Unnamed character', an = (ac && ac.info && ac.info.name) || 'Someone';
    const cr = bestCr(tc), can = canBlock(tc);
    $('defendTitle').textContent = tn + ' is under attack';
    const out = h('p', { class: 'skill-out', role: 'status' });
    let busy = false;
    async function finish(blockText, daEff) {
      if (busy) return; busy = true;
      try { await resolveAttackNow(g, at, tc, blockText, daEff); closeDefend(); }
      catch (e) { out.textContent = e.message; } finally { busy = false; }
    }
    const nodes = [
      h('p', { class: 'enc-sub', text: (at.combo ? an + ' and the Leader make a Combo Attack (' + at.combo.skill + (at.combo.level ? ' CL ' + at.combo.level : '') + '): ' + at.text + ' and ' + (at.combo.lText || '') : an + ' attacks: ' + at.text) + ' against your DA ' + fmt(da) + '.' }),
      h('p', { class: 'note', text: 'Your AC is ' + fmt(ar) + (can ? '. You can block or parry for 1 AP using your CR ' + fmt(cr) + ': roll a d12 and your DA goes up by the roll plus the CR.' : '.') })
    ];
    if (can) {
      const die = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '12', step: '1', placeholder: 'd12', 'aria-label': 'Your d12' });
      const advB = advStepper();
      const blk = async (n) => {
        const advNote = advB.take();
        if (!(n >= 1 && n <= 12) || Math.floor(n) !== n) { out.textContent = 'Enter the number on your d12 (1 to 12).'; return; }
        const rr = await etRoll({ ch: tc, title: 'Block / Parry', sides: [12], typed: [n], labels: ['Block d12'] });
        if (!rr) return;
        const gb = rr.groups[0], inc = gb.total + cr;
        finish(' + block (' + (advNote ? advNote + '; ' : '') + gb.text + ' + CR ' + fmt(cr) + ' = ' + fmt(inc) + ', spent 1 AP) = DA ' + fmt(da + inc), da + inc);
      };
      nodes.push(etStepper(tc), advB.el, h('button', { class: 'btn small', type: 'button', text: 'BLOCK / PARRY (ROLL D12)', onclick: () => { const n = advB.roll(12); die.value = n; blk(n); } }), die,
        h('button', { class: 'btn small', type: 'button', text: 'BLOCK WITH MY ROLL', onclick: () => blk(die.value === '' ? NaN : Number(die.value)) }));
    }
    nodes.push(h('button', { class: 'btn', type: 'button', text: 'TAKE IT', onclick: () => finish('', da) }), out);
    $('defendBody').replaceChildren(...nodes);
    $('defendModal').hidden = false;
    $('defendTitle').focus({ preventScroll: true });
  }

  function attackCard(a) {
    const g = actionEncounter(), me = actionCh();
    const targets = state.campChars.filter((r) => !r.stub && r.ch.id !== me.id && g.encounter.initiatives && g.encounter.initiatives[r.ch.id]);
    const sel = h('select', { id: 'atkTarget', 'aria-label': 'Target' }, targets.map((r) => h('option', { value: r.ch.id, text: r.ch.info.name || 'Unnamed character' })));
    const die = h('input', { id: 'atkDie', type: 'number', inputmode: 'numeric', min: '1', max: '12', step: '1', placeholder: 'd12', 'aria-label': 'Your d12' });
    const out = h('p', { class: 'skill-out', id: 'atkOut', role: 'status' });
    const hint = h('span', { class: 'dline dim', text: targets.length ? 'Cost: ' + a.cost + ' (spent when you attack).' : 'No one else is in this encounter to attack.' });
    // a Combo Attack a Leader has set up with me as the Finisher: tick the box to make this attack the combo
    const myCombos = Object.values((g.encounter && g.encounter.combos) || {}).filter((c) => c.finisher === me.id);
    const comboBox = h('input', { type: 'checkbox', id: 'atkCombo', 'aria-label': 'Make this a Combo Attack' });
    const comboRow = myCombos.length ? h('label', { class: 'dline' }, comboBox, ' Combo Attack with ' + (((state.campChars.find((r) => r.ch.id === myCombos[0].leader) || {}).ch || {}).info || {}).name
      + ' (' + myCombos[0].skill + (myCombos[0].level ? ' CL ' + myCombos[0].level : ', no level') + '). The Leader rolls next.') : null;
    let busy = false;
    const adv = advStepper();
    async function go(n) {
      if (busy) return;
      const advNote = adv.take();
      if (!(n >= 1 && n <= 12) || Math.floor(n) !== n) { out.textContent = 'Enter the number on your d12 (1 to 12).'; return; }
      const tr = state.campChars.find((r) => r.ch.id === sel.value), mc = actionCh();
      if (!tr || !actionEncounter()) { out.textContent = 'Pick a target.'; return; }
      const m = /^(\d+(?:\.\d+)?)\s*(AP|SP)$/.exec(a.cost || ''), res = BSH.compute(mc);
      if (m && vitalNow(mc, res, m[2]) < Number(m[1])) { out.textContent = 'Not enough ' + m[2] + ' for ' + a.name + ' (' + fmt(vitalNow(mc, res, m[2])) + ' left).'; return; }
      const st = res.stat, tres = BSH.compute(tr.ch), ts = tres.stat, ix = (k) => BSH.STATS.findIndex((x) => x.key === k);
      const sa = st[ix('SA')], da = ts[ix('DA')], ac = ts[ix('AC')];
      const tn = tr.ch.info.name || 'Unnamed character';
      busy = true;
      try {
        const pp = parsePower(a.power), canDef = canBlock(tr.ch);
        const rr = await etRoll({ ch: mc, title: a.name, sides: [12].concat(pp ? pp.sides : []), typed: [n], flashy: true,
          labels: ['Attack d12'].concat(pp ? pp.sides.map((sd) => 'Damage d' + sd) : []) });
        if (!rr) return;
        const ga = rr.groups[0], nat = ga.natural, adj = nat === 1 ? -5 : nat === 12 ? 5 : 0, total = r2(sa + adj + ga.total);
        const mine = (advNote ? '(' + advNote + ') ' : '') + ga.text + (adj ? (adj < 0 ? ' - 5' : ' + 5') : '') + ' + SA ' + fmt(sa) + ' = ' + fmt(total);
        const line = mine + ' vs ' + tn + "'s DA " + fmt(da) + ': ';
        const pw = pp ? powerFrom(pp, st, rr.groups.slice(1).map((x) => x.total)) : null;
        const combo = comboBox.checked && myCombos[0] ? myCombos[0] : null;
        if (combo && tr.ch.id === combo.leader) { out.textContent = 'Pick a target other than the Leader.'; return; }
        if ((canDef || combo) && pw) {
          // the target can block or parry (or this is a Combo Attack): their device answers, then the result comes back here
          if (m) await performAction({ name: a.name, cost: a.cost });
          const id = await backend.startAttack(mc.id, tr.ch.id, total, pw.total, mine, combo ? combo.leader : null);
          out.textContent = mine + '. ' + (combo ? 'Waiting for the Leader to roll their attack, then ' + tn + ' answers...' : 'Waiting for ' + tn + ' to block, parry or take it (the QM can skip the block)...');
          rollBtn.hidden = goBtn.hidden = die.hidden = sel.hidden = true;
          atkWatch = { campaignId: mc.campaignId, attackId: id, out, rollBtn, goBtn, die, sel };
          return;
        }
        if (m) await performAction({ name: a.name, cost: a.cost });
        const kind = BSH.COMBAT.classify(total, da);
        if (kind === 'critfail') { out.textContent = line + 'CRITICAL MISS. You recover 2 less AP at the start of your next turn.'; const own = findChar(mc.id); if (own) { own.vitals = Object.assign({}, own.vitals, { apPenalty: 2 }); queueSave(own); } return; }
        if (!(total > da)) { out.textContent = line + 'MISS.'; return; }
        if (!pw) { out.textContent = line + 'HIT, but this weapon\'s Attack Dmg ("' + (a.power || '') + '") is not a formula the app can work out. Apply the damage by hand.'; return; }
        const dmg = BSH.COMBAT.damage(pw.total, ac, kind === 'crit');
        if (dmg > 0) await backend.dealDamage(mc.id, tr.ch.id, dmg);
        const before = tres.hpRemaining;
        if (dmg > 0) { tr.ch.vitals = tr.ch.vitals || {}; tr.ch.vitals.damage = r2((Number(tr.ch.vitals.damage) || 0) + dmg); }
        out.textContent = line + (kind === 'crit' ? 'CRITICAL HIT. ' : 'HIT. ') + 'Attack Pwr ' + pw.text + ' = ' + fmt(pw.total) + ', minus AC ' + fmt(ac) + ' = ' + fmt(BSH.COMBAT.damage(pw.total, ac, false)) + (kind === 'crit' ? ', doubled = ' + fmt(dmg) : '') + ' damage. ' + tn + ' HP ' + fmt(before) + ' to ' + fmt(BSH.compute(tr.ch).hpRemaining) + '.';
        try { renderCampaignPage(); } catch (e) { /* page not open */ }
      } catch (e) { out.textContent = e.message; } finally { busy = false; }
    }
    const rollBtn = h('button', { class: 'btn small', type: 'button', text: 'ROLL D12', onclick: () => { const n = adv.roll(12); die.value = n; go(n); } });
    const goBtn = h('button', { class: 'btn small', type: 'button', text: 'ATTACK WITH MY ROLL', onclick: () => go(die.value === '' ? NaN : Number(die.value)) });
    showActionCard(a.name, [h('span', { class: 'dline', text: 'Target' }), sel, hint, comboRow, etStepper(me), adv.el, rollBtn, die, goBtn, out].filter(Boolean), renderAndBack);
  }
  // ----- Combo Attacks -----
  // The Leader declares a Finisher, picks a skill and rolls the Combo Check (d20 + that skill's modifier, ET allowed); that costs 3 AP.
  // The result waits on the encounter until the Finisher's turn, and ends when the Leader's next turn begins.
  function comboCard(a) {
    const g = actionEncounter(), me = actionCh();
    const others = state.campChars.filter((r) => !r.stub && r.ch.id !== me.id && g.encounter.initiatives && g.encounter.initiatives[r.ch.id]);
    const fin = h('select', { id: 'comboFinisher', 'aria-label': 'Finisher' }, others.map((r) => h('option', { value: r.ch.id, text: r.ch.info.name || 'Unnamed character' })));
    const skill = h('select', { id: 'comboSkill', 'aria-label': 'Skill' }, BSH.COMBO.skills().map((n) => h('option', { value: n, text: n + '  ' + signed(BSH.compute(me).skillMod[BSH.SKILLS.findIndex((x) => x.name === n)]) })));
    const die = h('input', { id: 'comboDie', type: 'number', inputmode: 'numeric', min: '1', max: '20', step: '1', placeholder: 'd20', 'aria-label': 'Your d20' });
    const out = h('p', { class: 'skill-out', id: 'comboOut', role: 'status' });
    const dream = hasAb(me, /^Making the Dream Work$/i);
    const dreamBox = dream ? h('input', { type: 'checkbox', id: 'comboDream', 'aria-label': 'Spend 1 Explode Token to cut the cost by 1' }) : null;
    const existing = (g.encounter.combos || {})[me.id];
    let busy = false;
    const adv = advStepper();
    async function go(n) {
      if (busy) return;
      const advNote = adv.take();
      if (!(n >= 1 && n <= 20) || Math.floor(n) !== n) { out.textContent = 'Enter the number on your d20 (1 to 20).'; return; }
      const mc = actionCh(), f = others.find((r) => r.ch.id === fin.value);
      if (!f || !actionEncounter()) { out.textContent = 'Pick a Finisher.'; return; }
      const res = BSH.compute(mc), i = BSH.SKILLS.findIndex((x) => x.name === skill.value), mod = res.skillMod[i];
      const wantDream = !!(dreamBox && dreamBox.checked);
      let cost = BSH.COMBO.COST;
      if (wantDream && etHeld(mc) < 1) { out.textContent = 'You have no Explode Token to spend.'; return; }
      if (wantDream) cost = Math.max(1, cost - 1);
      if (vitalNow(mc, res, 'AP') < cost) { out.textContent = 'Not enough AP for a Combo Attack (' + fmt(vitalNow(mc, res, 'AP')) + ' left, ' + fmt(cost) + ' needed).'; return; }
      busy = true;
      try {
        const rr = await etRoll({ ch: mc, title: 'Combo Check: ' + skill.value, sides: [20], typed: [n], labels: ['d20'], defensive: true });
        if (!rr) return;
        const g0 = rr.groups[0], adj = g0.natural === 1 ? -5 : g0.natural === 20 ? 5 : 0, total = r2(mod + adj + g0.total), level = BSH.COMBO.level(total);
        const fname = f.ch.info.name || 'Unnamed character';
        const text = skill.value + (advNote ? ' (' + advNote + ')' : '') + ': ' + g0.text + (mod < 0 ? ' - ' : ' + ') + fmt(Math.abs(mod)) + (adj ? (adj < 0 ? ' - 5' : ' + 5') : '') + ' = ' + fmt(total);
        await backend.setCombo(mc.id, f.ch.id, skill.value, level, total, text);
        if (wantDream) await etSave(mc, etHeld(mc) - 1);
        await performAction({ name: 'Combo Attack', cost: fmt(cost) + ' AP' });
        const b = BSH.COMBO.bonus(skill.value, BSH.COMBO.column(level));
        out.textContent = text + (level ? '. Level reached: CL ' + level + (b ? ' (' + b.t + ')' : '') : '. Below CL 10: no bonus') + '. ' + fname + ' can make the Combo Attack on their turn; it ends when your next turn begins.';
        try { renderCampaignPage(); } catch (e) { /* page not open */ }
      } catch (e) { out.textContent = e.message; } finally { busy = false; }
    }
    const rollBtn = h('button', { class: 'btn small', type: 'button', text: 'ROLL D20', onclick: () => { const n = adv.roll(20); die.value = n; go(n); } });
    const goBtn = h('button', { class: 'btn small', type: 'button', text: 'ROLL WITH MY D20', onclick: () => go(die.value === '' ? NaN : Number(die.value)) });
    showActionCard(a.name, [
      h('span', { class: 'dline', text: others.length ? 'Finisher' : 'No one else is in this encounter yet.' }), others.length ? fin : null,
      h('span', { class: 'dline', text: 'Skill (any of these)' }), skill,
      existing ? h('span', { class: 'dline dim', text: 'You already have a combo waiting; this replaces it.' }) : null,
      dream ? h('label', { class: 'dline' }, dreamBox, ' Making the Dream Work: spend 1 ET to cut the cost to 2 AP.') : null,
      h('span', { class: 'dline dim', text: 'Cost: 3 AP (spent when you roll).' }), etStepper(me), rollBtn, die, goBtn, out].filter(Boolean), renderAndBack);
  }

  // The Leader's half: the Finisher has started the combo; the Leader (their player, or the QM for an NPC) picks an attack and rolls.
  const attackOptions = (c) => [{ name: 'Unarmed Strike', power: 'BP', cost: '2 AP' }].concat(((c && c.items) || []).filter((it) => it && it.weapon && it.name).map((it) => {
    const wp = it.weaponProps || {}; return { name: it.name, power: wp.dmg, cost: String(wp.cost || '').trim() || null };
  }));
  const dismissedCombo = new Set();
  let comboOpen = null;
  function closeComboLeader() { $('comboModal').hidden = true; $('comboBody').replaceChildren(); comboOpen = null; }
  async function comboLeaderCheck() {
    try {
      if (!state.user) { if (comboOpen) closeComboLeader(); return; }
      if (comboOpen) {
        const g = state.campaigns.find((x) => x.id === comboOpen.campaignId), at = g && g.encounter && g.encounter.attack;
        if (!at || at.id !== comboOpen.id || !at.combo || at.combo.state !== 'leader') closeComboLeader();
        return;
      }
      for (const g of state.campaigns) {
        const at = g.encounter && g.encounter.attack;
        if (!at || !at.combo || at.combo.state !== 'leader' || dismissedCombo.has(at.id) || !myMembership(g)) continue;
        let lc = state.chars.find((x) => x.id === at.combo.leader && x.campaignId === g.id);
        if (!lc && iAmQm(g)) { const c = await campaignChar(g, at.combo.leader); if (c && c.isNpc) lc = c; }
        if (!lc) continue;
        const fc = await campaignChar(g, at.attacker), tc = await campaignChar(g, at.target);
        dismissedCombo.add(at.id);
        openComboLeader(g, at, lc, (fc && fc.info.name) || 'The Finisher', (tc && tc.info.name) || 'the target');
        return;
      }
    } catch (e) { /* try again next tick */ }
  }
  function openComboLeader(g, at, lc, fname, tname) {
    comboOpen = { campaignId: g.id, id: at.id };
    const opts = attackOptions(lc), out = h('p', { class: 'skill-out', role: 'status' });
    const sel = h('select', { id: 'comboWeapon', 'aria-label': 'Your attack' }, opts.map((o, i) => h('option', { value: String(i), text: o.name + (o.cost ? ' (' + o.cost + ')' : '') })));
    const die = h('input', { id: 'comboLDie', type: 'number', inputmode: 'numeric', min: '1', max: '12', step: '1', placeholder: 'd12', 'aria-label': 'Your d12' });
    let busy = false;
    const adv = advStepper();
    async function go(n) {
      if (busy) return;
      const advNote = adv.take();
      if (!(n >= 1 && n <= 12) || Math.floor(n) !== n) { out.textContent = 'Enter the number on your d12 (1 to 12).'; return; }
      const a = opts[+sel.value], pp = parsePower(a.power), res = BSH.compute(lc), m = /^(\d+(?:\.\d+)?)\s*AP$/.exec(a.cost || ''), cost = m ? Number(m[1]) : 0;
      if (!pp) { out.textContent = a.name + "'s Attack Dmg is not a formula the app can work out. Pick another attack."; return; }
      if (cost && vitalNow(lc, res, 'AP') < cost) { out.textContent = 'Not enough AP for ' + a.name + ' (' + fmt(vitalNow(lc, res, 'AP')) + ' left, ' + fmt(cost) + ' needed).'; return; }
      busy = true;
      try {
        const rr = await etRoll({ ch: lc, title: 'Combo: ' + a.name, sides: [12].concat(pp.sides), typed: [n], flashy: true, labels: ['Attack d12'].concat(pp.sides.map((sd) => 'Damage d' + sd)) });
        if (!rr) return;
        const ga = rr.groups[0], adj = ga.natural === 1 ? -5 : ga.natural === 12 ? 5 : 0, sa = res.stat[SA_IX()], total = r2(sa + adj + ga.total);
        const pw = powerFrom(pp, res.stat, rr.groups.slice(1).map((x) => x.total));
        const text = 'Leader ' + (lc.info.name || '') + (advNote ? ' (' + advNote + ')' : '') + ': ' + ga.text + (adj ? (adj < 0 ? ' - 5' : ' + 5') : '') + ' + SA ' + fmt(sa) + ' = ' + fmt(total);
        if (cost) { const ap = r2(vitalNow(lc, res, 'AP') - cost); await backend.setVital(lc.id, 'apRemaining', ap); lc.vitals = Object.assign({}, lc.vitals, { apRemaining: ap }); }
        await backend.comboLeaderAttack(g.id, at.id, total, pw.total, text);
        closeComboLeader();
        try { renderCampaignPage(); } catch (e) { /* page not open */ }
      } catch (e) { out.textContent = e.message; } finally { busy = false; }
    }
    $('comboTitle').textContent = (lc.info.name || 'Your character') + ': roll your half of the combo';
    $('comboBody').replaceChildren(
      h('p', { class: 'enc-sub', text: fname + ' has started the Combo Attack (' + at.combo.skill + (at.combo.level ? ' CL ' + at.combo.level : '') + ') on ' + tname + '. Pick your attack and roll.' }),
      sel, etStepper(lc), adv.el,
      h('button', { class: 'btn small', type: 'button', text: 'ROLL D12', onclick: () => { const n = adv.roll(12); die.value = n; go(n); } }), die,
      h('button', { class: 'btn small', type: 'button', text: 'ATTACK WITH MY ROLL', onclick: () => go(die.value === '' ? NaN : Number(die.value)) }),
      h('button', { class: 'btn small', type: 'button', text: 'CALL OFF THE COMBO ATTACK', onclick: async () => {
        try { await backend.cancelComboAttack(g.id, at.id); closeComboLeader(); try { renderCampaignPage(); } catch (e) { /* page not open */ } } catch (e) { out.textContent = e.message; } } }),
      out);
    $('comboModal').hidden = false;
  }
  // Campaign page: combos waiting for their Finisher, and a combo attack stuck waiting for its Leader
  function renderComboBox() {
    const box = $('comboBox');
    if (!box) return;
    box.replaceChildren();
    const g = state.campaigns.find((x) => x.id === curCampaignId), e = g && g.encounter;
    if (!e || state.campCharsFor !== g.id) return;
    const nm = (id) => { const r = state.campChars.find((x) => x.ch.id === id); return (r && r.ch.info && r.ch.info.name) || 'Someone'; };
    const mineOrQm = (id) => iAmQm(g) || state.chars.some((c) => c.id === id);
    Object.values(e.combos || {}).forEach((cb) => {
      const lvl = cb.level ? 'CL ' + cb.level : 'below CL 10';
      const can = mineOrQm(cb.leader) || mineOrQm(cb.finisher);
      box.append(h('div', { class: 'enc-banner', role: 'status', 'data-combo': cb.leader },
        h('strong', { text: 'COMBO READY' }),
        h('span', { text: nm(cb.leader) + ' (Leader) and ' + nm(cb.finisher) + ' (Finisher): ' + cb.skill + ', ' + lvl + '. ' + nm(cb.finisher) + ' can attack with it on their turn; it ends when ' + nm(cb.leader) + "'s next turn begins." }),
        can ? h('div', { class: 'acts' }, h('button', { class: 'btn small', type: 'button', text: mineOrQm(cb.leader) && !state.chars.some((c) => c.id === cb.finisher) ? 'CANCEL COMBO' : 'DECLINE / CANCEL', onclick: async (ev) => {
          ev.target.disabled = true;
          try { await backend.cancelCombo(cb.leader); await pollCampaigns(); renderCampaignPage(); } catch (er) { ev.target.textContent = er.message; } } })) : null));
    });
    const at = e.attack;
    if (at && at.combo && at.combo.state === 'leader') {
      const can = mineOrQm(at.attacker) || mineOrQm(at.combo.leader);
      box.append(h('div', { class: 'enc-banner', role: 'status', 'data-combo-wait': at.id },
        h('strong', { text: 'COMBO ATTACK' }), h('span', { text: nm(at.attacker) + ' has started the combo on ' + nm(at.target) + '. Waiting for ' + nm(at.combo.leader) + ' (Leader) to roll their attack.' }),
        can ? h('div', { class: 'acts' }, h('button', { class: 'btn small', type: 'button', text: 'CALL OFF', onclick: async (ev) => {
          ev.target.disabled = true;
          try { await backend.cancelComboAttack(g.id, at.id); await pollCampaigns(); renderCampaignPage(); } catch (er) { ev.target.textContent = er.message; } } })) : null));
    }
  }
  function renderAndBack() { renderActionList(); showActionList(); }
  // Spending: cost strings look like "3 AP" / "2 SP"; the matching "remaining" box on the sheet goes down by that amount
  async function performAction(a) {
    const c = actionCh(), m = /^(\d+(?:\.\d+)?)\s*(AP|SP)$/.exec(a.cost || '');
    if (!m || !actionEncounter()) return;
    const key = m[2], amount = Number(m[1]), res = BSH.compute(c), now = vitalNow(c, res, key);
    if (now < amount) { actionFeedback = 'Not enough ' + key + ' for ' + a.name + ' (' + fmt(now) + ' left).'; renderActionList(); return; }
    const next = r2(now - amount), field = key.toLowerCase() + 'Remaining';
    try {
      await backend.setVital(c.id, field, next);
    } catch (e) { actionFeedback = e.message; renderActionList(); return; }
    [c, findChar(c.id), actionChar].forEach((x) => { if (x) { x.vitals = x.vitals || {}; x.vitals[field] = next; } });
    actionFeedback = 'Action Performed: ' + a.name + ' (-' + fmt(amount) + ' ' + key + ')';
    renderActionList();
    try { renderCampaignPage(); } catch (e) { /* page not open */ }
  }
  function renderActionList() {
    const c = actionCh(), g = actionEncounter(), live = !!g && !!c;
    const canAct = live && (actionMine || iAmQm(g)), res = live ? BSH.compute(c) : null;
    const kids = [];
    if (live) kids.push(h('div', { class: 'apboxes' },
      h('div', { class: 'apbox' }, h('span', { class: 'lbl', text: 'AP Remaining' }), h('b', { id: 'actionAp', text: fmt(vitalNow(c, res, 'AP')) })),
      h('div', { class: 'apbox' }, h('span', { class: 'lbl', text: 'SP Remaining' }), h('b', { id: 'actionSp', text: fmt(vitalNow(c, res, 'SP')) }))));
    const weaponActs = ((c && c.items) || []).filter((it) => it && it.weapon && it.name).map((it) => {
      const wp = it.weaponProps || {}, cost = String(wp.cost || '').trim();
      return { attack: true, power: wp.dmg, name: 'Attack: ' + it.name, desc: 'Make an Attack with ' + it.name + '.', cost: cost || null,
        refs: () => [['Type', wp.type], ['Size', wp.size], ['Weight', wp.weight], ['Dmg Type', wp.damage], ['Range', wp.range], ['CR', wp.cr], ['Attack Dmg', wp.dmg], ['Effect', wp.effect]]
          .filter(([, v]) => v != null && String(v).trim() !== '').map(([l, v]) => [l, String(v)]) };
    });
    ACTIONS.slice(0, -1).concat(weaponActs, ACTIONS.slice(-1)).forEach((a) => kids.push(h('div', { class: 'arow' },
      h('button', { class: 'btn', type: 'button', text: a.name, onclick: () => {
        if (a.card) { restCard(); return; }
        const st = BSH.compute(actionCh()).stat;
        showActionCard(a.name, [a.desc, a.cost ? 'Cost: ' + a.cost : null, ...(a.refs ? a.refs(st, actionCh()).map(([l, v]) => l + ': ' + v) : [])]
          .filter(Boolean).map((t) => h('span', { class: 'dline', text: t })), showActionList);
      } }),
      a.cost ? (canAct ? h('button', { class: 'acost', type: 'button', text: a.cost, 'aria-label': 'Perform ' + a.name + ' for ' + a.cost, onclick: () => (a.attack ? attackCard(a) : a.combo ? comboCard(a) : performAction(a)) })
                       : h('span', { class: 'acost', text: a.cost })) : null)));
    if (live) kids.push(h('p', { class: 'skill-out', id: 'actionFeedback', role: 'status', text: actionFeedback }));
    $('actionsList').replaceChildren(...kids);
  }
  function openActions(c, mine) {
    actionChar = c; actionMine = !!mine; actionFeedback = '';
    renderActionList();
    showActionList();
    $('actionsModal').hidden = false;
    $('actionsTitle').focus({ preventScroll: true });
  }
  function closeActions() { $('actionsModal').hidden = true; actionChar = null; actionFeedback = ''; showActionList(); }
  $('actionBack').addEventListener('click', () => { (actionBack || showActionList)(); });
  $('actionsClose').addEventListener('click', closeActions);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('actionsModal').hidden) { if (!$('actionDetail').hidden) (actionBack || showActionList)(); else closeActions(); } });

  /* ================= Encounters ================= */
  // A QM starts an encounter; every member gets a prompt to roll initiative (d20 + Initiative Bonus,
  // -5 on a natural 1, +5 on a natural 20) for each of their characters in that campaign.
  const ENC_WAIT_MS = 10000;                       // the QM can step in for a player after this long
  const ibOf = (c) => Math.round(BSH.compute(c).stat[3] * 100) / 100;
  const myPcs = (g) => state.chars.filter((c) => c.campaignId === g.id && !c.isNpc);
  function initText(i) {
    return 'd20 ' + i.die + (i.ib < 0 ? ' - ' : ' + ') + 'IB ' + fmt(Math.abs(i.ib)) +
      (i.die === 1 ? ' - 5' : i.die === 20 ? ' + 5' : '') + ' = ' + fmt(i.total);
  }
  const dieFrom = (text) => { const t = String(text).trim(); return /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 20 ? +t : null; };

  async function saveInit(g, c, die, onError) {
    if (die == null) { onError('Enter the number on your d20 (1 to 20).'); return; }
    try {
      const r = await etRoll({ ch: c, title: 'Initiative: ' + (c.info.name || 'Unnamed character'), sides: [20], typed: [die], labels: ['d20'] });
      if (!r) return;
      const gr = r.groups[0];   // Explode Tokens raise the total, so they are added to the Initiative Bonus that is stored
      await backend.setInitiative(g.id, c.id, gr.natural, Math.round((ibOf(c) + gr.total - gr.natural) * 100) / 100);
      onError('');
      await pollCampaigns(true);
    } catch (e) { onError(e.message); }
  }

  // ----- the prompt shown to players -----
  const dismissedEnc = new Set();
  let encModal = null, encChecking = false;
  function closeEncModal() { $('encounterModal').hidden = true; encModal = null; $('encMsg').textContent = ''; }
  const encSig = (g) => JSON.stringify([g.encounter && g.encounter.id, g.encounter && g.encounter.initiatives,
    myPcs(g).map((c) => [c.id, c.info.name, ibOf(c)])]);

  function renderEncModal() {
    const g = state.campaigns.find((x) => x.id === encModal.campaignId);
    if (!g || !g.encounter) return;
    encModal.sig = encSig(g);
    $('encCampaign').textContent = g.name;
    const pcs = myPcs(g).slice().sort((a, b) => (a.info.name || '').localeCompare(b.info.name || ''));
    const rows = pcs.map((c) => {
      const done = g.encounter.initiatives[c.id];
      const row = h('div', { class: 'enc-row' },
        h('div', { class: 'enc-name' }, h('span', { text: c.info.name || 'Unnamed character' }), h('span', { class: 'tag', text: 'IB ' + fmt(ibOf(c)) })));
      if (done) {
        row.append(h('p', { class: 'enc-done', text: 'Initiative ' + fmt(done.total) + '  (' + initText(done) + ')' + (done.by === 'qm' ? ' - set by the QM' : '') }));
      } else {
        const input = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '20', placeholder: 'd20', 'aria-label': 'Your d20 roll for ' + (c.info.name || 'this character') });
        const adv = advStepper();
        row.append(etStepper(c), adv.el, h('div', { class: 'enc-ctl' },
          h('button', { class: 'btn small', type: 'button', text: 'ROLL D20', onclick: () => saveInit(g, c, adv.roll(20), (m) => { $('encMsg').textContent = m; }) }),
          h('span', { class: 'lbl', text: 'or' }), input,
          h('button', { class: 'btn small', type: 'button', text: 'SET ROLL', onclick: () => saveInit(g, c, dieFrom(input.value), (m) => { $('encMsg').textContent = m; }) })));
      }
      return row;
    });
    if (!pcs.length) rows.push(h('p', { class: 'note', text: 'You have no characters linked to this campaign. Link one from its INFO tab to take part.' }));
    else rows.unshift(h('p', { class: 'note', text: 'Roll initiative for each character. Tap ROLL D20, or roll your own die and enter the number. It adds the Initiative Bonus (IB); a 1 takes off 5 and a 20 adds 5.' }));
    $('encRows').replaceChildren(...rows);
  }
  async function showEncModal(g) {
    await refreshChars();
    const cur2 = state.campaigns.find((x) => x.id === g.id);
    if (!state.user || !cur2 || !cur2.encounter || cur2.encounter.id !== g.encounter.id) return false;
    encModal = { campaignId: cur2.id, encId: cur2.encounter.id, sig: '' };
    $('encMsg').textContent = '';
    renderEncModal();
    $('encounterModal').hidden = false;
    $('encTitle').focus({ preventScroll: true });
    return true;
  }
  async function encounterCheck() {
    if (encChecking) return;
    encChecking = true;
    try {
      if (!state.user) { if (encModal) closeEncModal(); return; }
      if (encModal) {
        const g = state.campaigns.find((x) => x.id === encModal.campaignId);
        if (!g || !g.encounter || g.encounter.id !== encModal.encId || !myMembership(g)) closeEncModal();
        else if (encSig(g) !== encModal.sig) renderEncModal();
        return;
      }
      for (const g of state.campaigns) {
        if (!g.encounter || !myMembership(g) || dismissedEnc.has(g.encounter.id)) continue;
        dismissedEnc.add(g.encounter.id);            // each player is notified once per encounter
        await refreshChars();                        // pick up anything handed to me or changed on another device
        if (iAmQm(g) && !myPcs(g).length) continue;  // a QM with no characters of their own has nothing to roll
        await showEncModal(g);
        return;
      }
    } finally { encChecking = false; }
  }
  $('encExit').addEventListener('click', closeEncModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && encModal) closeEncModal(); });

  // ----- keeping every device up to date (light polling: the campaign list is small) -----
  let pollSig = '', polling = false;
  async function pollCampaigns(force) {
    if (!state.user || !booted || polling) return;
    if (!force && document.visibilityState !== 'visible') return;
    polling = true;
    try {
      const next = await backend.listCampaigns();
      if (!state.user) return;
      const sig = JSON.stringify(next);
      if (sig !== pollSig) {
        pollSig = sig; state.campaigns = next; campaignsLoaded = true;
        syncCharLinks();
        renderCampaigns();
      }
    } catch (e) { /* offline or signed out: try again next tick */ } finally { polling = false; }
    await encounterCheck();
    await spawnSync();
    collectGifts();
    await liveEncounterSync();
    attackWatchTick();
    renderAttackWait();
    await defendCheck();
    await comboLeaderCheck();
  }
  // A new turn: that character regains all AP and some SP (1 + 1 per 10 full points of max SP; none if AP was 0 going in).
  // My own device does it for my characters; a QM's device does it for anyone on the campaign page they have open. Once per turn change.
  async function applyTurnStarts() {
    for (const g of state.campaigns) {
      const e = g.encounter;
      if (!e || !e.turn || !(e.seq > 0) || !myMembership(g)) continue;
      const mark = e.id + ':' + e.seq;
      let c = state.chars.find((x) => x.id === e.turn && x.campaignId === g.id), mine = !!c;
      if (!c && iAmQm(g) && state.campCharsFor === g.id) { const r = state.campChars.find((x) => x.ch.id === e.turn && !x.stub); c = r && r.ch; }
      if (!c || (c.vitals && c.vitals.turnMark === mark)) continue;
      const cres = BSH.compute(c), max = cres.stat[1], gain = 1 + Math.floor(Math.max(0, max) / 10), apMax = cres.stat[VITALS.find((x) => x[0] === 'AP')[1]];
      let res; try { res = await backend.startTurn(c.id, gain, max, apMax); } catch (err) { continue; }
      c.vitals = c.vitals || {}; c.vitals.turnMark = mark;
      if (res && res.applied) {
        c.vitals.apRemaining = res.apRemaining == null ? null : res.apRemaining; c.vitals.spRemaining = res.sp; delete c.vitals.apPenalty;
        const mc = findChar(c.id); if (mc && mc !== c) { mc.vitals = Object.assign({}, mc.vitals, c.vitals); }
        if (mine) showToast('Your turn, ' + (c.info.name || 'character') + ': ' + (res.apRemaining == null ? 'AP back to full' : 'AP back to ' + fmt(res.apRemaining) + ' (a Critical Miss cost you 2)') + (res.spGain > 0 ? ', SP +' + fmt(res.spGain) : '') + '.');
        try { renderCampaignPage(); } catch (err) { /* page not open */ }
        if (!$('actionsModal').hidden && !$('actionsList').hidden) renderActionList();
      }
    }
  }
  // While an encounter is running, keep my characters and the roster fresh (AP, HP and so on change as people act)
  let campSig = '';
  async function liveEncounterSync() {
    try {
      if (!state.user || !state.campaigns.some((g) => g.encounter && myMembership(g))) return;
      await refreshChars();
      await applyTurnStarts();
      if (curCampaignId && !$('screen-campaign').hidden && state.campaigns.some((g) => g.id === curCampaignId && g.encounter)) {
        const rows = await backend.listCampaignCharacters(curCampaignId);
        const sig = JSON.stringify(rows);
        if (sig !== campSig && !$('screen-campaign').hidden) {
          campSig = sig;
          state.campChars = rows; state.campChars.forEach((r) => { r.ch = normalizeChar(r.ch); }); state.campCharsFor = curCampaignId;
          renderCampaignPage();
        }
      }
      if (!$('actionsModal').hidden && !$('actionsList').hidden) renderActionList();
    } catch (e) { /* try again next tick */ }
  }
  setInterval(pollCampaigns, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pollCampaigns(); });


  /* ================= Items given to my characters ================= */
  // Gifts wait on the server. Each is added to the character's sheet once (giftLog guards against repeats), saved, and only then confirmed.
  let collecting = false;
  function showToast(text) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { t.hidden = true; }, 7000);
  }
  $('toast').addEventListener('click', () => { $('toast').hidden = true; });
  async function collectGifts() {
    if (!state.user || collecting || pending || saving || saveTimer) return;
    collecting = true;
    try {
      const gifts = await backend.pendingGifts();
      if (!gifts.length || !state.user || pending || saving || saveTimer) return;
      const byChar = {};
      gifts.forEach((g) => { (byChar[g.characterId] = byChar[g.characterId] || []).push(g); });
      const done = [], said = [];
      for (const cid of Object.keys(byChar)) {
        const open = cur && !cur.viewOnly && cur.ch.id === cid && !$('screen-sheet').hidden;
        let ch = open ? cur.ch : null;
        if (!ch) {
          const row = (await backend.listCharacters()).find((c) => c.id === cid);
          if (!row) { done.push(...byChar[cid].map((g) => g.id)); continue; }   // the character is gone: drop the gift
          ch = normalizeChar(row);
        }
        let changed = false;
        for (const g of byChar[cid]) {
          if (receiveItem(ch, g)) {
            changed = true;
            said.push(g.item.qty + ' ' + g.item.name + ' from ' + g.fromName + (ch.info.name ? ' (to ' + ch.info.name + ')' : ''));
          }
          done.push(g.id);
        }
        if (changed) {
          ch.updated = Date.now();
          if (open) { queueSave(ch); await flushSave(); rebuild('items'); refresh(); }
          else {
            await backend.saveCharacter(JSON.parse(JSON.stringify(ch)));
            const k = state.chars.findIndex((c) => c.id === cid);
            if (k >= 0) state.chars[k] = ch;
            if (!$('screen-characters').hidden) renderCharList();
          }
          if (pending) return;   // the save did not go through: leave the gifts waiting (giftLog stops repeats)
        }
      }
      await backend.ackGifts(done);
      if (said.length) showToast('You received ' + said.join('; ') + '.');
    } catch (e) { /* offline: try again on the next tick */ } finally { collecting = false; }
  }

  // ----- the campaign page -----
  let assignOpen = false, assignSel = null, eventOpen = false, mapPickOpen = false, mapPickList = [], mapPickSel = null;
  const evDraft = { name: '', total: '', oneTime: false, round: '' };
  // an event in the roster: it has a turn like a character, but no sheet, vitals or actions
  function eventRow(g, ev, qm, turnId, enc) {
    const myTurn = ev.id === turnId, inPlay = !ev.oneTime || ev.round === (enc.round || 1);
    const row = h('div', { class: 'member cchar event' + (myTurn ? ' turn' : ''), 'data-event': ev.id },
      myTurn ? h('span', { class: 'turnmark', role: 'img', 'aria-label': 'Current turn', text: '>' }) : null,
      h('div', { class: 'cname' }, h('span', { class: 'ename', text: ev.name }), h('span', { class: 'sub', text: 'Event' })),
      h('span', { class: 'tag', text: 'EVENT' }),
      inPlay ? h('span', { class: 'tag init', text: 'INIT ' + fmt(ev.total) }) : h('span', { class: 'tag', text: 'LATER · INIT ' + fmt(ev.total) }),
      ev.oneTime ? h('span', { class: 'tag', text: 'ROUND ' + ev.round + ' ONLY' }) : null);
    if (qm) {
      row.append(h('span', { class: 'tag', text: ev.visible ? 'SHOWN' : 'HIDDEN' }),
        h('button', { class: 'btn small', type: 'button', text: ev.visible ? 'HIDE FROM PLAYERS' : 'SHOW TO PLAYERS',
          onclick: () => campaignAction(() => backend.setEventVisible(g.id, ev.id, !ev.visible)).then(() => pollCampaigns(true)) }),
        h('button', { class: 'btn small', type: 'button', text: 'REMOVE',
          onclick: () => campaignAction(() => backend.removeEvent(g.id, ev.id)).then(() => pollCampaigns(true)) }));
      if (myTurn) row.append(h('button', { class: 'btn small', type: 'button', text: 'END TURN',
        onclick: () => campaignAction(() => backend.advanceTurn(g.id, ev.id)).then(() => pollCampaigns(true)) }));
    }
    return row;
  }
  function eventForm(g, me, qm) {
    const rnd = (g.encounter && g.encounter.round) || 1;
    const name = h('input', { type: 'text', id: 'eventName', maxlength: '60', autocomplete: 'off', 'aria-label': 'Event name', placeholder: 'Event name', value: evDraft.name });
    const tot = h('input', { type: 'number', id: 'eventInit', inputmode: 'numeric', step: 'any', 'aria-label': 'Event initiative', placeholder: 'Initiative', value: evDraft.total });
    const one = h('input', { type: 'checkbox', id: 'eventOne', 'aria-label': 'One Time' }); one.checked = evDraft.oneTime;
    const round = h('input', { type: 'number', id: 'eventRound', inputmode: 'numeric', min: String(rnd), step: '1', 'aria-label': 'Round for the event', placeholder: 'Round', value: evDraft.round });
    round.hidden = !evDraft.oneTime;
    const err = h('span', { class: 'lbl', role: 'alert', id: 'eventMsg' });
    name.addEventListener('input', () => { evDraft.name = name.value; });
    tot.addEventListener('input', () => { evDraft.total = tot.value; });
    round.addEventListener('input', () => { evDraft.round = round.value; });
    one.addEventListener('input', () => { evDraft.oneTime = one.checked; round.hidden = !one.checked; if (one.checked && !round.value) { round.value = String(rnd); evDraft.round = round.value; } });
    const add = h('button', { class: 'btn small', type: 'button', id: 'eventAdd', text: 'ADD', onclick: async () => {
      err.textContent = '';
      const nm = name.value.trim(), t = Number(tot.value);
      if (!nm) { err.textContent = 'Give the event a name.'; return; }
      if (tot.value === '' || !isFinite(t)) { err.textContent = 'Give the event an initiative number.'; return; }
      const r = Number(round.value);
      if (one.checked && !(Number.isInteger(r) && r >= rnd)) { err.textContent = 'Pick round ' + rnd + ' or later.'; return; }
      try {
        await backend.addEvent(g.id, { name: nm, total: t, oneTime: one.checked, round: one.checked ? r : null });
        evDraft.name = ''; evDraft.total = ''; evDraft.oneTime = false; evDraft.round = ''; eventOpen = false;
        await pollCampaigns(true);
      } catch (e) { err.textContent = e.message; }
    } });
    return h('div', { class: 'acts', id: 'eventForm' }, name, tot, h('label', { class: 'lbl' }, one, ' One Time'), round, add, err);
  }
  function renderEncounterBox(g, me, qm) {
    const box = $('encounterBox');
    box.replaceChildren();
    if (!me) return;
    const e = g.encounter;
    $('encMapTab').hidden = true;
    if (!e) {
      assignOpen = false; eventOpen = false; mapPickOpen = false;
      if (qm) box.append(h('div', { class: 'acts' }, h('button', { class: 'btn small', type: 'button', text: 'START ENCOUNTER',
        onclick: () => campaignAction(() => backend.startEncounter(g.id)) })));
      return;
    }
    const mine = myPcs(g), left = mine.filter((c) => !e.initiatives[c.id]).length;
    const note = !mine.length ? 'Initiative shows next to each character below.'
      : left ? left + (left === 1 ? ' of your characters still needs' : ' of your characters still need') + ' to roll initiative.'
      : 'All of your characters have rolled initiative.';
    const acts = h('div', { class: 'acts' });
    if (mine.length) acts.append(h('button', { class: 'btn small', type: 'button', text: left ? 'ROLL INITIATIVE' : 'VIEW INITIATIVE', onclick: () => showEncModal(g) }));
    if (qm) acts.append(confirmButton('END ENCOUNTER', 'TAP AGAIN TO END', () => campaignAction(() => backend.endEncounter(g.id))));
    const rows = state.campCharsFor === g.id ? state.campChars : [];
    const evs = e.events || [];
    const order = BSHBackend.turnOrder(BSHBackend.turnSlots(e), rows.map((r) => r.ch.id).concat(evs.map((ev) => ev.id)));
    const turnRow = e.turn ? rows.find((r) => r.ch.id === e.turn) : null, turnEv = e.turn ? evs.find((ev) => ev.id === e.turn) : null;
    const turnLine = !order.length ? 'Nobody has rolled initiative yet.' : turnRow ? 'Turn: ' + (turnRow.ch.info.name || 'Unnamed character')
      : turnEv ? 'Turn: ' + turnEv.name : 'Turn: someone you cannot see';
    if (qm) {
      acts.append(h('button', { class: 'btn small', type: 'button', text: 'ADVANCE TURN', disabled: !e.turn || !order.length,
        onclick: () => campaignAction(() => backend.advanceTurn(g.id, e.turn)).then(() => pollCampaigns(true)) }));
      acts.append(h('button', { class: 'btn small', type: 'button', text: assignOpen ? 'CANCEL ASSIGN' : 'ASSIGN TURN', disabled: !order.length,
        onclick: () => { assignOpen = !assignOpen; renderEncounterBox(g, me, qm); } }));
      acts.append(h('button', { class: 'btn small', type: 'button', id: 'eventToggle', text: eventOpen ? 'CANCEL EVENT' : 'ADD EVENT',
        onclick: () => { eventOpen = !eventOpen; renderEncounterBox(g, me, qm); } }));
      acts.append(h('button', { class: 'btn small', type: 'button', id: 'mapToggle', text: mapPickOpen ? 'CANCEL MAP' : e.mapId ? 'CHANGE MAP' : 'ADD MAP',
        onclick: async () => {
          if (mapPickOpen) { mapPickOpen = false; renderEncounterBox(g, me, qm); return; }
          try { mapPickList = await backend.listMaps(g.id); } catch (er) { setCampaignMsgs(er.message); return; }
          if (!mapPickList.length) { setCampaignMsgs('There are no maps yet. Use CREATE ENCOUNTER MAP first.'); return; }
          setCampaignMsgs(''); mapPickOpen = true; renderEncounterBox(g, me, qm);
        } }));
      if (e.mapId) acts.append(h('button', { class: 'btn small', type: 'button', id: 'mapRemove', text: 'REMOVE MAP',
        onclick: () => campaignAction(() => backend.setEncounterMap(g.id, null)).then(() => pollCampaigns(true)) }));
    }
    const assignRow = qm && assignOpen && order.length ? (() => {
      const sel = h('select', { id: 'assignSel', 'aria-label': 'Whose turn it is now' },
        order.map((id) => { const r = rows.find((x) => x.ch.id === id), ev = evs.find((x) => x.id === id);
          return h('option', { value: id, text: r ? (r.ch.info.name || 'Unnamed character') + (r.ch.isNpc ? ' (NPC)' : '') : ev.name + ' (event)' }); }));
      sel.value = order.includes(assignSel) ? assignSel : (e.turn && order.includes(e.turn) ? e.turn : order[0]);
      sel.addEventListener('change', () => { assignSel = sel.value; });
      return h('div', { class: 'acts' }, sel, h('button', { class: 'btn small', type: 'button', text: 'MAKE IT THEIR TURN',
        onclick: () => { assignOpen = false; campaignAction(() => backend.assignTurn(g.id, sel.value)).then(() => pollCampaigns(true)); } }));
    })() : null;
    const mapRow = qm && mapPickOpen && mapPickList.length ? (() => {
      const sel = h('select', { id: 'mapPickSel', 'aria-label': 'Map for this encounter' }, mapPickList.map((m) => h('option', { value: m.id, text: m.name })));
      sel.value = mapPickList.some((m) => m.id === mapPickSel) ? mapPickSel : (mapPickList.some((m) => m.id === e.mapId) ? e.mapId : mapPickList[0].id);
      sel.addEventListener('change', () => { mapPickSel = sel.value; });
      return h('div', { class: 'acts' }, sel, h('button', { class: 'btn small', type: 'button', id: 'mapUse', text: 'USE THIS MAP',
        onclick: () => { mapPickOpen = false; campaignAction(() => backend.setEncounterMap(g.id, sel.value)).then(() => pollCampaigns(true)); } }));
    })() : null;
    // everyone gets a tab on the left edge to flip over to the map
    const tab = $('encMapTab');
    tab.hidden = !e.mapId; tab.onclick = () => { if (e.mapId) go(mapRoute('mapview', g.id, e.mapId)); };
    box.append(h('div', { class: 'enc-banner', role: 'status' }, h('strong', { text: 'AN ENCOUNTER IS ACTIVE' }),
      h('span', { class: 'round', id: 'roundTracker', text: 'ROUND ' + (e.round || 1) }), h('span', { id: 'turnLine', text: turnLine }),
      h('span', { text: note }), acts, assignRow, mapRow, qm && eventOpen ? eventForm(g, me, qm) : null));
  }

  /* ================= Spawn Character ================= */
  // A QM starts it from the campaign page. Everyone goes to the spawn page; the non-QM players take turns (in a random order
  // picked by the database) writing the description, picking an ability, fighting style and weapon, then the backstory and
  // motivation, and finally all add talent / proficiency points at once. The new character goes to a random player from the
  // QM's list (or becomes an NPC if nobody was ticked).
  const SPAWN_TEXT = {
    appearance: 'Give a physical description of this character in 1-3 sentences',
    backstory: 'Give a backstory for this character in 1-3 sentences',
    motivation: 'Give a motivation for this character in 1-3 sentences'
  };
  const SPAWN_STEP_NAME = { appearance: 'Appearance', ability: 'Ability', style: 'Fighting style', weapon: 'Weapon', backstory: 'Backstory', motivation: 'Motivation', points: 'Talent and proficiency points', incarnation: 'Previous incarnation', build: 'Adding the character' };
  const SPAWN_STEP_DO = { appearance: 'describe the character', ability: 'pick an ability', style: 'pick a fighting style', weapon: 'pick a weapon', backstory: 'write the backstory', motivation: 'write the motivation' };
  let spawnForOpen = false, spawnForSel = new Set(), spawnDraft = { id: null, text: {}, pts: [{}, {}, {}, {}] };
  const spawnSeen = new Set();   // spawns I have already been taken to
  let spawnBuilding = false, spawnLast = null, spawnSig = '';

  // The character as it stands: everything picked so far (a draft to look at) or, once finished, the one that gets saved.
  function buildSpawnChar(sp, campaignId) {
    const T = window.BSH_SPAWN_DATA, D = sp.data || {};
    const c = normalizeChar({ id: sp.charId || 'draft-' + sp.id, created: Date.now(), updated: Date.now() });
    c.campaignId = campaignId;
    c.appearance = D.appearance || ''; c.backstory = D.backstory || ''; c.motivation = D.motivation || '';
    if (D.ability != null && T.abilities[D.ability]) c.abilities.push({ name: T.abilities[D.ability].name, desc: T.abilities[D.ability].desc });
    if (D.style != null && T.styles[D.style]) c.abilities.push({ name: 'Fighting Style: ' + T.styles[D.style].name, desc: T.styles[D.style].desc });
    if (D.weapon != null && T.weapons[D.weapon]) {
      const w = T.weapons[D.weapon];
      c.items.push({ name: w.type, qty: 1, charges: null, desc: '', wearable: false, weapon: true, magic: false, buffs: [],
        weaponProps: cleanWeapon(w), magicProps: cleanMagic({}) });
    }
    Object.keys(sp.points || {}).forEach((u) => (sp.points[u] || []).forEach((p) => {
      c.talents[p.up] = (Number(c.talents[p.up]) || 0) + 2;
      c.talents[p.down] = (Number(c.talents[p.down]) || 0) - 1;
      c.prof[p.prof] = (Number(c.prof[p.prof]) || 0) + 1;
    }));
    if (sp.prev) c.info.incarnation = (Number(sp.prev.incarnation) || 1) + 1;
    return c;
  }
  const spawnName = (g, uid) => { const m = g.members.find((x) => x.userId === uid); return m ? m.username : 'someone who left'; };

  // ----- campaign page: the QM's button + "who is this character for?" form, and the banner everyone sees while one runs -----
  function renderSpawnBanner(g, me) {
    const box = $('spawnBanner');
    box.replaceChildren();
    if (!me || !g.spawn) return;
    box.append(h('div', { class: 'enc-banner', role: 'status' }, h('strong', { text: 'A CHARACTER IS BEING SPAWNED' }),
      h('span', { text: 'Step: ' + (SPAWN_STEP_NAME[g.spawn.step] || '') }),
      h('div', { class: 'acts' }, h('button', { class: 'btn small', type: 'button', id: 'spawnOpen', text: 'OPEN', onclick: () => go('spawn-' + g.id) }))));
  }
  function renderSpawnBox(g, me, qm) {
    const box = $('spawnBox');
    box.replaceChildren();
    if (!me || !qm || !spawnForOpen || g.spawn) return;
    const msg = h('p', { class: 'msg', id: 'spawnFormMsg', role: 'alert' });
    const boxes = g.members.slice().sort((a, b) => a.username.localeCompare(b.username)).map((m) => {
      const cb = h('input', { type: 'checkbox', 'data-spawn-for': m.userId, 'aria-label': m.username });
      cb.checked = spawnForSel.has(m.userId);
      cb.addEventListener('input', () => { if (cb.checked) spawnForSel.add(m.userId); else spawnForSel.delete(m.userId); });
      return h('label', { class: 'chk' }, cb, h('span', { text: ' ' + m.username + (m.role === 'qm' ? ' (QM)' : '') }));
    });
    box.append(h('h3', { class: 'sec', text: 'Who is this character for?' }),
      h('p', { class: 'note', text: 'Tick any number of players. The new character goes to one of them at random. Tick nobody to make it an NPC.' }),
      h('div', { class: 'give-row', style: 'display:flex;flex-direction:column;gap:.4rem' }, boxes),
      h('div', { class: 'acts' },
        h('button', { class: 'btn small', type: 'button', id: 'spawnStart', text: 'START', onclick: async () => {
          msg.textContent = '';
          try { await backend.startSpawn(g.id, [...spawnForSel]); spawnForOpen = false; spawnForSel = new Set(); await pollCampaigns(true); }
          catch (e) { msg.textContent = e.message; }
        } }),
        h('button', { class: 'btn small', type: 'button', text: 'CANCEL', onclick: () => { spawnForOpen = false; renderSpawnBox(g, me, qm); } })),
      msg);
  }
  function spawnButton(g) {
    return h('button', { class: 'btn small', type: 'button', id: 'spawnBtn', text: 'SPAWN CHARACTER', disabled: !!g.spawn,
      onclick: () => { spawnForOpen = !spawnForOpen; renderCampaignPage(); } });
  }

  // ----- the spawn page -----
  function spawnTextStep(g, sp) {
    const key = sp.id + ':' + sp.step, ta = h('textarea', { class: 'spawn-text', id: 'spawnText', maxlength: '1000', 'aria-label': SPAWN_TEXT[sp.step] });
    ta.value = spawnDraft.text[key] || '';
    const go1 = h('button', { class: 'btn small', type: 'button', id: 'spawnSubmit', text: 'DONE', disabled: !ta.value.trim() });
    ta.addEventListener('input', () => { spawnDraft.text[key] = ta.value; go1.disabled = !ta.value.trim(); });
    go1.addEventListener('click', async () => {
      go1.disabled = true;
      try { await backend.spawnSubmit(g.id, ta.value); delete spawnDraft.text[key]; await pollCampaigns(true); }
      catch (e) { $('spawnMsg').textContent = e.message; go1.disabled = !ta.value.trim(); }
    });
    return [h('p', { class: 'spawn-prompt', text: SPAWN_TEXT[sp.step] }), ta, h('div', { class: 'acts' }, go1)];
  }
  function spawnChoiceStep(g, sp) {
    const T = window.BSH_SPAWN_DATA;
    const info = (i) => {
      if (sp.step === 'ability') return [T.abilities[i].name, T.abilities[i].desc];
      if (sp.step === 'style') return [T.styles[i].name, T.styles[i].desc];
      const w = T.weapons[i];
      return [w.type, [w.size, 'Wt ' + w.weight, w.damage, 'Range ' + w.range, 'Cost ' + w.cost, 'CR ' + w.cr, 'Dmg ' + w.dmg].join(' · ') + (w.effect && w.effect !== 'none' ? '. ' + w.effect : '')];
    };
    const what = { ability: 'abilities', style: 'fighting styles', weapon: 'weapons' }[sp.step];
    return [h('p', { class: 'spawn-prompt', text: 'Pick one of these two ' + what }),
      h('div', { class: 'spawn-choices' }, sp.options.map((row, k) => {
        const [name, desc] = info(row);
        return h('button', { class: 'btn char-btn', type: 'button', 'data-choice': String(k), onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          try { await backend.spawnSubmit(g.id, k); await pollCampaigns(true); }
          catch (e) { $('spawnMsg').textContent = e.message; renderSpawnPage(); }
        } }, h('span', { text: name }), h('span', { class: 'sub', text: desc }));
      }))];
  }
  function spawnPointsStep(g, sp) {
    const mineDone = !!(sp.points && sp.points[state.user.id]);
    if (mineDone) return [h('p', { class: 'note', text: 'Your points are in. Waiting for the others.' })];
    const sel = (opts, r, key, label) => {
      const s = h('select', { 'aria-label': label + ' (round ' + (r + 1) + ')', 'data-pt': r + ':' + key },
        h('option', { value: '', text: 'Choose...' }), opts.map((n, i) => h('option', { value: String(i), text: n })));
      s.value = spawnDraft.pts[r][key] == null ? '' : String(spawnDraft.pts[r][key]);
      s.addEventListener('change', () => { spawnDraft.pts[r][key] = s.value === '' ? null : Number(s.value); sync(); });
      return h('label', { class: 'fld' }, h('span', { class: 'lbl', text: label }), s);
    };
    const tal = BSH.TALENTS.map((t) => t.name + ' (' + t.key + ')'), skl = BSH.SKILLS.map((x) => x.name);
    const submit = h('button', { class: 'btn small', type: 'button', id: 'spawnPoints', text: 'DONE' });
    const err = h('span', { class: 'lbl', role: 'alert' });
    const valid = () => spawnDraft.pts.every((p) => p.up != null && p.down != null && p.prof != null && p.up !== p.down);
    function sync() { submit.disabled = !valid(); err.textContent = spawnDraft.pts.some((p) => p.up != null && p.up === p.down) ? 'Add and subtract from different talents.' : ''; }
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      try { await backend.spawnPoints(g.id, spawnDraft.pts.map((p) => ({ up: p.up, down: p.down, prof: p.prof }))); await pollCampaigns(true); }
      catch (e) { $('spawnMsg').textContent = e.message; sync(); }
    });
    const rounds = [0, 1, 2, 3].map((r) => h('div', { class: 'spawn-round' }, h('strong', { text: 'Set ' + (r + 1) + ' of 4' }),
      sel(tal, r, 'up', 'Add 2 points to a talent'), sel(tal, r, 'down', 'Subtract 1 point from a talent'), sel(skl, r, 'prof', 'Add 1 proficiency point to a skill')));
    sync();
    return [h('p', { class: 'spawn-prompt', text: 'Everyone does this at once: four times, add 2 points to a talent, subtract 1 point from another talent, and add 1 proficiency point to a skill.' }), rounds, err, h('div', { class: 'acts' }, submit)];
  }
  function spawnIncarnationStep(g, sp) {
    return [h('p', { class: 'spawn-prompt', text: 'This character is yours! Is it a new incarnation of one of your fallen characters?' }),
      h('div', { class: 'spawn-choices' },
        sp.dead.map((d) => h('button', { class: 'btn char-btn', type: 'button', 'data-prev': d.id, onclick: async () => {
          try { await backend.spawnIncarnation(g.id, d.id); await pollCampaigns(true); } catch (e) { $('spawnMsg').textContent = e.message; }
        } }, h('span', { text: d.name || 'Unnamed character' }), h('span', { class: 'sub', text: 'Incarnation ' + (d.incarnation == null || d.incarnation === '' ? '(not set)' : d.incarnation) }))),
        h('button', { class: 'btn char-btn', type: 'button', 'data-prev': '', onclick: async () => {
          try { await backend.spawnIncarnation(g.id, null); await pollCampaigns(true); } catch (e) { $('spawnMsg').textContent = e.message; }
        } }, h('span', { text: 'NONE OF THEM' }), h('span', { class: 'sub', text: 'A brand new soul' })))];
  }

  function renderSpawnPage() {
    const g = state.campaigns.find((x) => x.id === spawnCampaignId);
    const body = $('spawnBody');
    if (!g || !myMembership(g)) { body.replaceChildren(h('p', { class: 'note', text: campaignsLoaded ? 'That campaign is not available.' : 'Loading...' })); return; }
    const sp = g.spawn;
    if (!sp) {   // finished or cancelled: back to the campaign page
      if (spawnLast && spawnLast.id && spawnLast.cid === g.id) {
        const l = spawnLast; spawnLast = null;
        showToast(l.assignee ? 'The new character went to ' + spawnName(g, l.assignee) + '.' : l.step ? 'The new character became an NPC.' : 'The spawn was cancelled.');
      }
      go('campaign-' + g.id); return;
    }
    spawnLast = { id: sp.id, cid: g.id, assignee: sp.assignee || null, step: sp.step === 'build' || sp.step === 'incarnation' };
    if (spawnDraft.id !== sp.id) spawnDraft = { id: sp.id, text: {}, pts: [{}, {}, {}, {}] };
    const me = state.user.id, qm = iAmQm(g), mineTurn = sp.turn === me;
    $('spawnMeta').textContent = g.name + ' · step ' + (['appearance', 'ability', 'style', 'weapon', 'backstory', 'motivation', 'points'].indexOf(sp.step) + 1 || 7) + ' of 7: ' + SPAWN_STEP_NAME[sp.step];
    const kids = [];
    kids.push(h('h3', { class: 'sec', text: 'Initiative order' }));
    kids.push(h('div', { class: 'spawn-order', id: 'spawnOrder' }, sp.order.map((u) => {
      const turn = sp.turn === u, done = sp.step === 'points' ? !!(sp.points && sp.points[u]) : null;
      return h('div', { class: 'member cchar' + (turn ? ' turn' : ''), 'data-user': u },
        turn ? h('span', { class: 'turnmark', role: 'img', 'aria-label': 'Current turn', text: '>' }) : null,
        h('div', { class: 'cname' }, h('span', { class: 'ename', text: spawnName(g, u) })),
        u === me ? h('span', { class: 'tag', text: 'YOU' }) : null,
        done === null ? null : h('span', { class: 'tag', text: done ? 'DONE' : 'WAITING' }),
        sp.assignee === u ? h('span', { class: 'tag', text: 'GETS THE CHARACTER' }) : null);
    })));
    kids.push(h('div', { class: 'acts' }, h('button', { class: 'btn small', type: 'button', id: 'spawnSheetBtn', text: 'VIEW CHARACTER SHEET', onclick: () => go('spawnsheet-' + g.id) })));
    const step = sp.step;
    if (['appearance', 'backstory', 'motivation'].includes(step)) {
      kids.push(mineTurn ? spawnTextStep(g, sp) : h('p', { class: 'note', id: 'spawnWait', text: 'Waiting for ' + spawnName(g, sp.turn) + ' to ' + SPAWN_STEP_DO[step] + '.' }));
    } else if (['ability', 'style', 'weapon'].includes(step)) {
      kids.push(mineTurn ? spawnChoiceStep(g, sp) : h('p', { class: 'note', id: 'spawnWait', text: 'Waiting for ' + spawnName(g, sp.turn) + ' to ' + SPAWN_STEP_DO[step] + '.' }));
    } else if (step === 'points') {
      kids.push(sp.order.includes(me) ? spawnPointsStep(g, sp) : h('p', { class: 'note', id: 'spawnWait', text: 'The players are adding their talent and proficiency points.' }));
    } else if (step === 'incarnation') {
      kids.push(sp.assignee === me ? spawnIncarnationStep(g, sp) : h('p', { class: 'note', id: 'spawnWait', text: 'The character goes to ' + spawnName(g, sp.assignee) + '. They are choosing whether it follows one of their fallen characters.' }));
    } else {
      kids.push(h('p', { class: 'note', id: 'spawnWait', text: sp.assignee ? 'The character goes to ' + spawnName(g, sp.assignee) + '. It is being added to their characters.' : 'No player was chosen: it becomes an NPC and is being added by a QM.' }));
    }
    if (qm) {
      const canBack = ['appearance', 'ability', 'style', 'weapon', 'backstory', 'motivation', 'points'].includes(step) && sp.pos > 0;
      kids.push(h('h3', { class: 'sec', text: 'QM' }));
      kids.push(h('div', { class: 'acts' },
        h('button', { class: 'btn small', type: 'button', id: 'spawnVeto', text: 'SEND BACK ONE STEP', disabled: !canBack,
          onclick: async () => { try { await backend.spawnVeto(g.id); await pollCampaigns(true); } catch (e) { $('spawnMsg').textContent = e.message; } } }),
        confirmButton('CANCEL SPAWN', 'TAP AGAIN TO CANCEL', async () => { try { await backend.cancelSpawn(g.id); await pollCampaigns(true); } catch (e) { $('spawnMsg').textContent = e.message; } })));
    }
    // keep what someone is typing when the page redraws
    const ae = document.activeElement, focusId = ae && ae.id && body.contains(ae) ? ae.id : null;
    body.replaceChildren(...kids.flat(Infinity));
    if (focusId) { const f = $(focusId); if (f) f.focus(); }
  }
  let spawnCampaignId = null;
  $('spawnBack').addEventListener('click', () => go(spawnCampaignId ? 'campaign-' + spawnCampaignId : 'campaigns'));

  // Runs after every poll: take everyone to a new spawn once, and build the character when its turn comes round.
  async function spawnSync() {
    if (!state.user) return;
    for (const g of state.campaigns) {
      const sp = g.spawn;
      if (!sp || !myMembership(g)) continue;
      if (!spawnSeen.has(sp.id)) {
        spawnSeen.add(sp.id);
        if ($('screen-spawn').hidden || spawnCampaignId !== g.id) { spawnCampaignId = g.id; showToast('A character is being spawned.'); go('spawn-' + g.id); }
      }
    }
    if (!$('screen-spawn').hidden) {
      const g = state.campaigns.find((x) => x.id === spawnCampaignId), sig = JSON.stringify(g && g.spawn || null);
      if (sig !== spawnSig || !g) { spawnSig = sig; renderSpawnPage(); }
    }
    await spawnBuild();
  }

  // After a spawned character is handed to a player, a card asks for the details the spawn didn't cover.
  function describeCard(charId) {
    const c = findChar(charId);
    if (!c) return;
    const f = (label, max, type) => h('input', { type: type || 'text', maxlength: String(max || 30), 'aria-label': label, autocomplete: 'off', inputmode: type === 'number' ? 'decimal' : undefined, min: type === 'number' ? '0' : undefined, step: type === 'number' ? 'any' : undefined });
    const inputs = { name: f('Name', 60), species: f('Species', 30), sex: f('Sex', 20), age: f('Age', 20), height: f('Height', 20), weight: f('Weight', 12, 'number'), money: f('Money', 30) };
    const lab = (k, t) => h('label', { class: 'fld' }, h('span', { class: 'lbl', text: t }), inputs[k]);
    const msg = h('p', { class: 'skill-out', role: 'status', id: 'describeMsg' });
    const close = () => { $('describeModal').hidden = true; $('describeBody').replaceChildren(); };
    const save = h('button', { class: 'btn', type: 'button', id: 'describeSave', text: 'SAVE', onclick: async () => {
      const w = inputs.weight.value.trim();
      if (w !== '' && !(Number(w) >= 0)) { msg.textContent = 'Weight needs to be a number.'; return; }
      save.disabled = true;
      const cur = findChar(charId) || c;
      Object.keys(inputs).forEach((k) => { if (k !== 'weight') cur.info[k] = inputs[k].value.trim(); });
      cur.info.weight = w === '' ? null : Number(w);
      cur.updated = Date.now();
      try {
        await backend.saveCharacter(JSON.parse(JSON.stringify(cur)));
        close(); renderCharList();
      } catch (e) { msg.textContent = e.message; save.disabled = false; }
    } });
    $('describeBody').replaceChildren(
      h('p', { class: 'note', text: 'Your new character is ready. Fill in who they are (you can change any of this later on their sheet).' }),
      lab('name', 'Name'), lab('species', 'Species'), lab('sex', 'Sex'), lab('age', 'Age'), lab('height', 'Height'), lab('weight', 'Weight'), lab('money', 'Money'),
      save, h('button', { class: 'btn small', type: 'button', id: 'describeLater', text: 'LATER', onclick: close }), msg);
    $('describeModal').hidden = false;
    $('describeTitle').focus({ preventScroll: true });
  }

  // The new owner's device saves the character, then ends the spawn. With no owner (NPC) a QM's device does it.
  async function spawnBuild() {
    if (spawnBuilding) return;
    for (const g of state.campaigns) {
      const sp = g.spawn;
      if (!sp || sp.step !== 'build' || !myMembership(g)) continue;
      const mine = sp.assignee === state.user.id, npc = !sp.assignee && iAmQm(g);
      if (!mine && !npc) continue;
      spawnBuilding = true;
      try {
        const c = buildSpawnChar(sp, g.id);
        if (mine) {
          if (!state.chars.some((x) => x.id === c.id)) state.chars.unshift(c);
          await backend.saveCharacter(JSON.parse(JSON.stringify(c)));
          await backend.finishSpawn(g.id);
          showToast('A new character was added to your characters.');
          describeCard(c.id);
        } else {
          try { await backend.createNpc(g.id, c); } catch (e) { /* already saved by another QM */ }
          await backend.finishSpawn(g.id);
        }
        await refreshChars();
        const next = await backend.listCampaigns();
        pollSig = JSON.stringify(next); state.campaigns = next; renderCampaigns();
        if (!$('screen-spawn').hidden) renderSpawnPage();
      } catch (e) { /* try again on the next poll */ } finally { spawnBuilding = false; }
      return;
    }
  }

  /* ================= Encounter maps ================= */
  // A QM uploads a picture (shrunk to fit), names it and fits a grid of squares over it. Maps start hidden; the QM shows them.
  // The grid is measured in the picture's own pixels: square size, where the top-left corner sits (X / Y), columns x rows.
  let mapCid = null, mapEditId = null, mapViewId = null, mapZoom = 100, mapViaEncounter = false;
  const MAP_MAX_SIDE = 1600, MAP_MAX_CHARS = 2400000;
  const mapRoute = (kind, cid, id) => kind + '-' + cid + (id ? '~' + id : '');

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read that file.'));
      r.readAsDataURL(file);
    });
  }
  function loadImage(src, ms) {
    return new Promise((resolve) => {
      const img = new Image(); let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      img.onload = () => fin(img); img.onerror = () => fin(null);
      setTimeout(() => fin(null), ms || 1500);
      img.src = src;
    });
  }
  // -> { image (data URL), w, h }: shrunk to at most 1600 px on the long side and saved as JPEG
  async function prepareMapImage(file) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('That file is not a picture.');
    if (file.size > 25 * 1024 * 1024) throw new Error('That picture is too large (25 MB at most).');
    const src = await readAsDataUrl(file), img = await loadImage(src);
    const nw = img && img.naturalWidth, nh = img && img.naturalHeight;
    if (nw && nh) {
      for (const [side, q] of [[MAP_MAX_SIDE, 0.85], [1200, 0.7], [900, 0.6]]) {
        const k = Math.min(1, side / Math.max(nw, nh)), w = Math.max(1, Math.round(nw * k)), hh = Math.max(1, Math.round(nh * k));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        const cx = cv.getContext && cv.getContext('2d');
        if (!cx) break;
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(img, 0, 0, w, hh);
        const out = cv.toDataURL('image/jpeg', q);
        if (out.length <= MAP_MAX_CHARS) return { image: out, w, h: hh };
      }
    }
    if (src.length > MAP_MAX_CHARS) throw new Error('That picture is too big to store. Try a smaller one.');
    return { image: src, w: nw || 1000, h: nh || 1000 };
  }

  // draws the grid over a picture of w x h pixels (two strokes, dark under light, so it shows on any picture)
  function gridSvg(m) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + m.imgW + ' ' + m.imgH); svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'map-grid'); svg.setAttribute('aria-hidden', 'true');
    let d = '';
    const x1 = m.ox + m.cols * m.size, y1 = m.oy + m.rows * m.size;
    for (let i = 0; i <= m.cols; i++) { const x = m.ox + i * m.size; d += 'M' + x + ' ' + m.oy + 'V' + y1; }
    for (let j = 0; j <= m.rows; j++) { const y = m.oy + j * m.size; d += 'M' + m.ox + ' ' + y + 'H' + x1; }
    [['#000', '3', '0.7'], ['#fff', '1.2', '0.9']].forEach(([stroke, width, op]) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', width);
      p.setAttribute('stroke-opacity', op); p.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(p);
    });
    return svg;
  }
  const mapStage = (m) => h('div', { class: 'map-stage' }, h('img', { src: m.image, alt: m.name || 'Encounter map', draggable: 'false' }), gridSvg(m));

  async function mapCampaign(cid) {
    let g = state.campaigns.find((x) => x.id === cid);
    if (!g && !campaignsLoaded) { await refreshCampaigns(); g = state.campaigns.find((x) => x.id === cid); }
    if (!g || !myMembership(g)) { go('campaigns'); return null; }
    return g;
  }

  // ----- the campaign page buttons -----
  function renderMapButtons(g, me, qm) {
    const box = $('mapActions');
    box.replaceChildren();
    if (!me) return;
    box.append(h('button', { class: 'btn small', type: 'button', id: 'mapsView', text: 'VIEW ENCOUNTER MAPS', onclick: () => go(mapRoute('maps', g.id)) }));
    if (qm) box.append(h('button', { class: 'btn small', type: 'button', id: 'mapsCreate', text: 'CREATE ENCOUNTER MAP', onclick: () => go(mapRoute('mapnew', g.id)) }));
  }

  // ----- the list -----
  async function renderMapList() {
    const cid = mapCid, g = await mapCampaign(cid);
    if (!g || $('screen-maps').hidden) return;
    const qm = iAmQm(g), body = $('mapsBody');
    $('mapsTitle').textContent = g.name + ' · Encounter maps';
    let maps;
    try { maps = await backend.listMaps(cid); } catch (e) { $('mapsMsg').textContent = e.message; return; }
    if ($('screen-maps').hidden || mapCid !== cid) return;
    $('mapsMsg').textContent = '';
    const refresh = () => renderMapList();
    const rows = maps.map((m) => h('div', { class: 'member cchar', 'data-map': m.id },
      h('div', { class: 'cname' }, h('button', { class: 'btn char-btn', type: 'button', onclick: () => go(mapRoute('mapview', cid, m.id)) },
        h('span', { text: m.name }), h('span', { class: 'sub', text: m.cols + ' x ' + m.rows + ' squares' }))),
      qm ? h('span', { class: 'tag', text: m.visible ? 'SHOWN' : 'HIDDEN' }) : null,
      qm ? h('button', { class: 'btn small', type: 'button', text: m.visible ? 'HIDE FROM PLAYERS' : 'SHOW TO PLAYERS',
        onclick: async () => { try { await backend.setMapVisible(m.id, !m.visible); } catch (e) { $('mapsMsg').textContent = e.message; } refresh(); } }) : null,
      qm ? h('button', { class: 'btn small', type: 'button', text: 'EDIT', onclick: () => go(mapRoute('mapedit', cid, m.id)) }) : null,
      qm ? confirmButton('DELETE', 'TAP AGAIN TO DELETE', async () => { try { await backend.deleteMap(m.id); } catch (e) { $('mapsMsg').textContent = e.message; } refresh(); }) : null));
    body.replaceChildren(...rows, maps.length ? '' : h('p', { class: 'note', id: 'noMaps', text: qm ? 'No maps yet. Create one from the campaign page.' : 'The QM has not shown any maps yet.' }),
      qm ? h('div', { class: 'acts' }, h('button', { class: 'btn small', type: 'button', id: 'mapsNew', text: 'CREATE ENCOUNTER MAP', onclick: () => go(mapRoute('mapnew', cid)) })) : '');
  }

  // the tab on the right of the map that flips back to the encounter (only for the encounter's own map)
  function syncMapViewTab() {
    if ($('screen-mapview').hidden) return;
    const g = state.campaigns.find((x) => x.id === mapCid), onNow = !!(g && g.encounter && g.encounter.mapId && g.encounter.mapId === mapViewId);
    $('mapBackTab').hidden = !onNow;
    if (mapViaEncounter && !onNow) { mapViaEncounter = false; go('campaign-' + mapCid); }   // the encounter ended or the map was taken out
  }
  // ----- the viewer -----
  async function openMapViewer() {
    const cid = mapCid, id = mapViewId, g = await mapCampaign(cid);
    if (!g || $('screen-mapview').hidden) return;
    mapViaEncounter = !!(g.encounter && g.encounter.mapId === id);
    $('mapBackTab').hidden = !mapViaEncounter;
    $('mapBackTab').onclick = () => { mapViaEncounter = false; go('campaign-' + cid); };
    const body = $('mapViewBody'); body.replaceChildren(h('p', { class: 'note', text: 'Loading...' }));
    let m;
    try { m = await backend.getMap(id); } catch (e) { $('mapViewMsg').textContent = e.message; body.replaceChildren(); return; }
    if ($('screen-mapview').hidden || mapViewId !== id) return;
    $('mapViewMsg').textContent = '';
    $('mapViewTitle').textContent = m.name;
    mapZoom = 100;
    const stage = mapStage(m);
    mapCur = m; mapStageEl = stage; mapTokens = []; mapChars = []; mapSel = null; mapNameShown = null; mapTokSig = ''; mapCharsAt = 0; mapDrag = null;
    const scroll = h('div', { class: 'map-scroll', id: 'mapScroll' }, h('div', { class: 'map-zoom', id: 'mapZoom', style: 'width:100%' }, stage));
    const setZoom = (z) => { mapZoom = Math.max(50, Math.min(500, z)); $('mapZoom').style.width = mapZoom + '%'; $('mapZoomLbl').textContent = mapZoom + '%'; };
    body.replaceChildren(
      h('div', { class: 'acts' },
        h('button', { class: 'btn small', type: 'button', id: 'mapZoomOut', text: 'ZOOM OUT', onclick: () => setZoom(mapZoom - 25) }),
        h('button', { class: 'btn small', type: 'button', id: 'mapZoomIn', text: 'ZOOM IN', onclick: () => setZoom(mapZoom + 25) }),
        h('button', { class: 'btn small', type: 'button', id: 'mapZoomFit', text: 'FIT', onclick: () => setZoom(100) }),
        h('span', { class: 'lbl', id: 'mapZoomLbl', text: '100%' })),
      scroll, mapViaEncounter ? h('div', { id: 'tokenPanel' }) : '');
    if (mapViaEncounter) refreshMapTokens('chars');
  }

  /* ----- tokens on the encounter map ----- */
  // A token is a coloured circle with the character's initiative number, or the character's own token picture. It sits on one grid
  // square. Players move their own characters' tokens, the QM moves anyone's. Tap a token to see its name for 3 seconds.
  let mapTokens = [], mapChars = [], mapSel = null, mapNameShown = null, mapTokSig = '', mapCharsAt = 0, mapCur = null, mapStageEl = null, mapDrag = null, mapTokBusy = false;
  const tokHue = (id) => { let x = 0; for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) % 360; return x; };
  const tokChar = (id) => mapChars.find((r) => r.ch.id === id) || null;
  const tokName = (id) => { const r = tokChar(id); return r ? (r.ch.info.name || 'Unnamed character') : 'Someone'; };
  const canMoveTok = (g, id) => { const r = tokChar(id); return !!r && !r.stub && (iAmQm(g) || (r.mine && !r.ch.isNpc)); };
  const tokInit = (g, id) => { const i = g.encounter && g.encounter.initiatives && g.encounter.initiatives[id]; return i ? fmt(i.total) : ''; };

  // the 96 px picture a character uses as its token (centre-cropped, kept small because every player downloads it)
  async function prepareTokenImage(file) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('That file is not a picture.');
    if (file.size > 10 * 1024 * 1024) throw new Error('That picture is too large (10 MB at most).');
    const src = await readAsDataUrl(file), img = await loadImage(src);
    const nw = img && img.naturalWidth, nh = img && img.naturalHeight;
    if (nw && nh) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 96;
      const cx = cv.getContext && cv.getContext('2d');
      if (cx) {
        const side = Math.min(nw, nh);
        cx.drawImage(img, (nw - side) / 2, (nh - side) / 2, side, side, 0, 0, 96, 96);
        return cv.toDataURL('image/png');
      }
    }
    if (src.length > 80000) throw new Error('That picture is too big to use as a token. Try a smaller one.');
    return src;
  }

  function cellAt(clientX, clientY) {
    const m = mapCur, rect = mapStageEl.getBoundingClientRect();
    const sx = rect.width ? m.imgW / rect.width : 1, sy = rect.height ? m.imgH / rect.height : 1;
    const x = (clientX - rect.left) * sx, y = (clientY - rect.top) * sy;
    return { col: Math.max(0, Math.min(m.cols - 1, Math.floor((x - m.ox) / m.size))), row: Math.max(0, Math.min(m.rows - 1, Math.floor((y - m.oy) / m.size))) };
  }
  const tokPos = (m, col, row) => ({ left: (m.ox + col * m.size) / m.imgW * 100, top: (m.oy + row * m.size) / m.imgH * 100, w: m.size / m.imgW * 100, hh: m.size / m.imgH * 100 });
  function placeTokEl(el, col, row) {
    const p = tokPos(mapCur, col, row);
    el.style.left = p.left + '%'; el.style.top = p.top + '%'; el.style.width = p.w + '%'; el.style.height = p.hh + '%';
  }
  async function moveToken(g, id, col, row) {
    const t = mapTokens.find((x) => x.characterId === id);
    if (t && t.col === col && t.row === row) return;
    if (t) { t.col = col; t.row = row; } else mapTokens.push({ characterId: id, col, row });
    renderTokens(g);
    try { await backend.setToken(id, col, row); } catch (e) { $('mapViewMsg').textContent = e.message; }
    await refreshMapTokens(true);
  }
  function renderTokens(g) {
    if (!mapStageEl || !mapCur) return;
    let layer = mapStageEl.querySelector('.token-layer');
    if (!layer) { layer = h('div', { class: 'token-layer' }); mapStageEl.append(layer); }
    layer.replaceChildren(...mapTokens.filter((t) => tokChar(t.characterId)).map((t) => {
      const id = t.characterId, r = tokChar(id), movable = canMoveTok(g, id), pic = r.ch.tokenImage;
      const el = h('div', { class: 'token' + (mapSel === id ? ' sel' : '') + (movable ? ' mine' : ''), 'data-token': id, role: 'button', tabindex: '0',
        'aria-label': tokName(id) + ' token', style: '--cell:' + (mapCur.size / mapCur.imgW) });
      placeTokEl(el, t.col, t.row);
      const disc = h('span', { class: 'disc', style: pic && /^data:image\//.test(pic) ? 'background-image:url("' + pic + '")' : 'background:hsl(' + tokHue(id) + ' 65% 38%)' }, pic ? '' : tokInit(g, id));
      el.append(disc);
      if (mapNameShown && mapNameShown.id === id && Date.now() < mapNameShown.until) el.append(h('span', { class: 'token-name', text: tokName(id) }));
      el.addEventListener('click', () => {
        if (el.dataset.dragged) { delete el.dataset.dragged; return; }
        mapSel = id; mapNameShown = { id, until: Date.now() + 3000 };
        setTimeout(() => { if (mapNameShown && mapNameShown.id === id && Date.now() >= mapNameShown.until) { mapNameShown = null; renderTokens(g); } }, 3050);
        renderTokens(g); renderTokenPanel(g);
      });
      if (movable) {
        el.addEventListener('pointerdown', (ev) => {
          mapDrag = { id, x: ev.clientX, y: ev.clientY, moved: false, el, col: t.col, row: t.row };
          if (el.setPointerCapture && ev.pointerId != null) { try { el.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ } }
        });
        el.addEventListener('pointermove', (ev) => {
          if (!mapDrag || mapDrag.id !== id) return;
          if (!mapDrag.moved && Math.hypot(ev.clientX - mapDrag.x, ev.clientY - mapDrag.y) < 6) return;
          mapDrag.moved = true;
          const c = cellAt(ev.clientX, ev.clientY); mapDrag.col = c.col; mapDrag.row = c.row; placeTokEl(el, c.col, c.row);   // snaps as it goes
        });
        const end = () => {
          const d = mapDrag; mapDrag = null;
          if (d && d.moved) { el.dataset.dragged = '1'; setTimeout(() => { delete el.dataset.dragged; }, 50); mapSel = id; moveToken(g, id, d.col, d.row); }
        };
        el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { mapDrag = null; renderTokens(g); });
      }
      return el;
    }));
  }
  // under the map: drop / pick up the characters I may move, and arrows for the selected token
  function renderTokenPanel(g) {
    const box = $('tokenPanel'); if (!box) return;
    const mine = mapChars.filter((r) => !r.stub && (iAmQm(g) || (r.mine && !r.ch.isNpc)))
      .sort((a, b) => (a.ch.isNpc - b.ch.isNpc) || (a.ch.info.name || '').localeCompare(b.ch.info.name || ''));
    const sel = mapSel && mapTokens.find((t) => t.characterId === mapSel && canMoveTok(g, t.characterId)) || null;
    const step = (dc, dr) => { const m = mapCur; moveToken(g, sel.characterId, Math.max(0, Math.min(m.cols - 1, sel.col + dc)), Math.max(0, Math.min(m.rows - 1, sel.row + dr))); };
    box.replaceChildren(
      h('h3', { class: 'sec', text: 'Tokens' }),
      mine.length ? h('div', { class: 'token-list' }, mine.map((r) => {
        const id = r.ch.id, on = mapTokens.some((t) => t.characterId === id);
        return h('div', { class: 'token-row', 'data-row': id },
          h('span', { class: 'ename', text: (r.ch.info.name || 'Unnamed character') + (r.ch.isNpc ? ' (NPC)' : '') }),
          h('button', { class: 'btn small', type: 'button', 'data-drop': id, text: on ? 'PICK UP' : 'DROP ON MAP', onclick: async () => {
            $('mapViewMsg').textContent = '';
            try {
              if (on) { await backend.removeToken(id); mapTokens = mapTokens.filter((t) => t.characterId !== id); if (mapSel === id) mapSel = null; }
              else {
                const used = new Set(mapTokens.map((t) => t.col + ':' + t.row)); let c = 0, rr = 0;
                outer: for (rr = 0; rr < mapCur.rows; rr++) for (c = 0; c < mapCur.cols; c++) if (!used.has(c + ':' + rr)) break outer;
                if (rr >= mapCur.rows) { c = 0; rr = 0; }
                await backend.setToken(id, c, rr); mapTokens.push({ characterId: id, col: c, row: rr }); mapSel = id;
              }
            } catch (e) { $('mapViewMsg').textContent = e.message; }
            renderTokens(g); renderTokenPanel(g); refreshMapTokens(true);
          } }));
      })) : h('p', { class: 'note', text: 'You have no characters in this campaign to place.' }),
      sel ? h('div', { class: 'token-pad', id: 'tokenPad' }, h('span', { class: 'lbl', text: 'Move ' + tokName(sel.characterId) }),
        h('button', { class: 'btn small', type: 'button', id: 'tokUp', text: 'UP', onclick: () => step(0, -1) }),
        h('button', { class: 'btn small', type: 'button', id: 'tokLeft', text: 'LEFT', onclick: () => step(-1, 0) }),
        h('button', { class: 'btn small', type: 'button', id: 'tokRight', text: 'RIGHT', onclick: () => step(1, 0) }),
        h('button', { class: 'btn small', type: 'button', id: 'tokDown', text: 'DOWN', onclick: () => step(0, 1) }))
        : h('p', { class: 'note', text: 'Tap a token to select it, then drag it or use the arrows. Tap any token to see whose it is.' }));
  }
  // keeps the tokens (every 2 s) and the characters behind them (every 5 s) up to date while the encounter map is open
  async function refreshMapTokens(force) {
    if (mapTokBusy || $('screen-mapview').hidden || !mapViaEncounter || !mapCur) return;
    const g = state.campaigns.find((x) => x.id === mapCid); if (!g) return;
    mapTokBusy = true;
    try {
      const cid = mapCid;
      const toks = await backend.listTokens(cid);
      let rebuilt = false;
      if (force === 'chars' || Date.now() - mapCharsAt > 5000 || !mapChars.length) {
        const rows = await backend.listCampaignCharacters(cid); rows.forEach((r) => { r.ch = normalizeChar(r.ch); });
        mapChars = rows; mapCharsAt = Date.now(); rebuilt = true;
      }
      if ($('screen-mapview').hidden || mapCid !== cid || mapDrag) return;
      const sig = JSON.stringify(toks) + (rebuilt ? 'c' + mapCharsAt : '');
      mapTokens = toks;
      if (sig !== mapTokSig || rebuilt) { mapTokSig = sig; renderTokens(g); renderTokenPanel(g); }
    } catch (e) { /* try again next tick */ } finally { mapTokBusy = false; }
  }
  setInterval(() => { if (document.visibilityState === 'visible') refreshMapTokens(); }, 2000);

  // ----- the editor -----
  async function openMapEditor() {
    const cid = mapCid, g = await mapCampaign(cid);
    if (!g || $('screen-mapedit').hidden) return;
    if (!iAmQm(g)) { go(mapRoute('maps', cid)); return; }
    const body = $('mapEditBody'), msg = $('mapEditMsg');
    msg.textContent = '';
    let m = { name: '', image: '', imgW: 1000, imgH: 1000, cols: 10, rows: 10, size: 50, ox: 0, oy: 0 }, isNew = !mapEditId, fresh = false;
    if (mapEditId) {
      body.replaceChildren(h('p', { class: 'note', text: 'Loading...' }));
      try { m = Object.assign({}, await backend.getMap(mapEditId)); } catch (e) { msg.textContent = e.message; body.replaceChildren(); return; }
      if ($('screen-mapedit').hidden) return;
    }
    $('mapEditTitle').textContent = isNew ? 'New encounter map' : 'Edit map';
    let touchedGrid = !isNew;   // once cols / rows were typed by hand, changing the square size no longer refills them
    const num = (v, d) => { const n = Number(v); return v === '' || !Number.isFinite(n) ? d : n; };
    const stageBox = h('div', { id: 'mapEditStage' });
    const ctl = {};
    const redraw = () => {
      stageBox.replaceChildren(m.image ? mapStage(m) : h('p', { class: 'note', text: 'Choose a picture to start.' }));
      save.disabled = !(m.image && m.name.trim());
    };
    const fillGrid = () => {   // as many whole squares as fit from the corner
      m.cols = Math.max(1, Math.min(200, Math.floor((m.imgW - m.ox) / m.size)));
      m.rows = Math.max(1, Math.min(200, Math.floor((m.imgH - m.oy) / m.size)));
      ctl.cols.value = m.cols; ctl.rows.value = m.rows;
    };
    const field = (key, label, min, max, step) => {
      const n = h('input', { type: 'number', id: 'map' + key, step: String(step || 1), 'aria-label': label });
      const r = h('input', { type: 'range', id: 'map' + key + 'Range', min: String(min), max: String(max), step: String(step || 1), 'aria-label': label + ' slider' });
      n.value = m[key]; r.value = m[key]; ctl[key] = n; ctl[key + 'R'] = r;
      const set = (v) => {
        m[key] = v;
        if ((key === 'size' || key === 'ox' || key === 'oy') && !touchedGrid) fillGrid();
        if (key === 'cols' || key === 'rows') touchedGrid = true;
        n.value = m[key]; r.value = m[key]; redraw();
      };
      n.addEventListener('input', () => { const v = num(n.value, null); if (v != null) set(key === 'cols' || key === 'rows' ? Math.max(1, Math.min(200, Math.round(v))) : key === 'size' ? Math.max(4, Math.min(4000, v)) : Math.max(-8000, Math.min(8000, v))); });
      r.addEventListener('input', () => set(Number(r.value)));
      return h('div', { class: 'fld' }, h('span', { class: 'lbl', text: label }), n, key === 'cols' || key === 'rows' ? '' : r);
    };
    const name = h('input', { type: 'text', id: 'mapName', maxlength: '60', autocomplete: 'off', 'aria-label': 'Map name', placeholder: 'Map name' });
    name.value = m.name;
    name.addEventListener('input', () => { m.name = name.value; redraw(); });
    const file = h('input', { type: 'file', id: 'mapFile', accept: 'image/*', 'aria-label': 'Choose a picture' });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; if (!f) return;
      msg.textContent = '';
      try {
        const p = await prepareMapImage(f);
        m.image = p.image; m.imgW = p.w; m.imgH = p.h; fresh = true;
        if (isNew || !touchedGrid) { m.size = Math.max(4, Math.round(Math.max(p.w, p.h) / 20)); m.ox = 0; m.oy = 0; touchedGrid = false; fillGrid(); }
        ctl.size.value = m.size; ctl.sizeR.value = m.size; ctl.ox.value = m.ox; ctl.oy.value = m.oy;
        ctl.sizeR.max = String(Math.max(p.w, p.h)); ctl.oxR.max = String(p.w); ctl.oyR.max = String(p.h);
        redraw();
      } catch (e) { msg.textContent = e.message; }
    });
    const save = h('button', { class: 'btn small', type: 'button', id: 'mapSave', text: 'SAVE MAP', disabled: true, onclick: async () => {
      save.disabled = true; msg.textContent = '';
      try {
        await backend.saveMap(cid, { id: mapEditId || null, name: m.name, image: isNew || fresh ? m.image : null, imgW: m.imgW, imgH: m.imgH,
          cols: m.cols, rows: m.rows, size: m.size, ox: m.ox, oy: m.oy });
        go(mapRoute('maps', cid));
      } catch (e) { msg.textContent = e.message; redraw(); }
    } });
    const fit = h('button', { class: 'btn small', type: 'button', id: 'mapFill', text: 'FILL THE PICTURE', onclick: () => { fillGrid(); touchedGrid = false; redraw(); } });
    const f1 = field('size', 'Square size', 4, Math.max(m.imgW, m.imgH), 1), f2 = field('ox', 'Grid X (left edge)', 0, m.imgW, 1), f3 = field('oy', 'Grid Y (top edge)', 0, m.imgH, 1);
    const f4 = field('cols', 'Columns', 1, 200, 1), f5 = field('rows', 'Rows', 1, 200, 1);
    body.replaceChildren(h('div', { class: 'fld' }, h('span', { class: 'lbl', text: 'Name' }), name),
      h('div', { class: 'fld' }, h('span', { class: 'lbl', text: isNew ? 'Picture' : 'Replace the picture (optional)' }), file),
      stageBox, f1, f2, f3, f4, f5, h('div', { class: 'acts' }, fit, save,
        h('button', { class: 'btn small', type: 'button', id: 'mapCancel', text: 'CANCEL', onclick: () => go(mapRoute('maps', cid)) })));
    redraw();
  }
  $('mapsBack').addEventListener('click', () => go(mapCid ? 'campaign-' + mapCid : 'campaigns'));
  $('mapViewBack').addEventListener('click', () => go(mapRoute('maps', mapCid)));
  $('mapEditBack').addEventListener('click', () => go(mapRoute('maps', mapCid)));

  /* ================= Characters list ================= */
  function renderCharList() {
    const all = state.chars.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const pcs = all.filter((c) => !c.isNpc), npcs = all.filter((c) => c.isNpc);
    const fill = (box, list) => {
      box.replaceChildren();
      list.forEach((c) => {
        const r = BSH.compute(c);
        const bits = [c.info.species, c.info.sex, c.info.age].filter(Boolean);
        bits.push('HP ' + fmt(r.stat[0]));
        const cn = c.campaignId && campaignName(c.campaignId);
        bits.push(cn || (c.isNpc ? 'no campaign' : ''));
        box.append(h('button', { class: 'btn char-btn', type: 'button', onclick: () => go('character-' + c.id) },
          h('span', { text: c.info.name || 'Unnamed character' }),
          h('span', { class: 'sub', text: bits.filter(Boolean).join(' · ') })));
      });
    };
    fill($('charList'), pcs); fill($('npcList'), npcs);
    $('noChars').hidden = all.length > 0;
    $('npcHead').hidden = !npcs.length;
    // NEW NPC: for a QM of at least one campaign (pick which one when there are several)
    const qmCamps = state.campaigns.filter(iAmQm).sort((a, b) => a.name.localeCompare(b.name));
    const sel = $('newNpcCamp'), keep = sel.value;
    sel.replaceChildren(...qmCamps.map((g) => h('option', { value: g.id, text: g.name })));
    if (qmCamps.some((g) => g.id === keep)) sel.value = keep;
    $('newNpcBtn').hidden = !qmCamps.length; $('newNpcPick').hidden = qmCamps.length < 2;
  }

  $('newNpcBtn').addEventListener('click', async () => {
    const g = state.campaigns.find((x) => x.id === $('newNpcCamp').value);
    if (!g || !iAmQm(g)) return;
    $('listMsg').textContent = '';
    const c = normalizeChar({ id: uuid(), created: Date.now(), updated: Date.now() });
    try {
      await backend.createNpc(g.id, c);
      c.campaignId = g.id; c.isNpc = true; c.npcVisible = false;
      state.chars.unshift(c);
      go('character-' + c.id);
    } catch (e) { $('listMsg').textContent = e.message; }
  });

  $('newCharBtn').addEventListener('click', () => {
    const c = normalizeChar({ id: uuid(), created: Date.now(), updated: Date.now() });
    state.chars.unshift(c);
    queueSave(c);
    go('character-' + c.id);
  });


  /* ================= Import / export a character sheet ================= */
  // A sheet is exported as a small JSON file (no id, campaign or owner). Importing rebuilds it field by field, so a hand-edited or
  // damaged file can't put anything odd on a sheet, and the character always arrives as a fresh one of your own.
  const IMPORT_FORMAT = 'bloodsoup-hell-character';
  function sheetForExport(c) {
    const o = { info: c.info, vitals: c.vitals };
    ['talents', 'totemTalents', 'buffTalents', 'prof', 'totemProf', 'skillBuff', 'skillAdj', 'skillAdjPct', 'statBuff', 'statAdj', 'statAdjPct',
      'items', 'abilities', 'appearance', 'backstory', 'motivation', 'tokenImage'].forEach((k) => { if (c[k] != null) o[k] = c[k]; });
    return { format: IMPORT_FORMAT, version: 1, exported: new Date().toISOString(), character: JSON.parse(JSON.stringify(o)) };
  }
  function exportFileName(c) {
    const n = String(c.info.name || 'character').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'character';
    return n + '.bloodsoup.json';
  }
  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function sanitizeImport(raw) {
    const str = (v, n) => (v == null ? '' : String(v).slice(0, n));
    const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'object' || !Number.isFinite(Number(v)) ? null : Number(v));
    const nums = (v, len, dflt) => Array.from({ length: len }, (_, i) => { const n = num(Array.isArray(v) ? v[i] : null); return n === null ? dflt : n; });
    const base = BSH.blankCharacter(), i = raw.info && typeof raw.info === 'object' ? raw.info : {}, vv = raw.vitals && typeof raw.vitals === 'object' ? raw.vitals : {};
    const c = normalizeChar({ id: uuid(), created: Date.now(), updated: Date.now() });
    c.info = Object.assign({}, base.info, { name: str(i.name, 60), species: str(i.species, 30), sex: str(i.sex, 20), age: str(i.age, 20), height: str(i.height, 20),
      weight: num(i.weight), money: str(i.money, 30), alive: i.alive !== false });
    ['incarnation', 'totemTokens', 'legacyTokens', 'spiritualGuidance'].forEach((k) => { c.info[k] = k === 'incarnation' && num(i[k]) === null ? 1 : num(i[k]); });
    const et = num(i.explodeTokens); c.info.explodeTokens = et === null ? null : Math.min(10, Math.max(0, Math.floor(et)));
    Object.keys(base.vitals).forEach((k) => { c.vitals[k] = num(vv[k]); });
    c.talents = nums(raw.talents, 9, BSH.DEFAULT_TALENT);
    [['totemTalents', 9], ['buffTalents', 9], ['prof', 36], ['totemProf', 36], ['skillBuff', 36], ['skillAdj', 36], ['skillAdjPct', 36],
      ['statBuff', 12], ['statAdj', 12], ['statAdjPct', 12]].forEach(([k, n]) => { c[k] = nums(raw[k], n, null); });
    c.items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 300).filter((it) => it && typeof it === 'object').map((it) => {
      const o = { name: str(it.name, 100), qty: num(it.qty) === null ? 1 : num(it.qty), charges: null, desc: str(it.desc, 2000),
        wearable: !!it.wearable, weapon: !!it.weapon, magic: !!it.magic, buffs: cleanBuffs(it.buffs),
        weaponProps: it.weapon ? cleanWeapon(it.weaponProps) : {}, magicProps: cleanMagic(it.magic ? it.magicProps : {}) };
      o.eqL = !!it.eqL; o.eqR = !!it.eqR; o.eqB = !!it.eqB;
      if (o.eqB) { o.eqL = false; o.eqR = false; }
      o.charges = o.magic && num(it.charges) !== null ? num(it.charges) : null; o.charges = clampCharges(Object.assign({}, o, { charges: o.charges }));
      return o;
    });
    c.abilities = (Array.isArray(raw.abilities) ? raw.abilities : []).slice(0, 100).filter((a) => a && typeof a === 'object').map((a) => ({ name: str(a.name, 100), desc: str(a.desc, 3000) }));
    c.appearance = str(raw.appearance, 10000); c.backstory = str(raw.backstory, 10000); c.motivation = str(raw.motivation, 10000);
    if (typeof raw.tokenImage === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.tokenImage) && raw.tokenImage.length <= 100000) c.tokenImage = raw.tokenImage;
    return c;
  }
  function importCharacterText(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not a character sheet.'); }
    if (!data || data.format !== IMPORT_FORMAT || !data.character || typeof data.character !== 'object') throw new Error('That file is not a character sheet from this app.');
    if (Number(data.version) > 1) throw new Error('That sheet was made by a newer version of the app.');
    const c = sanitizeImport(data.character);
    if (!c.info.name) c.info.name = 'Imported character';
    return c;
  }
  $('exportBtn').addEventListener('click', () => {
    if (cur && cur.ch) { try { downloadText(exportFileName(cur.ch), JSON.stringify(sheetForExport(cur.ch), null, 2)); } catch (e) { $('saveStatus').textContent = 'Could not make the file.'; } }
  });
  $('importCharBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', () => {
    const f = $('importFile').files && $('importFile').files[0];
    $('importFile').value = '';
    if (!f) return;
    $('listMsg').textContent = '';
    if (f.size > 1500000) { $('listMsg').textContent = 'That file is too big to be a character sheet.'; return; }
    const rd = new FileReader();
    rd.onerror = () => { $('listMsg').textContent = 'Could not read that file.'; };
    rd.onload = () => {
      try {
        const c = importCharacterText(String(rd.result));
        state.chars.unshift(c); queueSave(c); go('character-' + c.id);
      } catch (e) { $('listMsg').textContent = e.message; }
    };
    rd.readAsText(f);
  });

  /* ================= Compare characters ================= */
  // Up to four characters side by side: your own, plus everyone you can see in your campaigns (a private NPC sheet is not offered).
  let cmpPool = [], cmpPick = [], cmpSeq = 0;
  const CMP_MAX = 4;
  function cmpLabel(e) { return (e.ch.info.name || 'Unnamed character') + (e.tag ? '  (' + e.tag + ')' : ''); }
  async function openCompare() {
    const seq = ++cmpSeq;
    cmpPick = []; $('cmpMsg').textContent = '';
    cmpPool = state.chars.map((c) => ({ ch: c, tag: 'yours' + (c.campaignId && campaignName(c.campaignId) ? ', ' + campaignName(c.campaignId) : '') }));
    paintCompare();
    const seen = new Set(cmpPool.map((e) => e.ch.id));
    for (const g of state.campaigns.filter((x) => myMembership(x))) {
      try {
        const rows = await backend.listCampaignCharacters(g.id);
        if (seq !== cmpSeq) return;
        rows.forEach((r) => {
          if (r.stub || seen.has(r.ch.id)) return;
          seen.add(r.ch.id);
          cmpPool.push({ ch: normalizeChar(r.ch), tag: (r.ch.isNpc ? 'NPC' : 'player ' + r.owner) + ', ' + g.name });
        });
      } catch (e) { if (seq === cmpSeq) $('cmpMsg').textContent = 'Could not load every campaign\'s characters. ' + e.message; }
    }
    if (seq === cmpSeq) paintCompare();
  }
  function paintCompare() {
    const full = cmpPick.length >= CMP_MAX;
    $('cmpPick').replaceChildren(...(cmpPool.length ? cmpPool.map((e) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': cmpLabel(e), 'data-cmp': e.ch.id }); cb.checked = cmpPick.includes(e.ch.id); cb.disabled = full && !cb.checked;
      cb.addEventListener('change', () => { cmpPick = cb.checked ? cmpPick.concat(e.ch.id).slice(0, CMP_MAX) : cmpPick.filter((x) => x !== e.ch.id); paintCompare(); });
      return h('label', { class: 'fld inline' }, cb, h('span', { text: cmpLabel(e) }));
    }) : [h('p', { class: 'note', text: 'No characters yet.' })]));
    const picked = cmpPick.map((id) => cmpPool.find((e) => e.ch.id === id)).filter(Boolean);
    if (picked.length < 2) { $('cmpTable').replaceChildren(h('p', { class: 'note', text: picked.length ? 'Pick at least one more character.' : '' })); return; }
    const res = picked.map((e) => BSH.compute(e.ch));
    const row = (label, vals, best = true) => {
      const nums = vals.map((v) => v.n), top = Math.max(...nums), hit = best && nums.some((n) => n !== top);
      return h('tr', {}, h('th', { scope: 'row', text: label }), ...vals.map((v, i) => h('td', { class: hit && nums[i] === top ? 'best' : '', text: v.text })));
    };
    const cell = (n, text) => ({ n, text });
    const stats = BSH.STATS.map((s, i) => row(s.name + ' (' + s.key + ')', res.map((r) => cell(r.stat[i], fmt(r.stat[i]))), s.key !== 'WC'));
    const skills = BSH.SKILLS.map((s, i) => row(s.name, res.map((r) => cell(r.skillMod[i], signed(r.skillMod[i])))));
    const secRow = (t) => h('tr', { class: 'sec' }, h('th', { colspan: String(picked.length + 1), text: t }));
    $('cmpTable').replaceChildren(h('table', { class: 'cmp', id: 'cmpGrid' },
      h('thead', {}, h('tr', {}, h('th', { text: '' }), ...picked.map((e) => h('th', { scope: 'col', text: e.ch.info.name || 'Unnamed character' })))),
      h('tbody', {}, secRow('Stats'), ...stats, secRow('Skills'), ...skills)));
  }

  /* ================= Notes (kept in this browser only) ================= */
  // Pages of free text, saved in localStorage for the logged-in account on this device. They are NOT in the database, so BACK UP NOTES
  // downloads them as a file and RESTORE NOTES loads such a file again (pages already here are skipped; the rest are added).
  const NOTES_FORMAT = 'bloodsoup-hell-notes';
  const notesKey = () => 'bsh-notes-' + state.user.id, notesBackupKey = () => 'bsh-notes-backup-' + state.user.id;
  let notes = [], noteId = null;
  const cleanNote = (n) => n && typeof n === 'object' ? { id: typeof n.id === 'string' && n.id.length <= 64 ? n.id : uuid(), title: String(n.title == null ? '' : n.title).slice(0, 60),
    text: String(n.text == null ? '' : n.text).slice(0, 20000), campaign: typeof n.campaign === 'string' ? n.campaign.slice(0, 64) : '',
    campaignName: String(n.campaignName == null ? '' : n.campaignName).slice(0, 60), updated: Number(n.updated) || Date.now() } : null;
  function loadNotes() {
    try { const v = JSON.parse(localStorage.getItem(notesKey()) || '[]'); notes = Array.isArray(v) ? v.map(cleanNote).filter(Boolean).slice(0, 300) : []; } catch (e) { notes = []; }
  }
  const saveNotes = () => { try { localStorage.setItem(notesKey(), JSON.stringify(notes)); return true; } catch (e) { return false; } };
  function renderNotes() {
    loadNotes();
    if (!notes.some((n) => n.id === noteId)) noteId = notes.length ? notes.slice().sort((a, b) => b.updated - a.updated)[0].id : null;
    paintNotes('');
  }
  function paintNotes(msg) {
    const n = notes.find((x) => x.id === noteId), when = (() => { try { return Number(localStorage.getItem(notesBackupKey())) || 0; } catch (e) { return 0; } })();
    const status = h('p', { class: 'note', id: 'notesMsg', role: 'status', text: msg });
    const fileIn = h('input', { type: 'file', id: 'notesFile', accept: '.json,application/json', 'aria-label': 'Notes backup file' }); fileIn.hidden = true;
    const sel = h('select', { id: 'notesSel', 'aria-label': 'Page' }, notes.slice().sort((a, b) => b.updated - a.updated).map((x) =>
      h('option', { value: x.id, text: (x.title || 'Untitled page') + (x.campaignName ? '  (' + x.campaignName + ')' : '') })));
    if (n) sel.value = n.id;
    sel.addEventListener('change', () => { noteId = sel.value; paintNotes(''); });
    const kids = [
      h('h1', { text: 'Notes' }),
      h('p', { class: 'warn', id: 'notesWarn', text: 'These notes are saved only in this browser, on this device. They are not in your account, they do not sync to other devices, and they are lost if you clear the site data, reinstall the app or change browsers. Back them up regularly with BACK UP NOTES.' }),
      h('p', { class: 'note', id: 'notesBackupInfo', text: when ? 'Last backup: ' + new Date(when).toLocaleString() : 'You have not backed these notes up yet.' }),
      h('div', { class: 'notes-acts' },
        h('button', { class: 'btn small', type: 'button', id: 'notesBackup', text: 'BACK UP NOTES', onclick: () => {
          if (!notes.length) { status.textContent = 'There are no notes to back up yet.'; return; }
          const day = new Date().toISOString().slice(0, 10);
          downloadText('Bloodsoup_notes_' + day + '.bloodsoup-notes.json', JSON.stringify({ format: NOTES_FORMAT, version: 1, exported: new Date().toISOString(), notes }, null, 1));
          try { localStorage.setItem(notesBackupKey(), String(Date.now())); } catch (e) { /* only the reminder is lost */ }
          paintNotes('Backup downloaded (' + notes.length + (notes.length === 1 ? ' page' : ' pages') + '). Keep the file somewhere safe.');
        } }),
        h('button', { class: 'btn small', type: 'button', id: 'notesRestore', text: 'RESTORE NOTES', onclick: () => $('notesFile').click() }),
        fileIn),
      status];
    $('notesDoc').replaceChildren(...kids, ...(notes.length ? [h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'Page' }), sel)] : []),
      h('div', { class: 'notes-acts' }, h('button', { class: 'btn small', type: 'button', id: 'notesNew', text: 'NEW PAGE', onclick: () => {
        const p = cleanNote({ id: uuid(), title: '', text: '', updated: Date.now() }); notes.unshift(p); noteId = p.id;
        paintNotes(saveNotes() ? '' : 'Could not save: this browser is not allowing storage.');
        $('notesTitle').focus({ preventScroll: true });
      } })));
    $('notesFile').addEventListener('change', onNotesFile);
    if (!n) { $('notesDoc').append(h('p', { class: 'note', text: 'No pages yet. Tap NEW PAGE to start one.' })); return; }
    const camps = state.campaigns.filter((g) => myMembership(g));
    const save = () => { n.updated = Date.now(); status.textContent = saveNotes() ? 'Saved on this device.' : 'Could not save: this browser is not allowing storage.'; };
    const title = h('input', { type: 'text', id: 'notesTitle', maxlength: '60', 'aria-label': 'Page title', placeholder: 'Page title' }); title.value = n.title;
    title.addEventListener('input', () => { n.title = title.value; const o = sel.options[sel.selectedIndex]; if (o) o.textContent = (n.title || 'Untitled page') + (n.campaignName ? '  (' + n.campaignName + ')' : ''); save(); });
    const camp = h('select', { id: 'notesCamp', 'aria-label': 'Campaign for this page' }, [h('option', { value: '', text: '(no campaign)' })]
      .concat(camps.map((g) => h('option', { value: g.id, text: g.name })), n.campaign && !camps.some((g) => g.id === n.campaign) ? [h('option', { value: n.campaign, text: n.campaignName || 'Another campaign' })] : []));
    camp.value = n.campaign;
    camp.addEventListener('change', () => { n.campaign = camp.value; const g = camps.find((x) => x.id === camp.value); n.campaignName = g ? g.name : (camp.value ? n.campaignName : ''); save(); paintNotes('Saved on this device.'); });
    const text = h('textarea', { id: 'notesText', 'aria-label': 'Notes', maxlength: '20000', placeholder: 'Write here...' }); text.value = n.text;
    text.addEventListener('input', () => { n.text = text.value; save(); });
    $('notesDoc').append(h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'Title' }), title), h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'Campaign (optional)' }), camp),
      h('label', { class: 'fld' }, h('span', { class: 'lbl', text: 'Notes' }), text),
      confirmButton('DELETE PAGE', 'TAP AGAIN TO DELETE', () => { notes = notes.filter((x) => x.id !== n.id); noteId = null; saveNotes(); renderNotes(); $('notesMsg').textContent = 'Page deleted.'; }));
  }
  function onNotesFile() {
    const f = $('notesFile').files && $('notesFile').files[0]; $('notesFile').value = '';
    const say = (m) => { const e = $('notesMsg'); if (e) e.textContent = m; };
    if (!f) return;
    if (f.size > 6000000) { say('That file is too big to be a notes backup.'); return; }
    const rd = new FileReader();
    rd.onerror = () => say('Could not read that file.');
    rd.onload = () => {
      try {
        let raw; try { raw = JSON.parse(String(rd.result)); } catch (e) { throw new Error('That file is not a notes backup.'); }
        if (!raw || raw.format !== NOTES_FORMAT || !Array.isArray(raw.notes)) throw new Error('That file is not a notes backup.');
        let added = 0, same = 0;
        raw.notes.slice(0, 300).map(cleanNote).filter(Boolean).forEach((p) => {
          if (notes.some((x) => x.title === p.title && x.text === p.text)) { same++; return; }   // already here
          if (notes.some((x) => x.id === p.id)) p.id = uuid();   // same id but different text: keep both
          notes.push(p); added++;
        });
        if (notes.length > 300) notes = notes.sort((a, b) => b.updated - a.updated).slice(0, 300);
        if (!saveNotes()) throw new Error('Could not save: this browser is not allowing storage.');
        if (!notes.some((x) => x.id === noteId) && notes.length) noteId = notes[0].id;
        paintNotes('Restored ' + added + (added === 1 ? ' page' : ' pages') + (same ? ' (' + same + ' already here)' : '') + '.');
      } catch (e) { say(e.message); }
    };
    rd.readAsText(f);
  }

  /* ================= Character sheet ================= */
  let cur = null;   // { ch, outs, panels, spIn, epIn }

  const TABS = [['info', 'INFO'], ['stats', 'STATS'], ['talents', 'TALENTS'], ['skills', 'SKILLS'],
                ['totem', 'TOTEM'], ['buffs', 'BUFFS'], ['items', 'ITEMS'], ['abilities', 'ABILITIES'], ['story', 'STORY']];

  function touch() {
    if (cur.viewOnly) return;   // someone else's character is never changed or saved from here
    cur.ch.updated = Date.now(); queueSave(cur.ch); refresh();
  }

  function bind(input, path, kind) {
    const v = getPath(cur.ch, path);
    if (kind === 'check') input.checked = !!v; else input.value = v == null ? '' : v;
    input.addEventListener('input', () => {
      let val;
      if (kind === 'check') val = input.checked;
      else if (kind === 'num') { val = input.value === '' ? null : Number(input.value); if (Number.isNaN(val)) val = null; }
      else val = input.value;
      setPath(cur.ch, path, val);
      touch();
    });
    return input;
  }
  const numIn = (path, label, ph = '0') => bind(h('input', { type: 'number', step: 'any', class: 'num', placeholder: ph, 'aria-label': label }), path, 'num');
  const txtIn = (path, label, max = 60) => bind(h('input', { type: 'text', maxlength: max, 'aria-label': label, autocomplete: 'off' }), path, 'text');
  const area = (path, label, ph = '') => bind(h('textarea', { 'aria-label': label, placeholder: ph }), path, 'text');
  // a text box that grows to show all of its text (used so long item/ability names and descriptions are never cut off)
  const fit = (el) => { if (el.offsetParent === null) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };
  const grow = (el) => {
    el.addEventListener('input', () => fit(el));
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => fit(el)).observe(el); else requestAnimationFrame(() => fit(el));
    return el;
  };
  const growArea = (path, label) => grow(area(path, label));
  // a one-line-looking name that wraps onto more lines when it is long; Enter does not add a line break
  const nameIn = (path, label, max = 60) => {
    const el = grow(bind(h('textarea', { class: 'wrapname', rows: '1', maxlength: max, 'aria-label': label, autocomplete: 'off' }), path, 'text'));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    return el;
  };
  const field = (label, control, cls = '') => h('label', { class: 'fld ' + cls }, h('span', { class: 'lbl', text: label }), control);
  const out = (key, cls = 'val', tag = 'span') => { const e = h(tag, { class: cls }); cur.outs[key] = e; return e; };
  const sec = (t) => h('h3', { class: 'sec', text: t });
  // A bar that fills left to right (the page scales it against the highest value and highlights the highest)
  const bar = (kind, i) => {
    const fill = h('i');
    const e = h('div', { class: 'bar', role: 'img' }, fill);
    (cur.bars[kind] = cur.bars[kind] || [])[i] = { e, fill };
    return e;
  };
  function drawBars(kind, values, label) {
    const bars = cur.bars[kind]; if (!bars) return;
    const max = Math.max(...values);
    values.forEach((v, i) => {
      const b = bars[i]; if (!b) return;
      const pct = max > 0 && v > 0 ? Math.max(4, (v / max) * 100) : 0;   // always scaled to the highest
      b.fill.style.width = pct + '%';
      b.e.classList.toggle('top', max > 0 && v === max);
      b.e.setAttribute('aria-label', label(i) + ' ' + fmt(v));
    });
  }

  function openSheet(ch, viewOnly) {
    cur = { ch, outs: {}, bars: {}, viewOnly: viewOnly || null, itemOpen: new Set(), buffOpen: new Set() };
    const tabs = $('tabs'), panels = $('panels');
    tabs.replaceChildren(); panels.replaceChildren();
    cur.panels = {};
    TABS.forEach(([id, label]) => {
      tabs.append(h('button', { class: 'tab', type: 'button', role: 'tab', id: 'tab-' + id, 'aria-selected': 'false', 'aria-controls': 'panel-' + id,
        text: label, onclick: () => showTab(id) }));
      const p = h('div', { class: 'panel', id: 'panel-' + id, role: 'tabpanel', hidden: true });
      cur.panels[id] = p; panels.append(p);
    });
    cur.panels.info.append(...panelInfo());
    cur.panels.stats.append(...panelStats());
    cur.panels.talents.append(...panelTalents());
    cur.panels.skills.append(...panelSkills());
    cur.panels.totem.append(...panelTotem());
    cur.panels.buffs.append(...panelBuffs());
    cur.panels.items.append(...panelItems());
    cur.panels.abilities.append(...panelAbilities());
    cur.panels.story.append(...panelStory());
    setStatus(pending && pending.id === ch.id ? 'Saving...' : '');
    if (cur.viewOnly) {   // someone else's character: look, don't touch
      panels.querySelectorAll('input, select, textarea, button').forEach((e) => { e.disabled = true; });
      panels.querySelectorAll('.chev').forEach((e) => { e.disabled = false; });   // reading an item's description is still allowed
      panels.querySelectorAll('.danger').forEach((e) => { e.hidden = true; });
      setStatus('Read only' + (cur.viewOnly.owner ? ' · ' + cur.viewOnly.owner + "'s " + (ch.isNpc ? 'NPC' : 'character') : ''));
    }
    showTab('info');
    refresh();
  }

  function showTab(id) {
    TABS.forEach(([t]) => {
      $('tab-' + t).setAttribute('aria-selected', String(t === id));
      cur.panels[t].hidden = t !== id;
    });
    window.scrollTo(0, 0);
  }

  /* ----- INFO ----- */

  // "Player": who owns this character. Unlinked characters can only be yours; linked ones can be handed to anyone in the campaign.
  function playerFields() {
    if (cur.ch.isNpc || cur.viewOnly) return [];
    cur.playerSel = h('select', { 'aria-label': 'Player' });
    cur.handBox = h('div', { class: 'hand-box' });
    cur.handMsg = h('p', { class: 'msg', role: 'alert' });
    cur.playerSel.addEventListener('change', updateHandOver);
    fillPlayerSel();
    return [field('Player', cur.playerSel, 'span2'), cur.handBox, cur.handMsg];
  }
  // On an NPC's sheet. In a campaign (QM only): move it to another campaign you run, give it to a player (it becomes their character),
  // or take it out of the campaign (it stays with its owner, on their NPCs list). Outside any campaign (its owner): add it to a campaign you run.
  function npcManageFields() {
    const ch = cur.ch;
    if (!ch.isNpc) return [];
    const g = ch.campaignId && state.campaigns.find((x) => x.id === ch.campaignId);
    const mine = !cur.viewOnly, name = ch.info.name || 'The NPC';
    const msg = h('p', { class: 'msg', role: 'alert' });
    const run = async (fn, text, dest) => {
      try {
        if (mine) { await flushSave(); if (pending) throw new Error('Wait for the character to finish saving, then try again.'); }
        await fn();
        await loadChars();
        cur = null;
        go(dest);
        if (dest === 'characters') $('listMsg').textContent = text; else setCampaignMsgs(text);
      } catch (e) { if (cur) msg.textContent = e.message; }
    };
    const parts = [];
    if (g) {
      if (!iAmQm(g)) return [];
      const others = state.campaigns.filter((x) => x.id !== g.id && iAmQm(x));
      const players = g.members.filter((m) => m.userId !== state.user.id).sort((a, b) => a.username.localeCompare(b.username));
      const back = 'campaign-' + g.id;
      if (others.length) {
        const to = h('select', { 'aria-label': 'Move to campaign' }, ...others.map((x) => h('option', { value: x.id, text: x.name })));
        parts.push(h('div', { class: 'hand-box', 'data-npc': 'move' }, h('span', { class: 'lbl', text: 'Move to campaign' }), to,
          confirmButton('MOVE NPC', 'TAP AGAIN TO MOVE', () => run(() => backend.moveNpc(ch.id, to.value),
            name + ' moved to ' + to.options[to.selectedIndex].text + ' (hidden there).', back))));
      }
      if (players.length) {
        const who = h('select', { 'aria-label': 'Give to player' }, ...players.map((m) => h('option', { value: m.userId, text: m.username })));
        parts.push(h('div', { class: 'hand-box', 'data-npc': 'give' }, h('span', { class: 'lbl', text: 'Give control to a player' }), who,
          h('p', { class: 'note', text: 'The NPC becomes that player\u2019s ordinary character. Only they can edit it afterwards.' }),
          confirmButton('GIVE CONTROL', 'TAP AGAIN TO GIVE', () => run(() => backend.giveNpc(ch.id, who.value),
            name + ' now belongs to ' + who.options[who.selectedIndex].text + '.', back))));
      }
      parts.push(h('div', { class: 'hand-box', 'data-npc': 'unlink' },
        h('p', { class: 'note', text: 'Taking it out of the campaign keeps it: it stays with its owner under NPCs on their characters page.' }),
        confirmButton('REMOVE FROM CAMPAIGN', 'TAP AGAIN TO REMOVE', () => run(() => backend.unlinkNpc(ch.id),
          name + ' is out of the campaign' + (mine ? ' and kept under your NPCs.' : '.'), mine ? 'characters' : back))));
    } else if (mine) {
      const mine2 = state.campaigns.filter((x) => iAmQm(x));
      if (mine2.length) {
        const to = h('select', { 'aria-label': 'Add to campaign' }, ...mine2.map((x) => h('option', { value: x.id, text: x.name })));
        parts.push(h('div', { class: 'hand-box', 'data-npc': 'add' }, h('span', { class: 'lbl', text: 'Add to a campaign' }), to,
          h('p', { class: 'note', text: 'Only campaigns you are QM of are listed. It arrives hidden from the players.' }),
          confirmButton('ADD TO CAMPAIGN', 'TAP AGAIN TO ADD', () => run(() => backend.addNpcToCampaign(ch.id, to.value),
            name + ' added to ' + to.options[to.selectedIndex].text + ' (hidden).', 'campaign-' + to.value))));
      } else parts.push(h('p', { class: 'note', text: 'This NPC is not in a campaign. Become QM of a campaign to add it to one.' }));
    }
    return [...parts, msg];
  }
  // QM only: turn this character (mine, or one already handed to a player) into an NPC of its campaign.
  function npcFields() {
    const ch = cur.ch, g = ch.campaignId && state.campaigns.find((x) => x.id === ch.campaignId);
    if (ch.isNpc || !g || !iAmQm(g) || (cur.viewOnly && cur.viewOnly.draft)) return [];
    cur.npcMsg = h('p', { class: 'msg', role: 'alert' });
    const btn = confirmButton('MAKE NPC', 'TAP AGAIN TO MAKE NPC', async () => {
      const id = ch.id;
      try {
        if (!cur.viewOnly) { await flushSave(); if (pending) throw new Error('Wait for the character to finish saving, then try again.'); }
        await backend.makeNpc(id);
        state.chars = state.chars.filter((c) => c.id !== id);
        cur = null;
        go('characters');
        $('listMsg').textContent = (ch.info.name || 'The character') + ' is now an NPC (hidden). Find it on the campaign page.';
      } catch (e) { if (cur) cur.npcMsg.textContent = e.message; }
    });
    return [h('div', { class: 'hand-box' },
      h('p', { class: 'note', text: 'Make NPC moves this character to you as an NPC of this campaign. The current player loses it. It starts hidden from players.' }), btn), cur.npcMsg];
  }
  function fillPlayerSel() {
    const sel = cur.playerSel; if (!sel) return;
    const me = state.user.id;
    const g = cur.ch.campaignId && state.campaigns.find((x) => x.id === cur.ch.campaignId);
    const others = g ? g.members.filter((m) => m.userId !== me).sort((a, b) => a.username.localeCompare(b.username)) : [];
    sel.replaceChildren(h('option', { value: me, text: state.user.username + ' (you)' }),
      ...others.map((m) => h('option', { value: m.userId, text: m.username })));
    sel.value = me;
    updateHandOver();
  }
  function updateHandOver() {
    const sel = cur.playerSel, box = cur.handBox; if (!sel || !box) return;
    box.replaceChildren(); cur.handMsg.textContent = '';
    if (sel.value === state.user.id) return;
    const who = sel.options[sel.selectedIndex].text;
    box.append(h('p', { class: 'note', text: 'Handing over moves this character to ' + who + '. Only they can edit it afterwards; you will still see it on the campaign page.' }),
      confirmButton('HAND OVER TO ' + who.toUpperCase(), 'TAP AGAIN TO HAND OVER', async () => {
        const id = cur.ch.id, to = sel.value;
        try {
          await flushSave();
          if (pending) throw new Error('Wait for the character to finish saving, then try again.');
          await backend.giveCharacter(id, to);
          state.chars = state.chars.filter((c) => c.id !== id);
          cur = null;
          go('characters');
          $('listMsg').textContent = 'Handed over to ' + who + '.';
        } catch (e) { if (cur) cur.handMsg.textContent = e.message; }
      }));
  }

  function panelInfo() {
    let campField;
    if (cur.ch.isNpc || cur.viewOnly) {   // NPCs stay in their campaign; other players' characters are not mine to link
      cur.campText = h('div', { class: 'val', style: 'text-align:left', text: campLabel() });
      campField = field(cur.ch.isNpc ? 'Campaign' : 'Linked campaign', cur.campText);
    } else {
      const campSel = h('select', { 'aria-label': 'Campaign' });
      cur.campSel = campSel;
      fillCampSel();
      campSel.addEventListener('change', () => { cur.ch.campaignId = campSel.value || null; touch(); fillPlayerSel(); });
      campField = field('Linked campaign', campSel);
    }
    const sg = numIn('info.spiritualGuidance', 'Spiritual guidance');
    const alive = bind(h('input', { type: 'checkbox' }), 'info.alive', 'check');
    // While alive, Spiritual Guidance is locked at 0. Once not alive it becomes 3 and can be edited.
    const syncSg = (changed) => {
      const info = cur.ch.info, edit = !cur.viewOnly;
      if (alive.checked) {
        sg.value = '0'; sg.disabled = true;
        if (edit && info.spiritualGuidance !== 0) { info.spiritualGuidance = 0; if (changed) touch(); }
      } else {
        sg.disabled = false;
        if (info.spiritualGuidance == null || (changed && edit)) {
          if (edit) { info.spiritualGuidance = 3; if (changed) touch(); }
          sg.value = '3';
        }
      }
    };
    alive.addEventListener('input', () => syncSg(true));
    syncSg(false);
    return [
      sec('Campaign'),
      h('div', { class: 'stackf' }, campField, ...playerFields(), ...npcFields(), ...npcManageFields()),
      sec('Character'),
      h('div', { class: 'grid2' },
        field('Name', txtIn('info.name', 'Name', 40), 'span2'),
        field('Species', txtIn('info.species', 'Species', 30)),
        field('Sex', txtIn('info.sex', 'Sex', 20)),
        field('Age', txtIn('info.age', 'Age', 20)),
        field('Height', txtIn('info.height', 'Height', 20)),
        field('Weight', numIn('info.weight', 'Weight', '0')),
        field('Money', txtIn('info.money', 'Money', 30))),
      sec('Map token'),
      tokenImageField(),
      sec('Corporeal Status'),
      h('div', { class: 'grid2' },
        field('Incarnation', numIn('info.incarnation', 'Incarnation', '1')),
        field('Spiritual guidance', sg),
        h('label', { class: 'chk span2' }, alive, 'Alive')),
      sec('Tokens'),
      h('div', { class: 'grid3' },
        field('Explode tokens', numIn('info.explodeTokens', 'Explode tokens')),
        field('Totem tokens', numIn('info.totemTokens', 'Totem tokens')),
        field('Legacy tokens', numIn('info.legacyTokens', 'Legacy tokens'))),
      h('div', { class: 'tools danger' },
        h('button', { class: 'btn small', type: 'button', text: 'DELETE CHARACTER', onclick: (e) => {
          const b = e.currentTarget;
          if (!b.dataset.armed) {   // two-step confirm built into the page (no pop-up dialogs)
            b.dataset.armed = '1';
            b.textContent = 'TAP AGAIN TO DELETE';
            setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'DELETE CHARACTER'; } }, 4000);
            return;
          }
          const id = cur.ch.id;
          state.chars = state.chars.filter((c) => c.id !== id);
          if (pending && pending.id === id) { pending = null; clearTimeout(saveTimer); saveTimer = null; }
          cur = null;
          go('characters');
          backend.deleteCharacter(id).catch(async (err) => { await loadChars(); $('listMsg').textContent = err.message; renderCharList(); });
        } }))
    ];
  }

  /* ----- STATS ----- */
  function panelStats() {
    const hpIn = h('input', { type: 'number', step: 'any', class: 'num', 'aria-label': 'HP remaining' });
    hpIn.addEventListener('input', () => { const n = Number(hpIn.value); if (hpIn.value === '' || Number.isNaN(n) || cur.viewOnly) return; setHp(cur.ch, n); touch(); });
    const dhIn = h('input', { type: 'number', step: 'any', class: 'num', placeholder: '+ heals, - hurts', 'aria-label': 'Damage or healing' });
    const acceptDh = () => { const n = Number(dhIn.value); if (dhIn.value === '' || Number.isNaN(n) || cur.viewOnly) return; changeHp(cur.ch, n); dhIn.value = ''; touch(); };
    dhIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') acceptDh(); });
    cur.hpIn = hpIn;
    const apIn = numIn('vitals.apRemaining', 'AP remaining', '0');
    const spIn = numIn('vitals.spRemaining', 'SP remaining', '0');
    const epIn = numIn('vitals.epRemaining', 'EP remaining', '0');
    cur.apIn = apIn; cur.spIn = spIn; cur.epIn = epIn;
    const rows = BSH.STATS.map((s, i) => h('div', { class: 'row st' },
      h('div', { class: 'nm' }, h('b', { text: s.key }), h('small', { text: s.name })),
      out('stat.' + i),
      numIn('statAdj.' + i, s.key + ' flat adjustment'),
      numIn('statAdjPct.' + i, s.key + ' percent adjustment')));
    const statHead = () => h('div', { class: 'row head st' }, h('span', { text: 'Stat' }), h('span', { text: 'Total' }), h('span', { text: '+/- #' }), h('span', { text: '+/- %' }));
    const half = Math.ceil(rows.length / 2);
    return [
      sec('Vitals'),
      h('div', { class: 'cards' },
        h('div', { class: 'card' }, h('span', { class: 'lbl', text: 'HP remaining' }),
          h('div', { class: 'bigrow' }, hpIn, h('span', { class: 'of' }, 'of ', out('hpTot', 'of-v', 'span')))),
        h('div', { class: 'card' }, h('span', { class: 'lbl', text: 'Available capacity' }),
          h('div', { class: 'bigrow' }, out('capAvail', 'big'), h('span', { class: 'of' }, 'of ', out('capTot', 'of-v', 'span')))),
        h('div', { class: 'card' }, h('span', { class: 'lbl', text: 'AP remaining' }),
          h('div', { class: 'bigrow' }, apIn, h('span', { class: 'of' }, 'of ', out('apTot', 'of-v', 'span')))),
        h('div', { class: 'card' }, h('span', { class: 'lbl', text: 'SP remaining' }),
          h('div', { class: 'bigrow' }, spIn, h('span', { class: 'of' }, 'of ', out('spTot', 'of-v', 'span')))),
        h('div', { class: 'card' }, h('span', { class: 'lbl', text: 'EP remaining' }),
          h('div', { class: 'bigrow' }, epIn, h('span', { class: 'of' }, 'of ', out('epTot', 'of-v', 'span'))))),
      h('div', { class: 'grid2', style: 'margin-top:.8rem' },
        h('div', { class: 'fld' }, h('span', { class: 'lbl', text: 'Damage/Healing' }),
          h('div', { class: 'dmgrow' }, dhIn, h('button', { class: 'btn small', type: 'button', text: 'ACCEPT', onclick: acceptDh }))),
        field('Temp HP', numIn('vitals.tempHp', 'Temp HP')),
        field('Equipment weight', numIn('vitals.equipWeight', 'Equipment weight')),
        field('Overall % add/subtract', numIn('vitals.overallPct', 'Overall percent adjustment'))),
      sec('Aggregate stats'),
      h('div', { class: 'stats2' },
        h('div', { class: 'statcol' }, statHead(), ...rows.slice(0, half)),
        h('div', { class: 'statcol' }, statHead(), ...rows.slice(half))),
      sec('Levels'),
      h('div', { class: 'lv' }, h('span', { text: 'Talent level' }), out('talentLevel', '')),
      h('div', { class: 'lv' }, h('span', { text: 'Proficiency level' }), out('profLevel', '')),
      h('div', { class: 'lv' }, h('span', { text: 'Skill level' }), out('skillLevel', '')),
      sec('Classes'),
      ...BSH.CLASSES.flatMap((c, ci) => [
        h('div', { class: 'lv cls' }, h('span', { text: c.name }), bar('class', ci)),
        ...c.subs.map((s, si) => h('div', { class: 'lv sub' }, h('span', { text: s.name }), bar('sub', ci * 3 + si)))
      ])
    ];
  }

  /* ----- TALENTS ----- */
  function talentGrid(path, ph) {
    return h('div', { class: 'grid3' }, BSH.TALENTS.map((t, i) =>
      field(t.name + ' (' + t.key + ')', numIn(path + '.' + i, t.name, ph))));
  }
  function panelTalents() {
    return [
      sec('Talent points'),
      h('p', { class: 'hint', text: 'Each talent starts at 10. Totem and buff bonuses are on their own tabs.' }),
      talentGrid('talents', '10'),
      h('div', { class: 'lv', style: 'margin-top:1rem' }, h('span', { text: 'Talent level' }), out('talentLevel2', ''))
    ];
  }

  /* ----- SKILLS ----- */
  // The 36 skills fall into four groups of nine, in sheet order
  const SKILL_GROUPS = [['Fighter', 0], ['Explorer', 9], ['Speaker', 18], ['Supporter', 27]];
  function skillCard(s, i) {
    const field = (cap, input) => h('label', { class: 'skf' }, h('small', { text: cap }), input);
    return h('div', { class: 'skc' },
      h('div', { class: 'skt' }, h('div', { class: 'nm' }, h('b', { text: s.name }), h('small', { text: s.talents })), out('skill.' + i)),
      h('div', { class: 'ski' },
        field('PROF', numIn('prof.' + i, s.name + ' proficiency points')),
        field('+/- #', numIn('skillAdj.' + i, s.name + ' flat adjustment')),
        field('+/- %', numIn('skillAdjPct.' + i, s.name + ' percent adjustment'))));
  }
  function panelSkills() {
    return [
      h('p', { class: 'hint', text: 'Modifier = its two talents - 20 + 4 x proficiency, plus Totem and Buff bonuses, then your +/- # and +/- %.' }),
      ...SKILL_GROUPS.flatMap(([name, start]) => [
        h('h4', { class: 'subsec', text: name }),
        h('div', { class: 'skgrid' }, BSH.SKILLS.slice(start, start + 9).map((s, k) => skillCard(s, start + k)))
      ])
    ];
  }

  /* ----- TOTEM ----- */
  function skillInputList(path, label, start = 0, count = 36) {
    return h('div', { class: 'cols2' }, BSH.SKILLS.slice(start, start + count).map((s, k) => h('div', { class: 'row one' },
      h('div', { class: 'nm' }, h('b', { text: s.name }), h('small', { text: s.talents })),
      numIn(path + '.' + (start + k), s.name + ' ' + label))));
  }
  function panelTotem() {
    return [
      sec('Totem talent points'), talentGrid('totemTalents', '0'),
      sec('Totem proficiency points'), skillInputList('totemProf', 'totem proficiency')
    ];
  }

  /* ----- BUFFS / DEBUFFS ----- */
  function panelBuffs() {
    return [
      sec('Stat modifiers'),
      h('div', { class: 'cols2' }, BSH.STATS.map((s, i) => h('div', { class: 'row one' },
        h('div', { class: 'nm' }, h('b', { text: s.key }), h('small', { text: s.name })),
        numIn('statBuff.' + i, s.key + ' modifier')))),
      sec('Talent modifiers'), h('p', { class: 'hint', text: 'Buffs from equipped items are added automatically (see the Items tab).' }), talentGrid('buffTalents', '0'),
      sec('Skill modifiers'),
      ...SKILL_GROUPS.flatMap(([name, start]) => [h('h4', { class: 'subsec', text: name }),
        h('div', { class: 'skgrid' }, BSH.SKILLS.slice(start, start + 9).map((s, k) => h('div', { class: 'skc' },
          h('div', { class: 'nm' }, h('b', { text: s.name }), h('small', { text: s.talents })),
          numIn('skillBuff.' + (start + k), s.name + ' modifier'))))])
    ];
  }

  /* ----- ITEMS ----- */
  // A blank quantity counts as 1 (one item). Used by the +/- buttons, giving, and gifts that merge into a stack.
  const effQty = (it) => (it.qty == null || it.qty === '' ? 1 : Math.max(0, Number(it.qty) || 0));
  const sameName = (a, b) => String(a.name || '').trim().toLowerCase() === String(b.name || '').trim().toLowerCase();
  const itemLabel = (it) => (String(it.name || '').trim() || 'Unnamed item');
  const HANDS = [['eqL', 'Left hand', 'LEFT HAND', 'L'], ['eqR', 'Right hand', 'RIGHT HAND', 'R']];
  const FLAGS = [['wearable', 'Wearable'], ['weapon', 'Weapon'], ['magic', 'Magic']];

  // Weapon properties, as in the rulebook's Weapon Types list (all free text, e.g. Damage "Sharp", Dmg "BP+1D6", Cost "2 AP")
  const WEAPON_PROPS = [['type', 'Type'], ['size', 'Size/Style'], ['weight', 'Weight'], ['damage', 'Dmg Type'], ['range', 'Range'],
    ['cost', 'Cost'], ['cr', 'CR'], ['dmg', 'Attack Dmg'], ['effect', 'Effect']];
  const cleanWeapon = (w) => { const o = {}; WEAPON_PROPS.forEach(([k]) => { o[k] = w && w[k] != null ? String(w[k]).slice(0, 1000) : ''; }); return o; };
  // Magic properties. Charges only exist on magic items, from 0 up to Max Charges.
  const MAGIC_TEXT = [['type', 'Type'], ['attunement', 'Attunement']];
  const maxOf = (it) => Math.max(0, Math.floor(Number(it && it.magicProps && it.magicProps.maxCharges) || 0));
  const cleanMagic = (m) => ({
    type: m && m.type != null ? String(m.type).slice(0, 200) : '', attunement: m && m.attunement != null ? String(m.attunement).slice(0, 200) : '',
    maxCharges: m && m.maxCharges !== '' && m.maxCharges != null && Number.isFinite(Number(m.maxCharges)) ? Math.max(0, Math.floor(Number(m.maxCharges))) : '',
    effect: m && m.effect != null ? String(m.effect).slice(0, 1000) : '', spellbook: !!(m && m.spellbook) });
  const clampCharges = (it) => (it.magic && it.charges != null && it.charges !== '' ? Math.min(Math.max(0, Number(it.charges) || 0), maxOf(it)) : null);
  const cleanBuffs = (list) => (Array.isArray(list) ? list : []).filter((b) => b && (b.kind === 'talent' || b.kind === 'skill')
    && Number.isInteger(b.idx) && b.idx >= 0 && b.idx < (b.kind === 'talent' ? 9 : 36) && Number.isFinite(Number(b.amt)))
    .map((b) => ({ kind: b.kind, idx: b.idx, amt: Number(b.amt), hold: !!b.hold, wear: !!b.wear }));
  const buffName = (b) => (b.kind === 'talent' ? BSH.TALENTS[b.idx].name : BSH.SKILLS[b.idx].name);
  const signedAmt = (n) => (n > 0 ? '+' + n : String(n));

  // Add a gift to a character (once only: giftLog remembers which gifts were already added). Same-name items stack.
  function receiveItem(ch, gift) {
    ch.giftLog = Array.isArray(ch.giftLog) ? ch.giftLog : [];
    if (ch.giftLog.includes(gift.id)) return false;
    const inc = gift.item, have = ch.items.find((x) => sameName(x, inc));
    if (have) have.qty = effQty(have) + inc.qty;
    else {
      const mi = { magic: !!inc.magic, magicProps: cleanMagic(inc.magicProps), charges: inc.charges };
      ch.items.push({ name: inc.name, qty: inc.qty, charges: clampCharges(mi), desc: inc.desc || '',
        wearable: !!inc.wearable, weapon: !!inc.weapon, magic: !!inc.magic, buffs: cleanBuffs(inc.buffs), weaponProps: cleanWeapon(inc.weaponProps), magicProps: mi.magicProps });
    }
    ch.giftLog.push(gift.id);
    if (ch.giftLog.length > 200) ch.giftLog.splice(0, ch.giftLog.length - 200);
    return true;
  }

  // One line per item (name, hand marker, qty, charges, remove). Tapping the line opens the buttons and description underneath.
  function itemCard(i) {
    const it = cur.ch.items[i];
    const card = h('div', { class: 'item' });
    // Charges exist only on magic items: 0 up to Max Charges
    let chargesIn = null;
    if (it.magic) {
      if (!it.magicProps || typeof it.magicProps !== 'object') it.magicProps = {};
      it.charges = clampCharges(it);
      chargesIn = h('input', { type: 'number', class: 'num', step: '1', min: '0', max: String(maxOf(it)), placeholder: '0', 'aria-label': 'Charges (0 to Max Charges)' });
      chargesIn.value = it.charges == null ? '' : it.charges;
      chargesIn.addEventListener('input', () => {
        if (chargesIn.value === '') { it.charges = null; touch(); return; }
        const v = Math.min(Math.max(0, Math.floor(Number(chargesIn.value) || 0)), maxOf(it));
        it.charges = v; if (String(v) !== chargesIn.value) chargesIn.value = v;
        touch();
      });
    }
    const chev = h('button', { class: 'chev', type: 'button', 'aria-label': 'Show or hide the description' });
    const name = nameIn('items.' + i + '.name', 'Item name', 60);
    const qtyIn = numIn('items.' + i + '.qty', 'Quantity', '1');
    const held = HANDS.filter(([k]) => it[k]).map((x) => x[3]).join('') + (it.eqB ? 'B' : '');
    card.classList.toggle('held', !!held);

    const setQty = (n) => { it.qty = Math.max(0, n); qtyIn.value = it.qty; touch(); };
    const handBtn = ([key, , label]) => {
      const b = h('button', { class: 'btn', type: 'button', text: label, 'aria-pressed': String(!!it[key]),
        onclick: () => {
          const on = !it[key];
          cur.ch.items.forEach((x) => { x[key] = false; });   // a hand holds one thing
          it[key] = on; if (on) it.eqB = false;               // hands and body are exclusive
          touch(); rebuild('items');
        } });
      return b;
    };
    const give = giveForm(i);
    const bf = buffCard(i);
    const wp = it.weapon ? weaponCard(i) : null;
    const mg = it.magic ? magicCard(i, () => chargesIn) : null;
    const acts = h('div', { class: 'iact' },
      h('button', { class: 'btn', type: 'button', text: '-1', 'aria-label': 'Remove one', onclick: () => setQty(effQty(it) - 1) }),
      h('button', { class: 'btn', type: 'button', text: '+1', 'aria-label': 'Add one', onclick: () => setQty(effQty(it) + 1) }),
      HANDS.map(handBtn),
      it.wearable ? h('button', { class: 'btn', type: 'button', text: 'BODY', 'aria-pressed': String(!!it.eqB), onclick: () => {
        it.eqB = !it.eqB; if (it.eqB) { it.eqL = false; it.eqR = false; }   // any number of things on the body, but not also in a hand
        touch(); rebuild('items');
      } }) : null,
      h('button', { class: 'btn', type: 'button', text: 'ITEM BUFFS' + (cleanBuffs(it.buffs).length ? ' (' + cleanBuffs(it.buffs).length + ')' : ''), 'aria-expanded': String(cur.buffOpen.has(it)), onclick: (e) => {
        bf.hidden = !bf.hidden; if (bf.hidden) cur.buffOpen.delete(it); else cur.buffOpen.add(it);
        e.currentTarget.setAttribute('aria-expanded', String(!bf.hidden));
      } }),
      h('button', { class: 'btn', type: 'button', text: 'GIVE', 'aria-expanded': 'false', onclick: (e) => {
        give.el.hidden = !give.el.hidden; e.currentTarget.setAttribute('aria-expanded', String(!give.el.hidden));
        if (!give.el.hidden) give.load();
      } }));
    const flags = h('div', { class: 'iflags' }, FLAGS.map(([k, label]) => {
      const cb = h('input', { type: 'checkbox', checked: !!it[k], 'aria-label': label });
      cb.addEventListener('change', () => { it[k] = cb.checked; if (k === 'wearable' && !cb.checked) it.eqB = false; touch(); rebuild('items'); });
      return h('label', { class: 'chk' }, cb, h('span', { text: label }));
    }));
    const desc = h('div', { class: 'idesc' }, flags, wp, mg, acts, bf, give.el, field('Description', growArea('items.' + i + '.desc', 'Item description')));
    const setOpen = (open) => {
      if (open) cur.itemOpen.add(it); else cur.itemOpen.delete(it);
      card.classList.toggle('open', open); desc.hidden = !open;
      chev.textContent = open ? 'v' : '>'; chev.setAttribute('aria-expanded', String(open));
    };
    const line = h('div', { class: 'iline' }, chev, name,
      h('span', { class: 'htag', text: held, title: HANDS.filter(([k]) => it[k]).map((x) => x[1]).join(' and ') }),
      qtyIn,
      chargesIn || h('span'),
      h('button', { class: 'btn small', type: 'button', text: 'REMOVE', onclick: () => {
        cur.ch.items.splice(i, 1); cur.itemOpen.delete(it); touch(); rebuild('items');
      } }));
    chev.addEventListener('click', () => setOpen(!cur.itemOpen.has(it)));
    line.addEventListener('click', (e) => { if (e.target === line) setOpen(!cur.itemOpen.has(it)); });   // the empty part of the line
    name.addEventListener('click', () => { if (!cur.itemOpen.has(it)) setOpen(true); });                    // tapping the name to edit it also shows the description
    card.append(line, desc);
    setOpen(cur.itemOpen.has(it));
    return card;
  }

  // Weapon properties card (shown while the item's Weapon box is ticked)
  function magicCard(i, getCharges) {
    const it = cur.ch.items[i];
    const maxIn = numIn('items.' + i + '.magicProps.maxCharges', 'Max Charges', '0');
    let prevMax = maxOf(it);
    maxIn.min = '0'; maxIn.step = '1';
    maxIn.addEventListener('input', () => {   // charges follow the max: a fresh (or full) item is set to the new max, never above it
      const mx = maxOf(it), ci = getCharges();
      if (it.charges == null || it.charges === '' || Number(it.charges) === prevMax) it.charges = mx;
      else if (Number(it.charges) > mx) it.charges = mx;
      prevMax = mx;
      if (ci) { ci.max = String(mx); ci.value = it.charges; }
      touch();
    });
    const spell = h('input', { type: 'checkbox', 'aria-label': 'Spellbook' });
    bind(spell, 'items.' + i + '.magicProps.spellbook', 'check');
    return h('div', { class: 'wprops' }, h('h4', { class: 'subsec', text: 'Magic' }), h('div', { class: 'wpgrid' },
      MAGIC_TEXT.map(([k, label]) => field(label, txtIn('items.' + i + '.magicProps.' + k, 'Magic ' + label, 200))),
      field('Max Charges', maxIn),
      h('label', { class: 'chk' }, spell, h('span', { text: 'Spellbook' })),
      h('div', { class: 'wp-wide' }, field('Effect', area('items.' + i + '.magicProps.effect', 'Magic Effect')))));
  }
  function weaponCard(i) {
    const it = cur.ch.items[i];
    if (!it.weaponProps || typeof it.weaponProps !== 'object') it.weaponProps = {};
    const fld = ([k, label]) => {
      const path = 'items.' + i + '.weaponProps.' + k;
      return k === 'effect' ? h('div', { class: 'wp-wide' }, field(label, area(path, 'Weapon ' + label)))
        : field(label, txtIn(path, 'Weapon ' + label, 200));
    };
    return h('div', { class: 'wprops' }, h('h4', { class: 'subsec', text: 'Weapon' }), h('div', { class: 'wpgrid' }, WEAPON_PROPS.map(fld)));
  }

  // Item buffs card: pick a talent or skill, give an amount (negative works), say whether the item must be held and/or worn.
  function buffCard(i) {
    const it = cur.ch.items[i];
    const card = h('div', { class: 'ibuffs', hidden: !cur.buffOpen.has(it) });
    const list = h('div', { class: 'ibl' });
    const sel = h('select', { 'aria-label': 'Which talent or skill' },
      h('optgroup', { label: 'Talents' }, BSH.TALENTS.map((t, k) => h('option', { value: 't' + k, text: t.name }))),
      h('optgroup', { label: 'Skills' }, BSH.SKILLS.map((t, k) => h('option', { value: 's' + k, text: t.name }))));
    const amt = h('input', { type: 'number', class: 'num', step: '1', placeholder: '+/-', 'aria-label': 'Amount to add (negative lowers it)' });
    const mkChk = (label) => { const cb = h('input', { type: 'checkbox', 'aria-label': label + ' buff' }); return { cb, el: h('label', { class: 'chk' }, cb, h('span', { text: label })) }; };
    const hold = mkChk('Hold'), wear = mkChk('Wear');
    const msg = h('span', { class: 'lbl', role: 'alert' });
    const redraw = () => {
      list.replaceChildren(...(it.buffs || []).map((b, k) => {
        const hb = mkChk('Hold'), wb = mkChk('Wear');
        hb.cb.checked = !!b.hold; wb.cb.checked = !!b.wear;
        const change = () => { b.hold = hb.cb.checked; b.wear = wb.cb.checked; touch(); rebuild('items'); };
        hb.cb.addEventListener('change', change); wb.cb.addEventListener('change', change);
        const on = BSH.itemBuffs({ items: [it] }).list.some((x) => x.kind === b.kind && x.idx === b.idx);
        return h('div', { class: 'ibrow' },
          h('b', { text: buffName(b) + ' ' + signedAmt(b.amt) }), h('span', { class: 'tag', text: on ? 'ACTIVE' : 'OFF' }),
          hb.el, wb.el,
          h('button', { class: 'btn small', type: 'button', text: 'REMOVE', onclick: () => { it.buffs.splice(k, 1); touch(); rebuild('items'); } }));
      }));
      if (!(it.buffs || []).length) list.append(h('p', { class: 'note', style: 'text-align:left;margin:0', text: 'No buffs yet.' }));
    };
    redraw();
    card.append(h('h4', { class: 'subsec', text: 'Item buffs' }), list,
      h('div', { class: 'row2' }, sel, amt),
      h('div', { class: 'row2' }, hold.el, wear.el,
        h('button', { class: 'btn small', type: 'button', text: 'ADD BUFF', onclick: () => {
          msg.textContent = '';
          const n = Number(amt.value);
          if (amt.value === '' || !Number.isFinite(n) || n === 0) { msg.textContent = 'Enter a number (not 0).'; return; }
          it.buffs = Array.isArray(it.buffs) ? it.buffs : [];
          it.buffs.push({ kind: sel.value[0] === 't' ? 'talent' : 'skill', idx: Number(sel.value.slice(1)), amt: n, hold: hold.cb.checked, wear: wear.cb.checked });
          touch(); rebuild('items');
        } })),
      msg,
      h('p', { class: 'note', style: 'text-align:left;margin:0', text: 'Hold = only while in a hand. Wear = only while on the body. Both ticked = either one works. Neither = always, while you carry it.' }));
    return card;
  }

  // "Give" form inside an item: pick a character in the same campaign and how many to hand over.
  function giveForm(i) {
    const it = cur.ch.items[i], ch = cur.ch;
    const el = h('div', { class: 'igive', hidden: true });
    const msg = h('span', { class: 'lbl', role: 'alert' });
    const sel = h('select', { 'aria-label': 'Give to which character' });
    const qty = h('input', { type: 'number', class: 'num', min: '1', step: '1', value: '1', 'aria-label': 'How many to give' });
    const send = h('button', { class: 'btn small', type: 'button', text: 'SEND', disabled: true });
    let people = [];
    if (!ch.campaignId) el.append(h('p', { class: 'note', style: 'text-align:left;margin:0', text: 'Link this character to a campaign (INFO tab) to give items to other characters.' }));
    else el.append(h('div', { class: 'row2' }, sel, qty, send), msg);
    const load = async () => {
      if (!ch.campaignId) return;
      msg.textContent = '';
      try {
        const g = state.campaigns.find((x) => x.id === ch.campaignId), qm = !!g && iAmQm(g);
        const rows = await backend.listCampaignCharacters(ch.campaignId);
        people = rows.filter((r) => r.ch.id !== ch.id && (qm || !r.ch.isNpc))
          .sort((x, y) => (x.ch.isNpc - y.ch.isNpc) || (x.ch.info.name || '').localeCompare(y.ch.info.name || ''));
        const nm = (r) => (r.ch.info.name || 'Unnamed character') + (r.ch.isNpc ? ' (NPC)' : r.mine ? ' (yours)' : ' (' + r.owner + ')');
        const keep = sel.value;
        sel.replaceChildren(h('option', { value: '', text: people.length ? 'Give to...' : 'No one else here yet' }),
          ...people.map((r) => h('option', { value: r.ch.id, text: nm(r) })));
        sel.value = people.some((r) => r.ch.id === keep) ? keep : '';
        send.disabled = !people.length;
      } catch (e) { msg.textContent = e.message; }
    };
    send.addEventListener('click', async () => {
      msg.textContent = '';
      const to = people.find((r) => r.ch.id === sel.value), n = Number(qty.value), have = effQty(it);
      if (!String(it.name || '').trim()) { msg.textContent = 'Name the item first.'; return; }
      if (!to) { msg.textContent = 'Choose who to give it to.'; return; }
      if (!Number.isInteger(n) || n < 1) { msg.textContent = 'Choose a quantity of at least 1.'; return; }
      if (n > have) { msg.textContent = 'You only have ' + have + '.'; return; }
      send.disabled = true;
      try {
        await backend.giveItem(ch.id, to.ch.id, { name: String(it.name).trim(), qty: n, charges: clampCharges(it), desc: it.desc || '',
          wearable: !!it.wearable, weapon: !!it.weapon, magic: !!it.magic, buffs: cleanBuffs(it.buffs), weaponProps: it.weapon ? cleanWeapon(it.weaponProps) : {},
          magicProps: it.magic ? cleanMagic(it.magicProps) : {} });
      } catch (e) { msg.textContent = e.message; send.disabled = false; return; }
      const left = have - n;
      if (left <= 0) { ch.items.splice(ch.items.indexOf(it), 1); cur.itemOpen.delete(it); } else it.qty = left;
      cur.itemNote = 'Gave ' + n + ' ' + itemLabel(it) + ' to ' + (to.ch.info.name || 'Unnamed character') + '.';
      touch(); rebuild('items');
    });
    return { el, load };
  }

  function panelItems() {
    const list = h('div', { id: 'itemList' }, cur.ch.items.map((_, i) => itemCard(i)));
    const inHand = ([k]) => { const x = cur.ch.items.find((t) => t[k]); return x ? itemLabel(x) : 'empty'; };
    const note = cur.itemNote; cur.itemNote = '';
    return [
      sec('Items'),
      note ? h('p', { class: 'msg', role: 'status', text: note }) : null,
      h('p', { class: 'note hands', id: 'handsLine', text: 'Left hand: ' + inHand(HANDS[0]) + '  ·  Right hand: ' + inHand(HANDS[1]) + '  ·  Body: ' + (cur.ch.items.filter((t) => t.eqB).map(itemLabel).join(', ') || 'nothing') }),
      (() => { const l = BSH.itemBuffs(cur.ch).list; return l.length ? h('p', { class: 'note hands', id: 'itemBuffLine', text: 'Item buffs: ' + l.map((b) => buffName(b) + ' ' + signedAmt(b.amt)).join(', ') }) : null; })(),
      cur.ch.items.length ? h('div', { class: 'iline ihead' }, h('span'), h('span', { text: 'Item' }), h('span'), h('span', { text: 'Qty' }), h('span', { text: 'Charges' }), h('span')) : null,
      list,
      h('button', { class: 'btn small', type: 'button', text: 'ADD ITEM', onclick: () => {
        cur.ch.items.push({ name: '', qty: null, charges: null, desc: '', wearable: false, weapon: false, magic: false, buffs: [], weaponProps: {}, magicProps: {} }); touch(); rebuild('items');
      } })
    ].filter(Boolean);
  }

  /* ----- ABILITIES / STYLES ----- */
  function abilityCard(i) {
    const ab = cur.ch.abilities[i];
    const card = h('div', { class: 'item' });
    const chev = h('button', { class: 'chev', type: 'button', 'aria-label': 'Show or hide the description' });
    const desc = h('div', { class: 'idesc' }, field('Description', growArea('abilities.' + i + '.desc', 'Ability description')));
    const name = nameIn('abilities.' + i + '.name', 'Ability name', 60);
    const setOpen = (open) => {
      if (open) cur.itemOpen.add(ab); else cur.itemOpen.delete(ab);
      card.classList.toggle('open', open); desc.hidden = !open;
      chev.textContent = open ? 'v' : '>'; chev.setAttribute('aria-expanded', String(open));
    };
    const line = h('div', { class: 'iline abl' }, chev, name,
      h('button', { class: 'btn small', type: 'button', text: 'REMOVE', onclick: () => {
        cur.ch.abilities.splice(i, 1); cur.itemOpen.delete(ab); touch(); rebuild('abilities');
      } }));
    chev.addEventListener('click', () => setOpen(!cur.itemOpen.has(ab)));
    line.addEventListener('click', (e) => { if (e.target === line) setOpen(!cur.itemOpen.has(ab)); });
    name.addEventListener('click', () => { if (!cur.itemOpen.has(ab)) setOpen(true); });
    card.append(line, desc);
    setOpen(cur.itemOpen.has(ab));
    return card;
  }
  // the picture used for this character's token on encounter maps (otherwise a coloured circle with the initiative number)
  function tokenImageField() {
    const edit = !cur.viewOnly, pic = cur.ch.tokenImage;
    const prev = h('span', { class: 'token-preview', id: 'tokenPreview', 'aria-label': pic ? 'Token picture' : 'No token picture' });
    const paint = () => { const p = cur.ch.tokenImage; prev.style.backgroundImage = p && /^data:image\//.test(p) ? 'url("' + p + '")' : ''; prev.classList.toggle('empty', !p); prev.textContent = p ? '' : 'NONE'; };
    paint();
    const msg = h('span', { class: 'lbl', id: 'tokenMsg', role: 'alert' });
    if (!edit) return h('div', { class: 'token-field' }, prev);
    const file = h('input', { type: 'file', id: 'tokenFile', accept: 'image/*', 'aria-label': 'Token picture' });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; if (!f) return;
      msg.textContent = '';
      try { cur.ch.tokenImage = await prepareTokenImage(f); touch(); paint(); } catch (e) { msg.textContent = e.message; }
      file.value = '';
    });
    return h('div', { class: 'token-field' }, prev, file,
      h('button', { class: 'btn small', type: 'button', id: 'tokenClear', text: 'REMOVE PICTURE', onclick: () => { delete cur.ch.tokenImage; touch(); paint(); } }), msg);
  }
  function panelAbilities() {
    return [
      sec('Abilities and fighting styles'),
      h('div', {}, cur.ch.abilities.map((_, i) => abilityCard(i))),
      h('button', { class: 'btn small', type: 'button', text: 'ADD ABILITY', onclick: () => {
        cur.ch.abilities.push({ name: '', desc: '' }); touch(); rebuild('abilities');
      } })
    ];
  }

  /* ----- STORY ----- */
  function panelStory() {
    return [
      sec('Appearance'), area('appearance', 'Appearance', 'What do they look like?'),
      sec('Backstory'), area('backstory', 'Backstory', 'Where do they come from?'),
      sec('Motivation'), area('motivation', 'Motivation', 'What drives them?')
    ];
  }

  // Rebuild one list panel after add/remove (keeps scroll position and other tabs untouched)
  function rebuild(id) {
    const y = window.scrollY;
    const fn = { items: panelItems, abilities: panelAbilities }[id];
    cur.panels[id].replaceChildren(...fn());
    window.scrollTo(0, y);
  }

  /* ----- Live calculation ----- */
  function refresh() {
    if (!cur) return;
    const ch = cur.ch, r = BSH.compute(ch), o = cur.outs;
    const set = (k, t) => { if (o[k]) o[k].textContent = t; };

    $('sheetTitle').textContent = ch.info.name || 'New character';
    r.skillMod.forEach((m, i) => set('skill.' + i, signed(m)));
    r.stat.forEach((v, i) => set('stat.' + i, fmt(v)));
    if (cur.hpIn && document.activeElement !== cur.hpIn) cur.hpIn.value = fmt(r.hpRemaining);
    set('hpTot', fmt(r.stat[0]));
    set('capAvail', fmt(r.capacityAvailable)); set('capTot', fmt(r.stat[11]));
    set('apTot', fmt(r.stat[4])); set('spTot', fmt(r.stat[1])); set('epTot', fmt(r.stat[5]));
    if (cur.apIn) cur.apIn.placeholder = fmt(r.stat[4]);
    if (cur.spIn) cur.spIn.placeholder = fmt(r.stat[1]);
    if (cur.epIn) cur.epIn.placeholder = fmt(r.stat[5]);
    set('talentLevel', fmt(r.talentLevel)); set('talentLevel2', fmt(r.talentLevel));
    set('profLevel', fmt(r.profLevel)); set('skillLevel', fmt(r.skillLevel));
    drawBars('class', r.classLevels, (i) => BSH.CLASSES[i].name);
    drawBars('sub', r.subLevels, (i) => BSH.CLASSES[Math.floor(i / 3)].subs[i % 3].name);
  }

  /* ================= Options (text size + color), kept on this device ================= */
  const SIZES = [['smallest', 'Smallest', -4], ['small', 'Small', -2], ['standard', 'Standard', 0], ['sizeable', 'Sizeable', 2], ['super', 'Super', 4]];
  const THEMES = {
    blood:      { name: 'Blood',          ink: '#7a2216', text: '#c9694f', dim: '#4a1a12', input: '#e5876c', ph: '#75301f' },
    melancholy: { name: 'Melancholy',     ink: '#1f4f96', text: '#5f93d6', dim: '#12294a', input: '#7fb0ee', ph: '#24508a' },
    greed:      { name: 'Greed',          ink: '#7a6212', text: '#cdae3a', dim: '#4a3c0c', input: '#e8c54a', ph: '#76601f' },
    infection:  { name: 'Infection',      ink: '#1f5a14', text: '#4fae3f', dim: '#123a0c', input: '#6cc85a', ph: '#2a5a1e' },
    freddy:     { name: "Freddy's Skin",  ink: '#6a4aa0', text: '#b9a0e6', dim: '#3a2a60', input: '#d1bdf2', ph: '#5a4690' }
  };
  const OPT_KEY = 'bsh.options';
  let options = { size: 'standard', color: 'blood' };
  try {
    const saved = JSON.parse(localStorage.getItem(OPT_KEY) || 'null');
    if (saved && SIZES.some((x) => x[0] === saved.size)) options.size = saved.size;
    if (saved && THEMES[saved.color]) options.color = saved.color;
  } catch (e) { /* storage unavailable: defaults for this visit */ }

  function applyOptions() {
    const root = document.documentElement, t = THEMES[options.color], sz = SIZES.find((x) => x[0] === options.size);
    root.style.setProperty('--fs', sz[2] + 'pt');
    root.dataset.size = options.size;
    root.dataset.theme = options.color;
    [['--ink', t.ink], ['--ink-text', t.text], ['--ink-dim', t.dim], ['--ink-input', t.input], ['--ink-ph', t.ph]]
      .forEach(([k, v]) => root.style.setProperty(k, v));
    if ($('screen-options') && !$('screen-options').hidden) renderOptions();
  }
  function setOption(key, value) {
    options[key] = value;
    try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch (e) { /* not saved, still applied */ }
    applyOptions();
  }
  function renderOptions() {
    $('sizeOpts').replaceChildren(...SIZES.map(([id, label, shift]) => h('button', {
      class: 'opt', type: 'button', 'aria-pressed': String(options.size === id), text: label,
      style: 'font-size: max(8px, calc(1rem + ' + shift + 'pt))', onclick: () => setOption('size', id) })));
    $('colorOpts').replaceChildren(...Object.entries(THEMES).map(([id, t]) => {
      const on = options.color === id;
      return h('button', { class: 'opt', type: 'button', 'aria-pressed': String(on), text: t.name,
        style: on ? 'background:' + t.ink + ';border-color:' + t.ink + ';color:#000' : 'border-color:' + t.ink + ';color:' + t.text,
        onclick: () => setOption('color', id) });
    }));
  }
  applyOptions();

  /* ================= Start up ================= */
  window.bshReady = (async () => {
    try {
      state.user = await backend.init();
      if (state.user) await loadChars();
    } catch (e) {
      state.user = null;
    }
    booted = true;
    const rec = backend.takeRecovery && backend.takeRecovery();   // came back from a password-recovery email?
    if (rec === 'ok' && state.user) history.replaceState(null, '', '#reset');
    else if (rec) { keepMsg = true; forgotMsg.textContent = 'That link has expired or was already used. Request a new one.'; history.replaceState(null, '', '#forgot'); }
    if (backend.mode === 'local') {
      const n = $('modeNote');
      n.textContent = 'Preview mode: accounts and characters are saved on this device only.';
      n.hidden = false;
      const wipe = confirmButton('ERASE PREVIEW DATA', 'TAP AGAIN TO ERASE EVERYTHING', async () => {
        await backend.wipe();
        state.user = null; state.chars = []; state.campaigns = [];
        wipe.textContent = 'ERASED'; wipe.disabled = true; route();
      });
      wipe.style.marginTop = '1rem';
      n.after(wipe);
    }
    route();
    pollCampaigns();
  })();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
