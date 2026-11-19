"""Offline checks for the USGS earthquake catalogue. Run with cd fieldwork && python3 -m unittest test_earthquakes."""
from hashlib import sha256
import json
from pathlib import Path
import unittest

from import_earthquakes import BOX, MIN_MAGNITUDE, OUTPUT, SOURCE, SOURCE_SHA256, snapshot, utc


def answer(features, count=None):
    body = {"type": "FeatureCollection", "metadata": {"count": len(features) if count is None else count}, "features": features}
    return json.dumps(body).encode()


def quake(event="us1", mag=5.0, lon=33.0, lat=35.0, depth=10, time=1600000000000, kind="earthquake", mag_type="mb"):
    return {"type": "Feature", "id": event, "geometry": {"type": "Point", "coordinates": [lon, lat, depth]},
            "properties": {"mag": mag, "magType": mag_type, "time": time, "updated": time + 1000, "type": kind,
                           "place": "somewhere", "net": "us", "status": "reviewed", "url": "https://example.org/" + event}}


class EarthquakeTest(unittest.TestCase):
    def test_orders_by_time_and_keeps_published_values(self):
        result = snapshot(answer([quake("b", time=1700000000123, depth=35.59, mag=4.8), quake("a", time=1600000000000, depth=0)]))
        self.assertEqual([row["id"] for row in result["events"]], ["a", "b"])
        self.assertEqual(result["events"][1]["time"], "2023-11-14T22:13:20.123Z")
        self.assertEqual(result["events"][1]["depthKm"], 35.59)
        self.assertEqual(result["events"][0]["depthKm"], 0)          # a zero depth is a value, not a gap
        self.assertEqual(result["events"][1]["magnitudeType"], "mb")
        self.assertEqual(result["coverage"]["events"], 2)
        self.assertIs(result["live"], False)

    def test_times_are_utc(self):
        self.assertEqual(utc(0), "1970-01-01T00:00:00.000Z")
        self.assertEqual(utc(1763026044278), "2025-11-13T09:27:24.278Z")

    def test_a_bad_answer_leaves_no_partial_catalogue(self):
        bad = [
            b'{"type":"Other"}',
            answer([]),
            answer([quake("a"), quake("a")]),                       # the same event twice
            answer([quake("a")], count=2),                          # fewer events than declared
            answer([quake("a", lat=36.5)]),                         # outside the box
            answer([quake("a", lon=31.9)]),
            answer([quake("a", mag=4.4)]),                          # under the threshold
            answer([quake("a", kind="explosion")]),
            answer([quake("a", mag=None)]),
            answer([quake("a", depth=float("nan"))]),
            answer([quake("a", mag_type="")]),
            answer([quake("a", time=1400000000000)]),               # before the period
        ]
        for raw in bad:
            with self.subTest(raw=raw[:60]), self.assertRaises(ValueError):
                snapshot(raw)

    def test_frozen_catalogue_matches_the_saved_answer(self):
        raw = SOURCE.read_bytes()
        self.assertEqual(sha256(raw).hexdigest(), SOURCE_SHA256)     # the file of the research checkpoint, unchanged
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(data, snapshot(raw))
        self.assertEqual(data["sourceSha256"], SOURCE_SHA256)
        rows = data["events"]
        self.assertEqual(len({row["id"] for row in rows}), 14)       # validation.csv: 14 unique USGS event ids
        self.assertEqual(len(rows), 14)
        self.assertEqual(sum(row["time"].startswith("2025-11") for row in rows), 5)   # validation.csv: 5 in the November 2025 cluster
        self.assertEqual((data["coverage"]["busiestMonth"], data["coverage"]["eventsInBusiestMonth"]), ("2025-11", 5))
        self.assertEqual([row["time"] for row in rows], sorted(row["time"] for row in rows))
        for row in rows:
            self.assertGreaterEqual(row["magnitude"], MIN_MAGNITUDE)
            self.assertTrue(BOX["south"] <= row["latitude"] <= BOX["north"] and BOX["west"] <= row["longitude"] <= BOX["east"])
            self.assertTrue(row["time"].endswith("Z") and row["magnitudeType"])
            self.assertGreaterEqual(row["depthKm"], 0)
        for field in ("licence", "attribution", "attributionEl", "method", "methodEl", "retrievedAt", "referenceDate"):
            self.assertTrue(data[field])


if __name__ == "__main__":
    unittest.main()
