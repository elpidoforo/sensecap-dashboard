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
| `DASHBOARD_PASSWORD` | no | Asks visitors for this password (any username) |
| `SENSECAP_HOST` | no | Defaults to `https://sensecap.seeed.cc/openapi` |
| `DEMO` | no | `1` forces demo data |
| `DATA_DIR` | no | Where the Met Office history is saved. Defaults to the Railway volume (`RAILWAY_VOLUME_MOUNT_PATH`), otherwise `./data` |
| `HISTORY_DAYS` | no | How many days of history to keep (default 400) |
| `LOCK_DASHBOARD` | no | `1` hides the dashboard, map and 3D view from anyone who is not signed in to the student app (or has `DASHBOARD_PASSWORD`) |
| `ADMIN_SETUP_CODE` | no | Secret that lets the first admin create an account at `/app/#/staff`. Leave it empty once the admins exist |
| `ANTHROPIC_API_KEY` | no | Switches the Ask assistant on. Without it the app works and the assistant says it is not switched on |
| `BOT_MODEL` | no | Model for the assistant (default `claude-sonnet-5-5`) |
| `ANTHROPIC_BASE_URL` | no | Only for testing against a different endpoint |
| `BOT_DAILY_LIMIT` | no | Questions per person per day (default 40) |
| `BOT_GLOBAL_DAILY` | no | Questions per day for everyone together (default 1500) |
| `CHAT_RETENTION_DAYS` | no | Chat messages older than this are deleted (default 400) |
| `BOT_LOG_DAYS` | no | Assistant questions and answers older than this are deleted (default 90) |

Never commit real keys. `.env` is ignored by git.

## Notes

- Groups in SenseCAP show up as the group filter, so create one group per school.
- History uses the `aggregate_chart_points` endpoint (up to about 250 points per series).
- Device lists are cached for 1 minute and readings for 1 to 2 minutes to stay within API limits.

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
- **Chat:** group channels only. One for all schools, one per school, one per team. No private messages. Students cannot post links, emails, phone numbers or @handles. Anyone can report a message; teachers can delete messages and mute members.
- **Ask:** an assistant that reads the live data, the Met Office pages, the vehicle history and an editable handbook (Manage, Handbook). Every question and answer is visible to teachers, and any answer can be reported.

### Setting it up

1. Set `ADMIN_SETUP_CODE` (a long random secret) on Railway and open `/app/#/staff`. Create your admin account with that code, then remove the variable.
2. Open Manage, Codes. Each school has a student code and a teacher code. Give the student code to the class and the teacher code to the teachers. Codes can be regenerated at any time.
3. Teachers join with the teacher code and you approve them (Manage, Approvals). Students join with the student code and their own teacher approves them.
4. Manage, Teams: create teams and add members. Each team gets its own chat channel.
5. Manage, Codes, Vehicle matching: a vehicle is shown to a school when its name or group contains one of the school's match words (default: the city name, for example `Larnaka, Larnaca`). Name the SenseCAP devices or groups accordingly, or change the words.
6. Add `ANTHROPIC_API_KEY` to switch on the assistant. Set `LOCK_DASHBOARD=1` so the vehicle positions are only visible to people who are signed in.

Students pick a display name and a password; there are no email addresses. A teacher can reset a password (the student gets a temporary one and must change it).

### Safeguarding and privacy

- Students are minors. Get the school's agreement (and your data protection officer's) before use, and tell students and parents what is stored: display name, school, team, messages, and the questions they ask the assistant.
- The assistant sends the question and the data it needs to Anthropic. It tells students it is an AI, points to 116111 (child helpline) and 112 (emergencies) when someone is in trouble, and helps with learning rather than writing assignments.
- Teachers see the assistant log and the reports queue. Messages and logs are deleted after `CHAT_RETENTION_DAYS` and `BOT_LOG_DAYS`.
- Students can export their data or delete their account in the app (Me). A deleted account is anonymised in old messages.
- Do not put real school names or addresses in the sensor groups if you do not want them visible; the school locations in the app are city level only.
