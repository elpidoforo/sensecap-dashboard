// Writes the fixtures of the sat-air tests (shapes follow the providers' documentation; the numbers are invented but plausible).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'fixtures');
const T0 = Date.UTC(2026, 10, 11, 0, 0) / 1000;   // 2026-11-11 00:00 UTC, 48 hours follow (past_days=1, forecast_days=1)
const hours = Array.from({ length: 48 }, (_, i) => T0 + i * 3600);
const CITIES = ['larnaka', 'lefkosia', 'limassol', 'paphos'];
const uv = (h) => Math.max(0, +(3.4 * Math.cos(((h % 24) - 10) * Math.PI / 9)).toFixed(2));
const place = (i, lat, lng) => ({
  latitude: lat, longitude: lng, generationtime_ms: 0.6, utc_offset_seconds: 0, timezone: 'GMT', timezone_abbreviation: 'GMT', elevation: 20 + i,
  hourly_units: { time: 'unixtime', aerosol_optical_depth: '', uv_index: '', nitrogen_dioxide: 'μg/m³', sulphur_dioxide: 'μg/m³', carbon_monoxide: 'μg/m³' },
  hourly: {
    time: hours,
    aerosol_optical_depth: hours.map((_, h) => +(0.14 + 0.03 * i + 0.02 * Math.sin(h / 6)).toFixed(3)),
    uv_index: hours.map((_, h) => uv(h)),
    nitrogen_dioxide: hours.map((_, h) => +(6 + 2 * i + 3 * Math.cos(h / 4)).toFixed(2)),
    sulphur_dioxide: hours.map((_, h) => +(1.1 + 0.2 * i + 0.1 * Math.sin(h / 5)).toFixed(2)),
    carbon_monoxide: hours.map((_, h) => +(118 + 9 * i + 6 * Math.sin(h / 3)).toFixed(1)),
  },
});
const places = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vocab', 'places.json'), 'utf8'));
const list = CITIES.map((id, i) => place(i, places[id].lat, places[id].lng));
fs.writeFileSync(path.join(dir, 'om-air-4cities.json'), JSON.stringify(list));
fs.writeFileSync(path.join(dir, 'om-air-1city.json'), JSON.stringify(list[0]));
// a dust day: haze 1.2 in all four places in the last hours
const dust = JSON.parse(JSON.stringify(list));
dust.forEach((p) => { for (let h = 36; h < 48; h++) p.hourly.aerosol_optical_depth[h] = 1.2; });
fs.writeFileSync(path.join(dir, 'om-air-dust.json'), JSON.stringify(dust));
fs.writeFileSync(path.join(dir, 'om-error-400.json'), JSON.stringify({ error: true, reason: 'Cannot initialize CamsVariable from invalid String value aerosol_optical_depthx.' }));
console.log('fixtures written', fs.readdirSync(dir));
