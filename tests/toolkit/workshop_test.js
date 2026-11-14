'use strict';
/* The three sections (menu and home page) and the workshop (#/workshop), second version: blocks in five groups, ideas to start from,
   and a finished tool drawn from the saved day. Starts the real server in demo mode with a seeded saved day.
   Run: node tests/toolkit/workshop_test.js */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), PORT = 3977, BASE = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  // a saved day of 24 hours, every 10 minutes, for the four cities: temperature from the stations and (warmer) from the buses,
  // humidity that falls as temperature rises, and wind from the model
  const now = Math.floor(Date.now() / 60000) * 60000, series = {};
  const off = { larnaka: 0.6, lefkosia: -0.4, limassol: 0.9, paphos: 1.2 };
  for (const c of Object.keys(off)) for (const [src, v] of [['cydom-stations', 'temperature'], ['sensecap-buses', 'temperature'], ['cydom-stations', 'relative_humidity'], ['openmeteo-weather', 'wind_speed']]) {
    const pts = []; for (let i = 143; i >= 0; i--) { const t = now - i * 600000, hr = ((t / 3600000) + 2) % 24, temp = 18 + off[c] + 5 * Math.cos(((hr - 14.5) / 24) * 2 * Math.PI);
      pts.push([t, Math.round((v === 'temperature' ? temp + (src === 'sensecap-buses' ? 1.5 : 0) : v === 'relative_humidity' ? 95 - 2 * temp : 3 + 2 * Math.sin(((hr - 11) / 24) * 2 * Math.PI)) * 10) / 10]); }
    series[c + '|' + src + '|' + v] = pts;
  }
  fs.writeFileSync(path.join(dir, 'layers-pulse.json'), JSON.stringify({ at: now, series }));
  const srv = spawn(process.execPath, ['-e', "require('./server')"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DEMO: '1', OPEN_METEO_MOCK: '1', DATA_DIR: dir, ANTHROPIC_API_KEY: '', LAYERS_PULSE_SECONDS: '600' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + '/layers/api/replay'); if (r.ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const b = await chromium.launch();
  const noGL = () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; };
  try {
    for (const [name, opts, el] of [['desktop', { viewport: { width: 1366, height: 900 } }, false], ['phone greek', { ...devices['iPhone 13'] }, true]]) {
      const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(String(e))); await p.addInitScript(noGL);
      await p.goto(BASE + '/' + (el ? '?lang=el' : '') + '#/workshop'); await p.waitForSelector('.ws-panel[data-k="diff"] .ws-big', { timeout: 20000 });
      const ks = () => p.$$eval('.ws-box', (e) => e.map((x) => x.dataset.k).join(','));
      const press = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
      const live = () => p.locator('.ws-live').innerText();
      ok(await ks() === 'data,data,match,diff,explain,line,hour', name + ': the workshop opens with the first idea already built (' + await ks() + ')');
      ok(await p.locator('.ws-pg').count() === 5 && await p.locator('.ws-pb').count() === 20, name + ': the shelf has five groups of blocks');
      ok(await p.locator('.ws-idea').count() === 6, name + ': there are ideas to start from');
      ok(await p.locator('.ws-panel[data-k="line"] polyline').count() === 2 && await p.locator('.ws-panel[data-k="line"] polygon').count() === 1, name + ': the finished tool draws both lines and shades the gap');
      ok(/\+1[.,]5 °C/.test(await p.locator('.ws-panel[data-k="diff"] .ws-big').innerText()), name + ': the difference is worked out from the saved day (' + (await p.locator('.ws-panel[data-k="diff"] .ws-big').innerText()).slice(0, 40) + ')');
      ok(/different layers|διαφορετικά στρώματα/.test(await live()), name + ': a gap between two layers says the instruments may be part of it');
      ok(/Buses|Λεωφορεία/.test(await p.locator('.ws-src').innerText()) && /Met Office|Μετεωρολογ/.test(await p.locator('.ws-src').innerText()) && /\d{1,2}:\d{2}/.test(await p.locator('.ws-src').innerText()), name + ': the tool names its layers and its period');
      ok(/fixed rules|σταθερούς κανόνες/.test(await p.locator('.ws-words').innerText()) && /not the reason|όχι τον λόγο/.test(await p.locator('.ws-words').innerText()), name + ': the words say how they were made and do not claim a cause');
      if (!el) ok(await p.locator('.ws-wire path').count() >= 6 && await p.locator('.ws-wire path.dash').count() === 1, name + ': wires join the blocks');
      // the hour slider moves the numbers without rebuilding the control
      const before = await p.locator('.ws-words').innerText();
      await p.locator('input[data-c="hour"]').evaluate((e) => { e.value = '5'; e.dispatchEvent(new Event('input', { bubbles: true })); });
      ok(await p.locator('.ws-words').innerText() !== before && await p.locator('input[data-c="hour"]').inputValue() === '5', name + ': the hour slider changes the hour the tool reads');
      // a block is pressed to change it; the layer list comes from the real data
      await press('.ws-box[data-i="0"] .ws-bt');
      ok(await p.locator('.ws-box.open select').count() >= 3, name + ': pressing a block opens its choices');
      await p.locator('.ws-box.open select').nth(1).selectOption('paphos');
      ok(await p.locator('.ws-box.open').count() === 1 && /Paphos|Πάφος/.test(await p.locator('.ws-tt').innerText()), name + ': changing a choice keeps the block open and changes the tool');
      await p.waitForFunction(() => /Paphos|Πάφος/.test((document.querySelector('.ws-src') || {}).innerText || ''));
      // adding, the limit of one of each kind, moving, removing, undo
      await press('.ws-pb[data-k="stats"]'); await press('.ws-pb[data-k="predict"]');
      ok(await ks() === 'data,data,match,diff,stats,explain,predict,line,hour', name + ': a pressed block joins its own group (' + await ks() + ')');
      ok(await p.locator('.ws-box.fresh .ws-new').count() === 1, name + ': the newest block is marked');
      ok(/tested \d+ times|δοκιμάστηκε \d+ φορές/.test(await p.locator('.ws-panel[data-k="predict"]').innerText()) && /not a weather forecast|Δεν είναι πρόγνωση καιρού/.test(await p.locator('.ws-panel[data-k="predict"]').innerText()), name + ': a prediction is tested on the saved day and says what it is not');
      ok(/not a better place|δεν σημαίνει καλύτερο μέρος/.test(await live()), name + ': the averages say a higher number is not a better place');
      await press('.ws-pb[data-k="stats"]');
      ok((await ks()).split(',').filter((k) => k === 'stats').length === 1, name + ': a block that is not data can be in a tool once');
      await press('.ws-box[data-k="stats"] .ws-bt'); await press('.ws-box[data-k="stats"] .ws-tools button');
      ok(await ks() === 'data,data,match,stats,diff,explain,predict,line,hour', name + ': a block can be moved earlier inside its group');
      await press('.ws-box[data-k="stats"] .ws-tools .rm');
      ok(await ks() === 'data,data,match,diff,explain,predict,line,hour', name + ': a block can be removed');
      await press('.ws-btn[data-a="undo"]');
      ok((await ks()).includes('stats'), name + ': undo brings it back');
      // the other ideas
      await press('.ws-idea[data-n="1"]'); await p.waitForSelector('.ws-panel[data-k="stats"] tbody tr:nth-child(4)');
      ok(await p.locator('.ws-panel[data-k="line"] polyline').count() === 4 && /m\/s|km\/h/.test(await live()), name + ': an idea builds a whole tool (wind in four cities)');
      await p.locator('.ws-ln input').first().evaluate((e) => e.click());
      ok(await p.locator('.ws-panel[data-k="line"] polyline').count() === 3, name + ': a line can be hidden');
      await press('.ws-idea[data-n="4"]'); await p.waitForSelector('.ws-panel[data-k="pattern"] .ws-say');
      const pat = await p.locator('.ws-panel[data-k="pattern"]').innerText();
      ok(/r = −0[.,]9|r = −1/.test(pat) && /does not show that one causes|δεν δείχνει ότι η μία προκαλεί/.test(pat), name + ': a pattern gives r and says it is not a cause (' + pat.slice(0, 120).replace(/\n/g, ' ') + ')');
      ok(await p.locator('.ws-panel[data-k="line"] svg').count() === 2, name + ': lines with different units get their own charts');
      await press('.ws-pb[data-k="diff"]');
      ok(/measure different things|μετρούν διαφορετικά πράγματα/.test(await p.locator('.ws-panel[data-k="diff"]').innerText()), name + ': a difference between two different measurements is refused');
      await press('.ws-idea[data-n="2"]'); await p.waitForSelector('.ws-panel[data-k="predict"]');
      await p.locator('select[data-c="city"]').selectOption('lefkosia'); await p.waitForFunction(() => /Lefkosia|Λευκωσία/.test((document.querySelector('.ws-src') || {}).innerText || ''));
      ok(/Lefkosia|Λευκωσία/.test(await p.locator('.ws-tt').innerText()), name + ': the city picker changes the city of the tool');
      await press('.ws-idea[data-n="3"]'); await p.waitForSelector('select[data-c="measure"]');
      await p.locator('select[data-c="measure"]').selectOption('temperature'); await p.waitForFunction(() => /°C/.test(document.querySelector('.ws-live').innerText));
      ok(/Temperature|Θερμοκρασία/.test(await p.locator('.ws-tt').innerText()), name + ': the measure switch changes what the tool measures');
      await press('.ws-box[data-i="0"] .ws-bt'); await p.locator('.ws-box.open select').nth(0).selectOption('pm10'); await p.locator('.ws-box.open select').nth(2).selectOption('own');
      await press('.ws-box[data-k="measure"] .ws-bt'); await press('.ws-box[data-k="measure"] .ws-tools .rm'); await p.waitForSelector('.ws-warn');
      ok(/no layer has this measurement|κανένα στρώμα δεν έχει αυτή τη μέτρηση|does not measure it here|δεν το μετρά εδώ|no saved readings|δεν υπάρχουν ακόμη αποθηκευμένες/.test(await live()), name + ': a measurement a layer does not have says so');
      // limits
      await press('.ws-idea[data-n="blank"]'); for (let i = 0; i < 5; i++) await press('.ws-pb[data-g="own"]');
      ok((await ks()).split(',').filter((k) => k === 'data').length === 4, name + ': a tool holds at most four data blocks');
      for (const k of ['match', 'diff', 'stats', 'keep', 'change', 'predict', 'unusual', 'pattern', 'explain', 'city', 'hour', 'measure']) await press('.ws-pb[data-k="' + k + '"]');
      ok((await ks()).split(',').length === 12, name + ': a tool holds at most twelve blocks');
      ok(await p.locator('.ws-btn.send').isDisabled() && /coming next|έρχεται/i.test(await p.locator('.ws-btn.send').innerText()), name + ': sending to a teacher is marked as coming, not faked');
      // the link
      const url = p.url(), want = await ks();
      ok(/#\/workshop\?r=/.test(url), name + ': the tool is kept in the address');
      await p.evaluate(() => localStorage.clear()); await p.goto('about:blank'); await p.goto(url); await p.waitForSelector('.ws-box');
      ok(await ks() === want, name + ': the link reopens the same tool');
      const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
      await p.goto('about:blank'); await p.goto(BASE + '/#/workshop?r=' + enc({ v: 2, b: [{ k: 'data', g: 'evil', c: 'nowhere', m: '<img>', s: '../x' }, { k: 'script' }, { k: 'predict', rule: '<img>', ahead: 99 }, { k: 'line' }, { k: 'line' }, { k: 'keep', w: 'always' }] })); await p.waitForSelector('.ws-box');
      ok(await ks() === 'data,keep,predict,line' && !/evil|script|<img|nowhere|always/.test(await p.locator('.ws').innerText()), name + ': a recipe from the address keeps only known choices (' + await ks() + ')');
      await p.goto('about:blank'); await p.goto(BASE + '/#/workshop?r=' + enc([{ k: 'data', m: 'wind', c: ['paphos', 'limassol'], p: 'h6' }, { k: 'compare' }, { k: 'agree' }, { k: 'bars' }])); await p.waitForSelector('.ws-box');
      ok(await ks() === 'data,data,keep,diff,bars', name + ': a link from the first version still opens (' + await ks() + ')');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': the workshop does not scroll sideways');
      if (process.env.DBG) console.log(name, await p.evaluate(() => [...document.querySelectorAll('.ws *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12.5 && !e.closest('svg')).map((e) => e.tagName + '.' + e.className + ':' + getComputedStyle(e).fontSize).slice(0, 6).join(' | ')));
      ok(await p.evaluate(() => [...document.querySelectorAll('.ws *')].every((e) => !e.childNodes.length || [...e.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim() || parseFloat(getComputedStyle(e).fontSize) >= 12.5 || e.closest('svg') || e.closest('.how-btn')))), name + ': the text is large enough to read');   // the ? of the shared help button is the shell's
      if (el) ok(/Εργαστήρι/.test(await p.locator('.ws').innerText()) && /Επεξεργασία/.test(await p.locator('.ws-pal').innerText()) && /Ξεκίνα από μια ιδέα/.test(await p.locator('.ws-ideas').innerText()), name + ': the workshop is in Greek');
      if (!el) {
        await press('.ws-idea[data-n="blank"]');
        const a = await p.locator('.ws-pb[data-k="change"]').boundingBox(), d = await p.locator('.ws-flow').boundingBox();
        await p.mouse.move(a.x + 20, a.y + 10); await p.mouse.down(); await p.mouse.move(a.x - 40, a.y + 30, { steps: 5 }); await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(400);
        ok((await ks()) === 'data,change,line', name + ': a block dragged from the shelf lands on the canvas (' + await ks() + ')');
        const math = await p.evaluate(() => { const M = SC.workshopMath, H = 3600000, pts = [1, 1.1, 1.2, 1.1, 5, 5.1].map((v, i) => [i * H, v]), up = [1, 2, 3, 4, 5, 6, 7].map((v, i) => [i * H, v]);
          return { j: M.jumps(pts).list.length, last: M.guess([1, 2, 3], 'last', 1), mean: M.guess([1, 2, 3], 'mean', 1), line: M.guess([1, 2, 3], 'line', 1), bt: M.backtest(up.slice(0, 6), 'line', 1),
            hr: JSON.stringify(M.hourly([[0, 1], [600000, 3], [H, 5], [H + 5, null]])), gap: JSON.stringify(M.gapOf([[0, 5], [H, 7], [2 * H, 9]], [[H, 1], [2 * H, 2]])), sh: M.shared([[[0, 1], [H, 1]], [[H, 2], [2 * H, 2]]]).size,
            odd: M.unusual([5, 5.1, 4.9, 5, 5.2, 4.8, 5, 19].map((v, i) => [i * H, v])).list.length, flat: M.unusual([5, 5, 5, 5, 5, 5, 5].map((v, i) => [i * H, v])).list.length,
            rp: M.together(up, up.map((q) => [q[0], q[1] * 2 + 1])).r, rn: M.together(up, up.map((q) => [q[0], -q[1]])).r, rf: M.together(up.slice(0, 3), up.slice(0, 3)).r, k3: M.keepPts(up, 'h3', 6 * H).length,
            rt: JSON.stringify(M.unpack(M.pack([{ k: 'line' }, { k: 'data', g: 'own', c: 'paphos', m: 'co2', s: 'sensecap-buses' }]))) }; });
        ok(math.j === 1 && math.last === 3 && math.mean === 2 && Math.abs(math.line - 4) < 1e-9 && math.bt.n === 3 && math.bt.mae < 1e-9 && Math.abs(math.bt.same - 1) < 1e-9, name + ': the prediction and jump sums are right on known numbers');
        ok(math.hr === '[[0,2],[3600000,5]]' && math.gap === '[[3600000,6],[7200000,7]]' && math.sh === 1 && math.k3 === 3, name + ': hourly averages, the gap, shared hours and "keep only" are right on known numbers');
        ok(math.odd === 1 && math.flat === 0 && Math.abs(math.rp - 1) < 1e-9 && Math.abs(math.rn + 1) < 1e-9 && math.rf === null, name + ': unusual hours and "move together" are right on known numbers');
        ok(math.rt === '[{"k":"data","g":"own","c":"paphos","m":"co2","s":"sensecap-buses"},{"k":"line"}]', name + ': a recipe survives packing, with its blocks sorted into groups');
        // the three sections on the home page and in the menu
        await p.goto(BASE + '/#/home'); await p.waitForSelector('.hm3-t');
        ok(await p.locator('.hm3-sec').count() === 3 && await p.locator('.hm3-sec.sec-view .hm3-t').count() === 6 && await p.locator('.hm3-sec.sec-predict .hm3-t').count() >= 4, name + ': the home page shows View, Analyze and Predict with their tools');
        ok(await p.locator('.hm3-build a.hm3-btn').getAttribute('href') === '#/workshop', name + ': the home page leads to the workshop');
        ok(await p.evaluate(() => [...document.querySelectorAll('.nm-side-h')].map((e) => e.className.replace('nm-side-h', '').trim()).join(',')) === 'sec-view,sec-analyze,sec-predict,sec-build,sec-class', name + ': the menu has the same sections');
        ok(await p.evaluate(() => { const ids = [...document.querySelectorAll('.nm-side-a')].map((a) => a.getAttribute('href')); return new Set(ids).size === ids.length && ids.includes('#/workshop') && ids.includes('#/layers') && ids.includes('#/forecast'); }), name + ': every page is in the menu once');
      }
      ok(errs.length === 0, name + ': no script errors (' + errs.slice(0, 2).join(' | ') + ')');
      await ctx.close();
    }
  } catch (e) { fail++; console.log('FAIL: the run stopped: ' + String(e).slice(0, 500)); }
  await b.close(); srv.kill();
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
