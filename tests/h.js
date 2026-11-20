// Shared test harness: builds the app into jsdom, with either the local backend or the real supabase-js client.
const fs = require('fs'), nodeCrypto = require('crypto');
const { JSDOM } = require('jsdom');
const dir = require('path').join(__dirname, '..') + '/';

function buildHtml({ supabaseUrl } = {}) {
  let html = fs.readFileSync(dir + 'index.html', 'utf8');
  const inline = (f, text) => { html = html.replace(`<script src="${f}"></script>`, () => '<script>' + text + '</script>'); };
  const read = (f) => fs.readFileSync(dir + f, 'utf8');
  if (supabaseUrl) {
    inline('vendor/supabase.js', read('vendor/supabase.js'));
    inline('config.js', `window.BSH_CONFIG = { supabaseUrl: ${JSON.stringify(supabaseUrl)}, supabaseKey: 'sb_publishable_TESTKEY' };`);
  } else {
    inline('vendor/supabase.js', ''); inline('config.js', '');
  }
  inline('engine.js', read('engine.js')); inline('backend.js', read('backend.js')); inline('rules.js', read('rules.js')); inline('spawndata.js', read('spawndata.js')); inline('app.js', read('app.js'));
  return html;
}

async function boot({ supabaseUrl, storage, hash = '', shared } = {}) {
  const errors = [];
  const dom = new JSDOM(buildHtml({ supabaseUrl }), { url: 'http://localhost/index.html' + hash, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false }); w.scrollTo = () => {};
      w.TextEncoder = TextEncoder; w.fetch = fetch; w.Headers = Headers; w.Request = Request; w.Response = Response;
      Object.defineProperty(w, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
      if (shared) {   // several 'devices' sharing one localStorage, except each keeps its own login session
        const own = {};
        const st = { getItem: (k) => (k === 'bsh.session' ? (k in own ? own[k] : null) : (k in shared ? shared[k] : null)),
          setItem: (k, v) => { (k === 'bsh.session' ? own : shared)[k] = String(v); },
          removeItem: (k) => { delete (k === 'bsh.session' ? own : shared)[k]; }, key: () => null, length: 0 };
        Object.defineProperty(w, 'localStorage', { value: st, configurable: true });
      }
      if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
      w.addEventListener('error', (e) => errors.push(e.message));
    } });
  const w = dom.window;
  w.__errors = errors;
  await w.bshReady;
  return w;
}

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000, step = 20) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch (e) { /* retry */ } await wait(step); }
  return false;
}
function api(w) {
  const d = w.document;
  const $ = (id) => d.getElementById(id);
  const a = {
    w, d, $,
    vis: () => ['loading', 'start', 'login', 'create', 'home', 'campaigns', 'createcampaign', 'joincampaign', 'campaign', 'spawn', 'maps', 'mapedit', 'mapview', 'characters', 'sheet','options', 'rules', 'forgot', 'reset'].filter((s) => !$('screen-' + s).hidden),
    click: (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
    setv: (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
    submit: (id) => $(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })),
    go: (name) => { w.location.hash = name; },
    byLabel: (panel, label) => d.querySelector(`#panel-${panel} [aria-label="${label}"]`),
    tab: (id) => a.click($('tab-' + id)),
    text: (sel) => d.querySelector(sel).textContent,
    storage: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; },
    async signUp({ name = 'Ricky', username = 'ricky_1', email = 'ricky@example.com', password = 'correct horse' } = {}) {
      a.go('create'); await wait();
      a.setv($('createName'), name); a.setv($('createUser'), username); a.setv($('createEmail'), email); a.setv($('createPass'), password);
      a.submit('createForm');
      await waitFor(() => a.vis().join() === 'home' || $('createMsg').textContent);
      return $('createMsg').textContent;
    },
    async logIn(username, password) {
      a.go('login'); await wait();
      a.setv($('loginUser'), username); a.setv($('loginPass'), password);
      a.submit('loginForm');
      await waitFor(() => a.vis().join() === 'home' || $('loginMsg').textContent);
      return $('loginMsg').textContent;
    },
    async logOut() { a.click($('logoutBtn')); await waitFor(() => a.vis().join() === 'start'); }
  };
  return a;
}
function checker() {
  let fails = 0, n = 0;
  const ok = (c, m) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  const done = () => { console.log(fails ? `${fails} FAILED of ${n}` : `ALL ${n} PASSED`); process.exit(fails ? 1 : 0); };
  return { ok, done };
}
module.exports = { boot, wait, waitFor, api, checker };
