const { boot, wait, waitFor, api, checker } = require('./h.js');
const { createMock } = require('./mock.js');
const { ok, done } = checker();
const USERS = {
  ricky: { name: 'Ricky', username: 'ricky_1', email: 'ricky@example.com', password: 'correct horse' },
  sam: { name: 'Sam', username: 'sam_2', email: 'sam@example.com', password: 'another pass1' }
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function scenario(label, makeAs) {
  console.log('--- ' + label); const P = (m) => `[${label}] ${m}`;
  const as = await makeAs(); const R = await as('ricky'), S = await as('sam');
  const raw = async (A) => { const b = A.w.BSHBackend.create(A.w.BSH_CONFIG); await b.init(); return b; };
  const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) {} await wait(40); } return false; };
  const bR = await raw(R), bS = await raw(S);
  const G = await bR.createCampaign('Pit'); await bS.joinCampaign(G);
  const btn = (A, t) => [...A.d.querySelectorAll('button')].find((b) => b.textContent === t);
  for (const A of [R, S]) A.go('campaign-' + G);
  ok(await until(() => !!R.$('mapsView') && !!S.$('mapsView')), P('every member has VIEW ENCOUNTER MAPS'));
  ok(!!R.$('mapsCreate') && !S.$('mapsCreate'), P('only the QM has CREATE ENCOUNTER MAP'));
  // create
  R.click(R.$('mapsCreate'));
  ok(await until(() => R.vis().join() === 'mapedit' && !!R.$('mapName')), P('editor opens'));
  ok(R.$('mapSave').disabled, P('SAVE needs a name and a picture'));
  R.setv(R.$('mapName'), 'The Cave');
  const fileEl = R.$('mapFile'), file = new R.w.File([PNG], 'cave.png', { type: 'image/png' });
  Object.defineProperty(fileEl, 'files', { value: [file], configurable: true });
  fileEl.dispatchEvent(new R.w.Event('change', { bubbles: true }));
  ok(await until(() => !!R.d.querySelector('#mapEditStage img') && !R.$('mapSave').disabled, 8000), P('picture shows with a grid over it; SAVE enabled'));
  ok(R.d.querySelector('#mapEditStage img').src.startsWith('data:image/'), P('picture is a data URL'));
  const pathD = () => R.d.querySelector('#mapEditStage .map-grid path').getAttribute('d');
  ok(R.$('mapcols').value === '20' && R.$('maprows').value === '20' && R.$('mapsize').value === '50', P('default grid fits the picture: 20 x 20 squares of 50'));
  R.setv(R.$('mapsize'), '100');
  ok(R.$('mapcols').value === '10' && R.$('maprows').value === '10', P('changing the square size refills columns and rows'));
  R.setv(R.$('mapox'), '30'); R.setv(R.$('mapoy'), '20');
  ok(R.$('mapcols').value === '9' && /^M30 20V/.test(pathD()), P('offset moves the grid: ' + pathD().slice(0, 30)));
  R.setv(R.$('mapcols'), '5'); R.setv(R.$('maprows'), '4'); R.setv(R.$('mapsize'), '80');
  ok(R.$('mapcols').value === '5' && R.$('maprows').value === '4', P('hand-set columns / rows stay put when the size changes'));
  ok(/V340/.test(pathD()) && R.d.querySelectorAll('#mapEditStage .map-grid path').length === 2, P('grid is 5 x 4 squares of 80 (right edge/bottom drawn): ' + pathD().slice(0, 60)));
  R.click(R.$('mapFill'));
  ok(R.$('mapcols').value === '12' && R.$('maprows').value === '12', P('FILL THE PICTURE refills'));
  R.setv(R.$('mapcols'), '5'); R.setv(R.$('maprows'), '4');
  R.click(R.$('mapSave'));
  ok(await until(() => R.vis().join() === 'maps' && R.d.querySelectorAll('#mapsBody [data-map]').length === 1), P('saved: back on the map list'));
  const mapId = R.d.querySelector('#mapsBody [data-map]').dataset.map;
  ok(R.$('mapsBody').textContent.includes('The Cave') && R.$('mapsBody').textContent.includes('HIDDEN') && R.$('mapsBody').textContent.includes('5 x 4'), P('list shows name, HIDDEN, grid'));
  // players
  S.click(S.$('mapsView'));
  ok(await until(() => S.vis().join() === 'maps' && !!S.$('noMaps')), P('player sees nothing while the map is hidden'));
  ok(!btn(S, 'CREATE ENCOUNTER MAP') && !btn(S, 'EDIT') && !btn(S, 'DELETE'), P('and has no QM buttons'));
  S.go('mapnew-' + G);
  ok(await until(() => S.vis().join() === 'maps'), P('a player cannot open the editor'));
  let denied = false; try { await bS.getMap(mapId); } catch (e) { denied = true; } ok(denied, P('a player cannot fetch a hidden map'));
  // show
  R.click(btn(R, 'SHOW TO PLAYERS'));
  ok(await until(() => R.$('mapsBody').textContent.includes('SHOWN') && !R.$('mapsBody').textContent.includes('HIDDEN')), P('QM shows it'));
  S.go('campaign-' + G); await wait(100); S.go('maps-' + G);
  ok(await until(() => S.d.querySelectorAll('#mapsBody [data-map]').length === 1 && !S.$('mapsBody').textContent.includes('SHOWN')), P('player now sees it, without QM tags'));
  S.click(S.d.querySelector('#mapsBody [data-map] .char-btn'));
  ok(await until(() => S.vis().join() === 'mapview' && !!S.d.querySelector('#mapViewBody img')), P('opens the viewer'));
  ok(S.$('mapViewTitle').textContent === 'The Cave' && S.d.querySelector('#mapViewBody img').src.startsWith('data:image/') && S.d.querySelectorAll('#mapViewBody .map-grid path').length === 2, P('picture + grid shown'));
  S.click(S.$('mapZoomIn')); S.click(S.$('mapZoomIn'));
  ok(S.$('mapZoom').style.width === '150%' && S.$('mapZoomLbl').textContent === '150%', P('zoom in'));
  S.click(S.$('mapZoomFit')); ok(S.$('mapZoom').style.width === '100%', P('fit'));
  S.click(S.$('mapViewBack'));
  ok(await until(() => S.vis().join() === 'maps'), P('viewer BACK returns to the list'));
  // edit without a new picture
  R.click(btn(R, 'EDIT'));
  ok(await until(() => R.vis().join() === 'mapedit' && R.$('mapName') && R.$('mapName').value === 'The Cave' && !!R.d.querySelector('#mapEditStage img')), P('EDIT loads the map'));
  ok(R.$('mapcols').value === '5' && R.$('maprows').value === '4' && R.$('mapsize').value === '80', P('with its grid'));
  R.setv(R.$('mapName'), 'The Deep Cave'); R.setv(R.$('mapcols'), '7');
  R.click(R.$('mapSave'));
  ok(await until(() => R.vis().join() === 'maps' && R.$('mapsBody').textContent.includes('The Deep Cave')), P('edited name saved'));
  const m = await bR.getMap(mapId);
  ok(m.cols === 7 && m.rows === 4 && m.size === 80 && m.visible === true && m.image.startsWith('data:image/png'), P('grid changed, picture and visibility kept'));
  denied = false; try { await bS.saveMap(G, { id: mapId, name: 'x', cols: 1, rows: 1, size: 10, ox: 0, oy: 0 }); } catch (e) { denied = /Only a QM/.test(e.message); } ok(denied, P('a player cannot edit'));
  denied = false; try { await bR.saveMap(G, { name: 'x', cols: 1, rows: 1, size: 10, ox: 0, oy: 0 }); } catch (e) { denied = /picture/.test(e.message); } ok(denied, P('a new map needs a picture'));
  denied = false; try { await bR.saveMap(G, { id: mapId, name: 'x', cols: 0, rows: 1, size: 10, ox: 0, oy: 0 }); } catch (e) { denied = /columns and rows/.test(e.message); } ok(denied, P('bad grid refused'));
  // ---- the map inside a live encounter ----
  const kick = async (A) => { A.d.dispatchEvent(new A.w.Event('visibilitychange')); await wait(200); };
  const encOf = async () => (await bR.listCampaigns()).find((g) => g.id === G).encounter;
  await bR.setMapVisible(mapId, false);
  await bR.startEncounter(G);
  for (const A of [R, S]) A.go('campaign-' + G);
  ok(await until(() => !!R.$('mapToggle') && !!S.$('encMapTab')), P('encounter page loads'));
  ok(S.$('encMapTab').hidden && !S.$('mapToggle'), P('no map tab yet; ADD MAP is QM only'));
  ok(R.$('mapToggle').textContent === 'ADD MAP', P('QM sees ADD MAP'));
  R.click(R.$('mapToggle'));
  ok(await until(() => !!R.$('mapPickSel')) && R.$('mapPickSel').options.length === 1 && R.$('mapPickSel').options[0].textContent === 'The Deep Cave', P('picker lists the campaign maps'));
  R.click(R.$('mapUse'));
  ok(await until(async () => (await encOf()).mapId === mapId), P('map added to the encounter'));
  await kick(S); await kick(R);
  ok(await until(() => !S.$('encMapTab').hidden && !R.$('encMapTab').hidden), P('everyone gets the tab on the left of the encounter page'));
  ok(R.$('mapToggle').textContent === 'CHANGE MAP' && !!R.$('mapRemove') && !S.$('mapRemove'), P('QM can change / remove it'));
  S.click(S.$('encMapTab'));
  ok(await until(() => S.vis().join() === 'mapview' && !!S.d.querySelector('#mapViewBody img')), P('the tab opens the map, even though the map is hidden in the list'));
  ok(!S.$('mapBackTab').hidden, P('the map has a tab on the right to flip back'));
  S.click(S.$('mapBackTab'));
  ok(await until(() => S.vis().join() === 'campaign'), P('...which returns to the encounter page'));
  S.click(S.$('encMapTab'));
  await until(() => S.vis().join() === 'mapview');
  R.click(R.$('mapRemove'));
  ok(await until(async () => (await encOf()).mapId === undefined), P('QM removes the map'));
  await kick(S);
  ok(await until(() => S.vis().join() === 'campaign' && S.$('encMapTab').hidden), P('players looking at it are sent back and the tab disappears'));
  denied = false; try { await bS.getMap(mapId); } catch (e) { denied = true; } ok(denied, P('and the hidden map is closed to them again'));
  await bR.setEncounterMap(G, mapId); await kick(S);
  S.click(S.$('encMapTab')); await until(() => S.vis().join() === 'mapview');
  await bR.endEncounter(G); await kick(S);
  ok(await until(() => S.vis().join() === 'campaign'), P('ending the encounter closes the map for players'));
  await bR.setMapVisible(mapId, true);
  R.go('maps-' + G); await until(() => R.vis().join() === 'maps' && !!btn(R, 'DELETE'));
  // delete
  R.click(btn(R, 'DELETE')); R.click(btn(R, 'TAP AGAIN TO DELETE'));
  ok(await until(() => !!R.$('noMaps')), P('QM deletes it (two taps)'));
  ok((await bS.listMaps(G)).length === 0, P('gone for everyone'));
  for (const A of [R, S]) ok(A.w.__errors.length === 0, P('no script errors: ' + A.w.__errors.join('|')));
}
(async () => {
  await scenario('local', async () => { const shared = {}, w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ shared })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  const mk = await createMock();
  await scenario('supabase', async () => { const w = {}; for (const [n, u] of Object.entries(USERS)) { const A = api(await boot({ supabaseUrl: mk.url })); await A.signUp(u); w[n] = A; } return async (n) => w[n]; });
  mk.close(); done();
})();
