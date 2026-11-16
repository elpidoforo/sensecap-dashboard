"""Build the municipal census comparison from the four official table rows.

census-source.csv transcribes the "Total" sex row for each municipality in
CYSTAT's 2021 Census, tables 1891108E and 1891114E (municipal subtotals).
The age columns follow the published order. Both sources are linked in the
output. Rebuild with python3 fieldwork/import_census.py, or add --check to
verify the committed snapshot offline. Use --verify-source to compare all 72
source cells against the official PxWeb API.
"""

import argparse
import csv
import json
from pathlib import Path
from urllib.request import Request, urlopen

FOLDER = Path(__file__).resolve().parent
OUTPUT = FOLDER / "census.json"
SOURCE = FOLDER / "census-source.csv"
TABLES = (
    "https://cystatdb.cystat.gov.cy/pxweb/en/8.CYSTAT-DB/"
    "8.CYSTAT-DB__Population__Census%20of%20Population%20and%20Housing%202021"
    "__Population__Population%20-%20Place%20of%20Residence/"
)
API_URL = (
    "https://cystatdb.cystat.gov.cy/api/v1/en/8.CYSTAT-DB/Population/"
    "Census%20of%20Population%20and%20Housing%202021/Population/"
    "Population%20-%20Place%20of%20Residence/1891108E.px"
)
MUNICIPALITIES = {"Lefkosia": "1000", "Larnaka": "4000", "Lemesos": "5000", "Pafos": "6000"}
AGE_BANDS = [f"{age}-{age + 4}" for age in range(0, 80, 5)] + ["80+"]
CATEGORIES = {
    "All ages": AGE_BANDS,
    "Ages 0–14": AGE_BANDS[:3],
    "Ages 15–64": AGE_BANDS[3:13],
    "Ages 65+": AGE_BANDS[13:],
}


def read_rows():
    with SOURCE.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["municipality", "total", *AGE_BANDS]:
            raise ValueError("Expected a municipal total and the 17 published age bands")
        rows = {}
        for row in reader:
            city = row["municipality"]
            if city in rows or city not in MUNICIPALITIES:
                raise ValueError(f"Unexpected or repeated municipality: {city}")
            counts = {band: int(row[band]) for band in AGE_BANDS}
            if min(counts.values()) < 0 or sum(counts.values()) != int(row["total"]):
                raise ValueError(f"Age bands do not reconcile with the census total for {city}")
            rows[city] = counts
        if rows.keys() != set(MUNICIPALITIES):
            raise ValueError("Missing one or more requested municipalities")
        return rows


def verify_source(rows):
    # CYSTAT codes 1 through 17 identify successive five-year bands and 80+.
    # Code 0 selects all ages or sexes within its respective dimension.
    dimensions = {
        "DISTRICT, MUNICIPALITY/COMMUNITY": list(MUNICIPALITIES.values()),
        "SEX": ["0"],
        "AGE": [str(i) for i in range(len(AGE_BANDS) + 1)],
    }
    query = [
        {"code": code, "selection": {"filter": "item", "values": values}}
        for code, values in dimensions.items()
    ]
    body = json.dumps({"query": query, "response": {"format": "json"}}).encode()
    request = Request(API_URL, data=body, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=25) as response:
        result = json.load(response)
    observation_columns = [c["code"] for c in result["columns"] if c["type"] != "c"]
    if observation_columns != list(dimensions):
        raise ValueError("CYSTAT returned an unexpected dimension order")
    actual = {tuple(cell["key"]): cell["values"] for cell in result["data"]}
    expected = {}
    for city, counts in rows.items():
        values = [sum(counts.values())] + [counts[band] for band in AGE_BANDS]
        for index, value in enumerate(values):
            expected[(MUNICIPALITIES[city], "0", str(index))] = [str(value)]
    if actual != expected or len(actual) != len(result["data"]):
        raise ValueError("The dated source extract differs from the official CYSTAT API")
    print(f"Verified all {len(expected)} cells in CYSTAT's response.")


def make_snapshot():
    rows = read_rows()
    return {
        "title": "Residents by municipality and age, 2021",
        "unit": "residents",
        "sourceUrl": TABLES + "1891108E.px/",
        "crossCheckUrl": TABLES + "1891114E.px/",
        "apiUrl": API_URL,
        "attribution": "© Republic of Cyprus, Statistical Service (CYSTAT), Census of Population and Housing 2021.",
        "licence": "CYSTAT data reuse terms. Attribute the source and identify modifications.",
        "licenceUrl": "https://www.cystat.gov.cy/en/StaticPage?id=1491",
        "referenceDate": "2021-10-01",
        "verifiedDate": "2026-11-16",
        "geography": "Four municipalities as defined for the 2021 census in the government-controlled areas of the Republic of Cyprus. Figures use the municipal boundaries in effect on the census date.",
        "method": "Both sexes combined. Athena groups the published five-year age bands into three age groups. All ages is the published total. CYSTAT is not responsible for Athena's presentation or use of the figures.",
        "series": [
            {
                "name": label,
                "points": [
                    [city, sum(rows[city][band] for band in bands)]
                    for city in MUNICIPALITIES
                ],
            }
            for label, bands in CATEGORIES.items()
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare the snapshot with the source rows")
    parser.add_argument("--verify-source", action="store_true", help="check the records against the official online API")
    args = parser.parse_args()
    snapshot = make_snapshot()
    if args.verify_source:
        verify_source(read_rows())
    if args.check or args.verify_source:
        if snapshot != json.loads(OUTPUT.read_text(encoding="utf-8")):
            parser.exit(1, "Census snapshot differs from its verified source rows.\n")
        print("Verified 4 municipal totals and 12 age-group counts against 68 source age counts.")
    else:
        OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
