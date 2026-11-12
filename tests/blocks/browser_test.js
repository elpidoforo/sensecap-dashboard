'use strict';
// Browser test of the block builder: real server (demo data), a signed-in student, Chromium. EN and EL, desktop and phone width.
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const PORT = 3942, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-shots-'));   // screenshots for a person to look at; the path is printed at the end
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocksb-'));
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) { const c = sc.split(';')[0]; cookie = /=$/.test(c) ? '' : c; }
    const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), cookie: () => cookie };
}
(async () => {
  const env = { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dataDir, ADMIN_SETUP_CODE: 'BK-SETUP', ANTHROPIC_API_KEY: '' };
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..', '..'), env, stdio: 'ignore' });
  process.on('exit', () => { try { srv.kill(); } catch (e) { /* gone */ } });
  for (let i = 0; i < 80; i++) { try { await fetch(BASE + '/app/api/schools'); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  const vis = agent(), adm = agent();
  await adm.post('/app/api/admin-join', { setup_code: 'BK-SETUP', name: 'owner', password: 'Blocks-owner-pass-1' });
  const sch = (await vis.get('/app/api/schools/public')).json.schools;
  const mia = agent();
  await mia.post('/app/api/join', { school_id: sch[0].id, role: 'student', name: 'Mia Konstantinou', password: 'pass-MiaK-12', consent: true, new_team: 'Hermes' });
  const ov = (await adm.get('/app/api/manage/overview')).json;
  for (const m of ov.members) if (m.status === 'pending') await adm.post(`/app/api/manage/users/${m.id}/approve`, {});
  const ck = mia.cookie(); const [cname, cval] = [ck.slice(0, ck.indexOf('=')), ck.slice(ck.indexOf('=') + 1)];

  const browser = await chromium.launch();
  const run = async (lang, viewport, tag) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: lang === 'el' ? 'el-GR' : 'en-GB' });
    await ctx.addCookies([{ name: cname, value: cval, url: BASE }]);
    const page = await ctx.newPage();
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/dom/')) bad.push('HTTP ' + r.status() + ' ' + r.url().replace(BASE, '')); });
    page.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 502/.test(m.text())) bad.push('console: ' + m.text()); });
    const L = (en, el) => (lang === 'el' ? el : en);
    await page.goto(`${BASE}/?lang=${lang}#/studio`);
    await page.waitForSelector('.sd-bt:not([hidden])', { timeout: 15000 });
    ok(await page.locator('#sd-tab-blocks').isVisible(), tag + ': the Build with blocks tab is shown to a signed-in student');
    ok((await page.locator('#sd-tab-blocks').innerText()) === L('Build with blocks', 'Φτιάξτε με μπλοκ'), tag + ': tab label');
    await page.screenshot({ path: `${SHOTS}/${tag}_1_tabs.png` });
    await page.click('#sd-tab-blocks');
    await page.waitForSelector('.bk-iframe[src]', { timeout: 15000 });
    ok(await page.locator('#sd-p-words').isHidden(), tag + ': the describe box hides while building with blocks');
    const sentence1 = await page.locator('.bk-words p').innerText();
    ok(sentence1.startsWith(L('Show CO2 at', 'Δείξε CO₂ στο')), tag + ': the sentence is in the site language (' + sentence1.slice(0, 50) + ')');
    // the preview is a page that really draws a chart
    const fr = page.frameLocator('.bk-iframe');
    await fr.locator('svg').first().waitFor({ timeout: 15000 });
    ok(await fr.locator('svg').count() >= 1, tag + ': preview shows the chart');
    await page.screenshot({ path: `${SHOTS}/${tag}_2_start.png`, fullPage: false });

    // change: temperature, a different school, alert block, compare block
    await page.selectOption('[data-k="measurement"]', '4097');
    await page.waitForTimeout(300);
    ok((await page.locator('.bk-words p').innerText()).length > 20, tag + ': words still there after a change');
    await page.click('[data-k="add-alert"]');
    ok(await page.locator('[data-k="a0v"]').count() === 1, tag + ': an alert block was added');
    await page.fill('[data-k="a0v"]', '27');
    await page.fill('[data-k="a0s"]', L('It is warm', 'Κάνει ζέστη'));
    await page.click('[data-k="add-compare"]');
    ok(await page.locator('[data-k="compare"]').count() === 1, tag + ': a compare block was added');
    await page.waitForFunction(() => /27/.test(document.querySelector('.bk-words p').textContent), null, { timeout: 15000 });
    const sentence2 = await page.locator('.bk-words p').innerText();
    ok(/27/.test(sentence2) && sentence2.includes(L('It is warm', 'Κάνει ζέστη')), tag + ': the sentence follows the blocks (' + sentence2 + ')');
    await page.fill('#bk-title', L('Warm classroom', 'Ζεστή τάξη'));
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/${tag}_3_built.png`, fullPage: true });
    await page.locator('.bk').screenshot({ path: `${SHOTS}/${tag}_3b_builder.png` });
    await page.locator('.bk-frame').scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/${tag}_3c_preview_view.png` });
    ok((await fr.locator('svg').first().boundingBox()).width > 200, tag + ': the chart in the preview has room');
    ok(await page.locator('[data-k="add-alert"]').isEnabled(), tag + ': can add more alerts');
    { const all = await page.locator('.bk').innerText(); ok(!/\b(null|undefined|NaN|\[object)/.test(all), tag + ': no stray null / undefined / NaN in the builder text'); }

    // save a draft
    await page.click(`.bk-acts button:has-text("${L('Save draft', 'Αποθήκευση προσχεδίου')}")`);
    await page.waitForSelector('.bk-done', { timeout: 15000 });
    { const all = await page.locator('.bk').innerText(); ok(!/\b(null|undefined|NaN|\[object)/.test(all), tag + ': no stray null / undefined / NaN after saving'); }
    ok(true, tag + ': saved');
    await page.waitForSelector(`.sd-kc button:has-text("${L('Edit blocks', 'Επεξεργασία μπλοκ')}")`, { timeout: 15000 });
    ok(await page.locator('.sd-kc:has(button:has-text("' + L('Edit blocks', 'Επεξεργασία μπλοκ') + '")) h3', { hasText: L('Warm classroom', 'Ζεστή τάξη') }).count() === 1, tag + ': the draft card is listed with its title');
    await page.screenshot({ path: `${SHOTS}/${tag}_4_saved.png`, fullPage: true });

    // open it again from the card
    await page.click(`.sd-kc button:has-text("${L('Edit blocks', 'Επεξεργασία μπλοκ')}")`);
    await page.waitForFunction(() => document.querySelector('[data-k="compare"]'), null, { timeout: 15000 });
    ok((await page.inputValue('[data-k="a0v"]')) === '27', tag + ': the alert number came back');
    ok((await page.inputValue('[data-k="a0s"]')) === L('It is warm', 'Κάνει ζέστη'), tag + ': the alert message came back');
    ok((await page.inputValue('#bk-title')) === L('Warm classroom', 'Ζεστή τάξη'), tag + ': the title came back');

    // keyboard: the tabs and a select
    await page.focus('#sd-tab-blocks');
    await page.keyboard.press('ArrowLeft');
    ok(await page.locator('#sd-tab-words').getAttribute('aria-selected') === 'true' && await page.locator('#sd-p-words').isVisible(), tag + ': arrow keys move between the tabs');
    await page.keyboard.press('ArrowRight');
    ok(await page.locator('#sd-p-words').isHidden() && await page.locator('.bk-grid').isVisible(), tag + ': and back to the blocks, nothing lost');
    ok((await page.inputValue('[data-k="a0v"]')) === '27', tag + ': blocks stay mounted while the other tab is open');

    // send to the teacher
    await page.click(`.bk-acts button:has-text("${L('Send to my teacher', 'Αποστολή στον εκπαιδευτικό μου')}")`);
    await page.waitForSelector('#bk-shown', { timeout: 5000 });
    ok(await page.locator('#bk-shown').isChecked(), tag + ': the show-my-name box is ticked by default');
    await page.screenshot({ path: `${SHOTS}/${tag}_5_send.png` });
    await page.click(`.modal button:has-text("${L('Send to teacher', 'Αποστολή στον εκπαιδευτικό')}"), [role=dialog] button:has-text("${L('Send to teacher', 'Αποστολή στον εκπαιδευτικό')}")`);
    await page.waitForFunction(() => !document.querySelector('#bk-shown'), null, { timeout: 15000 });
    await page.waitForFunction((tt) => Array.from(document.querySelectorAll('.sd-kc')).some((c) => c.querySelector('h3').textContent === tt && c.querySelector('.nm-badge--warn')), L('Warm classroom', 'Ζεστή τάξη'), { timeout: 15000 });
    ok(true, tag + ': it moved to In review');
    await page.waitForTimeout(800);
    const left = await page.locator('.sd-kc button:has-text("' + L('Edit blocks', 'Επεξεργασία μπλοκ') + '")').count();
    ok(left === 0, tag + ': no draft left to edit (' + left + ')');
    if (left) console.log((await mia.get('/studio/api/projects?scope=mine')).json.projects.map((x) => x.id + ':' + x.status + ':' + x.via + ':' + x.title).join(' | '));
    // a new tool starts from a fresh stack
    await page.waitForTimeout(500);
    ok(await page.locator('[data-k="a0v"]').count() === 0, tag + ': the stack is clean for the next tool');
    // a saved draft can be deleted
    ok(await page.locator('.bk-acts button:has-text("' + L('Delete this draft', 'Διαγραφή προσχεδίου') + '")').count() === 0, tag + ': a new stack has nothing to delete');
    await page.fill('#bk-title', L('Throwaway', 'Προσωρινό'));
    await page.click(`.bk-acts button:has-text("${L('Save draft', 'Αποθήκευση προσχεδίου')}")`);
    await page.waitForSelector('.sd-kc:has(button:has-text("' + L('Edit blocks', 'Επεξεργασία μπλοκ') + '"))', { timeout: 15000 });
    await page.click('.bk-acts button:has-text("' + L('Delete this draft', 'Διαγραφή προσχεδίου') + '")');
    await page.click('.mod button:has-text("' + L('Delete', 'Διαγραφή') + '")');
    await page.waitForFunction(() => !document.querySelector('.sd-kc button[aria-label^="Edit blocks"], .sd-kc button[aria-label^="Επεξεργασία μπλοκ"]'), null, { timeout: 15000 });
    ok(await page.locator('.bk-acts button:has-text("' + L('Delete this draft', 'Διαγραφή προσχεδίου') + '")').count() === 0, tag + ': the draft is deleted and the stack starts again');
    ok((await mia.get('/studio/api/projects?scope=mine')).json.projects.every((x) => x.title !== L('Throwaway', 'Προσωρινό')), tag + ': it is gone on the server too');
    ok(bad.length === 0, tag + ': no console errors: ' + bad.slice(0, 3).join(' | '));
    await ctx.close();
  };
  await run('en', { width: 1366, height: 900 }, 'en');
  await run('el', { width: 1366, height: 900 }, 'el');
  await run('en', { width: 390, height: 844 }, 'phone');
  await run('en', { width: 1920, height: 1000 }, 'wide');
  await browser.close(); srv.kill();
  console.log(`browser: ${passed} passed, ${failed} failed (screenshots in ${SHOTS})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
