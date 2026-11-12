// If the 3D module (/3d-app.js, which loads three.js from /vendor/three-r160/) never starts, say so (and tell the shell frame around us).
// This is a separate file so the page can run under a strict Content-Security-Policy (script-src 'self', no inline script).
setTimeout(function () {
  if (window.__embedReady) return;
  var el = /[?&]lang=el/.test(location.search);
  var why = el ? 'Η βιβλιοθήκη 3D δεν φορτώθηκε. Χρειάζεται σύνδεση στο διαδίκτυο.' : 'The 3D library could not be loaded. It needs an internet connection.';
  window.__embedFailed = why;
  var t = document.getElementById('msgT'), e = document.getElementById('msgE'), b = document.getElementById('msgBar');
  if (b && b.parentNode) b.parentNode.style.display = 'none';
  if (t) t.textContent = why;
  if (e) { var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn primary'; btn.style.marginTop = '12px'; btn.textContent = el ? 'Δοκιμάστε ξανά' : 'Try again'; btn.addEventListener('click', function () { location.reload(); }); e.appendChild(btn); }
}, 12000);
