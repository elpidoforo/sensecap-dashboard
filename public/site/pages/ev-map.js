/* Reviewed EV inventory drawn on the same Cyprus outline as the Data layers page. */
(function () {
  'use strict';
  const { el: h, svgEl: svg, t } = SC;

  SC.evMap = function (locations) {
    const island = window.ISLAND;
    const title = t('Charging point locations', 'Τοποθεσίες σημείων φόρτισης');
    const section = h('section', {class:'fw-filter fw-ev-map'}, h('h3', null, title));
    if (!Array.isArray(locations) || !locations.length) {
      section.append(h('p', null, t('No locations in this inventory.', 'Δεν υπάρχουν τοποθεσίες σε αυτή την καταγραφή.')));
      return section;
    }
    const rows = [...locations].sort((a, b) => a.name.localeCompare(b.name, SC.lang));
    const byCoordinates = new Map();
    const coordinateKey = r => [Number(r.latitude), Number(r.longitude)].join(',');
    rows.forEach((row, index) => {
      const key = coordinateKey(row);
      if (!byCoordinates.has(key)) byCoordinates.set(key, []);
      byCoordinates.get(key).push(index);
    });
    section.append(h('p', null, t(
      rows.length + ' charging points at ' + byCoordinates.size + ' distinct coordinate pairs.',
      rows.length + ' σημεία φόρτισης σε ' + byCoordinates.size + ' διαφορετικά ζεύγη συντεταγμένων.')));
    const choose = t('Choose a charging point', 'Επίλεξε σημείο φόρτισης');
    const list = h('select', {style:{display:'block',maxWidth:'100%',width:'100%',minHeight:'44px'}}, h('option', {value:''}, choose));
    const detail = h('p', {'aria-live':'polite',style:{overflowWrap:'anywhere'}});
    const coords = r => Number(r.latitude).toFixed(5) + ', ' + Number(r.longitude).toFixed(5);
    const label = (r, i) => r.name + ' · ' + String(r.currentType).toUpperCase() + ' · #' + (i + 1);
    rows.forEach((r, i) => list.append(h('option', {value:String(i)}, label(r, i))));
    const nearby = h('div');
    let highlight;
    function show() {
      const row = rows[list.value];
      detail.textContent = row ? [row.name, row.operator, String(row.currentType).toUpperCase(), coords(row)].join(' · ') : '';
      nearby.replaceChildren();
      if (row) {
        const group = byCoordinates.get(coordinateKey(row));
        if (group.length > 1) {
          nearby.append(h('h4', null, t('Points at these coordinates', 'Σημεία στις ίδιες συντεταγμένες') + ' (' + group.length + ')'),
            h('ul', null, group.map(index => h('li', null, label(rows[index], index)))));
        }
      }
      if (!highlight) return;
      highlight.setAttribute('visibility', row ? 'visible' : 'hidden');
      if (row) {
        const [x, y] = island.project(row.longitude, row.latitude);
        highlight.setAttribute('cx', x);
        highlight.setAttribute('cy', y);
      }
    }
    if (island) {
      const map = svg('svg', {class:'fw-chart', viewBox:'-10 -10 ' + (island.W + 20) + ' ' + (island.H + 20),
        role:'img','aria-label':title + ' (' + rows.length + ')'});
      for (const path of Object.values(island.districts)) {
        map.append(svg('path', {d:path, fill:'#213a47',stroke:'#60818d','stroke-width':1}));
      }
      for (const group of byCoordinates.values()) {
        const i = group[0], r = rows[i];
        const [cx, cy] = island.project(r.longitude, r.latitude);
        const marker = svg('circle', {cx,cy,r:group.length > 1 ? 7 : 4.5,fill:'#ffd08e',stroke:'#15212b','stroke-width':1,style:'cursor:pointer'},
          svg('title', null, group.map(index => label(rows[index], index)).join(' · ')));
        marker.addEventListener('click', () => { list.value = String(i); show(); });
        map.append(marker);
      }
      highlight = svg('circle', {r:12,fill:'none',stroke:'#fff','stroke-width':3,'pointer-events':'none',visibility:'hidden'});
      map.append(highlight);
      section.append(map);
    }
    section.append(h('p', null, t('Larger dots mark coordinates shared by several points. Select a dot or choose a point from the list.',
      'Οι μεγαλύτερες κουκκίδες δείχνουν σημεία που μοιράζονται συντεταγμένες. Επίλεξε μια κουκκίδα ή ένα σημείο από τη λίστα.')),
      h('label', null, choose, list), detail, nearby);
    list.addEventListener('change', show);
    return section;
  };
})();
