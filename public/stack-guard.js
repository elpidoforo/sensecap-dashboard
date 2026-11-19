// If the stack module (/stack-app.js, which loads three.js from /vendor/three-r160/) does not start, say so, say WHY, and tell
// the shell frame around us. A separate file so the page runs under a strict Content-Security-Policy (script-src 'self', no
// inline script). The reason (the browser's own error text, the file and the line) is shown on the page and sent once to
// GET /api/client-error, which writes it to the server log with the browser's name and nothing about the person.
(function () {
  var told = false, el = /[?&]lang=el/.test(location.search);
  function fail(why) {
    if (told || window.__embedReady) return;
    told = true;
    why = String(why || '').replace(/\s+/g, ' ').slice(0, 220);
    window.__embedFailed = (el ? 'Η τρισδιάστατη προβολή δεν μπόρεσε να ξεκινήσει σε αυτό το πρόγραμμα περιήγησης.' : 'The 3D view could not start in this browser.') + (why ? ' [' + why + ']' : '');
    try { fetch('/api/client-error?p=stack&m=' + encodeURIComponent(why || 'no reason given'), { keepalive: true }).catch(function () {}); } catch (e) { /* the page still says it */ }
  }
  // An error before the scene is up is remembered, not announced: a feed that fails must not be mistaken for a dead scene.
  // If the scene has still not started after 15 seconds, the first error seen is the reason given.
  var first = '';
  function note(why) { if (!first && !window.__embedReady) first = why; }
  addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName === 'SCRIPT') return note('script did not load or could not be read: ' + (t.getAttribute('src') || 'inline'));
    if (e.message) note(e.message + ' @ ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
  }, true);
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason; note('promise: ' + (r && (r.message || r.name) ? (r.name ? r.name + ': ' : '') + (r.message || '') : String(r)));
  });
  setTimeout(function () { fail(first || 'no error reported, but the scene had not started after 15 seconds'); }, 15000);
})();
