/* Cyprus source investigations. All values come from dated, locally served provider extracts. */
(function () {
  'use strict';
  const { el: h, svgEl: svg, t } = SC;
  SC.css('/site/pages/fieldwork.css');
  const topics = {
    reservoir: {
      name: ['Reservoir storage', 'Αποθήκευση νερού'], icon: 'bars', axis: 'date',
      question: ['When did the reservoirs gain or lose water?', 'Πότε αυξήθηκε ή μειώθηκε το νερό στα φράγματα;'],
      note: ['Compare stored volume on the same dates. Reservoirs have different capacities. A larger volume alone does not tell you which is fuller.', 'Σύγκρινε τον όγκο νερού στις ίδιες ημερομηνίες. Τα φράγματα έχουν διαφορετική χωρητικότητα. Για να συγκρίνεις πληρότητα χρειάζεσαι και τη χωρητικότητα.'],
      axisLabel: ['Observation date', 'Ημερομηνία μέτρησης'], gapDays: 25
    },
    weather: {
      name: ['Weather history', 'Ιστορικό καιρού'], icon: 'sensor', axis: 'date',
      question: ['How did daytime temperatures differ between stations?', 'Πώς διέφεραν οι θερμοκρασίες ημέρας ανά σταθμό;'],
      note: ['Each monthly value is the mean of daily maximum air temperatures. A month needs valid readings on at least 90% of its calendar days. The two Limassol sites are separate stations.', 'Κάθε μηνιαία τιμή είναι ο μέσος όρος των ημερήσιων μέγιστων θερμοκρασιών αέρα. Χρειάζονται έγκυρες μετρήσεις για το 90% των ημερών του μήνα. Οι δύο τοποθεσίες της Λεμεσού είναι διαφορετικοί σταθμοί.'],
      axisLabel: ['Month beginning', 'Αρχή μήνα'], gapDays: 45
    },
    coast: {
      name: ['Seabed profiles', 'Τομές βυθού'], icon: 'route', axis: 'distance',
      question: ['Which transect descends fastest over the same distance?', 'Σε ποια τομή βαθαίνει πιο γρήγορα ο βυθός στην ίδια απόσταση;'],
      note: ['Distance starts at the first offshore sample on each transect. Negative elevations lie below the reference level. These gridded values are for classroom comparison only.', 'Η απόσταση μετρά από το πρώτο υπεράκτιο σημείο κάθε τομής. Οι αρνητικές τιμές δείχνουν βάθος κάτω από τη στάθμη αναφοράς. Χρησιμοποίησε το πλέγμα μόνο για εκπαιδευτική σύγκριση.'],
      axisLabel: ['Along transect (km)', 'Απόσταση στην τομή (km)']
    },
    crossings: {
      name: ['Pedestrian crossings', 'Διαβάσεις πεζών'], icon: 'map', axis: 'category',
      question: ['How many mapped signal-controlled crossings are near each city centre?', 'Πόσες καταγεγραμμένες διαβάσεις με φανάρια υπάρχουν κοντά σε κάθε κέντρο πόλης;'],
      note: ['The count uses a 5 km straight-line radius around each project city centre. It covers mapped crossings with signals. Other pedestrian crossings fall outside this inventory.', 'Η καταμέτρηση καλύπτει κύκλο ακτίνας 5 km γύρω από το κέντρο κάθε πόλης. Περιλαμβάνει τις καταγεγραμμένες διαβάσεις με σηματοδότηση.'],
      axisLabel: ['Area', 'Περιοχή']
    },
    arakapas: {
      name: ['Arakapas fire maps', 'Χάρτες πυρκαγιάς Αρακαπά'], icon: 'map', axis: 'category',
      question: ['How did the mapped burnt area near Melini change between the two maps?', 'Πώς άλλαξε η χαρτογραφημένη καμένη έκταση κοντά στη Μελίνη από τον πρώτο χάρτη στον δεύτερο;'],
      note: ['Compare the hectares mapped after the Arakapas fire in July 2021. Each bar shows the total for one map. The second map includes previously mapped burnt land. Subtract the first total from the second to find the change between maps. Adding them counts some land twice.', 'Σύγκρινε τα εκτάρια που χαρτογραφήθηκαν μετά την πυρκαγιά του Αρακαπά τον Ιούλιο του 2021. Κάθε ράβδος δείχνει το σύνολο ενός χάρτη. Ο δεύτερος χάρτης περιλαμβάνει και καμένες εκτάσεις που είχαν ήδη χαρτογραφηθεί. Αφαίρεσε την πρώτη τιμή από τη δεύτερη για να βρεις τη διαφορά. Αν τις προσθέσεις, θα μετρήσεις μέρος της έκτασης δύο φορές.'],
      axisLabel: ['Latest image date (UTC)', 'Ημερομηνία τελευταίας λήψης (UTC)']
    },
    verifiedno2: {
      name: ['Verified hourly nitrogen dioxide', 'Επικυρωμένες ωριαίες μετρήσεις NO₂'], icon: 'sensor', axis: 'hour',
      question: ['How did nitrogen dioxide vary across three Cyprus stations on 15 May 2024?', 'Πώς διέφερε η συγκέντρωση διοξειδίου του αζώτου σε τρεις σταθμούς της Κύπρου στις 15 Μαΐου 2024;'],
      note: ['Each value is an hourly average from the EEA E1a archive. The time marks the start of the hour in fixed UTC+1. All 72 readings carry EEA validity code 1 (valid) and verification code 1 (verified). The separate Department of Labour Inspection archive displays its own clock without a UTC offset.', 'Κάθε τιμή είναι ωριαίος μέσος όρος από το αρχείο E1a του Ευρωπαϊκού Οργανισμού Περιβάλλοντος. Η ώρα δηλώνει την αρχή του διαστήματος σε σταθερή ζώνη UTC+1. Και οι 72 μετρήσεις έχουν κωδικό εγκυρότητας 1 (έγκυρες) και κωδικό επαλήθευσης 1 (επαληθευμένες). Το χωριστό αρχείο του Τμήματος Επιθεώρησης Εργασίας δίνει την ώρα της πηγής χωρίς ζώνη ώρας.'],
      axisLabel: ['Hour starting (UTC+1)', 'Έναρξη ώρας (UTC+1)']
    },
    gases: {
      name: ['Hourly air pollution', 'Ωριαία ατμοσφαιρική ρύπανση'], icon: 'sensor', axis: 'hour',
      question: ['How did hourly gas concentrations vary between stations on 15 May 2024?', 'Πώς διέφεραν οι ωριαίες συγκεντρώσεις αερίων ανά σταθμό στις 15 Μαΐου 2024;'],
      note: ['Choose nitrogen dioxide or ozone. Compare the same hour at different stations. The archive uses the publisher’s clock and gives no UTC offset or verification flag. Missing readings appear as gaps.', 'Επίλεξε διοξείδιο του αζώτου ή όζον. Σύγκρινε την ίδια ώρα σε διαφορετικούς σταθμούς. Το αρχείο χρησιμοποιεί την ώρα της πηγής χωρίς ζώνη ώρας ή ένδειξη επικύρωσης. Τα κενά δηλώνουν απουσία μέτρησης.'],
      axisLabel: ['Publisher hour', 'Ώρα πηγής']
    },
    aeronet: {
      name: ['Aerosol optical depth', 'Οπτικό βάθος αερολυμάτων'], icon: 'sensor', axis: 'date', gapDays: 1,
      question: ['How did aerosol optical depth differ between Limassol and Nicosia in July 2022?', 'Πώς διέφερε το οπτικό βάθος αερολυμάτων μεταξύ Λεμεσού και Λευκωσίας τον Ιούλιο του 2022;'],
      note: ['A sun photometer measures how much aerosols weaken sunlight through the atmospheric column. Compare daily averages at 500 nm. Larger values mean greater attenuation. Blank cells mark days without a reported value.', 'Το ηλιακό φωτόμετρο μετρά την εξασθένηση του ηλιακού φωτός από τα αερολύματα σε ολόκληρη την ατμοσφαιρική στήλη. Σύγκρινε τους ημερήσιους μέσους όρους στα 500 nm. Μεγαλύτερη τιμή σημαίνει εντονότερη εξασθένηση. Τα κενά δηλώνουν ημέρες χωρίς τιμή.'],
      axisLabel: ['Day', 'Ημέρα']
    },
    drought: {
      name: ['Agricultural drought', 'Γεωργική ξηρασία'], icon: 'globe',
      question: ['Which agricultural drought class did the observatory assign to each place?', 'Ποια κατηγορία γεωργικής ξηρασίας κατέγραψε το παρατηρητήριο σε κάθε περιοχή;'],
      note: ['Compare four grid cells in the 2022 European Drought Observatory archive. Each month has three reporting periods. The indicator combines rainfall, soil moisture and vegetation conditions. Each class describes the cell containing the selected place.', 'Σύγκρινε τέσσερα κελιά του πλέγματος στο αρχείο του Ευρωπαϊκού Παρατηρητηρίου Ξηρασίας για το 2022. Κάθε μήνας έχει τρεις περιόδους αναφοράς. Ο δείκτης συνδυάζει στοιχεία για τη βροχόπτωση, την υγρασία του εδάφους και τη βλάστηση. Κάθε κατηγορία περιγράφει το κελί στο οποίο βρίσκεται η συγκεκριμένη περιοχή.']
    },
    flood: {
      name: ['Flood scenarios by river reach', 'Σενάρια πλημμύρας ανά τμήμα ποταμού'], icon: 'map', axis: 'category',
      question: ['How many mapped floodplain polygons intersect this river reach?', 'Πόσα χαρτογραφημένα πολύγωνα πλημμύρας τέμνουν αυτό το τμήμα ποταμού;'],
      note: ['Choose one of 38 designated reaches. Each bar counts mapped polygons that touch or cross it in one scenario. A polygon can intersect several reaches, so adding reach counts can count it twice. Polygon counts alone cannot determine flood depth, flooded area or present danger.', 'Επίλεξε ένα από τα 38 καθορισμένα τμήματα ποταμών. Κάθε ράβδος δείχνει πόσα πολύγωνα αγγίζουν ή τέμνουν το τμήμα σε ένα σενάριο. Το ίδιο πολύγωνο μπορεί να τέμνει πολλά τμήματα και να μετρηθεί πάνω από μία φορά στο άθροισμα. Το πλήθος των πολυγώνων δεν αρκεί για να εκτιμήσουμε το βάθος, την έκταση ή τον σημερινό κίνδυνο πλημμύρας.'],
      axisLabel: ['River reach', 'Τμήμα ποταμού']
    },
    power: {
      name: ['Electricity generation by fuel', 'Ηλεκτροπαραγωγή ανά πηγή ενέργειας'], icon: 'bolt', axis: 'date',
      question: ['How much electricity did Cyprus generate from each energy source?', 'Πόση ηλεκτρική ενέργεια παρήγαγε η Κύπρος από κάθε πηγή;'],
      note: ['Compare monthly net generation in gigawatt-hours (GWh). The national total includes all four sources. The table marks estimated (e) and provisional (p) values. A gap means Eurostat has no value for that month.', 'Σύγκρινε την καθαρή μηνιαία παραγωγή σε γιγαβατώρες (GWh). Το εθνικό σύνολο περιλαμβάνει και τις τέσσερις πηγές. Ο πίνακας επισημαίνει τις εκτιμήσεις (e) και τις προσωρινές τιμές (p). Το κενό δηλώνει ότι η Eurostat δεν έχει τιμή για τον συγκεκριμένο μήνα.'],
      axisLabel: ['Month', 'Μήνας'], monthly: true, gapDays: 40
    },
    ev: {
      name: ['EV charging points', 'Σημεία φόρτισης ηλεκτρικών οχημάτων'], icon: 'map', axis: 'category',
      question: ['Where are public charging points mapped, and which operators list AC or DC points?', 'Πού καταγράφονται δημόσια σημεία φόρτισης και ποιοι πάροχοι διαθέτουν σημεία AC ή DC;'],
      note: ['Several charging points can share the same coordinates. Compare the reported points by operator and current type. The inventory records infrastructure. Check with the operator for current availability.', 'Πολλά σημεία φόρτισης μπορεί να έχουν τις ίδιες συντεταγμένες. Σύγκρινε τα σημεία ανά πάροχο και τύπο ρεύματος. Για τη διαθεσιμότητα κάθε σημείου συμβουλεύσου τον πάροχο.'],
      axisLabel: ['Operator', 'Πάροχος']
    },
    census: {
      name: ['Municipal population', 'Πληθυσμός δήμων'], icon: 'users', axis: 'category',
      question: ['How many people lived in these four municipalities in 2021?', 'Πόσοι άνθρωποι ζούσαν στους τέσσερις δήμους το 2021;'],
      note: ['Use the municipal boundaries in force on 1 October 2021. These counts describe residents of those municipalities on census day. The surrounding urban areas and districts have different boundaries.', 'Ισχύουν τα όρια των δήμων της 1ης Οκτωβρίου 2021. Οι τιμές αφορούν τους κατοίκους κατά την ημέρα της απογραφής. Οι ευρύτερες αστικές περιοχές και οι επαρχίες έχουν διαφορετικά όρια.'],
      axisLabel: ['Municipality or group', 'Δήμος ή ομάδα']
    }
  };
  const colours = ['#71cce2', '#ffbd80', '#bbb1ff', '#8edbb2', '#ef9bc6', '#d4d890', '#9abaff', '#e8b5a5'];
  const dash = ['', '9 4', '3 4', '11 3 2 3'];
  const format = value => new Intl.NumberFormat(SC.lang === 'el' ? 'el-CY' : 'en-GB', {maximumFractionDigits: 3}).format(value);
  const translated = pair => t(pair[0], pair[1]);
  const seriesName = s => SC.lang === 'el' && s.nameEl ? s.nameEl : s.name;

  const periodLabel = (topic, key) => topic.monthly ? String(key).slice(0, 7) : topic.axis === 'hour' ? String(key).slice(11,16) : key;
  function flaggedValue(value, flag) {
    const number = Number.isFinite(value) ? format(value) : t('No value', 'Χωρίς τιμή');
    if (!flag) return number;
    const labels = {e: t('estimated', 'εκτίμηση'), p: t('provisional', 'προσωρινή τιμή')};
    return number + ' (' + flag + (labels[flag] ? ', ' + labels[flag] : '') + ')';
  }

  function coordinates(topic, key) {
    if (topic.axis === 'hour') return Number(String(key).slice(11,13));
    return topic.axis === 'date' ? Date.parse(String(key).slice(0, 10) + 'T00:00:00Z') : Number(key);
  }
  function lineChart(rows, series, topic, unit) {
    const left = 0, right = 620, top = 0, bottom = 160;
    const values = rows.flatMap(r => r.values.filter(Number.isFinite));
    if (!values.length) return h('p', null, t('No reported values in this selection.', 'Δεν υπάρχουν τιμές σε αυτή την επιλογή.'));
    const xFirst = coordinates(topic, rows[0].key), xLast = coordinates(topic, rows.at(-1).key);
    const min = Math.min(...values), max = Math.max(...values);
    const yLow = min === max ? min - 1 : min, yHigh = min === max ? max + 1 : max;
    const x = v => xFirst === xLast ? (left + right) / 2 : left + (v-xFirst) * (right-left) / (xLast-xFirst);
    const y = v => bottom - (v-yLow) * (bottom-top) / (yHigh-yLow);
    const chart = svg('svg', {class:'fw-chart', viewBox:'0 0 620 160', preserveAspectRatio:'none', 'aria-hidden':'true'});
    const yLabels = h('div', {class:'fw-line-levels'});
    for (const fraction of [1, 0.5, 0]) {
      const level = yLow + (yHigh-yLow)*fraction;
      yLabels.append(h('span', null, format(level)));
      chart.append(svg('line', {x1:left,x2:right,y1:y(level),y2:y(level),class:'fw-gridline'}));
    }
    const ticks = xFirst === xLast ? [rows[0]] : [rows[0], rows.at(-1)];
    const xLabels = h('div', {class:'fw-line-periods'}, ticks.map(row => h('span', null, String(periodLabel(topic, row.key)))));
    series.forEach((s,index) => {
      let path = '', prevX = null;
      rows.forEach(row => {
        const val = row.values[index], at = coordinates(topic, row.key);
        if (!Number.isFinite(val)) { prevX = null; return; }
        const split = prevX === null || (topic.gapDays && at-prevX > topic.gapDays*86400000);
        path += (split ? 'M' : 'L') + x(at).toFixed(2) + ',' + y(val).toFixed(2) + ' ';
        if (rows.length <= 40 || split) {
          const flag = s.flags?.[row.key];
          const label = seriesName(s) + ' · ' + periodLabel(topic, row.key) + ' · ' + flaggedValue(val, flag) + ' ' + unit;
          chart.append(svg('circle', {cx:x(at),cy:y(val),r:flag ? 3.6 : 2.2,fill:colours[s.index % colours.length]},
            svg('title', {}, label)));
        }
        prevX = at;
      });
      chart.append(svg('path',{d:path,fill:'none',stroke:colours[s.index % colours.length],'stroke-width':2.6,'stroke-dasharray':dash[s.index % dash.length]}));
    });
    return h('div', {class:'fw-line-plot', role:'img', 'aria-label':translated(topic.question) + ' (' + unit + ')'},
      yLabels, chart, xLabels);
  }
  function bars(rows, series) {
    const highest = Math.max(1,...rows.flatMap(r => r.values.filter(Number.isFinite)));
    return h('div',{class:'fw-bars'},rows.map(row => h('div',{class:'fw-bar-group'},h('b',null,row.label ?? row.key),
      series.map((s,i) => {
        const v = row.values[i];
        if (!Number.isFinite(v)) return null;
        return h('div',{class:'fw-bar-line'},h('span',{class:'fw-track'},h('span',{class:'fw-bar',style:{width:(100*v/highest)+'%',background:colours[s.index % colours.length]}})),
          h('span',null,series.length>1 ? seriesName(s) + ' · ' : '',format(v)));
      }))));
  }
  function writeCsv(id, dataset, topic, selected, rows) {
    const columns = ['series',topic.axis,'value','unit','source','attribution','licence','method'];
    const records = [];
    if (id === 'flood') columns.push('reach_name', 'scenario_code', 'scenario_source', 'reach_terms', 'scenario_terms', 'reach_data_edited', 'scenario_data_edited');
    if (id === 'aeronet') columns.push('station_code', 'sample_count', 'station_source', 'quality_level');
    if (id === 'verifiedno2') columns.push('pollutant', 'station_code', 'sampling_point', 'validity', 'verification', 'station_source');
    if (id === 'arakapas') columns.push('acquired_utc', 'delivery_date', 'satellite', 'polygon_count', 'map_pdf', 'vector_zip');
    if (id === 'gases') columns.push('pollutant', 'station_code', 'reporting_status');
    if (id === 'power') columns.push('siec', 'quality_flag', 'reporting_status');
    rows.forEach(row => selected.forEach((s,i) => {
      const value = row.values[i];
      const record = [s.name,row.key,value,dataset.unit,dataset.sourceUrl,dataset.attribution,dataset.licence,dataset.method];
      if (id === 'flood') {
        const scenario = dataset.scenarios.find(item => item.id === s.code);
        record.push(row.reach.name, s.code, dataset.scenarioUrl, dataset.licenceUrl,
          dataset.scenarioLicenceUrl, dataset.reachDataLastEdited, scenario.dataLastEdited);
      }
      if (id === 'aeronet') record.push(s.code, s.sampleCounts[row.key], s.sourceUrl, 'Level 2.0');
      if (id === 'verifiedno2') record.push(s.pollutant, s.stationCode, s.samplingPoint, s.validity, s.verification, s.sourceUrl);
      if (id === 'arakapas') {
        const observation = s.observations[row.key];
        record.push(observation.acquisitionTime, observation.deliveryDate, observation.satellite,
          observation.polygonCount, observation.mapUrl, observation.vectorUrl);
      }
      if (id === 'gases') record.push(s.pollutant, s.stationCode, Number.isFinite(value) ? 'reported' : 'missing');
      if (id === 'power') record.push(s.code, s.flags?.[row.key] || '', Number.isFinite(value) ? 'reported' : 'missing');
      records.push(record);
    }));
    downloadCsv('cyprus-'+id+'.csv', columns, records);
  }

  function downloadCsv(filename, columns, records) {
    const quote = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
    const text = [columns,...records].map(r => r.map(quote).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));
    const a = h('a',{href:url,download:filename}); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function droughtComparison(raw) {
    const dates = Object.keys(raw.periodEnds).sort();
    const sites = raw.series.map(site => ({...site, classes:new Map(site.points)}));
    const range = key => key + ' – ' + raw.periodEnds[key];
    const period = h('select', {class:'fw-drought-select', onchange:draw},
      dates.map(key => h('option', {value:key}, range(key))));
    // Start with the earliest period exhibiting the greatest variety of published classes.
    let maximum = 0;
    for (const key of dates) {
      const distinct = new Set(sites.map(site => site.classes.get(key)).filter(Number.isInteger)).size;
      if (distinct > maximum) { maximum = distinct; period.value = key; }
    }
    const prev = h('button', {class:'nm-btn',type:'button',onclick:() => move(-1)}, t('Previous period','Προηγούμενη περίοδος'));
    const next = h('button', {class:'nm-btn',type:'button',onclick:() => move(1)}, t('Next period','Επόμενη περίοδος'));
    const calendar = h('div');
    const body = h('tbody');
    const caption = h('caption', {'aria-live':'polite'});
    const table = h('table', null, caption, h('thead', null, h('tr', null,
      h('th',{scope:'col'},t('Place','Περιοχή')), h('th',{scope:'col'},t('Drought class','Κατηγορία ξηρασίας')))), body);
    function move(step) {
      const trigger = step < 0 ? prev : next;
      const hadFocus = document.activeElement === trigger;
      period.selectedIndex += step;
      draw();
      if (hadFocus && trigger.disabled) (step < 0 ? next : prev).focus();
    }
    function draw() {
      const key = period.value;
      calendar.replaceChildren(SC.droughtCalendar(raw, key, start => { period.value = start; draw(); }));
      caption.textContent = range(key);
      body.replaceChildren(...sites.map(site => {
        const label = raw.classLabels[site.classes.get(key)];
        return h('tr', null, h('th',{scope:'row'},seriesName(site)), h('td',null,label ? translated(label) : t('No data','Χωρίς δεδομένα')));
      }));
      prev.disabled = period.selectedIndex === 0;
      next.disabled = period.selectedIndex === dates.length - 1;
    }
    function exportPeriods(keys) {
      const fields = ['place','period_start','period_end_inclusive','source_class_code','class_en','class_el','longitude','latitude','cell_longitude','cell_latitude','source','sha256','retrieved_at','attribution','licence','licence_url','method'];
      const records = keys.flatMap(key => sites.map(site => {
        const value = site.classes.get(key);
        const labels = raw.classLabels[value] || ['No data','Χωρίς δεδομένα'];
        return [site.name,key,raw.periodEnds[key],value ?? site.sourceMaskCodes?.[key],...labels,
          site.longitude,site.latitude,site.cellLongitude,site.cellLatitude,raw.sourceUrl,raw.sourceSha256,
          raw.retrievedAt,raw.attribution,raw.licence,raw.licenceUrl,raw.method];
      }));
      downloadCsv('cyprus-drought-' + (keys.length === 1 ? keys[0] : 'all-periods') + '.csv', fields, records);
    }
    draw();
    return h('section', {class:'fw-drought'},
      h('div', {class:'fw-filter'}, h('label', null,t('Reporting period (inclusive dates)','Περίοδος αναφοράς (από και έως)'),period)),
      h('div', {class:'fw-drought-actions'}, prev,next),
      calendar,h('div', {class:'fw-table-scroll'}, table),
      h('div', {class:'fw-drought-actions'},
        h('button',{class:'nm-btn',type:'button',onclick:() => exportPeriods([period.value])}, t('Download period CSV','Λήψη CSV περιόδου')),
        h('button',{class:'nm-btn',type:'button',onclick:() => exportPeriods(dates)}, t('Download all periods (CSV)','Λήψη όλων των περιόδων (CSV)'))),
      h('details', null, h('summary',null,t('Sampling coordinates','Συντεταγμένες δειγματοληψίας')),
        h('ul',null,sites.map(site => h('li',null,h('b',null,seriesName(site)), ' · ', t('point','σημείο'),' ',
          site.latitude+'°N, '+site.longitude+'°E',' · ',t('cell centre','κέντρο κελιού'),' ',
          Number(site.cellLatitude).toFixed(5)+'°N, '+Number(site.cellLongitude).toFixed(5)+'°E')))));
  }

  function renderDataset(host, id, raw, gas = 'NO2', stations) {
    const sourceSeries = id === 'gases' ? raw.series.filter(s => s.pollutant === gas) : raw.series;
    const topic = topics[id], all = sourceSeries.map((s,index) => ({...s,index}));
    const defaultCount = topic.axis === 'category' || id === 'verifiedno2' ? all.length : 2;
    const initial = stations ? all.filter(s => stations.has(s.stationCode)) : all.slice(0, defaultCount);
    const selected = new Set(initial.map(s => s.index));
    const precision = id === 'aeronet' ? {minimumFractionDigits:6,maximumFractionDigits:6}
      : id === 'verifiedno2' ? {maximumFractionDigits:6} : null;
    const preciseValue = precision && new Intl.NumberFormat(SC.lang === 'el' ? 'el-CY' : 'en-GB', precision);
    const display = h('section',{class:'fw-visual'});
    const filter = h('div',{class:'fw-filter'});
    const legend = h('fieldset',{class:'fw-legend'},h('legend',null,t('Compare series','Σύγκριση σειρών')));
    const years = topic.axis==='date' ? [...new Set(all.flatMap(s => s.points.map(p=>String(p[0]).slice(0,4))))].sort() : [];
    const yearSelect = h('select',{'aria-label':t('Filter by year','Επιλογή έτους'),onchange:draw},h('option',{value:''},t('All years','Όλα τα έτη')),years.map(y=>h('option',{value:y},y)));
    if (topic.monthly && years.length) yearSelect.value = years.at(-1);
    if (years.length) filter.append(h('label',null,t('Year','Έτος'),' ',yearSelect));
    let gasControl;
    if (id === 'gases') {
      const gasSelect = h('select', {class:'fw-gas-select', onchange:() => {
        const stationCodes = new Set(all.filter(s => selected.has(s.index)).map(s => s.stationCode));
        renderDataset(host, id, raw, gasSelect.value, stationCodes);
        host.querySelector('.fw-gas-select').focus();
      }}, h('option',{value:'NO2'},t('Nitrogen dioxide (NO₂)','Διοξείδιο του αζώτου (NO₂)')),
          h('option',{value:'O3'},t('Ozone (O₃)','Όζον (O₃)')));
      gasSelect.value = gas;
      gasControl = h('div',{class:'fw-filter'},h('label',null,t('Pollutant','Ρύπος'),gasSelect));
    }
    let reachSelect;
    if (id === 'flood') {
      const label = t('Choose a river reach', 'Επίλεξε τμήμα ποταμού');
      reachSelect = h('select', {class:'fw-reach-select', onchange:draw},
        raw.reaches.map(reach => h('option', {value:reach.code}, reach.name + ' · ' + reach.code)));
      filter.append(h('label', null, label, reachSelect));
    }
    all.forEach(s => {
      const toggle = h('input',{type:'checkbox',checked:selected.has(s.index),onchange:() => { if(toggle.checked) selected.add(s.index); else selected.delete(s.index); draw(); }});
      legend.append(h('label',null,toggle,h('i',{style:{background:colours[s.index % colours.length]},'aria-hidden':'true'}),seriesName(s)));
    });
    function draw() {
      display.replaceChildren();
      const series = all.filter(s => selected.has(s.index));
      if (!series.length) { display.append(h('p',{role:'status'},t('Select a series above.','Επίλεξε μια σειρά πιο πάνω.'))); return; }
      const maps = series.map(s => new Map(s.points.filter(p=>!yearSelect.value || String(p[0]).startsWith(yearSelect.value))));
      const reach = reachSelect && raw.reaches.find(item => item.code === reachSelect.value);
      const keys = reach ? [reach.code] : [...new Set(maps.flatMap(m=>Array.from(m.keys())))];
      if(topic.axis!=='category') keys.sort((a,b)=>coordinates(topic,a)-coordinates(topic,b));
      const rows = keys.map(key => ({key, reach, label:reach ? reach.name + ' · ' + reach.code : periodLabel(topic,key), values:maps.map(m=>m.get(key))}));
      const unit = (SC.lang === 'el' && raw.unitEl) || raw.unit;
      if (reach) display.append(SC.floodReachMap(raw.reaches, reach.code));
      if (!rows.length) { display.append(h('p',{role:'status'},t('No values for this year. Choose another year.','Δεν υπάρχουν τιμές για αυτό το έτος. Επίλεξε άλλο έτος.'))); return; }
      const table = h('table',null,h('caption',null,t('Values in ','Τιμές σε ')+unit),
        h('thead',null,h('tr',null,h('th',{scope:'col'},translated(topic.axisLabel)),series.map(s=>h('th',{scope:'col'},seriesName(s))))));
      const tbody = h('tbody'); table.append(tbody);
      const prev = h('button',{type:'button',class:'nm-btn'},t('Previous','Προηγούμενα'));
      const next = h('button',{type:'button',class:'nm-btn'},t('Next','Επόμενα'));
      const summary = h('span',{'aria-live':'polite'}); let start=0;
      function fill(){
        const end=Math.min(start+15,rows.length);
        tbody.replaceChildren(...rows.slice(start,end).map(r=>h('tr',null,h('th',{scope:'row'},r.label),
          r.values.map((value, i) => h('td', null, preciseValue && Number.isFinite(value) ? preciseValue.format(value) : flaggedValue(value, series[i].flags?.[r.key]))))));
        summary.textContent=(start+1)+'–'+end+' / '+rows.length;
        prev.disabled=start===0; next.disabled=end===rows.length;
      }
      function page(step) {
        const trigger = step < 0 ? prev : next;
        const hadFocus = document.activeElement === trigger;
        start += step * 15;
        fill();
        if (hadFocus && trigger.disabled) (step < 0 ? next : prev).focus();
      }
      prev.onclick = () => page(-1);
      next.onclick = () => page(1);
      fill();
      display.append(h('div',{class:'fw-axis'},h('b',null,unit), h('span',null,translated(topic.axisLabel))),
        topic.axis==='category'? bars(rows,series) : lineChart(rows,series,topic,raw.unit),
        h('div',{class:'fw-table-actions'},h('h3',null,t('Source values','Τιμές πηγής')),h('button',{class:'nm-btn',type:'button',onclick:()=>writeCsv(id,raw,topic,series,rows)},SC.icon('download',16),t('Download CSV','Λήψη CSV'))),
        h('div',{class:'fw-table-scroll',tabindex:'0','aria-label':t('Source values table','Πίνακας τιμών')},table),
        ...(rows.length>15 ? [h('div',{class:'fw-page'},prev,summary,next)] : []));
    }
    const qualityNotes = [];
    if (id==='coast') {
      const flags=all.flatMap(s=>s.interpolated || []), count=flags.filter(v=>v===true).length;
      qualityNotes.push(h('p',{class:'fw-data-note'},t(count+' of '+flags.length+' samples carry an interpolation flag.',count+' από τα '+flags.length+' δείγματα έχουν ένδειξη παρεμβολής.')));
    }
    if (id === 'flood') qualityNotes.push(h('p', {class:'fw-data-note'}, t(
      'The 20-, 100- and 500-year scenarios correspond to annual exceedance probabilities of 5%, 1% and 0.2%. Compare the 20-year scenario with its 2080 counterpart to explore the mapped effects of changes in climate and land use.',
      'Τα σενάρια 20, 100 και 500 ετών αντιστοιχούν σε ετήσιες πιθανότητες υπέρβασης 5%, 1% και 0,2%. Σύγκρινε το σενάριο 20 ετών με το αντίστοιχο του 2080 για να εξετάσεις τις χαρτογραφημένες επιπτώσεις των αλλαγών στο κλίμα και στις χρήσεις γης.')));
    if (id==='weather') qualityNotes.push(h('p',{class:'fw-data-note'},t('Gaps include station-months withheld after two locations reported identical daily records.','Τα κενά περιλαμβάνουν μήνες που εξαιρέθηκαν επειδή δύο σταθμοί ανέφεραν πανομοιότυπες ημερήσιες τιμές.')));
    host.replaceChildren(h('div',{class:'fw-story'},h('p',{class:'fw-topic'},translated(topic.name)),h('h2',null,translated(topic.question)),h('p',null,translated(topic.note))),
      ...qualityNotes,
      ...(gasControl ? [gasControl] : []),   // replaceChildren() turns a bare null into the text "null", so pass nothing instead
      ...(id === 'ev' ? [SC.evMap(raw.locations)] : []),
      ...(id === 'drought' ? [droughtComparison(raw)] : [legend,filter,display]),h('footer',{class:'fw-source'},h('b',null,t('Source and reuse','Πηγή και χρήση')),
        h('p',null,(SC.lang==='el' && raw.attributionEl) || raw.attribution,' · ',raw.licence),
        h('p',null,(SC.lang==='el' && raw.methodEl) || raw.method),
        id === 'flood' ? h('p',null,
          t('River reaches updated ','Ενημέρωση τμημάτων ποταμών '),raw.reachDataLastEdited.slice(0,10),' · ',
          t('Polygon layers updated ','Ενημέρωση επιπέδων πολυγώνων '),[...new Set(raw.scenarios.map(item => item.dataLastEdited.slice(0,10)))].join(', '),' · ',
          t('Retrieved ','Ανάκτηση '),raw.retrievedAt.slice(0,10)) : null,
        id === 'drought' ? h('p',null,t('Catalogue release ','Έκδοση καταλόγου '),raw.catalogueVersion,' · ',
          t('Version in the source file ','Έκδοση στο αρχείο δεδομένων '),raw.sourceVersion,' · ',t('Retrieved ','Ανάκτηση '),raw.retrievedAt.slice(0,10)) : null,
        raw.referenceDate ? h('p',null,t('Reference date: ','Ημερομηνία αναφοράς: '),raw.referenceDate) : null,
        raw.publishedAt ? h('p',null,t('Inventory published: ','Δημοσίευση καταλόγου: '),raw.publishedAt) : null,
        id === 'power' ? h('p',null,t('Reported months: ','Μήνες με τιμές: '),raw.coverage.firstMonth,' – ',raw.coverage.lastReportedMonth,
          ' · ',t('Retrieved: ','Ανάκτηση: '),raw.retrievedAt.slice(0,10)) : null,
        raw.sourceUpdated ? h('p',null,t('Dataset updated: ','Ενημέρωση συνόλου δεδομένων: '),raw.sourceUpdated) : null,
        raw.datum ? h('p',null,raw.datum) : null,
        id === 'flood' ? h('a',{href:'https://wdd.maps.arcgis.com/apps/webappviewer/index.html?id=479ed86d25ed4e0aaa58875111e3397f',target:'_blank',rel:'noopener noreferrer'},t('View the WDD 20-year flood map','Χάρτης πλημμύρας 20ετίας του ΤΑΥ')) : null,
        id === 'flood' ? h('a',{href:raw.scenarioUrl,target:'_blank',rel:'noopener noreferrer'},t('Floodplain polygon layers','Επίπεδα πολυγώνων πλημμύρας')) : null,
        id === 'flood' ? h('a',{href:raw.scenarioLicenceUrl,target:'_blank',rel:'noopener noreferrer'},t('Polygon reuse terms','Όροι χρήσης πολυγώνων')) : null,
        id === 'drought' ? h('a',{href:raw.catalogueUrl,target:'_blank',rel:'noopener noreferrer'},t('JRC dataset catalogue','Κατάλογος δεδομένων JRC')) : null,
        id === 'arakapas' ? h('ul', {class:'fw-fire-products'}, Object.values(all[0].observations).map(obs =>
          h('li',null,h('b',null,obs.satellite,' · ',obs.acquisitionTime.slice(0,10),' ',obs.acquisitionTime.slice(11,16),' UTC'),
            h('p',null,t('Mapped polygons','Χαρτογραφημένα πολύγωνα'),' · ',obs.polygonCount,' · ',
              t('Delivered','Δημοσίευση'),' ',obs.deliveryDate),
            h('a',{href:obs.mapUrl,target:'_blank',rel:'noopener noreferrer'},t('Map (PDF)','Χάρτης (PDF)'),' · ',obs.satellite),
            h('a',{href:obs.vectorUrl,target:'_blank',rel:'noopener noreferrer'},t('Vectors (ZIP)','Διανυσματικά δεδομένα (ZIP)'),' · ',obs.satellite)))) : null,
        id === 'verifiedno2' ? h('a',{href:raw.catalogueUrl,target:'_blank',rel:'noopener noreferrer'},t('EEA archive catalogue','Κατάλογος αρχείου ΕΟΠ')) : null,
        ...(id === 'verifiedno2' ? all.map(s => h('a',{href:s.sourceUrl,target:'_blank',rel:'noopener noreferrer'},seriesName(s) + ' · Parquet')) : []),
        ...(id === 'aeronet' ? all.map(s => h('a', {href:s.sourceUrl,target:'_blank',rel:'noopener noreferrer'},seriesName(s) + ' CSV')) : []),
        raw.licenceUrl ? h('a',{href:raw.licenceUrl,target:'_blank',rel:'noopener noreferrer'},t('Reuse terms','Όροι χρήσης')) : null,
        h('a',{href:raw.sourceUrl,target:'_blank',rel:'noopener noreferrer'},t('Open the publisher’s source','Άνοιγμα της πηγής του φορέα'),' ↗'),
        h('a',{href:'/api/fieldwork/'+id,target:'_blank',rel:'noopener'},t('Full data and method (JSON)','Πλήρη δεδομένα και μέθοδος (JSON)'))));
    if (id !== 'drought') draw();
  }
  SC.register('fieldwork',{title:['Explore source data','Διερεύνηση πηγών'],async render(root,ctx){
    const id = Object.hasOwn(topics,ctx.args[0]) ? ctx.args[0] : 'reservoir';
    const nav=h('nav',{class:'fw-nav','aria-label':t('Dataset','Σύνολο δεδομένων')}, Object.entries(topics).map(([key,topic])=>h('a',{href:'#/fieldwork/'+key,'aria-current':key===id?'page':null},
      SC.icon(topic.icon,18),translated(topic.name))));
    const panel=h('article',{class:'fw-panel',id:'fw-investigation',tabindex:'-1','aria-label':translated(topics[id].name)},h('p',{role:'status'},t('Loading source data…','Φόρτωση δεδομένων…')));
    const skip = h('a', {class:'fw-skip',href:'#fw-investigation',onclick:event => {
      event.preventDefault();
      panel.focus();
    }},t('Skip to selected investigation','Μετάβαση στην επιλεγμένη διερεύνηση'));
    root.append(SC.head({title:t('Explore source data','Διερεύνηση πηγών'),help:false,lede:t('Choose a Cyprus dataset, compare places and download the values behind your chart.','Επίλεξε δεδομένα για την Κύπρο, σύγκρινε περιοχές και κατέβασε τις τιμές του διαγράμματός σου.')}),skip,h('div',{class:'fw-layout'},nav,panel),
      h('a',{class:'fw-back',href:'#/layers'},t('Back to Data layers','Πίσω στα στρώματα δεδομένων')));
    try { const data=await SC.api('/api/fieldwork/'+id); if (!Array.isArray(data.series) || !data.series.length) throw Error(); renderDataset(panel,id,data); }
    catch { panel.replaceChildren(h('p',{role:'alert'},t('This extract could not be loaded. Reopen the dataset to try again.','Αδυναμία φόρτωσης. Άνοιξε ξανά το σύνολο δεδομένων.')),
      h('button',{type:'button',class:'nm-btn',onclick:async e=>{e.currentTarget.disabled=true;try {renderDataset(panel,id,await SC.api('/api/fieldwork/'+id));}catch{panel.querySelector('button').disabled=false;}}},t('Retry','Επανάληψη'))); }
  }});
})();
