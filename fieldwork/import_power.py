"""Build power.json from an archived Eurostat JSON-stat response.

Offline: python3 fieldwork/import_power.py --check
Refresh: download SOURCE, then pass --source PATH --retrieved-at ISO_TIMESTAMP.
"""
import argparse
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
from tempfile import NamedTemporaryFile

HERE = Path(__file__).resolve().parent
SOURCE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_cb_pem?geo=CY&unit=GWH&sinceTimePeriod=2025-01"
CATALOGUE = "https://doi.org/10.2908/nrg_cb_pem"
TERMS = "https://ec.europa.eu/eurostat/help/copyright-notice"
CAPTURED = "2026-11-16T11:14:24+00:00"
FUELS = {
    "O4000XBIO": ("Oil and petroleum products (excluding biofuels)", "Πετρέλαιο και πετρελαϊκά προϊόντα (χωρίς βιοκαύσιμα)"),
    "RA420": ("Solar photovoltaic", "Ηλιακά φωτοβολταϊκά"),
    "RA300": ("Wind", "Αιολική ενέργεια"),
    "CF_R": ("Renewable combustible fuels", "Ανανεώσιμα καύσιμα"),
    "TOTAL": ("Total generation", "Συνολική παραγωγή"),
}


def snapshot(source, retrieved_at):
    data = json.loads(source, parse_float=Decimal)
    if data["class"] != "dataset" or data["source"] != "ESTAT" or data["extension"]["id"] != "NRG_CB_PEM":
        raise ValueError("Unexpected Eurostat dataset")
    if set(data["id"]) != {"siec", "time", "freq", "unit", "geo"} or len(data["size"]) != 5 or len(data["id"]) != 5:
        raise ValueError("Unexpected dimensions")
    indexes = {dim: data["dimension"][dim]["category"]["index"] for dim in data["id"]}
    for dim, size in zip(data["id"], data["size"]):
        if sorted(indexes[dim].values()) != list(range(size)):
            raise ValueError(f"Invalid {dim} category positions")
    for dim, code in [("freq", "M"), ("geo", "CY"), ("unit", "GWH")]:
        if indexes[dim] != {code: 0}:
            raise ValueError(f"Unexpected {dim} categories")
    dates = sorted(indexes["time"])
    if not dates or any(not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month) for month in dates):
        raise ValueError("Expected monthly time dimension")
    access = datetime.fromisoformat(retrieved_at)
    updated = datetime.fromisoformat(data["updated"])
    if access.utcoffset() is None or updated.utcoffset() is None:
        raise ValueError("Source and retrieval timestamps must include timezone")
    values = data["value"]
    statuses = data.get("status", {})
    labels = data["extension"].get("status", {}).get("label", {})
    series = [dict(code=k, name=en, nameEl=el, points=[], flags={}) for k, (en, el) in FUELS.items()]
    reported = []
    for month in dates:
        numbers = []
        day = month + "-01"
        for s in series:
            positions = {"freq": 0, "unit": 0, "geo": 0, "siec": indexes["siec"][s["code"]], "time": indexes["time"][month]}
            offset = 0
            for dim, size in zip(data["id"], data["size"]):
                offset = offset * size + positions[dim]
            value = values.get(str(offset))
            if value is not None and (type(value) not in (int, Decimal) or not Decimal(value).is_finite()):
                raise ValueError(f"Invalid numeric value at {month} for {s['code']}")
            numbers.append(value)
            s["points"].append([day, None if value is None else float(value)])
            flag = statuses.get(str(offset))
            if flag:
                if flag not in labels:
                    raise ValueError(f"Undefined status {flag}")
                s["flags"][day] = flag
        if all(v is None for v in numbers):
            continue
        if any(v is None for v in numbers) or sum(numbers[:-1]) != numbers[-1]:
            raise ValueError(f"Incomplete or unreconciled four-fuel breakdown in {month}")
        reported.append(month)
    if not reported:
        raise ValueError("No reported Cyprus months")
    return {
        "title": "Cyprus monthly net electricity generation by fuel",
        "sourceUrl": SOURCE, "catalogueUrl": CATALOGUE, "licenceUrl": TERMS,
        "licence": "Eurostat statistical data reuse with source acknowledgement",
        "attribution": f"Source: Eurostat, {CATALOGUE}, accessed {access.date()}. Athena selected and translated the Cyprus series. Eurostat is not responsible for this presentation.",
        "attributionEl": f"Πηγή: Eurostat, {CATALOGUE}, πρόσβαση {access.date()}. Η Αθηνά επέλεξε και μετέφρασε τις σειρές για την Κύπρο. Η Eurostat δεν ευθύνεται για αυτή την παρουσίαση.",
        "unit": "GWh", "sourceUpdated": updated.isoformat(), "retrievedAt": access.isoformat(),
        "sourceSha256": hashlib.sha256(source).hexdigest(),
        "method": "Monthly national net electricity generation. The four selected fuels sum to the separately reported total for each populated month. Blank values mean unreported. Flags describe individual values.",
        "methodEl": "Μηνιαία καθαρή παραγωγή ηλεκτρικής ενέργειας σε εθνικό επίπεδο. Το άθροισμα των τεσσάρων πηγών ισούται με το δημοσιευμένο σύνολο κάθε μήνα με στοιχεία. Κενή τιμή σημαίνει ότι δεν αναφέρθηκε μέτρηση. Οι ενδείξεις ποιότητας αφορούν μεμονωμένες τιμές.",
        "flagDefinitions": labels,
        "coverage": dict(firstMonth=dates[0], lastIndexedMonth=dates[-1], lastReportedMonth=reported[-1], reportedMonths=len(reported), indexedMonths=len(dates)),
        "series": series,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--retrieved-at")
    parser.add_argument("--output", type=Path, default=HERE / "power.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if bool(args.source) != bool(args.retrieved_at):
        parser.error("Supply --source and --retrieved-at together")
    source = (args.source or HERE / "power-source.jsonstat").read_bytes()
    data = snapshot(source, args.retrieved_at or CAPTURED)
    result = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if result != args.output.read_text(encoding="utf-8"):
            raise SystemExit("Stored extract differs from the source")
        return
    with NamedTemporaryFile("w", dir=args.output.parent, encoding="utf-8", delete=False) as out:
        out.write(result)
    Path(out.name).replace(args.output)


if __name__ == "__main__":
    main()
