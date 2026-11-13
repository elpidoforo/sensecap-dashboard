# The context folder: reviewed, frozen data files

Three layers of the **Data layers** page are read from the small files in this folder, not from a live service:

| File | Layer | What it is | From |
| --- | --- | --- | --- |
| `bathing-water-history.json` | Bathing-water quality by year | The yearly quality label of every Cyprus bathing site, 2004 to 2025 (2,468 site-years, 123 sites in 2025) | EEA and DG Environment, release `eea_t_bathing-water-status_p_1990-2025_v01_r00` (2 June 2026), CC BY 4.0 |
| `waste-generation-national.json` | Waste we produce (Cyprus) | Municipal waste generated in 2023 and 2024, national | CYSTAT table 1700010E, retrieved 12 November 2026 |
| `pv-solar-scenarios.json` | Solar panel scenarios | PVGIS 5.3 model: a 1 kWp set, 30 degrees, facing south, 14 % losses, average year of 2005 to 2023, one generic point per city | European Commission, Joint Research Centre |

They were prepared in the research handoff of 13 November 2026. The waste and solar files are that handoff's artifacts byte for byte.
The bathing file was put together from its two artifacts (the 2025 inventory and the 2004 to 2025 labels): site id, name, position,
water type and the full reported label of each season, nothing recalculated.

## Rules the code keeps (`context.js`)

- `manifest.json` holds the SHA-256 of each file. A file that does not match, or that fails a check (an unknown label, a site listed
  twice, months that do not add up to the year, an unknown unit, a missing city row ...), is **not shown**: the layer says "not available".
- The server never fetches a newer file by itself. To publish a new release: prepare the new file, have it reviewed, replace the file
  and its hash in `manifest.json` in one commit, and run `node tests/context/unit_test.js` (update the expected numbers there on purpose).
  The hash catches an accidental change. It does not prove who made the file.
- These layers have a **period**, not a freshness. The page never shows the time the server read the file as the time of the data.
- The master brain never reads them (`x_reads: false` in the three source files): a label, a national total or a modelled energy is
  never compared with a measurement.
- Bathing water: full reported labels, no score, no "improved" count, no safety badge. A season that is not in the release is
  unavailable, not zero. Comparisons count only the sites that are in both seasons.
- Waste: one national number. The four school rows point to it and hold no local value.
- Solar: a model for a generic city point. Never a school roof, never a ranking, no costs. A failed city is empty, not zero.

The bathing sites are also a switchable layer of the big map (`public/map.html`). Not done yet (from the same handoff): freezing
these files into weekly reports (ticket T08), and a refresh job for new releases.
