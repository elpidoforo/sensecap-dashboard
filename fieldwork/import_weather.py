"""Build the classroom weather snapshot from the Cyprus DoM daily CSV (Python 3)."""
import argparse
import calendar
import csv
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import io
from itertools import combinations
import json
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = "https://www.data.gov.cy/en/dataset/412"
DOWNLOAD = "https://www.data.gov.cy/sites/default/files/Min%20Max%20and%20Rain_all%20%282025%29.csv"
OUTPUT = Path(__file__).with_name("weather.json")
STATIONS = {
    "Λάρνακα Αεροδρόμιο": ("Larnaka Airport", "Αεροδρόμιο Λάρνακας"),
    "Πάφος Αεροδρόμιο": ("Pafos Airport", "Αεροδρόμιο Πάφου"),
    "Αθαλάσσα": ("Athalassa", "Αθαλάσσα"),
    "Λεμεσός (Δημ. Κήπος)": ("Limassol Municipal Garden", "Δημοτικός Κήπος Λεμεσού"),
    "Λεμεσός Νέο Λιμάνι": ("Limassol New Port", "Νέο Λιμάνι Λεμεσού"),
    "Πρόδρομος Δασ. Κολ.": ("Prodromos Forestry College", "Δασικό Κολέγιο Προδρόμου"),
    "Παραλίμνι (Νοσοκ)": ("Paralimni Hospital", "Νοσοκομείο Παραλιμνίου"),
    "Παραλίμνι (Στ. Φρενάρου)": ("Paralimni, Frenaros station", "Παραλίμνι, σταθμός Φρενάρου"),
}
MAX_FIELD = "MAX TEMP (Celcius)"
MIN_FIELD = "MIN TEMP (Celcius)"
MIN_COVERAGE = 90


def valid_temperature(raw):
    try:
        value = Decimal(raw.strip())
        if value.is_finite() and -40 <= value <= 60:
            return value
    except (InvalidOperation, AttributeError):
        pass
    return None


def month_keys(start, end):
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        yield year, month
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1


def matching_station_months(signatures):
    """Flag two stations when the same three measurements repeat across a whole month."""
    flags = defaultdict(dict)
    for (year, month), by_station in signatures.items():
        days_in_month = calendar.monthrange(year, month)[1]
        for left, right in combinations(by_station, 2):
            a, b = by_station[left], by_station[right]
            common = a.keys() & b.keys()
            if len(common) * 100 < MIN_COVERAGE * days_in_month:
                continue
            if all(len(a[d]) == 1 and a[d] == b[d] for d in common):
                stamp = date(year, month, 1).isoformat()
                flags[left].setdefault(stamp, []).append(STATIONS[right][0])
                flags[right].setdefault(stamp, []).append(STATIONS[left][0])
    return flags


def build(raw):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8").lstrip("\ufeff")))
    if not {"DATE", "LOCATION", MAX_FIELD, MIN_FIELD, "Rain (mm)"}.issubset(reader.fieldnames or ()):
        raise ValueError("The daily temperature CSV header has changed.")
    # Keep an empty set for a reported date that has no usable maximum.
    stations = defaultdict(dict)
    signatures = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    quality = Counter()
    for row in reader:
        quality["sourceRows"] += 1
        location = row["LOCATION"].strip()
        if location not in STATIONS:
            raise ValueError("Unmapped source station: " + location)
        try:
            day = datetime.strptime(row["DATE"].strip(), "%d/%m/%Y").date()
        except ValueError:
            quality["invalidDateRows"] += 1
            continue
        dates = stations[location]
        if day in dates:
            quality["duplicateDateRows"] += 1
        values = dates.setdefault(day, set())
        maximum = valid_temperature(row[MAX_FIELD])
        minimum = valid_temperature(row[MIN_FIELD])
        if maximum is None or (minimum is not None and maximum < minimum):
            quality["unusableTmaxRows"] += 1
            continue
        values.add(maximum)
        try:
            rain = Decimal(row["Rain (mm)"].strip())
        except InvalidOperation:
            continue
        if minimum is not None and rain.is_finite() and rain >= 0:
            signatures[(day.year, day.month)][location][day.day].add((maximum, minimum, rain))

    flags = matching_station_months(signatures)

    series = []
    for location, (name, name_el) in STATIONS.items():
        if location not in stations:
            continue
        dates = stations[location]
        first, last = min(dates), max(dates)
        monthly = defaultdict(list)
        for day, values in dates.items():
            if len(values) == 1:
                monthly[(day.year, day.month)].append(next(iter(values)))
                quality["usableStationDays"] += 1
            elif len(values) > 1:
                quality["conflictingStationDays"] += 1

        points, coverage = [], {}
        for year, month in month_keys(first, last):
            stamp = date(year, month, 1).isoformat()
            expected = calendar.monthrange(year, month)[1]
            values = monthly[(year, month)]
            coverage[stamp] = [len(values), expected]
            if len(values) * 100 >= expected * MIN_COVERAGE and stamp not in flags[location]:
                mean = sum(values) / len(values)
                points.append([stamp, float(mean.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))])
        series.append({"name": name, "nameEl": name_el, "sourceName": location,
                       "firstReportedDate": first.isoformat(), "lastReportedDate": last.isoformat(),
                       "points": points, "coverage": coverage, "matchingStationMonths": flags[location]})

    if not series:
        raise ValueError("The source contained no valid station dates.")
    return {
        "title": "How hot was a typical day each month?",
        "titleEl": "Πόσο ζεστή ήταν μια τυπική μέρα κάθε μήνα;",
        "metric": "Monthly mean of daily maximum air temperature",
        "metricEl": "Μηνιαίος μέσος όρος της μέγιστης ημερήσιας θερμοκρασίας αέρα",
        "sourceUrl": SOURCE, "downloadUrl": DOWNLOAD,
        "attribution": "Republic of Cyprus, Department of Meteorology. Monthly means calculated by Athena.",
        "attributionEl": "Κυπριακή Δημοκρατία, Τμήμα Μετεωρολογίας. Υπολογισμός μηνιαίων μέσων όρων από την Athena.",
        "licence": "CC BY 4.0", "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "unit": "°C", "frequency": "monthly", "minimumCoveragePercent": MIN_COVERAGE,
        "method": "Each point is the mean of daily maximum temperatures at one station for a calendar month. A point needs valid readings on at least 90% of calendar days. The date marks the first day of that month.",
        "methodEl": "Κάθε σημείο είναι ο μέσος όρος των ημερήσιων μέγιστων θερμοκρασιών ενός σταθμού για έναν ημερολογιακό μήνα. Απαιτούνται έγκυρες μετρήσεις για τουλάχιστον το 90% των ημερών. Η ημερομηνία δηλώνει την πρώτη ημέρα του μήνα.",
        "coverageDescription": "For each month, [days with a valid maximum, calendar days]. A missing point means insufficient coverage or a flagged cross-station match.",
        "qualityRule": "Invalid dates, malformed or nonfinite maxima, maxima outside −40 to 60 °C and maxima below a plausible minimum are excluded. Repeated identical station-day values count once. Conflicting valid maxima for the same station-day are excluded. Station locations are kept separate.",
        "matchingStationRule": "Both station-months are withheld when all shared numeric daily maxima, minima and rainfall values match at two separately named stations across at least 90% of calendar days. matchingStationMonths identifies the other station; the source does not identify which record is correct.",
        "matchingStationRuleEl": "Ο μήνας εξαιρείται για τους δύο σταθμούς όταν οι μέγιστες, οι ελάχιστες και η βροχόπτωση ταυτίζονται για όλες τις κοινές ημέρες με πλήρεις αριθμητικές τιμές, καλύπτοντας τουλάχιστον το 90% του μήνα.",
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "quality": {key: quality[key] for key in ("sourceRows", "invalidDateRows", "duplicateDateRows",
                     "unusableTmaxRows", "conflictingStationDays", "usableStationDays")},
        "series": series,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, help="Read a downloaded copy instead of fetching the official file.")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.csv:
        raw = args.csv.read_bytes()
    else:
        request = Request(DOWNLOAD, headers={"User-Agent": "Athena classroom weather importer"})
        with urlopen(request, timeout=45) as response:
            raw = response.read()
    result = build(raw)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
