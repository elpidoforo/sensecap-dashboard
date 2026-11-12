'use strict';
/* Greek (and English) text helpers for search. Pure functions, no dependencies, safe to require anywhere on the server.

   What is here
   - fold(text)       lower case, no accents or diacritics, one kind of sigma ("ΑΈΡΑΣ", "αέρας", "αερασ" all become "αερασ").
   - tokenize(text)   folded words. "PM2.5", "PM2,5" and "pm25" are the same word.
   - isStopword(w)    the Greek stop words (vendor/stopwords-el, MIT) and a short English list.
   - stem(w)          a LIGHT stemmer, so that βροχή / βροχής / βροχές meet. English: plurals only.
   - skeleton(w)      a rough "how it sounds" spelling in Latin letters, the same for Greek words and for Greeklish
                      ("ρύπανση", "rypansi", "ripansh" all give "ripansi"). For matching only, never shown to anybody.

   Ported ideas, not copied code
   - vbarzokas/greek-utils (MIT, https://github.com/vbarzokas/greek-utils, commit 2ba9a29): the diacritics table, the Greek to
     phonetic Latin map and the Greeklish map. Here accents are removed with Unicode NFKD instead of a letter table (so polytonic and
     precomposed letters need no list), final sigma is folded (greek-utils leaves it), and the phonetic rules are written as one
     "Greek letters to Latin letters" step plus one shared "Latin spelling to sound key" step, so Greeklish typed with th/8, ps, ch/x,
     ou/u, ai/e, ei/oi/i/y/h, b/v/mp, nt/d meets the Greek spelling without having to guess the Greek back (toGreek has to guess).
   - Apmats/greekstemmerjs (MIT, the Skroutz stemmer) was only READ and used as a yardstick: it needs lodash and yamljs and ~500 lines
     of exception lists. The light stemmer below is our own (about 30 lines) and was measured against it (see the package report).
   Data: vendor/stopwords-el/stopwords-el.txt from stopwords-iso/stopwords-el (MIT), see vendor/stopwords-el/SOURCE.md. */

const fs = require('node:fs');
const path = require('node:path');

/* ---------- folding ---------- */

// Combining marks (accents, diaeresis, breathings, ypogegrammeni, ...) and invisible characters that people paste in by accident.
const MARKS = /[̀-ͯ҃-҉᷀-᷿⃐-⃿︠-︯]/g;
const INVISIBLE = /[­͏؜᠋-᠎​-‏‪-‮⁠-⁤⁦-⁯︀-️﻿]/g;

function fold(text) {
  // NFKD first: it splits accents off (έ -> ε + tonos), turns ϐ ϑ ϰ ϱ ϲ ϕ ϖ into plain letters, µ into μ, ² into 2.
  // Marks go before toLowerCase, so that İ becomes i; toLowerCase then picks the right sigma for Σ, and ς becomes σ.
  return String(text == null ? '' : text).normalize('NFKD').replace(INVISIBLE, '').replace(MARKS, '').toLowerCase().replace(/ς/g, 'σ');
}

const GREEK_LETTER = /[Ͱ-Ͽἀ-῿]/;
const hasGreek = (s) => GREEK_LETTER.test(s);
const onlyGreek = (s) => /^[Ͱ-Ͽἀ-῿]+$/.test(s);

/* ---------- tokens ---------- */

// Words are runs of letters and digits. "pm2.5" / "pm2,5" are joined into "pm25" (a decimal point inside a sensor name), nothing else is.
function tokenize(text) {
  const f = fold(text).replace(/(\p{L}\p{N}*)[.,](?=\p{N})/gu, '$1');
  return f.match(/[\p{L}\p{N}]+/gu) || [];
}

/* ---------- stop words ---------- */

// Words that are on the Greek list but matter when students ask about sensors (inside / outside, high / low, today / tomorrow, no).
const KEEP = ['οχι', 'μεσα', 'εξω', 'κατω', 'ανω', 'χαμηλα', 'ψηλα', 'κοντα', 'σημερα', 'αυριο', 'εχθες', 'εχτες'];

// Function words only (no words about sensors, data or places).
const EN_STOP = ('a about after all also an and any are as at be been before being between both but by can could did do does doing down during each ' +
  'for from had has have having he her here hers him his how i if in into is it its just me more most my of off on once only or other our out over ' +
  'own same she should so some such than that the their them then there these they this those through to too under until up very was we were what ' +
  'when where which while who whom why will with would you your yours').split(' ');

function loadGreekStopwords() {
  const out = new Set();
  let raw = '';
  try { raw = fs.readFileSync(path.join(__dirname, 'vendor', 'stopwords-el', 'stopwords-el.txt'), 'utf8'); } catch (e) { return out; }   // no file: no Greek stop words, search still works
  for (const piece of raw.replace(/∆/g, 'δ').split(/[\s,]+/)) {   // U+2206 sits where a delta should be in about 70 upstream entries
    const w = fold(piece);
    if (w.length > 1 && onlyGreek(w)) out.add(w);                      // drops "γα^", entries with an apostrophe, one-letter entries
  }
  for (const k of KEEP) out.delete(k);
  return out;
}
const EL_STOP = loadGreekStopwords();
const STOP = new Set([...EL_STOP, ...EN_STOP]);
const isStopword = (w) => STOP.has(w);
const greekStopwordCount = () => EL_STOP.size;

/* ---------- stemming ---------- */

// Greek: strip one common ending from a folded word (ς is already σ). Measured on 184 inflected pairs of sensor/school words
// (105 used while writing the rules, 79 held out): 183 meet, against 184 for the Skroutz stemmer; of 54 look-alike pairs 6 merge (Skroutz 7).
const EL_ENDINGS = ['ιδων', 'ιδεσ', 'εωσ', 'εων', 'εισ', 'ουσ', 'ιων', 'ιοσ', 'ιου', 'ιασ', 'ιεσ', 'ιοι', 'ησ', 'εσ', 'ασ', 'οσ', 'ου', 'ων', 'οι', 'ια', 'ιο',
  'α', 'η', 'ι', 'ο', 'ε', 'υ', 'ω', 'ν', 'σ'].sort((a, b) => b.length - a.length);
function stemGreek(w) {
  if (w.length < 4) return w;
  w = w.replace(/(μα)(τα|των|τοσ|τι)$/, '$1');   // κύματα, κυμάτων -> κύμα
  for (const e of EL_ENDINGS) if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length);
  return w;
}
// English: plurals only (sensors -> sensor, studies -> study, buses -> bus). Words like "measurement" are met by the prefix match in the search.
function stemEnglish(w) {
  if (w.length < 4 || !/^[a-z]+$/.test(w)) return w;
  if (/^(bus|gas|lens|bias|campus|status)es$/.test(w)) return w.slice(0, -2);
  if (/(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (/ses$/.test(w)) return w.slice(0, -1);
  return /s$/.test(w) ? w.slice(0, -1) : w;
}
function stem(w) {
  if (onlyGreek(w)) return stemGreek(w);
  return stemEnglish(w);
}

/* ---------- Greeklish: a sound key ---------- */

const GREEK_TO_LATIN = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'ks', ο: 'o', π: 'p', ρ: 'r', σ: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
const GREEK_VOWEL_PAIRS = { αυ: 'au', ευ: 'eu', ηυ: 'iu', ου: 'ou', αι: 'ai', ει: 'ei', οι: 'oi', υι: 'yi' };

// Folded Greek letters -> Latin letters, letter by letter (so that μπ gives "mp" and ντ gives "nt", as Greeklish writers also type them).
function greekToLatin(w) {
  return w.replace(/αυ|ευ|ηυ|ου|αι|ει|οι|υι|[α-ω]/g, (m) => GREEK_VOWEL_PAIRS[m] || GREEK_TO_LATIN[m] || m);
}

// Latin spelling -> sound key. Applied to Greek words (after greekToLatin) and to Latin words alike, so both land on the same letters.
function latinKey(s) {
  s = s.replace(/[^a-z0-9]/g, '');
  if ((s.match(/[a-z]/g) || []).length >= 3) s = s.replace(/[89]/g, 'th').replace(/3/g, 'ks').replace(/4/g, 'ch');   // 8, 9 = θ, 3 = ξ, 4 = χ (only inside a word)
  return s
    .replace(/ou/g, 'U')                                              // ου
    .replace(/([ae])[uy](?=[kxpstfc]|$)/g, '$1f').replace(/([ae])[uy]/g, '$1v')   // αυ, ευ: af before a hard sound, av otherwise
    .replace(/ai/g, 'e').replace(/ei|oi|ui|yi|ii/g, 'i')
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/dh/g, 'd').replace(/kh|ch|ks/g, 'x').replace(/[cq]/g, 'k')
    .replace(/([aeiouU])h/g, '$1x')                                   // a lone h after a vowel is χ (vrohi, tehnologia); elsewhere it is η (see below)
    .replace(/mp|mb/g, 'b').replace(/nt|nd/g, 'd').replace(/gk|gg/g, 'g')
    .replace(/b/g, 'v').replace(/w/g, 'o').replace(/[yhu]/g, 'i').replace(/U/g, 'u')
    .replace(/(.)\1+/g, '$1');                                        // doubled letters (λλ, ss)
}
function skeleton(token) {
  const f = fold(token);
  return latinKey(hasGreek(f) ? greekToLatin(f) : f);
}
// Same, with the ending taken off (trailing vowels and s), so that "ripanseis" meets "ρύπανση" as well.
function skeletonStem(token) {
  const k = skeleton(token);
  const r = k.replace(/s$/, '').replace(/[aeiou]+$/, '');
  return r.length >= 3 ? r : k;
}

module.exports = { fold, tokenize, hasGreek, onlyGreek, isStopword, greekStopwordCount, stem, stemGreek, stemEnglish, skeleton, skeletonStem, KEEP, EL_STOP, EN_STOP };
