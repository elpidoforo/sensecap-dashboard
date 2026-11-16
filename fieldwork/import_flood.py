"""Build WDD flood scenario counts. --check replays the archived spatial join offline.

To recalculate the joins from published geometries, run with --refresh under
Python with GDAL/OGR and GEOS support. All feature data are public.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "flood-join.geoindex"
OUTPUT = HERE / "flood.json"
BASE = "https://services5.arcgis.com/ak5RtNUi11wYxDRA/arcgis/rest/services/"
REACH = BASE + "Areas_of_Potentially_Significant_Flood_Risk/FeatureServer/0"
PLAINS = BASE + "floods_plains/FeatureServer"
ITEM = "https://www.arcgis.com/home/item.html?id="
REACH_TERMS = ITEM + "c5a5660406134ff58116a5a7bbbcdef7"
PLAINS_TERMS = ITEM + "f07a7233b7644b2a96ca8db2ab5128c5"
SCENARIOS = [
    ("q20", 2, "20-year flood", "Πλημμύρα 20ετίας"),
    ("q100", 3, "100-year flood", "Πλημμύρα 100ετίας"),
    ("q500", 4, "500-year flood", "Πλημμύρα 500ετίας"),
    ("climate2080", 5, "20-year flood in 2080 climate and land use", "Πλημμύρα 20ετίας με κλίμα και χρήσεις γης του 2080"),
]


def request(url):
    with urlopen(url, timeout=100) as response:
        raw = response.read()
    data = json.loads(raw)
    if "error" in data:
        raise ValueError(f"ArcGIS error from {url}: {data['error']}")
    return raw, data


def load_layer(url):
    from osgeo import ogr
    _, meta = request(url + "?f=json")
    _, inventory = request(url + "/query?where=1%3D1&returnIdsOnly=true&f=json")
    query = url + "/query?where=1%3D1&outFields=*&outSR=32636&returnGeometry=true&f=geojson"
    raw, data = request(query)
    key = inventory["objectIdFieldName"]
    if data["crs"]["properties"]["name"] != "EPSG:32636":
        raise ValueError("Unexpected geometry CRS")
    rows = data["features"]
    ids = [f["properties"][key] for f in rows]
    if not ids or len(ids) != len(set(ids)) or set(ids) != set(inventory["objectIds"]):
        raise ValueError("Incomplete or duplicate feature IDs")
    shapes, repaired = [], 0
    allowed = {"LineString", "MultiLineString"} if url == REACH else {"Polygon", "MultiPolygon"}
    for feature in rows:
        if feature["geometry"]["type"] not in allowed:
            raise ValueError("Unexpected geometry type")
        geom = ogr.CreateGeometryFromJson(json.dumps(feature["geometry"]))
        if not geom.IsValid():
            geom = geom.MakeValid()
            repaired += 1
        if not geom or geom.IsEmpty() or not geom.IsValid():
            raise ValueError("Unusable geometry")
        shapes.append((feature["properties"], geom))
    edited = datetime.fromtimestamp(meta["editingInfo"]["dataLastEditDate"] / 1000, timezone.utc)
    return shapes, dict(dataLastEdited=edited.isoformat(), geometrySha256=sha256(raw).hexdigest(),
                        repairedGeometries=repaired, featureCount=len(rows), queryUrl=query)


def map_lines(shape, transform):
    display = shape.SimplifyPreserveTopology(75)
    if display.Transform(transform) != 0:
        raise ValueError("Failed to project reach for display")
    geo = json.loads(display.ExportToJson())
    segments = geo["coordinates"] if geo["type"] == "MultiLineString" else [geo["coordinates"]]
    return [[[round(x, 5), round(y, 5)] for x, y, *_ in segment] for segment in segments]


def fetch_evidence():
    from osgeo import gdal, ogr, osr
    ogr.UseExceptions()
    urls = [REACH] + [f"{PLAINS}/{i}" for _, i, _, _ in SCENARIOS]
    with ThreadPoolExecutor(max_workers=len(urls)) as pool:
        reach_layer, *polygon_layers = pool.map(load_layer, urls)
    features, metadata = reach_layer
    projected = osr.SpatialReference()
    projected.ImportFromEPSG(32636)
    geographic = osr.SpatialReference()
    geographic.ImportFromEPSG(4326)
    geographic.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(projected, geographic)
    reaches = [dict(code=p["EU_ID"], name=p["Area_name"], district=p["District"],
                    identifiedYear=int(p["Year_of_id"]), mapLines=map_lines(line, transform)) for p, line in features]
    scenarios = {}
    for (code, _, _, _), (polygons, info) in zip(SCENARIOS, polygon_layers):
        matches = {}
        for row, geometry in polygons:
            matches[str(row["OBJECTID"])] = sorted(p["EU_ID"] for p, line in features if geometry.Intersects(line))
        scenarios[code] = dict(**info, matches=matches)
    return dict(retrievedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), crs="EPSG:32636",
                gdalVersion=gdal.VersionInfo("RELEASE_NAME"), reachLayer=metadata,
                reaches=sorted(reaches, key=lambda r: r["code"]), scenarios=scenarios)


def snapshot(evidence):
    reaches = evidence["reaches"]
    codes = [r["code"] for r in reaches]
    if not codes or len(set(codes)) != len(codes) or len(codes) != evidence["reachLayer"]["featureCount"]:
        raise ValueError("Invalid reach inventory")
    scenarios, series = [], []
    for code, layer, name, name_el in SCENARIOS:
        record = evidence["scenarios"][code]
        matches = record["matches"]
        if not matches or len(matches) != record["featureCount"]:
            raise ValueError("Incomplete polygon inventory")
        counts = Counter()
        for linked in matches.values():
            if len(set(linked)) != len(linked) or set(linked).difference(codes):
                raise ValueError("Invalid reach identifiers in polygon join")
            counts.update(linked)
        scenarios.append(dict(id=code, name=name, nameEl=name_el, layerId=layer,
                              polygonCount=len(matches), matchedReaches=len(counts),
                              sharedPolygons=sum(len(v) > 1 for v in matches.values()),
                              unmatchedPolygons=sum(not v for v in matches.values()),
                              dataLastEdited=record["dataLastEdited"],
                              repairedGeometries=record["repairedGeometries"]))
        series.append(dict(code=code, name=name, nameEl=name_el, points=[[c, counts[c]] for c in codes]))
    return dict(
        title="Flood scenario polygons intersecting designated Cyprus river reaches",
        sourceUrl=REACH, scenarioUrl=PLAINS, licenceUrl=REACH_TERMS, scenarioLicenceUrl=PLAINS_TERMS,
        licence="Designated reaches: CC BY 4.0. Floodplain polygons: CC BY (version unspecified).",
        attribution="Water Development Department, Republic of Cyprus. Athena intersected the published river reaches and modelled floodplain geometries.",
        attributionEl="Τμήμα Αναπτύξεως Υδάτων, Κυπριακή Δημοκρατία. Η Αθηνά υπολόγισε τις τομές των δημοσιευμένων τμημάτων ποταμών με τα πολύγωνα πλημμύρας.",
        method="Counts distinct polygon features touching or crossing each designated river reach in EPSG:32636. Invalid geometries were repaired with OGR MakeValid before intersection. A polygon may intersect several reaches. Counts depend on how the publisher divides the geometry. They measure neither flooded area nor damage. The 2080 scenario models a 20-year flood (5% annual exceedance probability) under projected climate and land use. The map simplifies reach lines at 75 metres for display only.",
        methodEl="Για κάθε τμήμα ποταμού μετράμε τα διαφορετικά πολύγωνα που το αγγίζουν ή το διασχίζουν στο EPSG:32636. Η OGR MakeValid διόρθωσε τις μη έγκυρες γεωμετρίες πριν από τον υπολογισμό. Το ίδιο πολύγωνο μπορεί να τέμνει πολλά τμήματα. Το πλήθος εξαρτάται από τη διαίρεση των γεωμετριών της πηγής και δεν μετρά έκταση ή ζημιές. Το σενάριο του 2080 μοντελοποιεί πλημμύρα 20ετίας (ετήσια πιθανότητα υπέρβασης 5%) με προβολές για το κλίμα και τις χρήσεις γης. Οι γραμμές του χάρτη απλοποιούνται με ανοχή 75 μέτρων μόνο για την απεικόνιση.",
        unit="intersecting polygons", unitEl="τεμνόμενα πολύγωνα", retrievedAt=evidence["retrievedAt"],
        reachDataLastEdited=evidence["reachLayer"]["dataLastEdited"], reaches=reaches, scenarios=scenarios, series=series)


def replace(path, text):
    with NamedTemporaryFile(mode="w", dir=path.parent, delete=False, encoding="utf-8") as out:
        out.write(text)
    Path(out.name).replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--refresh", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    evidence = fetch_evidence() if args.refresh else json.loads(EVIDENCE.read_text(encoding="utf-8"))
    text = json.dumps(snapshot(evidence), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if text != OUTPUT.read_text(encoding="utf-8"):
            raise SystemExit("Flood extract differs from its archived intersections")
        return
    if args.refresh:
        replace(EVIDENCE, json.dumps(evidence, ensure_ascii=False, separators=(",", ":")) + "\n")
    replace(OUTPUT, text)


if __name__ == "__main__":
    main()
