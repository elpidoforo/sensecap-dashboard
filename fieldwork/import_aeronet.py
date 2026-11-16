"""Build the July 2022 Cyprus daily 500 nm optical-depth snapshot from AERONET V3 exports."""
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlencode

HERE = Path(__file__).parent
SITES = {
    "CUT-TEPAK": ("Limassol (CUT-TEPAK)", "Λεμεσός (CUT-TEPAK)"),
    "Nicosia": ("Nicosia", "Λευκωσία"),
}
DOC = "https://aeronet.gsfc.nasa.gov/print_web_data_help_v3.html"
START = dt.date(2022, 7, 1)
END = dt.date(2022, 7, 31)


def source_url(code):
    params = dict(site=code, year=2022, month=7, day=1, year2=2022,
                  month2=7, day2=31, AOD20=1, AVG=20, if_no_html=1)
    return "https://aeronet.gsfc.nasa.gov/cgi-bin/print_web_data_v3?" + urlencode(params)


def parse_station(code, payload):
    lines = payload.decode("utf-8-sig").splitlines()
    if "Version 3: AOD Level 2.0" not in lines:
        raise ValueError("Response lacks AERONET Level 2.0 metadata")
    start = next((i for i, line in enumerate(lines) if line.startswith("AERONET_Site,Date(")), None)
    if start is None:
        raise ValueError("Missing daily export header")

    daily = {}
    coords = None
    for row in csv.DictReader(lines[start:]):
        date = dt.datetime.strptime(row["Date(dd:mm:yyyy)"], "%d:%m:%Y").date()
        if not START <= date <= END:
            continue
        if row["AERONET_Site"] != code or row["Data_Quality_Level"] != "lev20":
            raise ValueError(f"Unexpected site or quality level at {date}")
        location = (float(row["Site_Latitude(Degrees)"]), float(row["Site_Longitude(Degrees)"]))
        if coords and coords != location:
            raise ValueError(f"Station location changed at {date}")
        coords = location
        if date in daily:
            raise ValueError(f"Duplicate daily average at {date}")
        value = float(row["AOD_500nm"])
        count = int(row["N[AOD_500nm]"])
        if value == -999:
            daily[date] = (None, None)
        elif not math.isfinite(value) or count < 1:
            raise ValueError(f"Invalid daily mean or sample count at {date}")
        else:
            daily[date] = (value, count)
    if coords is None or not any(value is not None for value, _ in daily.values()):
        raise ValueError("No measured daily averages in interval")

    points, counts = [], {}
    for i in range((END - START).days + 1):
        date = START + dt.timedelta(days=i)
        value, count = daily.get(date, (None, None))
        points.append([date.isoformat(), value])
        counts[date.isoformat()] = count
    name, name_el = SITES[code]
    return dict(code=code, name=name, nameEl=name_el, latitude=coords[0], longitude=coords[1],
                sourceUrl=source_url(code), sourceSha256=hashlib.sha256(payload).hexdigest(),
                points=points, sampleCounts=counts)


def build():
    series = [parse_station(code, (HERE / f"aeronet-{code.lower()}-source.txt").read_bytes())
              for code in SITES]
    return dict(
        title="Daily aerosol optical depth over Limassol and Nicosia",
        titleEl="Ημερήσιο οπτικό βάθος αερολυμάτων πάνω από τη Λεμεσό και τη Λευκωσία",
        unit="AOD (500 nm)", sourceUrl=DOC, catalogueUrl="https://aeronet.gsfc.nasa.gov/",
        licence="Public domain. AERONET requests site PI consultation and acknowledgement.",
        licenceUrl="https://aeronet.gsfc.nasa.gov/data_usage.html",
        attribution="NASA AERONET V3. We thank Diofantos Hadjimitsis (CUT-TEPAK), Franco Marenco and Philippe Goloub (Nicosia), and their teams for maintaining the stations.",
        attributionEl="NASA AERONET V3. Ευχαριστούμε τον Διόφαντο Χατζημιτσή (CUT-TEPAK), τους Franco Marenco και Philippe Goloub (Λευκωσία) και τις ομάδες τους για τη συντήρηση των σταθμών.",
        qualityLevel="AERONET V3 Level 2.0", retrievedAt="2026-11-16", referenceDate="2022-07-01 / 2022-07-31",
        method="Daily direct-sun means at 500 nm, cloud-screened and quality-assured by AERONET. Optical depth is dimensionless and describes aerosol extinction through the atmospheric column. Surface particulate concentration requires a different measurement. Missing days remain blank.",
        methodEl="Ημερήσιοι μέσοι όροι μετρήσεων άμεσης ηλιακής ακτινοβολίας στα 500 nm, μετά από έλεγχο ποιότητας και αφαίρεση νεφωδών μετρήσεων από το AERONET. Το οπτικό βάθος είναι αδιάστατο και περιγράφει την εξασθένηση του φωτός από τα αερολύματα σε ολόκληρη την ατμοσφαιρική στήλη. Η συγκέντρωση σωματιδίων κοντά στο έδαφος απαιτεί διαφορετική μέτρηση. Οι ημέρες χωρίς δεδομένα εμφανίζονται κενές.",
        series=series,
    )


if __name__ == "__main__":
    output = HERE / "aeronet.json"
    output.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
