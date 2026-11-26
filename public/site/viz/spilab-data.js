/*
  spilab-data.js: the models for the two learning tools on the Drought watch page.
  Pure: no DOM, no clock, no network.

  1. lab(mm): "Build the index by hand". Thirty PRACTICE winters (made up for the exercise, not measurements of any place) and
     the three steps from a rainfall amount to the index:
       - fit a gamma distribution to the practice winters (Thom 1958 approximation of the maximum-likelihood fit, the method
         used by McKee, Doesken and Kleist 1993 for the SPI);
       - find how much of the distribution lies below the chosen amount (regularized lower incomplete gamma function, series
         and continued fraction as in Numerical Recipes, Press et al. 1992, section 6.2);
       - turn that share into steps on a standard normal scale (inverse normal by Acklam's rational approximation, 2003).
     The class comes from drought-data.js (WMO SPI User Guide 2012). The practice series has no zero-rain winter, so the
     special treatment of zero months is not needed here; the page says the real index needs it.
  2. reader(model, sheetIndex, questionId): "Which window answers my question?". Which of the published windows are usually
     read for a question, with the published values of one sheet and a stated limit. The reading of the windows follows the
     Department of Meteorology's own note on its sheets (long windows as indicators for reservoir and groundwater recharge)
     and the WMO guide; it is a reading aid, never a measurement of soil, dams or groundwater.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./drought-data.js'));
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.spilabData = factory(root.SC.viz.droughtData); }
})(typeof self !== 'undefined' ? self : this, function (DD) {
  'use strict';
  // made up for practice: thirty winters of rain in millimetres. Not data of any place.
  const PRACTICE = [296, 572, 451, 648, 189, 535, 328, 453, 326, 212, 511, 361, 658, 201, 203, 372, 339, 613, 595, 690, 526, 284, 486, 220, 327, 309, 252, 311, 235, 289];
  const MIN_MM = 80, MAX_MM = 900;
  function lgamma(x) { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (let j = 0; j < 6; j++) s += g[j] / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  // regularized lower incomplete gamma P(a, x)
  function gammaP(a, x) {
    if (!(a > 0) || !(x >= 0)) return NaN; if (x === 0) return 0;
    if (x < a + 1) { let s = 1 / a, d = s, ap = a; for (let n = 0; n < 500; n++) { ap++; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-14) break; } return s * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const de = d * c; h *= de; if (Math.abs(de - 1) < 1e-14) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  // inverse of the standard normal distribution (Acklam 2003), p in (0, 1)
  function normInv(p) {
    if (!(p > 0 && p < 1)) return NaN;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    let q, r; if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // gamma fit of a list of positive amounts (Thom 1958)
  function fitGamma(list) { const v = (list || []).filter((x) => typeof x === 'number' && isFinite(x) && x > 0); if (v.length < 10) return null; const mean = v.reduce((s, x) => s + x, 0) / v.length, A = Math.log(mean) - v.reduce((s, x) => s + Math.log(x), 0) / v.length; if (!(A > 1e-9)) return null; /* a constant series has no spread to fit */ const shape = (1 + Math.sqrt(1 + 4 * A / 3)) / (4 * A); return { shape, scale: mean / shape, mean, n: v.length }; }
  const FIT = fitGamma(PRACTICE);
  const cdf = (mm) => gammaP(FIT.shape, mm / FIT.scale);
  const density = (mm) => (mm > 0 ? Math.exp((FIT.shape - 1) * Math.log(mm / FIT.scale) - mm / FIT.scale - lgamma(FIT.shape)) / FIT.scale : 0);
  // the amount of rain at which the index equals z (for drawing the class bands)
  function mmAt(z) { const target = 0.5 * (1 + erf(z / Math.SQRT2)); let lo = 0.001, hi = 20000; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (cdf(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; }
  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }

  function lab(mm) {
    const v = Math.max(MIN_MM, Math.min(MAX_MM, typeof mm === 'number' && isFinite(mm) ? Math.round(mm) : PRACTICE[0]));
    const p = Math.min(0.9999, Math.max(0.0001, cdf(v))), spi = normInv(p), cls = DD.classify(spi), below = PRACTICE.filter((x) => x < v).length, wetter = PRACTICE.filter((x) => x > v).length, n = PRACTICE.length, pctWetter = Math.round((1 - p) * 100);
    const s = DD.fmt(spi), sEl = DD.fmt(spi, true);
    const say = [below + ' of the ' + n + ' practice winters had less rain than ' + v + ' mm and ' + wetter + ' had more. The fitted curve puts ' + pctWetter + '% of winters above this amount, which gives an index of ' + s + ': ' + cls.n[0] + '.', below + ' από τους ' + n + ' χειμώνες εξάσκησης είχαν λιγότερη βροχή από ' + v + ' mm και ' + wetter + ' περισσότερη. Η καμπύλη βάζει το ' + pctWetter + '% των χειμώνων πάνω από αυτή την ποσότητα, άρα δείκτης ' + sEl + ': ' + cls.n[1] + '.'];
    return { mm: v, min: MIN_MM, max: MAX_MM, practice: PRACTICE.slice(), fit: FIT, share: p, pctWetter, below, wetter, spi, cls, say,
      edges: [-2, -1.5, -1, 1, 1.5, 2].map((z) => ({ z, mm: mmAt(z) })), density,
      note: ['Practice numbers, made up for this exercise. They are not measurements of Cyprus or of any place. The real index also has a rule for months with no rain at all.', 'Αριθμοί εξάσκησης, φτιαγμένοι για αυτή την άσκηση. Δεν είναι μετρήσεις της Κύπρου ή άλλου τόπου. Ο πραγματικός δείκτης έχει και κανόνα για μήνες χωρίς καθόλου βροχή.'] };
  }

  const QUESTIONS = [
    { id: 'soil', q: ['Is the soil dry for crops?', 'Είναι το έδαφος ξηρό για τις καλλιέργειες;'], windows: [1, 3], why: ['Short windows follow the rain of the last weeks and months, which is what the top of the soil receives.', 'Τα σύντομα παράθυρα ακολουθούν τη βροχή των τελευταίων εβδομάδων και μηνών, δηλαδή ό,τι δέχεται το πάνω μέρος του εδάφους.'], limit: ['The index does not measure soil. Heat, wind and watering change the soil too.', 'Ο δείκτης δεν μετρά το έδαφος. Η ζέστη, ο άνεμος και το πότισμα αλλάζουν επίσης το έδαφος.'] },
    { id: 'streams', q: ['Are streams and small dams low?', 'Είναι χαμηλά τα ρυάκια και τα μικρά φράγματα;'], windows: [6, 9], why: ['Six to nine months cover about one rainy season.', 'Έξι έως εννέα μήνες καλύπτουν περίπου μία βροχερή περίοδο.'], limit: ['Flow also depends on how wet the ground already was and on how the rain fell.', 'Η ροή εξαρτάται και από το πόσο υγρό ήταν ήδη το έδαφος και από το πώς έπεσε η βροχή.'] },
    { id: 'reservoirs', q: ['Are the big reservoirs low?', 'Είναι χαμηλοί οι μεγάλοι ταμιευτήρες;'], windows: [12, 24, 36, 48], why: ['The Department of Meteorology notes on its sheets that SPI over long periods (12 to 48 months) is an indicator for reduced reservoir and groundwater recharge.', 'Το Τμήμα Μετεωρολογίας σημειώνει στα φύλλα του ότι ο SPI μεγάλων περιόδων (12 έως 48 μήνες) είναι ένδειξη για μειωμένη αναπλήρωση ταμιευτήρων και υπόγειων νερών.'], limit: ['An indicator is not the dam level. The dams also depend on how much water is taken out.', 'Μια ένδειξη δεν είναι η στάθμη των φραγμάτων. Τα φράγματα εξαρτώνται και από το πόσο νερό αντλείται.'] },
    { id: 'groundwater', q: ['Is the groundwater low?', 'Είναι χαμηλά τα υπόγεια νερά;'], windows: [36, 48, 60], why: ['Groundwater answers slowly, so the longest windows are read.', 'Τα υπόγεια νερά αντιδρούν αργά, γι\' αυτό διαβάζονται τα πιο μακριά παράθυρα.'], limit: ['Pumping can change groundwater more than a few years of rain do. The index knows nothing about pumping.', 'Η άντληση μπορεί να αλλάξει τα υπόγεια νερά περισσότερο από λίγα χρόνια βροχής. Ο δείκτης δεν γνωρίζει τίποτα για την άντληση.'] }];

  const mo = (w) => (w === 1 ? ['1 month', '1 μήνας'] : [w + ' months', w + ' μήνες']);
  function reader(model, sheetIndex, questionId) {
    const q = QUESTIONS.find((x) => x.id === questionId) || QUESTIONS[0], s = model && model.sheets ? model.sheets[sheetIndex] : null;
    if (!s) return { available: false, question: q, questions: QUESTIONS, on: [], say: ['No published sheet to read.', 'Δεν υπάρχει δημοσιευμένο φύλλο για ανάγνωση.'] };
    const on = model.windows.map((w, i) => ({ window: w, i, value: s.cyprus[i], cls: s.classes[i], lit: q.windows.indexOf(w) >= 0 }));
    const vals = on.filter((x) => x.lit && x.value != null);
    let say;
    if (!vals.length) say = [q.why[0] + ' No value was published for these windows in ' + s.label[0] + '.', q.why[1] + ' Δεν δημοσιεύτηκε τιμή για αυτά τα παράθυρα (' + s.label[1] + ').'];
    else { const lo = vals.reduce((a, b) => (b.value < a.value ? b : a)), hi = vals.reduce((a, b) => (b.value > a.value ? b : a));
      say = lo.value === hi.value || vals.length === 1
        ? [q.why[0] + ' In ' + s.label[0] + ' the published value was ' + lo.cls.n[0] + ' (' + DD.fmt(lo.value) + ').', q.why[1] + ' Η δημοσιευμένη τιμή (' + s.label[1] + ') ήταν ' + lo.cls.n[1] + ' (' + DD.fmt(lo.value, true) + ').']
        : [q.why[0] + ' In ' + s.label[0] + ' these windows ran from ' + lo.cls.n[0] + ' (' + DD.fmt(lo.value) + ', ' + mo(lo.window)[0] + ') to ' + hi.cls.n[0] + ' (' + DD.fmt(hi.value) + ', ' + mo(hi.window)[0] + ').', q.why[1] + ' Τα παράθυρα αυτά (' + s.label[1] + ') κυμάνθηκαν από ' + lo.cls.n[1] + ' (' + DD.fmt(lo.value, true) + ', ' + mo(lo.window)[1] + ') έως ' + hi.cls.n[1] + ' (' + DD.fmt(hi.value, true) + ', ' + mo(hi.window)[1] + ').']; }
    return { available: true, question: q, questions: QUESTIONS, on, say, limit: q.limit, label: s.label };
  }
  return { lab, reader, gammaP, normInv, fitGamma, QUESTIONS, PRACTICE };
});
