"""Build the EV inventory from CyNAP or a saved XML file with its capture timestamp."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone, date
from hashlib import sha256
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen
from xml.etree import ElementTree as ET

from import_crossings import coordinates, timestamp

SOURCE = "https://fixcyprus.cy/gnosis/open/api/nap/datasets/electric_vehicle_chargers/"
CATALOGUE = "https://www.traffic4cyprus.org.cy/en/dataset/electricvehiclecharges"


def snapshot(xml, captured):
    root = ET.fromstring(xml)
    release = root.find(".//{*}energyInfrastructureTablePublication")
    if release is None:
        raise ValueError("Expected a DATEX II energy infrastructure table")
    published = timestamp(release.findtext("{*}publicationTime"))
    names, positions, dates = set(), set(), []
    counts = defaultdict(Counter)
    locations = []
    for point in release.findall("{*}chargingPoints/{*}chargingPoint"):
        name = (point.findtext("{*}chargingPointIdentification") or "").strip()
        position = coordinates(point)
        if not name or name in names or position is None:
            raise ValueError(f"Missing or duplicate point identification, or invalid coordinates: {name!r}")
        lat, lon = position
        if not (34 <= lat <= 36 and 32 <= lon <= 35):
            raise ValueError(f"Location outside Cyprus envelope: {name!r}")
        current = (point.findtext("{*}powerType") or "").strip().upper()
        if current not in ("AC", "DC"):
            raise ValueError(f"Unrecognised current type for {name!r}")
        operator = (point.findtext("{*}chargingPointOperator") or "").strip() or "Unspecified"
        connectors = int(point.findtext("{*}numberOfConnectors", "0"))
        if connectors < 1:
            raise ValueError(f"Missing or invalid connector count for {name!r}")
        created = point.findtext("{*}creationDate")
        if created:
            dates.append(date.fromisoformat(created))
        names.add(name)
        positions.add(position)
        counts[operator][current] += 1
        locations.append(dict(name=name, latitude=lat, longitude=lon, currentType=current,
                              operator=operator, connectors=connectors, recordCreated=created))
    if not locations:
        raise ValueError("No charging point records")
    operators = sorted(counts, key=lambda op: (-sum(counts[op].values()), op))
    series = []
    for label, el, category in [("All charging points", "Όλα τα σημεία φόρτισης", None),
                                ("AC", "AC", "AC"), ("DC", "DC", "DC")]:
        series.append(dict(name=label, nameEl=el, points=[
            [op, sum(counts[op].values()) if category is None else counts[op][category]]
            for op in operators]))
    return {
        "title": "Cyprus electric vehicle charging points by operator",
        "sourceUrl": SOURCE, "catalogueUrl": CATALOGUE,
        "attribution": "Department of Electrical and Mechanical Services, Cyprus, via CyNAP. Counts and map prepared by Athena.",
        "attributionEl": "Τμήμα Ηλεκτρομηχανολογικών Υπηρεσιών Κύπρου μέσω CyNAP. Καταμέτρηση και χάρτης από την Athena.",
        "licence": "CC BY 4.0", "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "publishedAt": published, "retrievedAt": timestamp(captured), "observedAt": None,
        "sourceSha256": sha256(xml).hexdigest(), "unit": "charging points",
        "method": "Each inventory record counts once under its reported operator and current type. Multiple points can share coordinates. The publication timestamp dates the extract. This inventory does not report current availability.",
        "methodEl": "Κάθε εγγραφή μετρά μία φορά ανά φορέα εκμετάλλευσης και τύπο ρεύματος. Πολλά σημεία μπορεί να έχουν τις ίδιες συντεταγμένες. Η ημερομηνία δημοσίευσης αφορά τον κατάλογο. Τα δεδομένα δεν δείχνουν διαθεσιμότητα σε πραγματικό χρόνο.",
        "coverage": {"sourceRecords": len(locations), "distinctCoordinates": len(positions),
                     "connectors": sum(p["connectors"] for p in locations),
                     "firstRecordCreated": min(dates).isoformat() if dates else None,
                     "lastRecordCreated": max(dates).isoformat() if dates else None},
        "series": series, "locations": locations,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xml", type=Path)
    parser.add_argument("--retrieved-at")
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("ev.json"))
    args = parser.parse_args()
    if bool(args.xml) != bool(args.retrieved_at):
        parser.error("Use --xml with --retrieved-at")
    if args.xml:
        xml, captured = args.xml.read_bytes(), args.retrieved_at
    else:
        with urlopen(SOURCE, timeout=45) as response:
            xml = response.read(10_000_001)
        if len(xml) > 10_000_000:
            raise ValueError("Unexpected inventory size")
        captured = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data = snapshot(xml, captured)
    with NamedTemporaryFile("w", dir=args.output.parent, encoding="utf-8", delete=False) as out:
        json.dump(data, out, ensure_ascii=False, indent=2)
        out.write("\n")
    Path(out.name).replace(args.output)


if __name__ == "__main__":
    main()
