'use strict';
/* The AI guide's knowledge search: handbook pages, approved tools, data layers and sensor guides, in Greek, Greeklish and English.

   How it works (small on purpose, about 250 lines, all in memory, no database table to keep in step with the teachers' edits)
   - Every text goes through greek.js: lower case, no accents, one sigma, stop words out, "PM2,5" = "pm25".
   - A question word can match a document word in four ways, strongest first: the same word (1.0), the same stem (0.9, βροχή finds βροχές,
     sensors finds sensor), the word is the start of a longer one (0.6, "measure" finds "measurement", from 4 letters), the same sound (0.7,
     Greeklish "ripansi" finds Greek "ρύπανση").
   - guide-terms.json links Greek and English words that mean the same ("ρύπανση" = pollution, air quality, particles). The handbook is in
     English, so this is how a Greek question reaches it. Words of the same idea that are added this way count at 0.6.
   - Ranking is BM25 (k1 1.2, b 0.75) over a title field (x3) and a body field, times a "how many of the question words are covered" factor.
   Nothing here talks to the network or to the database; the callers pass the rows in. */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const G = require('./greek');

const K1 = 1.2, B = 0.75, TITLE_BOOST = 3, W_STEM = 0.9, W_PREFIX = 0.6, W_SOUND = 0.7, W_CONCEPT = 0.6, MAX_QUERY_WORDS = 12, MAX_GROUPS = 80;

/* ---------- the Greek <-> English word groups ---------- */

function parseConcepts(json) {
  const out = [];
  for (const c of (json && Array.isArray(json.concepts) ? json.concepts : [])) {
    if (!c || typeof c !== 'object') continue;
    const terms = [];
    for (const [lang, list] of [['el', c.el], ['en', c.en]]) {
      for (const raw of (Array.isArray(list) ? list : [])) {
        if (typeof raw !== 'string') continue;
        const prefix = /\*\s*$/.test(raw) && lang === 'el';
        const toks = G.tokenize(raw);
        if (!toks.length) continue;
        if (toks.length === 1 && G.isStopword(toks[0]) && !prefix) continue;   // a lone small word would match every question
        terms.push({ lang, toks, prefix, info: toks.map((t) => wordInfo(t)) });
      }
    }
    if (terms.length) out.push({ id: String(c.id || ''), terms });
  }
  return out;
}
let concepts = null;
function loadConcepts(file) {
  try { return parseConcepts(JSON.parse(fs.readFileSync(file || path.join(__dirname, 'guide-terms.json'), 'utf8'))); } catch (e) { return []; }   // no file: search still works, only without the bridge
}
const getConcepts = () => concepts || (concepts = loadConcepts());
function setConcepts(list) { concepts = Array.isArray(list) ? list : parseConcepts(list); }   // for tests

const onlyLatin = (s) => /^[a-z0-9]+$/.test(s);
const clip = (q) => String(q == null ? '' : q).slice(0, 500);   // a question is a few words; the rest is ignored

// A folded word with what is needed to compare it: stem, sound key (skeleton), sound key without the ending.
function wordInfo(t) {
  const latin = onlyLatin(t) && t.length >= 5;
  return { t, stem: G.stem(t), greek: G.hasGreek(t), latin, sk: G.skeleton(t), skStem: G.skeletonStem(t) };
}

// Does the question word q stand for the concept word t (prefix means "t..." was written as t*)? q and t come from wordInfo.
function wordMatches(q, t, prefix) {
  if (q.t === t.t) return true;
  if (prefix) return q.t.startsWith(t.t) || (q.latin && q.sk.startsWith(t.sk));
  return q.stem === t.stem || (q.latin && t.greek && q.skStem === t.skStem);   // the last one is Greeklish
}

/* ---------- the question as groups of alternatives ---------- */

// One question word: ways to find it in a document. kind t = same word, s = same stem, p = starts with, k = same sound (Greeklish).
function alts(t) {
  const a = [{ k: 't', key: t, w: 1 }, { k: 's', key: G.stem(t), w: W_STEM }];
  if (t.length >= 4) a.push({ k: 'p', key: t, w: W_PREFIX });
  if (onlyLatin(t) && t.length >= 5) a.push({ k: 'k', key: G.skeletonStem(t), w: W_SOUND });
  return a;
}
const altId = (a) => a.k + ':' + (Array.isArray(a.key) ? a.key.join(' ') : a.key);

// group: { alts, w, origin: indexes of the question words it stands for, text }. A document matches a group when it matches one of its alts.
function queryGroups(query, conceptList) {
  const all = G.tokenize(clip(query)).slice(0, 40);
  const info = all.map((t) => wordInfo(t));
  let toks = all.filter((t) => !G.isStopword(t));
  if (!toks.length) toks = all;   // a question made only of small words still searches for them
  toks = [...new Set(toks)].slice(0, MAX_QUERY_WORDS);
  const groups = toks.map((t, qi) => ({ alts: alts(t), w: 1, origin: [qi], text: t }));
  const have = new Set(groups.flatMap((g) => g.alts.map(altId)));
  for (const c of conceptList) {
    const origin = new Set(), via = new Set();   // via: languages of the concept words the question matched (Greeklish counts as Greek)
    for (const term of c.terms) {
      // every word of the term must be in the question (in any order); the question words that took part are what this concept answers
      const used = [];
      let whole = true;
      for (const tt of term.info) {
        const hits = info.filter((q) => wordMatches(q, tt, term.prefix));
        if (!hits.length) { whole = false; break; }
        used.push(...hits.map((h) => h.t));
      }
      if (!whole) continue;
      via.add(term.lang);
      used.forEach((q) => { const i = toks.indexOf(q); if (i >= 0) origin.add(i); });
    }
    if (!via.size || groups.length >= MAX_GROUPS) continue;
    // the whole concept is ONE group (its best matching word counts, not the sum of all synonyms)
    const list = [];
    for (const term of c.terms) {
      if (term.lang === 'en' && !via.has('el')) continue;   // an English question is not widened with more English words: it keeps behaving as before
      const one = term.toks.length === 1
        ? (term.prefix ? [{ k: 'p', key: term.toks[0], w: 1 }, { k: 't', key: term.toks[0], w: 1 }] : alts(term.toks[0]))
        : [{ k: 'ph', key: term.toks.map((t) => G.stem(t)), w: 1 }];
      for (const x of one) { const id = altId(x); if (!have.has(id)) { have.add(id); list.push({ ...x, w: x.w * W_CONCEPT }); } }
    }
    if (list.length) groups.push({ alts: list, w: 1, origin: [...origin], text: c.id, concept: c.id });
  }
  return { groups, words: toks };
}

/* ---------- the index ---------- */

function fieldIndex(text) {
  const terms = G.tokenize(text).filter((t) => !G.isStopword(t));
  const exact = new Map(), stem = new Map(), sound = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const t of terms) {
    bump(exact, t); bump(stem, G.stem(t));
    if (G.hasGreek(t)) bump(sound, G.skeletonStem(t));
  }
  return { len: terms.length, exact, stem, sound };
}
function build(docs) {
  const fields = docs.map((d) => ({ title: fieldIndex(d.title), body: fieldIndex(d.body) }));
  const avg = (f) => Math.max(1, fields.reduce((s, x) => s + x[f].len, 0) / (fields.length || 1));
  return { fields, n: fields.length, avgTitle: avg('title'), avgBody: avg('body') };
}

// How often a group is in a field, weighted by how it matched (the best of its alts).
function groupTf(alts_, f) {
  let best = 0;
  for (const a of alts_) {
    let c = 0;
    if (a.k === 't') c = f.exact.get(a.key) || 0;
    else if (a.k === 's') c = f.stem.get(a.key) || 0;
    else if (a.k === 'k') c = f.sound.get(a.key) || 0;
    else if (a.k === 'ph') c = Math.min(...a.key.map((t) => f.stem.get(t) || 0));   // a phrase: all its words, in any order
    else { for (const [t, n] of f.exact) if (t.length > a.key.length && t.startsWith(a.key)) c += n; }
    if (c * a.w > best) best = c * a.w;
  }
  return best;
}

function score(index, groups, wordCount) {
  const { fields, n } = index;
  const out = new Array(n).fill(0);
  const covered = Array.from({ length: n }, () => new Set());
  for (const g of groups) {
    const tf = fields.map((f) => [groupTf(g.alts, f.title), groupTf(g.alts, f.body)]);
    const df = tf.filter((r) => r[0] > 0 || r[1] > 0).length;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    tf.forEach((r, d) => {
      if (!(r[0] > 0 || r[1] > 0)) return;
      const f = fields[d];
      const t = ((r[0] * (K1 + 1)) / (r[0] + K1 * (1 - B + (B * f.title.len) / index.avgTitle))) * TITLE_BOOST;
      const b = (r[1] * (K1 + 1)) / (r[1] + K1 * (1 - B + (B * f.body.len) / index.avgBody));
      out[d] += g.w * idf * (t + b);
      g.origin.forEach((o) => covered[d].add(o));
    });
  }
  const want = Math.max(1, wordCount);
  return out.map((s, d) => (s > 0 ? s * (0.4 + 0.6 * Math.min(1, covered[d].size / want)) : 0));
}

// Building the index takes about 1 ms for the 19 starter pages and 80 ms for 400. The last few are kept, keyed by their text, so that a handbook
// that did not change is not read again for the next question (a teacher's edit changes the key, so nothing can be stale).
const cache = new Map();
function indexFor(docs) {
  const h = crypto.createHash('sha1');
  for (const d of docs) h.update(String(d.title) + '\u0000' + String(d.body) + '\u0001');
  const key = h.digest('hex');
  let ix = cache.get(key);
  if (ix) { cache.delete(key); } else ix = build(docs);
  cache.set(key, ix);
  while (cache.size > 8) cache.delete(cache.keys().next().value);
  return ix;
}

/* ---------- public functions ---------- */

// docs: [{ title, body }]. Returns [{ i, score }] best first, only documents that match.
function rank(docs, query, opts) {
  const { groups, words } = queryGroups(query, (opts && opts.concepts) || getConcepts());
  if (!groups.length || !docs.length) return [];
  const s = score(opts && opts.nocache ? build(docs) : indexFor(docs), groups, words.length);
  return s.map((v, i) => ({ i, score: v })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
}
const hasQuery = (query) => G.tokenize(clip(query)).length > 0;

// The handbook: pages [{ title, body }] -> the best pages as { title, text }. Without a usable question: the first pages (as before).
function handbook(pages, query, opts) {
  const limit = (opts && opts.limit) || 3, chars = (opts && opts.chars) || 2500;
  const pick = hasQuery(query) ? rank(pages, query).slice(0, limit).map((x) => pages[x.i]) : pages.slice(0, limit);
  return pick.map((p) => ({ title: p.title, text: passages(p.body, query, chars) }));
}
// The page text, at most `chars` long. A long page keeps its first line and then the lines that fit the question best, in their old order.
function passages(body, query, chars) {
  body = String(body == null ? '' : body);
  if (body.length <= chars) return body;
  const lines = body.split('\n');
  if (lines.length < 2 || !hasQuery(query)) return body.slice(0, chars);
  const ranked = rank(lines.map((l) => ({ title: '', body: l })), query, { nocache: true });
  const keep = new Set([0]);
  let used = Math.min(lines[0].length + 1, chars);
  for (const { i } of ranked) {
    if (keep.has(i)) continue;
    if (used + lines[i].length + 1 > chars) continue;
    keep.add(i); used += lines[i].length + 1;
  }
  return [...keep].sort((a, b) => a - b).map((i) => lines[i]).join('\n').slice(0, chars);
}

// Any list of rows: toDoc(row) -> { title, body }. Returns the matching rows, best first (all rows, in their order, when there is no question).
function rankRows(rows, query, toDoc) {
  if (!hasQuery(query)) return rows.slice();
  return rank(rows.map(toDoc), query).map((x) => rows[x.i]);
}

/* The three lists the guide can look through. Each takes the rows the caller already has and a free-text question, and says whether the
   question found something: matched true = the rows are the matches, best first; false = nothing matched, the rows are all of them as before;
   null = no question, the rows are untouched. */
const layerDoc = (l) => ({
  title: [l.name, l.nameEl].join(' '),
  body: [l.summary, l.summaryEl, l.group, l.publisher, l.tagline, l.taglineEl, (l.variables || []).join(' ').replace(/_/g, ' ')].filter(Boolean).join(' '),
});
function layersFor(cards, query) {
  if (!hasQuery(query)) return { rows: cards, matched: null };
  const rows = rankRows(cards, query, layerDoc);
  return rows.length ? { rows, matched: true } : { rows: cards, matched: false };
}
const toolDoc = (t) => ({ title: t.title || '', body: [t.idea, t.question, t.school, t.team].filter(Boolean).join(' ') });
function galleryFor(tools, plans, query) {
  if (!hasQuery(query)) return { tools, plans, matched: null };
  const t = rankRows(tools, query, toolDoc), p = rankRows(plans, query, toolDoc);
  return t.length || p.length ? { tools: t, plans: p, matched: true } : { tools, plans, matched: false };
}
// A sensor guide by name: the old way first (the name is part of the title, any case), then the whole search (Greek, Greeklish, a topic).
function guideByName(guides, name) {
  const q = String(name == null ? '' : name).toLowerCase().trim();
  const exact = guides.filter((g) => g.title.toLowerCase().includes(q)).slice(0, 2);
  if (exact.length || !hasQuery(name)) return exact;
  return rankRows(guides, name, (g) => ({ title: g.title, body: g.body })).slice(0, 2);
}

// A way to see what the question turned into (for tests and for maintainers).
function explain(query, opts) {
  const { groups, words } = queryGroups(query, (opts && opts.concepts) || getConcepts());
  return { words, groups: groups.map((g) => ({ text: g.text, w: g.w, concept: g.concept || null, alts: g.alts.map((a) => a.k + ':' + (Array.isArray(a.key) ? a.key.join(' ') : a.key)) })) };
}

module.exports = { rank, handbook, passages, rankRows, layersFor, galleryFor, guideByName, explain, hasQuery, loadConcepts, parseConcepts, setConcepts, getConcepts, _t: { queryGroups, build, score } };
