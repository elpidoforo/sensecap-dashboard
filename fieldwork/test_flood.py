"""Regression checks for the WDD reach-to-polygon comparison and display geometry."""
import copy
import json
import unittest

from import_flood import EVIDENCE, OUTPUT, snapshot


class FloodTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.evidence = json.loads(EVIDENCE.read_text())
        cls.dataset = snapshot(cls.evidence)

    def test_replay_and_checked_reaches(self):
        self.assertEqual(self.dataset, json.loads(OUTPUT.read_text()))
        series = [dict(s["points"]) for s in self.dataset["series"]]
        # Independently checked against the ArcGIS spatial query for these two reaches.
        self.assertEqual([s["CY-APSFR03"] for s in series], [3, 4, 4, 3])
        self.assertEqual([s["CY-APSFR22"] for s in series], [1, 1, 1, 1])
        for s in series:
            self.assertEqual(len(s), 38)

    def test_shared_and_unmatched_polygons(self):
        scenarios = self.dataset["scenarios"]
        self.assertEqual([s["polygonCount"] for s in scenarios], [171, 83, 64, 91])
        self.assertEqual([s["unmatchedPolygons"] for s in scenarios], [24, 0, 0, 33])
        self.assertEqual([s["sharedPolygons"] for s in scenarios], [13, 12, 12, 11])
        self.assertTrue(all(s["matchedReaches"] == 38 for s in scenarios))

    def test_rejects_unknown_reach_in_join(self):
        evidence = copy.deepcopy(self.evidence)
        polygons = evidence["scenarios"]["q100"]["matches"]
        polygons[next(iter(polygons))].append("unknown")
        with self.assertRaises(ValueError):
            snapshot(evidence)

    def test_map_coordinates_are_geographic_and_in_cyprus(self):
        for reach in self.dataset["reaches"]:
            self.assertTrue(reach["mapLines"], reach["code"])
            for segment in reach["mapLines"]:
                self.assertGreaterEqual(len(segment), 2)
                for longitude, latitude in segment:
                    self.assertTrue(32 <= longitude <= 35 and 34 <= latitude <= 36)
