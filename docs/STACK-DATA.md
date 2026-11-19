# Stack data: what Kleanthis holds, and how each dataset becomes a sheet

Written 19 November 2026 for the 3D data stack (`#/stack`, `public/stack-app.js`). This file is the contract between the data side
(`stackdata.js`, `GET /api/stack/<id>`) and the drawing code. It has three parts:

1. **Inventory**: every dataset the platform holds or the research checkpoint of 19 November 2026 adds, with a verdict.
2. **Payloads**: what `/api/stack/<id>` returns.
3. **Spec for the drawing code**: per sheet, the name, the band, what the motion means, the legend, the caption and the honesty line.

Words used the same way everywhere:

| Word | Meaning |
|---|---|
| **live** | An instrument or a model is read again by the server at least every hour, and the answer says how old it is. |
| **delayed** | Our own vehicles: at least 120 minutes old and rounded to 0.01 degrees (about 1 km). Never current. |
| **scheduled** | Worked out from a timetable for this minute. Nothing was observed. |
| **periodic** | The publisher replaces the file from time to time (weekly timetables, monthly statistics, a monthly OpenStreetMap copy, daily satellite products). |
| **snapshot** | One dated copy of an inventory or of a past period. It does not change. |
| **census** | The count of one day, 1 October 2021. |
| **catalogue** | A list of dated past events. |

A 2021 census, a 2022 drought year and a 2024 air day are **not live** and must never be animated as if something were changing now.

---

## 1. Inventory

64 rows: 48 for what the platform already holds (`sources/*.json`, `fieldwork/*.json`, `context/`, the modules of the server) and 16 for what
the research checkpoint adds (the folder `kleanthis-research/checkpoint/`, outside this repo).

Checkpoint files were verified against its SHA-256 lists before use: `checksums.csv` lists 44 files, 33 are in the folder and all 33
match; `census/sha256.csv` lists 15, 12 are present and all 12 match. The 11 listed files that are **not in the folder** are named in the
rows below (three census tables, the raw permits and tourism JSON, the permits request body, and the `ecage` and `ecair` extracts). The five
files copied into `fieldwork/stack/` are byte for byte the checkpoint's (`earthquakes.geojson`, `age_by_geography_code.csv`,
`mean_age_by_locality.csv`, `municipal_composition.csv`, `permits.csv`); each import script refuses to run when its SHA-256 differs.

Verdicts: **sheet now** (served at `/api/stack/<id>`), **sheet now, elsewhere** (already has a map-ready endpoint or is already drawn by the
stack; not duplicated), **sheet after X**, **cannot be a map sheet**.

### 1.1 Our own sensors

| # | Dataset | Measures (unit) | Geography | Time | Served from | Licence and credit | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Sensor buses (`sensecap-buses`) | Air temperature (°C), humidity (%), CO2 (ppm), PM2.5 (µg/m³), GPS position | Moving points | Live in the server, about every 10 min. For a visitor positions are **delayed** 120 min and rounded to 0.01° | `/api/devices`, `/api/latest`, `/api/trails` (level from `levelOf`), `privacy.js` | Own data; licence id `unknown` in the source file | **Sheet now**: `own-vehicles` (delayed trail only) |
| 2 | Sensor cars (`sensecap-cars`) | Same | Moving points | Same | Same | Same | **Sheet now**: `own-vehicles` (same sheet) |
| 3 | Classroom sensors (`sensecap-classrooms`) | Temperature, humidity, CO2, PM2.5, noise (dB), light (lx), **indoors** | Four school sites, public only as an aggregate per school | Live, about every 10 min | `/cities/api/overview`, `/layers/api/live` | Own data | **Sheet now, elsewhere**: the existing sensors sheet (`island`). Indoor readings: never put next to an outdoor sheet as a comparison |

### 1.2 Official stations and volunteers

| # | Dataset | Measures (unit) | Geography | Time | Served from | Licence and credit | Verdict |
|---|---|---|---|---|---|---|---|
| 4 | Official air-quality stations (`air-quality-stations-cy`) | PM2.5, PM10 hourly means (µg/m³), not yet verified | Station points | Live, download every hour (`eea.js`) | `/api/eea/stations`, `/api/eea/series` | EEA reuse with credit; licence id `unknown` until a teacher reads the factsheet. "European Environment Agency (EEA), Air Quality Download Service…" | **Sheet now**: `air-stations` |
| 5 | Met Office automatic stations (`cydom-stations`) and the saved history | Temperature (°C), humidity (%), wind (m/s, degrees), rain (mm), pressure (hPa), solar (W/m²) | Station points (53 on 19 Nov 2026) | Live, every 10 min; history kept 400 days | `/api/cydom`, `/api/cydom/history` | "Weather Data Copyright The Cyprus Department of Meteorology"; licence id `unknown` | **Sheet now**: `met-stations` |
| 6 | Airport weather, METAR (`metar-airports`) | Temperature (°C), wind (m/s, degrees) | Four airport points | Live, about every 30 min (cache 10 min) | `/api/metar` | NOAA Aviation Weather Center; licence id `unknown` | **Sheet now**: `airports` (weather at the airport, not flights) |
| 7 | Sensor.Community volunteer sensors | PM2.5, PM10 (µg/m³), temperature, humidity | Points at volunteers' homes | Live, every 5 min | `/api/opensensors` | Sensor.Community open data (no source file in `sources/`) | **Sheet after an owner decision**: these are private households' sensors. Already public at `/api/opensensors`, but not added to the stack without the owner saying so |
| 8 | Met Office pages and pictures (warnings, forecasts, radar and satellite pictures) | Text and pictures | Island-wide pictures, no points | Checked every 15 min | `/api/dom/page`, `/api/dom/img` | Department of Meteorology | **Cannot be a map sheet**: text, and pictures without georeferencing |

### 1.3 Models on a grid

| # | Dataset | Measures (unit) | Geography | Time | Served from | Licence and credit | Verdict |
|---|---|---|---|---|---|---|---|
| 9 | Weather model (`openmeteo-weather`) | Temperature, humidity, wind, rain, cloud, pressure | Grid, 60 points at 0.25° | Live model, cache 10 min | `/api/weather` | CC BY 4.0, "Weather data by Open-Meteo.com" | **Sheet now, elsewhere**: wind and rain sheets already read it through `/layers/api/live` (AIR band) |
| 10 | Five-day forecast | Daily forecast | One point (central Cyprus) | Model | `/api/forecast` | CC BY 4.0, Open-Meteo | **Cannot be a map sheet**: one point for the whole island |
| 11 | Air-quality model (`openmeteo-air`) | PM2.5, PM10, dust, ozone (µg/m³), European AQI | Grid, 60 points | Live model, cache 30 min | `/api/air` | CC BY 4.0, "Air quality data by Open-Meteo.com" | **Sheet now, elsewhere** (AIR band). A model: never drawn as a measurement |
| 12 | Sea model (`openmeteo-marine`) | Sea surface temperature (°C), wave height (m) | 10 sea points | Live model, cache 30 min | `/api/sea` | CC BY 4.0, "Marine data by Open-Meteo.com" | **Sheet now, elsewhere** (WATER band, `seabed` sheet) |
| 13 | Terrain | Elevation (m) | Grid 0.05° | One-off | `/api/terrain` | Open-Meteo elevation, CC BY 4.0 | **Sheet now, elsewhere**: the relief under every sheet. Note: `stack-app.js` still draws its own relief |
| 14 | Saved forecasts against reality (`toolkit-forecast.js`) | Forecast, later measurement and later model value per day | Four city points | Once a day | `/api/toolkit/forecast` | Derived from 5 and 9 | **Cannot be a map sheet**: a comparison per city over days; drawn side by side it would rank the cities |

### 1.4 Satellites (`satellite/feeds/`)

All are read for the four city centres only (a value per city), plus pictures. None holds a grid the stack could drape.

| # | Dataset | Measures (unit) | Geography | Time | Served from | Licence and credit | Verdict |
|---|---|---|---|---|---|---|---|
| 15 | `cams-atmosphere` | Aerosol optical depth, UV index, NO2, SO2, CO (µg/m³) | Four city points (model) | Hourly | `/layers/api/live`, `/api/satellite/status` | CC BY 4.0, Open-Meteo / CAMS | Sheet now, elsewhere (AIR band, four points) |
| 16 | `eumetsat-meteosat-view` | Cloud and dust pictures | Picture with a bounding box | Every 15 min | `/api/satellite/images` | EUMETSAT Data Policy; credit line in the source file | Sheet now, elsewhere (SPACE band, `cloud` sheet already drapes it) |
| 17 | `nasa-gibs-imagery` | Daily true-colour pictures | Picture with a bounding box | Daily | `/api/satellite/images` | NASA open data, GIBS acknowledgement | Sheet now, elsewhere (SPACE band, `sat` sheet) |
| 18 | `modis-lst` | Land surface temperature (°C) | Four city points, 1 km pixel | Every 8 days | `/layers/api/live` | CC0, NASA LP DAAC / ORNL DAAC | Sheet after a grid: four points cannot make the `heat` sheet honest |
| 19 | `modis-ndvi` | Greenness (NDVI) | Four city points | Every 16 days | `/layers/api/live` | CC0, NASA | Sheet after a grid (as 18) |
| 20 | `nasa-power-solar` | Solar energy of a day (kWh/m²/day), cloud (%) | Four city points, about 50 km cells | Daily, with a lag | `/layers/api/live` | CC BY 4.0, NASA POWER | Cannot be a map sheet: four cells this wide are one number per region |
| 21 | `noaa-sst` | Sea surface temperature (°C) | Three coastal points | Daily | `/layers/api/live` | JPL PO.DAAC data policy | Sheet now, elsewhere (WATER band) |
| 22 | `noaa-chlorophyll` | Chlorophyll-a (mg/m³) | Three coastal points | Daily | `/layers/api/live` | NOAA / NASA data policy | Sheet now, elsewhere (WATER band) |
| 23 | `openmeteo-satellite-solar` | Solar irradiance now (W/m²) | Four city points | Hourly | `/layers/api/live` | CC BY 4.0, Open-Meteo | Sheet now, elsewhere (SPACE band, four points) |
| 24 | `openmeteo-satellite-solar-day` | Solar energy of the last full day | Four city points | Daily | `/layers/api/live` | CC BY 4.0, Open-Meteo | As 23 |
| 25 | `fire-hotspots` (NASA FIRMS) | Heat detections of the last 24 h | Points, 375 m to 1 km pixels | Every 30 min **when a free key is set**; planned, never run against NASA | new: `satellite.points()` | NASA open data, "Fire data: NASA FIRMS… Not endorsed by NASA" | **Sheet now**: `fire-hotspots` (empty with a reason until `FIRMS_MAP_KEY` is set) |
| 26 | `effis-burnt-areas` | Burnt area (ha) of perimeters updated in the last 30 days | Points (the middle of each perimeter; outlines are not kept) | Every 6 h; planned, address never confirmed | new: `satellite.points()` | CC BY 4.0, EFFIS / Copernicus EMS / JRC | **Sheet now**: `burnt-areas` (empty with a reason until the feed answers) |
| 27 | `tropomi-air` | NO2, CO, O3, SO2 columns | Four city points | Daily; planned, needs a key | not connected | Copernicus Sentinel data | Sheet after the key and a grid |
| 28 | `copernicus-marine-sst-med`, `land-surface-heat`, `modis-aerosol` | Sea temperature; land temperature; aerosol | Candidates | Not connected | none | Copernicus Marine; Copernicus Sentinel; CC0 | Sheet after they are connected (three candidates, one row) |

### 1.5 Context and the city

| # | Dataset | Measures (unit) | Geography | Time | Served from | Licence and credit | Verdict |
|---|---|---|---|---|---|---|---|
| 29 | Bus timetables, static GTFS (`gtfs-public-transport`) | Stops, lines, planned times | Points and lines (5,700 stops and 658 lines on 19 Nov 2026) | Periodic: each of seven zips is checked every 7 days | `/api/transit/*` | CC BY 4.0, Cyprus National Access Point (traffic4cyprus.org.cy), Public Works Department | **Sheet now**: `bus-network` and `bus-now` (scheduled) |
| 30 | GTFS-Realtime | Observed bus positions | Moving points | Would be live | **Not connected, on purpose** (`gtfs.js`: plain HTTP on a bare address, and it could show our own buses) | — | Sheet after an owner decision on privacy and a safe address |
| 31 | City-centre buildings and streets (`city-buildings.js`) | Building footprints, streets, coastline | Polygons and lines in four boxes of 1.8 km | Periodic: a copy kept 30 days | `/api/city/<id>` | ODbL 1.0, © OpenStreetMap contributors | **Sheet now**: `buildings` (four boxes, not the island) |
| 32 | Bathing-water quality (`bathing-water-history`) | Quality label of a season | 123 site points | Yearly, seasons 2004 to 2025 | `/layers/api/context/bathing-water-history`, `context.js` | CC BY 4.0, EEA and DG Environment | **Sheet now**: `bathing-water` |
| 33 | Solar panel scenarios (`pv-solar-scenarios`) | Modelled yearly energy of 1 kWp (kWh) | Four generic city points | Static, average year 2005 to 2023 | `context.js` | PVGIS, JRC | **Cannot be a map sheet**: four modelled numbers side by side would read as a ranking of cities |
| 34 | Waste generated (`waste-generation-national`) | Municipal waste (thousand tonnes) | **National only** | Yearly, 2023 and 2024 | `context.js` | © Republic of Cyprus, Statistical Service | **Cannot be a map sheet**: one national number, no place to draw it |
| 35 | Dam levels (`dam-levels`), electricity and renewables (`electricity-renewables`), green space (`osm-green-space`) | Fill (%); share (%); share (%) | Candidates | Not connected | none | unknown; unknown; ODbL | Sheet after they are connected (three candidates, one row) |

### 1.6 The thirteen investigations (`fieldwork/*.json`, `/api/fieldwork/<name>`)

| # | Dataset | Measures (unit) | Geography | Time | Licence and credit | Verdict |
|---|---|---|---|---|---|---|
| 36 | Reservoir storage (`reservoir`) | Stored water (million m³) at Kouris, Lefkara, Asprokremmos | Three reservoirs, **no coordinates in the repo** | Snapshot, 1988 to 15 Aug 2022 | CC BY 4.0, Water Development Department | **Sheet after** the coordinates of the three dams from a cited source are added to the extract |
| 37 | Weather history (`weather`) | Monthly mean of daily maximum (°C) | Eight stations, **no coordinates in the extract** | Snapshot, 2010 to 2025 | CC BY 4.0, Department of Meteorology | Sheet after station coordinates are added (AIR band) |
| 38 | Seabed profiles (`coast`) | Seabed elevation (m) | Three lines of 13 points | Snapshot of a static model | CC BY 4.0, EMODnet Bathymetry Consortium | **Sheet now**: `seabed-profiles` |
| 39 | Pedestrian crossings (`crossings`) | Signal-controlled crossings | 384 points | Snapshot, published 15 Nov 2026 | CC BY 4.0, Public Works Department via CyNAP | **Sheet now**: `crossings` |
| 40 | Municipal population (`census`) | Residents by age group | Four municipalities | Census, 1 Oct 2021 | CYSTAT reuse terms | **Sheet now**: inside `population` and `age` (the same four numbers, from row 52) |
| 41 | EV charging points (`ev`) | Charging points, connectors | 171 points (100 different places) | Snapshot, published 15 Nov 2026 | CC BY 4.0, Department of Electrical and Mechanical Services via CyNAP | **Sheet now**: `ev-charging` |
| 42 | Electricity by fuel (`power`) | Net generation (GWh) | **National only** | Monthly, Jan 2025 to Aug 2026 | Eurostat reuse with the source named | **Cannot be a map sheet**: national only |
| 43 | Flood scenarios by river reach (`flood`) | Scenario polygons touching a reach (count) | 38 reaches as lines | Snapshot (scenarios edited Jan 2024) | CC BY 4.0, Water Development Department | **Sheet now**: `flood-reaches` |
| 44 | Agricultural drought (`drought`) | Combined Drought Indicator class | Four grid cells of 1/24° | Snapshot, 36 ten-day periods of 2022 | CC BY 4.0, European Drought Observatory, JRC | **Sheet now**: `drought` |
| 45 | Aerosol optical depth (`aeronet`) | AOD at 500 nm, daily mean | Two sites | Snapshot, July 2022 | Public domain with the AERONET acknowledgement | **Sheet now**: `aerosol-sites` |
| 46 | Hourly air pollution (`gases`) | NO2, O3 (µg/m³) | 11 stations | Snapshot, one day: 15 May 2024 | CC BY 4.0, Department of Labour Inspection | **Sheet now**: `air-day` |
| 47 | Verified hourly NO2 (`verifiedno2`) | NO2 (µg/m³) | Three stations (the same places as row 46) | Snapshot, 15 May 2024 | CC BY 4.0, EEA | **Cannot be its own sheet**: the same day and places as `air-day`; two versions of one number side by side belong on a chart |
| 48 | Arakapas fire maps (`arakapas`) | Mapped burnt area (ha) on two days | One fire, **no geometry in the extract** (only the totals) | Snapshot, 4 and 5 July 2021 | Copernicus EMS terms, © 2021 European Union | Sheet after the perimeter vectors (linked in the extract, with their SHA-256) are imported |

### 1.7 What the checkpoint of 19 November 2026 adds

| # | Dataset | Measures (unit) | Geography | Time | In the repo now | Licence and credit | Verdict |
|---|---|---|---|---|---|---|---|
| 49 | Earthquakes, USGS ComCat | Magnitude (with type), depth (km), UTC time | 14 points, M ≥ 4.5, 34–36° N, 32–35° E | Catalogue, 2015 to 19 Nov 2026 | `fieldwork/stack/earthquakes.json` | Public domain; "US Geological Survey, ANSS Comprehensive Earthquake Catalog" | **Sheet now**: `earthquakes` |
| 50 | USGS weekly feed (4.5+, past 7 days) | Same | Same box | Would be live (poll every 5 min) | Not wired | Same | Sheet after it is wired with a mock path. The one check in the checkpoint found 0 matching events of 107 |
| 51 | Building permits, CYSTAT 1440010E | Permits, floor area (m²), value (thousand EUR), dwelling units | Five reporting districts, urban and rural | Periodic, monthly, Jan 2015 to Jul 2026 | `fieldwork/stack/permits.json` | © Republic of Cyprus, Statistical Service; reshaped by Kleanthis | **Sheet now**: `permits` (see 2.3 on the district outlines) |
| 52 | Census: residents by age for every reporting area (predefined 47) and mean age (predefined 48) | Residents; mean age (years) | 5 districts, 396 municipalities and communities, 99 quarters. **No shapes, no coordinates** | Census, 1 Oct 2021 | `fieldwork/stack/census-localities.json` | CYSTAT reuse terms | **Sheet now**: `population`, `age` (four placed municipalities, five districts; 392 areas listed without a place) |
| 53 | Census: housing and households by locality | Housing units, households | Same areas | Census | Not imported | CYSTAT | Sheet after the boundary file of row 52's unlock. "Vacant or temporary use" is one combined category: not "empty homes" |
| 54 | Census: household size by municipality | Households by size, average size | Municipalities | Census | Not imported | CYSTAT | Sheet after the boundary file |
| 55 | Census: age by postal code | Residents by age band | Postal areas | Census | Not imported | CYSTAT | Sheet after a postal-area boundary source (the checkpoint says they need a separate one) |
| 56 | Census: education, labour status, economic activity by municipality | Counts | Municipalities | Census | **Listed in the checksum files, not in the folder** | CYSTAT | Sheet after the files and the boundary file. Economic activity is by place of residence, not jobs in the municipality |
| 57 | Nights at tourist accommodation, Eurostat `tour_occ_nim` | Nights (number), domestic and foreign | **National only** (geo CY) | Monthly, Jan 2015 to Jul 2026 | Not imported | Eurostat reuse | **Cannot be a map sheet**: national only, no place to draw the nights |
| 58 | Port freight, Eurostat `mar_go_qm_cy` | Gross weight (thousand tonnes) by cargo and direction | Five named ports, **no coordinates** | Quarterly, 2015 Q1 to 2026 Q1 (Moni ends 2017 Q1) | Not imported | Eurostat reuse | Sheet after port coordinates from a cited source |
| 59 | Vessel arrivals by port, Eurostat `mar_tf_qm` | Arrivals (count) | Larnaka and Lemesos ports, no coordinates | Quarterly | Not imported | Eurostat reuse | Sheet after port coordinates |
| 60 | Vessel traffic, national, `mar_tf_qm` | Count, gross tonnes | **National only** | Quarterly | Not imported | Eurostat | **Cannot be a map sheet**: national only |
| 61 | Population by age, Eurostat `demo_pjan` | Residents on 1 January | **National only** | Yearly, 2015 to 2025 | **Listed, not in the folder** | Eurostat | **Cannot be a map sheet**: national only |
| 62 | Traffic by airport pair, Eurostat `avia_par_cy` | Passengers, seats, flights | Airport pairs (lines to other countries) | Monthly and quarterly, 2024 | **Listed, not in the folder** | Eurostat | Sheet after the file is supplied; lines would leave the island picture |
| 63 | Municipal composition after the reform | Which 2021 areas form each of the four municipalities since 1 July 2024 | Four municipalities | One-off | Inside `census-localities.json` | Ministry of Interior evidence linked per row | Not a sheet of its own: it is the `recast2024` part of `population` and `age` |
| 64 | Tourism accommodation by area (Deputy Ministry of Tourism, 2025) | Not retrieved | Areas | — | Not retrieved (open research item) | — | Sheet after the table is retrieved and its areas are checked against the cities |

### 1.8 Headline numbers

- **64 datasets** in the inventory (rows 1 to 64; three rows group candidates that are not connected).
- **33 can be sheets now.** 21 rows are served through `/api/stack` (rows 1, 2, 4, 5, 6, 25, 26, 29, 31, 32, 38, 39, 40, 41, 43, 44, 45, 46,
  49, 51, 52), which makes **21 sheet ids**: the timetables give two sheets and the census two, while rows 1 and 2 share one and rows 40 and
  52 share the census sheets. 12 more rows are already drawn or already have a map-ready endpoint elsewhere (rows 3, 9, 11, 12, 13, 15, 16,
  17, 21, 22, 23, 24).
- **19 wait for something named in their row** (rows 7, 18, 19, 27, 28, 30, 35, 36, 37, 48, 50, 53, 54, 55, 56, 58, 59, 62, 64): mostly
  coordinates, a coded boundary file, a key or an owner decision.
- **11 cannot be a map sheet** (rows 8, 10, 14, 20, 33, 34, 42, 47, 57, 60, 61): national-only numbers, text, one point for the island, or a
  comparison that would rank cities. Row 63 is not a sheet of its own; it is part of `population` and `age`.
- **13 are live in the server today** (rows 1 to 7, 9, 11, 12, 15, 16, 23), and fire hotspots (row 25) become live once a key is set. Of the
  21 `/api/stack` sheets, **4 are live** (`fire-hotspots`, `air-stations`, `met-stations`, `airports`), 1 is delayed (`own-vehicles`), 1 is
  scheduled (`bus-now`), 4 are periodic (`buildings`, `bus-network`, `burnt-areas`, `permits`), 2 are census, 1 is a catalogue and 8 are
  snapshots.

---

## 2. Payloads: `GET /api/stack` and `GET /api/stack/<id>`

`stackdata.js` fetches nothing. Every answer is built from what another module already holds (its cache or its saved file) or from a frozen
copy in the repo. A known id always answers 200; when the data is not there the answer says `available: false` with a `reason` in both
languages and empty lists.

### 2.1 The head every answer carries

```
id, title: [en, el], band, unit, kind, live, refreshSeconds (null when it never changes), geometry,
period (what the numbers are about) or updated (when the newest value is from), retrieved (frozen copies),
source: [en, el], sourceUrl, licence, licenceUrl, attribution, attributionEl,
honesty: [en, el]   the one line the key must show, word for word
note: [en, el]      how the numbers were made and what they do not say
demo                true when the VALUES are made up by the test mode
available, reason: [en, el] when not available
coordinates: "lat,lng"   every pair in every answer is latitude first
generated           when this answer was built (not the time of the data)
```

`demo` is about the values, not the server mode: a frozen copy of a published file (the census, the earthquakes) is real with `DEMO=1` too and
says `demo: false`; trails, weather stations, buildings and timetables that the test mode makes up say `demo: true`.

Rules: no invented value; missing is `null` with a reason and zero stays zero; a total is never in the same list as its parts; lists are in a
fixed order (menu order, date order, publisher order), never sorted by value; nothing about a person; no indoor reading in any sheet.

### 2.2 The sheets

| id | kind | live | geometry | What comes back | Kept for |
|---|---|---|---|---|---|
| `population` | census | no | points | `features` (4 municipalities at their city centre, with `recast2024`), `districts` (5, at the centre of their main town, with `polygon`), `districtsWithoutData`, `unplaced` (392 rows without a place), `total`, `density` (not available, with reason and unlock), `vintage` | hours |
| `age` | census | no | points | Same geography; `meanAge`, `under15Percent`, `age15to64Percent`, `age65plusPercent`, `counts`; `ageFloor: 50` | hours |
| `buildings` | periodic | no | grid | `features`: 4 cities, each `cols: 18, rows: 18, cellMetres: 100, share[324]` (percent of the cell under a footprint), `count[324]`, `box` | 60 s |
| `bus-network` | periodic | no | lines | `feeds`, `lines` (`line: [lat, lng, …]`, `drawn: shape or stops`), `stops.points` | 10 min |
| `bus-now` | **scheduled** | no | points | `at`, `cyprusTime`, `dayType`, `lines`, `trips` (`lat`, `lng`, `path: [[seconds from at, lat, lng], …]`), `counts`, `feeds` | 45 s |
| `own-vehicles` | **delayed** | no | lines | `delayMinutes`, `gridDegrees`, `vehicles: [{ n, type, points, from, to, trail: [[unix seconds, lat, lng], …] }]` | 60 s |
| `earthquakes` | catalogue | no | points | `features`: 14 events, `time` (UTC), `depthKm`, `magnitude`, `magnitudeType`, `place`, `url` | hours |
| `ev-charging` | snapshot | no | points | 171 `features`: `current` (AC or DC), `connectors`, `operator`, `name` | hours |
| `crossings` | snapshot | no | points | 384 `features`: `near` (city centre within 5 km, or null) | hours |
| `flood-reaches` | snapshot | no | lines | 38 `features`: `lines`, `polygons: { q20, q100, q500, climate2080 }` | hours |
| `fire-hotspots` | live (30 min) | yes | points | `features`: `seen`, `satellites`; `windowHours: 24` | 60 s |
| `burnt-areas` | periodic (6 h) | no | points | `features`: `hectares`, `firstSeen`, `lastUpdate` | 60 s |
| `air-stations` | live (hourly) | yes | points | `features`: `pm25`, `pm25HourEnds`, `pm10`, `pm10HourEnds`, `stationType` | 60 s |
| `met-stations` | live (10 min) | yes | points | `features`: `temp`, `humidity`, `wind`, `windFrom`, `rain10min`, `rain24h`, `time` | 60 s |
| `airports` | live (30 min) | yes | points | `features`: `temp`, `wind`, `windFrom`, `time` | 60 s |
| `permits` | periodic (monthly) | no | districts | `features`: 5 districts with `total`, `urban`, `rural` for July 2026; `reportingTotal`; `annotation` (July 2024); `months`, `permitsByMonth` | hours |
| `air-day` | snapshot | no | points | 11 stations, `hours[24]`, `no2[24]`, `o3[24]` for 15 May 2024 | hours |
| `drought` | snapshot | no | points | 4 cells, `periods[36]`, `classes[36]`, `classes` labels | hours |
| `bathing-water` | snapshot | no | points | 123 sites with the `label` of the 2025 season | hours |
| `seabed-profiles` | snapshot | no | lines | 3 profiles of 13 points: `km`, `elevation`, `interpolated` | hours |
| `aerosol-sites` | snapshot | no | points | 2 sites, `days[]`, `aod[]` for July 2022 | hours |

### 2.3 Boundaries and density: what the repo really has

**What exists.** One file, `public/site/island.js`: `ISLAND.districts` has **six keys** (`kyrenia`, `paphos`, `larnaca`, `famagusta`, `nicosia`,
`limassol`). Each value is an SVG path of many closed rings: **618 rings in all** (47, 125, 59, 101, 174, 112), which tile each district and
look like municipality and community outlines. **No ring has a name or a code.** The file came into the repo in one commit ("WIP: merged Smart
Cities site") with no generating script; `THIRD_PARTY_NOTICES.md` does not mention it, and the pages that use it call it "our own rule, not an
official boundary". **Source, date and licence are not recorded.** The 2021 census files say plainly: "No map polygons are included".

**Areas, for the record.** Computed from the rings on the sphere (an equal-area basis), the six groups come to 640, 1,396, 1,123, 1,985, 2,715
and 1,395 km², 9,254 km² together. They are the six whole districts, including the parts the census does not cover.

**Join rate.**

- Municipality and community level: **0 of 396** census areas can be joined to a shape (the rings carry nothing to join on).
- District level: **5 of 5** census districts join to a district key by a hand-written table (Lefkosia → `nicosia`, Ammochostos → `famagusta`,
  Larnaka → `larnaca`, Lemesos → `limassol`, Pafos → `paphos`). `kyrenia` has no census figure (the census covers the government-controlled
  areas). But three of the five outlines (`nicosia`, `famagusta`, `larnaca`) reach beyond the area the census covers, so residents divided by
  the area of the outline would be wrong, and the outlines have no recorded source.
- Mean age: **501 of 501** rows join to a census code by the exact published label (no label is used twice).

**So density is not served.** `population.density` says `available: false`, why, and what would unlock it: a boundary file of the 2021
municipalities and communities **with the CYSTAT code of each**, its licence and credit line, plus the line of the government-controlled area.
With that, area comes from the shape on an equal-area basis and density is residents per km². Nothing else in this file needs to change.

**Where the circles stand instead.** The four municipalities stand at the city centres the site already uses (`city-buildings.js` `CITIES`).
The five districts stand at the centre of their main town (the same four centres, and Paralimni from `ISLAND.stations` for Ammochostos), not
at the middle of their outline, because that middle can lie outside the area the numbers cover. The other 392 areas are listed with their
numbers and no place.

**Vintage.** The numbers use the municipalities and communities **as they existed on census day, 1 October 2021**, before the reform of
1 July 2024. Each of the four municipalities also carries `recast2024`: the 2021 residents of the areas that form it since the reform
(Lefkosia 111,433; Larnaka 68,202; Lemesos 123,947; Pafos unchanged at 37,991). That is not the population of 2024. The outlines have no
recorded vintage.

**Small places.** A place with fewer than 50 residents keeps its count but has no age figures (70 of the 396). The smallest places have one
to three residents, and an average age of three people is about those people.

### 2.4 What was not faked, and what unlocks it

| Not served | Why | What unlocks it |
|---|---|---|
| Density (residents per km²) | No shape joins to a census area; the outlines have no source or licence | A coded boundary file with a licence (see 2.3) |
| A place for 392 municipalities and communities | The repo has no coordinates for them | The same file (or a centroid list with CYSTAT codes) |
| Mean age of the recast municipalities | CYSTAT published none; a mean of means is not computed | A published figure |
| Observed buses | The real-time feed is not connected | An owner decision (it could show our own buses) and a safe address |
| Scheduled buses in the default test mode | Timetable downloads are off in test mode and no saved copy exists here | Nothing to do in production; a test passes its own zip (as `tests/stackdata/api_test.js` does) |
| Fire hotspots | The feed needs a free NASA key | `FIRMS_MAP_KEY` |
| Burnt-area outlines | The feed keeps the middle and the area of a perimeter only | Keeping the rings in `satellite/fire/effis.js` |
| Reservoirs, weather-history stations, ports | Real values, no coordinates in the repo | Coordinates from a cited source in each extract |
| A live earthquake feed | The weekly USGS feed is not wired | A fetcher on an existing pattern with a mock path |
| Tourist nights, national electricity, waste, national vessel traffic | National only | Nothing: they belong on a chart, not a map |

---

## 3. Spec for the drawing code

General rules for every sheet:

- Show the `honesty` line in the key exactly as it comes, in the page's language. Show `attribution` (or `attributionEl`) with the sheet.
- When `available` is false, show the sheet as empty with its `reason`. Never draw placeholder data.
- When `demo` is true, label the sheet "Demo data" / "Δοκιμαστικά δεδομένα".
- **Only `live`, `delayed` and `scheduled` sheets may move continuously.** A sheet that is not one of these may reveal itself once when it is
  opened and must then stand still. No pulsing, breathing, shimmer or drifting on a census, a snapshot or a catalogue: motion says "this is
  changing now".
- Ask again after `refreshSeconds`; never more often.
- Do not sort or rank cities or schools by a value. A reveal "in order of value" is allowed on opening where the table says so.
- Circles grow with the value **by area**, not by radius.

### `population`

| | |
|---|---|
| Sheet name | Residents / Κάτοικοι |
| Band | CITY |
| Motion | **None.** On opening, the circles may appear one after another in order of residents, then stand still. No breathing. |
| Draw | One level at a time: the four `features`, or the five `districts`. Never both, never added. `unplaced` is a count in the key ("392 more places have no position yet"), not points. |
| Legend | Circle area = residents on 1 October 2021. Give two or three reference sizes (for example 25,000 / 50,000 / 100,000 residents). |
| Caption | Residents counted in the 2021 census, by municipality as it was on census day. / Κάτοικοι που μετρήθηκαν στην απογραφή του 2021, ανά δήμο όπως ήταν την ημέρα της απογραφής. |
| Honesty line | **Census of 1 October 2021 — not live** / **Απογραφή 1ης Οκτωβρίου 2021 — όχι ζωντανά δεδομένα** |
| Also say | Density is not available yet (`density.reason`). The 2024 figure, if shown, is "2021 residents in the 2024 boundaries", never "2024 population". |

### `age`

| | |
|---|---|
| Sheet name | Age of residents / Ηλικία κατοίκων |
| Band | CITY |
| Motion | **None.** On opening, a reveal in order of mean age is allowed; then still. |
| Draw | The same points as `population`. Colour by `meanAge` (years), or split a marker into the three shares. A place with `meanAge: null` is drawn hollow with "too few residents" / "πολύ λίγοι κάτοικοι". |
| Legend | Mean age in years (the four cities span 38.3 to 42.6; all districts together 40.5). Shares in % of residents: under 15, 15 to 64, 65 and over. |
| Caption | Mean age and age groups of residents in the 2021 census. / Μέση ηλικία και ηλικιακές ομάδες των κατοίκων στην απογραφή του 2021. |
| Honesty line | **Census of 1 October 2021 — not live** / **Απογραφή 1ης Οκτωβρίου 2021 — όχι ζωντανά δεδομένα** |

### `buildings`

| | |
|---|---|
| Sheet name | Built-up ground / Δομημένο έδαφος |
| Band | CITY |
| Motion | **None.** On opening, cells may rise in order of share, then stand still. |
| Draw | Four small grids of 18 by 18 cells (100 m), each at its `box`. Cell `i` is column `i % 18` from the west and row `floor(i / 18)` from the south. On the island view the four boxes are tiny: draw them at their true size and let the camera fly in, never stretch them over the island. |
| Legend | % of the cell's ground under a building footprint, 0 to 100. Optionally `count`: buildings whose middle is in the cell. |
| Caption | How much of each 100 m square is covered by buildings, in four city centres. / Πόσο από κάθε τετράγωνο 100 m καλύπτεται από κτίρια, σε τέσσερα κέντρα πόλεων. |
| Honesty line | **Four city centres of 1.8 km only, from OpenStreetMap — not the island** / **Μόνο τέσσερα κέντρα πόλεων του 1,8 km, από το OpenStreetMap — όχι όλο το νησί** |
| Credit | © OpenStreetMap contributors (ODbL), always visible with the sheet. |

### `bus-network`

| | |
|---|---|
| Sheet name | Bus lines and stops / Γραμμές και στάσεις λεωφορείων |
| Band | CITY |
| Motion | **None** on this sheet. Lines may draw themselves once on opening. |
| Draw | `lines[].line` as polylines; a line with `drawn: "stops"` is dashed (straight from stop to stop, not the road). `stops.points` as small dots. |
| Legend | Solid line: the route as drawn in the timetable file. Dashed: straight between stops. Dot: a stop. |
| Caption | The bus lines and stops of the official timetables. / Οι γραμμές και οι στάσεις των επίσημων δρομολογίων. |
| Honesty line | **Official timetable files — lines and stops, no buses** / **Επίσημα αρχεία δρομολογίων — γραμμές και στάσεις, όχι λεωφορεία** |

### `bus-now`

| | |
|---|---|
| Sheet name | Buses by the timetable / Λεωφορεία σύμφωνα με το δρομολόγιο |
| Band | CITY |
| Motion | **Each bus moves along its `path` at timetable pace**, in real seconds: at `at + s` seconds it is at the point of the path with that offset, straight between two stops. When it reaches the last point of its path, ask again (every 45 s is enough). A bus that reaches its last stop disappears. Never speed it up, never add jitter, and never draw a trail behind it (a trail says "it was seen there"). |
| Draw | A plain marker per trip, the same for every bus; its line name from `lines[trip.line]`. Use a hollow or outlined marker so it cannot be mistaken for a measured position. |
| Legend | One marker = one planned trip that should be on the road at this minute. `counts.running` of them; `counts.shown` drawn. |
| Caption | Where each bus should be right now if it runs exactly on time. / Πού θα έπρεπε να είναι κάθε λεωφορείο τώρα, αν πηγαίνει ακριβώς στην ώρα του. |
| Honesty line | **Timetable, not observed buses** / **Δρομολόγιο, όχι λεωφορεία που παρατηρήθηκαν** |
| Also say | Day type and Cyprus time from the answer ("weekday, 14:05"). Public holidays and cancelled trips are not taken into account. |

### `own-vehicles`

| | |
|---|---|
| Sheet name | Our sensor vehicles / Τα οχήματα με τους αισθητήρες μας |
| Band | CITY |
| Motion | **Replay of the delayed trail.** Play each `trail` in time order as a loop over the window (`from` to `to`), faster than real time, with a visible clock that shows the time of the replay, which is always at least two hours ago. Jump from grid point to grid point or ease between them; a silence of more than 45 minutes between two points is a gap: fade out and in, do not draw a line across it. |
| Draw | A marker per vehicle, `type` as icon (bus, car, vehicle). No label, no name, no school. Points sit on a 0.01° grid: draw them as about 1 km squares or soft blobs, never as pins. |
| Legend | Square = about 1 km. Clock = the time being replayed. |
| Caption | Where our sensor vehicles were, at least two hours ago, to the nearest kilometre. / Πού ήταν τα οχήματα με τους αισθητήρες μας, τουλάχιστον δύο ώρες πριν, με ακρίβεια ενός χιλιομέτρου. |
| Honesty line | **About two hours late and rounded to 1 km** / **Περίπου δύο ώρες αργότερα και στρογγυλεμένα στο 1 km** (the answer builds this line from the server's settings; use `honesty` as it comes) |
| Never | Never show "now", never extrapolate past the last point, never join this sheet with `bus-now` in one marker set. |

### `earthquakes`

| | |
|---|---|
| Sheet name | Earthquakes since 2015 / Σεισμοί από το 2015 |
| Band | GROUND |
| Motion | **One ripple per event, once, in date order** when the sheet is opened (the list is already oldest first); ring size by magnitude. Then every event stays as a still ring. The five events of 12 and 13 November 2025 come close together: let them overlap rather than spreading them out. No repeat, no pulsing afterwards. |
| Draw | Ring at `lat`, `lng`; radius from `magnitude`; depth as colour or as a stem below the sheet (`depthKm`). Label on focus: date (UTC), magnitude with its type, depth, `place`. |
| Legend | Ring size = magnitude 4.5 to 5.3 (say the type: mb or mww). Colour or stem = depth in km (10 to 63). |
| Caption | Earthquakes of magnitude 4.5 and above around Cyprus since 2015. / Σεισμοί μεγέθους 4,5 και πάνω γύρω από την Κύπρο από το 2015. |
| Honesty line | **Past earthquakes of magnitude 4.5 and above, 2015 to 19 November 2026 — a list, not a live feed** / **Σεισμοί μεγέθους 4,5 και πάνω, 2015 έως 19 Νοεμβρίου 2026 — κατάλογος, όχι ζωντανή ροή** |
| Credit | US Geological Survey, ANSS Comprehensive Earthquake Catalog. |

### `ev-charging`

| | |
|---|---|
| Sheet name | EV charging points / Σημεία φόρτισης ηλεκτρικών οχημάτων |
| Band | CITY |
| Motion | **None.** Points may appear once on opening. |
| Legend | Dot = a charging point; two marks for AC and DC; size by `connectors` (1 to several) if wanted. Several records can share one place. |
| Caption | Public charging points in the national inventory. / Δημόσια σημεία φόρτισης στον εθνικό κατάλογο. |
| Honesty line | **Inventory published 15 November 2026 — it does not say whether a charger is free or working** / **Κατάλογος που δημοσιεύτηκε στις 15 Νοεμβρίου 2026 — δεν λέει αν ένας φορτιστής είναι ελεύθερος ή αν δουλεύει** |

### `crossings`

| | |
|---|---|
| Sheet name | Pedestrian crossings with signals / Διαβάσεις πεζών με φωτεινό σηματοδότη |
| Band | CITY |
| Motion | **None.** |
| Legend | Dot = one signal-controlled crossing in the published inventory. |
| Caption | Signal-controlled pedestrian crossings in the published inventory. / Διαβάσεις πεζών με σηματοδότη στον δημοσιευμένο κατάλογο. |
| Honesty line | **Inventory published 15 November 2026 — signal-controlled crossings only, not a measure of safety** / **Κατάλογος που δημοσιεύτηκε στις 15 Νοεμβρίου 2026 — μόνο διαβάσεις με σηματοδότη, όχι μέτρο ασφάλειας** |

### `flood-reaches`

| | |
|---|---|
| Sheet name | River reaches with flood scenarios / Τμήματα ποταμών με σενάρια πλημμύρας |
| Band | WATER |
| Motion | **None.** No flowing water, no rising level: the scenarios are models, and moving water would say a river is flooding. |
| Draw | The 38 reaches as lines. One scenario at a time (`q20`, `q100`, `q500`, `climate2080`); line weight by `polygons[scenario]`. |
| Legend | Line weight = number of flood-scenario polygons that touch the reach (not flooded area, not damage). |
| Caption | River reaches the state has designated, and how many modelled flood areas touch each. / Τμήματα ποταμών που έχει ορίσει το κράτος, και πόσες περιοχές πλημμύρας από μοντέλο αγγίζουν το καθένα. |
| Honesty line | **Modelled flood scenarios, not a flood that happened and not a forecast** / **Σενάρια πλημμύρας από μοντέλο, όχι πλημμύρα που έγινε και όχι πρόγνωση** |

### `fire-hotspots`

| | |
|---|---|
| Sheet name | Fire hotspots from space / Θερμές κηλίδες φωτιάς από δορυφόρο |
| Band | GROUND |
| Motion | Live, so a **slow glow** per hotspot is allowed, fading with the age of `seen` (bright when minutes old, dim near 24 hours). No flames, no spreading. |
| Legend | Dot = a place where a satellite saw heat; brightness = how recently. A pixel is 375 m to 1 km wide. |
| Caption | Places where satellites saw heat in the last 24 hours. / Σημεία όπου δορυφόροι είδαν θερμότητα τις τελευταίες 24 ώρες. |
| Honesty line | **Heat seen by a passing satellite in the last 24 hours — not a confirmed fire** / **Θερμότητα που είδε δορυφόρος στο πέρασμά του τις τελευταίες 24 ώρες — όχι επιβεβαιωμένη φωτιά** |
| Also say | "If you see smoke or fire, call 112." An empty sheet must say "none seen", never "no fire". |

### `burnt-areas`

| | |
|---|---|
| Sheet name | Burnt areas mapped from space / Καμένες εκτάσεις χαρτογραφημένες από δορυφόρο |
| Band | GROUND |
| Motion | **None.** |
| Legend | Circle area = burnt hectares of one mapped perimeter. The circle is not the shape of the burn. |
| Caption | Burnt land mapped from satellite pictures in the last 30 days. / Καμένη γη που χαρτογραφήθηκε από δορυφορικές εικόνες τις τελευταίες 30 ημέρες. |
| Honesty line | **Burnt land mapped by EFFIS in the last 30 days — larger fires only, often a day or more late** / **Καμένη γη που χαρτογράφησε η EFFIS τις τελευταίες 30 ημέρες — μόνο μεγαλύτερες φωτιές, συχνά με μία μέρα ή και περισσότερο καθυστέρηση** |

### `air-stations`

| | |
|---|---|
| Sheet name | Official air-quality stations / Επίσημοι σταθμοί ποιότητας αέρα |
| Band | AIR |
| Motion | Live (hourly): a **gentle pulse when a new hour arrives** is allowed. Between hours the columns stand still. |
| Legend | Column height = µg/m³ of PM2.5 (or PM10), mean of one hour, with the end of that hour. |
| Caption | The newest hour of dust in the air at the official stations. / Η πιο πρόσφατη ώρα σκόνης στον αέρα στους επίσημους σταθμούς. |
| Honesty line | **Hourly values from official stations, not yet verified by the publisher** / **Ωριαίες τιμές από επίσημους σταθμούς, χωρίς ακόμη επαλήθευση από τον εκδότη** |
| Never | Never next to classroom (indoor) readings as a comparison. |

### `met-stations`

| | |
|---|---|
| Sheet name | Met Office stations / Σταθμοί της Μετεωρολογικής Υπηρεσίας |
| Band | AIR |
| Motion | Live (10 min): wind arrows may drift in the direction `windFrom` + 180° at a speed in proportion to `wind`. A station with `wind: null` has no arrow. |
| Legend | One measurement at a time: °C, %, m/s, or mm in the last 10 minutes. Each station shows its own `time`. |
| Caption | The newest readings of the official weather stations. / Οι πιο πρόσφατες μετρήσεις των επίσημων μετεωρολογικών σταθμών. |
| Honesty line | **Readings of the official stations, about every 10 minutes** / **Μετρήσεις των επίσημων σταθμών, περίπου κάθε 10 λεπτά** |

### `airports`

| | |
|---|---|
| Sheet name | Airport weather / Καιρός αεροδρομίων |
| Band | AIR |
| Motion | Live: a wind arrow as for `met-stations`. **No aircraft, no flight paths**: the platform holds no flight data with a place. |
| Legend | °C and wind in m/s at the airport, with the time of the report. |
| Caption | The newest weather report of each airport. / Η πιο πρόσφατη μετεωρολογική αναφορά κάθε αεροδρομίου. |
| Honesty line | **Airport weather reports (METAR), about every 30 minutes — weather, not flights** / **Μετεωρολογικές αναφορές αεροδρομίων (METAR), περίπου κάθε 30 λεπτά — καιρός, όχι πτήσεις** |

### `permits`

| | |
|---|---|
| Sheet name | Building permits / Άδειες οικοδομής |
| Band | CITY |
| Motion | **None** for the month. If the time series `permitsByMonth` is played, it is a replay with a visible month label that stops at July 2026, and the marker of July 2024 (`annotation`) must be on the timeline. |
| Draw | One column per district at its `lat`, `lng` (the main town), or a tint of the district outline `polygon`. Show `total`, or `urban` and `rural`, never all three as separate columns. A `null` with mark `N.A.` is drawn as "not applicable", not as zero. |
| Legend | Column height = permits authorised in the month (unit: permits). Other indicators: floor area (m²), value (thousand EUR), dwelling units. |
| Caption | Building permits authorised in July 2026, by district. / Άδειες οικοδομής που εγκρίθηκαν τον Ιούλιο 2026, ανά επαρχία. |
| Honesty line | **Permits authorised in July 2026, by district — a monthly statistic, not live** / **Άδειες που εγκρίθηκαν τον Ιούλιο 2026, ανά επαρχία — μηνιαίο στατιστικό, όχι ζωντανά δεδομένα** |
| Also say | The July 2024 note (`annotation.text`) wherever more than one month is shown. If the outline is tinted: "the outline is the whole district; the statistics cover its government-controlled part". |

### `air-day`

| | |
|---|---|
| Sheet name | One day of air pollution, hour by hour / Μία μέρα ατμοσφαιρικής ρύπανσης, ώρα με την ώρα |
| Band | AIR |
| Motion | **Replay of one past day**: step through the 24 `hours` with a visible clock and the date "15 May 2024" always on screen. It may loop. |
| Legend | Column height = µg/m³ of NO2 (or O3) in that hour. One gas at a time. |
| Caption | Nitrogen dioxide and ozone at 11 official stations during one day. / Διοξείδιο του αζώτου και όζον σε 11 επίσημους σταθμούς μέσα σε μία μέρα. |
| Honesty line | **One past day, 15 May 2024 — a replay, not today** / **Μία περασμένη μέρα, 15 Μαΐου 2024 — επανάληψη, όχι σήμερα** |

### `drought`

| | |
|---|---|
| Sheet name | Farm drought in 2022 / Γεωργική ξηρασία το 2022 |
| Band | GROUND |
| Motion | **Replay of a past year**: step through the 36 ten-day periods with the period and "2022" always on screen. |
| Draw | Four cells of 1/24 degree as coloured squares at their true size (about 4 km). Colour by class label; **do not use the class number as a height** (`classesAreNotAScale`). |
| Legend | The seven class labels from `classes`. |
| Caption | The drought class of four grid cells through 2022. / Η κατηγορία ξηρασίας σε τέσσερα κελιά πλέγματος μέσα στο 2022. |
| Honesty line | **Four grid cells in 2022, every ten days — a past year, not now** / **Τέσσερα κελιά πλέγματος το 2022, κάθε δέκα ημέρες — περασμένη χρονιά, όχι τώρα** |

### `bathing-water`

| | |
|---|---|
| Sheet name | Bathing water quality / Ποιότητα νερών κολύμβησης |
| Band | WATER |
| Motion | **None.** |
| Legend | Dot colour = the reported label of the 2025 season (all 123 sites are "1 - Excellent" that season, so the legend has one entry). No score, no "safe" badge. |
| Caption | The quality label each bathing site got for the 2025 season. / Η ετικέτα ποιότητας που πήρε κάθε σημείο κολύμβησης για την περίοδο 2025. |
| Honesty line | **The label of the 2025 bathing season — not today’s water** / **Η ετικέτα της κολυμβητικής περιόδου 2025 — όχι το σημερινό νερό** |

### `seabed-profiles`

| | |
|---|---|
| Sheet name | Seabed profiles / Προφίλ βυθού |
| Band | WATER |
| Motion | **None.** A profile may draw itself once from the shore outwards. |
| Legend | Depth in metres below the sea surface along three lines; a hollow point is an interpolated value. |
| Caption | How the seabed falls away off three cities. / Πώς βαθαίνει ο βυθός στα ανοιχτά τριών πόλεων. |
| Honesty line | **Three lines cut through a gridded seabed model — estimates, not soundings** / **Τρεις γραμμές που κόβουν ένα πλεγματικό μοντέλο βυθού — εκτιμήσεις, όχι βυθομετρήσεις** |

### `aerosol-sites`

| | |
|---|---|
| Sheet name | Haze measured from the ground, July 2022 / Θολούρα μετρημένη από το έδαφος, Ιούλιος 2022 |
| Band | AIR |
| Motion | **Replay of a past month**: step through the `days` with the date on screen. A day without a value is skipped, not filled. |
| Legend | Aerosol optical depth at 500 nm (no unit), daily mean. |
| Caption | How hazy the sky was above two sites, day by day in July 2022. / Πόσο θολός ήταν ο ουρανός πάνω από δύο σημεία, μέρα με τη μέρα τον Ιούλιο 2022. |
| Honesty line | **Two sun photometers, daily means of July 2022 — a past month, not now** / **Δύο ηλιακά φωτόμετρα, ημερήσιοι μέσοι όροι του Ιουλίου 2022 — περασμένος μήνας, όχι τώρα** |

---

## 4. Files and tests

| File | What it is |
|---|---|
| `stackdata.js` | The API. Mounted in `server.js` next to the other modules |
| `fieldwork/import_earthquakes.py`, `import_localities.py`, `import_permits.py` | Build the three frozen extracts in `fieldwork/stack/`; `--check` verifies the committed copy |
| `fieldwork/test_earthquakes.py`, `test_localities.py`, `test_permits.py` | `cd fieldwork && python3 -m unittest test_earthquakes test_localities test_permits` |
| `tests/stackdata/api_test.js` | The server with demo data and a made-up timetable: `node tests/stackdata/api_test.js` (ports 3921 and 3922) |
| `tests/stackdata/points_test.js` | The places the two fire feeds hand over, and the registry's guard: `node tests/stackdata/points_test.js` |
| `gtfs.js` | Now also keeps planned runs (patterns and runs) and offers `timetables()` |
| `satellite/index.js`, `satellite/feeds/fire-hotspots.js`, `effis-burnt-areas.js` | `points()` |
| `city-buildings.js` | `get(id)` |

The extracts are in `fieldwork/stack/`, not in `fieldwork/`, so the thirteen investigations on the health page stay thirteen.

## 5. Limits, plainly

- No outbound network was available while this was built. The timetable rebuild that adds planned runs to an already saved copy, the fire
  feeds and the EEA download were **never exercised against the real services**; `bus-now` was tested with a made-up GTFS zip through the real
  reader.
- `bus-now` places a bus on the straight line between two stops, not on the road shape, and uses whole minutes. It knows weekday, Saturday
  and Sunday as the timetable file gives them around its reference day; it does not know public holidays or cancelled trips. A timetable
  whose validity has ended is not used.
- The saved timetables of a running server gain planned runs only after their next download (forced once by the new code).
- District anchors are town centres, not centroids. The Ammochostos anchor is the two-decimal Paralimni point of `island.js`.
- The 392 unplaced areas have English names only (the CYSTAT file has no Greek names).
- The age floor of 50 residents is this module's choice, stricter than the publisher.
- `island.js` has no recorded source or licence. This document only reports that; `THIRD_PARTY_NOTICES.md` was not changed about it.
