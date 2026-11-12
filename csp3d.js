'use strict';
/*
  Content-Security-Policy for /3d.html (the Cyprus 3D page, shown in the site shell through a same-origin frame).

  The page loads three.js from /vendor/three-r160/ and talks only to our own /api/*, so the browser needs nothing from any other
  host and the policy names none. Scripts: 'self' plus one hash, because an import map has to be inline (the browser cannot load
  one from a file) and a hash lets that one block run without 'unsafe-inline'. The hash is worked out from the page itself on
  every request, so editing the import map in 3d.html cannot leave a stale hash behind.
  Styles keep 'unsafe-inline' (the page has a <style> block and style="" attributes).
*/
const crypto = require('node:crypto');

// Inline import maps in the page: <script type="importmap"> ... </script>. A CSP hash covers the exact text between the tags.
function importMapHashes(html) {
  const out = [];
  const re = /<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push("'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  return out;
}

function policy3d(html) {
  const text = Buffer.isBuffer(html) ? html.toString('utf8') : String(html || '');
  return [
    "default-src 'self'",
    ["script-src 'self'", ...importMapHashes(text)].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

module.exports = { policy3d, importMapHashes };
