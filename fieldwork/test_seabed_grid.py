"""Checks on the importer of the seabed depth grid (import_seabed_grid.py), without the network.

EMODnet is never contacted here: every answer comes from a stand-in inside this file, or from the made-up numbers in
tests/stack/seabedgrid.TEST-ONLY.fixture.json (a test fixture, never real depths).
Run: cd fieldwork && python3 -m unittest test_seabed_grid
"""
import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib import error

import import_seabed_grid as G

FIXTURE = Path(__file__).resolve().parent.parent / "tests" / "stack" / "seabedgrid.TEST-ONLY.fixture.json"
MADE_UP = json.loads(FIXTURE.read_text(encoding="utf-8"))


def made_up_fetch(coordinates):
    """Stands in for EMODnet: answers from the fixture's made-up numbers."""
    spec = MADE_UP["grid"]
    col = round((coordinates[0] - spec["lng0"]) / spec["step"])
    row = round((coordinates[1] - spec["lat0"]) / spec["step"])
    return MADE_UP["elevation"][row * spec["cols"] + col]


class Answer(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class SeabedGridTest(unittest.TestCase):
    def test_grid_covers_the_box_of_the_data_stack_and_never_leaves_it(self):
        spec = G.grid_spec(0.1)
        self.assertEqual((spec["rows"], spec["cols"]), (36, 54))
        self.assertEqual(G.cell_lonlat(spec, 0, 0), (31.0, 33.3))
        self.assertEqual(G.cell_lonlat(spec, 35, 53), (36.3, 36.8))
        fine = G.grid_spec(0.05)
        self.assertEqual((fine["rows"], fine["cols"]), (71, 107))
        for step in G.STEPS:
            s = G.grid_spec(step)
            lon, lat = G.cell_lonlat(s, s["rows"] - 1, s["cols"] - 1)
            self.assertLessEqual(lon, G.BOX["lng1"])
            self.assertLessEqual(lat, G.BOX["lat1"])
        with self.assertRaises(ValueError):
            G.grid_spec(0.3)

    def test_box_is_the_box_of_the_server_terrain_grid(self):
        server = (Path(__file__).resolve().parent.parent / "server.js").read_text(encoding="utf-8")
        self.assertIn("const B = { lat0: 33.3, lat1: 36.8, lng0: 31.0, lng1: 36.3,", server)
        self.assertEqual(G.BOX, {"lat0": 33.3, "lat1": 36.8, "lng0": 31.0, "lng1": 36.3})

    def test_asks_the_same_service_and_field_as_the_seabed_profiles(self):
        asked = []

        def opener(url, timeout):
            asked.append(url)
            return Answer(json.dumps({"avg": -431.5, "interpolationType": "x"}).encode())

        self.assertEqual(G.fetch_cell((33.65, 34.912), opener=opener), -431.5)
        self.assertEqual(asked, ["https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT%2833.65+34.912%29"])
        coast = (Path(__file__).with_name("refresh-coast.py")).read_text(encoding="utf-8")
        self.assertIn('SOURCE = "https://rest.emodnet-bathymetry.eu/"', coast)
        self.assertIn('SOURCE + "depth_sample?"', coast)
        self.assertEqual(G.ATTRIBUTION, "EMODnet Bathymetry Consortium, EMODnet Digital Terrain Model.")
        self.assertIn(G.ATTRIBUTION, coast)

    def test_no_value_is_null_and_a_bad_value_is_an_error(self):
        self.assertIsNone(G.read_value({"avg": None}, (0, 0)))
        self.assertIsNone(G.read_value({}, (0, 0)))
        self.assertIsNone(G.read_value(None, (0, 0)))
        self.assertIsNone(G.read_value([], (0, 0)))
        self.assertEqual(G.read_value({"avg": 12}, (0, 0)), 12)
        for bad in ("12", True, float("nan"), float("inf"), -99999, 99999):
            with self.assertRaises(ValueError):
                G.read_value({"avg": bad}, (0, 0))

    def test_retries_a_failing_service_and_gives_up_without_inventing(self):
        calls = []

        def down(url, timeout):
            calls.append(url)
            raise error.HTTPError(url, 503, "down", {}, None)

        with self.assertRaises(error.HTTPError):
            G.fetch_cell((33.0, 34.0), opener=down, pause=lambda s: None)
        self.assertEqual(len(calls), 3)

        def missing(url, timeout):
            raise error.HTTPError(url, 404, "no cell", {}, None)

        self.assertIsNone(G.fetch_cell((33.0, 34.0), opener=missing, pause=lambda s: None))

        def refused(url, timeout):
            raise error.HTTPError(url, 400, "bad", {}, None)

        with self.assertRaises(error.HTTPError):
            G.fetch_cell((33.0, 34.0), opener=refused, pause=lambda s: None)

    def test_a_whole_run_writes_exactly_what_the_service_said(self):
        with tempfile.TemporaryDirectory() as folder:
            out, partial = Path(folder) / "seabedgrid.json", Path(folder) / "partial.json"
            made = G.refresh(0.5, workers=3, output=out, partial=partial, fetch=made_up_fetch)
            stored = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(stored, made)
            self.assertEqual(stored["elevation"], MADE_UP["elevation"])       # nothing smoothed, filled in or reordered
            self.assertEqual(stored["grid"], MADE_UP["grid"])
            self.assertEqual(stored["coverage"], MADE_UP["coverage"])
            self.assertEqual(stored["coverage"]["noValue"], 2)
            self.assertNotIn("testOnly", stored)
            self.assertEqual(stored["attribution"], G.ATTRIBUTION)
            self.assertEqual(stored["licence"], "CC BY 4.0")
            self.assertEqual(stored["unit"], "m")
            self.assertFalse(partial.exists())                                # the leftovers of the run are cleared away
            G.validate(stored)

    def test_an_interrupted_run_carries_on_where_it_stopped(self):
        spec = G.grid_spec(0.5)
        asked = []

        def breaks_after_40(coordinates):
            if len(asked) >= 40:
                raise error.URLError("the line dropped")
            asked.append(coordinates)
            return made_up_fetch(coordinates)

        with tempfile.TemporaryDirectory() as folder:
            partial = Path(folder) / "partial.json"
            partial.write_text(json.dumps({"grid": spec, "values": {"31.0,33.3": None, "31.5,33.3": -300}}), encoding="utf-8")
            later = []

            def counted(coordinates):
                later.append(coordinates)
                return made_up_fetch(coordinates)

            values = G.collect(spec, fetch=counted, workers=2, partial=partial)
            self.assertEqual(values, MADE_UP["elevation"])
            self.assertEqual(len(later), spec["rows"] * spec["cols"] - 2)     # the two saved cells were not asked for again
            with self.assertRaises(error.URLError):
                G.collect(G.grid_spec(0.25), fetch=breaks_after_40, workers=1, partial=Path(folder) / "other.json")

    def test_check_refuses_what_is_not_a_real_extract(self):
        good = G.build(MADE_UP["grid"], list(MADE_UP["elevation"]), "2026-11-19T10:00:00+00:00")
        G.validate(good)
        with self.assertRaises(ValueError):
            G.validate(MADE_UP)                                              # the fixture says it is a fixture
        for change in (
            {"testOnly": True}, {"unit": "ft"}, {"sourceUrl": "https://example.org/"}, {"attribution": "someone"}, {"retrievedAt": ""},
            {"elevation": good["elevation"][:-1]}, {"elevation": [float("nan")] + good["elevation"][1:]},
            {"elevation": ["-100"] + good["elevation"][1:]}, {"elevation": [-90000] + good["elevation"][1:]},
            {"elevation": [None if v is None or v < 0 else v for v in good["elevation"]]},
            {"grid": {**good["grid"], "rows": 9}}, {"grid": {**good["grid"], "lat0": 30.0}}, {"box": {**G.BOX, "lat1": 40}},
            {"coverage": {**good["coverage"], "deepest": -1}},
        ):
            with self.subTest(change=list(change)):
                with self.assertRaises(ValueError):
                    G.validate({**good, **change})

    def test_the_fixture_cannot_be_taken_for_emodnet_data(self):
        self.assertIs(MADE_UP["testOnly"], True)
        self.assertIn("TEST ONLY", MADE_UP["title"])
        self.assertIn("TEST ONLY", MADE_UP["attribution"])
        self.assertNotIn("EMODnet Bathymetry Consortium", json.dumps(MADE_UP))
        self.assertFalse(Path(__file__).with_name("seabedgrid-fixture.json").exists())

    def test_no_made_up_grid_is_packaged(self):
        packaged = Path(__file__).with_name("seabedgrid.json")
        if packaged.exists():                                                 # once the owner has run the import, it must be the real thing
            G.validate(json.loads(packaged.read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
