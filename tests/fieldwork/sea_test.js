'use strict';
/* Ships and ports (#/fieldwork/sea): the page in English, in Greek and on a phone, against the real server in demo mode.
   It checks what a pupil must be able to rely on: these are quarterly statistics and never ship positions; a missing value
   reads "not reported" and is never a zero or a joined line; totals and the national figure stay apart from their parts;
   the latest quarter with values is shown apart from the day of download.
   Run: node tests/fieldwork/sea_test.js          (set SEA_SHOTS=/some/folder to also save screenshots) */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.SEA_TEST_PORT || '3951';
const BASE = 'http://127.0.0.1:' + PORT;
const SHOTS = process.env.SEA_SHOTS || '';
const EXTRACTS = ['seaarrivals', 'seanational', 'seafreight'];
const TEXT = {
  en: {
    notLive: 'These are published statistics by quarter. They do not show where ships are right now.',
    not: 'not reported', arrivals: 'arrivals', tonnes: 'thousand tonnes', larnaka: 'Larnaka', lemesos: 'Lemesos', moni: 'Moni',
    zygi: 'Zygi (Vasilikos area)', approx: 'approximate position of the port', thousands: '1,061', national: '8,973',
  },
  el: {
    notLive: 'Αυτά είναι δημοσιευμένα στατιστικά ανά τρίμηνο. Δεν δείχνουν πού βρίσκονται τα πλοία αυτή τη στιγμή.',
    not: 'δεν αναφέρθηκε', arrivals: 'αφίξεις', tonnes: 'χιλιάδες τόνοι', larnaka: 'Λάρνακα', lemesos: 'Λεμεσός', moni: 'Μονή',
    zygi: 'Ζύγι (περιοχή Βασιλικού)', approx: 'θέση του λιμανιού κατά προσέγγιση', thousands: '1.061', national: '8.973',
  },
};

async function checkPage(browser, lang, width, height, shots) {
  const L = TEXT[lang];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) errors.push('CSP: ' + m.text()); });
  const name = lang + ' ' + width + 'px';
  const shot = async (file, selector) => {
    if (!SHOTS || !file) return;
    await page.locator(selector).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await wait(200);
    await page.screenshot({ path: path.join(SHOTS, file) });   // the viewport, not the full page
  };
  const noSidewaysScroll = async (when) => {
    const [content, view] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(content <= view, name + ': the page scrolls sideways ' + when + ' (' + content + ' > ' + view + ')');
  };

  await page.goto(BASE + '/?lang=' + lang + '#/fieldwork/sea');
  const panel = page.locator('#fw-investigation');
  await panel.locator('.fw-sea-notlive').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('html').getAttribute('lang'), lang);
  assert.equal(await page.locator('.fw-nav a[aria-current=page]').getAttribute('href'), '#/fieldwork/sea');

  // it says plainly what this is not, and keeps the latest quarter apart from the download date
  assert.equal((await panel.locator('.fw-sea-notlive').innerText()).trim(), L.notLive);
  const dates = await panel.locator('.fw-sea-dates').innerText();
  assert.match(dates, /2025-Q4/); assert.match(dates, /2026-Q1/); assert.match(dates, /2017-Q1/); assert.match(dates, /2026-11-19/);
  assert.equal(await panel.locator('.fw-sea-dates span').count(), 2, name + ': observed period and download date are separate statements');
  await noSidewaysScroll('on arrival');

  // the map: five fixed, numbered port marks on the outline, nothing that moves, and a table beside it
  const map = panel.locator('svg.fw-sea-map');
  assert.equal(await map.locator('g').count(), 5);
  assert.ok((await map.locator('path').count()) > 5, name + ': the Cyprus outline is drawn');
  assert.ok((await map.getAttribute('aria-label')).includes(L.approx));
  assert.equal(await panel.locator('animate, animateMotion, animateTransform, marquee, video, canvas').count(), 0);
  assert.equal(await panel.evaluate((e) => e.getAnimations({ subtree: true }).length), 0, name + ': nothing in the view is animated');
  const firstPort = panel.locator('.fw-sea-ports button').first();
  await firstPort.focus();
  await page.keyboard.press('Enter');
  assert.equal(await firstPort.getAttribute('aria-pressed'), 'true');
  const detail = await panel.locator('.fw-sea-detail').innerText();
  assert.ok(detail.includes(L.larnaka) && detail.includes(L.approx) && detail.includes('34.92°N, 33.65°E'), name + ': ' + detail);
  assert.ok(detail.includes('2026-Q1, 548 ' + L.tonnes) && detail.includes('2025-Q4, 85 ' + L.arrivals), name + ': ' + detail);
  assert.equal(await map.locator('circle[visibility=visible]').count(), 1, name + ': the chosen port is ringed');
  await page.keyboard.press('Tab');
  assert.equal(await panel.locator('.fw-sea-ports button').nth(1).evaluate((e) => e === document.activeElement), true, name + ': ports are reachable by keyboard');
  const portRows = panel.locator('.fw-sea-part').first().locator('tbody tr');
  assert.equal(await portRows.count(), 5);
  const moniRow = await portRows.nth(4).innerText();
  assert.ok(moniRow.includes(L.moni) && moniRow.includes('2017-Q1') && moniRow.includes('115 ' + L.tonnes) && moniRow.includes(L.not), name + ': ' + moniRow);
  await shot(shots.map, '.fw-sea-part');

  // one quarter of arrivals: units on every number, missing written out, totals kept apart
  const quarter = panel.locator('#fw-sea-quarter');
  assert.equal(await quarter.inputValue(), '2025-Q4', name + ': opens on the latest quarter that has values');
  const part = panel.locator('.fw-sea-part').nth(1);
  const total = await part.locator('.fw-sea-total').innerText();
  assert.ok(total.includes(L.larnaka + ' 85 ' + L.arrivals) && total.includes(L.lemesos + ' 363 ' + L.arrivals), name + ': ' + total);
  const bars = await part.locator('.fw-bars').innerText();
  assert.ok(bars.includes(L.lemesos + ' · 180 ' + L.arrivals), name + ': container ships at Lemesos');
  assert.ok(bars.includes(L.larnaka + ' · ' + L.not), name + ': a missing type is written out');
  assert.ok(!/· 0 /.test(bars), name + ': no missing value is drawn as zero');
  assert.equal(await part.locator('.fw-bar-line').count(), 2 * (await part.locator('.fw-bar-group').count()));
  const missingLines = part.locator('.fw-bar-line:has(.fw-sea-missing)');
  assert.ok((await missingLines.count()) > 0);
  assert.equal(await missingLines.locator('.fw-bar').count(), 0, name + ': a missing value has no bar at all');
  const cells = await part.locator('tbody td').allInnerTexts();
  assert.ok(cells.length > 10 && cells.every((c) => c.includes(L.not) || / (αφίξεις|άφιξη|arrivals|arrival)$/.test(c.trim())), name + ': every cell has a unit or says not reported');
  assert.ok((await part.locator('caption').innerText()).includes('mar_tf_qm') && (await part.locator('caption').innerText()).includes('2025-Q4'));
  assert.equal(await part.locator('tfoot tr').count(), 1, name + ': the published total sits in its own row');
  const nation = await part.locator('.fw-sea-national').innerText();
  assert.ok(nation.includes('609 ' + L.arrivals) && nation.includes(L.national), name + ': ' + nation);
  await shot(shots.arrivals, '.fw-sea-part:nth-of-type(2)');
  // a quarter Eurostat lists but has not published: everything reads "not reported", nothing reads 0
  await quarter.selectOption('2026-Q1');
  const later = await part.locator('.fw-sea-total').innerText();
  assert.ok(later.includes(L.larnaka + ' ' + L.not) && later.includes(L.lemesos + ' ' + L.not), name + ': ' + later);
  assert.equal(await part.locator('.fw-bar').count(), 0);
  assert.ok((await part.locator('tbody td, tfoot td').allInnerTexts()).every((c) => c.trim() === L.not));
  assert.ok((await part.locator('.fw-sea-national').innerText()).includes(L.not));
  await quarter.selectOption('2022-Q2');
  assert.ok((await part.locator('.fw-bars').innerText()).includes(L.larnaka + ' · 6 ' + L.arrivals));

  // a port over time: the line breaks where a quarter is missing
  const overTime = panel.locator('.fw-sea-part').nth(2);
  assert.equal(await overTime.locator('.fw-chart path').count(), 2, name + ': Larnaka and Lemesos, without the national figure');
  await overTime.locator('#fw-sea-type').selectOption('ODC_CNT');
  const larnakaContainers = await overTime.locator('.fw-chart path').first().getAttribute('d');
  // six reported quarters; only 2022-Q1 and 2022-Q2 are neighbours, so only they are joined
  assert.equal((larnakaContainers.match(/M/g) || []).length, 5, name + ': gaps are not joined: ' + larnakaContainers);
  assert.equal((larnakaContainers.match(/L/g) || []).length, 1);
  await overTime.locator('#fw-sea-type').selectOption('TOTAL');
  await overTime.locator('.fw-legend input').nth(2).check();
  assert.equal(await overTime.locator('.fw-chart path').count(), 3);
  assert.equal(await overTime.locator('.fw-sea-national').count(), 1, name + ': the national line comes with its warning');
  await overTime.locator('.fw-legend input').nth(2).uncheck();

  // cargo weight: units, Moni ending where it ends, zero kept as zero
  const cargo = panel.locator('.fw-sea-part').nth(3);
  const latest = await cargo.locator('.fw-sea-latest').innerText();
  assert.ok(latest.includes(L.zygi) && latest.includes('2026-Q1: ' + L.thousands + ' ' + L.tonnes), name + ': ' + latest);
  assert.ok(latest.includes('2017-Q1: 115 ' + L.tonnes), name + ': ' + latest);
  assert.ok((await cargo.locator('.fw-sea-ends').innerText()).includes('2017-Q1'));
  const moni = await cargo.locator('.fw-chart path').nth(4).getAttribute('d');
  assert.equal((moni.match(/[ML]/g) || []).length, 5, name + ': Moni has five reported quarters and no more: ' + moni);
  assert.equal((moni.match(/M/g) || []).length, 4, name + ': the Moni line is not joined across its gaps');
  await shot(shots.cargo, '.fw-sea-part:nth-of-type(4)');
  const summary = cargo.locator('details summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  const lastRow = await cargo.locator('details tbody tr').last().innerText();
  assert.ok(lastRow.startsWith('2026-Q1') && lastRow.includes(L.thousands + ' ' + L.tonnes) && lastRow.includes(L.not), name + ': ' + lastRow);
  assert.equal(await cargo.locator('details tbody tr').count(), 45);
  await noSidewaysScroll('with the cargo table open');
  await cargo.locator('#fw-sea-cargo').selectOption('LBK');
  await cargo.locator('#fw-sea-direction').selectOption('OUT');
  const rows = await cargo.locator('details tbody tr').allInnerTexts();
  const q = rows.find((r) => r.startsWith('2020-Q2'));
  assert.ok(q.includes(L.not), name + ': ' + q);
  await cargo.locator('#fw-sea-direction').selectOption('TOTAL');
  const zeroRow = (await cargo.locator('details tbody tr').allInnerTexts()).find((r) => r.startsWith('2020-Q2'));
  assert.ok(new RegExp('\\b0 ' + L.tonnes).test(zeroRow), name + ': a published zero stays a zero: ' + zeroRow);
  const caption = await cargo.locator('details caption').innerText();
  assert.ok(caption.includes('mar_go_qm_cy') && caption.includes(L.tonnes));

  // source, terms and the three files behind the page
  const source = await panel.locator('.fw-source').innerText();
  assert.ok(source.includes(lang === 'el' ? 'Πηγή: Eurostat' : 'Source: Eurostat') && source.includes('2026-11-19') && source.includes('2026-Q3'));
  assert.equal(await panel.locator('.fw-source a[href="https://ec.europa.eu/eurostat/help/copyright-notice"]').count(), 1);
  for (const id of EXTRACTS) assert.equal(await panel.locator('.fw-source a[href="/api/fieldwork/' + id + '"]').count(), 1);
  if (lang === 'el') assert.ok(!/[A-Za-z]{4,} [a-z]{4,} [a-z]{4,}/.test(await panel.locator('.fw-sea-part').nth(4).innerText()), name + ': the closing note is in Greek');
  await noSidewaysScroll('at the end');
  assert.deepEqual(errors, [], name);
  await context.close();
}

test('Ships and ports: statistics by quarter, in English, Greek and on a phone', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kleanthis-sea-'));
  const child = spawn(process.execPath, ['--require', './tests/sat-air/fake-network.js', 'server.js'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT, DEMO: '1', OPEN_METEO_MOCK: '1', SATELLITE: '0', DATA_DIR: folder, ANTHROPIC_API_KEY: '' },
  });
  const exited = once(child, 'exit');
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error('Demo server exited during startup');
      try { if ((await fetch(BASE + '/api/fieldwork/seafreight', { method: 'HEAD' })).ok) break; } catch { /* still starting */ }
      await wait(150);
    }
    for (const id of EXTRACTS) {
      const response = await fetch(BASE + '/api/fieldwork/' + id);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(ROOT, 'fieldwork', id + '.json')));
      assert.equal((await fetch(BASE + '/api/fieldwork/' + id, { method: 'POST' })).status, 405);
    }
    assert.equal((await fetch(BASE + '/api/fieldwork/seafreight-source.jsonstat')).status, 404);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    await checkPage(browser, 'en', 1280, 900, { map: 'sea-map-en.png', arrivals: 'sea-arrivals-en.png', cargo: 'sea-cargo-en.png' });
    await checkPage(browser, 'el', 1280, 900, { arrivals: 'sea-arrivals-el.png' });
    await checkPage(browser, 'en', 390, 844, { map: 'sea-map-phone.png', cargo: 'sea-cargo-phone.png' });
    await checkPage(browser, 'el', 360, 740, {});
  } finally {
    if (browser) await browser.close();
    child.kill();
    await exited;
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
