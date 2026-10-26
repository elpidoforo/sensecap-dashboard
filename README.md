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
