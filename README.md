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
| Output | `studio` | Build studio: gallery of approved tools; students build with the class code |
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
| `ADMIN_SETUP_CODE` | no | Secret that lets the first admin create an account at `/app/#/staff`. Leave it empty once the admins exist |
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

1. Set `ADMIN_SETUP_CODE` (a long random secret) on Railway and open `/app/#/staff`. Create your admin account with that code, then remove the variable.
2. Open Manage, Codes. Each school has a student code and a teacher code. Give the student code to the class and the teacher code to the teachers. Codes can be regenerated at any time.
3. Teachers join with the teacher code and you approve them (Manage, Approvals). Students join with the student code and their own teacher approves them.
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
- **Build studio (`studio.js`):** no account for students. A student types their school's class code (the school's existing student code from the student app, any letter case, with or without the dash) and a team name (1 to 30 letters, digits, spaces or hyphens; the page tells them to use a team name, not their own name). That sets the signed cookie `sc_class` (HttpOnly, SameSite=Lax, 8 hours; the signing secret is stored in the database in `meta`, or set `STUDIO_CLASS_SECRET`). Regenerating a school's student code ends that school's class sessions. A team builds with Claude (the draft stays in the browser) and presses Submit: only submitted pages are stored, as pending pages with the team name and school, for the teachers of that school (admins see all). A teacher approves or rejects; approved pages and the gallery (`GET /studio/api/projects?scope=gallery`, `/studio/p/<id>`) are public to everybody, anything else is private to its team and the reviewers. Pages run in a sandbox with no network and no top-window navigation (CSP `sandbox allow-scripts`; a page opened directly is wrapped in a sandboxed frame). Teachers and old student-app accounts keep the server-side drafts flow. Needs `ANTHROPIC_API_KEY`. The Build studio only reads the public view of the data (see Privacy above) and `get_vehicle_series` refuses GPS.
  - `STUDIO_SCHOOL_DAILY` (25): builds per school per day for class teams. `STUDIO_IP_DAILY` (40): builds per network address per day for class teams; a whole school usually sits behind one address, so raise it if classes build together. `STUDIO_GLOBAL_DAILY` (300): builds per day for everybody together. `STUDIO_DAILY_LIMIT` (25): builds per signed-in person per day. `STUDIO_SCHOOL_PENDING` (10): submitted pages per school waiting for a teacher (a team may have 3). `0` switches that kind of build off. The day is a rolling 24 hours. Also: 4 builds a minute per team, 8 wrong class codes per 15 minutes per address, and `STUDIO_CLASS_SECRET` (optional signing secret). Addresses are counted as a keyed hash, never stored.
  - New columns on `studio_projects` (`author_kind`, `team_label`, `data_json`) and `studio_use` (`school_id`, `ip`) are added automatically; old rows keep working. A class author has `user_id` 0 and `author_kind` `class`.
- **MCP endpoint (`/mcp`):** Model Context Protocol over HTTP (JSON responses) for adults and teachers who use their own Claude (for example Claude Code or the API). A teacher creates a project token (`POST /studio/api/tokens`, shown once); the client sends it as `Authorization: Bearer <token>`. Tools: the assistant's read-only data tools plus `get_vehicle_series`, `list_my_projects`, `get_project`, `save_project` and `submit_project`. It can save drafts only, never publish. 120 calls per hour per token. Claude.ai's own custom connectors expect OAuth, which this endpoint does not implement yet.
- Students under 18 should not use their own Claude.ai accounts; the Build studio inside the site is the route for them.

### Joining without a school code

When the shared class sign-in is on, a student who has signed in to `/cities/` can join the student app by choosing a school, a display name and a password. No school code, no approval wait. Teachers still see the chat, can mute or remove people, and approve every Build studio project before others see it. Without the class sign-in, joining still needs the school code and teacher approval.

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
- **Limits:** `LAYERS_BRAIN_HOURLY` (60) assistant readings per hour, `LAYERS_ASK_PER_HOUR` (12) questions per address per hour (429 with `code: "rate"`), a question is 6 to 300 characters, the same city and layers are served from a 10-minute cache.
