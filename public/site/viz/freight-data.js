/*
  freight-data.js: the model for the "freight" widget (gross weight of goods handled, by cargo group, ONE port and ONE direction).
  Pure: no DOM, no clock, no network. Input is public/site/data/freight.json (Eurostat mar_go_qm_cy, quarterly, thousand tonnes,
  all trading partners combined). The stack positions and the scale are computed here from the published values.
  The publisher's TOTAL row overlaps the cargo groups: it is kept as its own line and is never added to them.
  A quarter with no published value stays null (never 0); a published 0 stays 0; the publisher's status flags travel with the values.
  Ports stay in the source's order, one at a time, each with its own scale; nothing is ranked.

  build(data, { port, direction }) -> model          select(model, { port, direction }) -> model for that port and direction
  Selector lists for the page: model.choices (ports, source order) and model.directions (the source's direction categories).
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.freightData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The port freight table could not be loaded.', 'Ο πίνακας φορτίων των λιμανιών δεν φόρτωσε.'];
  const QM = [['January to March', 'Ιανουάριος έως Μάρτιος'], ['April to June', 'Απρίλιος έως Ιούνιος'], ['July to September', 'Ιούλιος έως Σεπτέμβριος'], ['October to December', 'Οκτώβριος έως Δεκέμβριος']];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const val = (v) => (isNum(v) && v >= 0 ? v : null);
  const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
  // 1, 2, 2.5, 5 times a power of ten, at or above v
  function niceCeil(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v - 1e-9) return k * p; return 10 * p; }
  function quarterText(q) { const m = /^(\d{4})-Q([1-4])$/.exec(q); if (!m) return [q, q]; return [q + ' (' + QM[m[2] - 1][0] + ' ' + m[1] + ')', q + ' (' + QM[m[2] - 1][1] + ' ' + m[1] + ')']; }
  const get = (o, a, b, c) => (o && o[a] && o[a][b] && o[a][b][c]) || null;

  function view(data, port, dir, groups, total, unit) {
    const qs = data.quarters, who = [port.name[0] + ', ' + dir.name[0].toLowerCase(), port.name[1] + ', ' + dir.name[1].toLowerCase()];
    const dirText = [port.name[0] + ', direction: ' + dir.name[0], port.name[1] + ', κατεύθυνση: ' + dir.name[1]];
    const bars = qs.map((q, i) => {
      let acc = 0, any = false; const flags = {};
      const parts = groups.map((g) => { const arr = get(data.values, port.code, dir.code, g.code), v = arr ? val(arr[i]) : null, st = get(data.status, port.code, dir.code, g.code); const flag = st && st[q] ? String(st[q]) : ''; if (flag) flags[g.code] = flag; const y0 = acc; if (v != null) { acc += v; any = true; } return { code: g.code, name: g.name, v, flag, y0, y1: v == null ? y0 : acc }; });
      const tArr = total ? get(data.values, port.code, dir.code, total.code) : null, tv = tArr ? val(tArr[i]) : null, tSt = total ? get(data.status, port.code, dir.code, total.code) : null, tFlag = tSt && tSt[q] ? String(tSt[q]) : '';
      const published = any || tv != null, qt = quarterText(q);
      const have = parts.filter((p) => p.v != null), none = parts.filter((p) => p.v == null);
      const fl = (f) => (f ? ' [' + f + ']' : '');
      let label;
      if (!published) label = [dirText[0] + ', ' + qt[0] + ': no value published' + (tFlag ? ' (publisher flag ' + tFlag + ')' : '') + '. This is unknown, not zero.', dirText[1] + ', ' + qt[1] + ': δεν δημοσιεύτηκε τιμή' + (tFlag ? ' (σήμανση εκδότη ' + tFlag + ')' : '') + '. Είναι άγνωστο, όχι μηδέν.'];
      else label = [
        dirText[0] + ', ' + qt[0] + ': ' + (tv != null ? 'published total ' + fmt(tv) + fl(tFlag) + ' ' + unit[0] : 'no total published') + '. ' + (have.length ? have.map((p) => p.name[0] + ' ' + fmt(p.v) + fl(p.flag)).join('; ') + '.' : 'No cargo group has a value.') + (none.length && have.length ? ' No value published for: ' + none.map((p) => p.name[0]).join('; ') + '.' : ''),
        dirText[1] + ', ' + qt[1] + ': ' + (tv != null ? 'δημοσιευμένο σύνολο ' + fmt(tv) + fl(tFlag) + ' ' + unit[1] : 'δεν δημοσιεύτηκε σύνολο') + '. ' + (have.length ? have.map((p) => p.name[1] + ' ' + fmt(p.v) + fl(p.flag)).join('· ') + '.' : 'Καμία ομάδα φορτίου δεν έχει τιμή.') + (none.length && have.length ? ' Χωρίς δημοσιευμένη τιμή: ' + none.map((p) => p.name[1]).join('· ') + '.' : '')];
      return { i, q, year: q.slice(0, 4), qn: q.slice(5), name: qt, total: tv, totalFlag: tFlag, parts, stackSum: any ? acc : null, published, flags, label };
    });
    const pub = bars.filter((b) => b.published), latest = pub.length ? pub[pub.length - 1].q : null;
    const shown = groups.filter((g, gi) => bars.some((b) => b.parts[gi].v != null)).map((g) => g.code);
    const latestText = latest ? ['Latest published quarter for this choice: ' + quarterText(latest)[0] + '.', 'Τελευταίο δημοσιευμένο τρίμηνο για αυτή την επιλογή: ' + quarterText(latest)[1] + '.'] : ['No value is published for this port and direction in this extract.', 'Δεν έχει δημοσιευτεί τιμή για αυτό το λιμάνι και αυτή την κατεύθυνση σε αυτή την εξαγωγή.'];
    const cov = [pub.length + ' of ' + qs.length + ' quarters have a published value, ' + (qs.length - pub.length) + ' are empty.', pub.length + ' από ' + qs.length + ' τρίμηνα έχουν δημοσιευμένη τιμή, ' + (qs.length - pub.length) + ' είναι κενά.'];
    const noGroups = groups.filter((g) => shown.indexOf(g.code) < 0);
    const rows = [[dirText[0] + '. ' + cov[0] + ' ' + latestText[0], dirText[1] + '. ' + cov[1] + ' ' + latestText[1]]];
    if (noGroups.length && pub.length) rows.push(['Cargo groups with no published value here: ' + noGroups.map((g) => g.name[0]).join('; ') + '.', 'Ομάδες φορτίου χωρίς δημοσιευμένη τιμή εδώ: ' + noGroups.map((g) => g.name[1]).join('· ') + '.']);
    return { port: port.code, portName: port.name, direction: dir.code, directionName: dir.name, title: who, bars, latest, latestText, shown, isEmpty: !pub.length,
      counts: { quarters: qs.length, published: pub.length, empty: qs.length - pub.length, text: cov },
      textRows: rows.concat(pub.map((b) => b.label)),
      ariaLabel: ['Stacked quarterly bars of freight by cargo group at ' + dirText[0] + ', in ' + unit[0] + ', quarterly statistics, not live. ' + cov[0] + ' ' + latestText[0], 'Στοιβαγμένες τριμηνιαίες μπάρες φορτίου ανά ομάδα: ' + dirText[1] + ', σε ' + unit[1] + ', τριμηνιαία στατιστικά, όχι ζωντανά. ' + cov[1] + ' ' + latestText[1]] };
  }

  function build(data, opts) {
    opts = opts || {};
    const ok = data && Array.isArray(data.quarters) && data.quarters.length && Array.isArray(data.ports) && data.ports.length && Array.isArray(data.cargo) && Array.isArray(data.directions) && data.directions.length && data.values;
    if (!ok) return { id: 'freight', available: false, empty: EMPTY, choices: [], directions: [], ports: {}, textRows: [EMPTY], ariaLabel: EMPTY };
    const unit = data.unitShort || ['thousand tonnes', 'χιλ. τόνοι'];
    const total = data.cargo.find((c) => c.code === 'TOTAL') || null, groups = data.cargo.filter((c) => c.code !== 'TOTAL');
    const ports = {}, choices = [];
    for (const p of data.ports) {
      const views = {}; let max = 0, latest = null;
      for (const d of data.directions) { const v = view(data, p, d, groups, total, unit); views[d.code] = v; for (const b of v.bars) { if (b.total != null && b.total > max) max = b.total; if (b.stackSum != null && b.stackSum > max) max = b.stackSum; } if (v.latest && (!latest || v.latest > latest)) latest = v.latest; }
      const scaleMax = niceCeil(max);
      const portLatest = latest ? ['Latest published quarter for ' + p.name[0] + ': ' + quarterText(latest)[0] + '.', 'Τελευταίο δημοσιευμένο τρίμηνο, ' + p.name[1] + ': ' + quarterText(latest)[1] + '.'] : ['No value is published for ' + p.name[0] + ' in this extract.', 'Δεν έχει δημοσιευτεί τιμή, ' + p.name[1] + ', σε αυτή την εξαγωγή.'];
      for (const d of data.directions) { const v = views[d.code]; v.scaleMax = scaleMax; v.portLatest = latest; v.portLatestText = portLatest; for (const b of v.bars) { b.tTotal = b.total == null ? null : b.total / scaleMax; for (const s of b.parts) { s.t0 = s.y0 / scaleMax; s.t1 = s.y1 / scaleMax; } } v.textRows.splice(1, 0, portLatest); }
      ports[p.code] = { code: p.code, name: p.name, scaleMax, latest, directions: views };
      choices.push({ id: p.code, name: p.name });
    }
    const notes = Array.isArray(data.notes) ? data.notes.filter((n) => Array.isArray(n) && n.length === 2) : [];
    const anyFlag = Object.keys(ports).some((pc) => Object.keys(ports[pc].directions).some((dc) => ports[pc].directions[dc].bars.some((b) => b.totalFlag || Object.keys(b.flags).length)));
    if (anyFlag) notes.unshift(['A letter in square brackets next to a value is the publisher\'s own status flag for that value.', 'Ένα γράμμα σε αγκύλες δίπλα σε μια τιμή είναι η σήμανση κατάστασης του ίδιου του εκδότη για εκείνη την τιμή.']);
    const model = { id: 'freight', available: true, empty: null, live: false, choices, directions: data.directions.map((d) => ({ id: d.code, name: d.name })), ports, notes, anyFlag,
      groups: groups.map((g) => ({ code: g.code, name: g.name })), totalName: total ? total.name : null, quarters: data.quarters.slice(), period: data.period || { first: data.quarters[0], last: data.quarters[data.quarters.length - 1] },
      unit, unitLong: data.unit || unit, retrieved: data.retrieved || null, sources: data.sources || [],
      strings: { total: ['Publisher\'s total (line, not stacked)', 'Σύνολο του εκδότη (γραμμή, όχι στοίβα)'], notPublished: ['not published', 'δεν δημοσιεύτηκε'], emptyQuarter: ['empty: no value published', 'κενό: δεν δημοσιεύτηκε τιμή'],
        still: ['quarterly statistics ' + (data.period ? data.period.first + ' to ' + data.period.last : '') + ', not live', 'τριμηνιαία στατιστικά ' + (data.period ? data.period.first + ' έως ' + data.period.last : '') + ', όχι ζωντανά'],
        hint: ['Point at a quarter, or use the left and right arrow keys, to read each cargo group.', 'Δείξτε ένα τρίμηνο ή χρησιμοποιήστε τα βελάκια αριστερά και δεξιά για να διαβάσετε κάθε ομάδα φορτίου.'],
        mass: ['Freight measures mass. Port calls measure movements.', 'Το φορτίο μετρά μάζα. Οι αφίξεις πλοίων μετρούν κινήσεις.'],
        source: ['Source: Eurostat, mar_go_qm_cy' + (data.retrieved ? ', retrieved ' + data.retrieved : ''), 'Πηγή: Eurostat, mar_go_qm_cy' + (data.retrieved ? ', λήψη ' + data.retrieved : '')] } };
    const p0 = ports[opts.port] ? opts.port : choices[0].id, d0 = ports[p0].directions[opts.direction] ? opts.direction : model.directions[0].id;
    return select(model, { port: p0, direction: d0 });
  }
  // select(model, { port, direction }) or select(model, port, direction); an unknown port or direction keeps the current one
  function select(model, sel, direction) {
    if (!model || !model.ports) return model;
    if (typeof sel === 'string') sel = { port: sel, direction };
    sel = sel || {};
    const pId = sel.port != null && model.ports[sel.port] ? sel.port : model.port; const p = model.ports[pId]; if (!p) return model;
    const dId = sel.direction != null && p.directions[sel.direction] ? sel.direction : model.direction; const v = p.directions[dId]; if (!v) return model;
    if (pId === model.port && dId === model.direction) return model;
    return Object.assign({}, model, v, { textRows: v.textRows.concat(model.notes), ariaLabel: v.ariaLabel });
  }
  return { build, select, niceCeil, quarterText, EMPTY };
});
