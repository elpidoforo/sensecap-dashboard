"""Build building permits by district for the data stack from the saved CYSTAT table.

stack/permits-source.csv is the long table of CYSTAT matrix 1440010E (building
permits by district and urban or rural area, monthly, January 2015 to July 2026)
as it was saved in the research checkpoint of 19 November 2026, byte for byte.
Rebuild with python3 fieldwork/import_permits.py, or add --check to verify the
committed snapshot offline. Nothing here asks the network.

Rules kept by the code: a zero is an observation and an empty cell is missing; a
cell CYSTAT marks N.A. stays empty with its mark; the reporting total and each
district total overlap their parts and are never added to them.
"""

import argparse
import csv
from hashlib import sha256
import io
import json
from pathlib import Path

FOLDER = Path(__file__).resolve().parent / "stack"
SOURCE = FOLDER / "permits-source.csv"
OUTPUT = FOLDER / "permits.json"
SOURCE_SHA256 = "d55e2cc97820fad9fb42a42adc3551d3fadb4a1bbc1b7bb01d4c89f448b9c804"
FIELDS = ["period", "district_code", "district", "area_type_code", "area_type", "measurement_code", "measurement",
          "reference_period_code", "reference_period", "indicator_code", "indicator", "unit", "value", "status"]
INDICATORS = {"0": ("permits", "permits"), "1": ("floorArea", "square metres"), "2": ("value", "thousand EUR"), "3": ("dwellings", "dwelling units")}
AREAS = {"0": "total", "1": "urban", "2": "rural"}
REPORTING_TOTAL = "District Total"
MARKS = {"", "N.A."}


def read_rows(text):
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames != FIELDS:
        raise ValueError("Expected the long permits table with a value and a status column")
    cells, districts = {}, {}
    for row in reader:
        indicator, area = row["indicator_code"], row["area_type_code"]
        if indicator not in INDICATORS or INDICATORS[indicator][1] != row["unit"] or area not in AREAS or AREAS[area] != row["area_type"].lower():
            raise ValueError(f"Unknown indicator, unit or area type in {row['period']}")
        if row["measurement"] != "Number" or row["reference_period"] != "Monthly data" or row["status"] not in MARKS:
            raise ValueError(f"Unexpected measurement, period type or mark in {row['period']}")
        if len(row["period"]) != 7 or row["period"][4] != "-":
            raise ValueError(f"Not a month: {row['period']!r}")
        if districts.setdefault(row["district_code"], row["district"]) != row["district"]:
            raise ValueError("One district code carries two names")
        if row["value"] == "":
            value = None
        else:
            value = int(row["value"])
            if value < 0 or row["status"]:
                raise ValueError(f"A negative or marked value in {row['period']}")
        key = (row["period"], row["district_code"], AREAS[area], INDICATORS[indicator][0])
        if key in cells:
            raise ValueError(f"The same cell twice: {key}")
        cells[key] = (value, row["status"] or None)
    if not cells:
        raise ValueError("The permits table is empty")
    return cells, districts


def snapshot(raw):
    cells, names = read_rows(raw.decode("utf-8-sig"))
    months = sorted({key[0] for key in cells})
    total_code = next((code for code, name in names.items() if name == REPORTING_TOTAL), None)
    if total_code is None:
        raise ValueError("The reporting total is missing")
    district_codes = [code for code in names if code != total_code]
    latest = months[-1]

    def row(code, month):
        out = {"code": code, "name": names[code]}
        for area in AREAS.values():
            figures, marks = {}, {}
            for key, _unit in INDICATORS.values():
                value, mark = cells.get((month, code, area, key), (None, None))
                figures[key] = value
                if mark:
                    marks[key] = mark
            out[area] = {**figures, **({"marks": marks} if marks else {})}
        return out

    latest_rows = [row(code, latest) for code in district_codes]
    total_row = row(total_code, latest)
    # the parts must give the published total for the newest month, or nothing is written
    for key, _unit in INDICATORS.values():
        parts = [r["total"][key] for r in latest_rows]
        if None in parts or sum(parts) != total_row["total"][key]:
            raise ValueError(f"The districts do not add up to the reporting total for {key} in {latest}")
    series = {code: [cells.get((month, code, "total", "permits"), (None, None))[0] for month in months] for code in district_codes}
    return {
        "title": "Building permits by district, monthly",
        "titleEl": "Άδειες οικοδομής ανά επαρχία, ανά μήνα",
        "unit": "permits",
        "sourceUrl": "https://cystatdb.cystat.gov.cy/pxweb/en/8.CYSTAT-DB/8.CYSTAT-DB__Construction__Building%20Permits/1440010E.px/",
        "apiUrl": "https://cystatdb.cystat.gov.cy/api/v1/en/8.CYSTAT-DB/Construction/Building%20Permits/1440010E.px",
        "attribution": "© Republic of Cyprus, Statistical Service. Kleanthis reshaped the published permit statistics; CYSTAT is not responsible for the adaptation.",
        "attributionEl": "© Κυπριακή Δημοκρατία, Στατιστική Υπηρεσία. Ο Κλεάνθης αναδιάταξε τα δημοσιευμένα στατιστικά αδειών· η CYSTAT δεν ευθύνεται για την προσαρμογή.",
        "licence": "CYSTAT data reuse terms. Attribute the source and identify modifications.",
        "licenceUrl": "https://www.cystat.gov.cy/en/StaticPage?id=1491",
        "referenceDate": f"{months[0]} / {latest}",
        "retrievedAt": "2026-11-19",
        "sourceSha256": sha256(raw).hexdigest(),
        "live": False,
        "frequency": "monthly",
        "geography": "Five reporting districts of the Statistical Service, each split into urban and rural areas, plus a reporting total. These districts are not the census municipalities, and the table carries no map shapes.",
        "geographyEl": "Πέντε επαρχίες αναφοράς της Στατιστικής Υπηρεσίας, καθεμία χωρισμένη σε αστικές και αγροτικές περιοχές, και ένα σύνολο αναφοράς. Οι επαρχίες αυτές δεν είναι οι δήμοι της απογραφής και ο πίνακας δεν έχει σχήματα χάρτη.",
        "method": "Values are copied from the published table: number of permits, authorised floor area, value and dwelling units. A zero is an observation and an empty cell is missing. Cells marked N.A. by CYSTAT stay empty with their mark. The total of a district overlaps its urban and rural parts, and the reporting total overlaps the districts, so neither is ever added to its parts.",
        "methodEl": "Οι τιμές είναι αντιγραμμένες από τον δημοσιευμένο πίνακα: αριθμός αδειών, εγκεκριμένο εμβαδόν, αξία και οικιστικές μονάδες. Το μηδέν είναι παρατήρηση και το κενό κελί είναι έλλειψη. Τα κελιά που η CYSTAT σημειώνει ως N.A. μένουν κενά με τη σημείωσή τους. Το σύνολο μιας επαρχίας περιέχει το αστικό και το αγροτικό της μέρος, και το σύνολο αναφοράς περιέχει τις επαρχίες, άρα κανένα δεν προστίθεται ποτέ στα μέρη του.",
        "annotation": {
            "month": "2024-07",
            "text": "From July 2024 the licensing of building permits moved to new authorities and the new information system caused delays, so months before and after are not directly comparable.",
            "textEl": "Από τον Ιούλιο 2024 η αδειοδότηση οικοδομών πέρασε σε νέες αρχές και το νέο πληροφοριακό σύστημα έφερε καθυστερήσεις, άρα οι μήνες πριν και μετά δεν συγκρίνονται άμεσα.",
            "url": "https://www.gov.cy/en/economy-and-finance/building-permits-july-2024/",
        },
        "indicators": [{"key": key, "unit": unit} for key, unit in INDICATORS.values()],
        "coverage": {
            "months": len(months), "firstMonth": months[0], "latestMonth": latest, "districts": len(district_codes),
            "numericValues": sum(value is not None for value, _ in cells.values()),
            "notApplicable": sum(mark == "N.A." for _, mark in cells.values()),
        },
        "latestMonth": latest,
        "latest": latest_rows,
        "reportingTotal": total_row,
        "months": months,
        "permitsByMonth": [{"code": code, "name": names[code], "values": series[code]} for code in district_codes],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare the snapshot with the saved CYSTAT table")
    args = parser.parse_args()
    raw = SOURCE.read_bytes()
    if sha256(raw).hexdigest() != SOURCE_SHA256:
        parser.exit(1, "The saved permits table is not the file from the research checkpoint.\n")
    result = snapshot(raw)
    if args.check:
        if result != json.loads(OUTPUT.read_text(encoding="utf-8")):
            parser.exit(1, "Permits snapshot differs from the saved CYSTAT table.\n")
        c = result["coverage"]
        print(f"Verified {c['numericValues']} values and {c['notApplicable']} N.A. cells over {c['months']} months.")
    else:
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
