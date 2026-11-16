"""Refresh the CC BY 4.0 inventory: python3 fieldwork/import_crossings.py

For a saved response, pass --xml PATH and --retrieved-at ISO_TIMESTAMP.
The published timestamp dates this inventory release, not the installations.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.request import Request, urlopen
from xml.etree import ElementTree


DIRECTORY = Path(__file__).resolve().parent
SOURCE = "https://fixcyprus.cy/gnosis/open/api/nap/datasets/pedestrian_crossings/"
CATALOGUE = "https://www.traffic4cyprus.org.cy/en/dataset/pedestrian_crossings"
RADIUS_KM = 5
MAX_BYTES = 10 * 1024 * 1024


def city_centres():
    # Reuse the same city coordinates as the live 3D city view.
    raw = subprocess.check_output(
        ["node", "-p", "JSON.stringify(require('./city-buildings').CITIES)"],
        cwd=DIRECTORY.parent,
        text=True,
    )
    return {key.capitalize(): [city["lat"], city["lng"]]
            for key, city in json.loads(raw).items()}


def distance_km(latitude, longitude, centre):
    a, b = map(math.radians, (latitude, centre[0]))
    delta_lon = math.radians(centre[1] - longitude)
    h = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(delta_lon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1.0, h)))


def coordinates(element):
    try:
        lat = float(element.findtext(".//{*}pointCoordinates/{*}latitude"))
        lon = float(element.findtext(".//{*}pointCoordinates/{*}longitude"))
    except (TypeError, ValueError):
        return None
    if -90 <= lat <= 90 and -180 <= lon <= 180:
        return lat, lon
    return None


def timestamp(value):
    if not value or datetime.fromisoformat(value.replace("Z", "+00:00")).utcoffset() is None:
        raise ValueError("A timestamp with its UTC offset is required")
    return value


def snapshot(xml, retrieved_at, centres):
    root = ElementTree.fromstring(xml)
    publication = root.find(".//{*}trafficElementPublication")
    if publication is None:
        raise ValueError("Expected a DATEX II trafficElementPublication")
    published_at = timestamp(publication.findtext("{*}publicationTime"))
    identifiers, missing_coordinates, locations = set(), [], []
    counts = Counter()
    outside = 0
    for record in publication.findall("{*}trafficElement"):
        identifier = (record.findtext("{*}id") or "").strip()
        if not identifier or identifier in identifiers:
            raise ValueError("Expected a unique, non-empty publisher ID for each record")
        identifiers.add(identifier)
        position = coordinates(record)
        if position is None:
            missing_coordinates.append(identifier)
            continue
        lat, lon = position
        nearest = min(centres, key=lambda label: distance_km(lat, lon, centres[label]))
        city = nearest if distance_km(lat, lon, centres[nearest]) <= RADIUS_KM else None
        if city:
            counts[city] += 1
        else:
            outside += 1
        name = record.findtext(".//{*}comment/{*}value") or ""
        locations.append([identifier, name, lat, lon, city])
    if not locations:
        raise ValueError("No records with usable crossing coordinates")
    return {
        "title": "Signal-controlled pedestrian crossings near four city centres",
        "sourceUrl": SOURCE,
        "catalogueUrl": CATALOGUE,
        "attribution": "Cyprus Public Works Department, Ministry of Transport, Communications and Works, via CyNAP. Proximity counts calculated by Athena.",
        "licence": "CC BY 4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "publishedAt": published_at,
        "retrievedAt": timestamp(retrieved_at),
        "observedAt": None,
        "timestampNote": "Publication time dates the inventory release. The source supplies no installation or inspection date for each crossing.",
        "sourceSha256": sha256(xml).hexdigest(),
        "unit": "mapped crossings",
        "method": "Count each publisher record within 5 km straight-line distance of the nearest Athena city-centre point. Only signal-controlled crossings in the published inventory are covered. Counts apply to these circles and do not measure pedestrian safety.",
        "radiusKm": RADIUS_KM,
        "centres": centres,
        "centreSource": "city-buildings.js: CITIES. Each pair is [latitude, longitude].",
        "coverage": {
            "sourceRecords": len(identifiers),
            "withinRadius": sum(counts.values()),
            "outsideRadius": outside,
            "missingCoordinates": len(missing_coordinates),
            "missingCoordinateIds": missing_coordinates,
        },
        "series": [{"name": "Within 5 km of city centre",
                    "points": [[label, counts[label]] for label in centres]}],
        "locationFields": ["sourceId", "streetLabel", "latitude", "longitude", "cityWithinRadius"],
        "locations": locations,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xml", type=Path, help="Re-import a saved official XML response")
    parser.add_argument("--retrieved-at", help="Actual capture timestamp for the saved response")
    parser.add_argument("--output", type=Path, default=DIRECTORY / "crossings.json")
    args = parser.parse_args()
    if bool(args.xml) != bool(args.retrieved_at):
        parser.error("--xml and --retrieved-at must be supplied together")
    if args.xml:
        xml = args.xml.read_bytes()
        retrieved_at = args.retrieved_at
    else:
        req = Request(SOURCE, headers={"User-Agent": "Athena-Smart-Cities-Cyprus/1.0"})
        with urlopen(req, timeout=30) as response:
            xml = response.read(MAX_BYTES + 1)
        retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if len(xml) > MAX_BYTES:
        raise ValueError("Crossings response exceeds 10 MiB")
    data = snapshot(xml, retrieved_at, city_centres())
    tmp = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=args.output.parent,
                                         prefix=".crossings-", delete=False) as stream:
            tmp = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.chmod(tmp, 0o644)
        os.replace(tmp, args.output)
    finally:
        if tmp:
            tmp.unlink(missing_ok=True)
    print(f"{args.output}: {data['coverage']}")


if __name__ == "__main__":
    main()
