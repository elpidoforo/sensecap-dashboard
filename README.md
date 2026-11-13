# sensecap-dashboard

Smart Cities for four Cyprus schools: one site that shows the SenseCAP / SenseCraft sensors on buses, cars and classrooms next to the official Met Office data. There is no visitor login. Only teachers sign in (to approve work and manage the school).

The server keeps your API credentials private and calls the SenseCAP HTTP API; the browser only talks to this server.

## The site

One page app at `/`, in the Nemesis Classic look (navy glass, copper and cyan, side menu), English by default with a Greek switch (`EN | EL`). The shell is `public/index.html` with `public/site/` (`shell.js` router, menu, welcome pop-up and tour; `site.css`; `charts.js`; `island.js`). Every page is a module in `public/site/pages/<id>.js` that registers itself with `SC.register(id, {...})` and is loaded on demand. Routes are hash routes (`/#/board`, `/#/vehicles/<eui>`, `/#/weather/<station>`).

| Menu | Page | What it is |
| --- | --- | --- |
| The whole project | `home` | The eight windows on one island, tour mode |
| Today | `board`, `city3d` | City board with live school readings; Cyprus 3D (embeds `/3d.html?embed=1`) |
| The record | `weather`, `explore` | Met Office record (warnings, forecast, radar, sea, stations); Explore data (compare, timeline, number finder, sensor vs official, download) |
| Schools and places | `schools` | Schools and teams, announcements from teachers |
| In the field | `map`, `vehicles` | Live map (embeds `/map.html?embed=1`); vehicles and trips |
| Output | `studio` | Build studio: gallery of approved tools; students build with their own approved account |
| Ask | `ask` | The assistant, open to visitors with limits |
| Oversight (teachers only) | `approvals` | Approve tools and accounts |

Menu entries appear only for pages that exist (`READY` in `shell.js`). More pages from the original plan (alerts, council room, what-if, reports and others) are not built yet. The older `/app/` (student and team app, teacher management) and `/studio/` keep working; Settings and the teacher management screens still live in `/app/`.

## Run locally

```bash
npm start            # real data, needs the variables below
npm run demo         # demo data, no credentials needed
```

Open http://localhost:3000.

## Variables

| Name | Required | Purpose |
| --- | --- | --- |
| `SENSECAP_API_ID` | yes | API ID from Security, Access API keys |
| `SENSECAP_API_KEY` | yes | Access API Key from the same page |
| `DASHBOARD_PASSWORD` | no | Locks the whole site behind this password (any username). Whoever has it also sees exact vehicle positions. Leave it empty for the open site |
| `SENSECAP_HOST` | no | Defaults to `https://sensecap.seeed.cc/openapi` |
| `SENSECAP_PARALLEL`, `SENSECAP_GAP_MS`, `SENSECAP_COOL_MS` | no | How the server paces its calls to SenseCAP (which answers with a web page when asked too often): at most 3 at a time (`SENSECAP_PARALLEL`), at least 250 ms apart (`SENSECAP_GAP_MS`), and 45 s of rest after a bad answer (`SENSECAP_COOL_MS`). The gap doubles (up to 2 s) after every "busy" answer and slowly comes back after 60 good ones. What SenseCAP said is kept in the Feeds list as the last error |
| `DEMO` | no | `1` forces demo data |
| `DATA_DIR` | no | Where the Met Office history is saved. Defaults to the Railway volume (`RAILWAY_VOLUME_MOUNT_PATH`), otherwise `./data` |
| `HISTORY_DAYS` | no | How many days of history to keep (default 400) |
| `LOCK_DASHBOARD` | no | `1` locks the whole site for anyone who is not signed in to the student app (or has `DASHBOARD_PASSWORD`). Off by default: the site is open to everybody |
| `PUBLIC_POS_DELAY_MIN` | no | Minutes a vehicle position must be old before visitors may see it (default 120). See Privacy of vehicle positions |
| `PUBLIC_POS_GRID` | no | Size in degrees of the grid public positions are rounded to (default 0.01, about 1 km) |
| `ADMIN_SETUP_CODE` | no | Secret that lets the first admin create an account on the Join page (`/#/join`, Site owner box). Delete it once the admins exist |
| `RESEND_API_KEY`, `NOTIFY_EMAIL` | no | Turn on approval emails to the admin (see Approval emails). `NOTIFY_FROM`, `SITE_URL`, `NOTIFY_DELAY_MIN` are optional |
| `JOIN_PER_IP_HOUR`, `JOIN_PENDING_PER_SCHOOL`, `JOIN_PENDING_TEACHERS` | no | Limits on account requests: per network address per hour (60), waiting students per school (150), waiting teachers (20) |
| `CLASS_LOGIN_USER`, `CLASS_LOGIN_PASSWORD` | no | An optional shared sign-in, off by default (the site has no visitor login). When both are set the whole site needs it (or a student-app account). It cannot tell students apart, so it only opens the site: it never gives exact vehicle positions |
| `ANTHROPIC_API_KEY` | no | Switches the Ask assistant on. Without it the app works and the assistant says it is not switched on |
| `BOT_MODEL` | no | Model for the assistant (default `claude-sonnet-5-5`) |
| `ANTHROPIC_BASE_URL` | no | Only for testing against a different endpoint |
| `BOT_DAILY_LIMIT` | no | Questions per signed-in person per day (default 40) |
| `BOT_VISITOR_DAILY`, `BOT_IP_DAILY`, `BOT_IP_MINUTE` | no | Limits of the public Ask for visitors (defaults 30, 150 and 30). See Ask for visitors in the Student and team app section |
| `BOT_GLOBAL_DAILY` | no | Questions per day for everyone together, visitors and signed-in users (default 800) |
| `CHAT_RETENTION_DAYS` | no | Chat messages older than this are deleted (default 400) |
| `BOT_LOG_DAYS` | no | Assistant questions and answers older than this are deleted (default 90) |
| `LAYERS_BRAIN_HOURLY` | no | How many times per hour the Data layers page may ask the assistant to word the findings (default 60). Over that the findings are still shown, written from templates |
| `LAYERS_ASK_PER_HOUR` | no | Questions per visitor address per hour on the Data layers page (default 12) |

Never commit real keys. `.env` is ignored by git.

## Notes

- Groups in SenseCAP show up as the group filter, so create one group per school.
- History uses the `aggregate_chart_points` endpoint (up to about 250 points per series).
- Device lists are cached for 1 minute and readings for 1 to 2 minutes to stay within API limits.
- The site serves its demo videos (`demo_en.mp4`, `demo_el.mp4`, with `demo_en.jpg` and `demo_el.jpg` posters) from `/site/media/`. Static files support HTTP `Range` (`bytes=a-b`, `bytes=a-`, `bytes=-n`): a partial request gets `206` with `Content-Range`, an unsatisfiable one gets `416` with `Content-Range: bytes */size`, and every static answer carries `Accept-Ranges: bytes`. iOS Safari will not play a video without this. Keep the videos H.264 with the `moov` atom at the front (`ffmpeg -c copy -movflags +faststart`) so they start before they are fully downloaded; `.mp4` and `.webm` have their own content types.

## Privacy of vehicle positions

The site is open to everybody, and the vehicles carry students, so an exact position never leaves the server for a visitor. The rule is applied in the data layer (`privacy.js`), not in the pages:

| Who | What they get |
| --- | --- |
| Visitors, students, the optional class sign-in, the Ask assistant, the Build studio and the `/mcp` tools | Public view: each vehicle's last known position that is at least `PUBLIC_POS_DELAY_MIN` minutes old (default 120), rounded to a grid of `PUBLIC_POS_GRID` degrees (default 0.01, about 1 km). No GPS measurement ids and no GPS history |
| Teachers and admins (a student-app session with that role, sign in at `/teachers`, which opens `/app/#/staff`) and the holder of `DASHBOARD_PASSWORD` | Exact data, as stored in SenseCAP |

What the public view looks like:

- `/api/devices`: `lat` and `lng` are the delayed, rounded position, plus `posDelayed: true` and `posAt` (when that position was recorded, in milliseconds). A vehicle with no old-enough point has `lat: null`; a vehicle that has been silent for longer than the delay shows the position stored in SenseCAP, rounded.
- `/api/latest`: the readings without the GPS measurement ids (`4197`, `4198`).
- `/api/trails`: only points older than the delay, rounded, with consecutive duplicates removed (`posDelayed`, `delayMinutes` and `grid` say so). `/api/series` for a GPS measurement answers 403.
- `/api/config` reports `exactPositions` (does this viewer get exact data), `posDelayMin` and `posGrid`.
- The assistant, the Build studio and `/mcp` always use the public view, even when a teacher is asking, and cannot read GPS measurements. `/cities/api/overview` (school averages and route squares) uses the same delay and grid.
- Answers for visitors are cached separately from the data layer, keyed by privilege level, so exact data cannot be served to a visitor from a cache. All caches are bounded (least recently used keys go first); `hours` and `days` are whole numbers; Met Office picture addresses lose their query string.

Switching `LOCK_DASHBOARD`, `DASHBOARD_PASSWORD` or the class sign-in on only decides who may open the site. It never makes a visitor, a student or a class sign-in exact.

Old addresses are redirected into the site: `/index.html` to `/`, `/cities/` to `/#/`, `/metoffice.html` to `/#/weather`, `/dashboard.html` to `/#/vehicles`, `/map.html` to `/#/map`, `/3d.html` to `/#/city3d`. Add `?embed=1` to get the page itself (so the site can show `map.html` and `3d.html` in same-origin frames).

## 3D view

`/3d.html` shows Cyprus as a 3D island: terrain coloured by temperature, elevation, PM2.5 or dust, animated wind, clouds and rain, sea points, and one column per sensor. It refreshes sensors every 30 seconds and weather every 5 minutes.

Each column carries a number label ("Name and value", "Value only", "Value and difference from weather model", or off). The sensor list on the right is sorted by the chosen measurement (highest first, lowest first or by name; offline sensors last); click a row and the camera flies to that column. Columns follow the GPS position, so a vehicle's column moves at every refresh.

Outside data comes from [Open-Meteo](https://open-meteo.com) (free, no key, non-commercial use): elevation, weather, air quality and marine conditions. Sensors are compared with the weather model for temperature and humidity.

`OPEN_METEO_MOCK=1` serves synthetic terrain and weather for offline testing only.

`GET /api/forecast` gives a five-day model forecast for central Cyprus (`days[]` with `date`, `tmax`, `tmin`, `code` (WMO weather code), `wind` in m/s and `windDir`; plus `source`, `place`, `updated`). It comes from Open-Meteo and is kept for 30 minutes (the last good answer is served if the service is down). The Met Office page shows it as the day cards and says it is a model forecast, not the Department's; if the endpoint fails the page shows the Department's own forecast pictures (tables A, B and C) instead.

## Layered map

`/map.html` is a real map (MapLibre GL JS) with layers that can be switched on and off, each with its own source and last-update time in the Data status box:

| Layer | Source |
| --- | --- |
| Map, Terrain, Dark basemaps | OpenStreetMap, OpenTopoMap, CARTO |
| Satellite basemaps | Sentinel-2 cloudless by EOX, Esri World Imagery |
| 3D terrain and hillshade | AWS Terrain Tiles (Mapzen) |
| Roads overlay, place names | OpenStreetMap, CARTO labels |
| Our vehicles (bus or car icon, 3D columns, GPS trails, 24 h history, comparison with the weather model) | SenseCAP |
| Temperature, humidity, cloud, rain, PM2.5, dust surface; wind arrows | Open-Meteo |
| Open air sensors (PM2.5, PM10, temperature, humidity) | Sensor.Community volunteers |
| Official weather stations (54 across Cyprus: temperature, wind, humidity, pressure, rain), shown as squares | Cyprus Department of Meteorology open data (`dom.org.cy/AWS/OpenData/CyDoM.xml`) |
| Sea temperature and waves | Open-Meteo marine |
| True colour photo, land surface temperature, aerosols (any date) | NASA GIBS |

### Vehicles and trails

Every sensor is drawn as a vehicle at its GPS position: a bus icon when the sensor name contains "bus", otherwise a car. The icon ring and the 3D column take their colour from the chosen measurement; offline vehicles are grey. A small arrow shows the direction of travel while the vehicle moves.

- Click a vehicle for its card: current value, GPS fix age, speed, distance and top speed over the trail window, the weather model value for the same place, the nearest Met Office station, the nearest open sensor and a 24 h sparkline.
- Trails show where the vehicle has been (last hour, 6 hours, 24 hours, 3 days or 7 days). Segments are coloured by the measurement taken there, older parts fade, and a dashed grey line marks a signal gap longer than 10 minutes. GPS jitter under 15 m is merged.
- When a new GPS fix arrives (the map reads it every 30 seconds) the icon glides to the new place and the trail grows with it.
- History comes from `/api/trails?hours=<1-168>&mid=<measurement id>`, which reads the raw GPS data (latitude 4198, longitude 4197) and the chosen measurement from SenseCAP `list_telemetry_data`, and keeps it for 4 minutes (15 minutes for windows over 6 hours) to protect the API quota. SenseCAP keeps about 3 months of raw data.

### Animation

- **Time-lapse**: the bar at the bottom plays the whole trail window (Slow, Normal, Fast; Normal is about one minute). The vehicles, their colours, the 3D columns and the trails follow the clock; "Live" returns to now. "Replay trip" on a vehicle card starts it and follows that vehicle.
- **Flowing wind**: streaks follow the Open-Meteo wind field and stay correct while the camera moves.
- **Pulsing vehicles**: a ring pulses under every online vehicle.
- **Camera tour**: tilts the map and turns slowly around the island; touching the map stops it.
- **Follow vehicle**: keeps the camera centred on one vehicle.

Notes:

- Vehicles without GPS data yet are shown at the position set in SenseCAP, and the card says "No GPS yet". The GPS payload format was written from the SenseCAP documentation; the Data status box shows an error line if a vehicle's history could not be read.
- Check each provider's terms before using the map outside a classroom (Esri imagery, OpenStreetMap tile servers and Open-Meteo all have fair-use limits).
- Met Office data is credited to the Cyprus Department of Meteorology. The feed shows the time of its newest reading in Data status, and readings older than 3 hours are marked old. Check their terms before using it outside a classroom.
- A failing source shows an error line in Data status and the other layers keep working.
- The map loads MapLibre from unpkg and tiles from the providers above, so the browser needs internet access to those hosts.

## Met Office page and station popup

`/metoffice.html` shows everything the server reads from the Cyprus Department of Meteorology on one page: the warnings text (with the earlier versions this server saved), the forecast pictures, the radar, the sea and aviation texts, the discomfort index (NET) table, and a sortable, searchable table of all stations. Choosing a station draws its saved history (temperature, humidity, wind, pressure, rain, sun) for 24 hours, 7 days or 30 days, with a CSV download for that period. The address `/metoffice.html#ACHNA` opens a station directly.

On the map, clicking a Met Office station square opens a popup with the same 24 hour chart, a CSV link and a link to that station on the page. Inside the student app the popup links to the app's own station screen.

The chart is `public/mo-chart.js` (plain SVG, no libraries). A gap of more than an hour in the saved readings is drawn as a gap, not as a line. History only exists from the day the server started saving it, so a new volume starts with empty charts.

## Met Office history and pages

The Met Office feed only holds the newest reading of each of its 54 stations, so the server saves every new reading (the feed updates every 10 minutes; the server checks every 5) in one file per day under `DATA_DIR/cydom/`. All readings are kept (temperature at 1.2 m and 5 cm, day extremes, wind at 2 m and 10 m and at the airport runways, humidity, rain, solar radiation, three pressures). History starts when the server first runs; it cannot be filled in backwards.

On Railway the files must live on a volume, otherwise they vanish at the next deploy. This project has a volume mounted at `/data`. About 1 MB per day is written, so 400 days fit in well under 1 GB. `/api/cydom/history/info` shows `"persistent": true` when a volume is in use.

| Address | What it returns |
| --- | --- |
| `/api/cydom/history?station=ACHNA&hours=24&keys=temp,hum` | Readings of one station, oldest first, with units (up to 720 hours) |
| `/api/cydom/history.csv?station=ACHNA&days=7` | CSV with every reading (leave out `station` for all stations; `days` up to the retention) |
| `/api/cydom/history/info` | How many day files, bytes, first and last reading, whether a volume is used |
| `/api/dom/page?name=warnings` | Text, pictures and links of a Met Office page: `warnings`, `sea_a` to `sea_d`, `navtex`, `fir`, `laf` |
| `/api/dom/pages/history?name=warnings&days=30` | Every saved version of that page (saved whenever its text changes, at most every 30 minutes) |
| `/api/dom/net` | The official discomfort index (NET) table |
| `/api/dom/img?name=radar` | Met Office pictures through this server (cached for 5 minutes): `radar`, `radar_anim`, `radar_pfo`, `radar_lca`, `table_a`, `table_b`, `table_c` |

The forecast tables A, B and C are pictures on the Met Office site; the sea, aviation and warnings pages are read as text and the structure of each is written once to the server log at start. Check the Met Office terms before using their data outside a classroom, and keep the credit "Weather Data Copyright The Cyprus Department of Meteorology".

## Student and team app

An installable web app (PWA) at `/app/` for students and teachers of PASCAL Larnaka, PASCAL Lefkosia, PASCAL Limassol and the International School of Paphos. It needs Node 22.13 or newer (it uses the built-in `node:sqlite`) and stores its data in `DATA_DIR/app.db`, so keep the volume.

What it does:

- **Data:** home screen with the Met Office strip, vehicle cards with a CO2 ribbon, 24 hour / 7 day / 30 day charts, the 54 Met Office stations with history and CSV, and the map and 3D view inside the app.
- **Chat is closed for students.** Channels stay (one for all schools, one per school, one per team) and students can still read them, but only teachers and admins can post (`POST /app/api/messages` answers a student with 403 "Chat is closed. Teachers post announcements here."; the app hides the composer and shows that sentence). Old messages and accounts are untouched. Teachers can post links; a message from a student can still be reported and removed.
- **Announcements (public):** `GET /app/api/announcements` needs no sign-in and returns the last 10 messages that teachers or admins posted in the All schools channel (deleted ones left out): `{ items: [{ id, at, text, by }] }`, where `by` is a role and a school such as "Teacher, PASCAL Lefkosia", never a name. Cached for 30 seconds (a new or deleted message shows at once). Tell teachers that what they post in All schools is public.
- **Public schools list:** `GET /app/api/schools/public` needs no sign-in: `{ schools: [{ slug, name, short, lat, lng, teams: [{ id, name, device_eui }] }] }`. Team names only: no join codes, no members. (`GET /app/api/schools` lists only id and name, also without codes.)
- **Ask:** an assistant that reads the live data, the Met Office pages, the vehicle history and an editable handbook (Manage, Handbook). Visitors can use it without signing in (see below); signed-in members use `POST /app/api/bot`. Every question and answer is visible to teachers, and any answer can be reported.

### Ask for visitors (no sign-in)

`POST /app/api/ask` takes the same request (`{ question, history }`) and returns the same stream of lines (`tool`, then `answer` or `error`) as `POST /app/api/bot`, with no session. The answer line also carries `remaining` (questions this visitor has left) and `limit`. `GET /app/api/ask/status` returns `{ enabled, remaining, limit, available }` (`available` is false while the network or site limit stops the visitor; then `retry_at` says when). `POST /app/api/ask/:id/report` lets a visitor report an answer they were given (`id` is the answer's `id`).

- **Who is who:** a random cookie `sc_v` (HttpOnly, SameSite=Lax, one year, Secure behind https) tells visitors apart. Only a short hash of it is stored. Visitors have no account and no name.
- **Limits:** 6 questions a minute and `BOT_VISITOR_DAILY` a day per visitor; `BOT_IP_MINUTE` a minute and `BOT_IP_DAILY` a day per network address (the first `X-Forwarded-For` value, like the other limiters); `BOT_GLOBAL_DAILY` a day for visitors and signed-in users together. A refused request is a 429 with a plain sentence that says when it ends (for example "You can ask again at 14:32 Cyprus time (in about 3 hours)") and `retry_at`, `retry_after` and `Retry-After`. A day is a rolling 24 hours. The per-visitor and global counts come from the saved log, so a restart does not reset them; the per-network counters live in memory and start again after a restart.

  | Variable | Default | Meaning |
  | --- | --- | --- |
  | `BOT_VISITOR_DAILY` | 30 | Questions per visitor (cookie) per day |
  | `BOT_IP_DAILY` | 150 | Questions per network address per day. A school usually sits behind one address, so raise it if a whole class uses Ask at the same time |
  | `BOT_IP_MINUTE` | 30 | Questions per network address per minute (stops bursts from clients that throw their cookie away) |
  | `BOT_GLOBAL_DAILY` | 800 | Questions per day for everybody together (was 1500) |
  | `BOT_LOG_DAYS` | 90 | Questions and answers older than this are deleted (also visitor ones, at startup and every 6 hours) |
- **Log:** each question is saved in `bot_logs` with no user id, no school and no address, only the short visitor hash. Teachers read them in Manage, Assistant as "Visitor". Reports of visitor answers carry no reporter (per network address, 5 an hour; only the visitor who got the answer can report it) and every teacher sees them in Reports.
- **What the assistant may say:** visitors get a school-neutral prompt, the handbook, and the same read-only tools. It never gets or says a precise position: vehicle positions are rounded to 0.01 degree (about 1 km), shown only when they are at least 2 hours old (or already delayed by the server), the newest 2 hours of a route are left out, and raw GPS measurement ids never appear in tool results or handbook text. This is enforced in `bot.js` as well as in the data layer.
- **Handbook for visitors:** the assistant also reads two pages that belong to the code (`SITE_GUIDE` in `knowledge.js`: how the website works, privacy and safety). Pages whose title starts with "Staff", "Private" or "Internal" are never given to visitors. The two old starter pages about the login-and-chat app ("Using this app", "Chat rules") are skipped while they are still the original text; nothing in the handbook is changed or deleted.
- Databases made before this change get one new column, `bot_logs.visitor`; no row is changed.

### Setting it up

1. Set `ADMIN_SETUP_CODE` (a long random secret) on Railway. Open the site's Join page (`/#/join`), expand "Site owner: make the first admin account", type that code, a name and a password. Then delete the variable so nobody can make more admins. An admin's own password cannot be reset on the site (only an admin can reset others), so keep it safe.
2. Students and teachers make their own account on the Join page: they pick a city, a team (or ask for a new one) and a password. There are no school codes and no class codes, and no email.
3. New accounts wait in Approvals. A teacher approves the students of their own school; only an admin approves teachers. Approving a student who asked for a new team creates the team. The People tab resets a lost password (a temporary one is shown once and must be changed at the next sign-in).
4. Manage, Teams: create teams and add members. Each team gets its own chat channel.
5. Manage, Codes, Vehicle matching: a vehicle is shown to a school when its name or group contains one of the school's match words (default: the city name, for example `Larnaka, Larnaca`). Name the SenseCAP devices or groups accordingly, or change the words.
6. Add `ANTHROPIC_API_KEY` to switch on the assistant. Vehicle positions are delayed and rounded for everybody except teachers and admins (see Privacy of vehicle positions below).

Students pick a display name and a password; there are no email addresses. A teacher can reset a password (the student gets a temporary one and must change it).

### Safeguarding and privacy

- Students are minors. Get the school's agreement (and your data protection officer's) before use, and tell students and parents what is stored: display name, school, team, messages, and the questions they ask the assistant.
- The assistant sends the question and the data it needs to Anthropic. It tells students it is an AI, points to 116111 (child helpline) and 112 (emergencies) when someone is in trouble, and helps with learning rather than writing assignments.
- Teachers see the assistant log and the reports queue. Messages and logs are deleted after `CHAT_RETENTION_DAYS` and `BOT_LOG_DAYS`.
- Students can export their data or delete their account in the app (Me). A deleted account is anonymised in old messages.
- Do not put real school names or addresses in the sensor groups if you do not want them visible; the school locations in the app are city level only.

## AI Sustainable Cities site (`/cities/`) and Claude connection

`/cities/` is the new front door for the four schools. Students sign in at `/cities/login.html` with the shared class sign-in (see `CLASS_LOGIN_USER` and `CLASS_LOGIN_PASSWORD`), then reach the dashboard, the layered map, 3D Cyprus and the student app.

- **Shared sign-in:** one user name and password for everyone, kept in server variables, not in git. Rate limited (8 wrong tries per 15 minutes per address) and signed cookie for 7 days. Changing the password signs everyone out. It does not identify students, so chat, the Ask assistant, the Build studio and saved projects stay with individual student-app accounts.
- **Build studio (`studio.js`):** students build with their own approved account (Join page). A visitor or a pending account can open the public gallery but not build; the studio says to sign in or wait for approval. Class codes are gone: `POST /studio/api/class` answers 410. Drafts, previews, builds and submissions behave as before for accounts. Approvals are decided by the teacher of the school or an admin.
  - **Creator name on a tile:** when a student sends a tool (`POST /studio/api/projects/submit` or `/projects/<id>/submit`) the body may hold `show_name: true|false` (the studio shows a tick box, ticked by default). Only an approved tool with `show_name` true shows a name, and only as the first name plus the first letter of the surname ("Mia K."), as `creator` in the project JSON, in the public gallery, on the full-screen page and in `/studio/api/submitted` (approved items). Without the field the name stays hidden, and every tool approved before this existed stays hidden. `POST /studio/api/projects/<id>/name` `{ show }`: the author can show or hide it at any time; a teacher of the school or an admin can only hide it (also with `hide_name: true` on the review call); teammates cannot change it. The gallery is grouped by school (`schools` in `/studio/api/status`). Class pages never carry a name, and the guide shows a name only under this same rule (see `show_found` below).
  - **Guide (`POST /studio/api/guide`):** a chat beside the build box that helps an approved student talk an idea through before building. It reads the platform (`list_data_layers`, `site_map`, `sensor_guides`, `gallery_ideas`, the handbook and the same public, delayed, rounded data tools as the Ask assistant; never vehicle trips) and can offer tappable choices and write a short brief that the student puts in the box with one button. It never builds, saves or sends anything, and it uses the same `ANTHROPIC_API_KEY` and `BOT_MODEL`. Streamed as ndjson (`tool`, `choices`, `brief`, `found`, `answer`, `error`). `STUDIO_GUIDE_DAILY` (80): guide messages per signed-in person per day. `STUDIO_GUIDE_GLOBAL_DAILY` (2000): guide messages per day for everybody together. 8 messages a minute per person. `0` switches the guide off. These do not use up build credits. The conversation is kept only in the student's own browser (the last 30 messages); the server keeps a count, not the text.
  - **Guide tool `show_found`:** when the guide's reply mentions a tool or a data layer that fits the idea, it calls `show_found` with `tool_ids` (the `id` that `gallery_ideas` now returns for approved tools) and `layer_ids` (the `id` from `list_data_layers`), at most 3 of each. The server checks every id and drops unknown ones without a word; if nothing valid is left the model gets an error and nothing is shown. It can show only (1) approved tools: `{ id, title, school, team, creator }`, where `creator` is "Mia K." only if the author ticked the box, a teacher has not hidden it and the tool is not a class page, otherwise `null` (the same opt-in rule as the gallery); a pending, rejected or unknown project is never shown; and (2) data layers from the register: `{ id, name, nameEl, state, live }`, where `live` is true for state `live` or `late`. The result is sent as a `found` event (`{ tools, layers }`) while the guide works, and again as `found` in the final `answer` event (`null` when the guide showed nothing), for the panel beside the chat. The audit log keeps tool names only.
  - `STUDIO_SCHOOL_DAILY` (25): builds per school per day for class teams. `STUDIO_IP_DAILY` (40): builds per network address per day for class teams; a whole school usually sits behind one address, so raise it if classes build together. `STUDIO_GLOBAL_DAILY` (300): builds per day for everybody together. `STUDIO_DAILY_LIMIT` (25): builds per signed-in person per day. `STUDIO_SCHOOL_PENDING` (10): submitted pages per school waiting for a teacher (a team may have 3). `0` switches that kind of build off. The day is a rolling 24 hours. Also: 4 builds a minute per team, 8 wrong class codes per 15 minutes per address, and `STUDIO_CLASS_SECRET` (optional signing secret). Addresses are counted as a keyed hash, never stored.
  - New columns on `studio_projects` (`author_kind`, `team_label`, `data_json`) and `studio_use` (`school_id`, `ip`) are added automatically; old rows keep working. A class author has `user_id` 0 and `author_kind` `class`.
- **MCP endpoint (`/mcp`):** Model Context Protocol over HTTP (JSON responses) for adults and teachers who use their own Claude (for example Claude Code or the API). A teacher creates a project token (`POST /studio/api/tokens`, shown once); the client sends it as `Authorization: Bearer <token>`. Tools: the assistant's read-only data tools plus `get_vehicle_series`, `list_my_projects`, `get_project`, `save_project` and `submit_project`. It can save drafts only, never publish. 120 calls per hour per token. Claude.ai's own custom connectors expect OAuth, which this endpoint does not implement yet.
- Students under 18 should not use their own Claude.ai accounts; the Build studio inside the site is the route for them.

### Approval emails

When something waits for approval (a new account, a tool or a team plan sent for review) the admin gets one short email. Requests that come close together are collected into one email (5 minutes by default), at most 24 emails a day. The email holds only a display name, school, team or tool title and a link to Approvals, never a password. It uses the Resend HTTPS API and switches itself off when the variables are not set: `RESEND_API_KEY`, `NOTIFY_EMAIL` (with Resend's default sender `onboarding@resend.dev` this must be the address the Resend account was made with), and optionally `NOTIFY_FROM`, `SITE_URL`, `NOTIFY_DELAY_MIN`. Council sessions and weekly reports do not send email.

### Build studio workspace and student tools

`/cities/#/build` is a Claude-style workspace: chat on the left, the live page on the right. Claude builds a sandboxed page (no network). Inside the site a page can call `await cities.overview()` for school averages and delayed, grouped routes; it never gets vehicle positions. A team presses Submit to send the page to its teachers; once approved it appears under Student tools and in the menu for everybody, no sign-in needed. Teachers review pending tools under Student tools. A draft only lives in the browser until it is submitted; `POST /studio/api/preview` turns it into a 30 minute, owner-only preview URL for the sandboxed frame. Needs `ANTHROPIC_API_KEY` on the server.

## Alert rules, handbook, team plans and league

All of this lives in `school.js` and `studio.js` (same database, `DATA_DIR/app.db`). Databases made before it get the new tables and rows added; no existing account, message, project or handbook page is changed.

- **Alert rules (public to read):** `GET /app/api/alerts/rules` returns `{ rules, canEdit }`. Six rules are seeded: `co2_high` (1000 ppm), `pm25_spike` (25 ug/m3), `met_warning` (no limit), `sensor_quiet` (60 min), `battery_low` (20 %) and `temp_high` (35 C). Each has an English and a Greek `name` and `text` (kept in the code), `enabled`, `threshold`, `unit`, `severity` (`info`, `watch` or `warn`), and the allowed `min` and `max`. `PUT /app/api/alerts/rules/<id or key>` with `{ enabled?, threshold?, severity? }` is for teachers and admins only (401 without a session, 403 for a student); a limit must be a number inside its range (for example CO2 400 to 5000 ppm, silence 10 to 1440 min, battery 5 to 50 %, temperature 25 to 60 C), and every change is written to the audit log as `alert-rule`. The server only stores the rules; the Alerts page applies them to the data.
- **Public handbook:** `GET /app/api/handbook/public` returns `{ docs: [{ id, title, body, updated_at, kind }] }`: the pages the assistant reads for visitors (no title starting with "Staff", "Private" or "Internal", no old login-and-chat pages, the code-owned site guide included) with the raw GPS measurement numbers removed. Nine pages titled "Sensor guide: ..." (air temperature, air humidity, CO2, light, barometric pressure, PM2.5, noise, wind, and Reading a Met Office station) are added to the handbook once, also on old databases (`meta.sensor_guides_seeded`). Teachers edit or delete them in Manage, Handbook and the change stays; the assistant reads them like any other page.
- **Team plans (`studio.js`):** a team writes down a question, the sensors and data it will use, and notes. `POST /studio/api/plans` `{ title, question, sensors: [eui], data: [measurement id or source], team, notes }` works for a class team (the `sc_class` cookie; the team is always the one in the cookie, a `team` in the body is ignored), an old student account and a teacher. `PATCH /studio/api/plans/<id>` sets `status` (`draft`, `running`, `done`, `submitted`) and edits the fields (the owning team or a teacher); changing an approved or submitted plan sends it back to draft. `GET /studio/api/plans?scope=public` is approved plans for everybody, `mine` is this team's, `review` is the submitted ones for teachers (their school; admins see all). `POST /studio/api/plans/<id>/review` `{ decision: 'approve' | 'send_back', note }` is for teachers; only an approval makes a plan public. Text is stripped of tags and control characters, kept inside 80 (title), 400 (question) and 1000 (notes) characters, and refused when it holds a phone number, e-mail, link or social handle; sensors must be project sensors and data can be a measurement number (never the GPS ones) or `sensecap`, `dom`, `metoffice`, `air`, `openmeteo`, `sensorcommunity`, `metar`. The label is always `Team <name>, <school short>` (or `Teacher, <school short>`), never a student name. Limits: `STUDIO_TEAM_PLANS` (12) plans per team, 3 waiting per team, `STUDIO_SCHOOL_PENDING` (10, counted separately from tools) waiting per school, 150 per school, 12 new plans an hour per team and 40 per network address. Table `studio_plans`.
- **One queue:** `GET /studio/api/submitted` gives teachers the pending tools and plans of their school (admins: all) as `{ items: [{ kind, id, title, author_label, school, at, status }] }`, oldest first; everybody else gets only approved items, newest first (`?scope=approved` shows approved ones to a teacher too). Council sessions and weekly reports join the same list when their module calls `appCore.provide('queue:<name>', async ({ staff, pending, user }) => items)` (or `studio.addQueueSource(fn)`).
- **League (off by default):** `GET /app/api/league` answers `{ enabled: false }` until a teacher or admin sends `PUT /app/api/league { enabled: true }`. When on it gives `{ enabled, basis, basis_el, schools: [{ school, slug, points, parts: [{ key, label, label_el, value }] }] }`: schools only, never people or teams. A school gets 2 points for each sensor online (at most 5 count), 5 for each approved tool (at most 10) and 5 for each finished plan, meaning done or sent to a teacher (at most 10); the `basis` text says so in plain words.

## Sources, helpers, archive and operations map

The Data sources and Oversight pages read these public views. They show state and counts only: no key, no password, no vehicle position and no person. Errors are cleaned (addresses, keys and long tokens are removed) before they are stored. Every text comes in English (`detail`, `name`, `what`) and Greek (`detailEl`, `nameEl`, `whatEl`). The code is in `feeds.js` (book-keeping, archive, search, watch) and the wiring is in `server.js`.

- **Feeds (`GET /api/feeds`):** the five outside sources: `sensecap`, `dom` (Cyprus Met Office stations, pages and pictures), `openmeteo`, `sensorcommunity` and `metar`. Each has `enabled`, `lastOk` (ms), `lastError { at, message }`, `ok24h` and `fail24h` (calls that worked or failed in the last 24 hours, in 10 minute buckets), `everyMin`, `mode` (`live` or `demo`) and `status` (`ok`, `late`, `off`, `error`, `idle` when it is only asked on demand and has not been lately, `demo` when it is simulated). SenseCAP is `demo` in demo mode (`DEMO=1` or no keys), the weather services when `OPEN_METEO_MOCK=1`. A call is counted where it is made (the SenseCAP `api()` function, Open-Meteo, Sensor.Community, METAR, the Met Office feed, pages and pictures); waiting at the SenseCAP gate is not a call and is not counted. The counters are saved to `DATA_DIR/feeds-stats.json` (every 2 minutes and on SIGTERM), so a deploy does not blank them.
- **The switch (`POST /api/feeds/<id>` with `{ "enabled": false }`):** only a signed-in teacher or admin (an active student-app session); everybody else gets 403, and a request from another site is blocked. A switched-off feed makes no call at all (the Met Office savers rest too). Its endpoints still serve what is in the cache, however old, and answer `503 { "error": "switched off by a teacher", "feed": "<id>" }` when there is nothing. Saved history (`/api/cydom/history*`, `/api/dom/pages/history`) is local data and keeps working. In demo mode the switch for SenseCAP applies too, so the pages behave the same way. The state is kept in the student database (table `meta`, keys `feed_off:<id>`, and one line in the audit log per change) or, when the database is not available, in `DATA_DIR/feeds.json`.
- **Helpers (`GET /api/helpers`):** `history-saver` (the Met Office readings saver), `pages-saver` (warnings, sea, aviation and forecast pages), `caches` (including the SenseCAP call gate and its rest after a "busy" answer), `assistant` (on or off, and the number of questions asked today in Cyprus time, counted from the assistant log in the student database) and `studio` (on or off, pages waiting and approved). Each has `status` (`ok`, `late`, `off`, `error`), `lastRun`, `nextRun` and a `detail`, all read from the real state; a saver says `off` in test mode or while the Met Office feed is switched off.
- **Archive (`GET /api/archive`):** days of Met Office readings saved (`cydom.days`, readings counted per file and remembered until the file changes), stations, bytes, the number of saved versions of each Met Office page, first and last day, and download links. `updated` is in milliseconds.
- **Search (`GET /api/search?q=&limit=`):** every word must be in the text, ignoring case and Greek accents; results are the Met Office pages as last read (`source: "metoffice"`) and earlier saved versions (`source: "archive"`, newest first, at most 5 per page). At most 100 characters and 50 results. **Watch (`GET /api/dom/watch?days=&limit=`):** what changed on the saved pages (`issued`, `ended` or `changed`, with the page's own words as `text`). For the warnings page "issued" and "ended" are worked out from the text (a page that says none, or is empty, is calm), so a change of wording is reported as `changed`. Only changes between two saved copies are listed; a page is saved at most every 30 minutes. These three views are limited to 60 requests a minute per address.
- **Operations map (`GET /api/ops`):** `nodes` (`sensors`, `server`, `feed`, `assistant`, `store`, `site`; each with `status` and `detail`) and `edges`, built from the same state. Vehicle numbers are counts only.
- **Variables:** none are needed. `OPEN_METEO_BASE`, `OPEN_METEO_AIR_BASE`, `OPEN_METEO_MARINE_BASE`, `SENSOR_COMMUNITY_BASE` and `METAR_BASE` point the weather services at a fake service in tests (like `SENSECAP_HOST`, `DOM_BASE` and `CYDOM_URL` already do).

## Council room and weekly reports

Two modules, `council.js` and `reports.js`, both served under `/council/api/*`. Each is created like `studio.js` (`createCouncil({ appCore, bot, data, apiKey, model, baseUrl, viewer, log })` and `createReports({ appCore, data, apiKey, model, baseUrl, log })`, each returning `{ enabled, handle }`) and each has a `handle(req, res, url)` that returns true only when it served the route. They use no extra packages and keep their own tables in the student database (`council_sessions`, `council_use`, `council_reports`).

- **Council room (`council.js`):** six AI role-play seats (environment, health, transport, economy, planning, youth) each read the same data brief and argue a city question in plain words; a Chair then scores the options, says what the evidence suggests and lists the data that is missing. The six seat calls run in parallel (450 tokens each), then the Chair (900 tokens). Everything is labelled "AI role-play" and every session lists the readings it used. If the assistant key is off, `GET /council/api/status` says `enabled: false` with a calm message (`message`, `message_el`) and a question gets 503 `not_configured`.
- **Endpoints:** `GET /council/api/status` (`enabled`, `remaining`, `limit`, `available`, `retry_at`, `seats`, `label`, `aiNote`, `demo`, `viewer`, `staff`; it sets no cookie). `POST /council/api/ask {question}` answers as newline-separated JSON events: `start`, `data` (the readings used), six `seat` events (`id`, `stance` support, oppose or mixed, `score` 1 to 10, `text`, `dataUsed`, `usedIds`, `missing`, `failed`), `chair` (`scores`, `verdict`, `lean`, `action`, `risks`, `needs`, `average`, `counts`), then `done {sessionId, status:'draft', remaining, limit}`. An `error` event (`unavailable` or `failed`) can come instead of `done`. `GET /council/api/sessions?scope=public|review|mine` (`review` also takes `status=draft|published|rejected|all`), `GET /council/api/sessions/<id>` and `POST /council/api/sessions/<id>/review {decision:'publish'|'reject', note}`.
- **Review:** a session is saved as a draft. A teacher or admin publishes or rejects it (a rejected or published one can be changed again); visitors only see published sessions, and the person who asked still sees their own, with the teacher's note. Sessions asked by a visitor are visible to every teacher; sessions asked by a signed-in person or a class team belong to that school's teachers and to admins. Authors are shown as "A visitor", "Teacher, School", "Student, School" or "Team X, School", never by name. Decisions go in the audit log. Waiting sessions and weekly reports also appear in the teachers' Submitted work queue (`GET /studio/api/submitted`) through `appCore.provide('queue:council', ...)` and `appCore.provide('queue:reports', ...)`.
- **What the models are given:** only the public view of the data: per school the number of vehicle sensors online, fresh averages of the main measurements, simple 24 hour trends (rising, falling, steady), the Met Office station summary and the warnings page text, and the PM2.5, PM10 and wind model estimates (labelled as estimates). No position, no sensor id, no GPS measurement and no vehicle name is ever read or sent; numbers with three or more decimals are rounded, and the brief says plainly what the site does not have (for example traffic counts). The question goes only into the user message, between `<question>` tags, as data; angle brackets, control characters, phone numbers, links, e-mail addresses and social media names are refused or removed. Answers are scrubbed before they are stored or shown: links, e-mail addresses, phone numbers and fine coordinates are removed, scores are clamped to 1 to 10, an unknown stance becomes mixed and reading ids that were not in the brief are dropped.
- **Limits (rolling 24 hours, counted in `council_use`; visitors and networks are stored only as keyed hashes):** `COUNCIL_VISITOR_DAILY` (3) per visitor cookie, `COUNCIL_USER_DAILY` (15) per signed-in person, `COUNCIL_IP_DAILY` (30) per network address, `COUNCIL_GLOBAL_DAILY` (80) everybody together, `COUNCIL_MAX_RUNNING` (3) sessions running at once (one per person). A limit of 0 switches that kind off. A refusal is HTTP 429 with a plain sentence, a `code` (`daily`, `ip`, `global`, `busy`, `off`), `retry_at`, `retry_after` and a `Retry-After` header. A session that could not reach the assistant at all is given back and not saved; one the visitor left in the middle is not saved but counts. `COUNCIL_KEEP_DAYS` (90) is how long unpublished sessions are kept.
- **Weekly reports (`reports.js`):** built from real numbers, never invented: per school the sensors online now (current week only) and the share of the week in which sensors reported, the weekly average, lowest and highest of each main measurement with a daily average for the seven days (read through the data module, never GPS), and the Met Office warnings seen that week. The warnings history is read from the saved page versions in `DATA_DIR/pages` (or `data.pageVersions` if the server provides it); the page as it is now is added for the current week only. If the assistant is on, one short AI summary in English and Greek is added and labelled as AI; without a key the report is just the numbers. No student names, vehicle names or positions are in a report.
- **Report endpoints:** `GET /council/api/reports` (released only; teachers add `?scope=all` and `?school=<slug>`), `POST /council/api/reports/generate {school?:slug|'all', weekEnding?}`, `GET /council/api/reports/<id>` (released, or a draft for the teachers who manage it), `POST /council/api/reports/<id>/release` (optional `{dropSummary:true}` to release the numbers without the AI text) and `/withdraw`. A teacher can make reports for their own school and for "all schools"; an admin for any. A week must end today or in the last 21 days. Releasing a report withdraws an older released one for the same school and week; generating again replaces a draft. `COUNCIL_REPORT_DAILY` (40) caps reports made per day.

## Data layers and the master brain

The page `#/layers` lists every open source we know for Cyprus's cities as **layers** in four groups (our sensors, official stations, models and satellites, city context). Switch layers on and the **master brain** reads exactly those, one city at a time (Larnaka, Lefkosia, Limassol, Paphos, or all four side by side) and writes findings. Every finding names its sources, says how sure we are (high, medium or low) and shows when sources disagree. Where a layer is missing it says "not enough data" and never guesses.

- **The register (`sources/`, `vocab/`):** one JSON file per layer, checked against `sources/_schema.json` and the rules in `sources/README.md`. `node scripts/check-sources.js` checks them all (exit code 1 on an error; a warning such as "licence unknown" does not fail). `vocab/variables.json` holds the measurements (label in two languages, unit, plausible range, how far two sources may differ and still agree). `vocab/places.json` holds the four cities. A broken file is skipped and listed in `problems`; it never takes the page down. Anyone can suggest a source with a pull request; see `sources/README.md` (written for students and for their own Claude).
- **`layers.js`** is created like the other modules (`createLayers({ root, dataDir, appCore, data, feeds, apiKey, model, baseUrl, log })` returns `{ enabled, handle }`) and uses no extra packages. It reads the data the server already has through the same public view as the assistant (no positions, no sensor ids).
- **Endpoints:** `GET /layers/api/register` (the layer cards with live status `live`, `late`, `down`, `off`, `planned`, `candidate` or `retired`, the counts, the mission, files with problems, `brain.configured`, the four places), `GET /layers/api/layers/<id>` (the full register entry; the name of a secret is never shown, only the kind of key), `POST /layers/api/brain { city, layers?, question? }`, and for teachers `PUT /layers/api/mission { en, el }` and `POST /layers/api/mission/reset`. The mission is kept in `DATA_DIR/layers-mission.json`.
- **How the brain decides:** the code, not the AI, does the work. For one city it takes the readings of the layers that are on and live, compares sources of the same measurement with the tolerances in `vocab/variables.json`, counts independent sources (two sources with the same `upstream` count as one) and sets the confidence. The assistant (when `ANTHROPIC_API_KEY` is set) only words what the code found, through one forced tool call (`give_findings`, English and Greek). Every number in its text is checked against the readings: a finding with an invented number falls back to the template text for that finding. Without a key the findings are written from templates and are labelled so. A question (`give_answer`) is answered the same way and is refused with `503 not_configured` without a key. Nothing sent to the assistant holds a coordinate or a position.
- **Context layers (`context.js`, `context/`, research handoff tickets T04 to T07):** three layers are read from reviewed, frozen files instead of a live service: bathing-water quality by year (EEA, 2004 to 2025), national municipal waste (CYSTAT, 2023 and 2024) and solar panel scenarios (PVGIS 5.3 model). Each has a period instead of a freshness, is checked against the hash in `context/manifest.json` and against content rules before it is shown, and is never read by the master brain. `GET /layers/api/context/<id>` gives the reviewable output (bathing water takes `?season=` and `?base=` for a two-season comparison of the sites that are in both), `GET /layers/api/context/<id>.csv` the table with the credit and the file identity. A layer's dialog shows it (`contextView` in `pages/layers-flow.js`). In the data-flow scene a layer the brain does not read is a hollow dot with no stream. Details and the rules: `context/README.md`. Tests: `node tests/context/unit_test.js` (46 checks, with the handoff's acceptance numbers).
- **Weekly reports keep an identity of their evidence (handoff ticket T08, first part):** when a report is made, its numbers are hashed (`identity.evidence`, with the version of the sensor list they were made with). The release sends the hash the teacher saw; a draft that was made again in the meantime, or whose saved numbers no longer match their hash, is not released (HTTP 409, `code: "evidence"`). A released report is never changed by making a new one: that creates a new draft. The report page says "saved numbers, not live" with the evidence version. Not done: attaching the source files' own identities, absolute investigation windows and protocol versions. Tests: `node tests/reports-identity/api_test.js` (11 checks).
- **Clocks and lineage (repairs from the research handoff of 13 November 2026, tickets T02 and T03):** each pollutant of an official air-quality station is dated by its own hour (`pm25Time`, `pm10Time` from `eea.js`), so a fresh PM2.5 never lends its time to an old PM10, and a value whose own time is unknown is left out. A reading dated more than 5 minutes ahead of the server (`CLOCK_SKEW`) is a wrong clock: it is not fresh, it never wins as the newest, and the gap says "its clock is set in the future". A group of our sensors that went quiet stays "down" but keeps its last-seen time. Sources that share an upstream count as one piece of evidence by connected components (A uses X, B uses Y, C uses X and Y: one group in any order), and a model or satellite product that names no upstream is not counted as independent of another such product. **Reviewed sensor assignments:** a teacher or admin can say for each sensor what it is on (classroom, bus, car), which city it is in and the day it was put there (the button "Where each sensor is" on the Data layers page; `GET` and `PUT /layers/api/assignments`, staff only, saved in `layers-assignments.json` in the data folder with every revision kept in `layers-assignments-history.jsonl`). A reviewed line replaces the guess from the sensor's name; a move is a second line, and each reading belongs to the place the sensor was in when it was taken (from that day up to, not including, the day of the next line). A sensor nobody reviewed is still placed by its name, and the layer's note says how many are. Nothing of the list is public. Tests: `node tests/layers-repairs/unit_test.js` (40 checks) and `node tests/layers-repairs/assign_test.js` (15 checks, real server and browser).
- **Limits:** `LAYERS_BRAIN_HOURLY` (60) assistant readings per hour, `LAYERS_ASK_PER_HOUR` (12) questions per address per hour (429 with `code: "rate"`), a question is 6 to 300 characters, the same city and layers are served from a 10-minute cache.
- **The live views (`public/site/pages/layers-live.js`, `layers-live.css`):** the centre card of the page has eight tabs. *Live map*: Cyprus with the wind as moving streaks (the weather model's grid points, drawn on a canvas), the sea coloured by its temperature, model haze, a pulsing mark and live value for each school, the official stations, a violet band that sweeps when the newest satellite data arrived, a chip with a countdown ring for every live layer, and a replay of the last day. *Pulse*: one row per layer with a trend line, its value and the time to its next reading; a row flashes when a new reading arrives. *Compare*: one measurement of one city from every layer that has it, on one chart, with the code's finding under it (a layer's dialog has a button that jumps here). *Sky to ground*: one scene from space down to the sea (satellites, wind, the model's grid with its real numbers, a school, a bus drawing, a weather mast, the sea), a dotted line from each to its tag and a dot that travels while that layer answers; on a narrow screen the tags are listed under the scene. *All our data* (`public/site/pages/layers-flow.js`): a data-flow scene where every connected layer is a dot at its own height and sends dots of data to the master brain, faster when it updates more often; layers that share a measurement first join into a river, which is smooth and green when the sources agree for the chosen city and red and rough when they differ (`rivers` in `/layers/api/live`, decided with the brain's own tolerances; indoor readings are left out); the brain sends a beam to each city; pressing a dot, a river or a city lights its path and says the numbers in words. Under the scene are the six levels from space to the sea, with the connected layers as solid chips (live value) and the sources on the list to add as dashed chips (the register's planned and candidate layers, plus 18 from the research handoff of 13 November 2026, written in the file as `ROADMAP`; the handoff's first three are connected as context layers). *Stack*: the earlier 3D planes. Vehicles are never drawn: buses and cars are a count and a city-level number. Everything that moves stops for `prefers-reduced-motion`, and the wind stops while the map is off screen or the tab is hidden.
- **Replay the day and Data core (`public/site/pages/layers-day.js`, `layers-cine.js`, `layers-cine-gl.js`, tests in `tests/layers-live/browser_test.js`):** two more tabs of the centre card, both adapted from the owner's Nemesis project. *Replay the day*: the saved day (`GET /layers/api/replay`) as a strip of bars with first, play and newest buttons and arrow keys; under it the four cities ranked by the chosen number at that moment, changing places while it plays; each card has a line from the day's lowest to highest value and, when opened, the layer behind each number. *Data core*: the cinematic Cyprus scene of Nemesis (`cinema-gl.js`, ported unchanged apart from its data hooks) fed with `GET /layers/api/live`: the layers answering now on one side, the four cities and two views on the other; each travelling dot is one real reading, named in the amber box; "Readings in" adds up the readings and "Sources agree" counts the comparisons that agree. The orb and the map are decoration and carry no numbers; a sentence under the scene says the totals in words. It needs WebGL and three.js r128, served from `public/vendor/three-r128/` (MIT, see `SOURCE.txt` there) and loaded only when the tab is opened; without WebGL a note points to *All our data*. With reduced motion the replay moves one step per press and the core is one still picture. No vehicle position is used in either view. The first "Mission control" prototype was removed in favour of the Data core. The platform's name is Athena (Αθηνά; the project is still Smart Cities): the mark in `shell.js` (`brandSvg`) and `public/site/logo.svg` is her owl, with eyes drawn like sensor rings, and the name is on the menu, the page titles, the browser icon and the plate over the Data core. On a computer the side menu is tucked away on every page (`body.tuck` in `shell.js` and `site.css`): the Menu button opens it as a drawer and the pointer at the left edge lets it slide in. On the home page the scene is a floating tile, every window has one sentence on what is inside, and the windows are packed boxes (`pack` in `pages/home.js`). The Data core is also shown on the home page (`pages/home.js`), between the tour route and the island, once `/layers/api/live` answers; there its panels open the Data layers page on that city or view (through `SC.layersOpen`).
- **The data behind them:** `GET /layers/api/live` (the newest value of every layer for the four cities, wind, sea and station points for the map), `GET /layers/api/replay` (the last day for the map) and `GET /layers/api/compare?city=&variable=`. The server logs one point per city, source and measurement every 5 minutes, keeps 26 hours and saves them in `layers-pulse.json` in the data folder, so a new deploy keeps the lines. It reads only what the server already fetched (the brain's own `evidenceFor()`). Tests: `node tests/layers-live/api_test.js` (40 checks) and `node tests/layers-live/browser_test.js` (151 checks: desktop, Greek, phone, reduced motion; needs Playwright).
- **How the assistant is called (`makeClaude` in `council.js`, shared by the master brain, the Council room and the weekly reports):** these calls ask for a structured answer by naming one tool. Claude Sonnet 5.5 and later refuse a forced `tool_choice` ("tool" or "any") with HTTP 400 and think by default (thinking counts toward `max_tokens`), so for those models the call is sent as `tool_choice: auto`, with one sentence at the end of the message saying which tool to call, and `thinking: between_tools` (the lowest setting). If the model still answers in words the call is repeated once; the answer is read with `structured()`, which also accepts JSON written as text, and every caller already has a fallback (the template findings, a failed seat, no weekly summary). For a model that is not known to refuse a forced `tool_choice` the call is sent as written, and a 400 about `tool_choice` or `thinking` is learned (one log line) and repeated in the other shape. Tests: `node tests/claude-call/call_test.js` (the caller against a pretend API) and `node tests/claude-call/layers_e2e_test.js` (the real server and the master brain, ports 3961 and 3962).

## Additions from the GitHub scouting (November 2026)

Features added from the open-source scan. All of them keep the site's rules: no npm dependencies, nothing loaded from a third-party
server by a student's browser, English and Greek everywhere, and a failed outside request gives one log line and a plain
"not available right now". Licences and pins of every copied or ported piece are in `THIRD_PARTY_NOTICES.md`.
Their test scripts are kept outside the repository for now (they hard-code ports and local paths); ask if you want them moved into `tests/`.

**Sensor quality checks (qc).** `qc.js` runs four simple tests (gross range, spike, rate of change, flat line) on each sensor's last day of 10-minute readings. `qcwatch.js` feeds it from the same series the charts use and adds a `qc` field to `/api/devices` and to each reading in `/api/latest`. Nothing is ever deleted or hidden, and nothing sends a message. Pages show a quiet "Check this sensor" note only when `qc.status === 'check'`.

* Tune numbers in `vocab/qc.json` (spike, flat-line times, ranges) and `vocab/variables.json` (`max_step`). Write the `basis` for every change.
* Switch off: start with `QC=0`. If the vocab files cannot be read it switches itself off with one log line.
* A sensor is "check" when any test says fail, or a stuck run reaches the newest reading, or 3 or more separate suspect points fall in the last 6 hours. Only sensors with a reading under 3 hours old are judged. Change `summary` in `vocab/qc.json`.
* Add a variable: give it an entry in `vocab/variables.json` (range, `max_step`) and `vocab/qc.json`; the mapping from a measurement to a variable is `variableOf` in `qcwatch.js`.

### Air quality index and the shared PM2.5 scale (`aqi.js`)

`aqi.js` (server) and `public/site/aqi.js` (browser, `SC.aqi`) are ONE file in two places. Keep them byte-identical:
edit one, copy it over the other (a test fails otherwise). Pure functions, no network.

* One scale for every page: the six European Air Quality Index bands for PM2.5 (hourly ug/m3: 5, 15, 50, 90, 140), our own
  colour-blind-safe Viridis colours (not the EEA's or the EPA's, never call them "official"), EN and EL names.
  Use `SC.aqi.classify(v, { pollutant: 'pm25', source: 'sensor' | 'model' })`, `SC.aqi.legend()` and `SC.aqi.chip()`; do not write a new PM2.5 colour function.
  Readings from low-cost sensors or models are "indicative": show the note next to the legend.
* `usIndex()` gives the US EPA AQI (PM2.5 table in force since May 2024, PM10, ozone 8 h, NO2 1 h). It expects the averaging the US index
  defines (24 h for PM), which the pages do not have, so the pages use the EAQI.
* `SOURCES` at the bottom of the file says which numbers are verified and which are not (some PM10/NO2 top rows, the Greek names).
* `/api/air` points carry `european_aqi` (Open-Meteo's own 0 to 100+ number, a model value) or `null`. If Open-Meteo ever rejects the variable
  the server logs one line and asks again without it. In `OPEN_METEO_MOCK=1` it is computed from the fake values.
* The Viridis table is from d3-scale-chromatic (ISC), licence in `public/vendor/d3-scale-chromatic/LICENSE`.
* Not yet on the shared scale: `public/map.html`, `public/3d.html`, `sources/openmeteo-air.json`.

### Official air-quality stations (EEA) and the sensor comparison

`eea.js` downloads hourly PM2.5 and PM10 for Cyprus from the European Environment Agency's Air Quality Download Service
(unverified "up-to-date" data, E2a), keeps about 5 weeks on the volume (`DATA_DIR/eea/cy-pm.json`) and serves them read only:

- `GET /api/eea/status`, `/api/eea/stations`, `/api/eea/series?station=&pollutant=&hours=`, `/api/eea/compare?eui=&mid=&days=`
- the Data layers page shows the layer `air-quality-stations-cy` (live, late, or "not available right now")
- the Explore page has the card "My school sensor vs the nearest official station" (`public/site/pages/explore-air.js`)

`metrics.js` holds the statistics (slope, intercept, R2, RMSE, NRMSE, bias) and the EPA PM2.5 targets (24-hour averages). The targets are
a yardstick, not a certificate: EPA's real test needs 3 identical sensors beside a monitor for 30 days.

How it behaves: first update 15 s after start, then hourly; a failure is one log line and the layer says "not available right now";
the last saved data keep being served. Only fixed EEA hosts (`FIXED_HOSTS` in `eea.js`) are called, with a 20 s limit and size caps.
Parquet files in SNAPPY, GZIP, BROTLI and ZSTD (Node 22.15 or newer) are read; LZ4 is not and gives a clear log line.

Environment (all optional): `EEA=0` switches it off; `EEA_DAYS` (2 to 60, default 35); `EEA_EVERY_MIN` (default 60);
`EEA_TZ_HOURS` forces the clock of the files (default: the station's `Timezone`, else +2); `EEA_API_BASE`, `EEA_META_URL`,
`EEA_STATIONS_URL` point it at a test server (and allow that host). In test mode (`OPEN_METEO_MOCK=1`) it is off unless `EEA_API_BASE` is set.


After a deploy, look in the Railway log for `EEA air quality: first update done` and check that `last Start` is close to the real time.
Vendored code: `vendor/hyparquet/` (MIT, v1.33.0, unchanged `src/`).

### Feels-like, trail simplification and downsampling

* **Heat index** (`public/site/heatindex.js`): NWS heat index from temperature (C) and humidity (%). `SC.heatIndex.feelsLike(tC, rh)` returns `{ok:true, c, f}` inside the valid box, or `{ok:false, why, c}` (the plain temperature and a reason) outside it. The box is the constant `RANGE` at the top of the file (80-110 F, 40-100 %, result up to 137.5 F). It is comfort only, nothing to do with PM2.5.
* **Trails** (`trailsimplify.js`): `simplifyTrail(rows, {tolM, gapMs, gapDistM, maxSpanMs, maxPoints})` on rows `[t, lat, lng, value]`; `simplifyTrails` does a `{id: rows}` map; `publicToleranceM(grid)` gives half a grid cell in metres. It only removes rows and keeps the same objects, so it can never weaken a privacy rule, **but it must run after privacy.js** (see `trailsFor` in `server.js`). The gap constants `GAP_EXACT_MS` (10 min) and `GAP_PUBLIC_MS` (45 min) mirror `GAP_MS` in `public/map.html`; change them together or the map will draw false dashes.
* **Downsampling** (`downsample.js`): `lttb(points, threshold, {x, y, gap})` thins a long time series and keeps its spikes. Not used by any route yet. To use it on one column of the Met Office history, for example: `lttb(history.rows, 500, { x: 0, y: history.keys.indexOf('temp') + 1, gap: 45 * 60000 })`.

### Bus timetables (`gtfs.js`)

Planned bus timetables for Cyprus, from the national transport portal (static GTFS, CC BY 4.0). No live buses, no GTFS-Realtime, no vehicle of ours involved.

- **What it does:** downloads each GTFS zip at startup (if the saved copy is older than 6 h) and every 7 days, reduces it to stops, lines and first/last times, keeps the result in `DATA_DIR/gtfs/<id>.json` (plus `state.json`), serves it at `/api/transit/*`. Used by the "Bus lines near this school" block on the trip page.
- **Default feeds:** emel (Limassol), npt (Nicosia), lpt (Larnaca), osypa (Pafos), osea (Famagusta), intercity, pame (Pame Express). Default hosts allowed: `motionbuscard.org.cy`, `traffic4cyprus.org.cy`, `www.traffic4cyprus.org.cy`.
- **Settings (all optional environment variables):**
  - `GTFS_DISABLED=1` switch off downloads (a saved copy is still served)
  - `GTFS_FEEDS` JSON list `[{"id":"emel","name":"EMEL","url":"https://..."}]` replaces the built-in list (id: 2-20 letters, digits, dashes)
  - `GTFS_URL_TEMPLATE` address with `{n}` for the built-in file numbers
  - `GTFS_ALLOW_HOSTS` extra allowed hosts, comma separated (redirects are re-checked against this list; plain http only for loopback)
  - `GTFS_REFRESH_DAYS` (7), `GTFS_RETRY_HOURS` (6), `GTFS_STARTUP_MIN_AGE_H` (6), `GTFS_CHECK_EVERY_MIN` (60)
  - `GTFS_MAX_ZIP_MB` (100), `GTFS_MAX_FILE_MB` (400, one file inside a zip), `GTFS_TIMEOUT_S` (20, max 20), `GTFS_TOTAL_TIMEOUT_S` (120)
  - `GTFS_RATE_PER_MIN` (60 per IP; 10 times that in total)
- **Test mode:** with `OPEN_METEO_MOCK=1` no download happens unless `GTFS_FEEDS` or `GTFS_URL_TEMPLATE` is given (then tests can use a local fake server).
- **Log lines to know:** `GTFS <id>: <host/path> gave <size> in <s> (ETag|no ETag, Last-Modified|no Last-Modified); N stops, N lines, ...; timetable <from> to <to>; shapes yes|no; saved <size>`, then `GTFS: N timetable files checked, N fine, N failed; N stops from N of N files; memory N MB`. A failure is `GTFS <id>: could not update (<reason>); <what stays>`.
- **Check it by hand:** `/api/transit/status` (per-file stops, lines, validity, `expired`, `checkedAt`, last error), `/api/transit/school?school=limassol`.
- **Hold the student block back:** in `public/site/pages/trip.js` remove the `const bus = busBlock(); root.append(bus.node);` lines in `render()` and the `bus.near(...)` line in `openTrip()`.

### SenseCAP live stream (optional, off by default)

The server can listen to Seeed's OpenStream MQTT feed instead of asking the REST API all the time. Every reading SenseCAP receives is pushed to us;
REST is then used only for the device list (every 5 min), a slow safety poll of the latest readings (every 15 min) and as a fallback.
If the stream drops, goes quiet for 30 min, or a teacher switches SenseCAP off in the Feed list, normal polling (60 s) returns at once.

**It is off until you set all three:** `SENSECAP_MQTT=1`, `SENSECAP_ORG_ID` (the organisation id on the SenseCAP portal; the broker user name is `org-<id>`; the key is the existing
`SENSECAP_API_KEY`) and `SENSECAP_MQTT_TLS_PORT`. The broker login is the API key, so the connection is always TLS with full certificate checking; there is no plain mode and no
setting for one (ports 1883, 8083 and 80 are refused). Seeed's documentation names no TLS port, so there is no default: ask Seeed or test one with
`openssl s_client -connect sensecap-openstream.seeed.cc:<port> -servername sensecap-openstream.seeed.cc </dev/null` (it sends no key), then try it on a staging deploy.
`SENSECAP_MQTT_HOST` may be `sensecap-openstream.seeed.cc` (default) or `sensecap-openstream.seeed.cn` only.

Tuning (milliseconds, optional): `SENSECAP_MQTT_SAFETY_MS` (default 900000), `SENSECAP_MQTT_DEVICES_MS` (300000), `SENSECAP_MQTT_SILENT_MS` (1800000).
Where to look: Helpers page, "Caches" card (one extra sentence). In the server log: "SenseCAP live stream: ..." lines (state changes only). Code: `mqtt.js` (the client),
`sensecap_stream.js` (topics, checks, overlay, health). GPS from the stream is handled exactly like GPS from REST: only teachers and admins see exact values.
Tests: see the package report (a fake TLS broker in `tests/mqtt/`).

### Build studio: reading and changing a draft's code, Share and QR codes

**Code tab.** In the Build studio a signed-in student sees Preview | Code next to the draft. The code is shown highlighted
(read view) or in a plain `<textarea>` (Change the code). "Run my changes" posts to `POST /studio/api/projects/:id/code`,
which calls `saveProject()` with `via = 'student-edit'`: same checks, same 120,000-character limit, same reset to draft, same
teacher review as every other save. The teacher reads what is stored. The sandboxed preview is unchanged
(`sandbox="allow-scripts"`, served by `/studio/p/:id`).

- Undo: `studio_projects.html_guide` keeps the last version the studio built; `GET /studio/api/projects/:id` returns it as
  `guideHtml` (editors only). A studio save (`via = 'studio'`) clears it logically (`guideHtml` is null unless `via = 'student-edit'`).
- Staff lists carry `flags: ['coordinates', 'edited']`; the Approvals card shows a note for `edited`.
- Rate limit: 60 code saves per 10 minutes per person (`hits.wait('code:' + user.id, ...)`).
- Client code: `public/site/studio-code.js` (loaded lazily by `pages/studio.js`; without it the draft shows the preview alone, as before)
  and `studio-code.css`. The tokenizer is in the same file and is linear time on purpose (do not replace it with a regex
  grammar library without a worst-case test: `tok_fuzz.js` style). To change colours edit `.sd-hl-*` in `studio-code.css`
  (keep 4.5:1 on `#0a1424`).
- Not changed on purpose: CSP, `/studio/p/:id`, preview tokens.

**QR codes.** `public/vendor/qrcodegen/` (Project Nayuki, MIT) is loaded on demand by `SC.qrLoad()` (`public/site/qr.js`).
`SC.qrSvg(text, opts)` draws black modules on a white quiet zone (also in the dark theme: scanners need it);
`SC.qrFigure(text, {caption, label})` is the small figure used in report footers. Encode only this site's own addresses,
never a name or anything personal. Used by: Share panel of an approved tool (`/studio/p/<id>`), footer of a released weekly
report (`/#/reports/<id>`) and of the print summary (`/#/reports?tab=summary`). If the generator cannot load, the link text still works.


### Build studio: Build with blocks (`blocks.js`, `public/site/blocks.js`)

A second way to make a tool, next to "Describe it". A signed-in student (or teacher) picks a few choices from menus: **Show**
(a measurement at a school), **for the last** (1, 3, 6, 12, 24, 72 or 168 hours), **as a** (line chart, bars, big number, small table),
0 to 3 **When it goes above / drops below N, colour it red / orange / green / blue and say "..."** blocks, and 0 or 1
**Compare with** another school. Nothing a student types is ever run: the choices are a JSON **recipe**, and the page is drawn
from it by the server as plain HTML and SVG with no script at all.

- Routes (all need a signed-in account, same as the studio): `GET /studio/api/blocks/options` (what can be chosen, from the real
  data: schools, measurements with their units and which schools have a sensor), `POST /studio/api/blocks/preview`
  (`{ recipe, title?, lang }` gives a preview token like `/studio/api/preview`, plus the plain-words `sentence`, the sensor and
  reading counts), `POST /studio/api/blocks/save` (`{ id?, recipe, title?, lang, submit?, show_name? }`). Rates: 120 previews and
  40 saves per 10 minutes per person.
- Storage: it is a normal `studio_projects` row with `via = 'blocks'` and the recipe in `recipe_json`. `html` is a snapshot, so the
  Code tab, the teacher's review, approval and the public gallery all work unchanged. Every save resets the status to draft, so an
  approved tool cannot be swapped for something else. The teacher reads `idea`, which is the recipe said back in one plain sentence
  (English or Greek, the language the student was using; both are in `project.sentence`).
- The live page: `/studio/p/:id` draws an approved or draft block tool again from its recipe every time it is opened (fresh numbers,
  the school's own sensors, 60 s cache so the shared SenseCAP limit is never hit by page views). The page is drawn live when the safe-box
  frame asks for it (`sec-fetch-dest` other than `document`); the top-level request for the wrapper page, and any failure while
  drawing, get the stored snapshot.
  If a student changes the code by hand (`via = 'student-edit'`) or asks the studio for a change (`via = 'studio'`) the tool is no longer
  a block tool and the stored page is served, as it always was.
- What it reads: only the studio's public data (`botData`: devices, names, series), pooled per school into an average per time
  bucket. **Never GPS**: the GPS measurements (4197, 4198) are not offered and are refused. Exact vehicle positions are never
  involved. A school with no sensor for a measurement is not offered for it.
- Privacy: the alert message (60 characters at most) and the title go through the same private-text rules as the studio (no names,
  links, e-mail addresses) plus `phoneLike()` in `blocks.js`, which also catches phone numbers written with spaces, dots or dashes.
  Text is escaped everywhere it is drawn.
- Words: every sentence, label and message exists in English and Greek (informal singular). The sentence is built in one place,
  `sentence()` in `blocks.js`. Greek names for schools and measurements are in `SCHOOL_EL` and `MEAS_EL`; a measurement that is
  not in `MEAS_EL` is shown with its English name.
- Front end: `public/site/blocks.js` (`SC.blocks.mount(host, opts)`) and `blocks.css`, loaded lazily by `pages/studio.js` when the
  "Build with blocks" tab opens. Native `<select>` and `<input>` fields, so it works with a keyboard, a screen reader and a phone.
  Optional blocks are added with the buttons on the left (press or Enter), not by dragging. The preview is in the same safe box
  (`sandbox="allow-scripts"` iframe) as any draft.
- Limits on purpose (a fixed stack): the order of blocks does not change; when several alerts are true the first one in the stack
  wins; "Compare with" is another school (not outside air or a model); one measurement per tool.
- To add a choice: a new measurement needs nothing (it appears when a school has a sensor for it; add its Greek name to `MEAS_EL`).
  A new chart type or colour needs changes in `blocks.js` (`CHARTS`, `COLOURS`, `render`), the Greek words, the menus in
  `public/site/blocks.js` and a test case.
- Tests in `tests/blocks/` (no dependencies except the last): `node tests/blocks/unit_test.js` (choosing, checking, the sentence,
  drawing), `node tests/blocks/api_test.js` (a real server in demo mode with a student, a teacher and a visitor), and
  `node tests/blocks/browser_test.js` (Chromium through Playwright, which is not a dependency of the site: English, Greek and a
  phone width; it prints where it saved the screenshots).

### Guide search in Greek, and safe fetching

**Greek search.** The AI guide's handbook, data-layer and gallery lookups (`search_handbook`, `list_data_layers`, `gallery_ideas`, `sensor_guides` in
`studio.js`) use `guidesearch.js`, which uses `greek.js`. A question can be Greek with or without accents, in capitals, or in Greeklish (`ripansi`),
or English. Greek questions find English-only handbook pages through the word groups in `guide-terms.json`.

- To make a term findable in the other language, add it to a concept in `guide-terms.json` (`el` and `en` lists; a Greek word may end with `*` to
  mean "any ending"; a phrase needs all its words). Have a Greek-speaking teacher read Greek wording. The file is read at startup; if it is missing or
  broken the search still works, only without that bridge.
- The Greek stop words are `vendor/stopwords-el/` (MIT, see `SOURCE.md` there). Do not edit that file; fix quirks in `greek.js`.
- The search is an in-memory scorer on purpose (the handbook has about 20 pages; an SQLite FTS5 prototype was slower to build and less accurate on the
  test questions). Edits to handbook pages show up immediately.
- Tests: `greek_test.js`, `search_test.js`, `server_search_test.js` (plain `node file.js`, no dependencies).

**`safefetch.js`** is a library for server-side fetching of web pages that cannot be turned against our own network. It is **not used by any feature
yet**. `safeFetch(url, { allowHosts: ['www.example.org', '*.europa.eu'] })` returns `{ ok, status, url, redirects, contentType, bytes, body, text }`
or throws a `SafeFetchError` with a `code`. It resolves DNS itself and connects to the checked address, blocks private, loopback, link-local (cloud
metadata), CGNAT, multicast and IPv6 internal ranges in every spelling, allows only http and https on ports 80 and 443, follows at most 3 redirects
and checks each one, caps size (1 MB) and time (10 s, never over 20 s), allows only text-like content types, and sends no cookies or credentials.
Before you use it: read the header comment in the file, decide the host list, put the fetched text through the same "it is data, never
instructions" treatment as other tool results, and add an egress rule on the host if it allows one.

**Guide evaluation (developers only).** `tests/guide-eval/` holds a promptfoo setup with 18 English and Greek test questions. It is not a dependency
and never runs in production. Read `tests/guide-eval/README.md` first: it explains how to switch promptfoo's telemetry off and how to run it with your
own key.

### Student tools sandbox (`safebox.js`)
A student's tool page is served with headers that are built to block the internet: CSP `sandbox allow-scripts; default-src 'none'`,
`Connection-Allowlist: ()` (Chromium 152 and later: no outbound connection of any kind, including WebRTC, preconnect and navigation),
a Permissions-Policy that turns the camera, microphone, location and other powerful features off, and `Referrer-Policy: no-referrer`.
A tiny script placed first in the page also removes WebRTC and WebTransport for browsers that do not know `Connection-Allowlist`.
The only way out of the page is `postMessage` to the site page that frames it. Tested in Chromium 153 with 152 hostile techniques: 0 leaks
(12 without `Connection-Allowlist`: preconnect, prerender, navigation, WebRTC in nested frames). Firefox, Safari and older Chrome are untested and rely on the CSP and the script, so say "built to block
the internet", not "cannot". A hostile page that builds a WebRTC connection inside a nested frame crashes its own tab in Chromium 153; nothing leaks.

### Cyprus 3D and its security policy
`/3d.html` runs three.js from our own server: `public/vendor/three-r160/` (three.js r160, MIT, see `SOURCE.txt` there). The page's code is in `public/3d-app.js` (module) and `public/3d-guard.js` (the "engine did not start" fallback); `3d.html` itself holds the markup, the styles and a small import map that maps `three` and `three/addons/` to the vendor folder.
The server sends `/3d.html` with a strict Content-Security-Policy built by `csp3d.js`: scripts only from our own origin plus the SHA-256 of the import map (computed from the file on every request, so you can edit the import map freely), data only from our own `/api/*`, images `self data: blob:`, no frames, and `frame-ancestors 'self'` (the site shell and the student app frame it). The browser therefore cannot contact any other host from this page; if you add a texture, tile or font from elsewhere the browser will refuse it and print a "Refused to ..." line in the console.
To upgrade three.js: copy `build/three.module.js` and `examples/jsm/controls/OrbitControls.js` from the new tag into a new folder (for example `public/vendor/three-r161/`), change the two paths in the import map, and (if you want the long cache) change the `/vendor/three-r160/` prefix in the `Cache-Control` line of `server.js`. Never edit files inside a versioned vendor folder: they are cached for a year.
Do not add inline `<script>` blocks to `3d.html` (they will not run); put code in a file.
Tests: `gh/tests/3d/` has a unit test (`p3_3dtest.js`), a header test (`headers_test.js`) and a Chromium test (`pw_3d.py`) that logs every request.

## Satellite feeds (November 2026)

Satellite data plugs into the Data layers page like any other layer: one file in `sources/` and one module in `satellite/feeds/` per feed.
A satellite value describes an area (a pixel of 250 m to 25 km), only where the sky is clear, at the time the satellite passed; it is never
shown as "a sensor at the school". Feeds that need a free key (`FIRMS_MAP_KEY`, `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET`) stay planned until the key is set.
A feed with several kinds of picture (NASA: natural colours, night lights, dust and haze, ground heat, sea warmth, fires) shows one button per kind
in the layer dialog; the small pictures are the last days of the chosen kind (up to 12 per kind, 60 per feed).
Everything read from the internet is fetched by the server only, from exact allowed hosts, and is untested against the real services until the first deploy logs are read.

### Satellite feeds: the registry (`satellite/`)

The full text is in `satellite/README.md`. Headings:

- Satellite feeds (what a satellite value is: an area, only where the sky is clear, at pass time, never "a sensor at the school")
- What is in this folder
- Add a feed in five steps (source file, vocab, feed module with the `create(ctx)` skeleton, test with `makeCtx`, pull request)
- The ctx (`dir`, `get` options and errors, `env`, `log`, `places`, `now`)
- The rules for what a feed returns (`read`, `images`, degrade)
- Testing a feed (`makeCtx`, `reply`, `startFakeServer`)
- What the registry guarantees
- Switches (environment)
- HTTP (read only routes)
- How it plugs into the Data layers page
- What to look for in the Railway logs after a deploy

### Air and haze from space (cams-atmosphere, tropomi-air, modis-aerosol)

- cams-atmosphere (active): the CAMS atmospheric-composition MODEL read through Open-Meteo's air-quality API (host air-quality-api.open-meteo.com, no key). Haze (aerosol optical depth), UV index, NO2, SO2, CO.
  It is a model, quality.kind "model": satellites feed CAMS (MODIS haze, satellite ozone and CO) but the numbers are model numbers. Never present them as satellite pixels. One request for the four cities every hour.
- tropomi-air (candidate + planned, reader built): Sentinel-5P NO2, CO, O3, SO2 and UV aerosol index, whole-column, about once a day, clear sky only, through the Copernicus Data Space Sentinel Hub Statistical API.
  Needs a FREE Copernicus Data Space account and an OAuth client. Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET on the server (names are declared in sources/tropomi-air.json: access.auth.env and x_env). With the secret set,
  the Data layers page treats the layer as active (layers.js withSatellite); without both values the feed makes no request at all. Update the year in the attribution line of that file once a year.
- modis-aerosol (candidate, no reader): MODIS MAIAC haze via NASA AppEEARS needs an Earthdata login and several steps per request. The ORNL DAAC MODIS web service has no aerosol product.
- Tests: node tests/sat-air/cams.test.js ; node tests/sat-air/tropomi.test.js (fixtures in tests/sat-air/fixtures, no network).
  Whole server with fake providers: node -r tests/sat-air/fake-network.js server.js with DEMO=1 OPEN_METEO_MOCK=1 SATELLITE_LIVE=1 (set FAKE_DUST=1 for a dust day; FAKE_CDSE_ID/FAKE_CDSE_SECRET plus the same two as CDSE_CLIENT_ID/CDSE_CLIENT_SECRET for TROPOMI).
- Never write a value of CDSE_CLIENT_ID or CDSE_CLIENT_SECRET in a file, a log or an issue. The registry cuts them out of anything it shows.

### Fire feeds (`fire-hotspots`, `effis-burnt-areas`)

Two satellite feeds under `satellite/feeds/`, with their logic in `satellite/fire/` and their descriptors in `sources/`. Tests: `node --test tests/sat-fire/unit.js tests/sat-fire/unit_effis.js` (no network, Node 22). Regenerate fixtures with `node tests/sat-fire/make-fixtures.js`.

**fire-hotspots** needs a free NASA FIRMS key: get one at `https://firms.modaps.eosdis.nasa.gov/api/map_key`, set it as `FIRMS_MAP_KEY` on the server (Railway variable), restart. Without it nothing happens (one log line, the layer stays Planned). With it the layer turns Active by itself, readings flow to the master brain, and the picture appears in the layer's dialog. It asks NASA four times per 30 minutes (5,000 per 10 minutes allowed).

**Rules** (change them in `satellite/fire/firms.js`, and keep `x_rules` in the descriptor and the explain texts in `vocab/variables.json` in step):
low confidence is dropped for every sensor (VIIRS `l`, MODIS under 30); detections within 1 km of each other are one hotspot whatever the sensor or the time (not chained); counts are hotspots in the 24 hours that end when NASA's lists were read; the three variables are counts within 25 km and 50 km and the distance to the nearest hotspot within 100 km (no row when none).

**effis-burnt-areas** needs no key but is **Planned on purpose**: its request is documented only by a third-party client. After deploy look for the log line "Satellite effis-burnt-areas: EFFIS answered: N perimeters ..."; when it is there and the numbers look right, change `"status": "candidate"` to `"active"` in `sources/effis-burnt-areas.json`.

Never add a reading that names a person, owner or place of a fire; the EFFIS reader deliberately keeps only geometry, area and dates. Every text that reaches a student must say that a hotspot is not a confirmed fire and give 112. A zero is never "safe".

### Satellite pictures: `nasa-gibs-imagery` and `eumetsat-meteosat-view`

What they are: two feeds in `satellite/feeds/` that fetch WMS pictures, check them, keep a week of them in `DATA_DIR/satellite/<feed id>/` and list them through `images()`. They have no numbers (`variables: []`). Shared code: `satellite/lib/imagery.js`.

How a run goes: first run 25 s (NASA) or 40 s (EUMETSAT) after start, then every 3 h or 45 min. A run first works out what is missing (the 7 dates of each NASA kind, or a frame newer than the one held), reads capabilities only if something is missing, then fetches one picture at a time with a pause. Pictures go to the folder with a hash-checked atomic write; `index.json` lists them and `state.json` holds the capabilities cache and the "rested" marks (layer rested 24 h, empty day 6 h, outline layers 24 h).

Change what is shown: edit `DEFS` at the top of the feed. A NASA kind is `{ id, format, bg, overlay, readyHours, hour, minBytes, staleDays, title, titleEl, text, textEl, candidates: [{ layers, platform }] }`; candidates are tried in order. Keep the text to one sentence that starts "Look for" / "Δες", and add the id to `x_images` in the descriptor. A Meteosat kind has `cadenceMin` and `candidates: [{ layer, platform }]`. Do not add a single-channel (Level 1) Meteosat layer without re-reading the data policy. Do not add Suomi NPP layers (no new data since 2 Nov 2026).

Settings (environment, all optional): `SATELLITE_IMAGERY_PAUSE_MS` (pause between requests, default 1500/2000), `SATELLITE_IMAGERY_FIRST_DELAY_MS`, `SATELLITE_IMAGERY_MAX_MB` (folder cap, default 25). No key, no secret.

Tests: `node --test tests/sat-imagery/*.test.js`. `helpers.js` has a fake GIBS and a fake EUMETView; `makeCtx` comes from `satellite/testing.js`.

Reading the logs: every line starts with `Satellite <feed id>:`. Normal: `N new picture(s), M kept`. Trouble: `trouble: ...` lists up to three reasons (for example `no capabilities (...)`, `<layer> is skipped for a while (the service does not list it)`). `/api/satellite/status` shows each feed's `probe` note ("42 pictures kept, 6 of 6 kinds up to date, newest for 2026-11-12").

### Land feeds: modis-lst and modis-ndvi (NASA MODIS / VIIRS through ORNL DAAC)

What: for each of the four cities, the surface temperature of the ground and roofs (day and night, 8-day composites, 1 km) and the greenness of the land (NDVI, 16-day composites, 250 to 500 m). Both are satellite values: an AREA, only where the sky was clear, not a sensor at the school. Surface temperature is NOT air temperature; the brain never compares it with a thermometer.

Where: `satellite/feeds/modis-lst.js`, `satellite/feeds/modis-ndvi.js`, shared code `satellite/lib/modis-ornl.js` (not a feed: only files in `feeds/` are loaded). Descriptors `sources/modis-lst.json`, `sources/modis-ndvi.json`. Variables in `vocab/variables.json` (`land_surface_temperature`, `ndvi`).

Service: https://modis.ornl.gov/rst/api/v1/{product}/dates and /subset (keyless). Products: MYD11A2, MOD11A2 (LST), MOD13Q1, MYD13Q1, VNP13A1 (NDVI). One call at a time, 1.5 s apart, every 12 h; the answers are cached in DATA_DIR/satellite/<id>/state.json. `SATELLITE_MODIS_GAP_MS` (0-60000) changes the pause. No key, no secret.

How a pixel is accepted: raw value times the scale (0.02 K, or 0.0001), fill and out-of-range values dropped, QA bits must say "good" (LST: not cloud, error class up to 3 K; NDVI: reliability 0 or 1 and no cloud, snow or shadow in VI Quality). The city value is the mean of the usable pixels of the centre 3 x 3 block when at least 4 are usable, otherwise the centre pixel alone, otherwise nothing. The reading time is the middle of the composite period.

In production: no log line means a good round. A line `Satellite modis-lst: ...` names the first problem. Check the Data layers card for "Live, 4 of 4 cities". Tests: `node tests/sat-land/run.js` (no network; fixtures made by `tests/sat-land/make-fixtures.js`).

Known limit: Terra and Aqua are drifting and NASA plans to retire them from late 2026 or early 2027. NDVI continues from VIIRS (VNP13A1). LST has no VIIRS route yet.

### Satellite sea feeds (noaa-sst, noaa-chlorophyll)

Two keyless feeds read NOAA CoastWatch ERDDAP (`coastwatch.pfeg.noaa.gov`) with griddap `.json` queries.

- `noaa-sst`: sea surface temperature, variable `sea_surface_temperature` (Cel), the same id and unit as the Open-Meteo marine model, so the
  Data layers brain can compare them. Product: MUR SST v4.1 (`jplMURSST41`, L4 gap-free analysis, 1 km, daily, about 3-4 days late),
  backup OISST v2.1 (`ncdcOisst21NrtAgg`, 25 km). Refreshed every 6 h.
- `noaa-chlorophyll`: variable `chlorophyll_a` (mg/m3), VIIRS S-NPP science quality 4 km, L3 daily (`noaacwNPPVIIRSSQchlaDaily` on coastwatch.noaa.gov; the pfeg server only mirrors it as `nesdisVHNSQchlaDaily`), the newest CLEAR value of
  the last 7 daily maps (cloud leaves holes). Refreshed every 12 h. About 11-15 days late.
- Coastal cities only (Larnaka, Limassol, Paphos). Lefkosia is never asked and never has a value. Each reading says which pixel it used and how many km
  from the city centre. A satellite sees the top skin of the sea and cannot see through cloud.
- Code: `satellite/feeds/noaa-sst.js`, `satellite/feeds/noaa-chlorophyll.js`, shared `satellite/lib/gridfeed.js` and `satellite/lib/erddap.js`.
  Descriptors: `sources/noaa-sst.json`, `sources/noaa-chlorophyll.json`. Candidate: `sources/copernicus-marine-sst-med.json` (needs a free account).
- Tuning: `SATELLITE_ERDDAP_PAUSE_MS` (pause between ERDDAP requests, default 500, 0..30000). No key, no other setting.
- If a map is missing: see `GET /api/satellite/status` (probe note and last network error) and the log line starting "Satellite noaa-sst:" or "Satellite noaa-chlorophyll:".

### Sunshine feeds (satellite/feeds/openmeteo-satellite-solar*.js, nasa-power-solar.js, helpers in satellite/sun/)
Three keyless feeds, no secret. Shared code lives in satellite/sun/ (the registry only loads satellite/feeds/*.js).
- openmeteo-satellite-solar      satellite-api.open-meteo.com  solar_irradiance (W/m2), newest finished hour, refresh 30 min
- openmeteo-satellite-solar-day  satellite-api.open-meteo.com  solar_energy_day (kWh/m2/day) + solar_clear_sky_share (%), last full day, refresh 3 h
- nasa-power-solar               power.larc.nasa.gov           solar_energy_day_nasa (kWh/m2/day) + cloud_amount_nasa (%), newest day (about a week old), refresh 20 h
Rules that matter:
- Irradiance is light arriving, not panel output. Never turn it into yield, money or CO2.
- Lux (school light sensors) and W/m2 are different quantities. Do not compare or convert them; they have separate variable ids and no tolerance.
- solar_energy_day (Open-Meteo, 2.5 km, we add up the hours) and solar_energy_day_nasa (1 degree, NASA) are separate ids on purpose, so the brain does not flag a "disagreement" that is only a resolution difference.
- A "full day" needs every hour of daylight; a hole in daylight (not at night) rejects the day. Night is told apart by the sun's elevation, so both 0 and null at night work.
- Open-Meteo's free API is for non-commercial use. Educational use is fine; ads, subscriptions or selling anything need a paid plan.
- Tests: a maintainer can read the reconstructed answers in tests/sat-sun/fixtures/*.json (they are NOT recordings). After the first real run, replace them with a recorded answer.
