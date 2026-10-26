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
| Our sensors (dots and 3D columns, 24 h history, comparison with the weather model) | SenseCAP |
| Temperature, humidity, cloud, rain, PM2.5, dust surface; wind arrows | Open-Meteo |
| Open air sensors (PM2.5, PM10, temperature, humidity) | Sensor.Community volunteers |
| Airport stations (temperature, wind) | aviationweather.gov METAR |
| Sea temperature and waves | Open-Meteo marine |
| True colour photo, land surface temperature, aerosols (any date) | NASA GIBS |

Click one of our sensors for its detail card: current value, the weather model value for the same place, the nearest airport and the nearest open sensor.

Notes:

- Check each provider's terms before using the map outside a classroom (Esri imagery, OpenStreetMap tile servers and Open-Meteo all have fair-use limits).
- A failing source shows an error line in Data status and the other layers keep working.
- The map loads MapLibre from unpkg and tiles from the providers above, so the browser needs internet access to those hosts.
