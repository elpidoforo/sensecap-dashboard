"""Build the 2022 Cyprus EDO snapshot.

Default: rebuild from drought-source.csv. --check verifies the stored JSON.
For an independent check, download SOURCE and run /usr/bin/python3
fieldwork/import_drought.py --netcdf /path/to/file.nc --check with GDAL installed.
"""
import argparse
import calendar
import csv
import hashlib
import io
import json
import os
from datetime import date, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile

HERE = Path(__file__).resolve().parent
SOURCE = ("https://drought.emergency.copernicus.eu/data/Drought_Observatories_datasets/"
          "EDO_Combined_Drought_Indicator/ver4-1-1/cdinx_m_edo_20220101_20221221_t.nc")
DIGEST = "360045ad2b23e847f46fd0e62d6dcb8cff38e81f5d2adce9f60ac0f384b41ae7"
CATALOGUE = "https://data.jrc.ec.europa.eu/dataset/afa8a5ee-5473-439a-b062-ffdaedc38b2d"
SITES = {
    "Xylophagou": ("Ξυλοφάγου", 33.848, 34.977),
    "Athienou": ("Αθηένου", 33.542, 35.061),
    "Akaki": ("Ακάκι", 33.129, 35.132),
    "Polis": ("Πόλη Χρυσοχούς", 32.425, 35.032),
}
CLASSES = [
    ["No drought", "Χωρίς ξηρασία"], ["Watch", "Επιτήρηση"],
    ["Warning", "Προειδοποίηση"], ["Alert", "Συναγερμός"],
    ["Full recovery", "Πλήρης ανάκαμψη"], ["Temporary soil moisture recovery", "Προσωρινή ανάκαμψη εδαφικής υγρασίας"],
    ["Temporary vegetation recovery", "Προσωρινή ανάκαμψη βλάστησης"],
]
PERIODS = [date(2022, month, day) for month in range(1, 13) for day in (1, 11, 21)]
FIELDS = ["site", "lon", "lat", "cell_lon", "cell_lat", "start", "class"]


def raster_sample(path):
    from osgeo import gdal
    if hashlib.sha256(path.read_bytes()).hexdigest() != DIGEST:
        raise ValueError("Input differs from the verified 2022 archive")
    dataset = gdal.Open(str(path))
    x0, dx, _, y0, _, dy = dataset.GetGeoTransform()
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(FIELDS)
    for name, (_, lon, lat) in SITES.items():
        col, row = int((lon - x0) / dx), int((lat - y0) / dy)
        for n in range(1, dataset.RasterCount + 1):
            band = dataset.GetRasterBand(n)
            offset = int(band.GetMetadataItem("NETCDF_DIM_time"))
            start = date(2022, 1, 1) + timedelta(days=offset)
            code = int(band.ReadAsArray(col, row, 1, 1)[0, 0])
            writer.writerow([name, lon, lat, round(x0+(col+0.5)*dx, 8),
                             round(y0+(row+0.5)*dy, 8), start.isoformat(), code])
    return output.getvalue()


def snapshot(csv_text):
    observations = {name: {} for name in SITES}
    positions = {}
    for row in csv.DictReader(io.StringIO(csv_text)):
        name, start = row["site"], date.fromisoformat(row["start"])
        code = int(row["class"])
        if name not in SITES or start not in PERIODS or code not in range(9):
            raise ValueError("Unexpected site, period or drought class")
        if start in observations[name]:
            raise ValueError("Duplicate cell-period")
        lon, lat = float(row["lon"]), float(row["lat"])
        center = (float(row["cell_lon"]), float(row["cell_lat"]))
        if ((lon, lat) != SITES[name][1:] or abs(center[0]-lon) > 1/48
                or abs(center[1]-lat) > 1/48 or positions.setdefault(name, center) != center):
            raise ValueError("Inconsistent cell coordinates")
        observations[name][start] = code
    series = []
    for name, values in observations.items():
        if set(values) != set(PERIODS):
            raise ValueError(f"Missing period for {name}")
        greek, lon, lat = SITES[name]
        series.append(dict(name=name, nameEl=greek, longitude=lon, latitude=lat,
                           cellLongitude=positions[name][0], cellLatitude=positions[name][1],
                           points=[[s.isoformat(), values[s] if values[s] < 7 else None] for s in PERIODS],
                           sourceMaskCodes={s.isoformat(): v for s, v in values.items() if v >= 7}))
    ends = {s.isoformat(): s.replace(day=(s.day+9 if s.day < 21 else
            calendar.monthrange(s.year, s.month)[1])).isoformat() for s in PERIODS}
    return dict(title="Agricultural drought classes in four Cyprus grid cells", unit="CDI class",
                sourceUrl=SOURCE, catalogueUrl=CATALOGUE, licence="CC BY 4.0",
                licenceUrl="https://creativecommons.org/licenses/by/4.0/",
                attribution="European Drought Observatory (https://drought.emergency.copernicus.eu), © European Commission JRC, 2012–2026. Contains modified Copernicus Emergency Management Service information (2022), DOI 10.2905/JRC.9QA0Z6R. Athena selected four grid cells and translated labels.",
                attributionEl="Ευρωπαϊκό Παρατηρητήριο Ξηρασίας (https://drought.emergency.copernicus.eu), © Ευρωπαϊκή Επιτροπή JRC, 2012–2026. Περιέχει τροποποιημένες πληροφορίες της υπηρεσίας διαχείρισης εκτάκτων αναγκών Copernicus (2022), DOI 10.2905/JRC.9QA0Z6R. Η Αθηνά επέλεξε τέσσερα κελιά και μετέφρασε τις ετικέτες.",
                datasetDoi="10.2905/JRC.9QA0Z6R",
                sourceReferences=["Cammalleri, C., Barbosa, P., and Vogt, J. V. (2020). Evaluating simulated daily discharge for operational hydrological drought monitoring in the Global Drought Observatory (GDO). Hydrological Sciences Journal 65(8), 1316–1325.", "CDI method: Cammalleri et al. (2021). https://doi.org/10.5194/nhess-21-481-2021"],
                sourceSha256=DIGEST, retrievedAt="2026-11-16T13:06:37Z", catalogueVersion="4.1.1", sourceVersion="4.1.0",
                referenceDate="2022-01-01 / 2022-12-31",
                method="Sample the source cell containing each reference coordinate at 1/24 degree resolution. Periods start on days 1, 11 and 21 and end before the next period. Codes 0 to 6 identify agricultural drought or recovery classes. Codes 7 and 8 indicate missing or outside-domain data. Each value describes one grid cell.",
                methodEl="Δειγματοληψία στο κελί που περιέχει κάθε σημείο αναφοράς, σε πλέγμα 1/24 της μοίρας. Οι περίοδοι αρχίζουν την 1η, 11η και 21η ημέρα και λήγουν πριν από την επόμενη περίοδο. Οι κωδικοί 0 έως 6 δηλώνουν κατηγορίες γεωργικής ξηρασίας ή ανάκαμψης. Οι κωδικοί 7 και 8 δηλώνουν έλλειψη δεδομένων ή θέση εκτός κάλυψης. Κάθε τιμή αφορά ένα κελί.",
                classLabels={str(i): label for i, label in enumerate(CLASSES)}, periodEnds=ends, series=series)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--netcdf", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    source = (HERE / "drought-source.csv").read_text()
    if args.netcdf and raster_sample(args.netcdf).splitlines() != source.splitlines():
        raise ValueError("Archived cell values differ from the NetCDF raster")
    result = json.dumps(snapshot(source), ensure_ascii=False, indent=2) + "\n"
    output = HERE / "drought.json"
    if args.check:
        if output.read_text() != result:
            raise ValueError("Cached explorer data differs from source")
    else:
        with NamedTemporaryFile("w", dir=HERE, encoding="utf-8", delete=False) as temporary:
            temporary.write(result)
        os.replace(temporary.name, output)


if __name__ == "__main__":
    main()
