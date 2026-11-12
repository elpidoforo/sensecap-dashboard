'use strict';
/* satellite/feeds/noaa-chlorophyll.js: chlorophyll-a (algae in the sea, from the colour of the water) near the coastal cities.
 * Lefkosia is inland: no sea, nothing asked, read('lefkosia') is always [].
 *
 * Source: NOAA CoastWatch ERDDAP (keyless), https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPVIIRSSQchlaDaily
 *   (the same data is mirrored on coastwatch.pfeg.noaa.gov as nesdisVHNSQchlaDaily, which answers a data request with a redirect to the id above).
 *   "Chlorophyll, NOAA S-NPP VIIRS, Science Quality, Global 4km, Level 3, 2012 to <latest>, Daily" (NOAA/NESDIS STAR ocean colour team).
 *   Variable chlor_a, mg m^-3, _FillValue -999 (ERDDAP shows it as null), valid range 0.001 to 100. dims: time, altitude (one value, 0), latitude
 *   (stored high to low: we write the pair high:low like the dataset; the griddap documentation says ERDDAP swaps a wrong pair, and if it refuses with 400/404/416 anyway lib/erddap.js getBox tries the other order once and remembers it), longitude. 0.0375 degree pixels (about 4 km). Science quality, nominal latency
 *   15 days: on 2026-11-12 the newest day on the server was 2026-11-01. The page was read on 2026-11-12; the service itself is NOT
 *   reachable from the build sandbox, so the request follows the documentation and local fixtures.
 *   NOT used: noaacwNPPN20VIIRSchlociDaily (ends 2021-09), noaacwN20VIIRSchlaWeekly (ends 2025-04), nesdisVHNSQchlaWeekly (ends 2026-08-20),
 *   erdVH3chla8day (discontinued 2017): they are on the same servers but have stopped.
 *
 * Ocean colour is a LEVEL 3 product: clouds leave real holes. So one request asks for the newest 7 daily maps in a small box and the feed
 * takes, for the pixel nearest to the city, its newest clear value (and says which day it is from).
 */

const E = require('../lib/erddap');
const { makeGridFeed } = require('../lib/gridfeed');

// The pfeg server only mirrors this dataset (it redirects the data request to the main CoastWatch ERDDAP, where the dataset has its own id
// noaacwNPPVIIRSSQchlaDaily), so ask the main CoastWatch ERDDAP directly. pfeg stays on the allow list in case a redirect still passes through it.
const HOST = 'coastwatch.noaa.gov';
const OLD_HOST = 'coastwatch.pfeg.noaa.gov';
const DAY = 86400000;
const DS = { dataset: 'noaacwNPPVIIRSSQchlaDaily', value: 'chlor_a', pre: ['last-6:last', '0'], order: { latDesc: true }, halfLat: 0.3, halfLng: 0.3, maxKm: 25, windowMs: 8 * DAY, min: 0.001, max: 100 };

// One city: the nearest pixel with a clear value in the newest few days; its newest clear value. null when the box is all cloud or land.
async function readOne(place, get) {
  const box = E.boxAround(place.lat, place.lng, DS.halfLat, DS.halfLng);
  const json = await E.getBox(get, { host: HOST, dataset: DS.dataset, vars: [DS.value], pre: DS.pre, lat: box.lat, lng: box.lng }, DS.order);
  const { cells } = E.parseGrid(json, [DS.value]);
  if (!cells.length) return null;
  const newest = cells.reduce((m, c) => Math.max(m, c.t), 0);
  const byPixel = new Map();   // pixel -> its newest clear cell (inside the window)
  for (const c of cells) {
    const v = E.cleanNumber(c.v[DS.value]);
    if (v == null || v < DS.min || v > DS.max || newest - c.t > DS.windowMs) continue;
    c.chl = v;
    const key = c.lat + ',' + c.lng, old = byPixel.get(key);
    if (!old || c.t > old.t) byPixel.set(key, c);
  }
  const hit = E.nearestCell([...byPixel.values()], place.lat, place.lng, DS.maxKm);
  if (!hit) return null;
  return { value: Math.round(hit.cell.chl * 1000) / 1000, obsMs: hit.cell.t, km: Math.round(hit.km * 10) / 10 };
}

module.exports = function create(ctx) {
  function toReading(e) {
    const km = E.kmText(e.km), day = E.isoDay(e.obsMs);
    return {
      variable: 'chlorophyll_a', value: e.value, unit: 'mg/m3', time: e.obsMs,
      where: `nearest clear satellite pixel with a chlorophyll value, ${km} km from the city centre (VIIRS ocean colour)`,
      whereEl: `πλησιέστερο καθαρό εικονοστοιχείο δορυφόρου με τιμή χλωροφύλλης, ${km} km από το κέντρο της πόλης (χρώμα ωκεανού VIIRS)`,
      note: `Chlorophyll is the green pigment of tiny sea plants (plankton): more green = more algae/plankton. The satellite sees only the colour of the top few metres, and only through clear sky, so this is the latest clear view (${day}), not today. Near the coast shallow sand and dust in the air can fool it: use it as a hint.`,
      noteEl: `Η χλωροφύλλη είναι η πράσινη χρωστική των μικροσκοπικών φυτών της θάλασσας (πλαγκτόν): περισσότερο πράσινο = περισσότερα φύκια/πλαγκτόν. Ο δορυφόρος βλέπει μόνο το χρώμα των πρώτων μέτρων και μόνο με καθαρό ουρανό, γι’ αυτό είναι η τελευταία καθαρή εικόνα (${day}), όχι η σημερινή. Κοντά στην ακτή η ρηχή άμμος και η σκόνη στον αέρα μπορούν να τον μπερδέψουν: δες το ως ένδειξη.`,
    };
  }

  function probeText({ n, total, newestMs }) {
    if (!n) return { note: 'not available right now · coastal cities only', noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή · μόνο παράκτιες πόλεις' };
    const day = E.isoDay(newestMs);
    return { note: `${n} of ${total} coastal cities · latest clear view ${day} · coastal cities only`, noteEl: `${n} από ${total} παράκτιες πόλεις · τελευταία καθαρή εικόνα ${day} · μόνο παράκτιες πόλεις` };
  }

  return makeGridFeed(ctx, {
    id: 'noaa-chlorophyll', hosts: [HOST, OLD_HOST], label: 'Sea colour (NOAA ERDDAP)', cacheFile: 'chl.json',
    intervalMs: 12 * 3600000, firstDelayMs: 40000, keepMs: 60 * DAY, inland: ['lefkosia'],
    fetchCity: (id, place, get) => readOne(place, get), toReading, probeText,
  });
};
module.exports._t = { DS, readOne };
