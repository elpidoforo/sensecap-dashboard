# Satellite feeds

Satellite data for the **Data layers** page and the master brain. One small module per feed in `satellite/feeds/`, one source file per feed in `sources/`, and a registry (`satellite/index.js`) that runs them safely. No npm packages.

A satellite value describes an **area** (a pixel of 250 m to 25 km), only where the sky is clear, at the moment the satellite passed over. It is never "a sensor at the school". Every descriptor, reading note and picture caption says so in plain words, in English and Greek.

## What is in this folder

| File | What it is |
| --- | --- |
| `index.js` | The registry: finds the feeds, builds each feed's `ctx`, starts and stops them, isolates every failure, answers `status()`, `probe(id)`, `read(id, cityId)`, `images()`, `imageFile(feedId, imageId)` and serves `/api/satellite/*`. |
| `http.js` | `ctx.get`: the only way a feed reaches the network. |
| `testing.js` | `makeCtx({ id, hosts, fixtures })` for feed unit tests, with the same host rules and no network. |
| `feeds/<id>.js` | One feed. `feeds/_demo.js` (made-up pictures, only with `SATELLITE_DEMO=1`) is the worked example. |

## Add a feed in five steps

1. Write `sources/<id>.json` (copy a satellite one; `layer: "model"`, `quality.kind: "satellite"` for pure satellite products, `"model"` or `"reanalysis"` where the product is model output that assimilates satellites). Verify the licence on the provider's own page. `variables` may be empty for an imagery-only layer.
2. Add the variables it measures to `vocab/variables.json` (same id as an existing layer when it is the same quantity, so the brain can compare satellite, model and sensor).
3. Write `satellite/feeds/<id>.js`:

```js
module.exports = function create(ctx) {            // ctx = { id, dir, log, get, places, now, env }
  return {
    id: 'my-feed',                                  // must equal the file name and sources/<id>.json
    hosts: ['api.example.org'],                     // exact host names, nothing else may be called
    start() { /* schedule refreshes with unref'd timers; never throw, never block */ },
    stop() {},
    probe() { return { ok: true, n: 1, at: Date.now(), note: 'one grid cell', noteEl: 'ένα κελί πλέγματος' }; },
    read(cityId) { return [{ variable: 'sea_surface_temperature', value: 24.1, unit: 'Cel', time: Date.now(), where: 'sea 4 km offshore', whereEl: '…', note: '…', noteEl: '…' }]; },
    images() { return [{ id: 'sst-20261112', title, titleEl, text, textEl, time, bbox: [w, s, e, n], file: 'sst-20261112.png', contentType: 'image/png', attribution, attributionEl, cloud: 30 }]; },   // optional
  };
};
```

4. Test it with `makeCtx` (see below). Run `node scripts/check-sources.js`.
5. Open a pull request. A teacher reads it.

### The ctx

- `ctx.dir`: the feed's own folder on the data volume (`DATA_DIR/satellite/<id>/`). Keep the last good result there, so a restart still shows data (mark it as late through `time`).
- `ctx.get(url, { as: 'json' | 'text' | 'buffer', headers, timeoutMs, maxBytes, method: 'GET' | 'POST', body, full })`:
  https only; the host must be exactly one of `feed.hosts` (no sub-domains, no IP addresses, no user name in the address, standard port); redirects are followed by hand, at most 3, every hop is checked, and your own headers (a key) are dropped when a hop changes host; User-Agent is always `SmartCitiesCyprus/1.0 (school project)`; one time limit for everything (20 s at most); size caps counted after decompression (5 MB for json and text, 12 MB for buffers, 32 MB at most). `full: true` returns `{ status, headers, url, body }`, for ETag and Last-Modified handling. A failure rejects with a short message that holds the host and a reason, never the path or the query (a key may be there): `host`, `scheme`, `redirect`, `size`, `timeout`, `http` (with `err.status`, `err.retryAfterSec`), `parse`, `network`.
- `ctx.env`: a read-only view. A feed sees only the names its source file declares (`access.auth.env`, or `x_env: ["NAME"]`) and names that start with `SATELLITE_`. Anything else reads as `undefined` and one log line says why. Never log a key.
- `ctx.log(msg)`: one short line. The same line is not repeated within 10 minutes. Key values and key names are cut out.
- `ctx.places`: the four cities of `vocab/places.json`. `ctx.now()`: the time in ms.

### The rules for what a feed returns

- `read(cityId)`: rows with a numeric `value` and a numeric observation `time` in ms (not the fetch time). `variable` must be in `vocab/variables.json` and in the source file, with the same unit; layers.js drops the others and drops values outside the plausible range. At most 24 rows. Say in `note` that it is an area.
- `images()`: `id` is letters, digits, `-` and `_` only (at most 80 characters, it is part of a web address); `file` is a file under `ctx.dir` (a relative path is taken from there; a path outside it, a link out of it, an empty file and a file over 12 MB are all skipped); `contentType` is png, jpeg, webp, gif or svg; `time` is required. `cloud` (0 to 100) is optional: from 40 the page says "lots of cloud". At most 12 pictures per feed; the page shows the latest large and up to 7 earlier days as small pictures.
- Everything must degrade: no network, bad JSON, 403 or 429, an empty answer: `probe().ok` false, `read()` empty, one log line, no crash.

### Testing a feed

```js
const { makeCtx, reply, startFakeServer } = require('../../satellite/testing');
const ctx = makeCtx({ id: 'my-feed', hosts: ['api.example.org'], fixtures: {
  'https://api.example.org/v1/data?x=1': { value: 1 },        // object or array: JSON 200. A string: text. A Buffer: binary.
  'https://api.example.org/v1/text*': 'text',                 // a trailing * matches any address that starts like this
  'https://api.example.org/limited': reply(429, '', { 'Retry-After': '30' }),
  'https://api.example.org/slow': reply(200, '{}', {}, { delayMs: 500 }),
} });
const feed = require('./my-feed')(ctx);   // ctx.get is the REAL satellite/http.js: same host rules, redirects, caps and parsing
```

`ctx.logs`, `ctx.calls`, `ctx.misses` (addresses with no fixture: they answer 404), `ctx.setNow(ms)` and `ctx.cleanup()` are there for the test. `makeCtx({ server })` with `startFakeServer(routes)` sends the requests through a real local HTTP server instead.

## What the registry guarantees

A feed that throws or hangs at load, start, stop, probe, read or images never affects another feed, the server start or a request. A feed file that cannot load, has the wrong `id`, has an invalid `hosts` list, has no `probe()` or `read()`, or returns a promise from `create` is listed as `failed` with one log line. `probe` and `read` have time limits (8 s and 5 s). A rejected promise or an uncaught error that escapes a feed's own timer is caught, logged once and recorded on that feed (only errors that come from satellite code; any other error stops the process exactly as before).

## Switches (environment)

| Variable | Effect |
| --- | --- |
| `SATELLITE=0` | Nothing is loaded, not even the demo. The layers say "switched off with SATELLITE=0". |
| `SATELLITE_DEMO=1` | Also loads `feeds/_demo.js` (id `satellite-demo`, made-up pictures and one made-up number, brings its own source description). For screenshots without the network. |
| `SATELLITE_LIVE=1` | In test mode (`OPEN_METEO_MOCK=1`) the real feeds are off ("test mode") so tests are deterministic; this lets them run. |
| `SATELLITE_RATE_PER_MIN` | Requests per address per minute for `/api/satellite/*` (default 240, at least 10). |
| the key named in a source file | A free key for a feed that needs one. A source that is `candidate` and `planned` with an `api-key` counts as **active at runtime** while the key is set. The page shows "a free key is needed", never the name. |

## HTTP (read only, rate limited, behind the same sign-in as the other `/api/` data routes when the site is locked)

- `GET /api/satellite/status`: per feed: `state` (`running`, `ready`, `failed`, `off`), `hosts`, last `probe`, `images` count, network counters (`ok`, `failed`, `lastError`), last reading. No folder, no key.
- `GET /api/satellite/images`: `{ images: [...] }`, newest first, each with `feed`, `id`, `title`/`titleEl`, `text`/`textEl`, `time`, `bbox`, `cloud`, `attribution`/`attributionEl`, `url`. ETag, `Cache-Control: public, max-age=60`.
- `GET /api/satellite/image/<feed>/<image>`: the file. Both ids are checked against `^[a-z0-9-]` and `^[A-Za-z0-9_-]` patterns and then looked up in the feed's own list, so a path can never reach another file. ETag, `max-age=300`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin` and `Content-Security-Policy: sandbox` (an SVG can never run script on our origin).

## How it plugs into the Data layers page

- `layers.js` gets a probe for every satellite feed from the registry (the layer is live, late or down like any other) and, for the brain, the readings of every active source that has a feed. A reading's `kind` is the source's `quality.kind`, so the brain says "satellite", compares it with models and sensors of the same variable, and adds the caveat that a satellite value is an area. A single satellite value is always low confidence. A satellite finding that would fall off the top five takes the last place.
- A source with `variables: []` (imagery only) lists fine, is live when its feed answers, shows its pictures in the layer dialog, and is never reported as "no reading" or read by the brain.
- In the layer dialog the page shows the latest picture large with its title, "Taken … UTC", one line on what you are looking at, the credit, and up to 7 earlier days as small pictures you can press, with the note "Satellite picture, not a photo of today: clouds hide the ground". The kind word "satellite" / "δορυφόρος" appears quietly next to the layer name and in finding source chips.

## What to look for in the Railway logs after a deploy

`Satellite <id>: could not load (...)` (a feed file is wrong), `Satellite <id>: probe failed (...)`, `... read failed (...)`, `... came out of the feed (...)` (a timer error that was caught). Then `GET /api/satellite/status`: `network.failed` and `network.lastError` per feed show what the real services answered.
