"""The perforator's advance on every red Welte roll, from the analyses alone.

    python3 step.py [--rolls 6]

The punch and the pitch turn out to name which of two perforators cut a copy
rather than when it was cut: both were in service from 1911 to 1922. The
advance is the one quantity left that behaves differently. Roll 225's copies
of January 1909 and January 1914 are both 3.00 mm rolls, cut by the same
machine as far as the pitch can tell, and the first advances 1.01 mm while
the second advances 0.50 mm. So there the advance changed while the machine
did not, which is the opposite of what the punch does.

Whether that holds across the archive is what this asks. It needs no images:
the slot lengths are in the published analysis, and ../advance.py folds them
onto a trial period. Cheap enough to run on everything.

Writes step.json beside this script.
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import corpus                                  # noqa: E402
from advance import gaps, peaks                # noqa: E402
from holes import aton                         # noqa: E402

from rolls import corpus as roll_corpus        # noqa: E402

OUT = HERE / "step.json"


def advance_of(druid: str) -> dict:
    """The strongest period the slot lengths keep, and the runners-up."""
    path = corpus.analysis_of(druid)
    try:
        holes = aton(path)
    finally:
        path.unlink(missing_ok=True)

    lengths = [corpus.mm(hole.length) for hole in holes]
    if len(lengths) < 500:
        return {"druid": druid, "advance": None, "n": len(lengths)}

    found = peaks(gaps(lengths))
    if not found:
        return {"druid": druid, "advance": None, "n": len(lengths)}

    best = max(found, key=lambda item: item[1])
    return {
        "druid": druid,
        "n": len(lengths),
        "advance": round(best[0], 4),
        "strength": round(best[1], 4),
        "others": [[round(p, 4), round(r, 4)] for p, r in found[:3]],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rolls", type=int, default=6)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    found = roll_corpus(with_notes=False)
    found.sort(key=lambda roll: (roll.welte is None, roll.welte, roll.druid))
    if args.limit:
        found = found[:args.limit]

    done: dict[str, dict] = {}
    if args.out.exists():
        done = {row["druid"]: row for row in json.loads(args.out.read_text())}
    todo = [roll.druid for roll in found if roll.druid not in done]

    def one(druid: str) -> dict:
        try:
            return advance_of(druid)
        except Exception as error:
            return {"druid": druid, "advance": None,
                    "error": "%s: %s" % (type(error).__name__, error)}

    with ThreadPoolExecutor(max_workers=args.rolls) as pool:
        for row in pool.map(one, todo):
            done[row["druid"]] = row
            args.out.write_text(json.dumps(list(done.values()), indent=1) + "\n")

    kept = [row["advance"] for row in done.values() if row.get("advance")]
    counted: dict[float, int] = {}
    for value in kept:
        counted[round(value / 0.05) * 0.05] = counted.get(round(value / 0.05) * 0.05, 0) + 1
    print("%d rolls, %d with an advance" % (len(done), len(kept)))
    top = max(counted.values()) if counted else 1
    for level in sorted(counted):
        print("  %.2f mm  %-46s %d" % (level, "#" * max(1, round(46 * counted[level] / top)), counted[level]))


if __name__ == "__main__":
    main()
