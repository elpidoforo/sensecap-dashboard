"""Build the verified 15 May 2024 EEA E1a extract from the frozen source CSV."""
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOUR = dt.timedelta(hours=1)
START = dt.datetime(2024, 5, 15, tzinfo=dt.timezone(HOUR))
STATIONS = {
    "CY0002R": ("Ayia Marina Xyliatou, background", "Αγία Μαρίνα Ξυλιάτου, σταθμός υποβάθρου", "station_10"),
    "CY0004A": ("Nicosia, traffic", "Λευκωσία, κυκλοφοριακός σταθμός", "station_1"),
    "CY0006A": ("Nicosia, residential", "Λευκωσία, οικιστικός σταθμός", "station_2"),
}
ARCHIVE = "https://eeadmz1batchservice02.blob.core.windows.net/airquality-p-e1a/CY/"
CATALOGUE = "https://sdi.eea.europa.eu/catalogue/datahub/api/records/fe809728-9cec-41c0-a9be-3a8f04600974/formatters/xsl-view?approved=true&language=eng&output=pdf"


def build(payload):
    hours = [(START + HOUR * i).isoformat(timespec="seconds") for i in range(24)]
    readings = {station: {} for station in STATIONS}
    for row in csv.DictReader(io.StringIO(payload.decode())):
        station = row["station_code"]
        if station not in readings or row["sampling_point"] != f"CY/SPO-{station}_00008_100":
            raise ValueError("Unexpected sampling point")
        if (row["validity"], row["verification"], row["unit"]) != ("1", "1", "ug.m-3"):
            raise ValueError("Unexpected flags or unit")
        start = row["interval_start"]
        if start not in hours or start in readings[station]:
            raise ValueError("Duplicate or unexpected interval")
        if row["interval_end"] != (dt.datetime.fromisoformat(start) + HOUR).isoformat():
            raise ValueError("Unexpected interval end")
        value = float(row["no2"])
        if not math.isfinite(value):
            raise ValueError("Non-finite concentration")
        readings[station][start] = value
    series = []
    for station, (name, greek, dli) in STATIONS.items():
        if len(readings[station]) != 24:
            raise ValueError(f"Incomplete verified day for {station}")
        stem = f"SPO-{station}_00008_100"
        series.append(dict(
            code=station, stationCode=station, dliStationCode=dli, pollutant="NO2",
            name=name, nameEl=greek, samplingPoint="CY/" + stem, validity=1, verification=1,
            sourceUrl=ARCHIVE + stem + ".parquet",
            points=[[dt.datetime.fromisoformat(t).isoformat(timespec="minutes"), readings[station][t]] for t in hours],
        ))
    return dict(
        title="Verified hourly nitrogen dioxide at three Cyprus stations",
        titleEl="Επικυρωμένες ωριαίες συγκεντρώσεις διοξειδίου του αζώτου σε τρεις σταθμούς της Κύπρου",
        referenceDate="2024-05-15", retrievedAt="2026-11-16", unit="µg/m³",
        sourceUrl="https://eeadmz1-downloads-webapp.azurewebsites.net/", catalogueUrl=CATALOGUE,
        licence="Creative Commons Attribution 4.0 International (CC BY 4.0)",
        licenceUrl="https://creativecommons.org/licenses/by/4.0/",
        attribution="© European Environment Agency, data reported by the Cyprus Department of Labour Inspection. CC BY 4.0. Athena selected one day and three stations and added the source time offset.",
        attributionEl="© Ευρωπαϊκός Οργανισμός Περιβάλλοντος. Στοιχεία από το Τμήμα Επιθεώρησης Εργασίας Κύπρου, CC BY 4.0. Η Αθηνά επέλεξε μία ημέρα και τρεις σταθμούς και πρόσθεσε τη διαφορά ώρας της πηγής από την UTC.",
        method="Each value represents the hour beginning at the displayed time, in fixed UTC+1. On 15 May 2024, 12:00 in this archive was 14:00 in Cyprus. The EEA E1a archive marks all 72 values valid and verified. The separate national archive does not specify a UTC offset.",
        methodEl="Κάθε τιμή αφορά την ώρα που ξεκινά τη στιγμή που αναγράφεται, σε σταθερή ζώνη UTC+1. Στις 15 Μαΐου 2024, οι 12:00 του αρχείου αντιστοιχούσαν στις 14:00 στην Κύπρο. Το αρχείο E1a χαρακτηρίζει και τις 72 τιμές έγκυρες και επαληθευμένες. Το χωριστό εθνικό αρχείο δεν ορίζει διαφορά ώρας από την UTC.",
        sourceSha256=hashlib.sha256(payload).hexdigest(), series=series,
    )


if __name__ == "__main__":
    data = build((HERE / "verifiedno2-source.csv").read_bytes())
    (HERE / "verifiedno2.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
