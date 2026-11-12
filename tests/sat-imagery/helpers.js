'use strict';
/* Helpers for the picture-feed tests: fixture pictures, picture variants (a valid picture that differs in bytes), a fake NASA GIBS
 * and a fake EUMETView that answer like the real services are documented to (XML exception documents with HTTP 200, nearestValue
 * snapping, a capabilities text with a time extent). No network. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { reply } = require('../../satellite/testing');

const FX = path.join(__dirname, 'fixtures');
const fx = (name) => fs.readFileSync(path.join(FX, name));

// A JPEG that differs from the original by one comment block: still valid, different bytes (so a different hash).
function jpegVariant(buf, tag) {
  const text = Buffer.from(String(tag), 'utf8');
  const seg = Buffer.concat([Buffer.from([0xff, 0xfe, (text.length + 2) >> 8, (text.length + 2) & 0xff]), text]);
  return Buffer.concat([buf.subarray(0, 2), seg, buf.subarray(2)]);
}
// A PNG with one extra text chunk (with its checksum) after the header block.
function pngVariant(buf, tag) {
  const data = Buffer.from('Comment\0' + tag, 'latin1');
  const type = Buffer.from('tEXt', 'latin1');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])));
  const at = 8 + 12 + 13;   // signature + IHDR block
  return Buffer.concat([buf.subarray(0, at), len, type, data, crc, buf.subarray(at)]);
}
const variant = (buf, tag) => (buf[0] === 0xff ? jpegVariant(buf, tag) : pngVariant(buf, tag));

const xmlException = (code, text) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE ServiceExceptionReport SYSTEM "http://schemas.opengis.net/wms/1.1.1/WMS_exception_1_1_1.dtd">\n<ServiceExceptionReport version="1.1.1">\n<ServiceException code="${code}">\n${text}\n</ServiceException>\n</ServiceExceptionReport>\n`;
const XML = { 'content-type': 'application/vnd.ogc.se_xml' };

/* ---------------------------------------------------------------- NASA GIBS */
// cfg.latest   { layerId: 'YYYY-MM-DD' | null }   the layers the service has (null = a layer without time)
// cfg.caps     'ok' (default) | 500 | 'garbage'
// cfg.snap     true (default): a date after the newest one gives the picture of the newest one (nearestValue=1), like the real service
// cfg.noData   Set of 'layer|date' that are answered with a too-small picture
// cfg.fail     (params) => Reply | null   a hook for special answers
function gibsCaps(latest, hide) {
  const layers = [];
  for (let i = 0; i < 70; i++) layers.push(`<Layer queryable="0"><Name>Filler_Layer_${i}</Name><Title>Filler ${i}</Title><Dimension name="time" units="ISO8601" default="2026-11-01" nearestValue="1">2020-01-01/2026-11-01/P1D</Dimension></Layer>`);
  for (const [name, date] of Object.entries(latest)) {
    if ((hide || []).includes(name)) continue;
    const dim = date ? `<Dimension name="time" units="ISO8601" default="${date}" nearestValue="1">2012-05-08/${date}/P1D</Dimension>` : '';
    layers.push(`<Layer queryable="0"><Name>${name}</Name><Title>${name}</Title>${dim}</Layer>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<WMS_Capabilities version="1.3.0"><Capability><Layer><Title>GIBS</Title>${layers.join('\n')}</Layer></Capability></WMS_Capabilities>`;
}

function gibsFake(cfg0) {
  const cfg = { caps: 'ok', snap: true, hide: [], noData: new Set(), ...cfg0 };
  return (url) => {
    const u = new URL(url);
    const p = u.searchParams;
    if (/getcapabilities/i.test(p.get('REQUEST') || p.get('request') || '')) {
      if (cfg.caps === 500) return reply(500, 'oops');
      if (cfg.caps === 'garbage') return reply(200, '<html>maintenance</html>', { 'content-type': 'text/html' });
      return reply(200, gibsCaps(cfg.latest, cfg.hide), { 'content-type': 'text/xml' });
    }
    const special = cfg.fail && cfg.fail(p, url);
    if (special) return special;
    const layers = (p.get('layers') || '').split(',');
    const main = layers.filter((l) => !/^Coastlines/.test(l));
    for (const l of layers) {
      const known = l in cfg.latest || (/^Coastlines/.test(l) && (cfg.coasts || ['Coastlines']).includes(l));
      if (!known) return reply(200, xmlException('LayerNotDefined', `msWMSLoadGetMapParams(): WMS server error. Invalid layer(s) given in the LAYERS parameter: ${l}`), XML);
    }
    let date = p.get('time');
    const newest = cfg.latest[main[0]];
    if (newest && date && date > newest) {
      if (cfg.snap) date = newest;
      else return reply(200, xmlException('InvalidDimensionValue', `Invalid time value ${date}`), XML);
    }
    if (cfg.noData.has(`${main[0]}|${date}`)) return reply(200, fx('ok.png'), { 'content-type': 'image/png' });   // a tiny, empty-looking picture
    const png = /png/.test(p.get('format') || '');
    const base = png ? fx('cyprus-1000x633.png') : fx('cyprus-1000x633.jpg');
    return reply(200, variant(base, `${layers.join('+')}|${date}`), { 'content-type': png ? 'image/png' : 'image/jpeg' });
  };
}

/* ---------------------------------------------------------------- EUMETView */
// cfg.times     { 'ws:layer': [iso, ...] | null }  the layers the service has, with the times it lists (null: no time dimension)
// cfg.capsMode  'ws' (default: /geoserver/<ws>/wms works) | 'global' (only /geoserver/wms works) | 'none' (neither)
// cfg.timeRefused  true: a request with an explicit TIME is refused (InvalidDimensionValue); without TIME it works
function eumCaps(times, unprefixed, only) {
  const layers = [];
  for (let i = 0; i < 6; i++) layers.push(`<Layer><Name>filler${i}</Name><Title>x</Title></Layer>`);
  for (const [name, list] of Object.entries(times)) {
    if (only && !only(name)) continue;
    const dim = list && list.length ? `<Dimension name="time" default="current" units="ISO8601">${list.length > 3 ? `${list[0]}/${list[list.length - 1]}/PT10M` : list.join(',')}</Dimension>` : '';
    layers.push(`<Layer queryable="1"><Name>${unprefixed ? name.split(':')[1] : name}</Name><Title>${name}</Title>${dim}</Layer>`);
  }
  return `<?xml version="1.0"?><WMS_Capabilities version="1.3.0"><Capability><Layer>${layers.join('')}</Layer></Capability></WMS_Capabilities>`;
}

function eumFake(cfg0) {
  const cfg = { capsMode: 'ws', ...cfg0 };
  return (url) => {
    const u = new URL(url);
    const p = u.searchParams;
    if (/getcapabilities/i.test(p.get('request') || '')) {
      const m = /^\/geoserver\/([a-z_]+)\/wms$/.exec(u.pathname);
      if (cfg.capsMode === 'none') return reply(503, 'busy', { 'retry-after': '120' });
      if (m) {
        if (cfg.capsMode !== 'ws') return reply(404, 'no such workspace');
        return reply(200, eumCaps(cfg.times, true, (n) => n.startsWith(m[1] + ':')), { 'content-type': 'text/xml' });
      }
      if (cfg.capsMode !== 'global') return reply(404, 'no');
      return reply(200, eumCaps(cfg.times, false), { 'content-type': 'text/xml' });
    }
    const layers = (p.get('layers') || '').split(',');
    const main = layers[0];
    if (!(main in cfg.times)) return reply(200, xmlException('LayerNotDefined', `Could not find layer ${main}`), { 'content-type': 'text/xml' });
    for (const l of layers.slice(1)) if ((cfg.noOverlay || false) && /^backgrounds:/.test(l)) return reply(200, xmlException('LayerNotDefined', `Could not find layer ${l}`), { 'content-type': 'text/xml' });
    const time = p.get('time');
    const list = cfg.times[main] || [];
    if (time && (cfg.timeRefused || (list.length && !list.includes(time) && !(list.length > 3 && time >= list[0] && time <= list[list.length - 1])))) return reply(200, xmlException('InvalidDimensionValue', `Time value '${time}' is invalid`), { 'content-type': 'text/xml' });
    const when = time || (list.length ? list[list.length - 1] : 'none');
    return reply(200, variant(fx('region-1000x916.jpg'), `${main}|${when}|${layers.length}`), { 'content-type': 'image/jpeg' });
  };
}

const GIBS_HOST = 'https://gibs.earthdata.nasa.gov/';
const EUM_HOST = 'https://view.eumetsat.int/';

module.exports = { fx, variant, jpegVariant, pngVariant, xmlException, gibsFake, gibsCaps, eumFake, eumCaps, GIBS_HOST, EUM_HOST, XML };
