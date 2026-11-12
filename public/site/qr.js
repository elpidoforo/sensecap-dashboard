/* QR codes for links to this site. SC.qrLoad() loads the generator on first use (Project Nayuki's qrcodegen, MIT, /vendor/qrcodegen/), then
   SC.qrSvg(text, { size, label }) returns an <svg> of dark modules on a light quiet zone (it stays light in the dark theme: scanners need it).
   Encode only our own addresses, never a name or anything personal. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  let loading = null;
  SC.qrLoad = () => (window.qrcodegen ? Promise.resolve(true) : loading || (loading = new Promise((done) => {
    const s = document.createElement('script');
    s.src = '/vendor/qrcodegen/qrcodegen.js';
    s.onload = () => done(Boolean(window.qrcodegen));
    s.onerror = () => { loading = null; s.remove(); done(false); };   // not there: the caller shows the link as text only
    document.head.append(s);
  })));
  // null when the generator is not loaded or the text is too long for a code
  SC.qrSvg = function (text, o) {
    if (!window.qrcodegen) return null;
    let qr; try { qr = window.qrcodegen.QrCode.encodeText(String(text), window.qrcodegen.QrCode.Ecc.MEDIUM); } catch (e) { return null; }
    const q = 4, w = qr.size + 2 * q, size = (o && o.size) || 168, d = [];   // 4 modules of quiet zone, as the standard asks
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) d.push('M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z');
    return SC.svgEl('svg', { viewBox: '0 0 ' + w + ' ' + w, width: size, height: size, class: 'qr-svg', role: 'img', 'aria-label': (o && o.label) || 'QR code', 'shape-rendering': 'crispEdges', focusable: 'false' },
      SC.svgEl('rect', { width: w, height: w, fill: '#fff' }), SC.svgEl('path', { d: d.join(''), fill: '#000' }));
  };
})();
