// Minimal stand-in for Supabase: GoTrue auth + PostgREST tables, with the same row-level rules as schema.sql.
const http = require('http'), crypto = require('crypto');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(uid) { return `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`; }
const uidOf = (req) => { try { return JSON.parse(Buffer.from((req.headers.authorization || '').replace('Bearer ', '').split('.')[1], 'base64url')).sub; } catch { return null; } };

function createMock() {
  var mockOrder;
  const db = { users: [], profiles: [], characters: [], campaigns: [], members: [], gifts: [], events: [], maps: [], tokens: [], log: [], failSaves: false };
  mockOrder = (g, rnd) => {
    const I = g.encounter.initiatives, R = rnd || g.encounter.round || 1, slots = {};
    db.characters.filter((c) => c.campaign_id === g.id && I[c.id]).forEach((c) => { slots[c.id] = I[c.id]; });
    db.events.filter((e) => e.campaign_id === g.id && (!e.one_time || e.round === R)).forEach((e) => { slots[e.id] = e; });
    return Object.keys(slots).sort((a, b) => (slots[b].total - slots[a].total) || ((slots[b].tb || 0) - (slots[a].tb || 0)) || (a < b ? -1 : 1));
  };
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const url = new URL(req.url, 'http://x'); const p = url.pathname;
      const body = raw ? JSON.parse(raw) : null;
      db.log.push({ method: req.method, path: p, query: url.search, body, apikey: req.headers.apikey, auth: req.headers.authorization, prefer: req.headers.prefer });
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
      const sessionFor = (u) => ({ access_token: jwt(u.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id,
        user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.meta, app_metadata: {}, created_at: new Date().toISOString() } });
      const me = uidOf(req);

      if (p === '/rest/v1/rpc/username_available') return send(200, !db.profiles.some((x) => x.username.toLowerCase() === String(body.p_username).toLowerCase()));
      if (p === '/rest/v1/rpc/login_email') {
        const pr = db.profiles.find((x) => x.username.toLowerCase() === String(body.p_username).toLowerCase());
        const u = pr && db.users.find((x) => x.id === pr.id);
        return send(200, u ? u.email : null);
      }
      if (p === '/rest/v1/rpc/create_npc') {
        if (!me) return send(401, { message: 'JWT required' });
        if (!db.members.some((m) => m.campaign_id === body.p_campaign && m.user_id === me && m.role === 'qm')) return send(400, { code: 'P0001', message: 'Only a QM can create NPCs.' });
        if (db.characters.some((c) => c.id === body.p_id)) return send(409, { code: '23505', message: 'duplicate key value' });
        const now = new Date().toISOString();
        db.characters.push({ id: body.p_id, owner: me, data: body.p_data, campaign_id: body.p_campaign, is_npc: true, npc_visible: false, created_at: now, updated_at: now });
        return send(200, body.p_id);
      }
      if (p === '/rest/v1/rpc/give_character') {
        if (!me) return send(401, { message: 'JWT required' });
        const c = db.characters.find((x) => x.id === body.p_character);
        const P = (message) => send(400, { code: 'P0001', message });
        if (!c || c.owner !== me) return P('You can only hand over your own characters.');
        if (c.is_npc) return P('An NPC cannot be handed over.');
        if (!c.campaign_id) return P('Link the character to a campaign before handing it over.');
        if (!db.members.some((m) => m.campaign_id === c.campaign_id && m.user_id === body.p_player)) return P('That player is not in the campaign.');
        c.owner = body.p_player; c.updated_at = new Date().toISOString();
        return send(204);
      }
      if (p === '/rest/v1/rpc/give_item') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const it = body.p_item || {}, nm = String(it.name || '').trim(), q = Number(it.qty);
        if (!nm) return P('Give the item a name first.');
        if (!Number.isInteger(q) || q < 1 || q > 9999) return P('Choose a quantity of at least 1.');
        const to = db.characters.find((x) => x.id === body.p_to);
        const isM = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me);
        const isQ = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
        if (!to || !to.campaign_id || !isM(to.campaign_id)) return P('That character is not in your campaign.');
        let who = 'The QM';
        if (body.p_from) {
          if (body.p_from === body.p_to) return P('Choose a different character.');
          const f = db.characters.find((x) => x.id === body.p_from);
          if (!f || f.owner !== me) return P('You can only give items from your own characters.');
          if (f.campaign_id !== to.campaign_id) return P('Both characters must be in the same campaign.');
          who = String((f.data.info || {}).name || '').trim() || 'Someone';
        } else if (!isQ(to.campaign_id)) return P('Only a QM can give items from nowhere.');
        if (to.is_npc && !isQ(to.campaign_id)) return P('Only a QM can give items to NPCs.');
        db.gifts.push({ id: crypto.randomUUID(), character_id: to.id, from_name: who, created_at: new Date().toISOString(),
          item: { name: nm.slice(0, 60), qty: q, charges: it.charges == null ? null : it.charges, desc: String(it.desc || '').slice(0, 4000),
          wearable: it.wearable === true || it.wearable === 'true', weapon: it.weapon === true || it.weapon === 'true', magic: it.magic === true || it.magic === 'true',
          weaponProps: it.weaponProps && typeof it.weaponProps === 'object' ? it.weaponProps : {},
          magicProps: it.magicProps && typeof it.magicProps === 'object' ? it.magicProps : {},
          buffs: Array.isArray(it.buffs) && it.buffs.length <= 30 ? it.buffs : [] } });
        return send(204);
      }
      if (p === '/rest/v1/item_gifts') {
        if (!me) return send(401, { message: 'JWT required' });
        const mineGift = (gf) => db.characters.some((c) => c.id === gf.character_id && c.owner === me);   // RLS: the receiving character's owner only
        if (req.method === 'GET') return send(200, db.gifts.filter(mineGift));
        if (req.method === 'DELETE') {
          const m = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') || ''), ids = m ? m[1].split(',') : [];
          db.gifts = db.gifts.filter((gf) => !(ids.includes(gf.id) && mineGift(gf)));
          return send(204);
        }
        return send(403, { code: '42501', message: 'permission denied for table item_gifts' });
      }
      if (/\/rest\/v1\/rpc\/(start_attack|resolve_attack|cancel_attack|set_combo|cancel_combo|combo_leader_attack|cancel_combo_attack)$/.test(p)) {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const kind = p.split('/').pop();
        const qmOf = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
        if (kind === 'start_attack') {
          const a = db.characters.find((x) => x.id === body.p_attacker), t = db.characters.find((x) => x.id === body.p_target);
          if (!a || !a.campaign_id || !t || t.campaign_id !== a.campaign_id) return P('Both characters must be in the same campaign.');
          const g = db.campaigns.find((x) => x.id === a.campaign_id);
          if (!g || !g.encounter) return P('Attacks can only be made during an encounter.');
          if (a.owner !== me && !qmOf(a.campaign_id)) return P('You can only attack with your own characters.');
          if (t.is_npc && !qmOf(a.campaign_id) && (!t.npc_visible || t.npc_sheet_hidden)) return P('You cannot attack that character.');
          if (g.encounter.attack) return P('Another attack is waiting for a response.');
          const id = 'atk-' + Math.random().toString(16).slice(2);
          const e = Object.assign({}, g.encounter); delete e.lastAttack;
          e.attack = { id, attacker: body.p_attacker, target: body.p_target, total: body.p_total, power: body.p_power, text: String(body.p_text || '').slice(0, 300) };
          if (body.p_combo) {
            const cb = (e.combos || {})[body.p_combo];
            if (!cb || cb.finisher !== body.p_attacker) return P('That combo is not waiting for this character.');
            if (body.p_target === body.p_combo || body.p_target === body.p_attacker) return P('Pick someone else to attack.');
            e.attack.combo = Object.assign({}, cb, { state: 'leader' });
            e.combos = Object.assign({}, e.combos); delete e.combos[body.p_combo];
          }
          g.encounter = e;
          return send(200, id);
        }
        if (kind === 'set_combo') {
          const l = db.characters.find((x) => x.id === body.p_leader), f = db.characters.find((x) => x.id === body.p_finisher);
          if (!['Battlewise', 'Intimidate', 'Athletics', 'Acrobatics', 'Grappling', 'Tracking', 'Courage', 'Handling'].includes(body.p_skill)) return P('That is not a combo skill.');
          if (body.p_leader === body.p_finisher) return P('Pick another character as the Finisher.');
          if (!l || !l.campaign_id || !f || f.campaign_id !== l.campaign_id) return P('Both characters must be in the same campaign.');
          if (l.owner !== me && !qmOf(l.campaign_id)) return P('You can only start a combo with your own characters.');
          const g2 = db.campaigns.find((x) => x.id === l.campaign_id);
          if (!g2 || !g2.encounter) return P('Combo Attacks can only be made during an encounter.');
          const ord = mockOrder(g2);
          if (!ord.includes(l.id) || !ord.includes(f.id)) return P('Both characters must be in the encounter.');
          g2.encounter = Object.assign({}, g2.encounter, { combos: Object.assign({}, g2.encounter.combos, { [l.id]: { leader: l.id, finisher: f.id, skill: body.p_skill, level: body.p_level, total: body.p_total, text: String(body.p_text || '').slice(0, 300) } }) });
          return send(204);
        }
        if (kind === 'cancel_combo') {
          const l = db.characters.find((x) => x.id === body.p_leader);
          if (!l || !l.campaign_id) return P('That character is not in a campaign.');
          const g2 = db.campaigns.find((x) => x.id === l.campaign_id), cb = g2 && g2.encounter && g2.encounter.combos && g2.encounter.combos[l.id];
          if (!cb) return send(204);
          const f = db.characters.find((x) => x.id === cb.finisher);
          if (l.owner !== me && !(f && f.owner === me) && !qmOf(l.campaign_id)) return P('You cannot cancel that combo.');
          const e = Object.assign({}, g2.encounter, { combos: Object.assign({}, g2.encounter.combos) }); delete e.combos[l.id]; g2.encounter = e;
          if (l.owner !== me) { const v = (l.data || {}).vitals || {}; const ap = v.apRemaining == null || v.apRemaining === '' ? null : Number(v.apRemaining); if (ap !== null) l.data = Object.assign({}, l.data, { vitals: Object.assign({}, v, { apRemaining: ap + 3 }) }); }
          return send(204);
        }
        const g = db.campaigns.find((x) => x.id === body.p_campaign), at = g && g.encounter && g.encounter.attack;
        if (kind === 'combo_leader_attack') {
          if (!at || at.id !== body.p_attack || !at.combo || at.combo.state !== 'leader') return P('That combo attack is not waiting for the Leader.');
          const l = db.characters.find((x) => x.id === at.combo.leader);
          if (!l || l.owner !== me && !qmOf(g.id)) return P("Only the Leader's player can roll for them.");
          g.encounter = Object.assign({}, g.encounter, { attack: Object.assign({}, at, { combo: Object.assign({}, at.combo, { state: 'defend', lTotal: body.p_total, lPower: body.p_power, lText: String(body.p_text || '').slice(0, 300) }) }) });
          return send(204);
        }
        if (kind === 'cancel_combo_attack') {
          if (!at || at.id !== body.p_attack || !at.combo || at.combo.state !== 'leader') return send(204);
          const f = db.characters.find((x) => x.id === at.attacker), l = db.characters.find((x) => x.id === at.combo.leader);
          if (!(f && f.owner === me) && !(l && l.owner === me) && !qmOf(g.id)) return P('You cannot call that off.');
          const e = Object.assign({}, g.encounter); delete e.attack; e.lastAttack = { id: at.id, attacker: at.attacker, target: at.target, text: 'The combo attack was called off.' }; g.encounter = e;
          return send(204);
        }
        if (kind === 'cancel_attack') {
          if (!at) return send(204);
          const ours = db.characters.some((x) => (x.id === at.attacker || x.id === at.target) && x.owner === me);
          if (!qmOf(g.id) && !ours) return P('You cannot cancel that attack.');
          const e = Object.assign({}, g.encounter); delete e.attack; e.lastAttack = { id: at.id, attacker: at.attacker, target: at.target, text: 'The attack was called off.' };
          g.encounter = e; return send(204);
        }
        if (!at || at.id !== body.p_attack) return P('That attack is no longer waiting.');
        const t = db.characters.find((x) => x.id === at.target);
        if (t.owner !== me && !qmOf(g.id)) return P("Only the target's player can answer this attack.");
        if (at.combo && at.combo.state !== 'defend') return P('The combo partner has not rolled yet.');
        (body.p_crit_fail || []).forEach((id) => {
          if (id !== at.attacker && !(at.combo && id === at.combo.leader)) return;
          const ch = db.characters.find((x) => x.id === id);
          if (ch && ch.campaign_id === g.id) ch.data = Object.assign({}, ch.data, { vitals: Object.assign({}, (ch.data || {}).vitals, { apPenalty: 2 }) });
        });
        const ofAtk = (id) => id === at.attacker || !!(at.combo && id === at.combo.leader);
        (body.p_used_crit || []).filter(ofAtk).forEach((id) => { const ch = db.characters.find((x) => x.id === id); if (ch && ch.campaign_id === g.id) { const v = Object.assign({}, (ch.data || {}).vitals); delete v.nextCrit; ch.data = Object.assign({}, ch.data, { vitals: v }); } });
        (body.p_next_crit || []).filter(ofAtk).forEach((id) => { const ch = db.characters.find((x) => x.id === id); if (ch && ch.campaign_id === g.id) ch.data = Object.assign({}, ch.data, { vitals: Object.assign({}, (ch.data || {}).vitals, { nextCrit: true }) }); });
        if (body.p_damage > 0) { const v = (t.data || {}).vitals || {}; t.data = Object.assign({}, t.data, { vitals: Object.assign({}, v, { damage: (Number(v.damage) || 0) + body.p_damage }) }); }
        const e = Object.assign({}, g.encounter); delete e.attack; e.lastAttack = { id: at.id, attacker: at.attacker, target: at.target, text: String(body.p_text || '').slice(0, 500) };
        g.encounter = e; return send(204);
      }
      if (p === '/rest/v1/rpc/set_explode_tokens') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const c = db.characters.find((x) => x.id === body.p_character);
        if (!c) return P('That character does not exist.');
        if (!Number.isInteger(body.p_value) || body.p_value < 0 || body.p_value > 10) return P('A character can hold 0 to 10 Explode Tokens.');
        const qm = c.campaign_id && db.members.some((m) => m.campaign_id === c.campaign_id && m.user_id === me && m.role === 'qm');
        if (c.owner !== me && !qm) return P('You can only change your own characters.');
        c.data = Object.assign({}, c.data, { info: Object.assign({}, (c.data || {}).info, { explodeTokens: body.p_value }) });
        return send(204);
      }
      if (p === '/rest/v1/rpc/qm_deal_damage') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        if (!db.members.some((m) => m.campaign_id === body.p_campaign && m.user_id === me && m.role === 'qm')) return P('Only a QM can do that.');
        if (!(body.p_amount >= 0) || body.p_amount > 100000) return P('That number is not valid.');
        const t = db.characters.find((x) => x.id === body.p_target);
        if (!t || t.campaign_id !== body.p_campaign) return P('That character is not in this campaign.');
        const v = (t.data || {}).vitals || {};
        t.data = Object.assign({}, t.data, { vitals: Object.assign({}, v, { damage: (Number(v.damage) || 0) + body.p_amount }) });
        return send(204);
      }
      if (p === '/rest/v1/rpc/deal_damage') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const a = db.characters.find((x) => x.id === body.p_attacker), t = db.characters.find((x) => x.id === body.p_target);
        if (!a || !a.campaign_id || !t || t.campaign_id !== a.campaign_id) return P('Both characters must be in the same campaign.');
        const g = db.campaigns.find((x) => x.id === a.campaign_id);
        if (!g || !g.encounter) return P('Attacks can only be made during an encounter.');
        const qm = db.members.some((m) => m.campaign_id === a.campaign_id && m.user_id === me && m.role === 'qm');
        if (a.owner !== me && !qm) return P('You can only attack with your own characters.');
        if (t.is_npc && !qm && (!t.npc_visible || t.npc_sheet_hidden)) return P('You cannot attack that character.');
        if (!(body.p_amount >= 0)) return P('That number is not valid.');
        const v = (t.data || {}).vitals || {};
        t.data = Object.assign({}, t.data, { vitals: Object.assign({}, v, { damage: (Number(v.damage) || 0) + body.p_amount }) });
        return send(204);
      }
      if (p === '/rest/v1/rpc/set_vital' || p === '/rest/v1/rpc/start_turn') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const c = db.characters.find((x) => x.id === body.p_character);
        if (!c || !c.campaign_id) return P('That character is not in a campaign.');
        const g = db.campaigns.find((x) => x.id === c.campaign_id), e = g && g.encounter;
        const qm = db.members.some((m) => m.campaign_id === c.campaign_id && m.user_id === me && m.role === 'qm');
        if (p.endsWith('set_vital')) {
          if (!['apRemaining', 'spRemaining'].includes(body.p_key)) return P('That cannot be changed this way.');
          if (!e) return P('Points can only be spent during an encounter.');
          if (c.owner !== me && !qm) return P('You can only spend points for your own characters.');
          c.data = Object.assign({}, c.data, { vitals: Object.assign({}, (c.data || {}).vitals, { [body.p_key]: body.p_value }) });
          return send(204);
        }
        if (!e || !(e.seq > 0) || e.turn !== c.id) return send(200, { applied: false });
        if (c.owner !== me && !qm) return P('You can only do this for your own characters.');
        const mark = e.id + ':' + e.seq, v = (c.data || {}).vitals || {};
        if (v.turnMark === mark) return send(200, { applied: false });
        const ap = v.apRemaining == null || v.apRemaining === '' ? null : Number(v.apRemaining), sp = v.spRemaining == null || v.spRemaining === '' ? body.p_sp_max : Number(v.spRemaining);
        const gain = ap !== null && ap <= 0 ? 0 : body.p_sp_gain, nsp = Math.min(body.p_sp_max, Math.max(sp, sp + gain));
        const nv = Object.assign({}, v, { apRemaining: null, spRemaining: nsp, turnMark: mark });
        if ((Number(v.apPenalty) || 0) > 0) { if (typeof body.p_ap_max === 'number') nv.apRemaining = Math.max(0, body.p_ap_max - Number(v.apPenalty)); delete nv.apPenalty; }
        c.data = Object.assign({}, c.data, { vitals: nv });
        return send(200, { applied: true, spGain: nsp - sp, apRestored: ap !== null && ap > 0, sp: nsp, apRemaining: nv.apRemaining == null ? null : nv.apRemaining });
      }
      if (p === '/rest/v1/rpc/start_encounter' || p === '/rest/v1/rpc/end_encounter' || p === '/rest/v1/rpc/set_initiative' || p === '/rest/v1/rpc/advance_turn' || p === '/rest/v1/rpc/assign_turn') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const g = db.campaigns.find((x) => x.id === body.p_campaign);
        const qm = !!g && db.members.some((m) => m.campaign_id === g.id && m.user_id === me && m.role === 'qm');
        if (p.endsWith('start_encounter')) {
          if (!qm) return P('Only a QM can start an encounter.');
          if (g.encounter) return P('An encounter is already active.');
          db.events = db.events.filter((e) => e.campaign_id !== g.id); db.tokens = db.tokens.filter((t) => t.campaign_id !== g.id);
          g.encounter = { id: crypto.randomUUID(), startedAt: Date.now(), round: 1, seq: 0, moved: false, initiatives: {} };
          return send(204);
        }
        const orderOf = (rnd) => mockOrder(g, rnd);
        if (p.endsWith('advance_turn')) {
          if (!g || !g.encounter) return P('There is no active encounter.');
          const ord = orderOf(); if (!ord.length) return P('Nobody has rolled initiative yet.');
          const cur = g.encounter.turn || null; if (cur !== body.p_from) return P('The turn has already moved on.');
          const own = (db.characters.find((c) => c.id === cur) || {}).owner;
          if (!qm && own !== me) return P('It is not your turn.');
          const idx = ord.indexOf(cur);
          if (idx < 0) g.encounter.turn = ord[0]; else if (idx >= ord.length - 1) { const rnd = (g.encounter.round || 1) + 1; g.encounter.round = rnd; g.encounter.turn = orderOf(rnd)[0] || cur; } else g.encounter.turn = ord[idx + 1];
          if (g.encounter.combos) { g.encounter.combos = Object.assign({}, g.encounter.combos); delete g.encounter.combos[g.encounter.turn]; }
          g.encounter.moved = true; g.encounter.seq = (g.encounter.seq || 0) + 1; return send(204);
        }
        if (p.endsWith('assign_turn')) {
          if (!qm) return P('Only a QM can assign a turn.');
          if (!g.encounter) return P('There is no active encounter.');
          if (!orderOf().includes(body.p_character)) return P('That character has not rolled initiative yet.');
          if (g.encounter.combos) { g.encounter.combos = Object.assign({}, g.encounter.combos); delete g.encounter.combos[body.p_character]; }
          g.encounter.turn = body.p_character; g.encounter.moved = true; g.encounter.seq = (g.encounter.seq || 0) + 1; return send(204);
        }
        if (p.endsWith('end_encounter')) { if (!qm) return P('Only a QM can end an encounter.'); g.encounter = null; db.characters.forEach((ch) => { if (ch.campaign_id === g.id && ((ch.data || {}).vitals || {}).nextCrit) { const v = Object.assign({}, ch.data.vitals); delete v.nextCrit; ch.data = Object.assign({}, ch.data, { vitals: v }); } }); db.events = db.events.filter((e) => e.campaign_id !== g.id); db.tokens = db.tokens.filter((t) => t.campaign_id !== g.id); return send(204); }
        if (!Number.isInteger(body.p_die) || body.p_die < 1 || body.p_die > 20) return P('The d20 roll must be between 1 and 20.');
        if (!g || !g.encounter) return P('There is no active encounter.');
        const c = db.characters.find((x) => x.id === body.p_character);
        if (!c || c.campaign_id !== g.id) return P('That character is not in this campaign.');
        if (c.is_npc ? !qm : (c.owner !== me && !qm)) return P(c.is_npc ? 'Only a QM can roll for an NPC.' : 'You can only roll for your own characters.');
        if (!qm && g.encounter.initiatives[c.id]) return P('Initiative is already set for that character.');
        const total = body.p_die + body.p_ib + (body.p_die === 1 ? -5 : body.p_die === 20 ? 5 : 0);
        g.encounter.initiatives[c.id] = { die: body.p_die, ib: body.p_ib, total, tb: Math.random(), by: c.owner === me ? 'player' : 'qm' };
        if (!g.encounter.moved) g.encounter.turn = orderOf()[0] || null;
        return send(204);
      }
      if (/^\/rest\/v1\/rpc\/(start_spawn|spawn_submit|spawn_points|spawn_incarnation|spawn_veto|cancel_spawn|finish_spawn)$/.test(p)) {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const g = db.campaigns.find((x) => x.id === body.p_campaign);
        const member = !!g && db.members.some((m) => m.campaign_id === g.id && m.user_id === me);
        const qm = !!g && db.members.some((m) => m.campaign_id === g.id && m.user_id === me && m.role === 'qm');
        const STEPS = ['appearance', 'ability', 'style', 'weapon', 'backstory', 'motivation', 'points'], SIZES = { 1: 20, 2: 8, 3: 12 };
        const opts = (n) => { const a = Math.floor(Math.random() * n); let b; do { b = Math.floor(Math.random() * n); } while (b === a); return [a, b]; };
        const enter = (sp) => { sp.step = STEPS[sp.pos]; if (sp.pos <= 5) sp.turn = sp.order[sp.pos % sp.order.length]; else delete sp.turn; if (SIZES[sp.pos]) sp.options = opts(SIZES[sp.pos]); else delete sp.options; return sp; };
        const sp = g && g.spawn, fn = p.split('/').pop();
        if (fn === 'start_spawn') {
          if (!qm) return P('Only a QM can spawn a character.');
          if (sp) return P('A character is already being spawned.');
          const fr = [...new Set(body.p_for || [])];
          if (fr.some((u) => !db.members.some((m) => m.campaign_id === g.id && m.user_id === u))) return P('That player is not in the campaign.');
          const order = db.members.filter((m) => m.campaign_id === g.id && m.role !== 'qm').map((m) => m.user_id).sort(() => Math.random() - 0.5);
          if (!order.length) return P('There are no players to build a character.');
          g.spawn = enter({ id: crypto.randomUUID(), startedAt: Date.now(), qm: me, for: fr, order, pos: 0, data: {}, points: {}, seq: 0 }); return send(204);
        }
        if (fn === 'spawn_submit') {
          if (!member) return P('You are not in this campaign.'); if (!sp) return P('No character is being spawned.');
          if (!STEPS.slice(0, 6).includes(sp.step)) return P('That step is not open.'); if (sp.turn !== me) return P('It is not your turn.');
          const v = body.p_value;
          if (sp.pos >= 1 && sp.pos <= 3) { if (v !== 0 && v !== 1) return P('Pick one of the two options.'); sp.data[sp.step] = sp.options[v]; }
          else { if (typeof v !== 'string' || !v.trim()) return P('Write something first.'); if (v.trim().length > 1000) return P('That is too long.'); sp.data[sp.step] = v.trim(); }
          sp.pos += 1; sp.seq += 1; enter(sp); return send(204);
        }
        if (fn === 'spawn_points') {
          if (!member) return P('You are not in this campaign.'); if (!sp) return P('No character is being spawned.');
          if (sp.step !== 'points') return P('That step is not open.'); if (!sp.order.includes(me)) return P('The QM does not add points.');
          if (sp.points[me]) return P('You have already added your points.');
          const k = body.p_picks;
          if (!Array.isArray(k) || k.length !== 4) return P('Make all four sets of picks.');
          for (const x of k) { if (!x || !Number.isInteger(x.up) || !Number.isInteger(x.down) || !Number.isInteger(x.prof) || x.up < 0 || x.up > 8 || x.down < 0 || x.down > 8 || x.prof < 0 || x.prof > 35) return P('Those picks are not valid.'); if (x.up === x.down) return P('Add and subtract from different talents.'); }
          sp.points[me] = k.map((x) => ({ up: x.up, down: x.down, prof: x.prof })); sp.seq += 1;
          if (sp.order.every((u) => sp.points[u])) {
            sp.charId = crypto.randomUUID();
            if (sp.for.length) { sp.assignee = sp.for[Math.floor(Math.random() * sp.for.length)];
              sp.dead = db.characters.filter((c) => c.campaign_id === g.id && c.owner === sp.assignee && !c.is_npc && (c.data.info || {}).alive === false).map((c) => ({ id: c.id, name: (c.data.info || {}).name || '', incarnation: (c.data.info || {}).incarnation == null ? null : c.data.info.incarnation }));
              sp.step = sp.dead.length ? 'incarnation' : 'build'; } else sp.step = 'build';
            delete sp.turn; delete sp.options;
          }
          return send(204);
        }
        if (fn === 'spawn_incarnation') {
          if (!sp || sp.step !== 'incarnation') return P('That step is not open.'); if (sp.assignee !== me) return P('This character is not yours.');
          if (body.p_prev) { const d = sp.dead.find((x) => x.id === body.p_prev); if (!d) return P('Pick one of your fallen characters.'); sp.prev = { id: d.id, incarnation: d.incarnation }; }
          sp.step = 'build'; sp.seq += 1; return send(204);
        }
        if (fn === 'spawn_veto') {
          if (!qm) return P('Only a QM can do that.'); if (!sp) return P('No character is being spawned.');
          if (!STEPS.includes(sp.step)) return P('It is too late to send it back.'); if (sp.pos === 0) return P('There is nothing to send back yet.');
          sp.points = {}; delete sp.data[STEPS[sp.pos - 1]]; sp.pos -= 1; sp.seq += 1; enter(sp); return send(204);
        }
        if (fn === 'cancel_spawn') { if (!qm) return P('Only a QM can cancel it.'); g.spawn = null; return send(204); }
        if (!member) return P('You are not in this campaign.'); if (!sp) return send(204);
        if (sp.step !== 'build') return P('The character is not ready yet.');
        let ok;
        if (sp.assignee) { if (sp.assignee !== me) return P('This character is not yours.'); ok = db.characters.some((c) => c.id === sp.charId && c.owner === me && c.campaign_id === g.id && !c.is_npc); }
        else { if (!qm) return P('Only a QM can finish an NPC.'); ok = db.characters.some((c) => c.id === sp.charId && c.campaign_id === g.id && c.is_npc); }
        if (!ok) return P('The character has not been saved yet.');
        g.spawn = null; return send(204);
      }
      if (p === '/rest/v1/encounter_maps' && req.method === 'GET') {
        if (!me) return send(401, { message: 'JWT required' });
        const eqp = (k) => { const v = url.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
        const cols = (url.searchParams.get('select') || '*').split(',');
        const isQ = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
        const isM = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me);
        let rows = db.maps.filter((m) => (isQ(m.campaign_id) || ((m.visible || ((db.campaigns.find((c) => c.id === m.campaign_id) || {}).encounter || {}).mapId === m.id) && isM(m.campaign_id))) && (!eqp('campaign_id') || m.campaign_id === eqp('campaign_id')) && (!eqp('id') || m.id === eqp('id')));
        rows = rows.map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => cols.includes('*') || cols.includes(k))));
        if ((req.headers.accept || '').includes('pgrst.object')) return rows.length === 1 ? send(200, rows[0]) : send(406, { message: 'JSON object requested, multiple (or no) rows returned' });
        return send(200, rows);
      }
      if (p === '/rest/v1/rpc/save_map' || p === '/rest/v1/rpc/set_map_visible' || p === '/rest/v1/rpc/delete_map') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const isQ = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
        if (p.endsWith('save_map')) {
          const b = body, nm = String(b.p_name || '').trim(), isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
          if (!isQ(b.p_campaign)) return P('Only a QM can make maps.');
          if (!nm) return P('Give the map a name first.');
          if (!isInt(b.p_cols, 1, 200) || !isInt(b.p_rows, 1, 200)) return P('The grid needs 1 to 200 columns and rows.');
          if (!(b.p_size >= 4 && b.p_size <= 4000)) return P('That square size is not valid.');
          if (!(Math.abs(b.p_ox) <= 8000 && Math.abs(b.p_oy) <= 8000)) return P('That grid position is not valid.');
          let rec = b.p_id && db.maps.find((m) => m.id === b.p_id && m.campaign_id === b.p_campaign);
          if (b.p_id && !rec) return P('That map is gone.');
          if (b.p_image) { if (!/^data:image\/[a-z]+;base64,/.test(b.p_image)) return P('Pick a picture first.'); if (b.p_image.length > 2500000) return P('That picture is too big.'); }
          else if (!rec) return P('Pick a picture first.');
          if (!rec) { rec = { id: crypto.randomUUID(), campaign_id: b.p_campaign, visible: false, created_at: new Date().toISOString() }; db.maps.push(rec); }
          if (b.p_image) { rec.image = b.p_image; rec.img_w = b.p_img_w; rec.img_h = b.p_img_h; }
          Object.assign(rec, { name: nm, cols: b.p_cols, rows: b.p_rows, size: b.p_size, ox: b.p_ox, oy: b.p_oy });
          return send(200, rec.id);
        }
        const m = db.maps.find((x) => x.id === body.p_map);
        if (!m || !isQ(m.campaign_id)) return P(p.endsWith('delete_map') ? 'Only a QM can delete a map.' : 'Only a QM can show or hide a map.');
        if (p.endsWith('delete_map')) { const gg = db.campaigns.find((c) => c.id === m.campaign_id); if (gg && gg.encounter && gg.encounter.mapId === m.id) { delete gg.encounter.mapId; db.tokens = db.tokens.filter((t) => t.campaign_id !== gg.id); } db.maps = db.maps.filter((x) => x !== m); } else m.visible = !!body.p_visible;
        return send(204);
      }
      if (p === '/rest/v1/rpc/set_encounter_map') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const g = db.campaigns.find((x) => x.id === body.p_campaign);
        if (!g || !db.members.some((m) => m.campaign_id === g.id && m.user_id === me && m.role === 'qm')) return P('Only a QM can add a map.');
        if (!g.encounter) return P('There is no active encounter.');
        if (g.encounter.mapId !== body.p_map && !(body.p_map == null && !g.encounter.mapId)) db.tokens = db.tokens.filter((t) => t.campaign_id !== g.id);
        if (body.p_map == null) delete g.encounter.mapId;
        else { if (!db.maps.some((m) => m.id === body.p_map && m.campaign_id === g.id)) return P('That map is gone.'); g.encounter.mapId = body.p_map; }
        return send(204);
      }
      if (p === '/rest/v1/encounter_tokens' && req.method === 'GET') {
        if (!me) return send(401, { message: 'JWT required' });
        const cidq = (url.searchParams.get('campaign_id') || '').replace('eq.', '');
        const isQ = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
        const isM = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me);
        return send(200, db.tokens.filter((t) => (!cidq || t.campaign_id === cidq) && (isQ(t.campaign_id) || (isM(t.campaign_id) && (() => { const c = db.characters.find((x) => x.id === t.character_id); return c && c.campaign_id === t.campaign_id && (!c.is_npc || c.npc_visible); })())))
          .map((t) => ({ character_id: t.character_id, col: t.col, row: t.row })));
      }
      if (p === '/rest/v1/rpc/set_token' || p === '/rest/v1/rpc/remove_token') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const c = db.characters.find((x) => x.id === body.p_character);
        const g = c && c.campaign_id && db.campaigns.find((x) => x.id === c.campaign_id);
        if (!g || !db.members.some((m) => m.campaign_id === g.id && m.user_id === me)) return P('That character is not in your campaign.');
        const qm = db.members.some((m) => m.campaign_id === g.id && m.user_id === me && m.role === 'qm');
        if (!(qm || (c.owner === me && !c.is_npc))) return P('You can only move your own characters.');
        if (p.endsWith('remove_token')) { db.tokens = db.tokens.filter((t) => t.character_id !== c.id); return send(204); }
        if (!g.encounter) return P('There is no active encounter.');
        const map = g.encounter.mapId && db.maps.find((m) => m.id === g.encounter.mapId);
        if (!map) return P('The encounter has no map.');
        const { p_col: col, p_row: row } = body;
        if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= map.cols || row >= map.rows) return P('That square is off the map.');
        const t = db.tokens.find((x) => x.character_id === c.id);
        if (t) { t.col = col; t.row = row; } else db.tokens.push({ character_id: c.id, campaign_id: g.id, col, row });
        return send(204);
      }
      if (p === '/rest/v1/rpc/become_player') {
        if (!me) return send(401, { message: 'JWT required' });
        const row = db.members.find((m) => m.campaign_id === body.p_campaign && m.user_id === me);
        if (!row || row.role !== 'qm') return send(400, { code: 'P0001', message: 'Only a QM can become a player.' });
        const others = db.members.filter((m) => m.campaign_id === row.campaign_id && m.user_id !== me);
        if (!others.length) return send(400, { code: 'P0001', message: 'You are the only player in this campaign, so you must stay QM.' });
        const qms = others.filter((m) => m.role === 'qm'), heir = (qms.length ? qms : others)[Math.floor(Math.random() * (qms.length ? qms : others).length)];
        heir.role = 'qm';
        db.characters.forEach((c) => { if (c.campaign_id === row.campaign_id && c.is_npc && c.owner === me) c.owner = heir.user_id; });
        row.role = 'member';
        return send(204);
      }
      if (p === '/rest/v1/rpc/set_npc_sheet_hidden') {
        if (!me) return send(401, { message: 'JWT required' });
        const c = db.characters.find((x) => x.id === body.p_character && x.is_npc);
        if (!c || !db.members.some((m) => m.campaign_id === c.campaign_id && m.user_id === me && m.role === 'qm')) return send(400, { code: 'P0001', message: 'Only a QM can hide an NPC sheet.' });
        c.npc_sheet_hidden = !!body.p_hidden; c.updated_at = new Date().toISOString();
        return send(204);
      }
      if (p === '/rest/v1/rpc/hidden_sheet_npcs') {
        if (!me) return send(401, { message: 'JWT required' });
        const member = db.members.some((m) => m.campaign_id === body.p_campaign && m.user_id === me);
        return send(200, !member ? [] : db.characters.filter((c) => c.campaign_id === body.p_campaign && c.is_npc && c.npc_visible && c.npc_sheet_hidden)
          .map((c) => ({ id: c.id, owner: c.owner, name: (c.data.info || {}).name || '' })));
      }
      if (p === '/rest/v1/rpc/unlink_npc' || p === '/rest/v1/rpc/move_npc' || p === '/rest/v1/rpc/give_npc' || p === '/rest/v1/rpc/add_npc_to_campaign') {
        if (!me) return send(401, { message: 'JWT required' });
        const isQ = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
        const c = db.characters.find((x) => x.id === body.p_character);
        const P = (message) => send(400, { code: 'P0001', message });
        const drop = (cid) => { const g = db.campaigns.find((x) => x.id === cid); if (g && g.encounter) { if (g.encounter.initiatives) delete g.encounter.initiatives[c.id]; if (g.encounter.turn === c.id) g.encounter.turn = null; } };
        if (p.endsWith('add_npc_to_campaign')) {
          if (!c || !c.is_npc || c.owner !== me) return P('You can only add your own NPCs to a campaign.');
          if (c.campaign_id) return P('That NPC is already in a campaign.');
          if (!body.p_campaign || !isQ(body.p_campaign)) return P('You must be a QM of that campaign.');
          c.campaign_id = body.p_campaign; c.npc_visible = false; c.npc_sheet_hidden = false; return send(204);
        }
        const what = p.endsWith('unlink_npc') ? 'take an NPC out of a campaign' : p.endsWith('move_npc') ? 'move an NPC' : 'give an NPC to a player';
        if (!c || !c.is_npc || !c.campaign_id || !isQ(c.campaign_id)) return P('Only a QM can ' + what + '.');
        if (p.endsWith('unlink_npc')) { drop(c.campaign_id); c.campaign_id = null; c.npc_visible = false; c.npc_sheet_hidden = false; return send(204); }
        if (p.endsWith('move_npc')) {
          if (!body.p_campaign || !isQ(body.p_campaign)) return P('You must be a QM of the campaign you move the NPC to.');
          if (!db.members.some((m) => m.campaign_id === body.p_campaign && m.user_id === c.owner)) return P("The NPC's owner is not in that campaign.");
          drop(c.campaign_id); c.campaign_id = body.p_campaign; c.npc_visible = false; c.npc_sheet_hidden = false; return send(204);
        }
        if (!db.members.some((m) => m.campaign_id === c.campaign_id && m.user_id === body.p_player)) return P('That player is not in the campaign.');
        drop(c.campaign_id); c.is_npc = false; c.npc_visible = false; c.npc_sheet_hidden = false; c.owner = body.p_player; return send(204);
      }
      if (p === '/rest/v1/rpc/make_npc') {
        if (!me) return send(401, { message: 'JWT required' });
        const c = db.characters.find((x) => x.id === body.p_character);
        if (!c || !c.campaign_id || !db.members.some((m) => m.campaign_id === c.campaign_id && m.user_id === me && m.role === 'qm')) return send(400, { code: 'P0001', message: 'Only a QM can make a character an NPC.' });
        if (!c.is_npc) { c.is_npc = true; c.npc_visible = false; c.npc_sheet_hidden = false; c.owner = me; c.updated_at = new Date().toISOString(); }
        return send(204);
      }
      if (p === '/rest/v1/rpc/set_character_inactive') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const g = db.campaigns.find((x) => x.id === body.p_campaign);
        if (!g || !db.members.some((m) => m.campaign_id === g.id && m.user_id === me && m.role === 'qm')) return P('Only a QM can do that.');
        const c = db.characters.find((x) => x.id === body.p_character);
        if (!c || c.campaign_id !== g.id) return P('That character is not in this campaign.');
        const ids = (g.inactive_ids || []).filter((x) => x !== c.id); if (body.p_inactive) ids.push(c.id);
        g.inactive_ids = ids; return send(204);
      }
      if (p === '/rest/v1/rpc/set_npc_visible') {
        if (!me) return send(401, { message: 'JWT required' });
        const c = db.characters.find((x) => x.id === body.p_character && x.is_npc);
        if (!c || !db.members.some((m) => m.campaign_id === c.campaign_id && m.user_id === me && m.role === 'qm')) return send(400, { code: 'P0001', message: 'Only a QM can change NPC visibility.' });
        c.npc_visible = !!body.p_visible; c.updated_at = new Date().toISOString();
        return send(204);
      }
      if (p === '/auth/v1/signup') {
        if (db.users.some((u) => u.email === body.email)) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        const u = { id: crypto.randomUUID(), email: body.email, password: body.password, meta: body.data || {} };
        db.users.push(u); db.profiles.push({ id: u.id, username: u.meta.username, name: u.meta.name });   // the signup trigger
        return send(200, sessionFor(u));
      }
      if (p === '/auth/v1/token') {
        const u = db.users.find((x) => x.email === body.email && x.password === body.password);
        if (!u) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return send(200, sessionFor(u));
      }
      if (p === '/auth/v1/logout') return send(204);
      if (p === '/auth/v1/recover') { db.recover = (db.recover || []).concat([{ email: body.email, redirect: url.searchParams.get('redirect_to') }]); return send(200, {}); }
      if (p === '/auth/v1/user') {
        const u = db.users.find((x) => x.id === me);
        if (!u) return send(401, { msg: 'invalid JWT' });
        if (req.method === 'PUT') { if (body.password) { if (body.password.length < 8) return send(422, { error_code: 'weak_password', msg: 'Password should be at least 8 characters.' }); u.password = body.password; } }
        return send(200, sessionFor(u).user);
      }
      if (p === '/rest/v1/profiles' && req.method === 'GET') {
        if (!me) return send(401, { message: 'JWT required' });
        const idp = url.searchParams.get('id');   // no id filter = all profiles (readable by every signed-in player)
        const rows = db.profiles.filter((x) => !idp || x.id === idp.replace('eq.', '')).map(({ id, username, name }) => ({ id, username, name }));
        return (req.headers.accept || '').includes('pgrst.object') ? (rows[0] ? send(200, rows[0]) : send(406, { message: 'no rows' })) : send(200, rows);
      }
      if (p === '/rest/v1/characters') {
        if (!me) return send(401, { message: 'JWT required' });
        if (req.method === 'GET') {   // RLS: only the signed-in owner's rows, whatever the query asks for
          const cp = url.searchParams.get('campaign_id');
          let rows;
          if (cp) {   // RLS "campaign characters readable" (plus owners always read their own)
            const cid = cp.replace('eq.', '');
            const member = db.members.some((m) => m.campaign_id === cid && m.user_id === me);
            const qm = db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
            rows = db.characters.filter((c) => c.campaign_id === cid && (c.owner === me || (member && (!c.is_npc || (c.npc_visible && !c.npc_sheet_hidden) || qm))));
          } else rows = db.characters.filter((c) => c.owner === me);
          rows = rows.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
          return send(200, rows.map(({ id, owner, data, updated_at, campaign_id, is_npc, npc_visible, npc_sheet_hidden }) => ({ id, owner, data, updated_at, campaign_id: campaign_id || null, is_npc: !!is_npc, npc_visible: !!npc_visible, npc_sheet_hidden: !!npc_sheet_hidden })));
        }
        if (req.method === 'POST') {
          if (db.failSaves) return send(503, { message: 'service unavailable' });
          if (body.owner !== me) return send(403, { code: '42501', message: 'new row violates row-level security policy' });
          const i = db.characters.findIndex((c) => c.id === body.id);
          if (i >= 0 && db.characters[i].owner !== me) return send(403, { code: '42501', message: 'new row violates row-level security policy' });
          if (body.campaign_id && !db.members.some((m) => m.campaign_id === body.campaign_id && m.user_id === me)) return send(400, { code: 'P0001', message: 'Join that campaign before linking a character to it.' });
          const prev = i >= 0 ? db.characters[i] : null;
          if (prev && prev.is_npc && (body.campaign_id || null) !== prev.campaign_id) return send(400, { code: 'P0001', message: 'An NPC stays in its campaign.' });
          if ('is_npc' in body || 'npc_visible' in body) return send(403, { code: '42501', message: 'permission denied for table characters' });
          const row = { id: body.id, owner: me, data: body.data, campaign_id: body.campaign_id || null, is_npc: prev ? prev.is_npc : false, npc_visible: prev ? prev.npc_visible : false, npc_sheet_hidden: prev ? !!prev.npc_sheet_hidden : false, created_at: i >= 0 ? db.characters[i].created_at : new Date().toISOString(), updated_at: new Date().toISOString() };
          if (i >= 0) db.characters[i] = row; else db.characters.push(row);
          return send(201);
        }
        if (req.method === 'DELETE') {
          const id = (url.searchParams.get('id') || '').replace('eq.', '');
          db.characters = db.characters.filter((c) => !(c.id === id && c.owner === me));
          return send(204);
        }
      }

      if (p === '/rest/v1/encounter_events' && req.method === 'GET') {
        if (!me) return send(401, { message: 'JWT required' });
        return send(200, db.events.filter((e) => db.members.some((m) => m.campaign_id === e.campaign_id && m.user_id === me && (m.role === 'qm' || e.visible)))
          .map((e) => ({ id: e.id, campaign_id: e.campaign_id, name: e.name, visible: e.visible, total: e.total, tb: e.tb, one_time: e.one_time, round: e.round })));
      }
      if (p === '/rest/v1/rpc/add_event' || p === '/rest/v1/rpc/set_event_visible' || p === '/rest/v1/rpc/remove_event') {
        if (!me) return send(401, { message: 'JWT required' });
        const P = (message) => send(400, { code: 'P0001', message });
        const isQ = (cid) => db.members.some((m) => m.campaign_id === cid && m.user_id === me && m.role === 'qm');
        if (p.endsWith('add_event')) {
          const g = db.campaigns.find((x) => x.id === body.p_campaign);
          if (!g || !isQ(g.id)) return P('Only a QM can add an event.');
          if (!g.encounter) return P('There is no active encounter.');
          const nm = String(body.p_name || '').trim();
          if (!nm) return P('Give the event a name first.');
          if (nm.length > 60) return P('That name is too long.');
          if (typeof body.p_total !== 'number' || Math.abs(body.p_total) > 1000) return P('That initiative is not valid.');
          if (body.p_one_time && !(Number.isInteger(body.p_round) && body.p_round >= (g.encounter.round || 1))) return P('Pick a round that has not passed yet.');
          const id = crypto.randomUUID();
          db.events.push({ id, campaign_id: g.id, name: nm, visible: false, total: body.p_total, tb: Math.random(), one_time: !!body.p_one_time, round: body.p_one_time ? body.p_round : null });
          if (!g.encounter.moved) g.encounter.turn = mockOrder(g)[0] || null;
          return send(200, id);
        }
        const ev = db.events.find((e) => e.id === body.p_event);
        if (!ev || !isQ(ev.campaign_id)) return P(p.endsWith('remove_event') ? 'Only a QM can remove an event.' : 'Only a QM can show or hide an event.');
        if (p.endsWith('set_event_visible')) { ev.visible = !!body.p_visible; return send(204); }
        const g = db.campaigns.find((x) => x.id === ev.campaign_id);
        db.events = db.events.filter((e) => e !== ev);
        if (g && g.encounter && g.encounter.turn === ev.id) { g.encounter.turn = mockOrder(g)[0] || null; }
        return send(204);
      }
      if (p === '/rest/v1/campaigns' || p === '/rest/v1/campaign_members') {
        if (!me) return send(401, { message: 'JWT required' });
        const isG = p.endsWith('/campaigns');
        const eq = (k) => { const v = url.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
        const isQm = (gid, u) => db.members.some((m) => m.campaign_id === gid && m.user_id === u && m.role === 'qm');
        const wantsRows = /return=representation/.test(req.headers.prefer || '');
        const wantsOne = (req.headers.accept || '').includes('pgrst.object');
        const reply = (code, rows) => {
          if (!wantsRows) return send(code === 200 ? 200 : 204 === code ? 204 : code, code === 200 ? rows : undefined);
          if (wantsOne) return rows.length === 1 ? send(code, rows[0]) : send(406, { message: 'JSON object requested, multiple (or no) rows returned' });
          return send(code, rows);
        };
        // QM hand-over (the database trigger): a QM's NPCs always pass to a QM; the only QM leaving promotes a random member
        const ONLY = { code: 'P0001', message: 'You are the only player in this campaign, so you must stay QM.' };
        const rnd = (a) => a[Math.floor(Math.random() * a.length)];
        const handoff = (row, deleting) => {
          if (row.role !== 'qm' || !db.campaigns.some((g) => g.id === row.campaign_id)) return null;
          const others = db.members.filter((m) => m.campaign_id === row.campaign_id && m.user_id !== row.user_id);
          const qms = others.filter((m) => m.role === 'qm');
          const heir = qms.length ? rnd(qms) : others.length ? rnd(others) : null;
          if (!heir) return deleting ? null : ONLY;
          heir.role = 'qm';
          db.characters.forEach((c) => { if (c.campaign_id === row.campaign_id && c.is_npc && c.owner === row.user_id) c.owner = heir.user_id; });
          return null;
        };
        const dropCampaign = (gid) => { db.characters.forEach((c) => { if (c.campaign_id === gid) { c.campaign_id = null; c.npc_visible = false; c.npc_sheet_hidden = false; } }); db.campaigns = db.campaigns.filter((x) => x.id !== gid); db.members = db.members.filter((m) => m.campaign_id !== gid); };

        if (req.method === 'GET') {
          if (isG) return send(200, db.campaigns.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
          return send(200, db.members.map(({ campaign_id, user_id, role, joined_at }) => ({ campaign_id, user_id, role, joined_at })));
        }
        if (req.method === 'POST' && isG) {
          const name = String(body.name || '').trim();
          if (body.created_by !== me) return send(403, { code: '42501', message: 'new row violates row-level security policy for table "campaigns"' });
          if (name.length < 1 || name.length > 40) return send(400, { code: '23514', message: 'new row violates check constraint' });
          const g = { id: crypto.randomUUID(), name: body.name, created_by: me, created_at: new Date().toISOString() };
          db.campaigns.push(g);
          db.members.push({ campaign_id: g.id, user_id: me, role: 'qm', joined_at: g.created_at });   // add_campaign_creator trigger
          return reply(201, [g]);
        }
        if (req.method === 'POST') {
          if (body.user_id !== me || body.role !== 'member') return send(403, { code: '42501', message: 'new row violates row-level security policy for table "campaign_members"' });
          if (!db.campaigns.some((g) => g.id === body.campaign_id)) return send(409, { code: '23503', message: 'violates foreign key constraint' });
          if (db.members.some((m) => m.campaign_id === body.campaign_id && m.user_id === me)) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
          const row = { campaign_id: body.campaign_id, user_id: me, role: 'member', joined_at: new Date().toISOString() };
          db.members.push(row);
          return reply(201, [row]);
        }
        if (req.method === 'DELETE' && isG) {
          const hit = db.campaigns.filter((g) => g.id === eq('id') && isQm(g.id, me));          // policy: QMs only
          hit.forEach((g) => { db.characters.forEach((c) => { if (c.campaign_id === g.id) { c.campaign_id = null; c.npc_visible = false; c.npc_sheet_hidden = false; } }); db.campaigns = db.campaigns.filter((x) => x !== g); db.members = db.members.filter((m) => m.campaign_id !== g.id); });
          return reply(200, hit.map((g) => ({ id: g.id })));
        }
        if (req.method === 'DELETE') {
          const hit = db.members.filter((m) => m.campaign_id === eq('campaign_id') && m.user_id === eq('user_id') && (m.user_id === me || isQm(m.campaign_id, me)));
          for (const m of hit) { const e = handoff(m, true); if (e) return send(400, e); }
          hit.forEach((m) => db.characters.forEach((c) => { if (c.campaign_id === m.campaign_id && c.owner === m.user_id) { c.campaign_id = null; c.npc_visible = false; c.npc_sheet_hidden = false; } }));
          db.members = db.members.filter((m) => !hit.includes(m));
          hit.forEach((m) => { if (!db.members.some((x) => x.campaign_id === m.campaign_id)) dropCampaign(m.campaign_id); });
          return reply(200, hit.map((m) => ({ user_id: m.user_id })));
        }
        if (req.method === 'PATCH') {
          const hit = db.members.filter((m) => m.campaign_id === eq('campaign_id') && m.user_id === eq('user_id') && isQm(m.campaign_id, me));
          for (const m of hit) if (body.role !== 'qm') { const e = handoff(m, false); if (e) return send(400, e); }
          hit.forEach((m) => { m.role = body.role; });
          return reply(200, hit.map((m) => ({ user_id: m.user_id })));
        }
      }
      send(404, { message: 'mock: unhandled ' + req.method + ' ' + p });
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ url: 'http://127.0.0.1:' + server.address().port, db, close: () => server.close() })));
}
module.exports = { createMock, jwt };
