"""Build the fixed 15 May 2024 DLI hourly station comparison from its archived response."""

import datetime as dt
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
DAY = dt.date(2024, 5, 15)
SOURCE = "https://airquality.gov.cy/all_stations_data_range/2024-05-15%2000:00/2024-05-15%2023:00"
CATALOGUE = "https://www.data.gov.cy/index.php/el/dataset/1063"
GASES = {"NO2": ("8", "NO₂"), "O3": ("7", "O₃")}
HOURS = [dt.datetime.combine(DAY, dt.time(hour)) for hour in range(24)]


def build(payload):
    response = json.loads(payload)
    if response.get("status") != 1 or not response.get("data"):
        raise ValueError("Unsuccessful station archive response")
    series = []
    for station_code, station in response["data"].items():
        values = station.get("values", {})
        expected = {hour.strftime("%Y%m%d%H") for hour in HOURS}
        if set(values) - expected:
            raise ValueError("Unexpected hour outside archive period")
        for gas, (code, notation) in GASES.items():
            points = []
            for hour in HOURS:
                measurement = values.get(hour.strftime("%Y%m%d%H"))
                value = None
                if measurement is not None:
                    pollutants = measurement["pollutants"]
                    if pollutants["date_time"] != hour.isoformat(sep=" "):
                        raise ValueError("Hour and publisher timestamp disagree")
                    row = pollutants.get(f"pollutant_{code}")
                    if row is not None:
                        if row["code"] != code or row["notation"] != notation:
                            raise ValueError("Pollutant code or notation mismatch")
                        if row["value"] is not None:
                            value = float(row["value"])
                            if not math.isfinite(value):
                                raise ValueError("Non-finite measurement")
                points.append([hour.isoformat(timespec="minutes"), value])
            series.append(dict(
                code=f"{station_code}_{gas}", stationCode=station_code, pollutant=gas,
                name=station["name_en"].strip(), nameEl=station["name_el"].strip(),
                stationType=station["type_en"].strip(), stationTypeEl=station["type_el"].strip(),
                latitude=float(station["latitude"]), longitude=float(station["longitude"]),
                points=points,
            ))
    return dict(
        title="Hourly nitrogen dioxide and ozone at Cyprus monitoring stations",
        titleEl="Ωριαίες συγκεντρώσεις διοξειδίου του αζώτου και όζοντος στους σταθμούς της Κύπρου",
        sourceUrl=SOURCE, catalogueUrl=CATALOGUE, licenceUrl="https://creativecommons.org/licenses/by/4.0/",
        licence="Creative Commons Attribution 4.0 International (CC BY 4.0)",
        attribution="Cyprus Department of Labour Inspection, Air Quality Monitoring Network, CC BY 4.0. Athena selected two pollutants and aligned the published measurements by station and hour.",
        attributionEl="Τμήμα Επιθεώρησης Εργασίας Κύπρου, Δίκτυο Παρακολούθησης Ποιότητας Αέρα, CC BY 4.0. Η Αθηνά επέλεξε δύο ρύπους και οργάνωσε τις δημοσιευμένες μετρήσεις ανά σταθμό και ώρα.",
        referenceDate=DAY.isoformat(), retrievedAt="2026-11-16", unit="µg/m³",
        sourceSha256=hashlib.sha256(payload).hexdigest(),
        method="Hourly station concentrations on 15 May 2024, using the publisher’s clock. The archive gives no UTC offset or verification flag per observation. Blank hours lack a reported measurement.",
        methodEl="Ωριαίες συγκεντρώσεις ανά σταθμό στις 15 Μαΐου 2024, με την ώρα που αναγράφει η πηγή. Το αρχείο δεν αναφέρει διαφορά από την ώρα UTC ή ένδειξη επικύρωσης ανά μέτρηση. Τα κενά δηλώνουν ώρες χωρίς δημοσιευμένη μέτρηση.",
        series=series,
    )


if __name__ == "__main__":
    result = build((HERE / "gases-source.txt").read_bytes())
    (HERE / "gases.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
