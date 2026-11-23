/* BLOODSOUP HELL storage + accounts.
 * Two interchangeable backends with the same async interface:
 *   - supabase: real accounts and shared database (used when config + supabase-js are present)
 *   - local:    accounts and characters kept on this device only (preview / offline fallback)
 *
 * Interface:  mode, init(), signUp({name,username,email,password}), signIn({username,password}), signOut(),
 *             requestReset(usernameOrEmail), takeRecovery() -> 'ok'|'expired'|null, setNewPassword(pw)   (email password recovery; online only)
 *             listCharacters(), saveCharacter(ch)  (insert or update), deleteCharacter(id)
 *             listCampaigns(), createCampaign(name) -> id, joinCampaign(id), leaveCampaign(id),
 *             removeMember(campaignId, userId), setQm(campaignId, userId, isQm), becomePlayer(campaignId), deleteCampaign(id)
 *             listCampaignCharacters(campaignId) -> [{ch, ownerId, owner, mine}], createNpc(campaignId, ch), setNpcVisible(charId, bool), setNpcSheetHidden(charId, bool), giveCharacter(charId, playerId), makeNpc(charId), unlinkNpc(charId), addNpcToCampaign(charId, campaignId), moveNpc(charId, campaignId), giveNpc(charId, playerId),
 *             giveItem(fromCharId|null, toCharId, {name,qty,charges,desc}), pendingGifts() -> [{id, characterId, fromName, item}], ackGifts(ids)
 *             startEncounter(campaignId), endEncounter(campaignId), setInitiative(campaignId, charId, die, ib),
 *             advanceTurn(campaignId, fromCharId), assignTurn(campaignId, charId),
 *             addEvent(campaignId, {name, total, oneTime, round}), setEventVisible(campaignId, eventId, visible), removeEvent(campaignId, eventId)
 *               (special events in the turn order; encounter.events lists the ones you may see: QMs all, players only the shown ones)
 *             startSpawn(campaignId, [userIds]), spawnSubmit(campaignId, text|0|1), spawnPoints(campaignId, [{up,down,prof} x4]),
 *             spawnIncarnation(campaignId, prevCharId|null), spawnVeto(campaignId), cancelSpawn(campaignId), finishSpawn(campaignId)
 *               (Spawn Character: listCampaigns() adds `spawn` while one is running)
 *             listMaps(campaignId) -> [{id,name,visible,cols,rows,size,ox,oy,imgW,imgH}], getMap(id) (adds image + campaignId),
 *             saveMap(campaignId, {id?,name,image?,imgW,imgH,cols,rows,size,ox,oy}) -> id, setMapVisible(id, bool), deleteMap(id), listTokens(campaignId) -> [{characterId,col,row}], setToken(charId, col, row), removeToken(charId)  (tokens on the encounter map; owner or QM),
 *             setEncounterMap(campaignId, mapId|null)  (encounter.mapId: the map everyone can open during the encounter)
 *               (encounter maps: the picture is a data URL; players only get the maps the QM has shown)
 *             startAttack(attackerId, targetId, total, power, text, comboLeaderId?) -> attackId, resolveAttack(campaignId, attackId, damage, text, critFailIds?, usedCritIds?, nextCritIds?)   (an attack the target may block/parry; the target's player or a QM answers),
 *             setCombo(leaderId, finisherId, skill, level, total, text), cancelCombo(leaderId), comboLeaderAttack(campaignId, attackId, total, power, text),
 *             cancelComboAttack(campaignId, attackId)   (Combo Attacks: encounter.combos[leaderId] waits for the Finisher's turn; the attack then carries `combo`)
 *             setExplodeTokens(charId, 0..10)   (spend or hand out Explode Tokens; the owner, or a QM of the character's campaign),
 *             dealDamage(attackerId, targetId, amount)   (an attack during an encounter adds damage taken to the target), qmDealDamage(campaignId, targetId, amount)   (a QM adds damage taken to any character in their campaign, in or out of an encounter), setCharacterInactive(campaignId, charId, bool)   (QM only; campaign.inactive lists the ids), codexRecord(campaignId, 'mobs'|'items', key, entry) / codexRemove(campaignId, kind, key)   (campaign.codex; any member records once, only a QM removes),
 *             setVital(charId, 'apRemaining'|'spRemaining', value)   (spend points during an encounter; owner or QM; 'bt'|'wt'|'bleeding' any time),
 *             setItems(charId, items) -> itemsEdit (QM only), loadWeapon(charId, itemUid, apLeft) -> {items, itemsEdit} (owner or QM, encounter),
 *             setLoaded(charId, itemUid, loaded) -> {items, itemsEdit} (owner or QM),
 *             startTurn(charId, spGain, spMax, apMax?) -> {applied, ...}     (AP back to full, SP +spGain unless AP was 0; once per turn change)
 *             (listCampaigns rows carry `encounter`: null, or { id, startedAt, round, turn, moved, initiatives: { charId: {die, ib, total, tb, by} } })
 *             turn order = highest total first, ties by the random tb (see BSHBackend.turnOrder)
 *             listCompendiums() -> [{id, name, data, ownerId, mine, updated}] (yours, plus any used by a campaign where you are QM), saveCompendium({id, name, data}) (yours only),
 *             deleteCompendium(id), setCampaignCompendium(campaignId, compendiumId|null) (QM only; one of your own; listCampaigns rows carry `compendiumId`)
 * A "user" is { id, email, name, username }. Failures throw Error with a message fit to show players.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BSHBackend = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Turn order: highest initiative total first; equal totals by the random tie-break drawn when the roll was saved
  // (then by id so every device agrees). `ids` are the characters to consider; those without a roll are left out.
  function turnOrder(initiatives, ids) {
    const inits = initiatives || {};
    return ids.filter((id) => inits[id]).sort((a, b) => (inits[b].total - inits[a].total) || ((inits[b].tb || 0) - (inits[a].tb || 0)) || (a < b ? -1 : a > b ? 1 : 0));
  }

  // Special events share the turn order with characters: { id, name, visible, total, tb, oneTime, round }.
  // A one-time event only exists in its own round. Returns { id: { total, tb } } for every rolled character and every event in play.
  const mapMeta = (r) => ({ id: r.id, name: r.name, visible: !!r.visible, cols: r.cols, rows: r.rows, size: Number(r.size), ox: Number(r.ox), oy: Number(r.oy),
    imgW: r.img_w, imgH: r.img_h, createdAt: r.created_at });
  // ----- Spawn Character helpers (shared by the local backend; the database has its own copies) -----
  const SPAWN_STEPS = ['appearance', 'ability', 'style', 'weapon', 'backstory', 'motivation', 'points'];
  const SPAWN_SIZES = { 1: 20, 2: 8, 3: 12 };   // rows in the Abilities, Fighting Styles and Weapon tables
  function spawnOptions(n) { const a = Math.floor(Math.random() * n); let b; do { b = Math.floor(Math.random() * n); } while (b === a); return [a, b]; }
  function spawnEnter(sp) {
    sp.step = SPAWN_STEPS[sp.pos];
    if (sp.pos <= 5) sp.turn = sp.order[sp.pos % sp.order.length]; else delete sp.turn;
    if (SPAWN_SIZES[sp.pos]) sp.options = spawnOptions(SPAWN_SIZES[sp.pos]); else delete sp.options;
    return sp;
  }
  const newId = () => ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));

  function eventInPlay(ev, round) { return !ev.oneTime || ev.round === (round || 1); }
  function turnSlots(enc) {
    const out = Object.assign({}, enc && enc.initiatives);
    ((enc && enc.events) || []).forEach((ev) => { if (eventInPlay(ev, enc.round)) out[ev.id] = { total: ev.total, tb: ev.tb }; });
    return out;
  }

  function fail(message, code) { const e = new Error(message); if (code) e.code = code; return e; }

  // Turn Supabase / network errors into plain language
  function friendly(err, fallback) {
    const msg = String((err && (err.message || err.error_description)) || err || '');
    if (err && err.code === 'P0001') return fail(msg);   // our own database rules already speak plainly
    if (/invalid login credentials/i.test(msg)) return fail('Username or password is incorrect.');
    if (/already (been )?registered|already exists/i.test(msg)) return fail('That email already has an account. Try logging in.');
    if (/database error saving new user/i.test(msg)) return fail('That username is already taken.');
    if (/at least one QM/i.test(msg)) return fail('A campaign must always have at least one QM. Make someone else QM first.');
    if (/^Only a QM/i.test(msg) || /stays in its campaign/i.test(msg)) return fail(msg);
    if (/join that campaign/i.test(msg)) return fail('Join that campaign before linking a character to it.');
    if (/rate limit|too many/i.test(msg)) return fail('Too many attempts. Wait a minute and try again.');
    if (/password/i.test(msg)) return fail(msg);
    if (/failed to fetch|network|load failed|fetch/i.test(msg)) return fail('Cannot reach the server. Check your connection and try again.');
    return fail(fallback || msg || 'Something went wrong. Try again.');
  }

  /* ================= Supabase ================= */
  function supabaseBackend(config, env) {
    const sb = env.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    let uid = null, recovery = null;

    async function toUser(user) {
      const meta = user.user_metadata || {};
      let name = meta.name, username = meta.username;
      try {
        const { data } = await sb.from('profiles').select('username,name').eq('id', user.id).maybeSingle();
        if (data) { name = data.name; username = data.username; }
      } catch (e) { /* fall back to sign-up metadata */ }
      return { id: user.id, email: user.email, name: name || 'Player', username: username || '' };
    }

    return {
      mode: 'supabase',

      async init() {
        // A password-recovery email link comes back as #access_token=...&type=recovery (or #error=...).
        // Take the tokens out of the address bar right away, before the page's own hash routing sees them.
        try {
          const loc = env.location, hash = loc && loc.hash ? loc.hash.replace(/^#/, '') : '';
          if (/(^|&)type=recovery(&|$)/.test(hash) || /(^|&)error(_code|_description)?=/.test(hash)) {
            const q = new URLSearchParams(hash);
            env.history.replaceState(null, '', loc.pathname + loc.search);
            if (q.get('type') === 'recovery' && q.get('access_token') && q.get('refresh_token')) {
              const r = await sb.auth.setSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token') });
              recovery = r.error ? 'expired' : 'ok';
            } else recovery = 'expired';
          }
        } catch (e) { recovery = 'expired'; }
        const { data, error } = await sb.auth.getSession();
        if (error || !data || !data.session) return null;
        uid = data.session.user.id;
        return toUser(data.session.user);
      },

      async signUp({ name, username, email, password }) {
        const check = await sb.rpc('username_available', { p_username: username });
        if (check.error) throw friendly(check.error, 'Could not check that username. Try again in a moment.');
        if (check.data === false) throw fail('That username is already taken. Try another.');
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name, username } } });
        if (error) throw friendly(error);
        if (!data || !data.session) throw fail('Account created. Check your email to confirm it, then log in.', 'confirm');
        uid = data.user.id;
        return { id: uid, email, name, username };
      },

      async signIn({ username, password }) {
        // players log in by username; Supabase signs in by email, so look the email up first
        const found = await sb.rpc('login_email', { p_username: username });
        if (found.error) throw friendly(found.error, 'Could not log in. Try again in a moment.');
        if (!found.data) throw fail('Username or password is incorrect.');
        const { data, error } = await sb.auth.signInWithPassword({ email: found.data, password });
        if (error) throw friendly(error);
        uid = data.user.id;
        return toUser(data.user);
      },

      async signOut() {
        uid = null;
        await sb.auth.signOut();
      },

      // Password recovery. Takes a username or an email; never says whether an account exists.
      async requestReset(who) {
        who = String(who || '').trim();
        let email = who.toLowerCase();
        if (!who) throw fail('Enter your username or email.');
        if (who.indexOf('@') < 0) {
          const found = await sb.rpc('login_email', { p_username: who });
          email = found && !found.error && found.data ? found.data : null;
        }
        if (email) {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: env.location.origin + env.location.pathname });
          if (error && /rate|seconds|too many|network|fetch/i.test(error.message || '')) throw friendly(error, 'Could not send the email. Try again in a minute.');
        }
      },
      takeRecovery() { const r = recovery; recovery = null; return r; },
      async setNewPassword(password) {
        const { data, error } = await sb.auth.updateUser({ password });
        if (error) throw friendly(error, 'Could not change the password. Request a new link and try again.');
        uid = data.user.id;
        return toUser(data.user);
      },

      async listCharacters() {
        const { data, error } = await sb.from('characters').select('id,data,updated_at,campaign_id,is_npc,npc_visible,npc_sheet_hidden')
          .eq('owner', uid).order('updated_at', { ascending: false });
        if (error) throw friendly(error, 'Could not load your characters.');
        return (data || []).map((row) => Object.assign({}, row.data, {
          id: row.id, campaignId: row.campaign_id || null, isNpc: !!row.is_npc, npcVisible: !!row.npc_visible, sheetHidden: !!row.npc_sheet_hidden }));
      },

      async saveCharacter(ch) {
        const { id, campaignId, isNpc, npcVisible, sheetHidden, ...rest } = ch;   // the campaign link lives in its own column; NPC flags are set only by createNpc / setNpcVisible
        const { error } = await sb.from('characters').upsert({ id, owner: uid, data: rest, campaign_id: campaignId || null }, { onConflict: 'id' });
        if (error) throw friendly(error, 'Could not save.');
      },

      async deleteCharacter(id) {
        const { error } = await sb.from('characters').delete().eq('id', id);
        if (error) throw friendly(error, 'Could not delete.');
      },

      /* ----- campaigns ----- */
      // Returns every campaign: { id, name, createdBy, createdAt, members: [{userId, username, name, role}] }
      async listCampaigns() {
        const [g, m, p, ev] = await Promise.all([
          sb.from('campaigns').select('id,name,created_by,created_at,encounter,spawn,inactive_ids,codex,compendium_id').order('created_at', { ascending: false }),
          sb.from('campaign_members').select('campaign_id,user_id,role,joined_at'),
          sb.from('profiles').select('id,username,name'),
          sb.from('encounter_events').select('id,campaign_id,name,visible,total,tb,one_time,round')   // the database only returns what you may see
        ]);
        const err = g.error || m.error || p.error || ev.error;
        if (err) throw friendly(err, 'Could not load campaigns.');
        const who = {};
        (p.data || []).forEach((r) => { who[r.id] = r; });
        const byCampaign = {};
        (m.data || []).forEach((r) => {
          const u = who[r.user_id] || {};
          (byCampaign[r.campaign_id] = byCampaign[r.campaign_id] || []).push({
            userId: r.user_id, username: u.username || '?', name: u.name || '', role: r.role, joinedAt: r.joined_at
          });
        });
        return (g.data || []).map((r) => ({
          id: r.id, name: r.name, createdBy: r.created_by, createdAt: r.created_at,
          encounter: r.encounter ? Object.assign({}, r.encounter, { events: (ev.data || []).filter((e) => e.campaign_id === r.id)
            .map((e) => ({ id: e.id, name: e.name, visible: !!e.visible, total: Number(e.total), tb: Number(e.tb), oneTime: !!e.one_time, round: e.round })) }) : null,
          spawn: r.spawn || null, inactive: r.inactive_ids || [], codex: r.codex || {}, compendiumId: r.compendium_id || null,
          members: sortMembers(byCampaign[r.id] || [])
        }));
      },

      async createCampaign(name) {
        const clean = cleanCampaignName(name);
        const { data, error } = await sb.from('campaigns').insert({ name: clean, created_by: uid }).select('id').single();
        if (error) throw friendly(error, 'Could not create the campaign.');
        return data.id;
      },

      async joinCampaign(campaignId) {
        const { error } = await sb.from('campaign_members').insert({ campaign_id: campaignId, user_id: uid, role: 'member' });
        if (error) {
          if (/duplicate|already/i.test(error.message || '')) return;
          throw friendly(error, 'Could not join the campaign.');
        }
      },

      async leaveCampaign(campaignId) { return removeRow(campaignId, uid, 'Could not leave the campaign.'); },
      async removeMember(campaignId, userId) { return removeRow(campaignId, userId, 'Could not remove that player.'); },

      async becomePlayer(campaignId) {
        const { error } = await sb.rpc('become_player', { p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not step down to a player.');
      },

      async setQm(campaignId, userId, isQm) {
        const { data, error } = await sb.from('campaign_members').update({ role: isQm ? 'qm' : 'member' })
          .eq('campaign_id', campaignId).eq('user_id', userId).select('user_id');
        if (error) throw friendly(error, 'Could not change that role.');
        if (!data || !data.length) throw fail('Only a QM can change roles.');
      },

      // Characters in a campaign that I am allowed to see: my own, other players' linked characters,
      // and NPCs the QM has made visible (QMs see every NPC). -> [{ ch, ownerId, owner, mine }]
      async listCampaignCharacters(campaignId) {
        const [c, p, hid] = await Promise.all([
          sb.from('characters').select('id,owner,data,campaign_id,is_npc,npc_visible,npc_sheet_hidden').eq('campaign_id', campaignId),
          sb.from('profiles').select('id,username,name'),
          sb.rpc('hidden_sheet_npcs', { p_campaign: campaignId })
        ]);
        const err = c.error || p.error || hid.error;
        if (err) throw friendly(err, 'Could not load the characters.');
        const who = {};
        (p.data || []).forEach((r) => { who[r.id] = r; });
        const rows = (c.data || []).map((r) => ({
          ch: Object.assign({}, r.data, { id: r.id, campaignId: r.campaign_id, isNpc: !!r.is_npc, npcVisible: !!r.npc_visible, sheetHidden: !!r.npc_sheet_hidden }),
          ownerId: r.owner, owner: (who[r.owner] || {}).username || '?', mine: r.owner === uid
        }));
        // NPCs shown on the roster with a private sheet: name only (the database does not hand out the rest)
        const have = new Set(rows.map((r) => r.ch.id));
        (hid.data || []).filter((r) => !have.has(r.id)).forEach((r) => rows.push({
          ch: { id: r.id, campaignId, isNpc: true, npcVisible: true, sheetHidden: true, info: { name: r.name } },
          ownerId: r.owner, owner: (who[r.owner] || {}).username || '?', mine: false, stub: true
        }));
        return rows;
      },

      async createNpc(campaignId, ch) {
        const { id, campaignId: _c, isNpc, npcVisible, ...rest } = ch;
        const { error } = await sb.rpc('create_npc', { p_campaign: campaignId, p_id: id, p_data: rest });
        if (error) throw friendly(error, 'Could not create the NPC.');
      },

      // QM only: turn any character in the QM's campaign (even one already handed to a player) into one of that campaign's NPCs. The QM becomes its owner; it starts hidden.
      // QM: take an NPC out of its campaign (it stays with its owner), move it to another campaign you are QM of (arrives hidden),
      // or give it to a player (it becomes their character). The owner of an NPC outside any campaign can add it to a campaign they run.
      async unlinkNpc(characterId) {
        const { error } = await sb.rpc('unlink_npc', { p_character: characterId });
        if (error) throw friendly(error, 'Could not take the NPC out of the campaign.');
      },
      async addNpcToCampaign(characterId, campaignId) {
        const { error } = await sb.rpc('add_npc_to_campaign', { p_character: characterId, p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not add the NPC to that campaign.');
      },
      async moveNpc(characterId, campaignId) {
        const { error } = await sb.rpc('move_npc', { p_character: characterId, p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not move the NPC.');
      },
      async giveNpc(characterId, playerId) {
        const { error } = await sb.rpc('give_npc', { p_character: characterId, p_player: playerId });
        if (error) throw friendly(error, 'Could not give the NPC to that player.');
      },

      async makeNpc(characterId) {
        const { error } = await sb.rpc('make_npc', { p_character: characterId });
        if (error) throw friendly(error, 'Could not make that character an NPC.');
      },

      async giveCharacter(characterId, playerId) {
        const { error } = await sb.rpc('give_character', { p_character: characterId, p_player: playerId });
        if (error) throw friendly(error, 'Could not hand the character over.');
      },

      // Items: a gift waits for the receiving character's owner, who adds it to the sheet and then confirms (ackGifts).
      async giveItem(fromId, toId, item) {
        const { error } = await sb.rpc('give_item', { p_from: fromId || null, p_to: toId, p_item: item });
        if (error) throw friendly(error, 'Could not give that item.');
      },

      async pendingGifts() {
        const { data, error } = await sb.from('item_gifts').select('id,character_id,from_name,item,created_at').order('created_at', { ascending: true });
        if (error) throw friendly(error, 'Could not check for gifts.');
        return (data || []).map((r) => ({ id: r.id, characterId: r.character_id, fromName: r.from_name, item: r.item }));
      },

      async ackGifts(ids) {
        if (!ids || !ids.length) return;
        const { error } = await sb.from('item_gifts').delete().in('id', ids);
        if (error) throw friendly(error, 'Could not confirm the gifts.');
      },

      async setNpcSheetHidden(characterId, hidden) {
        const { error } = await sb.rpc('set_npc_sheet_hidden', { p_character: characterId, p_hidden: !!hidden });
        if (error) throw friendly(error, 'Could not change the sheet visibility.');
      },

      async setNpcVisible(characterId, visible) {
        const { error } = await sb.rpc('set_npc_visible', { p_character: characterId, p_visible: !!visible });
        if (error) throw friendly(error, 'Could not change NPC visibility.');
      },

      async advanceTurn(campaignId, fromId) {
        const { error } = await sb.rpc('advance_turn', { p_campaign: campaignId, p_from: fromId });
        if (error) throw friendly(error, 'Could not end the turn.');
      },

      /* ----- encounter maps ----- */
      // listMaps has no picture (small); getMap has it. Players only ever receive the maps the QM has shown.
      async listMaps(campaignId) {
        const { data, error } = await sb.from('encounter_maps').select('id,name,visible,cols,rows,size,ox,oy,img_w,img_h,created_at')
          .eq('campaign_id', campaignId).order('created_at', { ascending: true });
        if (error) throw friendly(error, 'Could not load the maps.');
        return (data || []).map(mapMeta);
      },
      async getMap(mapId) {
        const { data, error } = await sb.from('encounter_maps').select('id,campaign_id,name,visible,cols,rows,size,ox,oy,img_w,img_h,created_at,image').eq('id', mapId).maybeSingle();
        if (error) throw friendly(error, 'Could not load that map.');
        if (!data) throw fail('That map is not available.');
        return Object.assign(mapMeta(data), { campaignId: data.campaign_id, image: data.image });
      },
      async saveMap(campaignId, m) {
        const { data, error } = await sb.rpc('save_map', { p_campaign: campaignId, p_id: m.id || null, p_name: m.name, p_image: m.image || null,
          p_img_w: m.imgW || null, p_img_h: m.imgH || null, p_cols: m.cols, p_rows: m.rows, p_size: m.size, p_ox: m.ox, p_oy: m.oy });
        if (error) throw friendly(error, 'Could not save the map.');
        return data;
      },
      /* ----- tokens on the encounter map ----- */
      async listTokens(campaignId) {
        const { data, error } = await sb.from('encounter_tokens').select('character_id,col,row').eq('campaign_id', campaignId);
        if (error) throw friendly(error, 'Could not load the tokens.');
        return (data || []).map((r) => ({ characterId: r.character_id, col: r.col, row: r.row }));
      },
      async setToken(characterId, col, row) {
        const { error } = await sb.rpc('set_token', { p_character: characterId, p_col: col, p_row: row });
        if (error) throw friendly(error, 'Could not move the token.');
      },
      async removeToken(characterId) {
        const { error } = await sb.rpc('remove_token', { p_character: characterId });
        if (error) throw friendly(error, 'Could not pick the token up.');
      },
      async setEncounterMap(campaignId, mapId) {
        const { error } = await sb.rpc('set_encounter_map', { p_campaign: campaignId, p_map: mapId || null });
        if (error) throw friendly(error, 'Could not change the encounter map.');
      },
      async setMapVisible(mapId, visible) {
        const { error } = await sb.rpc('set_map_visible', { p_map: mapId, p_visible: !!visible });
        if (error) throw friendly(error, 'Could not change that map.');
      },
      async deleteMap(mapId) {
        const { error } = await sb.rpc('delete_map', { p_map: mapId });
        if (error) throw friendly(error, 'Could not delete that map.');
      },

      /* ----- Spawn Character ----- */
      async startSpawn(campaignId, forIds) {
        const { error } = await sb.rpc('start_spawn', { p_campaign: campaignId, p_for: forIds || [] });
        if (error) throw friendly(error, 'Could not start the character.');
      },
      async spawnSubmit(campaignId, value) {
        const { error } = await sb.rpc('spawn_submit', { p_campaign: campaignId, p_value: value });
        if (error) throw friendly(error, 'Could not hand that in.');
      },
      async spawnPoints(campaignId, picks) {
        const { error } = await sb.rpc('spawn_points', { p_campaign: campaignId, p_picks: picks });
        if (error) throw friendly(error, 'Could not hand in your points.');
      },
      async spawnIncarnation(campaignId, prevId) {
        const { error } = await sb.rpc('spawn_incarnation', { p_campaign: campaignId, p_prev: prevId || null });
        if (error) throw friendly(error, 'Could not pick that character.');
      },
      async spawnVeto(campaignId) {
        const { error } = await sb.rpc('spawn_veto', { p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not send it back.');
      },
      async cancelSpawn(campaignId) {
        const { error } = await sb.rpc('cancel_spawn', { p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not cancel.');
      },
      async finishSpawn(campaignId) {
        const { error } = await sb.rpc('finish_spawn', { p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not finish the character.');
      },

      async assignTurn(campaignId, characterId) {
        const { error } = await sb.rpc('assign_turn', { p_campaign: campaignId, p_character: characterId });
        if (error) throw friendly(error, 'Could not assign the turn.');
      },

      async addEvent(campaignId, ev) {
        const { error } = await sb.rpc('add_event', { p_campaign: campaignId, p_name: ev.name, p_total: ev.total, p_one_time: !!ev.oneTime, p_round: ev.oneTime ? ev.round : null });
        if (error) throw friendly(error, 'Could not add the event.');
      },
      async setEventVisible(campaignId, eventId, visible) {
        const { error } = await sb.rpc('set_event_visible', { p_event: eventId, p_visible: !!visible });
        if (error) throw friendly(error, 'Could not change the event.');
      },
      async removeEvent(campaignId, eventId) {
        const { error } = await sb.rpc('remove_event', { p_event: eventId });
        if (error) throw friendly(error, 'Could not remove the event.');
      },

      async setVital(characterId, key, value) {
        const { error } = await sb.rpc('set_vital', { p_character: characterId, p_key: key, p_value: value });
        if (error) throw friendly(error, 'Could not change that.');
      },

      // A QM replaces another character's item list; returns the new itemsEdit stamp
      async setItems(characterId, items) {
        const { data, error } = await sb.rpc('set_items', { p_character: characterId, p_items: items });
        if (error) throw friendly(error, 'Could not save the items.');
        return data;
      },
      // Load: spend AP (apLeft is the AP left afterwards), take 1 ammo, mark the weapon loaded. Returns { items, itemsEdit }.
      async loadWeapon(characterId, itemUid, apLeft) {
        const { data, error } = await sb.rpc('load_weapon', { p_character: characterId, p_item: itemUid, p_ap: apLeft });
        if (error) throw friendly(error, 'Could not load that weapon.');
        return data;
      },
      async setLoaded(characterId, itemUid, loaded) {
        const { data, error } = await sb.rpc('set_loaded', { p_character: characterId, p_item: itemUid, p_loaded: !!loaded });
        if (error) throw friendly(error, 'Could not change that weapon.');
        return data;
      },

      // comboLeaderId: the Finisher starts the Combo Attack that Leader set up (see setCombo); the Leader's roll follows (comboLeaderAttack)
      async startAttack(attackerId, targetId, total, power, text, comboLeaderId) {
        const { data, error } = await sb.rpc('start_attack', { p_attacker: attackerId, p_target: targetId, p_total: total, p_power: power, p_text: text || '', p_combo: comboLeaderId || null });
        if (error) throw friendly(error, 'Could not start the attack.');
        return data;
      },

      // critFailIds: attackers who rolled a Critical Miss; they recover 2 less AP at the start of their next turn
      // usedCritIds: attackers whose Next Hit Critical flag was spent; nextCritIds: attackers who gain it (Tracking Perfect Combo)
      async resolveAttack(campaignId, attackId, damage, text, critFailIds, usedCritIds, nextCritIds) {
        const { error } = await sb.rpc('resolve_attack', { p_campaign: campaignId, p_attack: attackId, p_damage: damage, p_text: text || '', p_crit_fail: critFailIds || [],
          p_used_crit: usedCritIds || [], p_next_crit: nextCritIds || [] });
        if (error) throw friendly(error, 'Could not answer the attack.');
      },
      async setCombo(leaderId, finisherId, skill, level, total, text) {
        const { error } = await sb.rpc('set_combo', { p_leader: leaderId, p_finisher: finisherId, p_skill: skill, p_level: level, p_total: total, p_text: text || '' });
        if (error) throw friendly(error, 'Could not set up the combo.');
      },
      async cancelCombo(leaderId) {
        const { error } = await sb.rpc('cancel_combo', { p_leader: leaderId });
        if (error) throw friendly(error, 'Could not cancel the combo.');
      },
      async comboLeaderAttack(campaignId, attackId, total, power, text) {
        const { error } = await sb.rpc('combo_leader_attack', { p_campaign: campaignId, p_attack: attackId, p_total: total, p_power: power, p_text: text || '' });
        if (error) throw friendly(error, "Could not add the Leader's attack.");
      },
      async cancelComboAttack(campaignId, attackId) {
        const { error } = await sb.rpc('cancel_combo_attack', { p_campaign: campaignId, p_attack: attackId });
        if (error) throw friendly(error, 'Could not call off the combo attack.');
      },

      async setExplodeTokens(characterId, value) {
        const { error } = await sb.rpc('set_explode_tokens', { p_character: characterId, p_value: value });
        if (error) throw friendly(error, 'Could not change the Explode Tokens.');
      },

      async dealDamage(attackerId, targetId, amount) {
        const { error } = await sb.rpc('deal_damage', { p_attacker: attackerId, p_target: targetId, p_amount: amount });
        if (error) throw friendly(error, 'Could not apply the attack.');
      },
      async setCharacterInactive(campaignId, characterId, inactive) {
        const { error } = await sb.rpc('set_character_inactive', { p_campaign: campaignId, p_character: characterId, p_inactive: !!inactive });
        if (error) throw friendly(error, 'Could not change that.');
      },
      // Campaign codex (kind 'mobs' or 'items'): any member records an entry once; only a QM removes one. campaign.codex is { mobs: {key: entry}, items: {key: entry} }.
      async codexRecord(campaignId, kind, key, entry) {
        const { error } = await sb.rpc('codex_record', { p_campaign: campaignId, p_kind: kind, p_key: key, p_entry: entry });
        if (error) throw friendly(error, 'Could not update the codex.');
      },
      async codexRemove(campaignId, kind, key) {
        const { error } = await sb.rpc('codex_remove', { p_campaign: campaignId, p_kind: kind, p_key: key });
        if (error) throw friendly(error, 'Could not update the codex.');
      },
      // Compendiums: your own, plus (read only) the ones used by campaigns where you are QM
      async listCompendiums() {
        const { data, error } = await sb.from('compendiums').select('id,owner,name,data,updated_at').order('updated_at', { ascending: false });
        if (error) throw friendly(error, 'Could not load your compendiums.');
        return (data || []).map((r) => ({ id: r.id, name: r.name, data: r.data || {}, ownerId: r.owner, mine: r.owner === uid, updated: r.updated_at }));
      },
      async saveCompendium(c) {
        const name = cleanCompendiumName(c.name);
        const { error } = await sb.from('compendiums').upsert({ id: c.id, owner: uid, name, data: c.data || {}, updated_at: new Date().toISOString() }, { onConflict: 'id' });
        if (error) throw friendly(error, /size|check/i.test(error.message || '') ? 'That compendium is too big to save.' : 'Could not save the compendium.');
      },
      async deleteCompendium(id) {
        const { error } = await sb.from('compendiums').delete().eq('id', id);
        if (error) throw friendly(error, 'Could not delete the compendium.');
      },
      async setCampaignCompendium(campaignId, compendiumId) {
        const { error } = await sb.rpc('set_campaign_compendium', { p_campaign: campaignId, p_compendium: compendiumId || null });
        if (error) throw friendly(error, 'Could not change the campaign\'s compendium.');
      },
      async qmDealDamage(campaignId, targetId, amount) {
        const { error } = await sb.rpc('qm_deal_damage', { p_campaign: campaignId, p_target: targetId, p_amount: amount });
        if (error) throw friendly(error, 'Could not apply the damage.');
      },

      async startTurn(characterId, spGain, spMax, apMax) {
        const { data, error } = await sb.rpc('start_turn', { p_character: characterId, p_sp_gain: spGain, p_sp_max: spMax, p_ap_max: apMax == null ? null : apMax });
        if (error) throw friendly(error, 'Could not start the turn.');
        return data || { applied: false };
      },

      async startEncounter(campaignId) {
        const { error } = await sb.rpc('start_encounter', { p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not start the encounter.');
      },

      async endEncounter(campaignId) {
        const { error } = await sb.rpc('end_encounter', { p_campaign: campaignId });
        if (error) throw friendly(error, 'Could not end the encounter.');
      },

      async setInitiative(campaignId, characterId, die, ib) {
        const { error } = await sb.rpc('set_initiative', { p_campaign: campaignId, p_character: characterId, p_die: die, p_ib: ib });
        if (error) throw friendly(error, 'Could not save that initiative.');
      },

      async deleteCampaign(campaignId) {
        const { data, error } = await sb.from('campaigns').delete().eq('id', campaignId).select('id');
        if (error) throw friendly(error, 'Could not delete the campaign.');
        if (!data || !data.length) throw fail('Only a QM can delete the campaign.');
      }
    };

    async function removeRow(campaignId, userId, fallback) {
      const { data, error } = await sb.from('campaign_members').delete()
        .eq('campaign_id', campaignId).eq('user_id', userId).select('user_id');
      if (error) throw friendly(error, fallback);
      if (!data || !data.length) throw fail(userId === uid ? fallback : 'Only a QM can remove players.');
    }
  }

  const ONLY_PLAYER = 'You are the only player in this campaign, so you must stay QM.';
  function cleanCompendiumName(name) {
    const n = String(name == null ? '' : name).trim();
    if (!n) throw fail('Give the compendium a name.');
    if (n.length > 60) throw fail('That name is too long (60 letters at most).');
    return n;
  }
  function cleanCampaignName(name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (!clean) throw fail('Give the campaign a name.');
    if (clean.length > 40) throw fail('Campaign names can be up to 40 characters.');
    return clean;
  }
  // QMs first, then by username
  function sortMembers(list) {
    return list.slice().sort((a, b) =>
      (a.role === b.role ? 0 : a.role === 'qm' ? -1 : 1) || String(a.username).localeCompare(String(b.username)));
  }

  /* ================= Local (this device only) ================= */
  function localBackend(env) {
    const memStore = {};
    const rd = (k, d) => {
      try { const v = env.localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) { /* use memory */ }
      return k in memStore ? memStore[k] : d;
    };
    const wr = (k, v) => { memStore[k] = v; try { env.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memory only */ } };
    const del = (k) => { delete memStore[k]; try { env.localStorage.removeItem(k); } catch (e) { /* ignore */ } };

    const newId = () => (env.crypto && env.crypto.randomUUID) ? env.crypto.randomUUID() : 'i' + Date.now() + Math.random().toString(16).slice(2);
    const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
    const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    async function hashPassword(password, salt) {
      const subtle = env.crypto && env.crypto.subtle;
      if (!subtle) throw fail('This browser cannot create preview accounts.');
      const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
      return b64(new Uint8Array(bits));
    }

    let uid = null;
    const ACC = 'bsh.accounts', SES = 'bsh.session', GR = 'bsh.campaigns', COMP = 'bsh.compendiums', GIFTS = 'bsh.gifts', MAPS = 'bsh.maps', CH = (u) => 'bsh.chars.' + u;
    const pub = (a) => ({ id: a.email, email: a.email, name: a.name, username: a.username });

    return {
      mode: 'local',

      async init() {
        const email = rd(SES, null);
        const a = email && rd(ACC, {})[email];
        if (!a) return null;
        uid = a.email;
        return pub(a);
      },

      async signUp({ name, username, email, password }) {
        const accounts = rd(ACC, {});
        if (accounts[email]) throw fail('That email already has an account. Try logging in.');
        if (Object.values(accounts).some((a) => a.username.toLowerCase() === username.toLowerCase())) {
          throw fail('That username is already taken. Try another.');
        }
        const salt = b64(env.crypto.getRandomValues(new Uint8Array(16)));
        accounts[email] = { email, name, username, salt, hash: await hashPassword(password, salt), created: Date.now() };
        wr(ACC, accounts);
        wr(SES, email);
        uid = email;
        return pub(accounts[email]);
      },

      async signIn({ username, password }) {
        const a = Object.values(rd(ACC, {})).find((x) => x.username.toLowerCase() === String(username).toLowerCase());
        if (!a || (await hashPassword(password, a.salt)) !== a.hash) throw fail('Username or password is incorrect.');
        wr(SES, a.email);
        uid = a.email;
        return pub(a);
      },

      async signOut() { uid = null; del(SES); },

      // Email recovery needs the online version
      async requestReset() { throw fail('Password recovery by email only works in the online version. Preview accounts live on this device only.'); },
      takeRecovery() { return null; },
      async setNewPassword() { throw fail('Password recovery needs the online version.'); },

      // Preview only: erase every account, character and campaign saved on this device
      async wipe() {
        const keys = [];
        try { for (let i = 0; i < env.localStorage.length; i++) { const k = env.localStorage.key(i); if (k && k.indexOf('bsh.') === 0) keys.push(k); } } catch (e) { /* ignore */ }
        Object.keys(memStore).forEach((k) => { if (keys.indexOf(k) < 0) keys.push(k); });
        keys.forEach(del);
        uid = null;
      },

      async listCharacters() { return rd(CH(uid), []); },

      async saveCharacter(ch) {
        if (ch.campaignId) {
          const g = rd(GR, []).find((x) => x.id === ch.campaignId);
          if (!g || !g.members.some((m) => m.userId === uid)) throw fail('Join that campaign before linking a character to it.');
        }
        const list = rd(CH(uid), []);
        const i = list.findIndex((c) => c.id === ch.id);
        ch = Object.assign({}, ch);
        // NPC flags and an NPC's campaign are not editable from a character save
        const old = i >= 0 ? list[i] : null;
        ch.isNpc = !!(old && old.isNpc); ch.npcVisible = !!(old && old.npcVisible); ch.sheetHidden = !!(old && old.sheetHidden);
        if (old && JSON.stringify(old.itemsEdit || null) !== JSON.stringify(ch.itemsEdit || null)) {   // a stale copy: keep items changed by a QM, a load or a shot
          ch.items = old.items; if (old.itemsEdit) ch.itemsEdit = old.itemsEdit; else delete ch.itemsEdit;
        }
        if (ch.isNpc) ch.campaignId = old.campaignId;
        if (i >= 0) list[i] = ch; else list.push(ch);
        wr(CH(uid), list);
      },

      async deleteCharacter(id) { wr(CH(uid), rd(CH(uid), []).filter((c) => c.id !== id)); },

      /* ----- campaigns (shared by every account on this device) ----- */
      async listCampaigns() {
        const accounts = rd(ACC, {});
        return rd(GR, []).map((g) => ({
          id: g.id, name: g.name, createdBy: g.createdBy, createdAt: g.createdAt,
          encounter: g.encounter ? Object.assign({}, g.encounter, { tokens: undefined, events: (g.encounter.events || []).filter((e) => e.visible || isQmOf(g, uid)) }) : null,
          spawn: g.spawn || null, inactive: g.inactive || [], codex: g.codex || {}, compendiumId: g.compendiumId || null,
          members: sortMembers(g.members.map((m) => {
            const a = accounts[m.userId] || {};
            return { userId: m.userId, username: a.username || '?', name: a.name || '', role: m.role, joinedAt: m.joinedAt };
          }))
        })).sort((a, b) => b.createdAt - a.createdAt);
      },

      async createCampaign(name) {
        const clean = cleanCampaignName(name);
        const campaigns = rd(GR, []);
        const id = (env.crypto && env.crypto.randomUUID) ? env.crypto.randomUUID() : 'g' + Date.now() + Math.random().toString(16).slice(2);
        const now = Date.now();
        campaigns.push({ id, name: clean, createdBy: uid, createdAt: now, members: [{ userId: uid, role: 'qm', joinedAt: now }] });
        wr(GR, campaigns);
        return id;
      },

      async joinCampaign(campaignId) {
        const campaigns = rd(GR, []);
        const g = campaigns.find((x) => x.id === campaignId);
        if (!g) throw fail('That campaign no longer exists.');
        if (!g.members.some((m) => m.userId === uid)) g.members.push({ userId: uid, role: 'member', joinedAt: Date.now() });
        wr(GR, campaigns);
      },

      async leaveCampaign(campaignId) { return localRemove(campaignId, uid); },
      async removeMember(campaignId, userId) { return localRemove(campaignId, userId); },

      async setQm(campaignId, userId, isQm) {
        const campaigns = rd(GR, []);
        const g = campaigns.find((x) => x.id === campaignId);
        if (!g) throw fail('That campaign no longer exists.');
        if (!isQmOf(g, uid)) throw fail('Only a QM can change roles.');
        const m = g.members.find((x) => x.userId === userId);
        if (!m) throw fail('That player is not in the campaign.');
        if (!isQm && m.role === 'qm') qmHandoff(g, userId, false);
        m.role = isQm ? 'qm' : 'member';
        wr(GR, campaigns);
      },

      async becomePlayer(campaignId) {
        const campaigns = rd(GR, []);
        const g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can become a player.');
        qmHandoff(g, uid, false);
        g.members.find((x) => x.userId === uid).role = 'member';
        wr(GR, campaigns);
      },

      async listCampaignCharacters(campaignId) {
        const g = rd(GR, []).find((x) => x.id === campaignId);
        if (!g || !g.members.some((m) => m.userId === uid)) return [];
        const accounts = rd(ACC, {}), qm = isQmOf(g, uid), out = [];
        Object.keys(accounts).forEach((email) => {
          rd(CH(email), []).forEach((c) => {
            if (c.campaignId !== campaignId) return;
            if (c.isNpc && !c.npcVisible && !qm && email !== uid) return;
            if (c.isNpc && c.sheetHidden && !qm && email !== uid) {   // on the roster, sheet private: name only
              out.push({ ch: { id: c.id, campaignId, isNpc: true, npcVisible: true, sheetHidden: true, info: { name: (c.info && c.info.name) || '' } },
                ownerId: email, owner: accounts[email].username, mine: false, stub: true });
              return;
            }
            out.push({ ch: Object.assign({}, c), ownerId: email, owner: accounts[email].username, mine: email === uid });
          });
        });
        return out;
      },

      async createNpc(campaignId, ch) {
        const g = rd(GR, []).find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can create NPCs.');
        const list = rd(CH(uid), []);
        if (list.some((x) => x.id === ch.id)) throw fail('That NPC already exists.');
        list.push(Object.assign({}, ch, { campaignId, isNpc: true, npcVisible: false }));
        wr(CH(uid), list);
      },

      async unlinkNpc(characterId) {
        const f = localFind(characterId), g = f && f.c.isNpc && f.c.campaignId && rd(GR, []).find((x) => x.id === f.c.campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can take an NPC out of a campaign.');
        dropFromEncounter(g.id, characterId);
        if (isMobNpc(f.c)) { wr(CH(f.email), f.list.filter((x) => x.id !== characterId)); return; }   // a generated mob is deleted
        f.c.campaignId = null; f.c.npcVisible = false; f.c.sheetHidden = false;
        wr(CH(f.email), f.list);
      },
      async moveNpc(characterId, campaignId) {
        const f = localFind(characterId), campaigns = rd(GR, []), g = f && f.c.isNpc && f.c.campaignId && campaigns.find((x) => x.id === f.c.campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can move an NPC.');
        const to = campaigns.find((x) => x.id === campaignId);
        if (!to || !isQmOf(to, uid)) throw fail('You must be a QM of the campaign you move the NPC to.');
        if (to.id === g.id) return;
        if (!to.members.some((m) => m.userId === f.email)) throw fail("The NPC's owner is not in that campaign.");
        dropFromEncounter(g.id, characterId);
        f.c.campaignId = to.id; f.c.npcVisible = false; f.c.sheetHidden = false;
        wr(CH(f.email), f.list);
      },
      async addNpcToCampaign(characterId, campaignId) {
        const f = localFind(characterId);
        if (!f || !f.c.isNpc || f.email !== uid) throw fail('You can only add your own NPCs to a campaign.');
        if (f.c.campaignId) throw fail('That NPC is already in a campaign.');
        const to = rd(GR, []).find((x) => x.id === campaignId);
        if (!to || !isQmOf(to, uid)) throw fail('You must be a QM of that campaign.');
        f.c.campaignId = to.id; f.c.npcVisible = false; f.c.sheetHidden = false;
        wr(CH(f.email), f.list);
      },
      async giveNpc(characterId, playerId) {
        const f = localFind(characterId), g = f && f.c.isNpc && f.c.campaignId && rd(GR, []).find((x) => x.id === f.c.campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can give an NPC to a player.');
        const m = g.members.find((x) => x.userId === playerId);
        if (!m) throw fail('That player is not in the campaign.');
        dropFromEncounter(g.id, characterId);
        wr(CH(f.email), f.list.filter((x) => x.id !== characterId));
        const { isNpc, npcVisible, sheetHidden, ...rest } = f.c;
        wr(CH(playerId), rd(CH(playerId), []).concat([rest]));
      },

      async makeNpc(characterId) {
        const f = localFind(characterId);
        if (!f) throw fail('Character not found.');
        const g = f.c.campaignId && rd(GR, []).find((x) => x.id === f.c.campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can make a character an NPC.');
        if (f.c.isNpc) return;
        wr(CH(f.email), f.list.filter((x) => x.id !== characterId));
        const mine = rd(CH(uid), []);
        mine.push(Object.assign({}, f.c, { isNpc: true, npcVisible: false }));
        wr(CH(uid), mine);
      },

      async giveCharacter(characterId, playerId) {
        const list = rd(CH(uid), []);
        const c = list.find((x) => x.id === characterId);
        if (!c) throw fail('You can only hand over your own characters.');
        if (c.isNpc) throw fail('An NPC cannot be handed over.');
        const g = c.campaignId && rd(GR, []).find((x) => x.id === c.campaignId);
        if (!g) throw fail('Link the character to a campaign before handing it over.');
        if (!g.members.some((m) => m.userId === playerId)) throw fail('That player is not in the campaign.');
        if (playerId === uid) return;
        wr(CH(uid), list.filter((x) => x.id !== characterId));
        wr(CH(playerId), rd(CH(playerId), []).concat([c]));
      },

      async giveItem(fromId, toId, item) {
        const accounts = rd(ACC, {});
        const ownerOf = (id) => Object.keys(accounts).find((e) => rd(CH(e), []).some((c) => c.id === id));
        const toOwner = ownerOf(toId), to = toOwner && rd(CH(toOwner), []).find((c) => c.id === toId);
        const nm = String((item && item.name) || '').trim(), q = Number(item && item.qty);
        if (!nm) throw fail('Give the item a name first.');
        if (!Number.isInteger(q) || q < 1 || q > 9999) throw fail('Choose a quantity of at least 1.');
        const g = to && to.campaignId && rd(GR, []).find((x) => x.id === to.campaignId);
        if (!g || !g.members.some((m) => m.userId === uid)) throw fail('That character is not in your campaign.');
        const qm = isQmOf(g, uid);
        let who = 'The QM';
        if (fromId) {
          if (fromId === toId) throw fail('Choose a different character.');
          const from = rd(CH(uid), []).find((c) => c.id === fromId);
          if (!from) throw fail('You can only give items from your own characters.');
          if (from.campaignId !== to.campaignId) throw fail('Both characters must be in the same campaign.');
          who = (from.info && String(from.info.name || '').trim()) || 'Someone';
        } else if (!qm) throw fail('Only a QM can give items from nowhere.');
        if (to.isNpc && !qm) throw fail('Only a QM can give items to NPCs.');
        const gifts = rd(GIFTS, []);
        gifts.push({ id: newId(), characterId: toId, fromName: who,
          item: { name: nm.slice(0, 60), qty: q, charges: item.charges == null ? null : item.charges, desc: String(item.desc || '').slice(0, 4000),
                  wearable: item.wearable === true, weapon: item.weapon === true, magic: item.magic === true,
                  weaponProps: item.weaponProps && typeof item.weaponProps === 'object' ? item.weaponProps : {},
                  magicProps: item.magicProps && typeof item.magicProps === 'object' ? item.magicProps : {},
                  buffs: Array.isArray(item.buffs) && item.buffs.length <= 30 ? item.buffs : [],
                  twoHanded: item.twoHanded === true, attacks: Array.isArray(item.attacks) && item.attacks.length <= 20 ? item.attacks : [],
                  cref: item.cref && typeof item.cref === 'object' && !Array.isArray(item.cref) && JSON.stringify(item.cref).length <= 200 ? item.cref : null } });
        wr(GIFTS, gifts);
      },

      async pendingGifts() {
        const mine = new Set(rd(CH(uid), []).map((c) => c.id));
        return rd(GIFTS, []).filter((x) => mine.has(x.characterId));
      },

      async ackGifts(ids) {
        const drop = new Set(ids || []), mine = new Set(rd(CH(uid), []).map((c) => c.id));
        wr(GIFTS, rd(GIFTS, []).filter((x) => !(drop.has(x.id) && mine.has(x.characterId))));
      },

      async setNpcSheetHidden(characterId, hidden) {
        for (const email of Object.keys(rd(ACC, {}))) {
          const list = rd(CH(email), []);
          const c = list.find((x) => x.id === characterId && x.isNpc);
          if (!c) continue;
          const g = rd(GR, []).find((x) => x.id === c.campaignId);
          if (!g || !isQmOf(g, uid)) throw fail('Only a QM can hide an NPC sheet.');
          c.sheetHidden = !!hidden;
          wr(CH(email), list);
          return;
        }
        throw fail('Only a QM can hide an NPC sheet.');
      },

      async setNpcVisible(characterId, visible) {
        for (const email of Object.keys(rd(ACC, {}))) {
          const list = rd(CH(email), []);
          const c = list.find((x) => x.id === characterId && x.isNpc);
          if (!c) continue;
          const g = rd(GR, []).find((x) => x.id === c.campaignId);
          if (!g || !isQmOf(g, uid)) throw fail('Only a QM can change NPC visibility.');
          c.npcVisible = !!visible;
          wr(CH(email), list);
          return;
        }
        throw fail('Only a QM can change NPC visibility.');
      },

      async startEncounter(campaignId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can start an encounter.');
        if (g.encounter) throw fail('An encounter is already active.');
        g.encounter = { id: (env.crypto && env.crypto.randomUUID) ? env.crypto.randomUUID() : 'e' + Date.now() + Math.random().toString(16).slice(2), startedAt: Date.now(), round: 1, seq: 0, moved: false, initiatives: {} };
        wr(GR, campaigns);
      },

      async endEncounter(campaignId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can end an encounter.');
        g.encounter = null;
        wr(GR, campaigns);
        Object.keys(rd(ACC, {})).forEach((email) => {   // Next Hit Critical flags end with the encounter
          const list = rd(CH(email), []); let hit = false;
          list.forEach((c) => { if (c.campaignId === campaignId && c.vitals && c.vitals.nextCrit) { const v = Object.assign({}, c.vitals); delete v.nextCrit; c.vitals = v; hit = true; } });
          if (hit) wr(CH(email), list);
        });
      },

      async setInitiative(campaignId, characterId, die, ib) {
        if (!Number.isInteger(die) || die < 1 || die > 20) throw fail('The d20 roll must be between 1 and 20.');
        if (typeof ib !== 'number' || !isFinite(ib)) throw fail('That Initiative Bonus is not valid.');
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !g.encounter) throw fail('There is no active encounter.');
        const qm = isQmOf(g, uid);
        let found = null;
        Object.keys(rd(ACC, {})).forEach((email) => {
          const c = rd(CH(email), []).find((x) => x.id === characterId && x.campaignId === campaignId);
          if (c) found = { c, email };
        });
        if (!found) throw fail('That character is not in this campaign.');
        if (found.c.isNpc) { if (!qm) throw fail('Only a QM can roll for an NPC.'); }
        else if (found.email !== uid && !qm) throw fail('You can only roll for your own characters.');
        if (!qm && g.encounter.initiatives[characterId]) throw fail('Initiative is already set for that character.');
        const total = die + ib + (die === 1 ? -5 : die === 20 ? 5 : 0);
        g.encounter.initiatives[characterId] = { die, ib, total, tb: Math.random(), by: found.email === uid ? 'player' : 'qm' };
        if (!g.encounter.moved) g.encounter.turn = localOrder(g)[0] || null;   // until someone moves it, the turn sits on the top of the order
        wr(GR, campaigns);
      },

      async addEvent(campaignId, ev) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can add an event.');
        if (!g.encounter) throw fail('There is no active encounter.');
        const name = String(ev.name || '').trim();
        if (!name) throw fail('Give the event a name first.');
        if (name.length > 60) throw fail('That name is too long.');
        if (typeof ev.total !== 'number' || !isFinite(ev.total) || Math.abs(ev.total) > 1000) throw fail('That initiative is not valid.');
        if (ev.oneTime && !(Number.isInteger(ev.round) && ev.round >= (g.encounter.round || 1) && ev.round <= 10000)) throw fail('Pick a round that has not passed yet.');
        g.encounter.events = (g.encounter.events || []).concat([{ id: (env.crypto && env.crypto.randomUUID) ? env.crypto.randomUUID() : 'ev' + Date.now() + Math.random().toString(16).slice(2),
          name, visible: false, total: ev.total, tb: Math.random(), oneTime: !!ev.oneTime, round: ev.oneTime ? ev.round : null }]);
        if (!g.encounter.moved) g.encounter.turn = localOrder(g)[0] || null;
        wr(GR, campaigns);
      },
      async setEventVisible(campaignId, eventId, visible) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can show or hide an event.');
        const e = g.encounter && (g.encounter.events || []).find((x) => x.id === eventId);
        if (!e) throw fail('That event is gone.');
        e.visible = !!visible; wr(GR, campaigns);
      },
      async removeEvent(campaignId, eventId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can remove an event.');
        if (!g.encounter) return;
        g.encounter.events = (g.encounter.events || []).filter((x) => x.id !== eventId);
        if (g.encounter.turn === eventId) g.encounter.turn = localOrder(g)[0] || null;
        wr(GR, campaigns);
      },

      async setVital(characterId, key, value) {
        const tok = key === 'bt' || key === 'wt' || key === 'bleeding';
        if (key !== 'apRemaining' && key !== 'spRemaining' && !tok) throw fail('That cannot be changed this way.');
        if (typeof value !== 'number' || !isFinite(value)) throw fail('That number is not valid.');
        if (tok && (!Number.isInteger(value) || value < 0 || value > 1000 || (key === 'bleeding' && value > 1))) throw fail('That number is not valid.');
        const f = localFind(characterId);
        if (!f || !f.c.campaignId) throw fail('That character is not in a campaign.');
        const g = rd(GR, []).find((x) => x.id === f.c.campaignId);
        if (!g || (!g.encounter && !tok)) throw fail('Points can only be spent during an encounter.');
        if (f.email !== uid && !isQmOf(g, uid)) throw fail('You can only spend points for your own characters.');
        f.c.vitals = Object.assign({}, f.c.vitals, { [key]: value });
        wr(CH(f.email), f.list);
      },

      async setItems(characterId, items) {
        if (!Array.isArray(items) || items.length > 300 || JSON.stringify(items).length > 400000) throw fail('That item list is not valid.');
        const f = localFind(characterId);
        if (!f || !f.c.campaignId) throw fail('That character is not in a campaign.');
        const g = rd(GR, []).find((x) => x.id === f.c.campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can change another character\'s items.');
        const stamp = { at: newId(), by: uid, why: 'qm' };
        f.c.items = JSON.parse(JSON.stringify(items)); f.c.itemsEdit = stamp;
        wr(CH(f.email), f.list);
        return stamp;
      },
      async loadWeapon(characterId, itemUid, apLeft) {
        if (typeof apLeft !== 'number' || !isFinite(apLeft) || apLeft < -1000 || apLeft > 100000) throw fail('That number is not valid.');
        const f = localFind(characterId);
        if (!f || !f.c.campaignId) throw fail('That character is not in a campaign.');
        const g = rd(GR, []).find((x) => x.id === f.c.campaignId);
        if (f.email !== uid && !(g && isQmOf(g, uid))) throw fail('You can only load weapons for your own characters.');
        if (!g || !g.encounter) throw fail('Weapons can only be loaded during an encounter.');
        const items = Array.isArray(f.c.items) ? f.c.items : [], w = items.find((x) => x && x.uid === itemUid && x.weapon === true);
        if (!w) throw fail('That weapon is gone.');
        if (w.loaded === true) throw fail('That weapon is already loaded.');
        const ammo = String((w.weaponProps && w.weaponProps.ammo) || '').trim();
        if (ammo) {
          const qOf = (x) => (typeof x.qty === 'number' ? x.qty : x.qty == null || x.qty === '' ? 1 : 0);
          const a = items.find((x) => x && x !== w && String(x.name || '').trim().toLowerCase() === ammo.toLowerCase() && qOf(x) >= 1);
          if (!a) throw fail('No ' + ammo + ' left to load.');
          a.qty = qOf(a) - 1;
        }
        w.loaded = true;
        const stamp = { at: newId(), by: uid, why: 'load' };
        f.c.items = items; f.c.itemsEdit = stamp; f.c.vitals = Object.assign({}, f.c.vitals, { apRemaining: apLeft });
        wr(CH(f.email), f.list);
        return { items: JSON.parse(JSON.stringify(items)), itemsEdit: stamp };
      },
      async setLoaded(characterId, itemUid, loaded) {
        const f = localFind(characterId);
        if (!f || !f.c.campaignId) throw fail('That character is not in a campaign.');
        const g = rd(GR, []).find((x) => x.id === f.c.campaignId);
        if (f.email !== uid && !(g && isQmOf(g, uid))) throw fail('You can only change your own characters.');
        const items = Array.isArray(f.c.items) ? f.c.items : [], w = items.find((x) => x && x.uid === itemUid);
        if (!w) throw fail('That weapon is gone.');
        w.loaded = !!loaded;
        const stamp = { at: newId(), by: uid, why: loaded ? 'load' : 'fire' };
        f.c.itemsEdit = stamp;
        wr(CH(f.email), f.list);
        return { items: JSON.parse(JSON.stringify(items)), itemsEdit: stamp };
      },

      async startAttack(attackerId, targetId, total, power, text, comboLeaderId) {
        if (![total, power].every((n) => typeof n === 'number' && isFinite(n) && Math.abs(n) <= 100000)) throw fail('That number is not valid.');
        const a = localFind(attackerId), t = localFind(targetId);
        if (!a || !a.c.campaignId || !t || t.c.campaignId !== a.c.campaignId) throw fail('Both characters must be in the same campaign.');
        const camps = rd(GR, []), g = camps.find((x) => x.id === a.c.campaignId);
        if (!g || !g.encounter) throw fail('Attacks can only be made during an encounter.');
        const qm = isQmOf(g, uid);
        if (a.email !== uid && !qm) throw fail('You can only attack with your own characters.');
        if (t.c.isNpc && !qm && (!t.c.npcVisible || t.c.sheetHidden)) throw fail('You cannot attack that character.');
        if (g.encounter.attack) throw fail('Another attack is waiting for a response.');
        const id = newId();
        delete g.encounter.lastAttack;
        const atk = { id, attacker: attackerId, target: targetId, total, power, text: String(text || '').slice(0, 300) };
        if (comboLeaderId) {   // the Finisher starts the combo their Leader set up; the Leader's roll comes next
          const cb = g.encounter.combos && g.encounter.combos[comboLeaderId];
          if (!cb || cb.finisher !== attackerId) throw fail('That combo is not waiting for this character.');
          if (targetId === comboLeaderId || targetId === attackerId) throw fail('Pick someone else to attack.');
          atk.combo = Object.assign({}, cb, { state: 'leader' });
          delete g.encounter.combos[comboLeaderId];
        }
        g.encounter.attack = atk;
        wr(GR, camps);
        return id;
      },
      async setCombo(leaderId, finisherId, skill, level, total, text) {
        if (!['Battlewise', 'Intimidate', 'Athletics', 'Acrobatics', 'Grappling', 'Tracking', 'Courage', 'Handling'].includes(skill)) throw fail('That is not a combo skill.');
        if (![0, 10, 15, 20, 25].includes(level) || typeof total !== 'number' || !isFinite(total) || Math.abs(total) > 100000) throw fail('That number is not valid.');
        if (leaderId === finisherId) throw fail('Pick another character as the Finisher.');
        const l = localFind(leaderId), f = localFind(finisherId);
        if (!l || !l.c.campaignId || !f || f.c.campaignId !== l.c.campaignId) throw fail('Both characters must be in the same campaign.');
        const camps = rd(GR, []), g = camps.find((x) => x.id === l.c.campaignId);
        if (l.email !== uid && !isQmOf(g, uid)) throw fail('You can only start a combo with your own characters.');
        if (!g.encounter) throw fail('Combo Attacks can only be made during an encounter.');
        const ord = localOrder(g);
        if (!ord.includes(leaderId) || !ord.includes(finisherId)) throw fail('Both characters must be in the encounter.');
        g.encounter.combos = Object.assign({}, g.encounter.combos, { [leaderId]: { leader: leaderId, finisher: finisherId, skill, level, total, text: String(text || '').slice(0, 300) } });
        wr(GR, camps);
      },
      async cancelCombo(leaderId) {
        const l = localFind(leaderId);
        if (!l || !l.c.campaignId) throw fail('That character is not in a campaign.');
        const camps = rd(GR, []), g = camps.find((x) => x.id === l.c.campaignId), cb = g && g.encounter && g.encounter.combos && g.encounter.combos[leaderId];
        if (!cb) return;
        const f = localFind(cb.finisher), qm = isQmOf(g, uid);
        if (l.email !== uid && !(f && f.email === uid) && !qm) throw fail('You cannot cancel that combo.');
        delete g.encounter.combos[leaderId];
        wr(GR, camps);
        if (l.email !== uid) {   // not the Leader's own call: give the 3 AP back
          const v = l.c.vitals || {}, ap = v.apRemaining == null || v.apRemaining === '' ? null : Number(v.apRemaining);
          if (ap !== null) { l.c.vitals = Object.assign({}, v, { apRemaining: ap + 3 }); wr(CH(l.email), l.list); }
        }
      },
      async comboLeaderAttack(campaignId, attackId, total, power, text) {
        if (![total, power].every((n) => typeof n === 'number' && isFinite(n) && Math.abs(n) <= 100000)) throw fail('That number is not valid.');
        const camps = rd(GR, []), g = camps.find((x) => x.id === campaignId), at = g && g.encounter && g.encounter.attack;
        if (!at || at.id !== attackId || !at.combo || at.combo.state !== 'leader') throw fail('That combo attack is not waiting for the Leader.');
        const l = localFind(at.combo.leader);
        if (!l || l.c.campaignId !== campaignId) throw fail('That combo attack is not waiting for the Leader.');
        if (l.email !== uid && !isQmOf(g, uid)) throw fail("Only the Leader's player can roll for them.");
        at.combo = Object.assign({}, at.combo, { state: 'defend', lTotal: total, lPower: power, lText: String(text || '').slice(0, 300) });
        wr(GR, camps);
      },
      async cancelComboAttack(campaignId, attackId) {
        const camps = rd(GR, []), g = camps.find((x) => x.id === campaignId), at = g && g.encounter && g.encounter.attack;
        if (!at || at.id !== attackId || !at.combo || at.combo.state !== 'leader') return;
        const f = localFind(at.attacker), l = localFind(at.combo.leader);
        if (!(f && f.email === uid) && !(l && l.email === uid) && !isQmOf(g, uid)) throw fail('You cannot call that off.');
        g.encounter.lastAttack = { id: attackId, attacker: at.attacker, target: at.target, text: 'The combo attack was called off.' };
        delete g.encounter.attack;
        wr(GR, camps);
      },

      async resolveAttack(campaignId, attackId, damage, text, critFailIds, usedCritIds, nextCritIds) {
        if (typeof damage !== 'number' || !isFinite(damage) || damage < 0 || damage > 100000) throw fail('That number is not valid.');
        const camps = rd(GR, []), g = camps.find((x) => x.id === campaignId), at = g && g.encounter && g.encounter.attack;
        if (!at || at.id !== attackId) throw fail('That attack is no longer waiting.');
        const t = localFind(at.target);
        if (!t || t.c.campaignId !== campaignId) throw fail('That attack is no longer waiting.');
        if (t.email !== uid && !isQmOf(g, uid)) throw fail("Only the target's player can answer this attack.");
        if (damage > 0) {
          const v = Object.assign({}, t.c.vitals);
          v.damage = Math.round(((Number(v.damage) || 0) + damage) * 100) / 100;
          t.c.vitals = v; wr(CH(t.email), t.list);
        }
        if (at.combo && at.combo.state !== 'defend') throw fail('The combo partner has not rolled yet.');
        (critFailIds || []).forEach((id) => {   // a Critical Miss: 2 less AP recovered at the start of their next turn
          if (id !== at.attacker && !(at.combo && id === at.combo.leader)) return;
          const f = localFind(id);
          if (f && f.c.campaignId === campaignId) { f.c.vitals = Object.assign({}, f.c.vitals, { apPenalty: 2 }); wr(CH(f.email), f.list); }
        });
        const ofAttack = (id) => id === at.attacker || !!(at.combo && id === at.combo.leader);
        (usedCritIds || []).filter(ofAttack).forEach((id) => {   // a spent Next Hit Critical flag
          const f = localFind(id);
          if (f && f.c.campaignId === campaignId) { const v = Object.assign({}, f.c.vitals); delete v.nextCrit; f.c.vitals = v; wr(CH(f.email), f.list); }
        });
        (nextCritIds || []).filter(ofAttack).forEach((id) => {   // gained from a Tracking Perfect Combo
          const f = localFind(id);
          if (f && f.c.campaignId === campaignId) { f.c.vitals = Object.assign({}, f.c.vitals, { nextCrit: true }); wr(CH(f.email), f.list); }
        });
        g.encounter.lastAttack = { id: attackId, attacker: at.attacker, target: at.target, text: String(text || '').slice(0, 500) };
        delete g.encounter.attack;
        wr(GR, camps);
      },

      async setExplodeTokens(characterId, value) {
        if (!Number.isInteger(value) || value < 0 || value > 10) throw fail('A character can hold 0 to 10 Explode Tokens.');
        const f = localFind(characterId);
        if (!f) throw fail('That character does not exist.');
        const g = f.c.campaignId ? rd(GR, []).find((x) => x.id === f.c.campaignId) : null;
        if (f.email !== uid && !(g && isQmOf(g, uid))) throw fail('You can only change your own characters.');
        f.c.info = Object.assign({}, f.c.info, { explodeTokens: value });
        wr(CH(f.email), f.list);
      },

      async dealDamage(attackerId, targetId, amount) {
        if (typeof amount !== 'number' || !isFinite(amount) || amount < 0 || amount > 100000) throw fail('That number is not valid.');
        const a = localFind(attackerId), t = localFind(targetId);
        if (!a || !a.c.campaignId || !t || t.c.campaignId !== a.c.campaignId) throw fail('Both characters must be in the same campaign.');
        const g = rd(GR, []).find((x) => x.id === a.c.campaignId);
        if (!g || !g.encounter) throw fail('Attacks can only be made during an encounter.');
        const qm = isQmOf(g, uid);
        if (a.email !== uid && !qm) throw fail('You can only attack with your own characters.');
        if (t.c.isNpc && !qm && (!t.c.npcVisible || t.c.sheetHidden)) throw fail('You cannot attack that character.');
        const v = Object.assign({}, t.c.vitals);
        v.damage = Math.round(((Number(v.damage) || 0) + amount) * 100) / 100;
        t.c.vitals = v;
        wr(CH(t.email), t.list);
      },
      async setCharacterInactive(campaignId, characterId, inactive) {
        const camps = rd(GR, []), g = camps.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can do that.');
        const t = localFind(characterId);
        if (!t || t.c.campaignId !== campaignId) throw fail('That character is not in this campaign.');
        const ids = (g.inactive || []).filter((x) => x !== characterId);
        if (inactive) ids.push(characterId);
        g.inactive = ids;
        wr(GR, camps);
      },
      async codexRecord(campaignId, kind, key, entry) {
        const camps = rd(GR, []), g = camps.find((x) => x.id === campaignId);
        if (!g || !g.members.some((m) => m.userId === uid)) throw fail('Only campaign members can do that.');
        if (kind !== 'mobs' && kind !== 'items') throw fail('That is not a codex section.');
        if (typeof key !== 'string' || key.length < 1 || key.length > 80) throw fail('That name is not valid.');
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || JSON.stringify(entry).length > 4000) throw fail('That entry is not valid.');
        g.codex = g.codex || {}; const sect = g.codex[kind] = g.codex[kind] || {};
        if (Object.prototype.hasOwnProperty.call(sect, key) || (g.codex.removed && g.codex.removed[kind] && g.codex.removed[kind][key])) return;
        if (Object.keys(sect).length >= 300) throw fail('The codex is full.');
        sect[key] = entry;
        wr(GR, camps);
      },
      async codexRemove(campaignId, kind, key) {
        const camps = rd(GR, []), g = camps.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can do that.');
        if (kind !== 'mobs' && kind !== 'items') throw fail('That is not a codex section.');
        if (typeof key !== 'string' || key.length < 1 || key.length > 80) throw fail('That name is not valid.');
        g.codex = g.codex || {};
        if (g.codex[kind]) delete g.codex[kind][key];
        g.codex.removed = g.codex.removed || {}; g.codex.removed[kind] = Object.assign({}, g.codex.removed[kind], { [key]: true });
        wr(GR, camps);
      },
      async listCompendiums() {
        const qmOf = rd(GR, []).filter((g) => g.compendiumId && isQmOf(g, uid)).map((g) => g.compendiumId);
        return rd(COMP, []).filter((c) => c.owner === uid || qmOf.includes(c.id))
          .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
          .map((c) => ({ id: c.id, name: c.name, data: JSON.parse(JSON.stringify(c.data || {})), ownerId: c.owner, mine: c.owner === uid, updated: c.updated }));
      },
      async saveCompendium(c) {
        const name = cleanCompendiumName(c.name), data = c.data && typeof c.data === 'object' && !Array.isArray(c.data) ? c.data : {};
        if (JSON.stringify(data).length > 5000000) throw fail('That compendium is too big to save.');
        const list = rd(COMP, []), i = list.findIndex((x) => x.id === c.id);
        if (i >= 0 && list[i].owner !== uid) throw fail('Could not save the compendium.');
        const row = { id: c.id, owner: uid, name, data: JSON.parse(JSON.stringify(data)), updated: new Date().toISOString() };
        if (i >= 0) list[i] = row; else list.push(row);
        wr(COMP, list);
      },
      async deleteCompendium(id) {
        const list = rd(COMP, []), c = list.find((x) => x.id === id);
        if (!c || c.owner !== uid) return;
        wr(COMP, list.filter((x) => x !== c));
        const camps = rd(GR, []); camps.forEach((g) => { if (g.compendiumId === id) g.compendiumId = null; }); wr(GR, camps);
      },
      async setCampaignCompendium(campaignId, compendiumId) {
        const camps = rd(GR, []), g = camps.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can choose the campaign\'s compendium.');
        if (compendiumId && !rd(COMP, []).some((c) => c.id === compendiumId && c.owner === uid)) throw fail('You can only choose one of your own compendiums.');
        g.compendiumId = compendiumId || null;
        wr(GR, camps);
      },
      async qmDealDamage(campaignId, targetId, amount) {
        if (typeof amount !== 'number' || !isFinite(amount) || amount < 0 || amount > 100000) throw fail('That number is not valid.');
        const g = rd(GR, []).find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can do that.');
        const t = localFind(targetId);
        if (!t || t.c.campaignId !== campaignId) throw fail('That character is not in this campaign.');
        const v = Object.assign({}, t.c.vitals);
        v.damage = Math.round(((Number(v.damage) || 0) + amount) * 100) / 100;
        t.c.vitals = v;
        wr(CH(t.email), t.list);
      },

      async startTurn(characterId, spGain, spMax, apMax) {
        const f = localFind(characterId);
        if (!f || !f.c.campaignId) throw fail('That character is not in a campaign.');
        const g = rd(GR, []).find((x) => x.id === f.c.campaignId), e = g && g.encounter;
        if (!e || !(e.seq > 0) || e.turn !== characterId) return { applied: false };
        if (f.email !== uid && !isQmOf(g, uid)) throw fail('You can only do this for your own characters.');
        const mark = e.id + ':' + e.seq, v = f.c.vitals || {};
        if (v.turnMark === mark) return { applied: false };
        const ap = v.apRemaining == null || v.apRemaining === '' ? null : Number(v.apRemaining);
        const sp = v.spRemaining == null || v.spRemaining === '' ? spMax : Number(v.spRemaining);
        const gain = ap !== null && ap <= 0 ? 0 : spGain, nsp = Math.min(spMax, Math.max(sp, sp + gain));
        f.c.vitals = Object.assign({}, v, { apRemaining: null, spRemaining: nsp, turnMark: mark });
        if ((Number(v.apPenalty) || 0) > 0) {   // a Critical Miss last turn: that much AP is not recovered now
          if (typeof apMax === 'number' && apMax >= 0 && apMax <= 1000) f.c.vitals.apRemaining = Math.max(0, apMax - Number(v.apPenalty));
          delete f.c.vitals.apPenalty;
        }
        wr(CH(f.email), f.list);
        return { applied: true, spGain: nsp - sp, apRestored: ap !== null && ap > 0, sp: nsp, apRemaining: f.c.vitals.apRemaining == null ? null : f.c.vitals.apRemaining };
      },

      async advanceTurn(campaignId, fromId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !g.encounter) throw fail('There is no active encounter.');
        const ord = localOrder(g);
        if (!ord.length) throw fail('Nobody has rolled initiative yet.');
        const cur = g.encounter.turn || null;
        if (cur !== fromId) throw fail('The turn has already moved on.');
        let owner = null;   // stays null for an event: only a QM moves those
        Object.keys(rd(ACC, {})).forEach((email) => { if (rd(CH(email), []).some((x) => x.id === cur)) owner = email; });
        if (!isQmOf(g, uid) && owner !== uid) throw fail('It is not your turn.');
        const idx = ord.indexOf(cur);
        if (idx < 0) g.encounter.turn = ord[0];
        else if (idx >= ord.length - 1) {   // new round: one-time events come and go with it
          const rnd = (g.encounter.round || 1) + 1, next = localOrder(g, Object.assign({}, g.encounter, { round: rnd }));
          g.encounter.round = rnd; g.encounter.turn = next[0] || cur;
        }
        else g.encounter.turn = ord[idx + 1];
        if (g.encounter.combos) delete g.encounter.combos[g.encounter.turn];   // a Leader's combo ends when their next turn begins
        g.encounter.moved = true; g.encounter.seq = (g.encounter.seq || 0) + 1;
        wr(GR, campaigns);
      },

      async assignTurn(campaignId, characterId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can assign a turn.');
        if (!g.encounter) throw fail('There is no active encounter.');
        if (!localOrder(g).includes(characterId)) throw fail('That character has not rolled initiative yet.');
        g.encounter.turn = characterId; g.encounter.moved = true; g.encounter.seq = (g.encounter.seq || 0) + 1;
        if (g.encounter.combos) delete g.encounter.combos[characterId];
        wr(GR, campaigns);
      },

      /* ----- encounter maps (same rules as the database functions) ----- */
      async listMaps(campaignId) {
        const g = rd(GR, []).find((x) => x.id === campaignId);
        if (!g || !g.members.some((m) => m.userId === uid)) return [];
        const qm = isQmOf(g, uid);
        return (rd(MAPS, []).filter((m) => m.campaignId === campaignId && (qm || m.visible))).map((m) => { const { image, campaignId: _c, ...meta } = m; return meta; });
      },
      async getMap(mapId) {
        const m = rd(MAPS, []).find((x) => x.id === mapId), g = m && rd(GR, []).find((x) => x.id === m.campaignId);
        if (!m || !g || !g.members.some((x) => x.userId === uid) || (!m.visible && !isQmOf(g, uid) && !(g.encounter && g.encounter.mapId === m.id))) throw fail('That map is not available.');
        return Object.assign({}, m);
      },
      async saveMap(campaignId, m) {
        const g = rd(GR, []).find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can make maps.');
        const name = String(m.name || '').trim();
        if (!name) throw fail('Give the map a name first.');
        if (name.length > 60) throw fail('That name is too long.');
        const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
        if (!int(m.cols, 1, 200) || !int(m.rows, 1, 200)) throw fail('The grid needs 1 to 200 columns and rows.');
        if (!(typeof m.size === 'number' && m.size >= 4 && m.size <= 4000)) throw fail('That square size is not valid.');
        if (!(typeof m.ox === 'number' && typeof m.oy === 'number' && Math.abs(m.ox) <= 8000 && Math.abs(m.oy) <= 8000)) throw fail('That grid position is not valid.');
        const okImg = (im) => typeof im === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/.test(im);
        const list = rd(MAPS, []);
        let rec = m.id && list.find((x) => x.id === m.id && x.campaignId === campaignId);
        if (m.id && !rec) throw fail('That map is gone.');
        if (m.image) {
          if (!okImg(m.image)) throw fail('Pick a picture first.');
          if (m.image.length > 2500000) throw fail('That picture is too big.');
          if (!int(m.imgW, 1, 8000) || !int(m.imgH, 1, 8000)) throw fail('That picture is not valid.');
        } else if (!rec) throw fail('Pick a picture first.');
        if (!rec) {
          if (list.filter((x) => x.campaignId === campaignId).length >= 30) throw fail('A campaign can have 30 maps.');
          rec = { id: newId(), campaignId, visible: false, createdAt: new Date().toISOString() };
          list.push(rec);
        }
        if (m.image) { rec.image = m.image; rec.imgW = m.imgW; rec.imgH = m.imgH; }
        Object.assign(rec, { name, cols: m.cols, rows: m.rows, size: m.size, ox: m.ox, oy: m.oy });
        wr(MAPS, list);
        return rec.id;
      },
      /* ----- tokens on the encounter map ----- */
      async listTokens(campaignId) {
        const g = rd(GR, []).find((x) => x.id === campaignId);
        if (!g || !g.members.some((m) => m.userId === uid) || !g.encounter) return [];
        const qm = isQmOf(g, uid);
        return Object.keys(g.encounter.tokens || {}).filter((id) => { const f = localFind(id); return f && f.c.campaignId === campaignId && (qm || !f.c.isNpc || f.c.npcVisible); })
          .map((id) => ({ characterId: id, col: g.encounter.tokens[id].col, row: g.encounter.tokens[id].row }));
      },
      async setToken(characterId, col, row) {
        const campaigns = rd(GR, []), f = localFind(characterId), g = f && f.c.campaignId && campaigns.find((x) => x.id === f.c.campaignId);
        if (!g || !g.members.some((m) => m.userId === uid)) throw fail('That character is not in your campaign.');
        if (!(isQmOf(g, uid) || (f.email === uid && !f.c.isNpc))) throw fail('You can only move your own characters.');
        if (!g.encounter) throw fail('There is no active encounter.');
        const map = g.encounter.mapId && rd(MAPS, []).find((x) => x.id === g.encounter.mapId);
        if (!map) throw fail('The encounter has no map.');
        if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= map.cols || row >= map.rows) throw fail('That square is off the map.');
        g.encounter.tokens = g.encounter.tokens || {}; g.encounter.tokens[characterId] = { col, row };
        wr(GR, campaigns);
      },
      async removeToken(characterId) {
        const campaigns = rd(GR, []), f = localFind(characterId), g = f && f.c.campaignId && campaigns.find((x) => x.id === f.c.campaignId);
        if (!g || !g.members.some((m) => m.userId === uid)) throw fail('That character is not in your campaign.');
        if (!(isQmOf(g, uid) || (f.email === uid && !f.c.isNpc))) throw fail('You can only move your own characters.');
        if (g.encounter && g.encounter.tokens) { delete g.encounter.tokens[characterId]; wr(GR, campaigns); }
      },
      async setEncounterMap(campaignId, mapId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can add a map.');
        if (!g.encounter) throw fail('There is no active encounter.');
        if (g.encounter.mapId !== mapId && !(mapId == null && !g.encounter.mapId)) g.encounter.tokens = {};   // tokens belong to one map's grid
        if (mapId == null) delete g.encounter.mapId;
        else {
          if (!rd(MAPS, []).some((x) => x.id === mapId && x.campaignId === campaignId)) throw fail('That map is gone.');
          g.encounter.mapId = mapId;
        }
        wr(GR, campaigns);
      },
      async setMapVisible(mapId, visible) {
        const list = rd(MAPS, []), m = list.find((x) => x.id === mapId), g = m && rd(GR, []).find((x) => x.id === m.campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can show or hide a map.');
        m.visible = !!visible; wr(MAPS, list);
      },
      async deleteMap(mapId) {
        const list = rd(MAPS, []), m = list.find((x) => x.id === mapId), g = m && rd(GR, []).find((x) => x.id === m.campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can delete a map.');
        if (g.encounter && g.encounter.mapId === mapId) { delete g.encounter.mapId; g.encounter.tokens = {}; wr(GR, rd(GR, []).map((x) => (x.id === g.id ? g : x))); }
        wr(MAPS, list.filter((x) => x.id !== mapId));
      },

      /* ----- Spawn Character (same rules as the database functions) ----- */
      async startSpawn(campaignId, forIds) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can spawn a character.');
        if (g.spawn) throw fail('A character is already being spawned.');
        const fr = Array.from(new Set(forIds || []));
        if (fr.some((u) => !g.members.some((m) => m.userId === u))) throw fail('That player is not in the campaign.');
        const order = g.members.filter((m) => m.role !== 'qm').map((m) => m.userId);
        if (!order.length) throw fail('There are no players to build a character.');
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        g.spawn = spawnEnter({ id: newId(), startedAt: Date.now(), qm: uid, for: fr, order, pos: 0, data: {}, points: {}, seq: 0 });
        wr(GR, campaigns);
      },
      async spawnSubmit(campaignId, value) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId), sp = g && g.spawn;
        if (!g || !g.members.some((m) => m.userId === uid)) throw fail('You are not in this campaign.');
        if (!sp) throw fail('No character is being spawned.');
        if (!SPAWN_STEPS.slice(0, 6).includes(sp.step)) throw fail('That step is not open.');
        if (sp.turn !== uid) throw fail('It is not your turn.');
        if (sp.pos >= 1 && sp.pos <= 3) {
          if (value !== 0 && value !== 1) throw fail('Pick one of the two options.');
          sp.data[sp.step] = sp.options[value];
        } else {
          if (typeof value !== 'string') throw fail('Write something first.');
          const t = value.trim();
          if (!t) throw fail('Write something first.');
          if (t.length > 1000) throw fail('That is too long.');
          sp.data[sp.step] = t;
        }
        sp.pos += 1; sp.seq = (sp.seq || 0) + 1; spawnEnter(sp);
        wr(GR, campaigns);
      },
      async spawnPoints(campaignId, picks) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId), sp = g && g.spawn;
        if (!g || !g.members.some((m) => m.userId === uid)) throw fail('You are not in this campaign.');
        if (!sp) throw fail('No character is being spawned.');
        if (sp.step !== 'points') throw fail('That step is not open.');
        if (!sp.order.includes(uid)) throw fail('The QM does not add points.');
        if (sp.points[uid]) throw fail('You have already added your points.');
        if (!Array.isArray(picks) || picks.length !== 4) throw fail('Make all four sets of picks.');
        const clean = picks.map((p) => {
          const ok = p && Number.isInteger(p.up) && Number.isInteger(p.down) && Number.isInteger(p.prof) && p.up >= 0 && p.up <= 8 && p.down >= 0 && p.down <= 8 && p.prof >= 0 && p.prof <= 35;
          if (!ok) throw fail('Those picks are not valid.');
          if (p.up === p.down) throw fail('Add and subtract from different talents.');
          return { up: p.up, down: p.down, prof: p.prof };
        });
        sp.points[uid] = clean; sp.seq = (sp.seq || 0) + 1;
        if (sp.order.every((u) => sp.points[u])) {
          sp.charId = newId();
          if (sp.for.length) {
            sp.assignee = sp.for[Math.floor(Math.random() * sp.for.length)];
            sp.dead = rd(CH(sp.assignee), []).filter((c) => c.campaignId === campaignId && !c.isNpc && c.info && c.info.alive === false)
              .map((c) => ({ id: c.id, name: (c.info && c.info.name) || '', incarnation: c.info.incarnation == null ? null : c.info.incarnation }));
            sp.step = sp.dead.length ? 'incarnation' : 'build';
          } else sp.step = 'build';
          delete sp.turn; delete sp.options;
        }
        wr(GR, campaigns);
      },
      async spawnIncarnation(campaignId, prevId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId), sp = g && g.spawn;
        if (!sp || sp.step !== 'incarnation') throw fail('That step is not open.');
        if (sp.assignee !== uid) throw fail('This character is not yours.');
        if (prevId) {
          const d = sp.dead.find((x) => x.id === prevId);
          if (!d) throw fail('Pick one of your fallen characters.');
          sp.prev = { id: prevId, incarnation: d.incarnation };
        }
        sp.step = 'build'; sp.seq = (sp.seq || 0) + 1;
        wr(GR, campaigns);
      },
      async spawnVeto(campaignId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId), sp = g && g.spawn;
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can do that.');
        if (!sp) throw fail('No character is being spawned.');
        if (!SPAWN_STEPS.includes(sp.step)) throw fail('It is too late to send it back.');
        if (sp.pos === 0) throw fail('There is nothing to send back yet.');
        sp.points = {}; delete sp.data[SPAWN_STEPS[sp.pos - 1]];
        sp.pos -= 1; sp.seq = (sp.seq || 0) + 1; spawnEnter(sp);
        wr(GR, campaigns);
      },
      async cancelSpawn(campaignId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
        if (!g || !isQmOf(g, uid)) throw fail('Only a QM can cancel it.');
        g.spawn = null; wr(GR, campaigns);
      },
      async finishSpawn(campaignId) {
        const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId), sp = g && g.spawn;
        if (!g || !g.members.some((m) => m.userId === uid)) throw fail('You are not in this campaign.');
        if (!sp) return;
        if (sp.step !== 'build') throw fail('The character is not ready yet.');
        let ok;
        if (sp.assignee) {
          if (sp.assignee !== uid) throw fail('This character is not yours.');
          ok = rd(CH(uid), []).some((c) => c.id === sp.charId && c.campaignId === campaignId && !c.isNpc);
        } else {
          if (!isQmOf(g, uid)) throw fail('Only a QM can finish an NPC.');
          const f = localFind(sp.charId); ok = !!(f && f.c.campaignId === campaignId && f.c.isNpc);
        }
        if (!ok) throw fail('The character has not been saved yet.');
        g.spawn = null; wr(GR, campaigns);
      },

      async deleteCampaign(campaignId) {
        const campaigns = rd(GR, []);
        const g = campaigns.find((x) => x.id === campaignId);
        if (!g) return;
        if (!isQmOf(g, uid)) throw fail('Only a QM can delete the campaign.');
        wr(GR, campaigns.filter((x) => x.id !== campaignId));
        wr(MAPS, rd(MAPS, []).filter((x) => x.campaignId !== campaignId));
        unlinkChars(campaignId, null);
      }
    };

    // clear character links to a campaign (for one player, or everyone when userId is null)
    // Leaving / removed: that player's characters in the campaign are unlinked. Campaign deleted (userId null): everyone's linked
    // characters are unlinked. NPCs stay with their owner, outside any campaign; mob and boss NPCs are deleted.
    // A mob or boss made from a compendium (or by the old MAKE MOBS): it is deleted, not kept, when it leaves its campaign
    function isMobNpc(c) { return !!(c && c.isNpc && c.info && (c.info.kind === 'mob' || c.info.kind === 'boss')); }
    function unlinkChars(campaignId, userId) {
      Object.keys(rd(ACC, {})).forEach((email) => {
        if (userId && email !== userId) return;
        let list = rd(CH(email), []);
        let changed = false;
        const before = list.length;
        list = list.filter((c) => !(c.campaignId === campaignId && isMobNpc(c)));   // a generated mob is deleted with its campaign link
        changed = list.length !== before;
        list.forEach((c) => {
          if (c.campaignId === campaignId) { c.campaignId = null; c.npcVisible = false; c.sheetHidden = false; changed = true; }   // an NPC stays an NPC of its owner
        });
        if (changed) wr(CH(email), list);
      });
    }

    // the turn order of a campaign's encounter (characters that are still in the campaign and have rolled)
    function localOrder(g, enc) {
      enc = enc || g.encounter;
      const slots = turnSlots(enc), ids = [];
      Object.keys(rd(ACC, {})).forEach((email) => rd(CH(email), []).forEach((c) => { if (c.campaignId === g.id) ids.push(c.id); }));
      ((enc && enc.events) || []).forEach((e) => ids.push(e.id));
      return turnOrder(slots, ids);
    }

    function localFind(characterId) {
      let out = null;
      Object.keys(rd(ACC, {})).forEach((email) => { const list = rd(CH(email), []), c = list.find((x) => x.id === characterId); if (c) out = { c, email, list }; });
      return out;
    }

    // Take a character out of a campaign's running encounter: its initiative, its token, and the turn if it was theirs.
    function dropFromEncounter(campaignId, characterId) {
      const campaigns = rd(GR, []), g = campaigns.find((x) => x.id === campaignId);
      if (!g || !g.encounter) return;
      const e = g.encounter;
      if (e.initiatives) delete e.initiatives[characterId];
      if (e.combos) Object.keys(e.combos).forEach((k) => { if (k === characterId || e.combos[k].finisher === characterId) delete e.combos[k]; });
      if (e.tokens) delete e.tokens[characterId];
      if (e.turn === characterId) {
        e.turn = localOrder(g)[0] || null;
      }
      wr(GR, campaigns);
    }

    function isQmOf(g, u) { return g.members.some((m) => m.userId === u && m.role === 'qm'); }

    // A QM's NPCs always pass to a QM. When a QM stops being QM: another QM (random) takes the NPCs; if they were the
    // only QM a random other member becomes QM and takes them; if nobody else is here, leaving empties the campaign
    // and stepping down is refused.
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
    function qmHandoff(g, userId, leaving) {
      const others = g.members.filter((x) => x.userId !== userId);
      const qms = others.filter((x) => x.role === 'qm');
      let heir = qms.length ? pick(qms) : others.length ? pick(others) : null;
      if (!heir) { if (!leaving) throw fail(ONLY_PLAYER); return; }
      heir.role = 'qm';
      const mine = rd(CH(userId), []), moving = mine.filter((c) => c.campaignId === g.id && c.isNpc);
      if (moving.length) {
        wr(CH(userId), mine.filter((c) => moving.indexOf(c) < 0));
        wr(CH(heir.userId), rd(CH(heir.userId), []).concat(moving));
      }
    }

    function localRemove(campaignId, userId) {
      const campaigns = rd(GR, []);
      const g = campaigns.find((x) => x.id === campaignId);
      if (!g) throw fail('That campaign no longer exists.');
      if (userId !== uid && !isQmOf(g, uid)) throw fail('Only a QM can remove players.');
      const m = g.members.find((x) => x.userId === userId);
      if (!m) return;
      if (m.role === 'qm') qmHandoff(g, userId, true);
      g.members = g.members.filter((x) => x.userId !== userId);
      if (!g.members.length) {   // the last person left: the campaign goes with them
        wr(GR, campaigns.filter((x) => x.id !== campaignId));
        wr(MAPS, rd(MAPS, []).filter((x) => x.campaignId !== campaignId));
        unlinkChars(campaignId, null);
        return;
      }
      wr(GR, campaigns);
      unlinkChars(campaignId, userId);
    }
  }

  function create(config, env) {
    env = env || (typeof window !== 'undefined' ? window : globalThis);
    const canUseSupabase = config && config.supabaseUrl && config.supabaseKey && env.supabase && env.supabase.createClient;
    return canUseSupabase ? supabaseBackend(config, env) : localBackend(env);
  }

  return { create, turnOrder, turnSlots };
});
