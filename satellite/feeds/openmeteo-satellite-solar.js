'use strict';
/* openmeteo-satellite-solar: sunshine on the ground NOW, per city, from the Open-Meteo Satellite Radiation API (DWD product from the EUMETSAT MTG imager
 * over Cyprus). Variable: solar_irradiance (W/m2), the average of the latest hour that has ended.
 * Descriptor: sources/openmeteo-satellite-solar.json. Shared code: satellite/sun/. Notes on what is and is not verified: satellite/sun/openmeteo.js.
 * The sister feed openmeteo-satellite-solar-day reads the same service for the last full day.
 */
const C = require('../sun/common');
const OM = require('../sun/openmeteo');
const { makeStore } = require('../sun/omstore');

const ID = 'openmeteo-satellite-solar';
const STALE = 4 * C.HOUR;   // the same as quality.stale_after in the descriptor

const PANEL_EN = 'For solar panels: this is light that arrives, not the electricity a panel makes (size, angle, dirt, heat and efficiency matter too).';
const PANEL_EL = 'Για τα ηλιακά πάνελ: είναι φως που φτάνει, όχι ρεύμα που παράγεται (μετράνε και το μέγεθος, η γωνία, η βρωμιά, η ζέστη, η απόδοση).';

function create(ctx, opts) {
  const store = makeStore(ctx, opts, { firstMs: 8000, everyMs: 30 * 60000 });
  const latest = (cityId) => {
    const city = store.byId[cityId], c = store.get(cityId);
    return city && c ? OM.latestHour(c, ctx.now(), city) : null;
  };

  function probe() {
    let n = 0, at = 0;
    for (const city of store.cities) { const l = latest(city.id); if (l) { n++; at = Math.max(at, l.time); } }
    if (!n) {
      return store.info().tried
        ? { ok: false, n: 0, at: null, note: 'not available right now', noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή' }
        : { ok: false, n: 0, at: null, note: 'waiting for the first answer', noteEl: 'αναμονή για την πρώτη απάντηση' };
    }
    const old = ctx.now() - at > STALE;
    const hm = C.localHM(at);
    return {
      ok: true, n, at,
      note: old ? 'showing old values: the satellite service has not answered lately' : `${n} of ${store.cities.length} cities, newest hour ended at ${hm} Cyprus time`,
      noteEl: old ? 'δείχνει παλιές τιμές: η δορυφορική υπηρεσία δεν απάντησε πρόσφατα' : `${n} από ${store.cities.length} πόλεις, η νεότερη ώρα έληξε στις ${hm} ώρα Κύπρου`,
    };
  }

  function read(cityId) {
    const city = store.byId[cityId], c = store.get(cityId);
    if (!city || !c) return [];
    const l = OM.latestHour(c, ctx.now(), city);
    if (!l) return [];
    const d = OM.cellKm(c, city), hm = C.localHM(l.time);
    const near = d == null ? '' : `, ${C.numText(d, 1, false)} km from the city centre`;
    const nearEl = d == null ? '' : `, ${C.numText(d, 1, true)} χλμ. από το κέντρο της πόλης`;
    return [{
      variable: 'solar_irradiance', value: Math.round(l.value), unit: 'W/m2', time: l.time,
      where: `satellite pixel about 2.5 km wide${near}`,
      whereEl: `εικονοστοιχείο δορυφόρου περίπου 2,5 χλμ.${nearEl}`,
      note: l.night
        ? `It is night, so the sunlight is 0 W/m2 (hour that ended at ${hm} Cyprus time; the sun is below the horizon). Satellite estimate (DWD, via Open-Meteo) for an area of about 2.5 km. ${PANEL_EN}`
        : `Average sunlight power on level ground in the hour that ended at ${hm} Cyprus time, estimated from the MTG weather satellite (DWD, via Open-Meteo). An area of about 2.5 km, not a sensor at the school. ${PANEL_EN}`,
      noteEl: l.night
        ? `Είναι νύχτα, άρα το ηλιακό φως είναι 0 W/m² (ώρα που έληξε στις ${hm} ώρα Κύπρου· ο ήλιος είναι κάτω από τον ορίζοντα). Εκτίμηση δορυφόρου (DWD, μέσω Open-Meteo) για περιοχή περίπου 2,5 χλμ. ${PANEL_EL}`
        : `Μέση ισχύς του ηλιακού φωτός σε οριζόντιο έδαφος την ώρα που έληξε στις ${hm} ώρα Κύπρου, εκτίμηση από τον δορυφόρο καιρού MTG (DWD, μέσω Open-Meteo). Περιοχή περίπου 2,5 χλμ., όχι αισθητήρας στο σχολείο. ${PANEL_EL}`,
    }];
  }

  return { id: ID, hosts: [OM.HOST], start: () => store.start(), stop: () => store.stop(), probe, read, _store: store };
}

module.exports = create;
module.exports.ID = ID;
module.exports.PANEL_EN = PANEL_EN;
module.exports.PANEL_EL = PANEL_EL;
