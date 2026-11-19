"""Offline checks for building permits by district. Run with cd fieldwork && python3 -m unittest test_permits."""
from hashlib import sha256
import json
import unittest

from import_permits import FIELDS, OUTPUT, SOURCE, SOURCE_SHA256, snapshot

UNITS = {"0": ("Number of permits", "permits"), "1": ("Area (m2)", "square metres"), "2": ("Value (€000's)", "thousand EUR"), "3": ("Dwelling units", "dwelling units")}
AREA = {"0": "Total", "1": "Urban", "2": "Rural"}


def table(values, months=("2026-06", "2026-07"), drop=None, extra=()):
    """values: {district name: (urban, rural)} per month; the totals are added here. A None is an N.A. cell."""
    names = list(values) + ["District Total"]
    lines = [",".join(FIELDS)]
    for month in months:
        for code, name in enumerate(names):
            for area in AREA:
                for indicator, (label, unit) in UNITS.items():
                    if name == "District Total":
                        parts = [sum(v[i] or 0 for v in values.values()) for i in (0, 1)]
                    else:
                        parts = list(values[name])
                    value = (parts[0] or 0) + (parts[1] or 0) if area == "0" else parts[int(area) - 1]
                    if (month, name, area, indicator) == drop:
                        continue
                    status = "N.A." if value is None else ""
                    lines.append(",".join([month, str(code), name, area, AREA[area], "0", "Number", "0", "Monthly data", indicator,
                                           '"' + label + '"', unit, "" if value is None else str(value), status]))
    lines.extend(extra)
    return ("﻿" + "\n".join(lines) + "\n").encode()


class PermitsTest(unittest.TestCase):
    def test_latest_month_series_and_marks(self):
        data = snapshot(table({"Lefkosia": (3, 0), "Ammochostos": (None, 4)}))
        self.assertEqual(data["latestMonth"], "2026-07")
        rows = {r["name"]: r for r in data["latest"]}
        self.assertEqual(rows["Lefkosia"]["rural"]["permits"], 0)                 # a zero is an observation
        self.assertIsNone(rows["Ammochostos"]["urban"]["permits"])                # N.A. stays empty
        self.assertEqual(rows["Ammochostos"]["urban"]["marks"]["permits"], "N.A.")
        self.assertNotIn("marks", rows["Lefkosia"]["urban"])
        self.assertEqual(data["reportingTotal"]["total"]["permits"], 7)
        self.assertNotIn("District Total", rows)                                  # the total is kept apart from its parts
        self.assertEqual(data["months"], ["2026-06", "2026-07"])
        self.assertEqual([s["values"] for s in data["permitsByMonth"]], [[3, 3], [4, 4]])
        self.assertEqual(data["coverage"]["notApplicable"], 8)
        self.assertEqual(data["annotation"]["month"], "2024-07")
        self.assertIs(data["live"], False)

    def test_a_bad_table_leaves_no_partial_snapshot(self):
        good = table({"Lefkosia": (3, 1)}).decode("utf-8-sig")
        row = good.splitlines()[1]
        cases = [
            b"a,b\n1,2\n",
            (",".join(FIELDS) + "\n").encode(),
            table({"Lefkosia": (3, 1)}, extra=[row]),                                           # the same cell twice
            table({"Lefkosia": (3, 1)}, extra=[row.replace("2026-06", "2026-08").replace(",4,", ",-4,")]),
            table({"Lefkosia": (3, 1)}, extra=[row.replace("2026-06", "2026-08").replace(",permits,", ",houses,")]),
            table({"Lefkosia": (3, 1)}, extra=[row.replace("2026-06", "June 2026")]),
            table({"Lefkosia": (3, 1)}, extra=[row.replace("2026-06", "2026-08").replace("Lefkosia", "Lemesos")]),   # one code, two names
            table({"Lefkosia": (3, 1), "Pafos": (2, 2)}, drop=("2026-07", "Pafos", "0", "0")),      # the districts no longer give the total
        ]
        for raw in cases:
            with self.subTest(raw=raw[-80:]), self.assertRaises(ValueError):
                snapshot(raw)

    def test_frozen_snapshot_matches_the_saved_table(self):
        raw = SOURCE.read_bytes()
        self.assertEqual(sha256(raw).hexdigest(), SOURCE_SHA256)                  # the file of the research checkpoint, unchanged
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(data, snapshot(raw))
        # validation.csv of the checkpoint
        self.assertEqual(data["coverage"]["numericValues"], 9452)
        self.assertEqual(data["coverage"]["notApplicable"], 556)
        self.assertEqual(data["latestMonth"], "2026-07")
        self.assertEqual(len(data["latest"]), 5)
        self.assertEqual(sum(r["total"]["permits"] for r in data["latest"]), 772)
        self.assertEqual(data["reportingTotal"]["total"]["permits"], 772)
        self.assertEqual(data["reportingTotal"]["total"]["dwellings"], 1944)
        self.assertEqual((data["coverage"]["months"], data["months"][0], data["months"][-1]), (139, "2015-01", "2026-07"))
        for r in data["latest"]:
            parts = (r["urban"]["permits"], r["rural"]["permits"])
            if None not in parts:
                self.assertEqual(sum(parts), r["total"]["permits"])
        ammochostos = next(r for r in data["latest"] if r["name"] == "Ammochostos")
        self.assertIsNone(ammochostos["urban"]["permits"])
        self.assertEqual(ammochostos["urban"]["marks"]["permits"], "N.A.")
        for s in data["permitsByMonth"]:
            self.assertEqual(len(s["values"]), 139)
        for field in ("licence", "attribution", "attributionEl", "method", "methodEl", "retrievedAt", "referenceDate"):
            self.assertTrue(data[field])


if __name__ == "__main__":
    unittest.main()
