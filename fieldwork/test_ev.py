"""Offline checks for the CyNAP charging inventory."""
from collections import Counter
import json
from pathlib import Path
import unittest

from import_ev import snapshot


STAMP = "2026-11-15T23:30:55+02:00"


def xml(names, lat="34.9"):
    rows = "".join(f"""
        <chargingPoint>
          <chargingPointIdentification>{name}</chargingPointIdentification>
          <pointCoordinates><latitude>{lat}</latitude><longitude>33.5</longitude></pointCoordinates>
          <powerType>dc</powerType><numberOfConnectors>2</numberOfConnectors>
        </chargingPoint>""" for name in names)
    return f"""<model xmlns="test"><energyInfrastructureTablePublication>
        <publicationTime>{STAMP}</publicationTime><chargingPoints>{rows}</chargingPoints>
        </energyInfrastructureTablePublication></model>""".encode()


class EVTest(unittest.TestCase):
    def test_shared_coordinates_and_missing_operator(self):
        result = snapshot(xml(["A", "B"]), STAMP)
        self.assertEqual(result["coverage"]["distinctCoordinates"], 1)
        self.assertEqual(result["coverage"]["connectors"], 4)
        self.assertEqual(result["series"][0]["points"], [["Unspecified", 2]])
        self.assertEqual(result["series"][1]["points"], [["Unspecified", 0]])
        self.assertEqual(result["series"][2]["points"], [["Unspecified", 2]])

    def test_bad_import_leaves_no_partial_dataset(self):
        for invalid in [b"<error/>", xml([]), xml(["A", "A"]), xml(["A"], "0"),
                        xml(["A"], "nan"), xml(["A"]).replace(b">dc<", b">other<")]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                snapshot(invalid, STAMP)

    def test_distributed_snapshot_reconciles(self):
        data = json.loads(Path(__file__).with_name("ev.json").read_text())
        rows = data["locations"]
        coverage = data["coverage"]
        self.assertEqual(coverage["sourceRecords"], len(rows))
        self.assertEqual(len({r["name"] for r in rows}), len(rows))
        self.assertEqual(coverage["distinctCoordinates"], len({(r["latitude"], r["longitude"]) for r in rows}))
        self.assertEqual(coverage["connectors"], sum(r["connectors"] for r in rows))
        for series in data["series"]:
            current = series["name"]
            counts = Counter(r["operator"] for r in rows if current == "All charging points" or r["currentType"] == current)
            self.assertEqual(Counter(dict(series["points"])), counts)
