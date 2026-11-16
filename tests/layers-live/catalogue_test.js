'use strict';
// Run with Playwright installed: node tests/layers-live/catalogue_test.js
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-catalogue-'));
  const port = '3978';
  const url = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '../..'), stdio: 'ignore',
    env: { ...process.env, PORT: port, DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: dir, ANTHROPIC_API_KEY: '' },
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      try { ready = (await fetch(url + '/api/config')).ok; }
      catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
    }
    assert.ok(ready, 'demo server started');
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    for (const lang of ['en', 'el']) {
      const page = await browser.newPage({ viewport: { width: lang === 'el' ? 390 : 1280, height: 800 } });
      await page.addInitScript(() => localStorage.setItem('sc.welcome.v1', '1'));
      await page.clock.install();
      await page.goto(url + '/?lang=' + lang + '#/layers');
      const rows = page.locator('#ly-results .ly-row');
      await rows.first().waitFor();
      const total = await rows.count();
      const search = page.locator('#ly-search');
      const filter = page.locator('#ly-filter');
      const bus = page.locator('[data-layer="sensecap-buses"]');
      const toggle = bus.getByRole('switch');
      const status = page.locator('.ly-matches');
      assert.ok(total > 5);
      assert.equal(await page.locator('.ly-fieldwork').getAttribute('href'), '#/fieldwork');
      const archive = page.locator('#ly-investigations');
      assert.ok(await archive.isHidden(), 'default catalogue stays compact');
      for (const term of ['seabed', 'βυθός']) {
        await search.fill(term);
        assert.ok(await archive.locator('a[href="#/fieldwork/coast"]').isVisible());
        assert.equal(await archive.locator('a:visible').count(), 1);
        assert.ok(await page.locator('.ly-empty').count() === 0);
        if (!(await rows.count())) assert.ok(!(await status.innerText()).includes('0'));
      }
      await search.fill('βαθος');
      assert.ok(await archive.locator('a[href="#/fieldwork/coast"]').isVisible());
      assert.ok(await archive.locator('a[href="#/fieldwork/aeronet"]').isVisible());
      for (const term of ['AERONET', 'αερολύματα']) {
        await search.fill(term);
        assert.ok(await archive.locator('a[href="#/fieldwork/aeronet"]').isVisible());
        assert.equal(await archive.locator('a:visible').count(), 1);
      }
      for (const term of ['nitrogen dioxide', 'όζον']) {
        await search.fill(term);
        assert.ok(await archive.locator('a[href="#/fieldwork/gases"]').isVisible());
      }
      for (const term of ['E1a', 'επικυρωμένες']) {
        await search.fill(term);
        assert.ok(await archive.locator('a[href="#/fieldwork/verifiedno2"]').isVisible());
        assert.equal(await archive.locator('a:visible').count(), 1);
      }
      for (const term of ['EMSR515', 'Αρακαπάς']) {
        await search.fill(term);
        assert.ok(await archive.locator('a[href="#/fieldwork/arakapas"]').isVisible());
      }
      await filter.selectOption('connected');
      assert.ok(await archive.isHidden());
      await filter.selectOption('all');
      await search.fill('pm2.5');
      assert.ok(await bus.isVisible(), 'joins PM2.5 to pm25');
      assert.ok(await rows.count() < total);
      await search.fill('λεωφορεια');
      assert.ok(await bus.isVisible(), 'Greek without accents matches both languages');
      await search.fill('SenseCAP buses');
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      assert.notEqual(await toggle.getAttribute('aria-checked'), before);
      assert.ok(await toggle.evaluate((el) => el === document.activeElement), 'switch retains keyboard focus');
      await search.focus();
      // A keyboard user may be partway through typing as the register refreshes.
      const refreshed = page.waitForResponse((r) => r.url().endsWith('/layers/api/register'));
      await page.clock.fastForward(61000);
      await refreshed;
      assert.equal(await search.inputValue(), 'SenseCAP buses');
      assert.ok(await search.evaluate((el) => el === document.activeElement));
      await search.fill('');
      await filter.selectOption('reference');
      assert.ok(await rows.count() >= 3);
      assert.equal(await page.locator('[data-layer="bathing-water-history"] .ly-pl').innerText(), lang === 'el' ? 'Αρχείο' : 'Archive');
      assert.equal(await page.locator('[data-layer="pv-solar-scenarios"] .ly-pl').innerText(), lang === 'el' ? 'Σενάριο' : 'Scenario');
      await filter.selectOption('pending');
      assert.ok(await rows.count() > 0);
      assert.equal(await rows.locator('[role="switch"]:enabled').count(), 0);
      await search.fill('xyz-no-matching-source');
      assert.equal(await rows.count(), 0);
      assert.ok((await status.innerText()).includes('0'));
      await page.locator('.ly-empty button').click();
      assert.equal(await rows.count(), total);
      assert.notEqual(await toggle.getAttribute('aria-checked'), before, 'filtering preserves the layer selection');
      assert.ok(await search.evaluate((el) => el === document.activeElement));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.close();
    }
    console.log('Catalogue search, filters, bilingual labels, selection and keyboard focus passed in English and Greek.');
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
