import json
import unittest

from import_aeronet import HERE, build, parse_station


class AerosolSnapshotTests(unittest.TestCase):
    def test_published_snapshot_reproduces(self):
        snapshot = build()
        self.assertEqual(snapshot, json.loads((HERE / "aeronet.json").read_text()))
        limassol, nicosia = snapshot["series"]
        for station in (limassol, nicosia):
            self.assertEqual(len(station["points"]), 31)
            self.assertEqual(station["points"][0][0], "2022-07-01")
            self.assertEqual(station["points"][-1][0], "2022-07-31")
        self.assertEqual(limassol["points"][0][1], 0.151093)
        self.assertEqual(nicosia["points"][0][1], 0.132813)
        self.assertEqual([d for d, v in limassol["points"] if v is None], ["2022-07-09", "2022-07-16"])
        self.assertTrue(all(v is not None for d, v in nicosia["points"]))
        self.assertIsNone(limassol["sampleCounts"]["2022-07-16"])

    def test_wrong_station_and_quality_rejected(self):
        payload = (HERE / "aeronet-nicosia-source.txt").read_bytes()
        with self.assertRaisesRegex(ValueError, "Unexpected site"):
            parse_station("CUT-TEPAK", payload)
        with self.assertRaisesRegex(ValueError, "Unexpected site or quality"):
            parse_station("Nicosia", payload.replace(b",lev20,", b",lev15,"))

    def test_missing_sentinel_and_duplicate_day(self):
        payload = (HERE / "aeronet-nicosia-source.txt").read_bytes()
        missing = parse_station("Nicosia", payload.replace(b",0.132813,", b",-999.000000,"))
        self.assertEqual(missing["points"][0], ["2022-07-01", None])
        self.assertIsNone(missing["sampleCounts"]["2022-07-01"])
        duplicate = next(r for r in payload.splitlines() if b",01:07:2022," in r)
        with self.assertRaisesRegex(ValueError, "Duplicate daily"):
            parse_station("Nicosia", payload.rstrip() + b"\n" + duplicate)
