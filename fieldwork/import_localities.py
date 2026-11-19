"""Build residents and age by locality for the data stack from three census files.

All three were saved in the research checkpoint of 19 November 2026 and are kept
here byte for byte (their SHA-256 is checked before anything is built):

  stack/census-localities-source.csv       residents by five-year age band for every reporting area of the 2021 census,
                                           with the CYSTAT geography code of each area (checkpoint table
                                           census/tables/age_by_geography_code.csv, made from CYSTAT predefined table 47)
  stack/census-localities-meanage.csv      mean age by area, CYSTAT predefined table 48, as downloaded (Windows-1252)
  stack/census-localities-composition.csv  which 2021 areas make up each of the four municipalities after the local
                                           government reform of 1 July 2024 (checkpoint table municipal_composition.csv)

Rebuild with python3 fieldwork/import_localities.py, or add --check to verify the
committed snapshot offline. Nothing here asks the network.

Rules kept by the code: both sexes together only; a total is never added to its
parts; an area with fewer than AGE_FLOOR residents keeps its count but no age
figures, because an average age of a handful of people is about those people.
"""

import argparse
import csv
from hashlib import sha256
import io
import json
from pathlib import Path

FOLDER = Path(__file__).resolve().parent / "stack"
OUTPUT = FOLDER / "census-localities.json"
SOURCE = FOLDER / "census-localities-source.csv"
MEAN_AGE = FOLDER / "census-localities-meanage.csv"
COMPOSITION = FOLDER / "census-localities-composition.csv"
SHA256 = {
    SOURCE.name: "4600a7cc11c9e6964221ab05e1f1cfb431806c10812395109b9aff3c996c7aaf",
    MEAN_AGE.name: "3edbad9db4ac62795c563d89dca3700ab8f47160be449c9dd65b698023759243",
    COMPOSITION.name: "dea085a3083b83ab585e7628e11ffa00871dce8aeb3e1005758df685d52eb73c",
}
AGE_BANDS = [f"{age}-{age + 4}" for age in range(0, 80, 5)] + ["80+"]
UNDER_15, OVER_65 = AGE_BANDS[:3], AGE_BANDS[13:]
AGE_FLOOR = 50
LEVELS = {
    "all reporting districts": "total",
    "district": "district",
    "municipality or community": "locality",
    "quarter": "quarter",
}
CITIES = {"Lefkosia": "1000", "Larnaka": "4000", "Lemesos": "5000", "Pafos": "6000"}


def percent(part, whole):
    """A share in percent with two decimals, worked out in whole numbers (half rounds up)."""
    return (part * 20000 + whole) // (2 * whole) / 100


def groups(counts):
    under, over = sum(counts[b] for b in UNDER_15), sum(counts[b] for b in OVER_65)
    total = sum(counts.values())
    return {"under15": under, "age15to64": total - under - over, "age65plus": over}


def read_areas(text):
    reader = csv.DictReader(io.StringIO(text))
    wanted = ["census_geography_code", "publisher_area", "geography_level", "parent_district", "sex", "Total", *AGE_BANDS]
    if reader.fieldnames != wanted:
        raise ValueError("Expected the geography code, the area, its level, the district, the sex, a total and the 17 age bands")
    areas, names = {}, {}
    for row in reader:
        if row["sex"] != "Total":
            continue                      # males and females overlap the total: one sex category only
        code, name, level = row["census_geography_code"], row["publisher_area"], LEVELS.get(row["geography_level"])
        if not code or code in areas or not name or name in names or level is None:
            raise ValueError(f"Missing, repeated or unknown area: {code!r} {name!r}")
        counts = {band: int(row[band]) for band in AGE_BANDS}
        if min(counts.values()) < 0 or sum(counts.values()) != int(row["Total"]):
            raise ValueError(f"Age bands do not add up to the published total for {name}")
        areas[code] = {"code": code, "name": name, "level": level, "districtName": row["parent_district"], "counts": counts}
        names[name] = code
    return areas, names


def read_mean_age(raw, names):
    reader = csv.reader(io.StringIO(raw.decode("cp1252")))
    header = next(reader, None)
    if not header or header[1:] != ["Total", "Males", "Females"]:
        raise ValueError("Expected the mean age table with a total and both sexes")
    out = {}
    for row in reader:
        if len(row) != 4 or row[0] not in names or names[row[0]] in out:
            raise ValueError(f"Mean age row for an unknown or repeated area: {row[:1]!r}")
        value = float(row[1])
        if not 0 < value < 110:
            raise ValueError(f"Mean age out of range for {row[0]}")
        out[names[row[0]]] = value
    return out


def read_composition(text, areas):
    reader = csv.DictReader(io.StringIO(text))
    out, used = {}, set()
    for row in reader:
        city, code = row["municipality_after_reform"], row["component_census_code"]
        if city not in CITIES or code not in areas or areas[code]["level"] != "locality" or code in used:
            raise ValueError(f"Unknown or repeated component: {city!r} {code!r}")
        if areas[code]["name"] != row["component_census_label"]:
            raise ValueError(f"Component label does not match its census code: {code}")
        used.add(code)
        entry = out.setdefault(city, {"components": [], "evidenceUrl": row["evidence_url"]})
        entry["components"].append(code)
    if set(out) != set(CITIES) or any(CITIES[c] not in out[c]["components"] for c in out):
        raise ValueError("Each of the four municipalities needs its own 2021 area among its components")
    return out


def make_snapshot(source, mean_age, composition):
    areas, names = read_areas(source.decode("utf-8-sig"))
    means = read_mean_age(mean_age, names)
    recast = read_composition(composition.decode("utf-8-sig"), areas)
    by_level = {level: [a for a in areas.values() if a["level"] == level] for level in LEVELS.values()}
    if len(by_level["total"]) != 1:
        raise ValueError("Expected one row for all reporting districts")
    district_code = {d["name"]: d["code"] for d in by_level["district"]}

    def figures(area, mean=True):
        total = sum(area["counts"].values())
        row = {"code": area["code"], "name": area["name"], "residents": total}
        if total < AGE_FLOOR:
            row.update(meanAge=None, under15=None, age15to64=None, age65plus=None,
                       under15Percent=None, age65plusPercent=None, ageWithheld=True)
            return row
        g = groups(area["counts"])
        row.update(meanAge=means.get(area["code"]) if mean else None, **g,
                   under15Percent=percent(g["under15"], total), age65plusPercent=percent(g["age65plus"], total), ageWithheld=False)
        return row

    districts, localities, quarters = [], [], []
    for area in by_level["district"]:
        districts.append(figures(area))
    for area in by_level["locality"]:
        if area["districtName"] not in district_code or area["code"][0] != district_code[area["districtName"]]:
            raise ValueError(f"{area['name']} is not inside the district its code names")
        localities.append({**figures(area), "district": area["code"][0]})
    for area in by_level["quarter"]:
        parent = area["code"][:4]
        if parent not in areas or areas[parent]["level"] != "locality":
            raise ValueError(f"Quarter without a parent municipality: {area['name']}")
        quarters.append({"code": area["code"], "parent": parent, "name": area["name"], "residents": sum(area["counts"].values())})

    # every level must reproduce the one above it, or nothing is written
    total = sum(by_level["total"][0]["counts"].values())
    if sum(d["residents"] for d in districts) != total:
        raise ValueError("The districts do not add up to the published total")
    for d in districts:
        if sum(l["residents"] for l in localities if l["district"] == d["code"]) != d["residents"]:
            raise ValueError(f"The municipalities and communities of {d['name']} do not add up to the district")
    parents = {}
    for q in quarters:
        parents[q["parent"]] = parents.get(q["parent"], 0) + q["residents"]
    by_code = {l["code"]: l for l in localities}
    for parent, residents in parents.items():
        if by_code[parent]["residents"] != residents:
            raise ValueError(f"The quarters of {by_code[parent]['name']} do not add up to it")
    for l in localities:
        l["quarters"] = sum(q["parent"] == l["code"] for q in quarters)

    recast_rows = []
    for city, entry in recast.items():
        counts = {band: sum(areas[code]["counts"][band] for code in entry["components"]) for band in AGE_BANDS}
        g, residents = groups(counts), sum(counts.values())
        recast_rows.append({
            "municipality": city, "ownCode": CITIES[city], "components": entry["components"], "residents": residents, **g,
            "under15Percent": percent(g["under15"], residents), "age65plusPercent": percent(g["age65plus"], residents),
            "meanAge": None, "evidenceUrl": entry["evidenceUrl"],
        })

    whole = figures(by_level["total"][0])
    return {
        "title": "Residents and age by municipality and community, census of 1 October 2021",
        "titleEl": "Κάτοικοι και ηλικία ανά δήμο και κοινότητα, απογραφή 1ης Οκτωβρίου 2021",
        "unit": "residents",
        "sourceUrl": "https://cystatdb23.cystat.gov.cy/cystatdb/predefined/47",
        "meanAgeSourceUrl": "https://cystatdb23.cystat.gov.cy/cystatdb/predefined/48",
        "catalogueUrl": "https://www.data.gov.cy/index.php/en/dataset/2130",
        "attribution": "© Republic of Cyprus, Statistical Service (CYSTAT), Census of Population and Housing 2021. Kleanthis grouped the published age bands and recast four municipalities; CYSTAT is not responsible for these adaptations.",
        "attributionEl": "© Κυπριακή Δημοκρατία, Στατιστική Υπηρεσία (CYSTAT), Απογραφή Πληθυσμού και Κατοικιών 2021. Ο Κλεάνθης ομαδοποίησε τις ηλικιακές ομάδες και ξαναϋπολόγισε τέσσερις δήμους· η CYSTAT δεν ευθύνεται για αυτές τις προσαρμογές.",
        "licence": "CYSTAT data reuse terms. Attribute the source and identify modifications.",
        "licenceUrl": "https://www.cystat.gov.cy/en/StaticPage?id=1491",
        "referenceDate": "2021-10-01",
        "retrievedAt": "2026-11-19",
        "sourceSha256": sha256(source).hexdigest(),
        "meanAgeSha256": sha256(mean_age).hexdigest(),
        "compositionSha256": sha256(composition).hexdigest(),
        "live": False,
        "geography": "Reporting areas of the 2021 census in the government-controlled areas of the Republic of Cyprus: five districts, 396 municipalities and communities as they existed on census day, and 99 quarters inside 18 of them. The file holds no map shapes and no coordinates.",
        "geographyEl": "Περιοχές αναφοράς της απογραφής 2021 στις ελεγχόμενες από την κυβέρνηση περιοχές της Κυπριακής Δημοκρατίας: πέντε επαρχίες, 396 δήμοι και κοινότητες όπως ήταν την ημέρα της απογραφής, και 99 ενορίες μέσα σε 18 από αυτούς. Το αρχείο δεν έχει σχήματα χάρτη ούτε συντεταγμένες.",
        "method": f"Both sexes together. Under 15 adds the bands 0-4 to 10-14, 65 and over adds 65-69 to 80+, and 15 to 64 is the rest. Percentages are worked out after adding the counts and have two decimals. Mean age is copied from CYSTAT and joined by the exact published name of the area. An area with fewer than {AGE_FLOOR} residents keeps its count but no age figures. The 2024 rows add the 2021 residents of the areas that form each municipality since the reform of 1 July 2024; they are not an estimate of the population on that date, and they have no mean age because CYSTAT did not publish one for them.",
        "methodEl": f"Και τα δύο φύλα μαζί. Το «κάτω των 15» προσθέτει τις ομάδες 0-4 έως 10-14, το «65 και άνω» τις ομάδες 65-69 έως 80+, και το «15 έως 64» είναι το υπόλοιπο. Τα ποσοστά υπολογίζονται αφού προστεθούν οι αριθμοί και έχουν δύο δεκαδικά. Η μέση ηλικία είναι αντιγραμμένη από τη CYSTAT και ενώνεται με το ακριβές δημοσιευμένο όνομα της περιοχής. Μια περιοχή με λιγότερους από {AGE_FLOOR} κατοίκους κρατά τον αριθμό της αλλά όχι στοιχεία ηλικίας. Οι γραμμές του 2024 προσθέτουν τους κατοίκους του 2021 στις περιοχές που αποτελούν κάθε δήμο μετά τη μεταρρύθμιση της 1ης Ιουλίου 2024· δεν είναι εκτίμηση του πληθυσμού εκείνης της ημέρας και δεν έχουν μέση ηλικία, γιατί η CYSTAT δεν δημοσίευσε.",
        "ageFloor": AGE_FLOOR,
        "coverage": {
            "districts": len(districts), "localities": len(localities), "quarters": len(quarters),
            "residents": total, "meanAgeJoined": len(means), "meanAgeRows": len(names),
            "ageWithheld": sum(l["ageWithheld"] for l in localities),
        },
        "total": whole,
        "districts": districts,
        "localities": localities,
        "quarters": quarters,
        "recast2024": recast_rows,
    }


def read_sources():
    raws = []
    for path in (SOURCE, MEAN_AGE, COMPOSITION):
        raw = path.read_bytes()
        if sha256(raw).hexdigest() != SHA256[path.name]:
            raise ValueError(f"{path.name} is not the file from the research checkpoint")
        raws.append(raw)
    return raws


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare the snapshot with the three census files")
    args = parser.parse_args()
    snapshot = make_snapshot(*read_sources())
    if args.check:
        if snapshot != json.loads(OUTPUT.read_text(encoding="utf-8")):
            parser.exit(1, "Locality snapshot differs from the census files.\n")
        c = snapshot["coverage"]
        print(f"Verified {c['localities']} municipalities and communities, {c['districts']} districts and {c['residents']} residents.")
    else:
        OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).replace('},{"code"', '},\n{"code"') + "\n", encoding="utf-8")
