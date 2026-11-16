"""Rebuild the offline EMODnet transects: python3 fieldwork/refresh-coast.py.

Run with --check to validate the packaged snapshot without network access.
"""

import argparse
import concurrent.futures
import datetime
import json
import math
import os
from pathlib import Path
import tempfile
import time
from urllib import error, parse, request


SOURCE = "https://rest.emodnet-bathymetry.eu/"
OUTPUT = Path(__file__).with_name("coast.json")
DISTANCES = tuple(range(13))
# Offshore starts (longitude, latitude), then initial bearing in degrees.
TRANSECTS = (
    ("Larnaka", "Off Finikoudes", 33.65, 34.912, 90),
    ("Limassol", "Off Molos", 33.058, 34.665, 160),
    ("Paphos", "Off Paphos Harbour", 32.401, 34.745, 225),
)


def position(lon, lat, bearing, distance_km):
    """Destination of a spherical great-circle segment in EPSG:4326."""
    lat1, lon1, angle = map(math.radians, (lat, lon, bearing))
    arc = distance_km / 6371.0088
    lat2 = math.asin(math.sin(lat1) * math.cos(arc)
                     + math.cos(lat1) * math.sin(arc) * math.cos(angle))
    lon2 = lon1 + math.atan2(math.sin(angle) * math.sin(arc) * math.cos(lat1),
                             math.cos(arc) - math.sin(lat1) * math.sin(lat2))
    return [round(math.degrees(lon2), 6), round(math.degrees(lat2), 6)]


def fetch_cell(coordinates):
    lon, lat = coordinates
    query = parse.urlencode({"geom": f"POINT({lon} {lat})"})
    url = SOURCE + "depth_sample?" + query
    for attempt in range(3):
        try:
            with request.urlopen(url, timeout=25) as response:
                data = json.load(response)
            break
        except (error.URLError, TimeoutError) as exc:
            if isinstance(exc, error.HTTPError) and exc.code < 500 and exc.code != 429:
                raise
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    if not isinstance(data, dict) or "avg" not in data:
        raise ValueError(f"Missing EMODnet avg field at {coordinates}: {data!r}")
    value = data["avg"]
    if value is not None and (type(value) not in (float, int) or not math.isfinite(value)):
        raise ValueError(f"Invalid EMODnet avg field at {coordinates}: {value!r}")
    return data


def read_transect(pool, definition):
    name, label, lon, lat, bearing = definition
    coordinates = [position(lon, lat, bearing, km) for km in DISTANCES]
    cells = list(pool.map(fetch_cell, coordinates))
    points = [[km, cell["avg"]] for km, cell in zip(DISTANCES, cells)]
    return {
        "name": name,
        "startLabel": label,
        "startLonLat": coordinates[0],
        "endLonLat": coordinates[-1],
        "initialBearingDegrees": bearing,
        "points": points,
        "coordinatesLonLat": coordinates,
        "interpolated": [cell.get("interpolationType") for cell in cells],
        "sourceIds": [(cell.get("reference") or {}).get("identifier") for cell in cells],
        "references": {
            ref["identifier"]: ref.get("metadata_url")
            for cell in cells
            if (ref := cell.get("reference")) and ref.get("identifier")
        },
    }


def validate(snapshot):
    if snapshot.get("sourceUrl") != SOURCE or snapshot.get("unit") != "m":
        raise ValueError("Snapshot source or unit is invalid")
    if not snapshot.get("retrievedAt") or len(snapshot.get("series", [])) != len(TRANSECTS):
        raise ValueError("Missing retrieval timestamp or transects")
    for row, (name, _, lon, lat, bearing) in zip(snapshot["series"], TRANSECTS):
        if row["name"] != name or row["initialBearingDegrees"] != bearing:
            raise ValueError(f"Wrong transect for {name}")
        coords = [position(lon, lat, bearing, km) for km in DISTANCES]
        if row["coordinatesLonLat"] != coords or row["endLonLat"] != coords[-1]:
            raise ValueError(f"Inconsistent sample coordinates for {name}")
        if row["startLonLat"] != coords[0]:
            raise ValueError(f"Inconsistent start for {name}")
        if [point[0] for point in row["points"]] != list(DISTANCES):
            raise ValueError(f"Unexpected sample distances for {name}")
        if len(row["sourceIds"]) != len(coords) or len(row["interpolated"]) != len(coords):
            raise ValueError(f"Missing sample provenance for {name}")
        values = [v for _, v in row["points"] if v is not None]
        if not values or any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
            raise ValueError(f"Missing or invalid measurements for {name}")


def refresh():
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        series = [read_transect(pool, line) for line in TRANSECTS]
    snapshot = {
        "title": "Cyprus seabed profiles",
        "sourceUrl": SOURCE,
        "attribution": "EMODnet Bathymetry Consortium, EMODnet Digital Terrain Model.",
        "licence": "CC BY 4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "productUrl": "https://doi.org/10.12770/cf51df64-56f9-4a99-b1aa-36b8d7b743a1",
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "unit": "m",
        "distanceUnit": "km",
        "valueLabel": "Seabed elevation",
        "referenceType": "Static gridded terrain model",
        "datum": "The DTM documents Lowest Astronomical Tide (LAT). The REST response does not identify the datum or edition for the individual cell.",
        "method": "Each line starts offshore. Positions use great-circle distance from that origin at 1 km intervals. Values are the signed avg from depth_sample at those positions. Negative elevations are below the reference datum. Null means no reported value.",
        "limitations": "Grid estimates can be interpolated from neighbouring cells or compiled from older surveys. The retrieval date is separate from the survey date. These are educational profiles, unsuitable for navigation.",
        "series": series,
    }
    validate(snapshot)
    # An interrupted download or write must preserve the last complete snapshot.
    tmp = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=OUTPUT.parent,
                                         prefix=".coast-", suffix=".json", delete=False) as handle:
            tmp = Path(handle.name)
            json.dump(snapshot, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        os.chmod(tmp, 0o644)
        tmp.replace(OUTPUT)
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate without contacting EMODnet")
    if parser.parse_args().check:
        validate(json.loads(OUTPUT.read_text(encoding="utf-8")))
    else:
        refresh()
