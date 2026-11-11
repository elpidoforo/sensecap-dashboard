# sensecap-dashboard

Web dashboard for all sensors on the SenseCAP / SenseCraft Data Platform: live map, history charts, device table and CSV download.

The server keeps your API credentials private and calls the SenseCAP HTTP API; the browser only talks to this server.

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

Old addresses are redirected into the site: `/index.html` to `/`, `/cities/` to `/#/`, `/metoffice.html` to `/#/weather`, `/dashboard.html` to `/#/vehicles`, `/map.html` to `/#/map`, `/3d.html` to `/#/3d`. Add `?embed=1` to get the page itself (so the site can show `map.html` and `3d.html` in same-origin frames).

## 3D view

`/3d.html` shows Cyprus as a 3D island: terrain coloured by temperature, elevation, PM2.5 or dust, animated wind, clouds and rain, sea points, and one column per sensor. It refreshes sensors every 30 seconds and weather every 5 minutes.

Each column carries a number label ("Name and value", "Value only", "Value and difference from weather model", or off). The sensor list on the right is sorted by the chosen measurement (highest first, lowest first or by name; offline sensors last); click a row and the camera flies to that column. Columns follow the GPS position, so a vehicle's column moves at every refresh.

Outside data comes from [Open-Meteo](https://open-meteo.com) (free, no key, non-commercial use): elevation, weather, air quality and marine conditions. Sensors are compared with the weather model for temperature and humidity.

`OPEN_METEO_MOCK=1` serves synthetic terrain and weather for offline testing only.

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
