'use strict';
/* The "safe box" for student tools: what the server sends with a student page, and the tiny script it puts first in the page.
 *
 * What a student page is supposed to be unable to do: reach the internet, keep cookies or storage, move the visitor away, open windows,
 * use the camera, microphone or location. Its only way out is postMessage to the site page that frames it, which answers "overview"
 * with the delayed, rounded public data and nothing else.
 *
 * Layers, each tested in Chromium by scratchpad/gh/tests/safebox/harness.js (hostile pages, every outbound request logged):
 *   1. iframe sandbox="allow-scripts" (set by the site pages) and the CSP "sandbox allow-scripts" below: no same-origin, no top navigation,
 *      no pop-ups, no forms, no modals, no storage, no cookies.
 *   2. Content-Security-Policy: default-src 'none' plus only inline script and style and data: images, fonts and media. connect-src,
 *      frame-src, worker-src, object-src, form-action are 'none' too, so fetch, XHR, WebSocket, EventSource, beacons, frames, workers,
 *      objects and forms are refused by the browser.
 *   3. Connection-Allowlist: () (Chromium 152 and later). A CSP cannot stop WebRTC, WebTransport, link preconnect/prefetch or a frame
 *      that navigates itself; this header does, for every outbound connection of the document, WebRTC included.
 *   4. A small script, first in the page, that removes RTCPeerConnection and the other WebRTC names (and WebTransport) from the window.
 *      This is for browsers that do not know Connection-Allowlist. Frames and workers are refused by the CSP, so a page cannot get a
 *      fresh window that still has them. It is a second line, not the first one.
 *   5. Permissions-Policy: camera, microphone, location, screen capture, USB and other powerful features off.
 *   6. Referrer-Policy: no-referrer.
 * Browsers that understand none of 3 (Safari, Firefox, older Chrome) rely on 1, 2, 4. Only Chromium has been tested.
 */

const PROJECT_CSP = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  'media-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

// The small page that frames a student page when it is opened in its own tab. It has no script and nothing to connect to except the frame.
const WRAPPER_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const PERMISSIONS = [
  'accelerometer', 'ambient-light-sensor', 'bluetooth', 'camera', 'clipboard-read', 'clipboard-write', 'display-capture', 'geolocation',
  'gyroscope', 'hid', 'identity-credentials-get', 'idle-detection', 'local-fonts', 'magnetometer', 'microphone', 'midi', 'otp-credentials',
  'payment', 'publickey-credentials-create', 'publickey-credentials-get', 'screen-wake-lock', 'serial', 'storage-access', 'usb', 'web-share',
  'window-management', 'xr-spatial-tracking',
].map((f) => f + '=()').join(', ');

// Chromium 152+: no outbound connection at all (fetch, sockets, WebRTC, WebTransport, navigation, preconnect, redirects). Other browsers ignore it.
const CONNECTION_ALLOWLIST = '()';

function projectHeaders() {
  return {
    'Content-Security-Policy': PROJECT_CSP,
    'Connection-Allowlist': CONNECTION_ALLOWLIST,
    'Permissions-Policy': PERMISSIONS,
    'Referrer-Policy': 'no-referrer',
    Vary: 'Sec-Fetch-Dest',
  };
}
function wrapperHeaders() {
  return { 'Content-Security-Policy': WRAPPER_CSP, 'Permissions-Policy': PERMISSIONS, 'Referrer-Policy': 'no-referrer', Vary: 'Sec-Fetch-Dest' };
}

// Runs before any student code. Plain ES5, no dependencies. Keep it short: every byte is in every student page.
const SHIM_JS = '(function(){try{var w=window,n=[],i,k,d,p;'
  + 'Object.getOwnPropertyNames(w).forEach(function(x){if(/^(webkit)?RTC|^WebTransport|^WebSocketStream$/.test(x))n.push(x)});'
  + 'for(i=0;i<n.length;i++){k=n[i];try{delete w[k]}catch(e){}if(k in w){try{Object.defineProperty(w,k,{value:void 0,writable:false,configurable:false})}catch(e){}}}'
  + 'd={get:function(){return null},configurable:true};'
  + '["HTMLIFrameElement","HTMLFrameElement","HTMLObjectElement"].forEach(function(c){p=w[c]&&w[c].prototype;if(!p)return;'
  + '["contentWindow","contentDocument"].forEach(function(a){try{Object.defineProperty(p,a,d)}catch(e){}})});'
  + '}catch(e){}})();';
const SHIM = '<script>' + SHIM_JS + '</script>';

// Put the shim (and the data bridge) in front of everything the student wrote. After the doctype when there is one, so the page keeps standards
// mode; at the very top otherwise. Not "after the first <head>", which a comment or an attribute that contains the text "<head>" can defeat.
const DOCTYPE_AT_START = /^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype[^>]*>/i;
function withBridge(html, bridge) {
  const h = String(html);
  const m = DOCTYPE_AT_START.exec(h);
  const front = SHIM + (bridge || '');
  return m ? h.slice(0, m[0].length) + front + h.slice(m[0].length) : front + h;
}

module.exports = { PROJECT_CSP, WRAPPER_CSP, PERMISSIONS, CONNECTION_ALLOWLIST, SHIM, SHIM_JS, projectHeaders, wrapperHeaders, withBridge };
