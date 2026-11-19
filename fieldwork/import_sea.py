"""Build the three sea extracts from archived Eurostat JSON-stat responses.

seaarrivals.json   vessel arrivals at Larnaka and Lemesos   (mar_tf_qm)
seanational.json   vessel arrivals, Cyprus as a whole        (mar_tf_qm)
seafreight.json    gross weight handled at five ports        (mar_go_qm_cy)

Offline: python3 fieldwork/import_sea.py --check
Rebuild: python3 fieldwork/import_sea.py
Refresh: download the SOURCE of one extract, replace its *-source.jsonstat, set RETRIEVED, rebuild.

These are published statistics by quarter. They do not say where any ship is.
An absent cell stays null (not reported). A published 0 stays 0. Nothing is summed or estimated here.
"""
import argparse
from datetime import date, datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
from tempfile import NamedTemporaryFile

HERE = Path(__file__).resolve().parent
API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
TERMS = "https://ec.europa.eu/eurostat/help/copyright-notice"
RETRIEVED = "2026-11-19"

# Names in both languages. The English names are Eurostat's own labels; the Greek ones are Kleanthis translations.
PORTS = {
    "CY_0CYLCA": ("Larnaka", "Λάρνακα"),
    "CY_0CYLMS": ("Lemesos", "Λεμεσός"),
    "CY_0CYZYY": ("Zygi (Vasilikos area)", "Ζύγι (περιοχή Βασιλικού)"),
    "CY_0CYDHK": ("Dekeleia", "Δεκέλεια"),
    "CY_0CYMOI": ("Moni", "Μονή"),
    "CY": ("Cyprus as a whole", "Κύπρος συνολικά"),
}
# Approximate positions of the ports, rounded to two decimals. They are NOT part of the Eurostat tables:
# Kleanthis added them only so the ports can be drawn on the outline of Cyprus.
POSITIONS = {
    "CY_0CYLCA": (34.92, 33.65),
    "CY_0CYLMS": (34.65, 33.02),
    "CY_0CYZYY": (34.72, 33.32),
    "CY_0CYDHK": (34.98, 33.75),
    "CY_0CYMOI": (34.71, 33.19),
}
VESSELS = {
    "TOTAL": ("All vessel types (published total)", "Όλοι οι τύποι πλοίων (δημοσιευμένο σύνολο)"),
    "LBK": ("Liquid bulk tanker", "Δεξαμενόπλοιο υγρού φορτίου"),
    "DBK": ("Dry bulk carrier", "Πλοίο ξηρού χύδην φορτίου"),
    "ODC_CNT": ("Container ship", "Πλοίο εμπορευματοκιβωτίων"),
    "ODC_SPE": ("Specialised carrier", "Εξειδικευμένο φορτηγό πλοίο"),
    "ODC_GEN": ("General cargo, non-specialised", "Πλοίο γενικού φορτίου"),
    "ODC_DCB": ("Dry cargo barge", "Φορτηγίδα ξηρού φορτίου"),
    "ODC_PCRU": ("Cruise ship", "Κρουαζιερόπλοιο"),
    "ODC_PAS_XCR": ("Passenger ship (excluding cruise ship)", "Επιβατηγό πλοίο (εκτός κρουαζιερόπλοιων)"),
    "MSC_FISH": ("Fishing vessel", "Αλιευτικό σκάφος"),
    "MSC_OFF": ("Offshore activities vessel", "Σκάφος υπεράκτιων δραστηριοτήτων"),
    "MSC_TOW": ("Tug and pusher craft", "Ρυμουλκό ή ωστικό σκάφος"),
    "MSC_OTH": ("Other type of vessel (dredger, research vessel, other)", "Άλλος τύπος σκάφους (βυθοκόρος, ερευνητικό σκάφος, άλλο)"),
    "UNK": ("Unknown", "Άγνωστος τύπος"),
}
CARGO = {
    "TOTAL": ("All cargo (published total)", "Όλα τα φορτία (δημοσιευμένο σύνολο)"),
    "LBK": ("Liquid bulk goods", "Υγρό χύδην φορτίο"),
    "DBK": ("Dry bulk goods", "Ξηρό χύδην φορτίο"),
    "LCNT": ("Large containers", "Μεγάλα εμπορευματοκιβώτια"),
    "RO_MSP": ("Ro-Ro - mobile self-propelled units", "Ro-Ro: αυτοκινούμενες μονάδες"),
    "RO_MNSP": ("Ro-Ro - mobile non-self-propelled units", "Ro-Ro: μη αυτοκινούμενες μονάδες"),
    "OTH": ("Other cargo not elsewhere specified", "Άλλο φορτίο"),
    "UNK": ("Unknown", "Άγνωστο φορτίο"),
}
DIRECTIONS = {
    "TOTAL": ("Both directions (published total)", "Και οι δύο κατευθύνσεις (δημοσιευμένο σύνολο)"),
    "IN": ("Inwards", "Εισερχόμενα"),
    "OUT": ("Outwards", "Εξερχόμενα"),
}
UNITS = {
    "NR": ("arrivals", "αφίξεις"),
    "THS_GT": ("thousand GT (gross tonnage)", "χιλιάδες GT (ολική χωρητικότητα)"),
    "THS_T": ("thousand tonnes", "χιλιάδες τόνοι"),
}

NOT_LIVE = "These are published statistics by quarter. They do not show where ships are right now."
NOT_LIVE_EL = "Αυτά είναι δημοσιευμένα στατιστικά ανά τρίμηνο. Δεν δείχνουν πού βρίσκονται τα πλοία αυτή τη στιγμή."

EXTRACTS = {
    "seaarrivals": dict(
        dataset="MAR_TF_QM",
        source=API + "mar_tf_qm?rep_mar=CY_0CYLCA&rep_mar=CY_0CYLMS&unit=NR&tonnage=TOTAL&sinceTimePeriod=2020",
        dims=["freq", "tonnage", "vessel", "unit", "rep_mar", "time"],
        fixed={"freq": "Q", "tonnage": "TOTAL", "unit": "NR"},
        ports=["CY_0CYLCA", "CY_0CYLMS"], units=["NR"],
        title="Vessel arrivals at Larnaka and Lemesos by type of vessel, by quarter",
        titleEl="Αφίξεις πλοίων στη Λάρνακα και στη Λεμεσό ανά τύπο πλοίου, ανά τρίμηνο",
        method="Quarterly counts of vessels arriving at two reporting ports, all vessel sizes together. Each arrival counts once as a movement, so one ship can be counted many times. The published total already includes every vessel type: never add it to the types. A null value means Eurostat published no figure for that type and quarter. It is not a zero. No value was estimated, filled in or summed by Kleanthis. " + NOT_LIVE,
        methodEl="Τριμηνιαίες καταμετρήσεις αφίξεων πλοίων σε δύο λιμάνια αναφοράς, για όλα τα μεγέθη πλοίων μαζί. Κάθε άφιξη μετρά μία φορά ως κίνηση, άρα το ίδιο πλοίο μπορεί να μετρηθεί πολλές φορές. Το δημοσιευμένο σύνολο περιλαμβάνει ήδη όλους τους τύπους πλοίων: μην το προσθέτεις ποτέ στους τύπους. Η κενή τιμή (null) σημαίνει ότι η Eurostat δεν δημοσίευσε αριθμό για αυτόν τον τύπο και το τρίμηνο. Δεν σημαίνει μηδέν. Ο Κλεάνθης δεν εκτίμησε, δεν συμπλήρωσε και δεν άθροισε καμία τιμή. " + NOT_LIVE_EL,
    ),
    "seanational": dict(
        dataset="MAR_TF_QM",
        source=API + "mar_tf_qm?rep_mar=CY&tonnage=TOTAL&sinceTimePeriod=2020",
        dims=["freq", "tonnage", "vessel", "unit", "rep_mar", "time"],
        fixed={"freq": "Q", "tonnage": "TOTAL", "rep_mar": "CY"},
        ports=["CY"], units=["NR", "THS_GT"],
        title="Vessel arrivals in the main ports of Cyprus as a whole, by quarter",
        titleEl="Αφίξεις πλοίων στα κύρια λιμάνια της Κύπρου συνολικά, ανά τρίμηνο",
        method="Quarterly national figure for Cyprus: number of vessel arrivals and their gross tonnage in thousands, all vessel sizes together. This national figure overlaps the separate Larnaka and Lemesos extract geographically: never add the two together. The published total already includes every vessel type. A null value means Eurostat published no figure. It is not a zero. No value was estimated, filled in or summed by Kleanthis. " + NOT_LIVE,
        methodEl="Τριμηνιαίο εθνικό μέγεθος για την Κύπρο: αριθμός αφίξεων πλοίων και ολική χωρητικότητά τους σε χιλιάδες, για όλα τα μεγέθη πλοίων μαζί. Το εθνικό μέγεθος επικαλύπτεται γεωγραφικά με το χωριστό απόσπασμα για τη Λάρνακα και τη Λεμεσό: μην τα προσθέτεις ποτέ μεταξύ τους. Το δημοσιευμένο σύνολο περιλαμβάνει ήδη όλους τους τύπους πλοίων. Η κενή τιμή (null) σημαίνει ότι η Eurostat δεν δημοσίευσε αριθμό. Δεν σημαίνει μηδέν. Ο Κλεάνθης δεν εκτίμησε, δεν συμπλήρωσε και δεν άθροισε καμία τιμή. " + NOT_LIVE_EL,
    ),
    "seafreight": dict(
        dataset="MAR_GO_QM_CY",
        source=API + "mar_go_qm_cy?lang=EN&par_mar=TOTAL&rep_mar=CY_0CYLCA&rep_mar=CY_0CYLMS&rep_mar=CY_0CYZYY&rep_mar=CY_0CYDHK&rep_mar=CY_0CYMOI&cargo=TOTAL&cargo=LBK&cargo=DBK&cargo=LCNT&cargo=RO_MSP&cargo=RO_MNSP&cargo=OTH&cargo=UNK&sinceTimePeriod=2015-Q1",
        dims=["freq", "direct", "cargo", "unit", "par_mar", "rep_mar", "time"],
        fixed={"freq": "Q", "unit": "THS_T", "par_mar": "TOTAL"},
        ports=["CY_0CYLCA", "CY_0CYLMS", "CY_0CYZYY", "CY_0CYDHK", "CY_0CYMOI"], units=["THS_T"],
        title="Gross weight of goods handled at five Cyprus ports by cargo group and direction, by quarter",
        titleEl="Μικτό βάρος εμπορευμάτων σε πέντε λιμάνια της Κύπρου ανά ομάδα φορτίου και κατεύθυνση, ανά τρίμηνο",
        method="Quarterly gross weight of goods handled at five reporting ports, in thousand tonnes, all trading partners together, rounded by Eurostat to whole thousand tonnes. Rows for all cargo and rows for both directions are published totals that already include their parts: never add a total to its parts. A null value means Eurostat published no figure. A 0 is a published observation. Moni has no all-cargo total after 2017-Q1 in this extract. Port positions are approximate, rounded to two decimals and added by Kleanthis; they are not part of the Eurostat table. No value was estimated, filled in or summed by Kleanthis. " + NOT_LIVE,
        methodEl="Τριμηνιαίο μικτό βάρος εμπορευμάτων που διακινήθηκαν σε πέντε λιμάνια αναφοράς, σε χιλιάδες τόνους, για όλους τους εμπορικούς εταίρους μαζί, στρογγυλεμένο από τη Eurostat σε ακέραιες χιλιάδες τόνους. Οι γραμμές για όλα τα φορτία και για τις δύο κατευθύνσεις είναι δημοσιευμένα σύνολα που περιλαμβάνουν ήδη τα μέρη τους: μην προσθέτεις ποτέ ένα σύνολο στα μέρη του. Η κενή τιμή (null) σημαίνει ότι η Eurostat δεν δημοσίευσε αριθμό. Το 0 είναι δημοσιευμένη παρατήρηση. Για τη Μονή δεν υπάρχει σύνολο όλων των φορτίων μετά το 2017-Q1 σε αυτό το απόσπασμα. Οι θέσεις των λιμανιών είναι κατά προσέγγιση, στρογγυλεμένες σε δύο δεκαδικά, και τις πρόσθεσε ο Κλεάνθης· δεν ανήκουν στον πίνακα της Eurostat. Ο Κλεάνθης δεν εκτίμησε, δεν συμπλήρωσε και δεν άθροισε καμία τιμή. " + NOT_LIVE_EL,
    ),
}


def pairs(table, codes):
    return [dict(code=c, name=table[c][0], nameEl=table[c][1]) for c in codes]


def snapshot(name, source, retrieved=RETRIEVED):
    spec = EXTRACTS[name]
    data = json.loads(source, parse_float=Decimal)
    if data.get("class") != "dataset" or data.get("source") != "ESTAT" or data["extension"]["id"] != spec["dataset"]:
        raise ValueError("Unexpected Eurostat dataset")
    if data["id"] != spec["dims"] or len(data["size"]) != len(spec["dims"]):
        raise ValueError("Unexpected dimensions")
    index = {dim: data["dimension"][dim]["category"]["index"] for dim in data["id"]}
    for dim, size in zip(data["id"], data["size"]):
        if sorted(index[dim].values()) != list(range(size)):
            raise ValueError(f"Invalid {dim} category positions")
    for dim, code in spec["fixed"].items():
        if index[dim] != {code: 0}:
            raise ValueError(f"Unexpected {dim} categories")
    if set(index["rep_mar"]) != set(spec["ports"]) or set(index["unit"]) != set(spec["units"]):
        raise ValueError("Unexpected ports or units")
    periods = sorted(index["time"], key=index["time"].get)
    if not periods or periods != sorted(periods) or any(not re.fullmatch(r"\d{4}-Q[1-4]", p) for p in periods):
        raise ValueError("Expected an ordered quarterly time dimension")
    date.fromisoformat(retrieved)
    updated = datetime.fromisoformat(data["updated"])
    if updated.utcoffset() is None:
        raise ValueError("Source timestamp must include a timezone")
    values = data["value"]
    if not isinstance(values, dict):
        raise ValueError("Expected sparse values keyed by position")
    statuses = data.get("status") or {}
    labels = (data["extension"].get("status") or {}).get("label", {})
    freight = name == "seafreight"
    kinds = CARGO if freight else VESSELS
    kind_dim = "cargo" if freight else "vessel"
    if set(index[kind_dim]) - set(kinds) or (freight and set(index["direct"]) != set(DIRECTIONS)):
        raise ValueError("Unexpected category codes")
    kind_codes = sorted(index[kind_dim], key=index[kind_dim].get)
    direction_codes = sorted(index["direct"], key=index["direct"].get) if freight else [None]

    def cell(position):
        offset = 0
        for dim, size in zip(data["id"], data["size"]):
            offset = offset * size + position.get(dim, 0)
        return str(offset)

    series, used, observed = [], set(), 0
    last_by_port, last_total_by_port = {}, {}
    for port in spec["ports"]:
        for unit in spec["units"]:
            for kind in kind_codes:
                for direction in direction_codes:
                    position = {"rep_mar": index["rep_mar"][port], "unit": index["unit"][unit], kind_dim: index[kind_dim][kind]}
                    if freight:
                        position["direct"] = index["direct"][direction]
                    points, flags = [], {}
                    for period in periods:
                        key = cell({**position, "time": index["time"][period]})
                        value = values.get(key)
                        if value is not None:
                            if type(value) not in (int, Decimal) or not Decimal(value).is_finite() or value < 0:
                                raise ValueError(f"Invalid numeric value at {period} for {port} {kind}")
                            used.add(key)
                            observed += 1
                            value = int(value) if value == int(value) else float(value)
                            last_by_port[port] = max(last_by_port.get(port, period), period)
                            if kind == "TOTAL" and direction in (None, "TOTAL") and unit == spec["units"][0]:
                                last_total_by_port[port] = max(last_total_by_port.get(port, period), period)
                        flag = statuses.get(key)
                        if flag:
                            if flag not in labels:
                                raise ValueError(f"Undefined status {flag}")
                            flags[period] = flag
                        points.append([period, value])
                    if all(v is None for _, v in points):
                        continue   # Eurostat published nothing for this combination: it stays absent, the page says "not reported"
                    code = "|".join(x for x in (port, unit if len(spec["units"]) > 1 else None, kind, direction) if x)
                    names = [PORTS[port], kinds[kind]] + ([DIRECTIONS[direction]] if freight else []) + ([UNITS[unit]] if len(spec["units"]) > 1 else [])
                    entry = dict(code=code, port=port, unit=unit)
                    entry[kind_dim] = kind
                    if freight:
                        entry["direction"] = direction
                    entry.update(name=" · ".join(n[0] for n in names), nameEl=" · ".join(n[1] for n in names), points=points, flags=flags)
                    series.append(entry)
    if used != set(values) or observed != len(values):
        raise ValueError("Some published values were not read")
    if not series:
        raise ValueError("No reported values")
    reported = sorted({p for s in series for p, v in s["points"] if v is not None})
    doi = None
    for note in data["extension"].get("annotation", []):
        if note.get("type") == "DISSEMINATION_DOI_XML":
            doi = re.search(r'rdf:about="(https://doi\.org/10\.2908/[A-Z0-9_]+)"', note.get("title", ""))
    dataset = spec["dataset"].lower()
    catalogue = doi.group(1).lower() if doi else "https://ec.europa.eu/eurostat/databrowser/product/page/" + dataset
    unit_names = [UNITS[u] for u in spec["units"]]
    result = {
        "title": spec["title"], "titleEl": spec["titleEl"],
        "datasetId": dataset,
        "sourceUrl": spec["source"], "catalogueUrl": catalogue, "licenceUrl": TERMS,
        "licence": "Eurostat statistical data reuse with source acknowledgement",
        "attribution": f"Source: Eurostat, {dataset}, retrieved {retrieved}. Kleanthis filtered and converted the statistical tables. Eurostat is not responsible for this presentation.",
        "attributionEl": f"Πηγή: Eurostat, {dataset}, ανάκτηση {retrieved}. Ο Κλεάνθης φιλτράρισε και μετέτρεψε τους στατιστικούς πίνακες. Η Eurostat δεν ευθύνεται για αυτή την παρουσίαση.",
        "unit": " / ".join(u[0] for u in unit_names), "unitEl": " / ".join(u[1] for u in unit_names),
        "units": [dict(code=u, name=UNITS[u][0], nameEl=UNITS[u][1]) for u in spec["units"]],
        "frequency": "quarterly",
        "sourceUpdated": updated.isoformat(), "retrievedAt": retrieved,
        "sourceSha256": hashlib.sha256(source).hexdigest(),
        "method": spec["method"], "methodEl": spec["methodEl"],
        "notLive": NOT_LIVE, "notLiveEl": NOT_LIVE_EL,
        "flagDefinitions": labels,
        "coverage": dict(firstPeriod=periods[0], lastIndexedPeriod=periods[-1], lastObservedPeriod=reported[-1],
                         observedValues=observed, indexedPeriods=len(periods), observedPeriods=len(reported),
                         lastObservedByPort=last_by_port, lastTotalByPort=last_total_by_port),
        "periods": periods,
        "ports": [dict(code=p, name=PORTS[p][0], nameEl=PORTS[p][1],
                       **(dict(latitude=POSITIONS[p][0], longitude=POSITIONS[p][1], positionApproximate=True) if freight else {}))
                  for p in spec["ports"]],
        ("cargoGroups" if freight else "vesselTypes"): pairs(kinds, kind_codes),
    }
    if freight:
        result["directions"] = pairs(DIRECTIONS, direction_codes)
        result["positionNote"] = "Approximate position of the port, rounded to two decimals. Added by Kleanthis for the map; not Eurostat data."
        result["positionNoteEl"] = "Θέση του λιμανιού κατά προσέγγιση, στρογγυλεμένη σε δύο δεκαδικά. Την πρόσθεσε ο Κλεάνθης για τον χάρτη· δεν είναι δεδομένα της Eurostat."
    result["series"] = series
    return result


def render(data):
    """One series per line, so a change in one number is a one-line difference."""
    head = {k: v for k, v in data.items() if k != "series"}
    text = json.dumps(head, ensure_ascii=False, indent=2)[:-2] + ',\n  "series": [\n'
    text += ",\n".join("    " + json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in data["series"])
    return text + "\n  ]\n}\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name in EXTRACTS:
        source = (HERE / f"{name}-source.jsonstat").read_bytes()
        result = render(snapshot(name, source))
        output = HERE / f"{name}.json"
        if args.check:
            if result != output.read_text(encoding="utf-8"):
                raise SystemExit(f"{output.name}: stored extract differs from the source")
            continue
        with NamedTemporaryFile("w", dir=HERE, encoding="utf-8", delete=False) as out:
            out.write(result)
        Path(out.name).replace(output)
        output.chmod(0o644)


if __name__ == "__main__":
    main()
