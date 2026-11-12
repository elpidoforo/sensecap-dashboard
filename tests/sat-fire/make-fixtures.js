'use strict';
/* Writes the FIRMS test files into ./fixtures. They follow the column layout of the FIRMS "area" API (CSV): VIIRS rows have
 * bright_ti4 / bright_ti5 and a confidence letter (l, n, h); MODIS rows have brightness / bright_t31 and a confidence number 0 to 100.
 * The scenario: an August afternoon, the lists were fetched at 2026-08-14 15:00 UTC.
 *   Paphos      one fire 10 km north, seen by NOAA-20 (11:02), MODIS (10:55) and NOAA-21 (12:48): ONE hotspot
 *   Limassol    a hotspot 24.9 km north (inside 25 km) and one 25.2 km north (only inside 50 km)
 *   Lefkosia    one hotspot 12.7 km north (MODIS confidence 30, the lowest that counts) and one 80 km north
 *   Larnaka     nothing within 25 km; the Lefkosia hotspot is 47 km away
 *   rows that must NOT count: low confidence (VIIRS l, MODIS 25 and 29), bad rows (letters, time 2599, 31 February, too few cells),
 *   a row from the future, a row 33 hours old, and an exact duplicate.
 * Run:  node tests/sat-fire/make-fixtures.js */
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'fixtures');
fs.mkdirSync(out, { recursive: true });

const HV = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
const HM = 'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight';
const v = (lat, lon, date, time, sat, conf, dn) => `${lat},${lon},331.2,0.39,0.36,${date},${time},${sat},VIIRS,${conf},2.0NRT,295.4,3.1,${dn || 'D'}`;
const m = (lat, lon, date, time, sat, conf, dn) => `${lat},${lon},330.4,1.0,1.0,${date},${time},${sat},MODIS,${conf},6.1NRT,300.2,9.0,${dn || 'D'}`;
const D = '2026-08-14';

const noaa20 = [HV,
  v(34.8654, 32.4245, D, '1102', 'N20', 'n'),
  v(34.8654, 32.4245, D, '1102', 'N20', 'n'),            // exact duplicate
  v(34.9080, 33.0379, D, '0910', 'N20', 'h'),            // Limassol + 24.9 km
  v(34.7000, 33.0500, D, '0910', 'N20', 'l'),            // low confidence: dropped
  v(35.9056, 33.3823, D, '0222', 'N20', 'n', 'N'),       // Lefkosia + 80 km
  'abc,33.0,330,0.4,0.4,' + D + ',1100,N20,VIIRS,n,2.0NRT,290,1,D',   // latitude is not a number
  '34.8,33.0,330,0.4,0.4,' + D + ',2599,N20,VIIRS,n,2.0NRT,290,1,D',  // time 25:99
  '34.8,33.0,330,0.4,0.4,2026-02-31,1100,N20,VIIRS,n,2.0NRT,290,1,D', // 31 February
  '34.8,33.0,330',                                                     // too few cells
  '34.8,33.0,330,0.4,0.4,' + D + ',1100,N20,VIIRS,maybe,2.0NRT,290,1,D', // confidence is not a class
  v(34.8500, 33.1000, '2026-08-15', '0300', 'N20', 'n', 'N'),          // from the future
  v(34.9500, 33.6200, '2026-08-13', '0600', 'N20', 'n'),               // 33 hours before the fetch: outside the 24 hours (Larnaka + 3 km)
].join('\n') + '\n';
const noaa21 = [HV,
  v(34.8657, 32.4249, D, '1248', 'N21', 'h'),            // the Paphos fire again
  v(34.9107, 33.0379, D, '1420', 'N21', 'n'),            // Limassol + 25.2 km
].join('\n') + '\n';
const modis = [HM,
  m(34.8660, 32.4240, D, '1055', 'Terra', '85'),         // the Paphos fire again, MODIS
  m(35.0000, 33.6000, D, '1055', 'Terra', '25'),         // low: dropped (Larnaka + 9 km)
  m(35.3000, 33.3823, D, '1330', 'Aqua', '30'),          // Lefkosia + 12.7 km, 30 is the lowest "nominal"
  m(35.1000, 33.4000, D, '1330', 'Aqua', '29'),          // 29 is low: dropped
].join('\n') + '\n';

const files = {
  'firms_viirs_noaa20.csv': noaa20,
  'firms_viirs_noaa21.csv': noaa21,
  'firms_modis.csv': modis,
  'firms_viirs_snpp_empty.csv': HV + '\n',
  'firms_viirs_empty.csv': HV + '\n',
  'firms_modis_empty.csv': HM + '\n',
  'firms_bad_key.txt': 'Invalid MAP_KEY.\n',
  'firms_html_error.html': '<!doctype html><html><body><h1>Service unavailable</h1></body></html>\n',
};
for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(out, name), body);
console.log('wrote', Object.keys(files).length, 'fixtures to', out);
