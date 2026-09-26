"""Whether the paper of a dated red roll is ruled, and what colour it reads.

    python3 paper.py [--druids a,b] [--workers 6]

Some red rolls are ruled: thin dark lines run along the paper, one to every
track, at the track spacing. Stanford's catalogue says so of some copies,
„Lined paper“ or „Ruled paper“, but not of all it holds, so the ruling is
read off the scan instead.

Each roll is looked at on its tail, the blank paper after the last hole,
which has no perforation to confuse with a line: a strip 2400 pixels long,
fetched at half resolution across the full width of the paper. The median
of every column over the strip, holes and their rims left out, is the
profile across the roll. A ruling is a comb in that profile at the track
spacing, 37.76 pixels at full resolution, so its strength is the power of
the profile at that period against the median power of the periods around
it. The paper's colour is the median of the pixels between the lines, as
the scanner gives them; a roll whose tail is shorter than 800 pixels is
measured on a strip from its middle instead.

Writes paper.json beside this script and prints the dated copies by year,
ruled or plain.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "cache" / "paper"
OUT = HERE / "paper.json"

IIIF = "https://stacks.stanford.edu/image/iiif/{d}%2F{d}_0001/{x},{y},{w},{h}/{s},/0/default.png"
TRACK = 37.76      # track spacing at full resolution, px; HOLE_SEPARATION runs 37.57 to 37.92 on the dated rolls
SCALE = 2
STRIP = 2400
MARGIN = 150       # kept clear of the last hole and of the end of the scan
INSET = 40         # kept clear of the paper's edges
LIT = 150          # brighter than this is a hole or the light behind the paper
RULED = 100.0      # a comb this many times stronger than its surroundings is a ruling

session = requests.Session()


def strip(druid: str, x0: int, x1: int, y: int, h: int) -> np.ndarray:
    """A strip of the scan at half resolution, fetched once."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{druid}_{y}_{h}.png"
    if not path.exists():
        url = IIIF.format(d=druid, x=x0, y=y, w=x1 - x0, h=h, s=(x1 - x0) // SCALE)
        response = session.get(url, timeout=180)
        response.raise_for_status()
        path.write_bytes(response.content)
    return np.asarray(Image.open(path).convert("RGB")).astype(float)


def ruling(image: np.ndarray) -> dict:
    """The comb at the track spacing, its period, and the colour between the lines."""
    grey = image.mean(2)
    paper = ~ndi.binary_dilation(grey >= LIT, iterations=4)
    profile = np.array([
        np.median(grey[paper[:, j], j]) if paper[:, j].sum() > 20 else np.nan
        for j in range(grey.shape[1])
    ])
    profile = np.where(np.isnan(profile), np.nanmedian(profile), profile)
    detail = (profile - np.convolve(profile, np.ones(31) / 31, mode="same"))[20:-20]

    power = np.abs(np.fft.rfft(detail * np.hanning(len(detail)))) ** 2
    frequency = np.fft.rfftfreq(len(detail))
    target = SCALE / TRACK
    band = np.abs(frequency - target) < 0.04 * target
    around = (np.abs(frequency - target) < 0.3 * target) & ~band
    peak = int(np.flatnonzero(band)[np.argmax(power[band])])

    lines = detail < -detail.std()
    between = image[:, 20:-20][:, ~lines][paper[:, 20:-20][:, ~lines]]
    on = image[:, 20:-20][:, lines][paper[:, 20:-20][:, lines]]
    return {
        "strength": round(float(power[peak] / np.median(power[around])), 1),
        "period": round(float(SCALE / frequency[peak]), 2),
        "ground": [int(v) for v in np.median(between, axis=0)],
        "lines": [int(v) for v in np.median(on, axis=0)] if len(on) else None,
    }


def measured(row: dict, geometry: dict) -> dict:
    druid = row["druid"]
    x0, x1 = geometry["paper_columns"]
    tail, end = geometry["last_hole"] + MARGIN, geometry["image_length"] - MARGIN
    if end - tail > 800:
        where, y, h = "tail", tail, min(STRIP, end - tail)
    else:
        where, y, h = "middle", geometry["image_length"] // 2, STRIP
    found = ruling(strip(druid, x0 + INSET, x1 - INSET, y, h))
    return {
        "druid": druid, "welte": row["welte"], "punched": row["punched"], "where": where,
        **found, "ruled": found["strength"] >= RULED,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--druids")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    geometry = {c["druid"]: c for c in json.loads((HERE / "candidates.json").read_text())}
    dated = list(csv.DictReader(open(HERE / "measures_by_year.csv")))
    if args.druids:
        dated = [row for row in dated if row["druid"] in args.druids.split(",")]

    def one(row: dict) -> dict:
        try:
            return measured(row, geometry[row["druid"]])
        except Exception as error:
            return {"druid": row["druid"], "punched": row["punched"], "error": "%s: %s" % (type(error).__name__, error)}

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(one, dated))
    OUT.write_text(json.dumps(rows, indent=1) + "\n")

    by_year: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        if "error" not in row:
            by_year[row["punched"][:4]].append(row)
    print("Dated red rolls, ruled or plain paper, by the year they were punched.\n")
    print("  year   ruled  plain")
    for year in sorted(by_year):
        ruled = sum(r["ruled"] for r in by_year[year])
        print("  %s  %5d  %5d" % (year, ruled, len(by_year[year]) - ruled))
    ruled = sorted(r["punched"] for r in rows if r.get("ruled"))
    if ruled:
        print("\n  ruled from %s to %s, %d copies" % (ruled[0], ruled[-1], len(ruled)))
    failed = [r["druid"] for r in rows if "error" in r]
    if failed:
        print("  not measured: %s" % ", ".join(failed))


if __name__ == "__main__":
    main()
