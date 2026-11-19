"""Sample the EMODnet depth grid over the sea around Cyprus: python3 fieldwork/import_seabed_grid.py

Needs the internet: it asks rest.emodnet-bathymetry.eu for one value at every point of a grid over the same box as the
3D data stack (33.3-36.8 N, 31.0-36.3 E) and writes fieldwork/seabedgrid.json, which the stack's "Seabed depth" sheet
reads through /api/fieldwork/seabedgrid. Until this has been run there is no file, and the sheet says so.

  --step 0.1     degrees between samples (0.1 is 36 x 54 = 1,944 requests; 0.05 is 71 x 107 = 7,597)
  --workers 4    requests in flight at once
  --check        validate the packaged file without contacting EMODnet

An interrupted run keeps what it fetched in fieldwork/.seabedgrid-partial.json and carries on from there next time.
No value is estimated, smoothed or filled in: a point the service has no value for is stored as null.
"""

import argparse
import concurrent.futures
import datetime
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import time
from urllib import error, parse, request


SOURCE = "https://rest.emodnet-bathymetry.eu/"
OUTPUT = Path(__file__).with_name("seabedgrid.json")
PARTIAL = Path(__file__).with_name(".seabedgrid-partial.json")
# The box of the data stack and of the server's terrain grid (server.js, B).
BOX = {"lat0": 33.3, "lat1": 36.8, "lng0": 31.0, "lng1": 36.3}
DEFAULT_STEP = 0.1
STEPS = (0.05, 0.1, 0.2, 0.25, 0.5)
ATTRIBUTION = "EMODnet Bathymetry Consortium, EMODnet Digital Terrain Model."
# Plausible limits for this box: the deepest water here is under 3,500 m, the highest ground under 4,000 m.
LOWEST, HIGHEST = -6000.0, 6000.0


def grid_spec(step=DEFAULT_STEP):
    """The grid for one step: it starts at the south-west corner of the box and never leaves the box."""
    if step not in STEPS:
        raise ValueError(f"Unsupported step {step!r}; use one of {STEPS}")
    rows = int(math.floor((BOX["lat1"] - BOX["lat0"]) / step + 1e-9)) + 1
    cols = int(math.floor((BOX["lng1"] - BOX["lng0"]) / step + 1e-9)) + 1
    return {"lat0": BOX["lat0"], "lng0": BOX["lng0"], "step": step, "rows": rows, "cols": cols,
            "order": "row by row from the south-west corner; each row runs west to east"}


def cell_lonlat(spec, row, col):
    """(longitude, latitude) of one grid point in EPSG:4326."""
    return (round(spec["lng0"] + col * spec["step"], 6), round(spec["lat0"] + row * spec["step"], 6))


def read_value(data, coordinates):
    """The signed avg of one depth_sample answer, or None when the service has no value there.

    refresh-coast.py reads the same field for the seabed profiles. An answer that is not an object, or has no avg, is
    taken as "no value here" (a point outside the model) and stored as null. A value that is not a finite number is
    an error: nothing is guessed.
    """
    if not isinstance(data, dict) or "avg" not in data:
        return None
    value = data["avg"]
    if value is None:
        return None
    if type(value) not in (float, int) or not math.isfinite(value):
        raise ValueError(f"Invalid EMODnet avg field at {coordinates}: {value!r}")
    if not LOWEST <= value <= HIGHEST:
        raise ValueError(f"Implausible EMODnet avg at {coordinates}: {value!r}")
    return value


def fetch_cell(coordinates, opener=request.urlopen, pause=time.sleep):
    lon, lat = coordinates
    query = parse.urlencode({"geom": f"POINT({lon} {lat})"})
    url = SOURCE + "depth_sample?" + query
    for attempt in range(3):
        try:
            with opener(url, timeout=25) as response:
                data = json.load(response)
            break
        except error.HTTPError as exc:
            if exc.code == 404:          # the service knows no cell at this point
                return None
            if exc.code < 500 and exc.code != 429:
                raise
            if attempt == 2:
                raise
            pause(2 ** attempt)
        except (error.URLError, TimeoutError):
            if attempt == 2:
                raise
            pause(2 ** attempt)
    return read_value(data, coordinates)


def coverage(elevation):
    values = [v for v in elevation if v is not None]
    sea = [v for v in values if v < 0]
    return {
        "cells": len(elevation),
        "withValue": len(values),
        "belowDatum": len(sea),
        "noValue": len(elevation) - len(values),
        "deepest": min(sea) if sea else None,
        "highest": max(values) if values else None,
    }


def build(spec, elevation, retrieved_at):
    return {
        "title": "Seabed depth grid around Cyprus",
        "sourceUrl": SOURCE,
        "attribution": ATTRIBUTION,
        "licence": "CC BY 4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "productUrl": "https://doi.org/10.12770/cf51df64-56f9-4a99-b1aa-36b8d7b743a1",
        "retrievedAt": retrieved_at,
        "unit": "m",
        "valueLabel": "Seabed elevation",
        "referenceType": "Static gridded terrain model",
        "datum": "The DTM documents Lowest Astronomical Tide (LAT). The REST response does not identify the datum or edition for the individual cell.",
        "method": "One value for every point of a regular grid over the box: the signed avg from depth_sample at that point. Negative elevations are below the reference datum (sea floor). Zero or positive is not sea floor. Null means the service reported no value. No value was estimated, smoothed or filled in.",
        "limitations": "Grid estimates can be interpolated from neighbouring cells or compiled from older surveys. The retrieval date is separate from the survey date. The grid is far coarser than the model it samples. This is an educational picture, unsuitable for navigation.",
        "box": dict(BOX),
        "grid": spec,
        "elevation": elevation,
        "coverage": coverage(elevation),
    }


def validate(snapshot):
    if snapshot.get("testOnly"):
        raise ValueError("This is a test fixture, not an EMODnet extract")
    if snapshot.get("sourceUrl") != SOURCE or snapshot.get("unit") != "m" or snapshot.get("attribution") != ATTRIBUTION:
        raise ValueError("Snapshot source, attribution or unit is invalid")
    if not snapshot.get("retrievedAt") or snapshot.get("licence") != "CC BY 4.0":
        raise ValueError("Missing retrieval timestamp or licence")
    spec = snapshot.get("grid") or {}
    if spec != grid_spec(spec.get("step")) or snapshot.get("box") != BOX:
        raise ValueError("The grid does not match the box of the data stack")
    elevation = snapshot.get("elevation")
    if not isinstance(elevation, list) or len(elevation) != spec["rows"] * spec["cols"]:
        raise ValueError("The grid and the list of values do not have the same size")
    for value in elevation:
        if value is None:
            continue
        if type(value) not in (float, int) or not math.isfinite(value) or not LOWEST <= value <= HIGHEST:
            raise ValueError(f"Invalid elevation in the grid: {value!r}")
    if snapshot.get("coverage") != coverage(elevation):
        raise ValueError("The coverage counts do not match the values")
    if not snapshot["coverage"]["belowDatum"]:
        raise ValueError("No sea floor value in the grid")


def write(snapshot, output=OUTPUT):
    # An interrupted write must preserve the last complete snapshot.
    tmp = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output.parent,
                                         prefix=".seabedgrid-", suffix=".json", delete=False) as handle:
            tmp = Path(handle.name)
            json.dump(snapshot, handle, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            handle.write("\n")
        os.chmod(tmp, 0o644)
        tmp.replace(output)
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


def collect(spec, fetch=fetch_cell, workers=4, partial=None, report=None):
    """Every value of the grid, in grid order. `partial` is a file that keeps finished cells between runs."""
    cells = [cell_lonlat(spec, r, c) for r in range(spec["rows"]) for c in range(spec["cols"])]
    done = {}
    if partial is not None and partial.exists():
        saved = json.loads(partial.read_text(encoding="utf-8"))
        if saved.get("grid") == spec:
            done = saved.get("values", {})
    key = lambda cell: f"{cell[0]},{cell[1]}"
    todo = [cell for cell in cells if key(cell) not in done]

    def save():
        if partial is not None:
            partial.write_text(json.dumps({"grid": spec, "values": done}), encoding="utf-8")

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for count, (cell, value) in enumerate(zip(todo, pool.map(fetch, todo)), start=1):
            done[key(cell)] = value
            if count % 200 == 0:
                save()
                if report:
                    report(len(done), len(cells))
    save()
    return [done[key(cell)] for cell in cells]


def refresh(step=DEFAULT_STEP, workers=4, output=OUTPUT, partial=PARTIAL, fetch=fetch_cell, report=None):
    spec = grid_spec(step)
    elevation = collect(spec, fetch=fetch, workers=workers, partial=partial, report=report)
    snapshot = build(spec, elevation, datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    validate(snapshot)
    write(snapshot, output)
    if partial is not None:
        partial.unlink(missing_ok=True)
    return snapshot


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="validate without contacting EMODnet")
    parser.add_argument("--step", type=float, default=DEFAULT_STEP, choices=STEPS, help="degrees between samples")
    parser.add_argument("--workers", type=int, default=4, choices=range(1, 9), help="requests in flight at once")
    args = parser.parse_args()
    if args.check:
        if not OUTPUT.exists():
            sys.exit("fieldwork/seabedgrid.json does not exist yet: run this script without --check on a machine with internet.")
        validate(json.loads(OUTPUT.read_text(encoding="utf-8")))
        print("fieldwork/seabedgrid.json is a valid EMODnet depth grid.")
    else:
        made = refresh(args.step, args.workers, report=lambda n, total: print(f"{n} of {total} points", flush=True))
        print(f"Wrote {OUTPUT.name}: {made['coverage']['belowDatum']} sea-floor values, deepest {made['coverage']['deepest']} m.")
