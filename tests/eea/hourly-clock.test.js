'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createEea, instantOf } = require('../../eea');

test('hourly EEA file clock maps decoded INT96 to UTC and honours explicit offsets', () => {
  const reader = createEea({ off: true });
  const offset = reader._x.S().hourOffset;
  assert.equal(offset, 1);
  const expected = Date.parse('2026-11-14T23:00:00Z');
  assert.equal(instantOf(new Date('2026-11-15T00:00:00Z'), offset), expected);
  assert.equal(instantOf('2026-11-15 00:00:00', offset), expected);
  assert.equal(instantOf('2026-11-15T01:00:00+02:00', offset), expected);
});

test('cache is reusable only when hourly series have the same file clock', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eea-clock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'eea'));
  const state = { meta: { stations: [] }, etags: { file: 'etag' }, series: { station: {} } };
  function load(version, storedOffset, configuredOffset) {
    fs.writeFileSync(path.join(dir, 'eea', 'cy-pm.json'), JSON.stringify({ ...state, v: version, hourOffset: storedOffset }));
    return createEea({ dataDir: dir, off: true, tzForce: configuredOffset })._x.S();
  }
  for (const cached of [load(2), load(3, 2)]) {
    assert.deepEqual(cached.series, {});
    assert.deepEqual(cached.etags, {});
    assert.deepEqual(cached.meta, state.meta);
  }
  assert.deepEqual(load(3, 1).series, state.series);
  assert.deepEqual(load(3, 2, '2').etags, state.etags);
});
