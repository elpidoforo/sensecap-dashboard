# Third-party notices

This site has **no npm dependencies**. Everything below is either copied into the repo with its licence, or
"ported": we read it and wrote our own code, and we say so here and in the file header.
A student's browser never loads anything from a third-party server.

## Copied into the repo (vendored)

| What | Where | Source and pin | Licence |
|---|---|---|---|
| three.js r160 (`build/three.module.js`, `examples/jsm/controls/OrbitControls.js`), unmodified | `public/vendor/three-r160/` | https://github.com/mrdoob/three.js, tag `r160`, commit `d04539a76736ff500cae883d6a38b3dd8643c548` | MIT, copyright 2010-2023 three.js authors (`LICENSE` next to the files) |
| QR Code generator library (Project Nayuki), `qrcodegen.ts` with the TypeScript types stripped by `node:module` `stripTypeScriptTypes`; no other change | `public/vendor/qrcodegen/` | https://github.com/nayuki/QR-Code-generator, commit `bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d` | MIT (`LICENSE` next to the file) |
| hyparquet 1.33.0 (Parquet reader), `src/*.js` unchanged, `package.json` marks `"type":"module"` | `vendor/hyparquet/` | https://github.com/hyparam/hyparquet, v1.33.0, commit `8f4096afaa8da5d0bbd76a0225b44c71ac4fcd83` | MIT (`LICENSE` next to the files) |
| stopwords-el (Greek stop words), byte for byte | `vendor/stopwords-el/` | https://github.com/stopwords-iso/stopwords-el, commit `d9e49e4c835570d4425db832832b7e834013ecf5` | MIT, copyright 2016 Gene Diaz (`LICENSE`, `SOURCE.md`) |
| Viridis colour table (256 hex values) from d3-scale-chromatic, inside `aqi.js` and `public/site/aqi.js` as a string constant with its header | `public/vendor/d3-scale-chromatic/LICENSE` | https://github.com/d3/d3-scale-chromatic, v3.1.1, commit `cce6eb39317f0bb71a1b243ef6a4861cd5ce4733` | ISC, copyright 2010-2026 Mike Bostock. The colour map itself is CC0 (Firing, Smith, van der Walt) |

## Ported, not copied (own code; the licence is credited in the file header where the licence asks for it)

| What we wrote | Learned from | Licence of the original |
|---|---|---|
| `qc.js`: gross range, spike, rate-of-change and flat-line checks | ioos_qc (NOAA IOOS QARTOD), commit `524de971db6124350fa421ab29cf3d780387a5ef` | Apache-2.0 (notice in the header of `qc.js`) |
| `metrics.js`: regression and error statistics, 75 % completeness rule, PM2.5 targets | sensortoolkit (US EPA), commit `1e890561f1016f0f2e977118561816a4aaa2f506` | MIT, copyright 2021 Samuel Frederick |
| `public/site/trailsimplify.js`: radial distance plus Douglas-Peucker, with gap, time-span and cap rules | Simplify.js (Vladimir Agafonkin), v1.2.4, commit `0777f8ac6f81b15239a4dc80b6d83f956b1b7110` | BSD 2-Clause (text in the file header) |
| `public/site/downsample.js`: largest-triangle-three-buckets downsampling | downsample-lttb (Matej Drolc), commit `e6473596fbd969f3afb0f457cc4790b0a9b42790`, and S. Steinarsson, "Downsampling Time Series for Visual Representation", University of Iceland, 2013 | MIT (text in the file header) |
| `public/site/heatindex.js`: heat index | NWS "The Heat Index Equation", Rothfusz 1990 (SR 90-23), Steadman 1979; values cross-checked with pythermalcomfort v4.8.1 | US government work; MIT for the cross-check only |
| `greek.js`: diacritics, Greeklish and sound keys, own stemmer | greek-utils (vbarzokas), commit `2ba9a29a40fa7fecd681a5e0420e7773f03a153a`; greekstemmerjs read as a yardstick only | MIT |
| `safefetch.js`: only plain public unicast addresses may be connected to | request-filtering-agent (azu), v3.2.1, commit `29dd9105a2d471ca2d933f10ce5d9ef0732904ca` | MIT, copyright 2019 azu |
| `public/site/studio-code.js`: syntax colouring | speed-highlight and CodeJar were evaluated and **not** used | CC0 and MIT |
| `gtfs.js`, `mqtt.js`, `sensecap_stream.js`, `aqi.js` (AQI maths) | GTFS reference, the OASIS MQTT 3.1.1 specification, Seeed's public pages, US EPA and EEA index tables | public specifications |

`promptfoo` (MIT) is only used by a developer through `npx` for the guide evaluation in `tests/guide-eval/`. It is not a dependency.

## Data and credits shown on the site

| Data | Credit and terms |
|---|---|
| European Environment Agency, Air Quality Download Service (Cyprus stations reported by the Department of Labour Inspection) | Credit line on the card and in `sources/air-quality-stations-cy.json`. EEA general reuse policy: reuse with credit; some data may carry specific conditions. The licence id is left `unknown` until a teacher reads the dataset factsheet. |
| Cyprus National Access Point for transport (traffic4cyprus.org.cy), GTFS | CC BY 4.0. The credit is in every API answer and on the trip page. |

## Satellite data sources (fetched live by the server; nothing is copied into the repo)

All the code is our own ("ported, not copied"): written from each provider's documentation. The credit line shown in the layer dialog is in each `sources/*.json`
(`licence.attribution`). Terms were read on 2026-11-12; a teacher should re-check any line marked "not read".

| Data | Provider and terms |
|---|---|
| NASA GIBS daily pictures (`nasa-gibs-imagery`) | NASA Earth Science Data and Information System. NASA open data policy; the acknowledgement NASA asks for is shown with each picture. |
| EUMETSAT Meteosat pictures (`eumetsat-meteosat-view`) | EUMETSAT Data Policy (2026); the credit line and the Natural Earth overlay credit are shown. |
| Open-Meteo CAMS air quality (`cams-atmosphere`), satellite radiation (`openmeteo-satellite-solar*`) | CC BY 4.0, free tier for non-commercial use, attribution "Open-Meteo.com". Open-Meteo's source code (AGPL-3.0) was read for field names only; nothing copied. |
| Copernicus Sentinel-5P TROPOMI via Copernicus Data Space (`tropomi-air`, needs a free key) | Copernicus Sentinel data licence (free, full and open); "Contains modified Copernicus Sentinel data". |
| NASA MODIS / VIIRS via ORNL DAAC (`modis-lst`, `modis-ndvi`, `modis-aerosol`) | NASA open data; ORNL DAAC asks for a citation of the tool and the product. |
| NASA FIRMS active fires (`fire-hotspots`, needs a free key) | NASA open data, acknowledgement requested; "Not endorsed by NASA". The exact terms for the NOAA-20/21 products: not read, a teacher may confirm. |
| EFFIS burnt areas (`effis-burnt-areas`) | European Commission, JRC; CC BY 4.0 with a "changed" statement. |
| NOAA CoastWatch ERDDAP: MUR SST, OISST, VIIRS chlorophyll (`noaa-sst`, `noaa-chlorophyll`) | NASA JPL PO.DAAC data policy (acknowledgement), NOAA open data. Requests are few and spaced out. |
| NASA POWER (`nasa-power-solar`) | CC BY 4.0; NASA asks to cite the API version and the date of access. The upstream retrievals (DWD, CERES, GEOS): terms of DWD not read. |
| Solar position and top-of-atmosphere radiation formulas | NOAA GML calculator equations and FAO Irrigation and Drainage Paper 56 (published methods); written as our own code. |

Last reviewed: 2026-11-12.
