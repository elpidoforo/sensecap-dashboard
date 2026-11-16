import hashlib
import json
import unittest

import import_gases as gases


class StationGasArchive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (gases.HERE / "gases-source.txt").read_bytes()
        cls.data = gases.build(cls.raw)
        cls.series = {s["code"]: s for s in cls.data["series"]}

    def test_frozen_response_and_reproduction(self):
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), "dab29d3a74ab1ef9bdf3e07fe9fdf758d8df408120f62d8d2bf7025f2408e45c")
        self.assertEqual(self.data, json.loads((gases.HERE / "gases.json").read_bytes()))

    def test_every_station_hour_and_gas(self):
        self.assertEqual(len(self.series), 22)
        self.assertEqual(len({s["stationCode"] for s in self.series.values()}), 11)
        times = [f"2024-05-15T{hour:02}:00" for hour in range(24)]
        for station in self.series.values():
            self.assertEqual([t for t, _ in station["points"]], times)
        for gas, reported in (("NO2", 211), ("O3", 212)):
            values = [v for s in self.series.values() if s["pollutant"] == gas for _, v in s["points"]]
            self.assertEqual(sum(v is not None for v in values), reported)

    def test_observed_values_and_missing_stations(self):
        for gas, reading in (("NO2", 21.26017), ("O3", 100.8005)):
            self.assertEqual(self.series[f"station_1_{gas}"]["points"][12][1], reading)
            for site in ("station_12", "station_13"):
                self.assertTrue(all(v is None for _, v in self.series[f"{site}_{gas}"]["points"]))

    def test_timestamp_and_gas_identity(self):
        raw = json.loads(self.raw)
        pollutants = raw["data"]["station_1"]["values"]["2024051500"]["pollutants"]
        pollutants["pollutant_8"]["notation"] = "O₃"
        with self.assertRaisesRegex(ValueError, "notation"):
            gases.build(json.dumps(raw).encode())
        pollutants["date_time"] = "2024-05-15 01:00:00"
        with self.assertRaisesRegex(ValueError, "timestamp"):
            gases.build(json.dumps(raw).encode())
