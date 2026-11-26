// The two learning tools on the Drought watch page: the models. Run: node tests/viz/spilab_test.js
'use strict';
const path = require('path'), fs = require('fs');
const L = require(path.join(__dirname, '../../public/site/viz/spilab-data.js')), D = require(path.join(__dirname, '../../public/site/viz/drought-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
// the mathematics, against values from standard tables
// P(1, x) = 1 - exp(-x); P(a, x) for whole a = 1 - exp(-x) * sum(x^k / k!, k < a)
ok(near(L.gammaP(1, 1), 1 - Math.exp(-1), 1e-10) && near(L.gammaP(1, 5), 1 - Math.exp(-5), 1e-10), 'incomplete gamma, shape 1 (exponential)');
ok(near(L.gammaP(2, 2), 1 - 3 * Math.exp(-2), 1e-10) && near(L.gammaP(3, 10), 1 - 61 * Math.exp(-10), 1e-10) && near(L.gammaP(5, 2), 1 - 7 * Math.exp(-2), 1e-9), 'incomplete gamma, whole shapes, both branches');
ok(near(L.gammaP(0.5, 0.5), 0.6826894921, 1e-8) && near(L.gammaP(0.5, 2), 0.9544997361, 1e-8), 'incomplete gamma, shape one half (the 1 and 2 sigma shares of a normal)');
ok(L.gammaP(3, 0) === 0 && isNaN(L.gammaP(-1, 1)) && isNaN(L.gammaP(1, -1)), 'incomplete gamma at zero and for bad input');
ok(near(L.normInv(0.5), 0, 1e-8) && near(L.normInv(0.975), 1.959964, 1e-5) && near(L.normInv(0.8413447461), 1, 1e-6) && near(L.normInv(0.001), -3.090232, 1e-5), 'inverse normal at known points');
ok(near(L.normInv(0.3), -L.normInv(0.7), 1e-8) && isNaN(L.normInv(0)) && isNaN(L.normInv(1)), 'inverse normal is symmetric and refuses 0 and 1');
const f = L.fitGamma(L.PRACTICE); ok(f && f.n === 30 && near(f.shape * f.scale, f.mean, 1e-9) && f.shape > 1 && f.shape < 20, 'the gamma fit keeps the mean of the practice winters');
ok(L.fitGamma([1, 2, 3]) === null && L.fitGamma([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]) === null && L.fitGamma(null) === null, 'too few values or a constant series are refused');
// the lab
ok(L.PRACTICE.length === 30 && L.PRACTICE.every((x) => x > 0), 'thirty practice winters, none without rain');
const mid = L.lab(f.mean), dry = L.lab(150), wet = L.lab(800);
ok(Math.abs(mid.spi) < 0.35 && mid.cls.id === 'normal', 'the usual amount gives an index near zero');
ok(dry.spi < -1.5 && wet.spi > 1.5 && dry.spi < mid.spi && mid.spi < wet.spi, 'less rain gives a lower index, more rain a higher one');
let mono = true; for (let mm = 80; mm < 900; mm += 20) if (!(L.lab(mm + 20).spi > L.lab(mm).spi)) mono = false; ok(mono, 'the index rises with every step of rain');
ok(dry.below + dry.wetter <= 30 && dry.below === L.PRACTICE.filter((x) => x < 150).length && L.lab(296).below + L.lab(296).wetter === 29, 'winters below and above are counted; an equal winter is neither');
ok(L.lab(5).mm === 80 && L.lab(5000).mm === 900 && L.lab('x').mm === L.PRACTICE[0] && L.lab(210.4).mm === 210, 'the amount is kept inside the slider range');
ok(near(D.classify(mid.spi).id === mid.cls.id ? 1 : 0, 1) && wet.pctWetter < 5 && dry.pctWetter > 95, 'class from the same table as the page; share of wetter winters');
const e = mid.edges; ok(e.length === 6 && e.every((x, i) => !i || x.mm > e[i - 1].mm) && Math.abs(L.lab(Math.round(e[2].mm)).spi + 1) < 0.03 && Math.abs(L.lab(Math.round(e[3].mm)).spi - 1) < 0.03, 'the class bands sit where the index crosses each limit');
ok(pairOk(mid.say) && pairOk(mid.note) && /Practice numbers, made up/.test(mid.note[0]) && /not measurements/.test(mid.note[0]), 'the lab says its numbers are made up');
// the reader, on the real data file
const m = D.build(JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/site/data/drought.json'), 'utf8'))), last = m.sheets.length - 1;
ok(L.QUESTIONS.length === 4 && L.QUESTIONS.every((q) => pairOk(q.q) && pairOk(q.why) && pairOk(q.limit) && q.windows.every((w) => m.windows.indexOf(w) >= 0)), 'four questions, each with a reason, a limit and windows that are really published');
const r = L.reader(m, last, 'reservoirs');
ok(r.available && r.on.filter((x) => x.lit).map((x) => x.window).join() === '12,24,36,48' && r.on.length === 9, 'the reservoir question lights the 12 to 48 month windows');
ok(pairOk(r.say) && pairOk(r.limit) && /indicator/.test(r.say[0]) && /not the dam level/.test(r.limit[0]), 'the answer carries the reason and the limit');
const lit = r.on.filter((x) => x.lit), lo = Math.min(...lit.map((x) => x.value)), hi = Math.max(...lit.map((x) => x.value));
ok(r.say[0].indexOf(D.fmt(lo)) >= 0 && r.say[0].indexOf(D.fmt(hi)) >= 0, 'the sentence quotes the lowest and highest published values of the lit windows');
ok(L.reader(m, last, 'nonsense').question.id === 'soil' && !L.reader(m, 99, 'soil').available && pairOk(L.reader(null, 0, 'soil').say), 'an unknown question falls back to the first; a missing sheet is said to be missing');
const gap = D.build({ windows: [1, 3, 12], sheets: [{ ym: '2026-01', cyprus: [null, null, 0.2] }] }); const rg = L.reader(gap, 0, 'soil');
ok(rg.available && /No value was published/.test(rg.say[0]), 'windows without a published value are said to have none');
ok(L.QUESTIONS.every((q) => m.sheets.every((s, i) => pairOk(L.reader(m, i, q.id).say))), 'every question gives a two-language sentence for every sheet');
const rs = L.reader(m, 0, 'soil'); ok(!/1 months|1 μήνες/.test(rs.say.join(' ')) && /1 month\b/.test(rs.say[0] + ' 1 month'), 'one month is written in the singular');
console.log('spilab: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
