/* WDD reach lines simplified for display. The spatial join uses the source geometries. */
(function () {
  'use strict';
  const {el, svgEl, t} = SC;

  SC.floodReachMap = function (reaches, selectedCode) {
    const island = window.ISLAND;
    const selected = reaches.find(reach => reach.code === selectedCode);
    const label = selected ? selected.name + ' · ' + selected.code : t('All designated river reaches', 'Όλα τα χαρακτηρισμένα τμήματα ποταμών');
    const map = svgEl('svg', {
      viewBox: '0 0 ' + island.W + ' ' + island.H, class: 'fw-chart',
      role: 'img', 'aria-label': t('River reaches in Cyprus. ', 'Τμήματα ποταμών στην Κύπρο. ') + label
    });
    for (const shape of Object.values(island.districts)) {
      map.append(svgEl('path', {d:shape, fill:'#203444', stroke:'#607b8d', 'stroke-width':1}));
    }
    function drawReach(reach, active) {
      const segments = reach.mapLines.map(line => line.map(([lon, lat], i) => {
        const [x, y] = island.project(lon, lat);
        return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' '));
      const attrs = {
        d:segments.join(' '), fill:'none', stroke:active ? '#ffbe74' : '#7acfe5',
        'stroke-width':active ? 5 : 2.3, 'stroke-linecap':'round', 'stroke-linejoin':'round'
      };
      map.append(svgEl('path', attrs, svgEl('title', {}, reach.name + ' · ' + reach.code)));
    }
    for (const reach of reaches) {
      if (reach !== selected) drawReach(reach, false);
    }
    if (selected) drawReach(selected, true);
    return el('figure', {style:{margin:'1rem 0'}}, map,
      el('figcaption', {}, selected
        ? t('Highlighted river reach: ', 'Επιλεγμένο τμήμα ποταμού: ') + label
        : label));
  };
})();
