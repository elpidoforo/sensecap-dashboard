import json
import unittest

import import_arakapas as fire


class ArakapasMappedArea(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = (fire.HERE / "arakapas-source.csv").read_bytes()
        cls.data = fire.build(cls.payload)

    def test_published_maps_and_change(self):
        self.assertEqual(self.data, json.loads((fire.HERE / "arakapas.json").read_bytes()))
        series, = self.data["series"]
        self.assertEqual(series["points"], [["2021-07-04", 3143.4], ["2021-07-05", 3956.1]])
        self.assertEqual(self.data["unit"], "ha")
        self.assertAlmostEqual(series["points"][1][1] - series["points"][0][1], 812.7)

    def test_observation_and_delivery(self):
        records = self.data["series"][0]["observations"]
        first, last = records["2021-07-04"], records["2021-07-05"]
        self.assertEqual((first["satellite"], first["polygonCount"], first["acquisitionTime"]), ("SPOT6", 10, "2021-07-04T08:08:00Z"))
        self.assertEqual((last["satellite"], last["polygonCount"], last["acquisitionTime"]), ("SPOT7", 7, "2021-07-05T08:00:00Z"))
        self.assertEqual(last["deliveryDate"], "2021-07-06")
        self.assertTrue(last["mapUrl"].endswith("_v2.pdf"))
        self.assertTrue(last["vectorUrl"].endswith("_v1_vector.zip"))

    def test_reject_unexpected_features(self):
        for wrong in (self.payload.replace(b"Burnt area", b"Smoke plume", 1),
                      self.payload.replace(b"DEL,1,", b"DEL,0,", 1),
                      self.payload.replace(b"3106.97406796", b"0.5"),
                      b"\n".join(self.payload.splitlines()[:-1])):
            with self.assertRaises(ValueError):
                fire.build(wrong)
