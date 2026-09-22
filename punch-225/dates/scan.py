"""Candidate regions for the punch date of every red Welte roll at Stanford.

    python3 scan.py [--limit N] [--druids a,b,c] [--whole]

Writes candidates.json beside this script: one record per roll, with the
patches of ink its scan holds, each as an IIIF region a reader can be pointed
at. The end of the roll is searched first, because that is where both dated
copies of roll 225 carry their date; with --whole the rest of the scan is
searched too, which turns up the printed label and the colour target on the
leader and, now and then, an inscription nobody would have looked for.

Nothing here reads anything. What readers make of these regions is kept in
condon-dates, which records the box each reading was made from, so rerunning
the search cannot throw a reading away.
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import ink
from rolls import Roll, corpus

HERE = Path(__file__).resolve().parent
OUT = HERE / "candidates.json"
ELSEWHERE = 3


def where(blob: ink.Blob, roll: Roll) -> str:
    left, right = roll.paper
    side = "treble" if blob.x + blob.w / 2 > (left + right) / 2 else "bass"
    edge = right - (blob.x + blob.w) if side == "treble" else blob.x - left
    if blob.y + blob.h <= roll.first_hole:
        place = "on the leader, before the first hole"
    elif blob.y >= roll.last_hole:
        place = "%d px after LAST_HOLE" % (blob.y - roll.last_hole)
    else:
        place = "in the music, %d px before LAST_HOLE" % (roll.last_hole - blob.y)
    return "%d ink px, %s side, %d px inside the paper edge, %s%s%s" % (
        blob.ink, side, edge, place,
        ", broad and solid, likely a stain or print" if blob.solid > 0.15 else "",
        ", its columns dark down %.0f%% of the strip" % (100 * blob.spread) if blob.spread > 0.3 else "",
    )


def region(blob: ink.Blob, roll: Roll) -> dict:
    x, y, w, h = ink.padded(blob, roll)
    return {
        "x": x, "y": y, "w": w, "h": h,
        "iiif_url": ink.url(roll.druid, x, y, w, h),
        "why": where(blob, roll),
        "ink": blob.ink,
        "peak": round(blob.peak, 1),
        "spread": round(blob.spread, 3),
        "solid": round(blob.solid, 3),
        "score": round(ink.score(blob, roll)),
        "after_last_hole": blob.y - roll.last_hole,
    }


def _overlaps(blob: ink.Blob, start: int, stop: int) -> bool:
    return blob.y < stop and blob.y + blob.h > start


def record(roll: Roll, whole: bool, keep: int) -> dict:
    start, stop = ink.end_window(roll)
    notes = []
    try:
        at_end = ink.search(roll, start, stop) if stop - start >= 200 else []
        elsewhere = [
            blob for blob in (ink.search(roll, 0, start) if whole and start > 0 else [])
            if not _overlaps(blob, start, stop)
        ]
        searched = "searched y %d-%d" % (0 if whole else start, stop)
    except Exception as error:
        at_end, elsewhere, searched = [], [], "search failed"
        notes.append("search failed, %s: %s" % (type(error).__name__, error))

    # The end of the roll is where a date belongs, so it keeps its own places
    # in the list and is not crowded out by the stains further back.
    blobs = at_end[:keep] + elsewhere[:ELSEWHERE]
    notes.append("%s of %d, %d patches of ink at the end, %d elsewhere" % (
        searched, roll.length, len(at_end), len(elsewhere)))
    if roll.end_margin < 2000:
        notes.append("end margin is only %d px" % roll.end_margin)
    notes += ["Condon on the leader: %s" % note for note in roll.condon]
    if roll.phillips:
        notes.append("record also quotes Phillips's inventory, which dates another copy — not used")

    return {
        "druid": roll.druid,
        "welte_number": roll.welte,
        "callnum": roll.callnum,
        "label": roll.label,
        "title": roll.title,
        "performer": roll.performer,
        "first_hole": roll.first_hole,
        "last_hole": roll.last_hole,
        "image_length": roll.length,
        "paper_columns": list(roll.paper),
        "regions": [region(blob, roll) for blob in blobs],
        "notes": " | ".join(notes),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int)
    parser.add_argument("--druids")
    parser.add_argument("--whole", action="store_true", help="search the whole scan, not just its end")
    parser.add_argument("--keep", type=int, default=5)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    found = corpus()
    if args.druids:
        wanted = set(args.druids.split(","))
        found = [roll for roll in found if roll.druid in wanted]
    found.sort(key=lambda roll: (roll.welte is None, roll.welte, roll.druid))
    if args.limit:
        found = found[:args.limit]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        records = list(pool.map(lambda roll: record(roll, args.whole, args.keep), found))

    args.out.write_text(json.dumps(records, indent=1, ensure_ascii=False) + "\n")

    with_ink = sum(1 for r in records if r["regions"])
    print("%d rolls, %d with at least one candidate region, %d with none" % (
        len(records), with_ink, len(records) - with_ink))
    print("wrote %s" % args.out)


if __name__ == "__main__":
    main()
