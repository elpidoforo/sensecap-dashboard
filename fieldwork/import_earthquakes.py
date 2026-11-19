"""Build the earthquake catalogue for the data stack from the saved USGS answer.

stack/earthquakes-source.geojson is the answer of the USGS event service (ANSS
Comprehensive Earthquake Catalog) to one query: magnitude 4.5 and above,
34 to 36 degrees north, 32 to 35 degrees east, 1 January 2015 to 19 November
2026. It is kept byte for byte as it was saved in the research checkpoint of
19 November 2026. Rebuild with python3 fieldwork/import_earthquakes.py, or add
--check to verify the committed snapshot offline. Nothing here asks the network.

This is a catalogue of past events. It is not a live feed and says so.
"""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path

FOLDER = Path(__file__).resolve().parent / "stack"
SOURCE = FOLDER / "earthquakes-source.geojson"
OUTPUT = FOLDER / "earthquakes.json"
SOURCE_SHA256 = "a665b48cab2e0f22a6bd5109aa29c19ee3e705bcd91c1930f48904beee7635fb"
QUERY = (
    "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2015-01-01"
    "&endtime=2026-11-19&minlatitude=34&maxlatitude=36&minlongitude=32&maxlongitude=35&minmagnitude=4.5"
)
BOX = {"south": 34.0, "north": 36.0, "west": 32.0, "east": 35.0}
MIN_MAGNITUDE = 4.5
WINDOW = ("2015-01-01T00:00:00Z", "2026-11-19T00:00:00Z")


def utc(ms):
    """Milliseconds since 1970 as an ISO time in UTC, to the millisecond."""
    if isinstance(ms, bool) or not isinstance(ms, (int, float)) or not math.isfinite(ms):
        raise ValueError("An event has no usable time")
    whole, part = divmod(int(ms), 1000)
    stamp = datetime.fromtimestamp(whole, tz=timezone.utc)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S") + f".{part:03d}Z"


def number(value, what, event):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{what} of {event} is not a number")
    return value


def events(collection):
    if not isinstance(collection, dict) or collection.get("type") != "FeatureCollection":
        raise ValueError("Expected a GeoJSON FeatureCollection from the USGS event service")
    features = collection.get("features")
    if not isinstance(features, list) or not features:
        raise ValueError("The saved answer holds no events")
    declared = (collection.get("metadata") or {}).get("count")
    if declared is not None and declared != len(features):
        raise ValueError("The saved answer does not hold the number of events it declares")
    start, end = (datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() * 1000 for t in WINDOW)
    rows, seen = [], set()
    for feature in features:
        event = feature.get("id") if isinstance(feature, dict) else None
        if not isinstance(event, str) or not event or event in seen:
            raise ValueError(f"Missing or repeated event id: {event!r}")
        seen.add(event)
        props = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates")
        if geometry.get("type") != "Point" or not isinstance(coordinates, list) or len(coordinates) != 3:
            raise ValueError(f"{event} has no point with a depth")
        lon = number(coordinates[0], "Longitude", event)
        lat = number(coordinates[1], "Latitude", event)
        depth = number(coordinates[2], "Depth", event)
        magnitude = number(props.get("mag"), "Magnitude", event)
        when = number(props.get("time"), "Time", event)
        if props.get("type") != "earthquake":
            raise ValueError(f"{event} is not an earthquake")
        if not (BOX["south"] <= lat <= BOX["north"] and BOX["west"] <= lon <= BOX["east"]):
            raise ValueError(f"{event} lies outside the box that was asked for")
        if magnitude < MIN_MAGNITUDE:
            raise ValueError(f"{event} is below magnitude {MIN_MAGNITUDE}")
        if not (start <= when < end):
            raise ValueError(f"{event} lies outside the period that was asked for")
        magnitude_type = props.get("magType")
        if not isinstance(magnitude_type, str) or not magnitude_type:
            raise ValueError(f"{event} has no magnitude type")
        rows.append({
            "id": event,
            "time": utc(when),
            "updated": utc(number(props.get("updated"), "Update time", event)),
            "latitude": lat,
            "longitude": lon,
            "depthKm": depth,
            "magnitude": magnitude,
            "magnitudeType": magnitude_type,
            "place": props.get("place") or None,
            "network": props.get("net") or None,
            "reviewStatus": props.get("status") or None,
            "url": props.get("url") or None,
        })
    rows.sort(key=lambda row: (row["time"], row["id"]))
    return rows


def snapshot(raw):
    rows = events(json.loads(raw))
    days = {}
    for row in rows:
        days.setdefault(row["time"][:7], []).append(row["id"])
    return {
        "title": "Earthquakes around Cyprus, magnitude 4.5 and above, 2015 to 2026",
        "titleEl": "Σεισμοί γύρω από την Κύπρο, μέγεθος 4,5 και πάνω, 2015 έως 2026",
        "unit": "magnitude",
        "sourceUrl": QUERY,
        "catalogueUrl": "https://earthquake.usgs.gov/fdsnws/event/1/",
        "licence": "Public domain (US Geological Survey). USGS asks to be credited as the source.",
        "licenceUrl": "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
        "attribution": "US Geological Survey, ANSS Comprehensive Earthquake Catalog. Kleanthis selected the region and kept the US-network summary values.",
        "attributionEl": "US Geological Survey, ANSS Comprehensive Earthquake Catalog. Ο Κλεάνθης διάλεξε την περιοχή και κράτησε τις συνοπτικές τιμές του δικτύου US.",
        "referenceDate": "2015-01-01 / 2026-11-19",
        "retrievedAt": "2026-11-19",
        "sourceSha256": sha256(raw).hexdigest(),
        "method": "One saved answer of the USGS event service for magnitude 4.5 and above inside 34 to 36 degrees north and 32 to 35 degrees east. Times are UTC, depth is in kilometres, and each magnitude keeps its type. Events are listed oldest first. Nothing is estimated or added. The box is a rectangle that also covers sea; it is not a border. Another period, threshold or box gives another count.",
        "methodEl": "Μία αποθηκευμένη απάντηση της υπηρεσίας σεισμών της USGS για μέγεθος 4,5 και πάνω, μέσα στο πλαίσιο 34 έως 36 μοίρες βόρεια και 32 έως 35 μοίρες ανατολικά. Οι ώρες είναι UTC, το βάθος σε χιλιόμετρα και κάθε μέγεθος κρατά τον τύπο του. Οι σεισμοί είναι από τον παλαιότερο στον νεότερο. Τίποτα δεν εκτιμήθηκε ούτε προστέθηκε. Το πλαίσιο είναι ορθογώνιο που πιάνει και θάλασσα, δεν είναι σύνορο. Άλλη περίοδος, άλλο όριο ή άλλο πλαίσιο δίνουν άλλο πλήθος.",
        "live": False,
        "box": BOX,
        "minimumMagnitude": MIN_MAGNITUDE,
        "coverage": {
            "events": len(rows),
            "first": rows[0]["time"],
            "last": rows[-1]["time"],
            "busiestMonth": max(sorted(days), key=lambda month: len(days[month])),
            "eventsInBusiestMonth": max(len(ids) for ids in days.values()),
        },
        "events": rows,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare the snapshot with the saved USGS answer")
    args = parser.parse_args()
    raw = SOURCE.read_bytes()
    if sha256(raw).hexdigest() != SOURCE_SHA256:
        parser.exit(1, "The saved USGS answer is not the file from the research checkpoint.\n")
    result = snapshot(raw)
    if args.check:
        if result != json.loads(OUTPUT.read_text(encoding="utf-8")):
            parser.exit(1, "Earthquake snapshot differs from the saved USGS answer.\n")
        print(f"Verified {len(result['events'])} events against the saved USGS answer.")
    else:
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
