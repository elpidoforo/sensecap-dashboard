"""Checks against the three archived Eurostat JSON-stat responses behind the Ships and ports page.

The expected numbers were read from the research checkpoint of 19 November 2026 (validation.csv and the CSV tables).
"""
import json
import unittest
from pathlib import Path

from import_sea import EXTRACTS, RETRIEVED, render, snapshot

HERE = Path(__file__).resolve().parent
RAW = {name: (HERE / f"{name}-source.jsonstat").read_bytes() for name in EXTRACTS}
DATA = {name: snapshot(name, RAW[name]) for name in EXTRACTS}
# SHA-256 of the publisher's files as listed in the checkpoint's checksums.csv
CHECKSUMS = {
    "seaarrivals": "f7d7841676248dba7896de759366f0ba708f41d16114606d41e1497bb3ac033f",
    "seanational": "56a697f50db8021ae607019ab2e930fed79dafc3cdd47f49dd69ddf874ea9488",
    "seafreight": "ae1da56b2fc7637e8bad3c0fe4833ca1c6af5be9bc6d6fba74fe3b59379bb284",
}


def value(name, code, period):
    series = [s for s in DATA[name]["series"] if s["code"] == code]
    if not series:
        return "absent"
    return dict(series[0]["points"])[period]


def numeric(name):
    return sum(1 for s in DATA[name]["series"] for _, v in s["points"] if v is not None)


class SeaTest(unittest.TestCase):
    def test_reproduces_packaged_extracts_from_preserved_sources(self):
        for name in EXTRACTS:
            with self.subTest(name=name):
                stored = (HERE / f"{name}.json").read_text(encoding="utf-8")
                self.assertEqual(render(DATA[name]), stored)
                self.assertEqual(DATA[name], json.loads(stored))
                self.assertEqual(DATA[name]["sourceSha256"], CHECKSUMS[name])

    def test_counts_match_the_checkpoint(self):
        self.assertEqual(numeric("seafreight"), 2079)          # validation.csv: freight published numeric values
        self.assertEqual(DATA["seafreight"]["coverage"]["observedValues"], 2079)
        self.assertEqual(value("seafreight", "CY_0CYZYY|TOTAL|TOTAL", "2026-Q1"), 1061)   # validation.csv
        self.assertEqual(numeric("seaarrivals"), 383)          # EARLIER_CHECKPOINT.txt: port, 383 rows
        self.assertEqual(numeric("seanational"), 456)          # EARLIER_CHECKPOINT.txt: marsector, 456 rows
        freight = DATA["seafreight"]
        self.assertEqual(len(freight["periods"]), 45)
        self.assertEqual(len(freight["ports"]) * len(freight["cargoGroups"]) * len(freight["directions"]) * 45, 5400)

    def test_spot_values_read_from_the_csv_tables(self):
        for name, code, period, expected in [
            ("seaarrivals", "CY_0CYLCA|TOTAL", "2020-Q1", 113),
            ("seaarrivals", "CY_0CYLCA|TOTAL", "2025-Q4", 85),
            ("seaarrivals", "CY_0CYLMS|TOTAL", "2025-Q4", 363),
            ("seaarrivals", "CY_0CYLMS|ODC_CNT", "2025-Q4", 180),
            ("seaarrivals", "CY_0CYLMS|ODC_PCRU", "2025-Q4", 21),
            ("seaarrivals", "CY_0CYLCA|DBK", "2025-Q4", 36),
            ("seaarrivals", "CY_0CYLCA|ODC_CNT", "2022-Q2", 6),
            ("seanational", "CY|NR|TOTAL", "2020-Q1", 485),
            ("seanational", "CY|NR|TOTAL", "2025-Q4", 609),
            ("seanational", "CY|THS_GT|TOTAL", "2025-Q4", 8973),
            ("seafreight", "CY_0CYDHK|TOTAL|TOTAL", "2015-Q1", 120),
            ("seafreight", "CY_0CYLCA|TOTAL|TOTAL", "2026-Q1", 548),
            ("seafreight", "CY_0CYLMS|TOTAL|TOTAL", "2026-Q1", 695),
            ("seafreight", "CY_0CYDHK|TOTAL|TOTAL", "2026-Q1", 129),
            ("seafreight", "CY_0CYLMS|LCNT|IN", "2026-Q1", 513),
            ("seafreight", "CY_0CYLMS|LCNT|OUT", "2026-Q1", 104),
            ("seafreight", "CY_0CYMOI|TOTAL|TOTAL", "2017-Q1", 115),
            ("seafreight", "CY_0CYMOI|TOTAL|IN", "2017-Q1", 57),
        ]:
            with self.subTest(code=code, period=period):
                self.assertEqual(value(name, code, period), expected)

    def test_missing_stays_missing_and_zero_stays_zero(self):
        # absent in the publisher's file: null here, never 0, never filled from a neighbour
        self.assertIsNone(value("seaarrivals", "CY_0CYLCA|ODC_CNT", "2022-Q3"))   # between 2022-Q2 (6) and 2023-Q4 (1)
        self.assertIsNone(value("seaarrivals", "CY_0CYLCA|ODC_CNT", "2025-Q4"))
        self.assertIsNone(value("seaarrivals", "CY_0CYLMS|TOTAL", "2026-Q1"))     # indexed by Eurostat, not yet published
        self.assertIsNone(value("seafreight", "CY_0CYMOI|TOTAL|TOTAL", "2015-Q2"))
        self.assertIsNone(value("seafreight", "CY_0CYMOI|TOTAL|TOTAL", "2017-Q2"))
        self.assertIsNone(value("seafreight", "CY_0CYMOI|TOTAL|TOTAL", "2026-Q1"))
        # a combination Eurostat never published is left out altogether
        self.assertEqual(value("seafreight", "CY_0CYMOI|DBK|TOTAL", "2017-Q1"), "absent")
        self.assertEqual(value("seaarrivals", "CY_0CYLCA|MSC_TOW", "2025-Q4"), "absent")
        # a published zero is an observation
        zero = value("seafreight", "CY_0CYLMS|LBK|TOTAL", "2020-Q2")
        self.assertEqual(zero, 0)
        self.assertIs(type(zero), int)
        points = [v for s in DATA["seafreight"]["series"] for _, v in s["points"]]
        self.assertEqual(sum(1 for v in points if v is not None and v == 0), 152)
        self.assertEqual(sum(1 for v in points if v is None), len(points) - 2079)

    def test_latest_observed_period_is_kept_apart_from_the_download_date(self):
        arrivals, freight = DATA["seaarrivals"]["coverage"], DATA["seafreight"]["coverage"]
        self.assertEqual((arrivals["lastObservedPeriod"], arrivals["lastIndexedPeriod"]), ("2025-Q4", "2026-Q3"))
        self.assertEqual(freight["lastObservedPeriod"], "2026-Q1")
        self.assertEqual(freight["lastTotalByPort"]["CY_0CYMOI"], "2017-Q1")
        self.assertEqual({v for k, v in freight["lastTotalByPort"].items() if k != "CY_0CYMOI"}, {"2026-Q1"})
        self.assertEqual(RETRIEVED, "2026-11-19")
        for name in EXTRACTS:
            self.assertEqual(DATA[name]["retrievedAt"], RETRIEVED)

    def test_records_source_terms_units_and_both_languages(self):
        for name, data in DATA.items():
            with self.subTest(name=name):
                self.assertIn("Source: Eurostat", data["attribution"])
                self.assertIn("filtered and converted", data["attribution"])
                self.assertIn("Πηγή: Eurostat", data["attributionEl"])
                self.assertEqual(data["licenceUrl"], "https://ec.europa.eu/eurostat/help/copyright-notice")
                self.assertTrue(data["sourceUrl"].startswith(
                    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/" + data["datasetId"] + "?"))
                self.assertIn("They do not show where ships are right now.", data["method"])
                for key in ("title", "method", "unit", "notLive"):
                    self.assertTrue(data[key] and data[key + "El"] and data[key] != data[key + "El"])
                for item in data["series"] + data["ports"] + data["units"]:
                    self.assertTrue(item["name"] and item["nameEl"])
        self.assertEqual(DATA["seaarrivals"]["unit"], "arrivals")
        self.assertEqual(DATA["seafreight"]["unit"], "thousand tonnes")

    def test_port_positions_are_approximate_and_inside_the_cyprus_frame(self):
        ports = DATA["seafreight"]["ports"]
        self.assertEqual(len(ports), 5)
        for port in ports:
            self.assertTrue(port["positionApproximate"])
            self.assertEqual(round(port["latitude"], 2), port["latitude"])
            self.assertEqual(round(port["longitude"], 2), port["longitude"])
            self.assertTrue(34.5 < port["latitude"] < 35.2 and 32.9 < port["longitude"] < 34.0)
        self.assertNotIn("latitude", DATA["seaarrivals"]["ports"][0])

    def test_refuses_another_dataset_scope_or_bad_values(self):
        for change in ("dataset", "port", "negative", "text", "order"):
            data = json.loads(RAW["seafreight"])
            first = next(iter(data["value"]))
            if change == "dataset":
                data["extension"]["id"] = "MAR_TF_QM"
            elif change == "port":
                index = data["dimension"]["rep_mar"]["category"]["index"]
                index["CY_0CYXXX"] = index.pop("CY_0CYMOI")
            elif change == "negative":
                data["value"][first] = -1
            elif change == "text":
                data["value"][first] = "12"
            else:
                index = data["dimension"]["time"]["category"]["index"]
                index["2015-Q1"], index["2015-Q2"] = index["2015-Q2"], index["2015-Q1"]
            with self.subTest(change=change), self.assertRaises(ValueError):
                snapshot("seafreight", json.dumps(data).encode())

    def test_removing_a_value_leaves_a_gap(self):
        data = json.loads(RAW["seaarrivals"])
        self.assertEqual(data["value"]["0"], 113)     # vessel TOTAL, Larnaka, 2020-Q1 is the first cell
        del data["value"]["0"]
        changed = snapshot("seaarrivals", json.dumps(data).encode())
        points = dict(next(s for s in changed["series"] if s["code"] == "CY_0CYLCA|TOTAL")["points"])
        self.assertIsNone(points["2020-Q1"])
        self.assertEqual(points["2020-Q2"], 76)
        self.assertEqual(changed["coverage"]["observedValues"], 382)


if __name__ == "__main__":
    unittest.main()
