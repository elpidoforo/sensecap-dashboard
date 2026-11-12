/*
  Heat index ("feels like"), the US National Weather Service procedure.
  Used by the What-if page (public/site/pages/whatif.js), loaded from there as /site/heatindex.js. Pure maths, no DOM, no network.
  Also loads in Node (module.exports) so that the table tests can run: scratchpad/gh/tests/extras/heatindex_test.js.

  What it is. The heat index says how warm shady, light-wind air FEELS to an adult, from air temperature and relative humidity.
  It describes comfort and heat strain. It says nothing about PM2.5 or any other pollutant.
  What it is not. It is not for direct sun (the NWS says full sun can add up to 15 °F), strong wind, children at play or indoors
  with a fan, and it is not a health warning by itself. It is a regression on a physiological model, good to about 1.3 °F.

  The procedure (NWS Weather Prediction Center, "The Heat Index Equation", after Rothfusz 1990 and Steadman 1979). T in °F, RH in %:
    1. simple = 0.5 * (T + 61.0 + 1.2 * (T - 68.0) + 0.094 * RH)
    2. if (simple + T) / 2 is below 80, the heat index is `simple`.
    3. otherwise the Rothfusz regression
         HI = -42.379 + 2.04901523 T + 10.14333127 RH - 0.22475541 T RH - 6.83783e-3 T^2 - 5.481717e-2 RH^2
              + 1.22874e-3 T^2 RH + 8.5282e-4 T RH^2 - 1.99e-6 T^2 RH^2
       with two adjustments:
         RH < 13 % and 80 <= T <= 112 °F : subtract ((13 - RH) / 4) * sqrt((17 - |T - 95|) / 17)
         RH > 85 % and 80 <= T <= 87 °F  : add      ((RH - 85) / 10) * ((87 - T) / 5)

  Where we show a value. The NWS chart covers 80 to 110 °F (26.7 to 43.3 °C) and 40 to 100 % humidity, its largest printed value is
  137 °F, and the NWS says the regression is not valid for extreme conditions beyond that. feelsLike() gives a number only inside
  that box and up to 137.5 °F (58.6 °C). Outside it, it hands back the plain air temperature and a reason, never a made-up value.
  The box is RANGE below, the one place to change it.
  Checked against the printed NWS chart (weather.gov/tsa/heatindex, 135 cells): the regression alone is within 1 °F of every cell.
  The humid adjustment adds up to 2.3 °F at the corner (80 to 82 °F with 95 to 100 % humidity) that the printed chart does not show;
  this file follows the NWS written procedure, and the test says so out loud.
  (pythermalcomfort's heat_index_rothfusz, MIT, uses the same regression in °C and a round 27 °C lower limit; this file was
  written from the NWS description, with that package's source and values used only to cross-check the maths.)
*/
(function () {
  'use strict';

  const RANGE = Object.freeze({ tMinF: 80, tMaxF: 110, rhMin: 40, rhMax: 100, hiMaxF: 137.5 });
  const EPS = 1e-9;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const toF = (c) => (c * 9) / 5 + 32;
  const toC = (f) => ((f - 32) * 5) / 9;

  /** Steadman's simple formula (NWS step 1), °F. */
  function simpleF(tF, rh) {
    return 0.5 * (tF + 61.0 + (tF - 68.0) * 1.2 + rh * 0.094);
  }

  /** The Rothfusz regression alone (NWS step 3, before the adjustments), °F. */
  function regressionF(tF, rh) {
    const T = tF, R = rh;
    return -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 6.83783e-3 * T * T - 5.481717e-2 * R * R
      + 1.22874e-3 * T * T * R + 8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
  }

  /** The signed adjustment the NWS adds to the regression (0 when neither condition holds), °F. */
  function adjustmentF(tF, rh) {
    if (rh < 13 && tF >= 80 && tF <= 112) return -((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tF - 95)) / 17);
    if (rh > 85 && tF >= 80 && tF <= 87) return ((rh - 85) / 10) * ((87 - tF) / 5);
    return 0;
  }

  /** The whole NWS procedure for any finite input, °F, unrounded. Use feelsLike() for anything shown to a person. */
  function heatIndexF(tF, rh) {
    const s = simpleF(tF, rh);
    if ((s + tF) / 2 < 80) return s;
    return regressionF(tF, rh) + adjustmentF(tF, rh);
  }

  /**
   * "Feels like" for an air temperature in °C and a relative humidity in %.
   *   { ok: true,  c, f, tC, rh }            c is the heat index in °C, unrounded (round it for display: it is good to about 1 °C)
   *   { ok: false, c, f, tC, rh, why }       c is the plain air temperature; why is 'cool' (under 80 °F), 'hot' (over 110 °F),
   *                                          'dry' (humidity under 40 %), 'wet' (humidity over 100 %), 'extreme' (the index would be above
   *                                          137.5 °F, beyond the NWS chart) or 'input' (not a number; c is null)
   */
  function feelsLike(tC, rh, range) {
    const R = range || RANGE;
    if (!fin(tC) || !fin(rh) || rh < 0) return { ok: false, why: 'input', c: fin(tC) ? tC : null, f: fin(tC) ? toF(tC) : null, tC: fin(tC) ? tC : null, rh: fin(rh) ? rh : null };
    const tF = toF(tC), plain = { c: tC, f: tF, tC, rh };
    if (tF < R.tMinF - EPS) return Object.assign({ ok: false, why: 'cool' }, plain);
    if (tF > R.tMaxF + EPS) return Object.assign({ ok: false, why: 'hot' }, plain);
    if (rh < R.rhMin - EPS) return Object.assign({ ok: false, why: 'dry' }, plain);
    if (rh > R.rhMax + EPS) return Object.assign({ ok: false, why: 'wet' }, plain);
    const hi = heatIndexF(tF, rh);
    if (hi > R.hiMaxF + EPS) return Object.assign({ ok: false, why: 'extreme' }, plain);
    return { ok: true, c: toC(hi), f: hi, tC, rh };
  }

  const api = { RANGE, toF, toC, simpleF, regressionF, adjustmentF, heatIndexF, feelsLike };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SC = window.SC || {}; window.SC.heatIndex = api; }
})();
