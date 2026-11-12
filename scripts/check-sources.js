#!/usr/bin/env node
'use strict';
/* Checks every file in sources/ against sources/_schema.json and the project rules (see sources/README.md).
   Run:  node scripts/check-sources.js          all files
         node scripts/check-sources.js sources/dam-levels.json   one file
   Exit code 1 when a file has an error. A warning (for example "licence is unknown") never fails the check. */
const fs = require('fs');
const path = require('path');
const { loadRegister, checkSource } = require('../layers');

const root = process.env.CHECK_SOURCES_ROOT || path.join(__dirname, '..');   // the env var is for tests, to check a copy of the folder
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const reg = loadRegister(root);
let bad = 0;

for (const p of reg.problems) {
  if (only.length && !only.some((f) => path.basename(f) === p.file)) continue;
  bad++;
  console.log(`FAIL  ${p.file}`);
  for (const e of p.errors) console.log(`        ${e}`);
  for (const w of p.warnings || []) console.log(`        warning: ${w}`);
}
for (const { src, warnings } of reg.layers) {
  if (only.length && !only.some((f) => path.basename(f, '.json') === src.id)) continue;
  console.log(`ok    ${src.id}.json  (${src.layer}, ${src.status}${src.planned ? ', planned' : ''})`);
  for (const w of warnings) console.log(`        warning: ${w}`);
}
// Files named on the command line that the loader did not see (for example a file outside sources/).
for (const f of only) {
  const id = path.basename(f, '.json');
  if (reg.layers.some((l) => l.src.id === id) || reg.problems.some((p) => p.file === path.basename(f))) continue;
  try {
    const r = checkSource(JSON.parse(fs.readFileSync(f, 'utf8')), f, reg);
    if (r.errors.length) { bad++; console.log(`FAIL  ${f}`); r.errors.forEach((e) => console.log(`        ${e}`)); }
    else console.log(`ok    ${f}`);
  } catch (e) { bad++; console.log(`FAIL  ${f}\n        ${e.message}`); }
}
console.log(bad ? `\n${bad} file(s) have errors.` : `\nAll ${reg.layers.length} source files are valid.`);
process.exit(bad ? 1 : 0);
