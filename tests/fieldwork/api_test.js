'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');

test('serves only the sixteen dated extracts and rejects writes', async () => {
  const root = path.resolve(__dirname, '../..');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-fieldwork-'));
  const port = process.env.FIELDWORK_TEST_PORT || '3979';
  const base = 'http://127.0.0.1:' + port + '/api/fieldwork/';
  const child = spawn(process.execPath, ['--require', './tests/sat-air/fake-network.js', 'server.js'], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, PORT: port, DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: folder, ANTHROPIC_API_KEY: '' }
  });
  const exited = once(child, 'exit');
  try {
    for (let i=0; i<60; i++) {
      if (child.exitCode !== null) throw new Error('Demo server exited during startup');
      try { if ((await fetch(base+'reservoir', { method:'HEAD' })).ok) break; }
      catch { /* The listener is still starting. */ }
      await wait(100);
    }
    for (const key of ['reservoir','weather','coast','crossings','census','ev','power','flood','drought','aeronet','gases','verifiedno2','arakapas','seaarrivals','seanational','seafreight']) {
      const response = await fetch(base+key);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(bytes, fs.readFileSync(path.join(root,'fieldwork',key+'.json')));
      const head = await fetch(base+key, { method:'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(Number(head.headers.get('Content-Length')),bytes.length);
      assert.equal(await head.text(),'');
      const post = await fetch(base+key, { method:'POST' });
      assert.equal(post.status,405);
      assert.equal(post.headers.get('Allow'),'GET, HEAD');
    }
    assert.equal((await fetch(base+'import_weather.py')).status,404);
  } finally {
    child.kill();
    await exited;
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
