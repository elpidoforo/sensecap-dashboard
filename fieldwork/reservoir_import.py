"""Rebuild the Athena reservoir extract from the bundled, unmodified WDD CSV.

Run from any directory: python3 path/to/fieldwork/reservoir_import.py
"""

import argparse
import csv
import hashlib
import io
import json
import math
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote


HERE = Path(__file__).resolve().parent
DAMS = {"KOURIS": "Kouris", "LEFKARA": "Lefkara", "ASPROKREMMOS": "Asprokremmos"}
SOURCE_URL = "https://www.data.gov.cy/en/dataset/457"
CSV_URL = "https://www.data.gov.cy/sites/default/files/" + quote("Αποθήκευση Νερου στα Φράγματα_4.csv")
GAP_DAYS = 25  # A missed twice-monthly reading should break a trend line.


def extract(source):
    reader = csv.DictReader(io.StringIO(source.decode("utf-8-sig"), newline=""))
    required = {"DATE", *DAMS}
    if reader.fieldnames is None or not required.issubset(reader.fieldnames):
        raise ValueError("Missing DATE or a required reservoir column")

    readings = {key: defaultdict(set) for key in DAMS}
    blanks = {name: 0 for name in DAMS.values()}
    conflicts = []
    dates = set()
    row_count = 0
    for row in reader:
        row_count += 1
        if None in row or any(row[key] is None for key in required):
            raise ValueError(f"Malformed row on CSV line {reader.line_num}")
        day = datetime.strptime(row["DATE"].strip(), "%d/%m/%Y").date().isoformat()
        dates.add(day)
        for key, name in DAMS.items():
            raw = row[key].strip()
            if not raw:
                blanks[name] += 1
                continue
            value = float(raw)
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"Invalid storage on CSV line {reader.line_num}: {name}")
            readings[key][day].add(value)
    if not dates:
        raise ValueError("CSV contains no dated observations")

    series = []
    for key, name in DAMS.items():
        points = []
        gaps = []
        for day, values in sorted(readings[key].items()):
            if len(values) > 1:
                conflicts.append({"name": name, "date": day, "values": sorted(values)})
                continue
            if points:
                previous_day = points[-1][0]
                if (date.fromisoformat(day) - date.fromisoformat(previous_day)).days > GAP_DAYS:
                    gaps.append([previous_day, day])
            points.append([day, next(iter(values))])
        series.append({"name": name, "points": points, "gaps": gaps})
    return {
        "title": "Cyprus reservoir storage",
        "sourceUrl": SOURCE_URL,
        "downloadUrl": CSV_URL,
        "attribution": "Water Development Department, Republic of Cyprus. Adapted from the national open data portal.",
        "licence": "CC BY 4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "unit": "million m³",
        "cadence": "Twice monthly, with gaps",
        "kind": "Historical measurements",
        "coverageStart": min(dates),
        "coverageEnd": max(dates),
        "method": (
            "Reshape three columns from the published CSV. Use the observation dates printed in the file. "
            "Keep measured zeroes. Omit empty cells and conflicting values for the same reservoir and date. "
            "Collapse identical duplicate values. Sort by date. No estimates or interpolation."
        ),
        "sourceSha256": hashlib.sha256(source).hexdigest(),
        "quality": {
            "sourceRows": row_count,
            "distinctSourceDates": len(dates),
            "blankCells": blanks,
            "excludedConflicts": conflicts,
            "breakLinesAfterDays": GAP_DAYS,
            "gapDescription": "Each gap lists the observed dates on either side of an interval longer than 25 days."
        },
        "series": series,
    }


def render(dataset):
    # Keep points compact enough to ship as static JSON.
    return json.dumps(dataset, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=HERE / "reservoir-source.csv")
    parser.add_argument("--output", type=Path, default=HERE / "reservoir.json")
    args = parser.parse_args()
    result = render(extract(args.source.read_bytes()))
    args.output.write_text(result, encoding="utf-8")


if __name__ == "__main__":
    main()
