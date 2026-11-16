import json
import statistics
import unittest

import import_verifiedno2 as archive


class VerifiedNitrogenDioxide(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (archive.HERE / "verifiedno2-source.csv").read_bytes()
        cls.data = archive.build(cls.raw)

    def test_published_series_reproduce(self):
        expected = json.loads((archive.HERE / "verifiedno2.json").read_bytes())
        self.assertEqual(self.data, expected)
        for series, noon, mean in zip(self.data["series"], [3.17685, 16.04399, 11.00529], [2.60998, 23.26512, 14.88137]):
            self.assertEqual(len(series["points"]), 24)
            self.assertEqual(series["points"][12], ["2024-05-15T12:00+01:00", noon])
            self.assertAlmostEqual(statistics.mean(v for t, v in series["points"]), mean, places=5)

    def test_flags_and_offset(self):
        for source, replacement in [(b",1,1,", b",1,3,"), (b"+01:00", b"+02:00")]:
            with self.assertRaises(ValueError):
                archive.build(self.raw.replace(source, replacement, 1))

    def test_missing_and_duplicate(self):
        rows = self.raw.splitlines(keepends=True)
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            archive.build(b"".join(rows[:-1]))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            archive.build(self.raw + rows[-1])
