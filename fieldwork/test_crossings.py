"""Run with python3 -B -m unittest discover -s fieldwork -p test_crossings.py."""

from collections import Counter
import json
from pathlib import Path
import unittest

from import_crossings import RADIUS_KM, city_centres, distance_km, snapshot


PUBLISHED = "2026-11-15T18:00:00+02:00"
CAPTURED = "2026-11-16T08:00:00+00:00"


def xml_for(rows):
    elements = []
    for identifier, lat, lon in rows:
        elements.append(f"""<t:trafficElement><c:id>{identifier}</c:id>
          <l:pointByCoordinates><l:pointCoordinates><c:latitude>{lat}</c:latitude>
          <c:longitude>{lon}</c:longitude></l:pointCoordinates></l:pointByCoordinates>
          </t:trafficElement>""")
    return f"""<model xmlns:t="traffic" xmlns:c="common" xmlns:l="location">
        <t:trafficElementPublication><publicationTime>{PUBLISHED}</publicationTime>
        {''.join(elements)}</t:trafficElementPublication></model>""".encode()


class CrossingTest(unittest.TestCase):
    def test_filters_by_distance_and_preserves_missing_coordinates(self):
        centres = {"City": [34.9, 33.6]}
        result = snapshot(xml_for([("0",34.9,33.6), ("1",34.94,33.6), ("2",35.0,33.6),
                                   ("3","nan",33.6), ("4","",33.6)]), CAPTURED, centres)
        self.assertEqual(result["series"][0]["points"], [["City", 2]])
        self.assertEqual(result["coverage"], {"sourceRecords": 5, "withinRadius": 2,
                         "outsideRadius": 1, "missingCoordinates": 2, "missingCoordinateIds": ["3", "4"]})
        self.assertEqual(result["publishedAt"], PUBLISHED)
        self.assertEqual(result["retrievedAt"], CAPTURED)
        self.assertIsNone(result["observedAt"])

    def test_unexpected_feed_or_duplicate_id_fails(self):
        centres = {"City": [35.0, 33.5]}
        for xml in (b"<error/>", xml_for([]), xml_for([("a", 35, 33), ("a", 35, 33)])):
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                snapshot(xml, CAPTURED, centres)

    def test_frozen_snapshot_accounts_for_every_record(self):
        result = json.loads(Path(__file__).with_name("crossings.json").read_text())
        coverage, locations = result["coverage"], result["locations"]
        self.assertGreater(coverage["sourceRecords"], 0)
        self.assertEqual(result["centres"], city_centres())
        self.assertEqual(len({r[0] for r in locations}), len(locations))
        self.assertEqual(len(locations) + coverage["missingCoordinates"], coverage["sourceRecords"])
        counts = Counter()
        for _, _, lat, lon, city in locations:
            distances = {name: distance_km(lat, lon, centre) for name, centre in result["centres"].items()}
            nearest = min(distances, key=distances.get)
            self.assertEqual(city, nearest if distances[nearest] <= RADIUS_KM else None)
            counts[city] += 1
        self.assertEqual(coverage["outsideRadius"], counts[None])
        actual = dict(result["series"][0]["points"])
        self.assertEqual(actual, {name: counts[name] for name in result["centres"]})
        self.assertEqual(coverage["withinRadius"], sum(actual.values()))


if __name__ == "__main__":
    unittest.main()
