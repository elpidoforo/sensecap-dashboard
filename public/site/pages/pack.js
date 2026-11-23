/*
  Cyprus data (#/pack): views built from the Cyprus data pack of 23 November 2026. Each view reads one compact file in
  /site/data/ that carries its own sources, dates, units and caveats. All of it is HISTORICAL data: nothing here is live and
  nothing moves as data. One place at a time, nothing ranked, and two things shown together are never called cause and effect.
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css');
  // one entry per view: widget name, data file, panel text, and the selectors the page builds (key = the name set() takes)
  const VIEWS = [
    { w: 'quarters', file: 'quarters', cls: 'wl-wide', t: ['Neighbourhoods: older residents and tree cover', 'Γειτονιές: ηλικιωμένοι κάτοικοι και δενδροκάλυψη'],
      h: ['Two maps of the quarters of one city. Point at a quarter to read both numbers with the counts behind them. Nothing is ranked.', 'Δύο χάρτες των ενοριών μιας πόλης. Δείξτε μια ενορία για να διαβάσετε και τους δύο αριθμούς με τις μετρήσεις τους. Τίποτα δεν κατατάσσεται.'],
      sel: [{ key: 'city', list: 'choices', label: ['City', 'Πόλη'] }] },
    { w: 'pmpair', file: 'pmpair', t: ['Dust in the air at two outdoor monitors, day by day', 'Σκόνη στον αέρα σε δύο εξωτερικούς σταθμούς, μέρα με τη μέρα'],
      h: ['Daily PM10 at a monitor in the city and one in the countryside, one year at a time. Point at a day to read both. The difference does not say what causes it.', 'Ημερήσια PM10 σε έναν σταθμό στην πόλη και έναν στην ύπαιθρο, ένα έτος τη φορά. Δείξτε μια μέρα για να διαβάσετε και τους δύο. Η διαφορά δεν λέει τι την προκαλεί.'],
      sel: [{ key: 'year', list: 'choices', label: ['Year', 'Έτος'] }, { key: 'scale', list: 'scaleChoices', label: ['Scale', 'Κλίμακα'] }] },
    { w: 'lidar', file: 'lidar', cls: 'dw-6', t: ['Aerosol high above Limassol, hour by hour', 'Αερολύματα ψηλά πάνω από τη Λεμεσό, ώρα με την ώρα'],
      h: ['One day seen by a lidar: hours across, height upwards. It cannot tell dust from ship exhaust. Times are UTC.', 'Μία μέρα όπως την είδε ένα lidar: ώρες οριζόντια, ύψος προς τα πάνω. Δεν ξεχωρίζει τη σκόνη από τα καυσαέρια πλοίων. Οι ώρες είναι UTC.'],
      sel: [{ key: 'measure', list: 'choices', label: ['Class', 'Κατηγορία'] }] },
    { w: 'season', file: 'season', t: ['Hotel season and electricity supply', 'Τουριστική περίοδος και ηλεκτρισμός'],
      h: ['Two charts for the same months: how full hotel beds were, and electricity supplied in the whole country. They do not show that one causes the other.', 'Δύο γραφήματα για τους ίδιους μήνες: πόσο γεμάτες ήταν οι κλίνες των ξενοδοχείων και ο ηλεκτρισμός σε όλη τη χώρα. Δεν δείχνουν ότι το ένα προκαλεί το άλλο.'],
      sel: [{ key: 'unit', list: 'choices', label: ['Electricity unit', 'Μονάδα ηλεκτρισμού'] }] },
    { w: 'stay', file: 'stay', t: ['Where tourists stayed', 'Πού έμειναν οι τουρίστες'],
      h: ['A survey of where visitors stayed: the share for one reporting location over the years. Not guest-nights, and not the 2024 municipalities.', 'Έρευνα για το πού έμειναν οι επισκέπτες: το ποσοστό μιας περιοχής αναφοράς μέσα στα χρόνια. Όχι διανυκτερεύσεις και όχι οι δήμοι του 2024.'],
      sel: [{ key: 'location', list: 'locations', label: ['Location', 'Περιοχή'] }, { key: 'type', list: 'choices', label: ['Accommodation', 'Κατάλυμα'] }] },
    { w: 'flights', file: 'flights', t: ['International flights at one airport, day by day', 'Διεθνείς πτήσεις σε ένα αεροδρόμιο, μέρα με τη μέρα'],
      h: ['Arrivals and departures counted by the control tower, one airport and one year at a time. Counts say nothing about noise or air at a school.', 'Αφίξεις και αναχωρήσεις που μέτρησε ο πύργος ελέγχου, ένα αεροδρόμιο και ένα έτος τη φορά. Οι αριθμοί δεν λένε τίποτα για θόρυβο ή αέρα σε ένα σχολείο.'],
      sel: [{ key: 'airport', list: 'choices', label: ['Airport', 'Αεροδρόμιο'] }, { key: 'year', list: 'years', label: ['Year', 'Έτος'] }] },
    { w: 'freight', file: 'freight', t: ['Goods through one port, quarter by quarter', 'Εμπορεύματα από ένα λιμάνι, τρίμηνο με το τρίμηνο'],
      h: ['Thousand tonnes by kind of cargo, one port at a time. Freight measures mass, not the number of ships.', 'Χιλιάδες τόνοι ανά είδος φορτίου, ένα λιμάνι τη φορά. Το φορτίο μετρά μάζα, όχι αριθμό πλοίων.'],
      sel: [{ key: 'port', list: 'choices', label: ['Port', 'Λιμάνι'] }, { key: 'direction', list: 'directions', label: ['Direction', 'Κατεύθυνση'] }] },
    { w: 'gridmap', file: 'shipdensity', t: ['Ships around Cyprus: where they spent time', 'Πλοία γύρω από την Κύπρο: πού πέρασαν χρόνο'],
      h: ['Ship hours per square kilometre in one month of 2024, for one kind of ship. Density is not emissions.', 'Ώρες πλοίων ανά τετραγωνικό χιλιόμετρο σε έναν μήνα του 2024, για ένα είδος πλοίου. Η πυκνότητα δεν είναι εκπομπές.'],
      sel: [{ key: 'layer', list: 'choices', label: ['Ship kind and month', 'Είδος πλοίου και μήνας'] }] },
    { w: 'gridmap', file: 'blackcarbon', t: ['Soot emissions by source: a model estimate', 'Εκπομπές αιθάλης ανά πηγή: εκτίμηση μοντέλου'],
      h: ['Estimated black carbon emitted in each grid cell in 2022, for one kind of source. Estimates from a model, not measurements.', 'Εκτιμώμενη αιθάλη που εκπέμφθηκε σε κάθε κελί το 2022, για ένα είδος πηγής. Εκτιμήσεις μοντέλου, όχι μετρήσεις.'],
      sel: [{ key: 'layer', list: 'choices', label: ['Source', 'Πηγή'] }] },
  ];

  function build(root) {
    const K = SC.viz.kit, stops = [];
    const wl = K.el('div', 'dw'); root.append(wl);
    const strip = K.el('div', 'dw-strip'); wl.append(strip);
    strip.append(K.el('span', 'dw-name', 'Kleanthis // ' + T('Cyprus data', 'Δεδομένα Κύπρου')), K.el('span', null, T('historical data, not live', 'ιστορικά δεδομένα, όχι ζωντανά')), K.el('span', 'dw-end', T('one place at a time, nothing ranked', 'ένα μέρος τη φορά, τίποτα δεν κατατάσσεται')));
    VIEWS.forEach((v) => {
      const p = K.panel(wl, K.pair(v.t), K.pair(v.h), v.cls || 'wl-wide');
      K.tryJson('/site/data/' + v.file + '.json').then((a) => {
        const D = SC.viz[v.w + 'Data'], W = SC.viz[v.w];
        if (!a || !D || !W) { K.note(p.host, T('This data could not be loaded right now.', 'Τα δεδομένα δεν φόρτωσαν αυτή τη στιγμή.')); return; }
        let m; try { m = D.build(a, v.opts || {}); } catch (e) { K.note(p.host, T('This picture could not be drawn.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί.')); return; }
        p.rows(m); p.aria(m);
        if (m.empty) { K.note(p.host, K.pair(m.empty)); return; }
        p.host.textContent = '';
        let h; try { h = W.mount(p.host, m, { onPick: (r) => p.say(r && r.label ? K.pair(r.label) : '') }); } catch (e) { K.note(p.host, T('This picture could not be drawn. The facts are in the text list below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Τα στοιχεία είναι στη λίστα παρακάτω.')); return; }
        stops.push(() => h.destroy());
        (v.sel || []).forEach((s) => {
          const list = m[s.list]; if (!Array.isArray(list) || list.length < 2) return;
          const sel = K.el('select'); sel.setAttribute('aria-label', K.pair(s.label));
          list.forEach((c) => { const o = K.el('option', null, Array.isArray(c.name) ? K.pair(c.name) : String(c.name != null ? c.name : c.id)); o.value = String(c.id); sel.append(o); });
          if (m[s.key] != null) sel.value = String(m[s.key]);
          sel.onchange = () => { const o = {}; const hit = list.find((c) => String(c.id) === sel.value); o[s.key] = hit ? hit.id : sel.value; const n = h.set(o); if (n) { p.rows(n); p.aria(n); } p.say(''); };
          p.tools.append(sel);
        });
      });
    });
    wl.append(K.el('p', 'wl-foot', T('Each picture lists its source, licence, dates and limits in "The same facts as text". Researched for Kleanthis in November 2026.', 'Κάθε εικόνα γράφει την πηγή, την άδεια, τις ημερομηνίες και τα όριά της στο "Τα ίδια στοιχεία ως κείμενο". Έρευνα για τον Κλεάνθη, Νοέμβριος 2026.')));
    return () => stops.forEach((f) => { try { f(); } catch (e) { /* already gone */ } });
  }

  SC.register('pack', {
    title: ['Cyprus data', 'Δεδομένα Κύπρου'],
    render(root) {
      root.append(SC.head({ title: T('Cyprus data', 'Δεδομένα Κύπρου'), lede: T('Past measurements and statistics about Cyprus: neighbourhoods, air, sea, water, energy, tourism and transport. Each picture says where its numbers come from and what they cannot tell you.', 'Παλιές μετρήσεις και στατιστικά για την Κύπρο: γειτονιές, αέρας, θάλασσα, νερό, ενέργεια, τουρισμός και μεταφορές. Κάθε εικόνα λέει από πού είναι οι αριθμοί της και τι δεν μπορούν να σας πουν.') }));
      const host = document.createElement('div'); root.append(host);
      let stop = null, gone = false;
      const libs = ['/site/viz/kit.js']; VIEWS.forEach((v) => { ['-data.js', '.js'].forEach((x) => { const u = '/site/viz/' + v.w + x; if (libs.indexOf(u) < 0) libs.push(u); }); });
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      load(libs).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('This page could not start. Reload to try again.', 'Η σελίδα δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
