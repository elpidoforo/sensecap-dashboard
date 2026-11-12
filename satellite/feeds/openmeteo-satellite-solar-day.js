'use strict';
/* openmeteo-satellite-solar-day: sunshine energy of the LAST FULL DAY per city, added up from the hourly values of the Open-Meteo Satellite Radiation API
 * (DWD product from the EUMETSAT MTG imager over Cyprus), and how much of the cloud-free sunshine arrived.
 * Variables: solar_energy_day (kWh/m2/day) and solar_clear_sky_share (%). A day counts only when every hour of daylight is present.
 * Descriptor: sources/openmeteo-satellite-solar-day.json. Shared code: satellite/sun/. Notes on what is and is not verified: satellite/sun/openmeteo.js.
 * Why a second feed and not a second variable of openmeteo-satellite-solar: the two values age differently (an hour against a day), and the register
 * judges "late" per source.
 */
const C = require('../sun/common');
const OM = require('../sun/openmeteo');
const { makeStore } = require('../sun/omstore');

const ID = 'openmeteo-satellite-solar-day';
const STALE = 3 * C.DAY;   // the same as quality.stale_after in the descriptor

const PANEL_EN = 'For solar panels: this is light that arrives, not the electricity a panel makes (size, angle, dirt, heat and efficiency matter too).';
const PANEL_EL = 'Για τα ηλιακά πάνελ: είναι φως που φτάνει, όχι ρεύμα που παράγεται (μετράνε και το μέγεθος, η γωνία, η βρωμιά, η ζέστη, η απόδοση).';

function create(ctx, opts) {
  const store = makeStore(ctx, opts, { firstMs: 14000, everyMs: 3 * C.HOUR });
  const lastDay = (cityId) => {
    const city = store.byId[cityId], c = store.get(cityId);
    return city && c ? OM.lastFullDay(c, ctx.now(), city) : null;
  };

  function probe() {
    let n = 0, at = 0;
    for (const city of store.cities) { const d = lastDay(city.id); if (d) { n++; at = Math.max(at, d.endMs); } }
    if (!n) {
      return store.info().tried
        ? { ok: false, n: 0, at: null, note: 'not available right now', noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή' }
        : { ok: false, n: 0, at: null, note: 'waiting for the first answer', noteEl: 'αναμονή για την πρώτη απάντηση' };
    }
    const day = C.ymd(at - C.DAY);
    return {
      ok: true, n, at,
      note: ctx.now() - at > STALE ? 'showing old values: the satellite service has not answered lately' : `${n} of ${store.cities.length} cities, last full day ${C.dayText(day, false)}`,
      noteEl: ctx.now() - at > STALE ? 'δείχνει παλιές τιμές: η δορυφορική υπηρεσία δεν απάντησε πρόσφατα' : `${n} από ${store.cities.length} πόλεις, τελευταία πλήρης μέρα ${C.dayText(day, true)}`,
    };
  }

  function read(cityId) {
    const city = store.byId[cityId], c = store.get(cityId);
    if (!city || !c) return [];
    const d = OM.lastFullDay(c, ctx.now(), city);
    if (!d) return [];
    const km = OM.cellKm(c, city);
    const where = `satellite pixel about 2.5 km wide${km == null ? '' : `, ${C.numText(km, 1, false)} km from the city centre`}`;
    const whereEl = `εικονοστοιχείο δορυφόρου περίπου 2,5 χλμ.${km == null ? '' : `, ${C.numText(km, 1, true)} χλμ. από το κέντρο της πόλης`}`;
    const en = C.dayText(d.date, false), el = C.dayText(d.date, true);
    const out = [{
      variable: 'solar_energy_day', value: d.kwh, unit: 'kW.h/m2/d', time: d.endMs, where, whereEl,
      note: `Sunshine energy that reached level ground on ${en}, added up over the whole day from hourly MTG satellite estimates (DWD, via Open-Meteo). 1 kWh/m2 is like one hour of very strong sun (1000 W/m2). ${PANEL_EN}`,
      noteEl: `Η ενέργεια του ήλιου που έφτασε σε οριζόντιο έδαφος στις ${el}, αθροισμένη όλη τη μέρα από ωριαίες εκτιμήσεις του δορυφόρου MTG (DWD, μέσω Open-Meteo). 1 kWh/m² ισούται με μία ώρα πολύ δυνατού ήλιου (1000 W/m²). ${PANEL_EL}`,
    }];
    if (d.share != null) {
      const p = Math.round(d.share);
      out.push({
        variable: 'solar_clear_sky_share', value: d.share, unit: '%', time: d.endMs, where, whereEl,
        note: p > 100
          ? `On ${en} as much sunshine reached the ground here as a cloud-free sky would give (the two satellite estimates differ a little). This is not the same as cloud cover. DWD, via Open-Meteo.`
          : `On ${en}, about ${p}% of the sunshine a cloud-free sky would have given reached the ground here. Clouds and dust took the rest. This is not the same as cloud cover. Satellite estimate (DWD, via Open-Meteo).`,
        noteEl: p > 100
          ? `Στις ${el} έφτασε στο έδαφος εδώ τόσος ήλιος όσος θα έδινε ουρανός χωρίς σύννεφα (οι δύο δορυφορικές εκτιμήσεις διαφέρουν λίγο). Δεν είναι το ίδιο με την κάλυψη νεφών. DWD, μέσω Open-Meteo.`
          : `Στις ${el}, περίπου το ${p}% του ήλιου που θα έδινε ουρανός χωρίς σύννεφα έφτασε στο έδαφος εδώ. Τα υπόλοιπα τα πήραν τα σύννεφα και η σκόνη. Δεν είναι το ίδιο με την κάλυψη νεφών. Εκτίμηση δορυφόρου (DWD, μέσω Open-Meteo).`,
      });
    }
    return out;
  }

  return { id: ID, hosts: [OM.HOST], start: () => store.start(), stop: () => store.stop(), probe, read, _store: store };
}

module.exports = create;
module.exports.ID = ID;
