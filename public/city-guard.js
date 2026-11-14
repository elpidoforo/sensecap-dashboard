// If the city module (/city-app.js, which loads three.js from /vendor/three-r160/) never starts, say so, and tell the shell frame around us.
// A separate file so the page runs under a strict Content-Security-Policy (script-src 'self', no inline script).
setTimeout(function () {
  if (window.__embedReady) return;
  var el = /[?&]lang=el/.test(location.search);
  window.__embedFailed = el ? 'Η τρισδιάστατη προβολή δεν μπόρεσε να ξεκινήσει σε αυτό το πρόγραμμα περιήγησης.' : 'The 3D view could not start in this browser.';
}, 15000);
