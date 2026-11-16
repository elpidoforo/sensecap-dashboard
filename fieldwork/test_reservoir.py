"""Run with python3 -B -m unittest discover -s fieldwork -p test_reservoir.py."""

import json
import unittest
from datetime import date

from reservoir_import import HERE, extract, render


def sample(*rows):
    return ("DATE,KOURIS,LEFKARA,ASPROKREMMOS\n" + "\n".join(rows)).encode()


class ReservoirArchiveTests(unittest.TestCase):
    def test_dated_rows_are_sorted_and_missing_cells_are_not_zeroes(self):
        data = extract(sample("15/1/2000,2,,0", "1/1/2000,0,1.1,"))
        kouris, lefkara, aspro = data["series"]
        self.assertEqual(kouris["points"], [["2000-01-01", 0], ["2000-01-15", 2]])
        self.assertEqual(lefkara["points"], [["2000-01-01", 1.1]])
        self.assertEqual(aspro["points"], [["2000-01-15", 0]])
        self.assertEqual(data["quality"]["blankCells"], {"Kouris": 0, "Lefkara": 1, "Asprokremmos": 1})

    def test_conflicts_are_omitted_only_for_affected_source_and_day(self):
        data = extract(sample("1/1/2000,1,2,3", "1/1/2000,1,9,"))
        self.assertEqual([s["points"] for s in data["series"]], [
            [["2000-01-01", 1]], [], [["2000-01-01", 3]],
        ])
        self.assertEqual(data["quality"]["excludedConflicts"], [
            {"name": "Lefkara", "date": "2000-01-01", "values": [2, 9]}
        ])

    def test_bundled_source_reproduces_the_published_json(self):
        source = (HERE / "reservoir-source.csv").read_bytes()
        data = extract(source)
        self.assertEqual(data["sourceSha256"], "8ed8b31cb01995aac04d1ffe81531d601f0cecb6d24b70480d5a8e36e131fe94")
        self.assertEqual(render(data).encode(), (HERE / "reservoir.json").read_bytes())

    def test_reviewed_source_values_dates_and_gaps(self):
        data = json.loads((HERE / "reservoir.json").read_bytes())
        self.assertEqual(data["quality"]["sourceRows"], 808)
        self.assertEqual(data["quality"]["distinctSourceDates"], 807)
        self.assertEqual(data["coverageStart"], "1988-01-01")
        self.assertEqual(data["coverageEnd"], "2022-08-15")
        expected = {"Kouris": (8.020, 82.557), "Lefkara": (0.671, 13.112), "Asprokremmos": (36.290, 46.732)}
        gaps = [["2008-11-15", "2008-12-15"], ["2009-11-15", "2009-12-15"], ["2016-04-15", "2017-05-01"]]
        for series in data["series"]:
            with self.subTest(reservoir=series["name"]):
                points = series["points"]
                dates = [day for day, _ in points]
                self.assertEqual(len(points), 806)
                self.assertEqual(dates, sorted(set(dates)))
                self.assertNotIn("2009-12-01", dates)
                self.assertEqual((points[0][1], points[-1][1]), expected[series["name"]])
                self.assertEqual(series["gaps"], gaps)
                for day in dates:
                    self.assertEqual(date.fromisoformat(day).isoformat(), day)

    def test_corrupt_values_or_structure_fail_the_import(self):
        for invalid in (
            sample("1/1/2000,NaN,2,3"), sample("1/1/2000,1,-2,3"),
            sample("not-a-date,1,2,3"), sample("1/1/2000,1,2"),
            sample("1/1/2000,1,2,3,4"), sample(), b"DATE,KOURIS\n",
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                extract(invalid)


if __name__ == "__main__":
    unittest.main()
