"""The pitch of every red Welte roll at Stanford, measured on the scan itself.

    python3 pitch.py [--notes 60] [--rolls 3] [--limit N]

AVG_HOLE_WIDTH, which ../corpus.py uses to show the punch bimodal, is an
average over every perforation the parser kept, so a tear, a run of dust or a
bad edge drags it. That is the likeliest reason thirteen rolls sit in the
valley between the two modes. The pitch does not have that weakness: it is
the distance from one slot of a held note to the next, a blur moves the two
edges of a slot outward and the two edges of a bridge inward by the same
amount, and their sum survives it.

It is also a better question to ask of this corpus. The dated copies put the
change between 26 January and 27 April 1914, and across it the pitch steps
from 3.00 to 2.50 mm with nothing between. Measured on all of them, the
distribution answers three things at once: whether the valley rolls are
spoiled averages or a third state of the machine, whether the two pitches
are two tight spikes or two clusters with tails, which bears on whether two
perforators ran side by side, and what every roll's state is without a
threshold having to be chosen.

Writes pitch.json beside this script, and prints the distribution.
"""

from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import corpus                                             # noqa: E402
import images                                             # noqa: E402
from holes import alone, aton, chain_spans, rollinfo, spread   # noqa: E402

from rolls import corpus as roll_corpus                   # noqa: E402

OUT = HERE / "pitch.json"
NOTES = 60
HELD = (200, 1200)


def measured(druid: str, notes: int, workers: int) -> dict:
    """Median slot, bridge and pitch of one roll, in millimetres."""
    path = corpus.analysis_of(druid)
    try:
        holes = aton(path)
        info = rollinfo(path)
    finally:
        path.unlink(missing_ok=True)      # the .bz2 stays; 4.5 MB a roll does not

    held = spread(
        [h for h in alone(chain_spans(holes)) if HELD[0] <= h.length <= HELD[1]],
        notes,
    )
    found = images.gather(images.chained, druid, held, workers=workers)
    slots = [s for note in found for s in note.slots[1:-1]]
    bridges = [b for note in found for b in note.bridges[1:-1]]
    pitches = [p for note in found for p in note.pitches[1:-1]]
    if len(pitches) < 12:
        return {"druid": druid, "n": len(pitches), "pitch": None}

    return {
        "druid": druid,
        "n": len(pitches),
        "slot": round(corpus.mm(st.median(slots)), 4),
        "bridge": round(corpus.mm(st.median(bridges)), 4),
        "pitch": round(corpus.mm(st.median(pitches)), 4),
        "teilung": round(corpus.mm(float(info["HOLE_SEPARATION"])), 4),
        "avg_hole_width": round(corpus.mm(float(info["AVG_HOLE_WIDTH"].rstrip("px"))), 4),
    }


def histogram(rows: list[dict], step: float = 0.05) -> str:
    kept = [row["pitch"] for row in rows if row.get("pitch")]
    if not kept:
        return "no pitch measured"
    counted: dict[float, int] = {}
    for value in kept:
        counted[round(value / step) * step] = counted.get(round(value / step) * step, 0) + 1
    top = max(counted.values())
    lines = ["", "Pitch of %d red Welte rolls, mm, measured on the scans." % len(kept), ""]
    lines += [
        "  %.2f  %-50s %d" % (level, "#" * max(1, round(50 * counted[level] / top)), counted[level])
        for level in sorted(counted)
    ]
    between = [v for v in kept if 2.65 <= v <= 2.85]
    lines += [
        "",
        "  %d rolls between 2.65 and 2.85 mm, where a third state would sit." % len(between),
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--notes", type=int, default=NOTES)
    parser.add_argument("--rolls", type=int, default=3, help="rolls measured at once")
    parser.add_argument("--workers", type=int, default=6, help="requests at once within a roll")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--druids")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    found = roll_corpus(with_notes=False)
    if args.druids:
        wanted = set(args.druids.split(","))
        found = [roll for roll in found if roll.druid in wanted]
    found.sort(key=lambda roll: (roll.welte is None, roll.welte, roll.druid))
    if args.limit:
        found = found[:args.limit]

    done: dict[str, dict] = {}
    if args.out.exists():
        done = {row["druid"]: row for row in json.loads(args.out.read_text())}

    todo = [roll.druid for roll in found if roll.druid not in done]

    def one(druid: str) -> dict:
        try:
            return measured(druid, args.notes, args.workers)
        except Exception as error:
            return {"druid": druid, "pitch": None, "error": "%s: %s" % (type(error).__name__, error)}

    with ThreadPoolExecutor(max_workers=args.rolls) as pool:
        for row in pool.map(one, todo):
            done[row["druid"]] = row
            args.out.write_text(json.dumps(list(done.values()), indent=1) + "\n")

    rows = [done[roll.druid] for roll in found if roll.druid in done]
    print("%d rolls, %d with a pitch" % (len(rows), sum(1 for r in rows if r.get("pitch"))))
    print(histogram(rows))


if __name__ == "__main__":
    main()
