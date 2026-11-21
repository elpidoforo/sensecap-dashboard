'use strict';
/* Two small MADE-UP grids (6 x 6) for the pixelgrid tests and screenshots. Demo data: not real buildings.
   Same shape as the answer of /api/stack/buildings. Index 0 is the south-west cell, index 5 the south-east one, index 30 the north-west one. */
const B = (en, el) => [en, el];
const A = [   // rows from the SOUTH (first line) to the NORTH (last line)
  [100, 80, 60, 40, 20, 0],   // south row
  [90, 70, 50, 30, 10, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 5, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 55],   // north row: only the north-east cell is built
];
const Bg = [
  [0, 0, 0, 0, 0, 0],
  [12, 12, 12, 12, 12, 12],
  [24, 24, 24, 24, 24, 24],
  [36, 36, 36, 36, 36, 36],
  [48, 48, 48, 48, 48, 48],
  [60, 60, 60, 60, 60, 60],
];
const feature = (key, en, el, rows) => ({ key, name: B(en, el), centre: { lat: 0, lng: 0 }, available: true, box: {}, fetched: '2026-11-01T00:00:00.000Z', demo: true, buildings: 0, cols: 6, rows: 6, cellMetres: 300, sampleMetres: 10, share: [].concat(...rows), count: new Array(36).fill(0), coveredPercent: 0 });
const head = {
  id: 'buildings', title: B('Built-up ground', 'Δομημένο έδαφος'), demo: true, available: true, refreshSeconds: 86400,
  attribution: '© OpenStreetMap contributors', attributionEl: '© Συντελεστές του OpenStreetMap',
  coverage: B('Four boxes of 1.8 km by 1.8 km around the four city centres. Nothing outside them, and not the island.', 'Τέσσερα πλαίσια 1,8 km επί 1,8 km γύρω από τα τέσσερα κέντρα πόλεων. Τίποτα έξω από αυτά, και όχι όλο το νησί.'),
  grid: B('Each city is a square grid, row by row from the south-west corner (first west to east, then north). share[i] is the percent of the cell under a building footprint.', 'Κάθε πόλη είναι τετράγωνο πλέγμα, γραμμή προς γραμμή από τη νοτιοδυτική γωνία. Το share[i] είναι το ποσοστό του κελιού κάτω από κτίριο.'),
  note: B('Volunteers draw OpenStreetMap, so a building nobody has drawn yet is missing and a cell can look emptier than it is.', 'Το OpenStreetMap το σχεδιάζουν εθελοντές, άρα ένα κτίριο που κανείς δεν σχεδίασε ακόμη λείπει και ένα κελί μπορεί να φαίνεται πιο άδειο απ’ όσο είναι.'),
};
const answer = () => ({ ...head, features: [feature('demoA', 'Demo town A', 'Δοκιμαστική πόλη Α', A), feature('demoB', 'Demo town B', 'Δοκιμαστική πόλη Β', Bg)] });
const empty = () => ({ ...head, demo: false, available: false, features: [], reason: B('No city centre has been fetched from OpenStreetMap yet.', 'Κανένα κέντρο πόλης δεν έχει κατέβει ακόμη από το OpenStreetMap.') });
module.exports = { answer, empty, A, Bg };
