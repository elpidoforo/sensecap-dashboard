// node fieldwork/extract_verifiedno2.mjs /path/to/original/parquet/files > extract.csv
// hyparquet uses JS Date to represent the publisher's naive timestamps. Keep the
// wall-clock digits and attach the EEA's documented fixed UTC+1 explicitly.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parquetReadObjects } from '../vendor/hyparquet/src/index.js';

const archive = {
  CY0002R: '4db0d27d50869fa15b7976a501c70e8dfb64f96a4147a51e92ae3c4692937ea9',
  CY0004A: '4ebeae687d59af9fe6856669d16abf0b3c61888885faf453cdeea82b7b151521',
  CY0006A: '86e601251e87c5e775e0e52be301ddfc6654f98baedc67d25f7e6b5e3bda5204',
};
const csv = ['station_code,sampling_point,interval_start,interval_end,no2,unit,validity,verification,result_time_source_clock'];
for (const [station, digest] of Object.entries(archive)) {
  const fileName = 'SPO-' + station + '_00008_100.parquet';
  const bytes = readFileSync(join(process.argv[2], fileName));
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw Error('Archive checksum changed: ' + fileName);
  const file = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const records = await parquetReadObjects({ file });
  const day = records.filter(row => row.Start.toISOString().startsWith('2024-05-15'));
  if (day.length !== 24) throw Error('Expected 24 hourly concentrations for ' + station);
  day.sort((a, b) => a.Start - b.Start);
  for (const row of day) {
    if (row.Pollutant !== 8 || row.AggType !== 'hour' || row.Unit !== 'ug.m-3' ||
        row.Validity !== 1 || row.Verification !== 1 || !Number.isFinite(row.Value)) {
      throw Error('Unexpected observation fields at ' + row.Start);
    }
    const clock = date => date.toISOString().slice(0, 19);
    csv.push([station, row.Samplingpoint, clock(row.Start) + '+01:00', clock(row.End) + '+01:00',
      row.Value, row.Unit, row.Validity, row.Verification, clock(row.ResultTime)].join(','));
  }
}
process.stdout.write(csv.join('\n') + '\n');
