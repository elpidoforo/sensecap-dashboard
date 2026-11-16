"""Run python3 fieldwork/test_weather.py to check the weather product."""
import calendar
import csv
from datetime import date
import io
import json
import unittest

from import_weather import build, MAX_FIELD, MIN_FIELD, OUTPUT


def make_csv(rows):
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["DATE", "LOCATION", MAX_FIELD, MIN_FIELD, "Rain (mm)"])
    writer.writerows(rows)
    return ("\ufeff\ufeff" + stream.getvalue()).encode()


class WeatherDataTests(unittest.TestCase):
    def test_completeness_and_source_defects(self):
        here = "Αθαλάσσα"
        # 27 usable days out of 29 in a leap February. A duplicate must count once.
        rows = [(f"{d:02d}/02/2024", here, 15, 4, 0) for d in range(1, 28)]
        rows += [rows[0], ("28/02/2024", here, "21..1", 4, 0),
                 ("29/02/2024", here, 211, 4, 0), ("31/02/2024", here, 21, 4, 0)]
        result = build(make_csv(rows))
        station = result["series"][0]
        self.assertEqual(station["points"], [["2024-02-01", 15.0]])
        self.assertEqual(station["coverage"]["2024-02-01"], [27, 29])
        self.assertEqual(result["quality"]["duplicateDateRows"], 1)
        self.assertEqual(result["quality"]["invalidDateRows"], 1)
        self.assertEqual(result["quality"]["unusableTmaxRows"], 2)

        # Conflicting valid values on the same day exclude that day. Missing is not zero.
        rows.append(("01/02/2024", here, 20, 4, 0))
        result = build(make_csv(rows))
        self.assertEqual(result["quality"]["conflictingStationDays"], 1)
        self.assertEqual(result["series"][0]["points"], [])
        self.assertEqual(result["series"][0]["coverage"]["2024-02-01"], [26, 29])

    def test_identical_month_suppressed_for_both_station_labels(self):
        stations = ["Λεμεσός Νέο Λιμάνι", "Λεμεσός (Δημ. Κήπος)"]
        rows = [(f"{d:02d}/01/2025", s, 20 + d / 10, 6, d / 10)
                for s in stations for d in range(1, 32)]
        product = build(make_csv(rows))
        self.assertEqual(len(product["series"]), 2)
        for station in product["series"]:
            self.assertEqual(station["points"], [])
            self.assertIn("2025-01-01", station["matchingStationMonths"])
            self.assertEqual(station["coverage"]["2025-01-01"], [31, 31])

    def test_checked_in_snapshot(self):
        product = json.loads(OUTPUT.read_text("utf-8"))
        self.assertEqual(product["licence"], "CC BY 4.0")
        self.assertEqual(len(product["series"]), 8)
        self.assertEqual(product["quality"]["sourceRows"], 33022)
        self.assertEqual(product["quality"]["usableStationDays"], 32519)
        stations = {s["name"]: s for s in product["series"]}
        self.assertEqual(len(stations), len(product["series"]))
        self.assertEqual(dict(stations["Larnaka Airport"]["points"])["2010-01-01"], 18.6)
        self.assertIn("2025-10-01", stations["Prodromos Forestry College"]["matchingStationMonths"])
        for s in stations.values():
            points = dict(s["points"])
            self.assertEqual(list(points), sorted(points))
            self.assertEqual(len(points), len(s["points"]))
            for stamp, (count, total) in s["coverage"].items():
                day = date.fromisoformat(stamp)
                self.assertEqual(total, calendar.monthrange(day.year, day.month)[1])
                self.assertLessEqual(count, total)
                qualified = count * 100 >= total * 90 and stamp not in s["matchingStationMonths"]
                self.assertEqual(stamp in points, qualified)
                if qualified:
                    self.assertTrue(-40 <= points[stamp] <= 60)


if __name__ == "__main__":
    unittest.main()
