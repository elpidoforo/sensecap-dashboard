"""Checks against the archived Cyprus Eurostat JSON-stat response."""
import json
import unittest
from pathlib import Path

from import_power import CAPTURED, snapshot

HERE = Path(__file__).resolve().parent
RAW = (HERE / "power-source.jsonstat").read_bytes()


class PowerTest(unittest.TestCase):
    def test_reproduces_packaged_values_and_flags(self):
        data = snapshot(RAW, CAPTURED)
        self.assertEqual(data, json.loads((HERE / "power.json").read_text()))
        by_code = {s["code"]: s for s in data["series"]}
        self.assertEqual(data["coverage"]["reportedMonths"], 20)
        self.assertEqual([s["points"][-2][1] for s in data["series"]], [461.176, 178.824, 15.544, 2.932, 658.476])
        self.assertTrue(all(s["points"][-1] == ["2026-09-01", None] for s in data["series"]))
        self.assertEqual(list(by_code["RA420"]["flags"].values()), ["e"] * 16 + ["p"] * 4)

    def test_refuses_invalid_component_and_scope(self):
        for change in ("missing", "mismatch", "scope"):
            data = json.loads(RAW)
            if change == "scope":
                data["dimension"]["geo"]["category"]["index"] = {"EU27_2020": 0}
            elif change == "missing":
                del data["value"]["0"]
            else:
                data["value"]["0"] += 1
            with self.subTest(change=change), self.assertRaises(ValueError):
                snapshot(json.dumps(data).encode(), CAPTURED)

    def test_zero_is_reported(self):
        data = json.loads(RAW)
        for index in ("0", "42", "126", "273", "378"):
            data["value"][index] = 0
        extracted = snapshot(json.dumps(data).encode(), CAPTURED)
        self.assertEqual([s["points"][0][1] for s in extracted["series"]], [0] * 5)
        self.assertEqual(extracted["coverage"]["reportedMonths"], 20)
