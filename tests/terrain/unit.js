'use strict';
/* GET /api/terrain in demo/mock mode, after widening the 3D scene's bounds to a regional view (Cyprus plus a slice of
   southern Turkey and Lebanon/Syria). Checks the grid is bigger but not explosively so, stays inside the stated box,
   and the mock elevation values are sane (no NaN/negative, demo-mode "land" blobs for the neighbouring coasts present).
   Run: node tests/terrain/unit.js   (no network; port 3997) */
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const PORT = Number(process.env.TERRAIN_TEST_PORT) || 3997, BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrain-'));
function start() {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dataDir, ANTHROPIC_API_KEY: '' };
  return spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
}
const up = async () => { for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/terrain'); return; } catch (e) { await wait(200); } } };

(async () => {
  const srv = start();
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  await up();
  const r = await fetch(BASE + '/api/terrain');
  ok(r.status === 200, 'terrain: 200 in mock mode (' + r.status + ')');
  const t = await r.json();

  // the box itself: wider than Cyprus-only, but a sane, bounded size (not accidentally the whole Mediterranean)
  ok(t.lat0 < 34.0 && t.lat1 > 36.0, 'terrain: box reaches north of Cyprus into the Turkish coast band (' + t.lat0 + '..' + t.lat1 + ')');
  ok(t.lng0 < 32.0 && t.lng1 > 35.5, 'terrain: box reaches east into the Lebanon/Syria coast band (' + t.lng0 + '..' + t.lng1 + ')');
  ok(t.lat1 - t.lat0 < 5 && t.lng1 - t.lng0 < 8, 'terrain: box is regional, not ocean-basin-wide (' + (t.lat1 - t.lat0) + 'x' + (t.lng1 - t.lng0) + ')');

  // point count: bigger than the old ~1,300-point Cyprus-only grid, but not wildly so (same ballpark build time)
  const n = t.rows * t.cols;
  ok(n === t.elev.length, 'terrain: elev length matches rows*cols (' + n + ' vs ' + t.elev.length + ')');
  ok(n > 1300 && n < 2500, 'terrain: point count stays in the same ballpark as before, not 5-10x bigger (' + n + ' points, ' + t.rows + 'x' + t.cols + ')');

  // sane values
  ok(t.elev.every((v) => Number.isFinite(v) && v >= 0 && v < 3000), 'terrain: every elevation is a finite, non-negative, plausible number');
  ok(t.elev.some((v) => v > 500), 'terrain: at least one real high point exists (Troodos/Kyrenia in the mock model)');
  ok(t.elev.some((v) => v === 0), 'terrain: open sea still shows as 0, not land everywhere');

  // demo-mode "neighbouring coast" blobs are present (cosmetic for mock mode only, not claimed as real data)
  const idxAt = (lat, lng) => {
    const r = Math.round(((lat - t.lat0) / (t.lat1 - t.lat0)) * (t.rows - 1));
    const c = Math.round(((lng - t.lng0) / (t.lng1 - t.lng0)) * (t.cols - 1));
    return r * t.cols + c;
  };
  ok(t.elev[idxAt(36.6, 33.2)] > 0, 'terrain (demo only): a point in the southern-Turkey mock band shows as land');
  ok(t.elev[idxAt(35.5, 36.0)] > 0, 'terrain (demo only): a point in the Lebanon/Syria mock band shows as land');
  ok(t.elev[idxAt(34.9, 32.9)] > 1000, 'terrain: Troodos mock peak is still tall after the resolution change');

  srv.kill();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
