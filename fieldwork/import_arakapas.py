"""Build the Arakapas mapped-area comparison from reviewed observedEventA features.

Re-extract features from the research package's DEL/GRA-observedEventA.zip
or original vector archives with GDAL: python import_arakapas.py --vectors DIR
Run without arguments to reproduce the published JSON using only Python.
"""
import argparse
import csv
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import zipfile

HERE = Path(__file__).resolve().parent
SOURCE = "https://mapping.emergency.copernicus.eu/activations/EMSR515/"
BASE = "https://cems-mapping-website.s3.eu-west-1.amazonaws.com/static/activations/EMSR515/"
EDITIONS = {
    "DEL": dict(acquisitionTime="2021-07-04T08:08:00Z", deliveryTime="2021-07-04T20:39:31",
                satellite="SPOT6", count=10, hectares="3143.4", mapVersion=1, archive="RTP01",
                fullHash="2d6cbbd36d3fff1c64855d169006e13671ee5537d02519aa38cfc4e6e684a11e",
                subsetHash="3d5c71bb4d9e39f19f949a5fa62e036a794ab8a36c1580dd63b68341b57e23e8"),
    "GRA": dict(acquisitionTime="2021-07-05T08:00:00Z", deliveryTime="2021-07-06T13:23:35",
                satellite="SPOT7", count=7, hectares="3956.1", mapVersion=2, archive="VECTORS",
                fullHash="76ff127f827cb2bdc216339ad44dab6328f3250b1371a24f8f42058749c37be3",
                subsetHash="4499df723639b0f856d1b0e06700ccaed4dbbf62bf33b7d5a9217fc7495bb901"),
}


def vector_name(kind):
    return f"EMSR515_AOI01_{kind}_PRODUCT_r1_{EDITIONS[kind]['archive']}_v1_vector.zip"


def extract(folder):
    from osgeo import ogr
    ogr.UseExceptions()
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["product", "feature_id", "classification", "area_ha"])
    for kind, edition in EDITIONS.items():
        path = folder / vector_name(kind)
        digest = edition["fullHash"]
        if not path.exists():
            path = folder / f"{kind}-observedEventA.zip"
            digest = edition["subsetHash"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Unexpected archive checksum for {path.name}")
        with zipfile.ZipFile(path) as archive:
            layer_name, = [n for n in archive.namelist() if "observedEventA" in n and n.endswith(".shp")]
        dataset = ogr.Open(f"/vsizip/{path.resolve()}/{layer_name}")
        layer = dataset.GetLayer()
        if layer.GetSpatialRef().GetAuthorityCode(None) != "4326":
            raise ValueError("Unexpected source CRS")
        for feature in layer:
            geometry = feature.GetGeometryRef()
            if geometry is None or geometry.IsEmpty() or geometry.GetGeometryName() not in ("POLYGON", "MULTIPOLYGON"):
                raise ValueError("Expected a mapped polygon")
            writer.writerow([kind, feature.GetFID(), feature.GetField("notation"), feature.GetField("area")])
    return out.getvalue().encode()


def build(payload):
    features = {kind: {} for kind in EDITIONS}
    for row in csv.DictReader(io.StringIO(payload.decode())):
        kind, uid = row["product"], row["feature_id"]
        area = Decimal(row["area_ha"])
        if row["classification"] != "Burnt area" or not area.is_finite() or area <= 0:
            raise ValueError("Invalid feature classification or area")
        if kind not in features or uid in features[kind]:
            raise ValueError("Unknown edition or repeated feature")
        features[kind][uid] = area
    observations, points = {}, []
    for kind, edition in EDITIONS.items():
        areas = features[kind].values()
        published = sum(areas, Decimal(0)).quantize(Decimal(".1"))
        if len(areas) != edition["count"] or published != Decimal(edition["hectares"]):
            raise ValueError("Feature count or burnt area differs from the reviewed product")
        date = edition["acquisitionTime"][:10]
        name = f"EMSR515_AOI01_{kind}_PRODUCT_r1_RTP01_v{edition['mapVersion']}.pdf"
        points.append([date, float(published)])
        observations[date] = dict(
            product=kind, acquisitionTime=edition["acquisitionTime"], deliveryDate=edition["deliveryTime"][:10],
            deliveryTime=edition["deliveryTime"], satellite=edition["satellite"], polygonCount=len(areas),
            mapUrl=BASE + name, vectorUrl=BASE + vector_name(kind), vectorSha256=edition["fullHash"],
        )
    return dict(
        title="Arakapas fire: mapped burnt area", titleEl="Πυρκαγιά στον Αρακαπά: χαρτογραφημένη καμένη έκταση",
        unit="ha", referenceDate="2021-07-04 / 2021-07-05", retrievedAt="2026-11-16",
        sourceUrl=SOURCE, catalogueUrl=SOURCE, licenceUrl="https://mapping.emergency.copernicus.eu/terms-and-conditions/",
        licence="Copernicus EMS On-Demand Mapping terms. Credit the source when redistributing or adapting the data.",
        attribution="Copernicus Emergency Management Service (© 2021 European Union), [EMSR515] Melini (AOI01): Delineation Map and Grading Map. Athena extracted burnt-area attributes.",
        attributionEl="Copernicus Emergency Management Service (© 2021 European Union), [EMSR515] Melini (AOI01): Delineation Map and Grading Map. Η Αθηνά εξήγαγε τα στοιχεία καμένης έκτασης.",
        method="Each observation sums the burnt-area polygons in one cumulative mapping product, rounded to 0.1 hectare. Each date is the acquisition date of the latest post-event image used in that product. Both editions cover the same fire and overlap. Subtract their areas to compare estimates. Polygon counts describe mapped patches.",
        methodEl="Κάθε παρατήρηση αθροίζει τις εκτάσεις των πολυγώνων καμένης γης σε μία σωρευτική έκδοση του χάρτη, με στρογγυλοποίηση στο 0,1 εκτάριο. Κάθε ημερομηνία δηλώνει πότε λήφθηκε η πιο πρόσφατη μετασυμβαντική εικόνα που χρησιμοποιήθηκε στην έκδοση. Οι δύο εκδόσεις καλύπτουν την ίδια πυρκαγιά και επικαλύπτονται. Αφαιρέστε τις εκτάσεις για να συγκρίνετε τις εκτιμήσεις. Το πλήθος πολυγώνων περιγράφει τα χαρτογραφημένα τμήματα.",
        sourceSha256=hashlib.sha256(payload).hexdigest(),
        series=[dict(code="burnt-area", name="Mapped burnt area", nameEl="Χαρτογραφημένη καμένη έκταση", points=points, observations=observations)],
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vectors", type=Path)
    folder = parser.parse_args().vectors
    source = HERE / "arakapas-source.csv"
    payload = extract(folder) if folder is not None else source.read_bytes()
    result = build(payload)
    if folder is not None:
        source.write_bytes(payload)
    (HERE / "arakapas.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
