"""Offline checks for residents and age by locality. Run with cd fieldwork && python3 -m unittest test_localities."""
import json
import unittest

from import_localities import AGE_BANDS, AGE_FLOOR, OUTPUT, make_snapshot, percent, read_sources

HEAD = "census_geography_code,publisher_area,geography_level,parent_district,sex,Total," + ",".join(AGE_BANDS)
MEAN_HEAD = '"DISTRICT, MUNICIPALITY / COMMUNITY, QUARTER","Total","Males","Females"'
COMP_HEAD = "municipality_after_reform,component_census_code,component_census_label,population_date,membership_basis,evidence_url"
CITY = [("1000", "Lefkosia - Total"), ("4000", "Larnaka - Total"), ("5000", "Lemesos - Total"), ("6000", "Pafos - Total")]


def line(code, name, level, district, counts, sex="Total", total=None):
    return ",".join([code, name, level, district, sex, str(sum(counts) if total is None else total), *map(str, counts)])


def bands(first, rest=0):
    return [first] + [rest] * 16


def files(extra=(), village=bands(60), quarter_total=None, mean_rows=None, composition=None):
    """A census with four cities of 100 residents each, one village and two quarters of Lefkosia."""
    hundred = bands(10, 5) + []           # 10 + 16 * 5 = 90
    hundred[16] = 15                      # 100 residents: 20 under 15, 30 aged 65 and over
    rows, means = [], []
    d_names = {"1": "LEFKOSIA DISTRICT", "4": "LARNAKA DISTRICT", "5": "LEMESOS DISTRICT", "6": "PAFOS DISTRICT"}
    village_total = sum(village)
    totals = {"1": 100 + village_total, "4": 100, "5": 100, "6": 100}
    all_counts = [4 * c + v for c, v in zip(hundred, village)]
    rows.append(line("TOTAL", "DISTRICTS TOTAL", "all reporting districts", "", all_counts))
    rows.append(line("TOTAL", "DISTRICTS TOTAL", "all reporting districts", "", all_counts, sex="Males"))   # must be ignored
    for d, name in d_names.items():
        counts = [c + v for c, v in zip(hundred, village)] if d == "1" else hundred
        assert sum(counts) == totals[d]
        rows.append(line(d, name, "district", name, counts))
    for code, name in CITY:
        rows.append(line(code, name, "municipality or community", d_names[code[0]], hundred))
    rows.append(line("1100", "Village", "municipality or community", "LEFKOSIA DISTRICT", village))
    q1 = [c // 2 for c in hundred]
    q2 = [c - h for c, h in zip(hundred, q1)]
    rows.append(line("100001", "Lefkosia - North", "quarter", "LEFKOSIA DISTRICT", q1))
    rows.append(line("100002", "Lefkosia - South", "quarter", "LEFKOSIA DISTRICT", q2 if quarter_total is None else bands(quarter_total)))
    rows.extend(extra)
    names = ["DISTRICTS TOTAL", *d_names.values(), *(n for _, n in CITY), "Village", "Lefkosia - North", "Lefkosia - South"]
    means = mean_rows if mean_rows is not None else [f'"{n}",40.50,39.00,42.00' for n in names]
    comp = composition if composition is not None else [
        "Lefkosia,1000,Lefkosia - Total,2021-10-01,reform,https://example.org/a",
        "Lefkosia,1100,Village,2021-10-01,reform,https://example.org/a",
        "Larnaka,4000,Larnaka - Total,2021-10-01,reform,https://example.org/a",
        "Lemesos,5000,Lemesos - Total,2021-10-01,reform,https://example.org/a",
        "Pafos,6000,Pafos - Total,2021-10-01,reform,https://example.org/b",
    ]
    return ("\n".join([HEAD, *rows]) + "\n").encode(), ("\r\n".join([MEAN_HEAD, *means]) + "\r\n").encode("cp1252"), ("\n".join([COMP_HEAD, *comp]) + "\n").encode()


class LocalityTest(unittest.TestCase):
    def test_groups_percentages_and_recast(self):
        data = make_snapshot(*files())
        city = next(l for l in data["localities"] if l["code"] == "1000")
        self.assertEqual((city["residents"], city["under15"], city["age15to64"], city["age65plus"]), (100, 20, 50, 30))
        self.assertEqual((city["under15Percent"], city["age65plusPercent"], city["meanAge"]), (20.0, 30.0, 40.5))
        self.assertEqual((city["district"], city["quarters"]), ("1", 2))
        self.assertEqual(data["coverage"], {"districts": 4, "localities": 5, "quarters": 2, "residents": 460,
                                            "meanAgeJoined": 12, "meanAgeRows": 12, "ageWithheld": 0})
        recast = {r["municipality"]: r for r in data["recast2024"]}
        self.assertEqual((recast["Lefkosia"]["residents"], recast["Lefkosia"]["under15"], recast["Lefkosia"]["components"]), (160, 80, ["1000", "1100"]))
        self.assertEqual(recast["Lefkosia"]["under15Percent"], 50.0)       # worked out after adding the counts
        self.assertIsNone(recast["Lefkosia"]["meanAge"])                    # no published mean for a recast area
        self.assertEqual(recast["Pafos"]["residents"], 100)

    def test_small_places_keep_a_count_but_no_ages(self):
        data = make_snapshot(*files(village=bands(AGE_FLOOR - 1)))
        village = next(l for l in data["localities"] if l["code"] == "1100")
        self.assertEqual(village["residents"], AGE_FLOOR - 1)
        self.assertTrue(village["ageWithheld"])
        for key in ("meanAge", "under15", "age15to64", "age65plus", "under15Percent", "age65plusPercent"):
            self.assertIsNone(village[key])
        self.assertEqual(data["coverage"]["ageWithheld"], 1)

    def test_percent_rounds_half_up_in_whole_numbers(self):
        self.assertEqual(percent(1, 8), 12.5)
        self.assertEqual(percent(1, 3), 33.33)
        self.assertEqual(percent(2, 3), 66.67)
        self.assertEqual(percent(1, 800), 0.13)       # 0.125 rounds up
        self.assertEqual(percent(0, 7), 0.0)

    def test_a_bad_file_leaves_no_partial_snapshot(self):
        extra_dup = [line("1000", "Lefkosia again", "municipality or community", "LEFKOSIA DISTRICT", bands(5))]
        wrong_sum = [line("1200", "Nowhere", "municipality or community", "LEFKOSIA DISTRICT", bands(5), total=9)]
        stray = [line("1200", "Stray", "municipality or community", "LEFKOSIA DISTRICT", bands(60))]      # the district no longer adds up
        wrong_district = [line("4200", "Lost", "municipality or community", "LEFKOSIA DISTRICT", bands(0))]
        orphan = [line("999901", "Orphan", "quarter", "LEFKOSIA DISTRICT", bands(1))]
        cases = [
            files(extra=extra_dup), files(extra=wrong_sum), files(extra=stray), files(extra=wrong_district), files(extra=orphan),
            files(quarter_total=7),                                                      # quarters that do not add up to their parent
            files(mean_rows=['"Atlantis",40.5,39,42']),                                  # a mean age for an area the census does not have
            files(mean_rows=['"Village",0,0,0']),
            files(composition=["Lefkosia,1000,Wrong label,2021-10-01,reform,https://example.org/a"]),
            files(composition=["Lefkosia,1000,Lefkosia - Total,2021-10-01,reform,https://example.org/a"]),   # three cities missing
        ]
        for case in cases:
            with self.subTest(case=case[2][-60:]), self.assertRaises(ValueError):
                make_snapshot(*case)
        with self.assertRaises(ValueError):
            make_snapshot(b"a,b\n1,2\n", *files()[1:])

    def test_frozen_snapshot_reproduces_the_published_totals(self):
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(data, make_snapshot(*read_sources()))               # also proves the three files are the checkpoint's
        self.assertEqual(data["coverage"], {"districts": 5, "localities": 396, "quarters": 99, "residents": 923381,
                                            "meanAgeJoined": 501, "meanAgeRows": 501, "ageWithheld": 70})
        self.assertEqual(data["total"]["residents"], 923381)
        self.assertEqual(sum(d["residents"] for d in data["districts"]), 923381)
        self.assertEqual(sum(l["residents"] for l in data["localities"]), 923381)
        by_code = {l["code"]: l for l in data["localities"]}
        # census/tables/four_city_profiles.csv and four_city_households.csv of the checkpoint, "2021 municipality" rows
        published = {"1000": (56479, 7233, 38858, 10388, 12.81, 18.39, 42.11), "4000": (52046, 6655, 34859, 10532, 12.79, 20.24, 42.61),
                     "5000": (107970, 15034, 73828, 19108, 13.92, 17.7, 41.21), "6000": (37991, 6634, 25945, 5412, 17.46, 14.25, 38.3)}
        for code, want in published.items():
            l = by_code[code]
            self.assertEqual((l["residents"], l["under15"], l["age15to64"], l["age65plus"], l["under15Percent"], l["age65plusPercent"], l["meanAge"]), want)
        # the same table, "2024 municipal composition" rows
        recast = {r["municipality"]: r for r in data["recast2024"]}
        composed = {"Lefkosia": (111433, 14232, 75919, 21282, 12.77, 19.1), "Larnaka": (68202, 9519, 45812, 12871, 13.96, 18.87),
                    "Lemesos": (123947, 17341, 84841, 21765, 13.99, 17.56), "Pafos": (37991, 6634, 25945, 5412, 17.46, 14.25)}
        for city, want in composed.items():
            r = recast[city]
            self.assertEqual((r["residents"], r["under15"], r["age15to64"], r["age65plus"], r["under15Percent"], r["age65plusPercent"]), want)
        # census/tables/quarter_checks.csv
        quarters = {}
        for q in data["quarters"]:
            quarters.setdefault(q["parent"], []).append(q["residents"])
        for code, (n, total) in {"1000": (19, 56479), "4000": (10, 52046), "5000": (21, 107970), "6000": (5, 37991)}.items():
            self.assertEqual((len(quarters[code]), sum(quarters[code])), (n, total))
        for l in data["localities"]:
            self.assertEqual(l["ageWithheld"], l["residents"] < AGE_FLOOR)
            if not l["ageWithheld"]:
                self.assertEqual(l["under15"] + l["age15to64"] + l["age65plus"], l["residents"])
                self.assertIsNotNone(l["meanAge"])
        for field in ("licence", "attribution", "attributionEl", "method", "methodEl", "retrievedAt", "referenceDate"):
            self.assertTrue(data[field])
        self.assertIs(data["live"], False)


if __name__ == "__main__":
    unittest.main()
