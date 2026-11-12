// Run the whole server with fake providers: node -r tests/sat-air/fake-network.js server.js  (env: DEMO=1 OPEN_METEO_MOCK=1 SATELLITE_LIVE=1 DATA_DIR=<temp> PORT=<free>)
// Test-only stand-in for the network, for the end-to-end run of the sat-air feeds through the REAL server and the REAL satellite/http.js.
// The sandbox cannot reach the internet, so the two providers' answers come from here, built from the providers' documented shapes and
// from the real clock. Everything that is not local and not one of the two providers gets an instant 403 (the other agents' feeds).
//   FAKE_DUST=1      a Saharan dust day: haze 1.2 and UV aerosol index 4.2 (the CAMS model and the satellite agree)
//   FAKE_LOG=<file>  one JSON line per request: { host, path, status } (no headers, no bodies, no keys)
//   FAKE_CDSE_ID / FAKE_CDSE_SECRET   the only client the fake token endpoint accepts (anything else gets 401)
const fs = require('fs');
const real = globalThis.fetch;
const DUST = process.env.FAKE_DUST === '1';
const LOG = process.env.FAKE_LOG || null;
const note = (host, path, status) => { if (LOG) { try { fs.appendFileSync(LOG, JSON.stringify({ host, path, status }) + '\n'); } catch (e) { /* ignore */ } } };
const json = (host, path, status, obj, headers) => { note(host, path, status); return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...(headers || {}) } }); };

function airQuality(u) {
  const lat = u.searchParams.get('latitude').split(',').map(Number), lng = u.searchParams.get('longitude').split(',').map(Number);
  const vars = u.searchParams.get('hourly').split(',');
  const day = Math.floor(Date.now() / 86400000) * 86400;
  const hours = Array.from({ length: 48 }, (_, i) => day - 86400 + i * 3600);
  const nowH = Math.floor(Date.now() / 3600000) * 3600;
  const series = {
    aerosol_optical_depth: (t, i) => (DUST && t >= nowH - 12 * 3600 ? +(1.2 + 0.05 * i).toFixed(3) : +(0.14 + 0.03 * i + 0.02 * Math.sin(t / 21600)).toFixed(3)),
    uv_index: (t) => Math.max(0, +(3.4 * Math.cos((((t / 3600) % 24) - 10) * Math.PI / 9)).toFixed(2)),
    nitrogen_dioxide: (t, i) => +(6 + 2 * i + 3 * Math.cos(t / 14400)).toFixed(2),
    sulphur_dioxide: (t, i) => +(1.1 + 0.2 * i + 0.1 * Math.sin(t / 18000)).toFixed(2),
    carbon_monoxide: (t, i) => +(118 + 9 * i + 6 * Math.sin(t / 10800)).toFixed(1),
  };
  const place = (i) => ({
    latitude: lat[i], longitude: lng[i], generationtime_ms: 0.6, utc_offset_seconds: 0, timezone: 'GMT', timezone_abbreviation: 'GMT', elevation: 20,
    hourly_units: Object.fromEntries([['time', 'unixtime'], ...vars.map((v) => [v, /nitrogen|sulphur|carbon/.test(v) ? 'μg/m³' : ''])]),
    hourly: { time: hours, ...Object.fromEntries(vars.map((v) => [v, hours.map((t) => series[v](t, i))])) },
  });
  const all = lat.map((_, i) => place(i));
  return all.length === 1 ? all[0] : all;
}

const MEAN = { NO2: 3.1e-5, CO: 0.035, O3: 0.125, SO2: 1e-4, AER_AI_340_380: DUST ? 4.2 : 0.3 };
function cdseStats(init, host, path) {
  if (!/^Bearer tok-/.test(String(init.headers.authorization || ''))) return json(host, path, 401, { error: 'bad token' });
  const b = JSON.parse(init.body);
  const band = /bands: \["(\w+)"/.exec(b.aggregation.evalscript)[1];
  const day0 = Date.parse(b.aggregation.timeRange.from);
  const iv = (d, mean, nodata) => ({ interval: { from: new Date(day0 + d * 86400000).toISOString().replace('.000Z', 'Z'), to: new Date(day0 + (d + 1) * 86400000).toISOString().replace('.000Z', 'Z') }, outputs: { default: { bands: { B0: { stats: { min: mean, max: mean, mean: nodata ? 'NaN' : mean, stDev: 0, sampleCount: 16, noDataCount: nodata ? 16 : 2 } } } } } });
  // today has not been passed over yet (empty), yesterday is clear, the day before is cloudy: the newest CLEAR day is yesterday
  return json(host, path, 200, { data: [iv(0, 0, true), iv(1, MEAN[band]), iv(2, 0, true)], status: 'OK' });
}

globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const host = u.hostname;
  if (host === '127.0.0.1' || host === 'localhost') return real(input, init);
  if (host === 'air-quality-api.open-meteo.com') return json(host, u.pathname, 200, airQuality(u));
  if (host === 'identity.dataspace.copernicus.eu') {
    const f = new URLSearchParams(String(init.body || ''));
    const good = process.env.FAKE_CDSE_ID && f.get('client_id') === process.env.FAKE_CDSE_ID && f.get('client_secret') === process.env.FAKE_CDSE_SECRET && f.get('grant_type') === 'client_credentials';
    return good ? json(host, u.pathname, 200, { access_token: 'tok-' + Date.now(), expires_in: 600, token_type: 'Bearer' }) : json(host, u.pathname, 401, { error: 'unauthorized_client' });
  }
  if (host === 'sh.dataspace.copernicus.eu') return cdseStats(init, host, u.pathname);
  note(host, u.pathname, 403);
  return new Response('blocked in the test', { status: 403 });
};
