/* Ships and ports (#/fieldwork/sea). Published Eurostat statistics by quarter, from three frozen extracts in fieldwork/.
   Nothing here is a ship position: the map only marks where the five reporting ports are, approximately.
   Rules kept by this file: a missing value is written "not reported" (never 0, never joined across);
   a published total is never added to its parts; the national figure is never added to the two ports. */
(function () {
  'use strict';
  const { el: h, svgEl: svg, t } = SC;

  SC.seaPorts = function (host, data, tools) {
    const { arrivals, national, freight } = data;
    const { lineChart, downloadCsv, format, colours } = tools;
    const name = x => (SC.lang === 'el' && x.nameEl) || x.name;
    const NOT = t('not reported', 'δεν αναφέρθηκε');
    const unitName = (extract, code) => name(extract.units.find(u => u.code === code));
    const U_ARR = unitName(arrivals, 'NR'), U_GT = unitName(national, 'THS_GT'), U_T = unitName(freight, 'THS_T');
    const shown = (value, unit) => !Number.isFinite(value) ? NOT : format(value) + ' ' + (value === 1 && unit === U_ARR ? t('arrival', 'άφιξη') : unit);
    const index = extract => new Map(extract.series.map(s => [s.code, new Map(s.points)]));
    const A = index(arrivals), N = index(national), F = index(freight);
    // undefined (the combination was never published) and null (this quarter was not published) both mean "not reported"
    const at = (map, code, period) => { const v = map.get(code)?.get(period); return Number.isFinite(v) ? v : null; };
    const ports = freight.ports;                       // five ports, in a fixed order: the order gives each its number, colour and dash
    const portIndex = code => ports.findIndex(p => p.code === code);
    const DASH = ['', '9 4', '3 4', '11 3 2 3', '1 5', '14 4 3 4'];
    const NATIONAL = 5;                                // the national series takes the sixth colour and dash
    const swatch = i => svg('svg', {viewBox:'0 0 30 6', width:30, height:6, 'aria-hidden':'true', class:'fw-sea-swatch'},
      svg('line', {x1:0, x2:30, y1:3, y2:3, stroke:colours[i % colours.length], 'stroke-width':3, 'stroke-dasharray':DASH[i]}));
    const sourceLine = extract => t('Source: Eurostat, ', 'Πηγή: Eurostat, ') + extract.datasetId;
    const section = (title, ...kids) => h('section', {class:'fw-sea-part'}, h('h3', null, title), ...kids);
    const scroll = (table, label) => h('div', {class:'fw-table-scroll', tabindex:'0', role:'region', 'aria-label':label}, table);
    const csvButton = onclick => h('button', {class:'nm-btn', type:'button', onclick}, SC.icon('download', 16), t('Download CSV', 'Λήψη CSV'));
    const csvColumns = ['port', 'period', 'category', 'direction', 'value', 'unit', 'reporting_status', 'dataset', 'source', 'retrieved', 'attribution', 'licence'];
    const csvRow = (extract, port, period, category, direction, value, unit) => [port, period, category, direction, value ?? '', unit,
      Number.isFinite(value) ? 'reported' : 'not reported', extract.datasetId, extract.sourceUrl, extract.retrievedAt, extract.attribution, extract.licence];
    const lastTotal = (extract, code) => extract.coverage.lastTotalByPort[code];

    /* ---------- 1. the ports on the outline ---------- */
    function portMap() {
      const island = window.ISLAND;
      const title = t('Where the ports are', 'Πού βρίσκονται τα λιμάνια');
      const approx = t('approximate position of the port', 'θέση του λιμανιού κατά προσέγγιση');
      const detail = h('p', {class:'fw-sea-detail', 'aria-live':'polite'});
      const rings = [], buttons = [];
      let chosen = -1;
      function describe(port) {
        const fq = lastTotal(freight, port.code), aq = lastTotal(arrivals, port.code);
        const bits = [name(port), approx + ': ' + port.latitude.toFixed(2) + '°N, ' + port.longitude.toFixed(2) + '°E',
          t('latest quarter with a cargo total: ', 'τελευταίο τρίμηνο με σύνολο φορτίου: ') + fq + ', ' + shown(at(F, port.code + '|TOTAL|TOTAL', fq), U_T)];
        bits.push(aq ? t('latest quarter with arrivals: ', 'τελευταίο τρίμηνο με αφίξεις: ') + aq + ', ' + shown(at(A, port.code + '|TOTAL', aq), U_ARR)
          : t('vessel arrivals: not in this extract', 'αφίξεις πλοίων: δεν περιλαμβάνονται σε αυτό το απόσπασμα'));
        return bits.join(' · ');
      }
      function choose(i) {
        chosen = chosen === i ? -1 : i;
        rings.forEach((ring, k) => ring.setAttribute('visibility', k === chosen ? 'visible' : 'hidden'));
        buttons.forEach((button, k) => button.setAttribute('aria-pressed', k === chosen ? 'true' : 'false'));
        detail.textContent = chosen < 0 ? '' : describe(ports[chosen]);
      }
      const part = section(title, h('p', null, t(
        'Each numbered mark is a port that reports to Eurostat. The marks are fixed places on land. No ship is drawn on this map.',
        'Κάθε αριθμημένο σημάδι είναι ένα λιμάνι που δίνει στοιχεία στη Eurostat. Τα σημάδια είναι σταθερά σημεία στη στεριά. Στον χάρτη δεν υπάρχει κανένα πλοίο.')));
      if (island) {
        const big = window.matchMedia && window.matchMedia('(max-width: 740px)').matches ? 1.7 : 1;   // marks stay readable on a phone
        const map = svg('svg', {class:'fw-chart fw-sea-map', viewBox:'-10 -10 ' + (island.W + 20) + ' ' + (island.H + 20), role:'img',
          'aria-label':title + ': ' + ports.map((p, i) => (i + 1) + ' ' + name(p)).join(', ') + '. ' + approx});
        for (const path of Object.values(island.districts)) map.append(svg('path', {d:path, fill:'#213a47', stroke:'#60818d', 'stroke-width':1}));
        ports.forEach((port, i) => {
          const [cx, cy] = island.project(port.longitude, port.latitude);
          const ring = svg('circle', {cx, cy, r:20 * big, fill:'none', stroke:'#fff', 'stroke-width':3 * big, 'pointer-events':'none', visibility:'hidden'});
          const mark = svg('g', {style:'cursor:pointer'},
            svg('title', null, (i + 1) + ' · ' + name(port) + ' · ' + approx),
            svg('circle', {cx, cy, r:13 * big, fill:'#ffd08e', stroke:'#15212b', 'stroke-width':1.5}),
            svg('text', {x:cx, y:cy + 6 * big, 'text-anchor':'middle', 'font-size':17 * big, 'font-weight':700, fill:'#15212b', style:'fill:#15212b;font-size:' + 17 * big + 'px'}, String(i + 1)));
          mark.addEventListener('click', () => choose(i));
          rings.push(ring);
          map.append(mark, ring);
        });
        part.append(map);
      }
      const row = h('div', {class:'fw-sea-ports', role:'group', 'aria-label':t('Choose a port', 'Επίλεξε λιμάνι')});
      ports.forEach((port, i) => {
        const button = h('button', {class:'nm-btn', type:'button', 'aria-pressed':'false', onclick:() => choose(i)}, h('b', null, String(i + 1)), ' ', name(port));
        buttons.push(button);
        row.append(button);
      });
      const table = h('table', null,
        h('caption', null, t('The five reporting ports. Positions are approximate. ', 'Τα πέντε λιμάνια αναφοράς. Οι θέσεις είναι κατά προσέγγιση. ') + sourceLine(freight) + ', ' + arrivals.datasetId),
        h('thead', null, h('tr', null, [t('Port', 'Λιμάνι'), approx.charAt(0).toUpperCase() + approx.slice(1),
          t('Latest quarter with a cargo total', 'Τελευταίο τρίμηνο με σύνολο φορτίου'), t('All cargo, both directions', 'Όλα τα φορτία, και οι δύο κατευθύνσεις'),
          t('Latest quarter with arrivals', 'Τελευταίο τρίμηνο με αφίξεις'), t('All vessel types', 'Όλοι οι τύποι πλοίων')].map(x => h('th', {scope:'col'}, x)))),
        h('tbody', null, ports.map((port, i) => {
          const fq = lastTotal(freight, port.code), aq = lastTotal(arrivals, port.code);
          return h('tr', null, h('th', {scope:'row'}, (i + 1) + ' · ' + name(port)),
            h('td', null, port.latitude.toFixed(2) + '°N, ' + port.longitude.toFixed(2) + '°E'),
            h('td', null, fq), h('td', null, shown(at(F, port.code + '|TOTAL|TOTAL', fq), U_T)),
            h('td', null, aq || t('not in this extract', 'εκτός αποσπάσματος')), h('td', null, aq ? shown(at(A, port.code + '|TOTAL', aq), U_ARR) : NOT));
        })));
      part.append(row, detail, scroll(table, t('Table of ports', 'Πίνακας λιμανιών')),
        h('p', {class:'fw-data-note'}, (SC.lang === 'el' && freight.positionNoteEl) || freight.positionNote, ' ',
          t('The arrivals table covers Larnaka and Lemesos only.', 'Ο πίνακας αφίξεων καλύπτει μόνο τη Λάρνακα και τη Λεμεσό.')));
      return part;
    }

    /* ---------- 2. arrivals in one quarter ---------- */
    const arrivalPorts = arrivals.ports;
    const types = arrivals.vesselTypes.filter(v => v.code !== 'TOTAL');
    const reportedTypes = types.filter(v => arrivalPorts.some(p => A.has(p.code + '|' + v.code)));
    const neverTypes = types.filter(v => !reportedTypes.includes(v));
    function quarterView() {
      const observed = new Set(arrivals.series.flatMap(s => s.points.filter(p => Number.isFinite(p[1])).map(p => p[0])));
      const select = h('select', {id:'fw-sea-quarter', class:'fw-sea-select', onchange:draw}, arrivals.periods.map(q =>
        h('option', {value:q}, observed.has(q) ? q : q + ' (' + NOT + ')')));
      select.value = arrivals.coverage.lastObservedPeriod;
      const out = h('div');
      function draw() {
        const q = select.value;
        const rows = reportedTypes.map(v => ({type:v, values:arrivalPorts.map(p => at(A, p.code + '|' + v.code, q))}));
        const highest = Math.max(1, ...rows.flatMap(r => r.values.filter(Number.isFinite)));
        const totals = arrivalPorts.map(p => at(A, p.code + '|TOTAL', q));
        const chart = h('div', {class:'fw-bars', role:'img', 'aria-label':t('Vessel arrivals by type of vessel, ', 'Αφίξεις πλοίων ανά τύπο πλοίου, ') + q + ' (' + U_ARR + ')'},
          rows.map(row => h('div', {class:'fw-bar-group'}, h('b', null, name(row.type)), arrivalPorts.map((p, i) => {
            const v = row.values[i], k = portIndex(p.code);
            return h('div', {class:'fw-bar-line'},
              h('span', {class:'fw-track'}, Number.isFinite(v) ? h('span', {class:'fw-bar', style:{width:(100 * v / highest) + '%', background:colours[k], minWidth:'2px'}}) : null),
              h('span', {class:Number.isFinite(v) ? null : 'fw-sea-missing'}, name(p) + ' · ' + shown(v, U_ARR)));
          }))));
        const table = h('table', null,
          h('caption', null, t('Vessel arrivals in ', 'Αφίξεις πλοίων το ') + q + ' · ' + t('unit: ', 'μονάδα: ') + U_ARR + ' · ' + sourceLine(arrivals)),
          h('thead', null, h('tr', null, h('th', {scope:'col'}, t('Type of vessel', 'Τύπος πλοίου')), arrivalPorts.map(p => h('th', {scope:'col'}, name(p))))),
          h('tbody', null, rows.map(row => h('tr', null, h('th', {scope:'row'}, name(row.type)), row.values.map(v => h('td', null, shown(v, U_ARR)))))),
          h('tfoot', null, h('tr', null, h('th', {scope:'row'}, t('Published total (already includes the rows above)', 'Δημοσιευμένο σύνολο (περιλαμβάνει ήδη τις πιο πάνω γραμμές)')),
            totals.map(v => h('td', null, shown(v, U_ARR))))));
        out.replaceChildren(
          h('p', {class:'fw-sea-total'}, h('b', null, t('Published total for ', 'Δημοσιευμένο σύνολο για το ') + q + ': '),
            arrivalPorts.map((p, i) => name(p) + ' ' + shown(totals[i], U_ARR)).join(' · '), '. ',
            t('The total already includes every type below. Do not add it to them.', 'Το σύνολο περιλαμβάνει ήδη όλους τους τύπους πιο κάτω. Μην το προσθέσεις σε αυτούς.')),
          h('div', {class:'fw-axis'}, h('b', null, U_ARR), h('span', null, q + ' · ' + sourceLine(arrivals))),
          chart,
          h('div', {class:'fw-table-actions'}, h('h4', null, t('The same numbers as a table', 'Οι ίδιοι αριθμοί σε πίνακα')), csvButton(() => downloadCsv('cyprus-sea-arrivals-' + q + '.csv', csvColumns,
            [...rows.map(r => [r.type, r.values]), [arrivals.vesselTypes.find(v => v.code === 'TOTAL'), totals]].flatMap(([type, values]) =>
              arrivalPorts.map((p, i) => csvRow(arrivals, p.name, q, type.name, '', values[i], 'arrivals')))))),
          scroll(table, t('Table of arrivals by type of vessel', 'Πίνακας αφίξεων ανά τύπο πλοίου')),
          neverTypes.length ? h('p', {class:'fw-data-note'}, t('Not reported for these two ports in any quarter of this extract: ', 'Δεν αναφέρθηκαν για αυτά τα δύο λιμάνια σε κανένα τρίμηνο του αποσπάσματος: '),
            neverTypes.map(name).join(', '), '.') : null,
          h('p', {class:'fw-sea-national'}, h('b', null, t('Cyprus as a whole, ', 'Κύπρος συνολικά, ') + q + ': '),
            shown(at(N, 'CY|NR|TOTAL', q), U_ARR), ' · ', shown(at(N, 'CY|THS_GT|TOTAL', q), U_GT), '. ',
            t('This is a separate national figure. It already counts Larnaka and Lemesos, so never add the ports to it.',
              'Αυτό είναι ξεχωριστό εθνικό μέγεθος. Μετρά ήδη τη Λάρνακα και τη Λεμεσό, γι’ αυτό μην προσθέτεις ποτέ τα λιμάνια σε αυτό.')));
      }
      draw();
      return section(t('Vessel arrivals in one quarter', 'Αφίξεις πλοίων σε ένα τρίμηνο'),
        h('p', null, t('An arrival is one ship coming into the port once. A ship that comes ten times counts ten times.',
          'Άφιξη είναι ένα πλοίο που μπαίνει στο λιμάνι μία φορά. Ένα πλοίο που έρχεται δέκα φορές μετρά δέκα φορές.')),
        h('div', {class:'fw-filter'}, h('label', {for:'fw-sea-quarter'}, t('Quarter', 'Τρίμηνο')), ' ', select), out);
    }

    /* ---------- a line chart over quarters with a table behind it ---------- */
    function overTime(o) {
      // o: { periods, series(): [{index, name, nameEl, flags, dash, values: Map}], unit, label, extract, note(), filename, csv(series, period, value) }
      const out = h('div');
      function draw() {
        const series = o.series();
        const tableOpen = out.querySelector('details')?.open;   // a table the pupil opened stays open when the selection changes
        if (!series.length) { out.replaceChildren(h('p', {role:'status'}, t('Select a series above.', 'Επίλεξε μια σειρά πιο πάνω.'))); return; }
        const rows = o.periods.map(key => ({key, values:series.map(s => { const v = s.values?.get(key); return Number.isFinite(v) ? v : null; })}));
        const table = h('table', null,
          h('caption', null, o.label() + ' · ' + t('unit: ', 'μονάδα: ') + o.unit + ' · ' + sourceLine(o.extract)),
          h('thead', null, h('tr', null, h('th', {scope:'col'}, t('Quarter', 'Τρίμηνο')), series.map(s => h('th', {scope:'col'}, name(s))))),
          h('tbody', null, rows.map(r => h('tr', null, h('th', {scope:'row'}, r.key), r.values.map(v => h('td', null, shown(v, o.unit)))))));
        const latest = h('ul', {class:'fw-sea-latest'}, series.map(s => {
          const last = [...rows].reverse().find(r => Number.isFinite(r.values[series.indexOf(s)]));
          return h('li', null, swatch(s.index), h('b', null, name(s)), ' · ', last
            ? t('latest reported quarter ', 'τελευταίο τρίμηνο με τιμή ') + last.key + ': ' + shown(last.values[series.indexOf(s)], o.unit)
            : NOT + t(' in any quarter for this selection', ' σε κανένα τρίμηνο για αυτή την επιλογή'));
        }));
        out.replaceChildren(
          h('div', {class:'fw-axis'}, h('b', null, o.unit), h('span', null, o.periods[0] + ' – ' + o.periods.at(-1) + ' · ' + sourceLine(o.extract))),
          lineChart(rows, series, {axis:'quarter', question:[o.label(), o.label()]}, o.unit),
          h('p', {class:'fw-data-note'}, t('A break in a line means the quarter was not reported. The line is never drawn across a gap.',
            'Όταν η γραμμή κόβεται, το τρίμηνο δεν αναφέρθηκε. Η γραμμή δεν ενώνεται ποτέ πάνω από κενό.')),
          latest, ...(o.note ? o.note(series) : []),
          h('details', {class:'fw-sea-table', open:tableOpen}, h('summary', null, t('Show these numbers as a table', 'Δείξε αυτούς τους αριθμούς σε πίνακα')),
            h('div', {class:'fw-table-actions'}, h('span', null, rows.length + ' ' + t('quarters', 'τρίμηνα')),
              csvButton(() => downloadCsv(o.filename(), csvColumns, rows.flatMap(r => series.map((s, i) => o.csv(s, r.key, r.values[i])))))),
            scroll(table, o.label())));
      }
      return {out, draw};
    }
    function checks(legendText, items, redraw) {
      const box = h('fieldset', {class:'fw-legend'}, h('legend', null, legendText));
      items.forEach(item => {
        const input = h('input', {type:'checkbox', checked:item.on, onchange:() => { item.on = input.checked; redraw(); }});
        box.append(h('label', null, input, swatch(item.index), item.text));
      });
      return box;
    }

    /* ---------- 3. one port's arrivals over time ---------- */
    function arrivalsOverTime() {
      const type = h('select', {id:'fw-sea-type', class:'fw-sea-select', onchange:() => view.draw()},
        [arrivals.vesselTypes.find(v => v.code === 'TOTAL'), ...reportedTypes].map(v => h('option', {value:v.code}, name(v))));
      const typeName = () => name(arrivals.vesselTypes.find(v => v.code === type.value));
      const items = [...arrivalPorts.map(p => ({code:p.code, index:portIndex(p.code), text:name(p), port:p, on:true})),
        {code:'CY', index:NATIONAL, text:t('Cyprus as a whole (separate national figure, not a sum of the ports)', 'Κύπρος συνολικά (ξεχωριστό εθνικό μέγεθος, όχι άθροισμα των λιμανιών)'), port:national.ports[0], on:false}];
      const view = overTime({
        periods:arrivals.periods, unit:U_ARR, extract:arrivals,
        label:() => t('Vessel arrivals by quarter, ', 'Αφίξεις πλοίων ανά τρίμηνο, ') + typeName(),
        series:() => items.filter(x => x.on).map(x => ({index:x.index, dash:DASH[x.index], name:x.port.name, nameEl:x.port.nameEl, national:x.code === 'CY',
          values:x.code === 'CY' ? N.get('CY|NR|' + type.value) : A.get(x.code + '|' + type.value)})),
        note:series => series.some(s => s.national) ? [h('p', {class:'fw-sea-national'}, t(
          'The national line already counts Larnaka and Lemesos. Read it next to the ports; never add it to them.',
          'Η εθνική γραμμή μετρά ήδη τη Λάρνακα και τη Λεμεσό. Διάβασέ τη δίπλα στα λιμάνια· μην την προσθέτεις ποτέ σε αυτά.'))] : [],
        filename:() => 'cyprus-sea-arrivals-' + type.value.toLowerCase() + '.csv',
        csv:(s, period, value) => csvRow(s.national ? national : arrivals, s.name, period, arrivals.vesselTypes.find(v => v.code === type.value).name, '', value, 'arrivals'),
      });
      view.draw();
      return section(t('Compare arrivals over time', 'Σύγκρινε τις αφίξεις στον χρόνο'),
        h('div', {class:'fw-filter'}, h('label', {for:'fw-sea-type'}, t('Type of vessel', 'Τύπος πλοίου')), ' ', type),
        checks(t('Lines on the chart', 'Γραμμές στο διάγραμμα'), items, () => view.draw()), view.out);
    }

    /* ---------- 4. cargo weight over time ---------- */
    function cargoOverTime() {
      const pick = (id, list) => h('select', {id, class:'fw-sea-select', onchange:() => view.draw()}, list.map(x => h('option', {value:x.code}, name(x))));
      const cargo = pick('fw-sea-cargo', freight.cargoGroups), direction = pick('fw-sea-direction', freight.directions);
      const chosen = (list, select) => list.find(x => x.code === select.value);
      const items = ports.map((p, i) => ({code:p.code, index:i, text:name(p), port:p, on:true}));
      const view = overTime({
        periods:freight.periods, unit:U_T, extract:freight,
        label:() => t('Gross weight of goods by quarter, ', 'Μικτό βάρος εμπορευμάτων ανά τρίμηνο, ') + name(chosen(freight.cargoGroups, cargo)) + ', ' + name(chosen(freight.directions, direction)),
        series:() => items.filter(x => x.on).map(x => ({index:x.index, dash:DASH[x.index], name:x.port.name, nameEl:x.port.nameEl, code:x.code,
          values:F.get(x.code + '|' + cargo.value + '|' + direction.value)})),
        note:series => series.some(s => s.code === 'CY_0CYMOI') ? [h('p', {class:'fw-sea-ends'}, t(
          'Moni: the last all-cargo total in this extract is for ' + lastTotal(freight, 'CY_0CYMOI') + '. Later quarters are not reported, so the line stops there. That is not the same as zero cargo.',
          'Μονή: το τελευταίο σύνολο όλων των φορτίων σε αυτό το απόσπασμα είναι για το ' + lastTotal(freight, 'CY_0CYMOI') + '. Τα επόμενα τρίμηνα δεν αναφέρθηκαν, γι’ αυτό η γραμμή σταματά εκεί. Αυτό δεν σημαίνει μηδενικό φορτίο.'))] : [],
        filename:() => 'cyprus-sea-cargo-' + cargo.value.toLowerCase() + '-' + direction.value.toLowerCase() + '.csv',
        csv:(s, period, value) => csvRow(freight, s.name, period, chosen(freight.cargoGroups, cargo).name, chosen(freight.directions, direction).name, value, 'thousand tonnes'),
      });
      view.draw();
      return section(t('Cargo weight by port over time', 'Βάρος φορτίου ανά λιμάνι στον χρόνο'),
        h('p', null, t('Gross weight of goods loaded and unloaded, in thousand tonnes. Inwards means unloaded at the port; outwards means loaded there. All cargo and both directions are published totals: they already include their parts, so never add a total to its parts. Eurostat rounds each number, so parts may not add up exactly to the total.',
          'Μικτό βάρος εμπορευμάτων που φορτώθηκαν και εκφορτώθηκαν, σε χιλιάδες τόνους. Εισερχόμενα είναι όσα εκφορτώθηκαν στο λιμάνι· εξερχόμενα όσα φορτώθηκαν εκεί. Οι επιλογές για όλα τα φορτία και για τις δύο κατευθύνσεις είναι δημοσιευμένα σύνολα: περιλαμβάνουν ήδη τα μέρη τους, γι’ αυτό μην προσθέτεις ποτέ ένα σύνολο στα μέρη του. Η Eurostat στρογγυλεύει κάθε αριθμό, άρα τα μέρη μπορεί να μη δίνουν ακριβώς το σύνολο.')),
        h('div', {class:'fw-filter fw-sea-filters'},
          h('span', null, h('label', {for:'fw-sea-cargo'}, t('Cargo group', 'Ομάδα φορτίου')), ' ', cargo),
          h('span', null, h('label', {for:'fw-sea-direction'}, t('Direction', 'Κατεύθυνση')), ' ', direction)),
        checks(t('Ports on the chart', 'Λιμάνια στο διάγραμμα'), items, () => view.draw()), view.out);
    }

    /* ---------- page ---------- */
    const notLive = (SC.lang === 'el' && freight.notLiveEl) || freight.notLive;
    const day = stamp => String(stamp).slice(0, 10);
    const link = (href, text) => h('a', {href, target:'_blank', rel:'noopener noreferrer'}, text);
    host.replaceChildren(
      h('div', {class:'fw-story'}, h('p', {class:'fw-topic'}, t('Ships and ports', 'Πλοία και λιμάνια')),
        h('h2', null, t('How busy were the ports of Cyprus in each quarter?', 'Πόση κίνηση είχαν τα λιμάνια της Κύπρου σε κάθε τρίμηνο;')),
        h('p', null, t('Count vessel arrivals at Larnaka and Lemesos and compare the weight of cargo handled at five ports. Comparing counts is fine. A bigger number does not make a port better.',
          'Μέτρησε τις αφίξεις πλοίων στη Λάρνακα και στη Λεμεσό και σύγκρινε το βάρος του φορτίου σε πέντε λιμάνια. Μπορείς να συγκρίνεις τους αριθμούς. Μεγαλύτερος αριθμός δεν σημαίνει καλύτερο λιμάνι.'))),
      h('p', {class:'nm-callout fw-sea-notlive', role:'note'}, h('b', null, notLive)),
      h('p', {class:'fw-sea-dates'},
        h('span', null, h('b', null, t('Latest quarter with values: ', 'Τελευταίο τρίμηνο με τιμές: ')),
          t('arrivals ', 'αφίξεις ') + arrivals.coverage.lastObservedPeriod + ' · ' + t('cargo ', 'φορτίο ') + freight.coverage.lastObservedPeriod
          + ' (' + name(ports.find(p => p.code === 'CY_0CYMOI')) + ': ' + lastTotal(freight, 'CY_0CYMOI') + ')'),
        h('span', null, h('b', null, t('Downloaded from Eurostat: ', 'Λήψη από τη Eurostat: ')), day(freight.retrievedAt))),
      portMap(), quarterView(), arrivalsOverTime(), cargoOverTime(),
      section(t('What could explain a change, and what this data cannot tell you', 'Τι θα μπορούσε να εξηγεί μια αλλαγή, και τι δεν μπορούν να σου πουν αυτά τα δεδομένα'),
        h('p', null, t('Ideas to investigate, not answers: the season, such as cruise calls; the size of the ships, since fewer, larger ships can carry the same cargo; a change in which port handles which cargo; a facility that opened or closed; or how and when the figures were reported.',
          'Ιδέες για διερεύνηση, όχι απαντήσεις: η εποχή, όπως οι αφίξεις κρουαζιερόπλοιων· το μέγεθος των πλοίων, αφού λιγότερα και μεγαλύτερα πλοία μπορούν να μεταφέρουν το ίδιο φορτίο· μια αλλαγή στο ποιο λιμάνι εξυπηρετεί ποιο φορτίο· μια εγκατάσταση που άνοιξε ή έκλεισε· ή ο τρόπος και ο χρόνος που δηλώθηκαν τα στοιχεία.')),
        h('p', null, t('What this data cannot tell you: why a number changed, which ships came or where they came from, where any ship is now, or how busy a port is today. A count of arrivals says nothing about the size of the ships. Tonnes say nothing about the value of the goods. To explain a change you need another source.',
          'Τι δεν μπορούν να σου πουν αυτά τα δεδομένα: γιατί άλλαξε ένας αριθμός, ποια πλοία ήρθαν ή από πού ήρθαν, πού βρίσκεται τώρα ένα πλοίο, ή πόση κίνηση έχει ένα λιμάνι σήμερα. Ο αριθμός των αφίξεων δεν λέει τίποτα για το μέγεθος των πλοίων. Οι τόνοι δεν λένε τίποτα για την αξία των εμπορευμάτων. Για να εξηγήσεις μια αλλαγή χρειάζεσαι και άλλη πηγή.'))),
      h('footer', {class:'fw-source'}, h('b', null, t('Source and reuse', 'Πηγή και χρήση')),
        [arrivals, freight].map(x => h('p', null, (SC.lang === 'el' && x.attributionEl) || x.attribution, ' · ', x.licence)),
        [arrivals, national, freight].map(x => h('p', null, h('b', null, name({name:x.title, nameEl:x.titleEl}) + '. '), (SC.lang === 'el' && x.methodEl) || x.method)),
        h('p', null, h('b', null, t('Latest quarter with values: ', 'Τελευταίο τρίμηνο με τιμές: ')),
          t('arrivals ', 'αφίξεις ') + arrivals.coverage.lastObservedPeriod + ' · ' + t('cargo ', 'φορτίο ') + freight.coverage.lastObservedPeriod, ' · ',
          h('b', null, t('Downloaded: ', 'Λήψη: ')), day(arrivals.retrievedAt), ' · ',
          h('b', null, t('Eurostat updated the tables: ', 'Η Eurostat ενημέρωσε τους πίνακες: ')),
          t('arrivals ', 'αφίξεις ') + day(arrivals.sourceUpdated) + ' · ' + t('cargo ', 'φορτίο ') + day(freight.sourceUpdated)),
        arrivals.coverage.lastIndexedPeriod !== arrivals.coverage.lastObservedPeriod ? h('p', null, t(
          'Eurostat lists quarters up to ' + arrivals.coverage.lastIndexedPeriod + ' for arrivals, but this download has no values after ' + arrivals.coverage.lastObservedPeriod + '. Those quarters are shown as not reported.',
          'Η Eurostat έχει στη λίστα τρίμηνα μέχρι το ' + arrivals.coverage.lastIndexedPeriod + ' για τις αφίξεις, αλλά αυτή η λήψη δεν έχει τιμές μετά το ' + arrivals.coverage.lastObservedPeriod + '. Αυτά τα τρίμηνα φαίνονται με την ένδειξη: δεν αναφέρθηκε.')) : null,
        link(freight.licenceUrl, t('Reuse terms', 'Όροι χρήσης')),
        link(arrivals.catalogueUrl, t('Eurostat: vessel arrivals', 'Eurostat: αφίξεις πλοίων') + ' (' + arrivals.datasetId + ') ↗'),
        link(freight.catalogueUrl, t('Eurostat: cargo weight', 'Eurostat: βάρος φορτίου') + ' (' + freight.datasetId + ') ↗'),
        ['seaarrivals', 'seanational', 'seafreight'].map(id => h('a', {href:'/api/fieldwork/' + id, target:'_blank', rel:'noopener'},
          t('Full data and method (JSON)', 'Πλήρη δεδομένα και μέθοδος (JSON)') + ' · ' + id))));
  };
})();
