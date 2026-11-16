"""Tests for the Cyprus drought cell extract and mask semantics."""
import json
import unittest

from import_drought import HERE, snapshot

SOURCE = (HERE / "drought-source.csv").read_text()


class DroughtTest(unittest.TestCase):
    def test_packaged_rows_and_periods(self):
        data = snapshot(SOURCE)
        self.assertEqual(data, json.loads((HERE / "drought.json").read_text()))
        self.assertEqual([len(s["points"]) for s in data["series"]], [36] * 4)
        self.assertEqual(data["periodEnds"]["2022-02-21"], "2022-02-28")
        self.assertEqual(data["periodEnds"]["2022-12-21"], "2022-12-31")
        self.assertEqual([dict(s["points"])["2022-07-21"] for s in data["series"]], [0, 4, 2, 4])

    def test_preserves_mask_codes(self):
        for code in (7, 8):
            source = SOURCE.replace("2022-01-01,0", f"2022-01-01,{code}", 1)
            row = snapshot(source)["series"][0]
            self.assertIsNone(row["points"][0][1])
            self.assertEqual(row["sourceMaskCodes"]["2022-01-01"], code)

    def test_rejects_corrupt_record(self):
        lines = SOURCE.splitlines()
        for source in ("\n".join(lines[:-1]), SOURCE + lines[1],
                       SOURCE.replace("2022-01-01,0", "2022-01-01,9", 1)):
            with self.assertRaises(ValueError):
                snapshot(source)
