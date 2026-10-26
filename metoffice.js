'use strict';
/*
  Helpers for the Cyprus Department of Meteorology data:
  - HistoryStore keeps every 10-minute station reading in one JSON-lines file per day
  - PageStore keeps a new copy of a web page (warnings, forecasts) whenever its text changes
  - small parsers for the plain text discomfort index and for HTML pages
  No dependencies, so it also runs with a plain `node server.js`.
*/
const fs = require('fs');
const path = require('path');

/* ---------- names ---------- */

// Short keys for the readings the feed is known to carry. Anything else is stored under a name made from its label.
const KNOWN = {
  'Air Temperature (1.2m)': 'temp',
  'Air Temperature (5cm)': 'temp5',
  'Extreme Day Max. Temp.': 'tmax',
  'Extreme Day Min. Temp.': 'tmin',
  'Wind Speed (2m)': 'ws2',
  'Wind Speed (10m)': 'ws10',
  'Wind Direction (10m)': 'wd',
  'Relative Humidity (1.2m)': 'hum',
  'Accumulated Rainfall (10 min.)': 'rain10',
  'Accumulated Rainfall (24 hours)': 'rain24',
  'Rain Intensity (10 min.)': 'rainint',
  'Direct Solar Radiation': 'dsr',
  'Global Radiation': 'gsr',
  'Atmospheric Pressure (Station Level)': 'pstn',
  'Atmospheric Pressure (Mean Sea Level)': 'pmsl',
  'Atmospheric Pressure (QNH)': 'qnh',
};
const KEY_ORDER = Object.values(KNOWN);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'value';
const keyFor = (name) => KNOWN[name] || slug(name);
// The feed spells it "Celcius"; show a normal unit everywhere.
const UNIT = { celcius: '°C', celsius: '°C', knots: 'kn', degrees: '°' };
const niceUnit = (u) => UNIT[String(u || '').toLowerCase()] || String(u || '');

/* ---------- time ---------- */

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);   // file name: UTC day
const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
function localText(ms) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Nicosia', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return f.format(new Date(ms));
}

/* ---------- station readings ---------- */

class HistoryStore {
  constructor(dir, { log = () => {} } = {}) {
    this.dir = path.join(dir, 'cydom');
    this.metaFile = path.join(this.dir, 'units.json');
    this.log = log;
    this.last = new Map();        // station -> time of the newest stored reading
    this.units = {};              // key -> { name, unit }
    this.error = null;
    this.firstT = null;
    this.lastT = null;
    this.written = 0;             // readings stored since this process started
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      try { this.units = JSON.parse(fs.readFileSync(this.metaFile, 'utf8')); } catch (e) { /* first run */ }
      this._restore();
    } catch (e) {
      this.error = e.message;
      log('History store cannot use ' + this.dir + ': ' + e.message);
    }
  }

  files() {
    try { return fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d\d-\d\d\.jsonl$/.test(f)).sort(); } catch (e) { return []; }
  }

  // Learn where each station stopped, so a restart does not store the same reading twice.
  _restore() {
    const files = this.files();
    if (files.length) this.firstT = Date.parse(files[0].slice(0, 10) + 'T00:00:00Z');
    for (const f of files.slice(-2)) {
      for (const line of fs.readFileSync(path.join(this.dir, f), 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const r = JSON.parse(line);
          if (r.t > (this.last.get(r.s) || 0)) this.last.set(r.s, r.t);
          if (r.t > (this.lastT || 0)) this.lastT = r.t;
        } catch (e) { /* half-written line */ }
      }
    }
  }

  // points: parsed feed stations ({ id, time (ISO), obs: [{ name, value, unit }] }). Returns how many readings were new.
  append(points) {
    if (this.error) return 0;
    const byFile = new Map();
    let unitsChanged = false;
    for (const p of points) {
      const t = Date.parse(p.time);
      if (!p.id || !isFinite(t) || t <= (this.last.get(p.id) || 0) || !(p.obs || []).length) continue;
      const v = {};
      for (const o of p.obs) {
        if (typeof o.value !== 'number' || !isFinite(o.value)) continue;
        const k = keyFor(o.name);
        v[k] = o.value;
        if (!this.units[k]) { this.units[k] = { name: o.name, unit: niceUnit(o.unit) }; unitsChanged = true; }
      }
      if (!Object.keys(v).length) continue;
      const f = dayOf(t) + '.jsonl';
      byFile.set(f, (byFile.get(f) || '') + JSON.stringify({ t, s: p.id, v }) + '\n');
      this.last.set(p.id, t);
      if (t > (this.lastT || 0)) this.lastT = t;
      if (this.firstT == null || t < this.firstT) this.firstT = t;
      this.written++;
    }
    try {
      for (const [f, text] of byFile) fs.appendFileSync(path.join(this.dir, f), text);
      if (unitsChanged) fs.writeFileSync(this.metaFile, JSON.stringify(this.units));
    } catch (e) {
      this.error = e.message;
      this.log('History store cannot write: ' + e.message);
      return 0;
    }
    let n = 0;
    for (const text of byFile.values()) n += text.split('\n').length - 1;
    return n;
  }

  // Calls fn(row) for every stored reading between the two times (ms), oldest first. station is optional.
  each(fromMs, toMs, station, fn) {
    const needle = station ? `"s":${JSON.stringify(station)}` : null;
    for (const f of this.files()) {
      const day = Date.parse(f.slice(0, 10) + 'T00:00:00Z');
      if (day + 86400000 <= fromMs || day > toMs) continue;
      let text;
      try { text = fs.readFileSync(path.join(this.dir, f), 'utf8'); } catch (e) { continue; }
      for (const line of text.split('\n')) {
        if (!line || (needle && !line.includes(needle))) continue;
        let r;
        try { r = JSON.parse(line); } catch (e) { continue; }
        if (r.t >= fromMs && r.t <= toMs && (!station || r.s === station)) fn(r);
      }
    }
  }

  series(station, hours, keys) {
    const to = Date.now(), from = to - hours * 3600000;
    const rows = [];
    const want = keys && keys.length ? keys : null;
    const seen = new Set();
    this.each(from, to, station, (r) => {
      const ks = want || Object.keys(r.v);
      ks.forEach((k) => { if (r.v[k] != null) seen.add(k); });
      rows.push(r);
    });
    const cols = want || KEY_ORDER.filter((k) => seen.has(k)).concat([...seen].filter((k) => !KEY_ORDER.includes(k)).sort());
    return {
      station, hours, keys: cols,
      units: Object.fromEntries(cols.map((k) => [k, this.units[k] || { name: k, unit: '' }])),
      rows: rows.map((r) => [r.t, ...cols.map((k) => (r.v[k] == null ? null : r.v[k]))]),
    };
  }

  // Streams a CSV with every stored reading. write(text) is called with chunks.
  csv(fromMs, toMs, station, write) {
    const seen = new Set();
    for (const k of Object.keys(this.units)) seen.add(k);
    const cols = KEY_ORDER.filter((k) => seen.has(k)).concat([...seen].filter((k) => !KEY_ORDER.includes(k)).sort());
    const head = ['time_utc', 'time_local', 'station', ...cols.map((k) => { const u = this.units[k] || {}; return `${k}${u.unit ? ' (' + u.unit + ')' : ''}`; })];
    write('﻿' + head.join(',') + '\n');
    let buf = [];
    this.each(fromMs, toMs, station, (r) => {
      buf.push([new Date(r.t).toISOString(), localText(r.t), r.s, ...cols.map((k) => (r.v[k] == null ? '' : r.v[k]))].join(','));
      if (buf.length >= 500) { write(buf.join('\n') + '\n'); buf = []; }
    });
    if (buf.length) write(buf.join('\n') + '\n');
  }

  info() {
    let bytes = 0;
    const files = this.files();
    for (const f of files) { try { bytes += fs.statSync(path.join(this.dir, f)).size; } catch (e) { /* removed meanwhile */ } }
    return { files: files.length, bytes, firstT: this.firstT, lastT: this.lastT, stations: this.last.size, writtenSinceStart: this.written, error: this.error };
  }

  prune(days) {
    const limit = Date.now() - days * 86400000;
    let n = 0;
    for (const f of this.files()) {
      if (Date.parse(f.slice(0, 10) + 'T00:00:00Z') + 86400000 < limit) {
        try { fs.unlinkSync(path.join(this.dir, f)); n++; } catch (e) { /* ignore */ }
      }
    }
    if (n) { const files = this.files(); this.firstT = files.length ? Date.parse(files[0].slice(0, 10) + 'T00:00:00Z') : null; }
    return n;
  }
}

/* ---------- copies of web pages (warnings, forecasts) ---------- */

class PageStore {
  constructor(dir, { log = () => {} } = {}) {
    this.dir = path.join(dir, 'pages');
    this.log = log;
    this.hash = new Map();      // page name -> hash of the newest stored text
    this.savedAt = new Map();   // page name -> when a version was last stored
    this.error = null;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const files = fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d\d\.jsonl$/.test(f)).sort();
      for (const f of files.slice(-2)) {
        for (const line of fs.readFileSync(path.join(this.dir, f), 'utf8').split('\n')) {
          if (!line) continue;
          try { const r = JSON.parse(line); this.hash.set(r.name, r.h); } catch (e) { /* skip */ }
        }
      }
    } catch (e) {
      this.error = e.message;
    }
  }

  static hashOf(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36) + ':' + text.length;
  }

  // Stores a new version when the text differs from the last stored one. Returns true when stored.
  save(name, page, now = Date.now(), minGapMs = 0) {
    if (this.error) return false;
    const h = PageStore.hashOf(page.text || '');
    if (this.hash.get(name) === h) return false;
    if (now - (this.savedAt.get(name) || 0) < minGapMs) return false;   // a page that changes every minute is not stored every minute
    try {
      fs.appendFileSync(path.join(this.dir, monthOf(now) + '.jsonl'), JSON.stringify({ t: now, name, h, title: page.title || '', text: page.text || '', images: page.images || [] }) + '\n');
    } catch (e) {
      this.error = e.message;
      this.log('Page store cannot write: ' + e.message);
      return false;
    }
    this.hash.set(name, h);
    this.savedAt.set(name, now);
    return true;
  }

  versions(name, days) {
    const from = Date.now() - days * 86400000;
    const out = [];
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d\d\.jsonl$/.test(f)).sort(); } catch (e) { return out; }
    for (const f of files) {
      for (const line of fs.readFileSync(path.join(this.dir, f), 'utf8').split('\n')) {
        if (!line) continue;
        try { const r = JSON.parse(line); if (r.name === name && r.t >= from) out.push({ t: r.t, title: r.title, text: r.text, images: r.images }); } catch (e) { /* skip */ }
      }
    }
    return out;
  }
}

/* ---------- the plain text discomfort index (AWS_NET.txt) ---------- */

// "Reference Time (UTC): 2026-10-26 12:00" then rows "STATION, wind kn, temp, humidity, NET"
function parseNet(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const utc = /Reference Time \(UTC\):\s*(\d{4})-(\d\d)-(\d\d)\s+(\d\d):(\d\d)/.exec(text);
  const time = utc ? new Date(Date.UTC(+utc[1], +utc[2] - 1, +utc[3], +utc[4], +utc[5])).toISOString() : null;
  const rows = [];
  for (const l of lines) {
    if (/^(Reference Time|DATA:)/i.test(l)) continue;
    const parts = l.split(',').map((s) => s.trim());
    if (parts.length < 5) continue;
    const num = (s) => { const n = Number(s.replace(',', '.')); return s === '' || !isFinite(n) ? null : n; };
    rows.push({ station: parts[0], wind: num(parts[1]), temp: num(parts[2]), hum: num(parts[3]), net: num(parts[4]) });
  }
  return { time, rows };
}

/* ---------- web pages ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', middot: '·', ndash: '–', mdash: '—', laquo: '«', raquo: '»' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] != null ? ENTITIES[e.toLowerCase()] : m;
  });
}

function htmlToText(html) {
  let s = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|pre|table|ul|ol|section|article)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '  ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s).replace(/ /g, ' ');
  return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n');
}

// Pulls out what a person would see: title, text, pictures, and the places the page points to.
function extractPage(html, baseUrl) {
  const abs = (u) => { try { return new URL(decodeEntities(u), baseUrl).href; } catch (e) { return null; } };
  const uniq = (list) => [...new Set(list.filter(Boolean))];
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1];
  const images = uniq([...String(html).matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => abs(m[1]))).slice(0, 30);
  const frames = uniq([...String(html).matchAll(/<(?:iframe|embed|object)\b[^>]*?\b(?:src|data)\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => abs(m[1]))).slice(0, 10);
  const links = [];
  for (const m of String(html).matchAll(/<a\b[^>]*?\bhref\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = abs(m[1]);
    const text = htmlToText(m[2]).replace(/\n+/g, ' ').trim();
    if (url && /^https?:/.test(url) && text) links.push({ text: text.slice(0, 100), url });
    if (links.length >= 40) break;
  }
  const body = String(html).replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<title[\s\S]*?<\/title>/i, ' ');
  return { title: title ? htmlToText(title).replace(/\n+/g, ' ') : '', text: htmlToText(body).slice(0, 20000), images, frames, links };
}

// Decodes a downloaded page using the charset the server or the page names (Greek pages are often ISO-8859-7).
function decodeBody(buf, contentType) {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType || '');
  const head = Buffer.from(buf.subarray(0, 2048)).toString('latin1');
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
  const label = (fromHeader || fromMeta || [])[1] || 'utf-8';
  try { return new TextDecoder(label).decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}

module.exports = { HistoryStore, PageStore, parseNet, htmlToText, extractPage, decodeBody, keyFor, niceUnit, KEY_ORDER, KNOWN, localText };
