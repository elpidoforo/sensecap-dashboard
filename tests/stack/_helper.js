'use strict';
/* Shared by the stack's test files (not a test itself): a real server in demo mode with a made-up bus timetable behind it,
   a browser that draws WebGL in software, and the way to reach the 3D page. Every file takes its own port from the caller. */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), zlib = require('zlib');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const GL = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* a made-up timetable near Larnaka: two lines, a bus every 20 minutes all day; one line has a drawn route, one has stops only */
const STOPS = [['S1', 34.9, 33.6], ['S2', 34.91, 33.62], ['S3', 34.92, 33.64], ['S4', 34.93, 33.66], ['S5', 34.94, 33.68]];
const OFFSETS = [0, 10, 25, 40, 60];
function gtfsZip() {
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
  const trips = [], times = [];
  for (const route of ['R1', 'R2']) for (let start = 0; start < 24 * 60; start += 20) {
    const id = `${route}-${start}`, order = route === 'R1' ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
    trips.push(`${route},DAILY,${id},To the sea,${route === 'R1' ? 'SH1' : ''}`);
    order.forEach((s, i) => times.push(`${id},${hhmm(start + OFFSETS[i])},${hhmm(start + OFFSETS[i])},${STOPS[s][0]},${i + 1}`));
  }
  const files = {
    'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nA,Test Buses,https://example.org,Asia/Nicosia\n',
    'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A,1,Harbour line,3\nR2,A,2,Hill line,3\n',
    'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\n' + STOPS.map((s) => `${s[0]},Stop ${s[0]},${s[1]},${s[2]}`).join('\n') + '\n',
    'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nDAILY,1,1,1,1,1,1,1,20200101,20991231\n',
    'trips.txt': 'route_id,service_id,trip_id,trip_headsign,shape_id\n' + trips.join('\n') + '\n',
    'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' + times.join('\n') + '\n',
    'shapes.txt': 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n' + STOPS.map((s, i) => `SH1,${s[1]},${s[2]},${i + 1}`).join('\n') + '\n',
  };
  const parts = [], central = []; let offset = 0;                     // a zip with stored (uncompressed) entries
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), nm = Buffer.from(name), crc = zlib.crc32(data), local = Buffer.alloc(30), cd = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, nm, data); central.push(cd, nm); offset += 30 + nm.length + data.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

/* start(port, { buses: zipPort, env }) -> { base, stop }. With buses, a made-up timetable is served and read by the real reader. */
async function start(port, opt) {
  const o = opt || {}, base = 'http://127.0.0.1:' + port, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-'));
  let zipServer = null; const extra = {};
  if (o.buses) { const zip = gtfsZip();
    zipServer = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length }); res.end(zip); });
    await new Promise((r) => zipServer.listen(o.buses, '127.0.0.1', r));
    extra.GTFS_FEEDS = JSON.stringify([{ id: 'demo', name: 'Made-up buses', nameEl: 'Φανταστικά λεωφορεία', url: `http://127.0.0.1:${o.buses}/feed.zip` }]); extra.GTFS_ALLOW_HOSTS = '127.0.0.1'; }
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT, stdio: o.log ? ['ignore', fs.openSync(o.log, 'a'), fs.openSync(o.log, 'a')] : 'ignore',
    env: { ...process.env, PORT: String(port), DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dir, ANTHROPIC_API_KEY: '', DASHBOARD_PASSWORD: '', LOCK_DASHBOARD: '', CLASS_LOGIN_USER: '', CLASS_LOGIN_PASSWORD: '', ...extra, ...(o.env || {}) } });
  const stop = () => { try { srv.kill(); } catch (e) { /* gone */ } try { if (zipServer) zipServer.close(); } catch (e) { /* closed */ } };
  process.on('exit', stop);
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/stack.html'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  if (o.buses) for (let i = 0; i < 80; i++) { try { const s = await (await fetch(base + '/api/transit/status')).json(); if (s.loaded >= 1) break; } catch (e) { /* not yet */ } await wait(250); }
  return { base, stop, dir, pid: srv.pid };
}
/* open(browser, base, { query, phone, reduced, width, height, scale }) -> { page, errs, ctx } on /stack.html itself, once the scene has started */
async function open(b, base, opt) {
  const o = opt || {};
  const ctx = await b.newContext({ ...(o.phone ? devices['iPhone 13'] : { viewport: { width: o.width || 1280, height: o.height || 860 } }), ...(o.reduced ? { reducedMotion: 'reduce' } : {}), ...(o.scale ? { deviceScaleFactor: o.scale } : {}) });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(base + '/stack.html' + (o.query ? '?' + o.query : ''), { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 120; i++) { if (await page.evaluate(() => !!window.__embedReady).catch(() => false)) break; await wait(250); }
  return { page, errs, ctx };
}
const until = async (page, fn, arg, tries) => { for (let i = 0; i < (tries || 80); i++) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await wait(250); } return null; };
module.exports = { ROOT, GL, wait, gtfsZip, start, open, until, chromium, devices };
