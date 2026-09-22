"""Split the crops into batches, one per reader.

    python3 batches.py [--size 14] [--only-unread]

Prints one line per batch: the batch's name and the rolls in it, each with
the number of crops it has. The work is handed out by roll rather than by
crop, because a reader that has found the date in the first crop of a roll
has no reason to open the others.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from crops import CROPS
from scan import OUT

READINGS = Path(__file__).resolve().parent / "readings"


def unread() -> set[str]:
    READINGS.mkdir(exist_ok=True)
    return {
        entry["druid"]
        for path in READINGS.glob("*.json")
        for entry in json.loads(path.read_text())
        if entry.get("druid")
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=14)
    parser.add_argument("--only-unread", action="store_true")
    parser.add_argument("--file", type=Path, default=OUT)
    args = parser.parse_args()

    records = json.loads(args.file.read_text())
    done = unread() if args.only_unread else set()
    todo = [
        (record["druid"], sum(1 for _ in CROPS.glob("%s_*.jpg" % record["druid"])))
        for record in records
        if record["druid"] not in done
    ]
    todo = [(druid, n) for druid, n in todo if n]

    for start in range(0, len(todo), args.size):
        batch = todo[start:start + args.size]
        print("batch-%02d  %s" % (
            start // args.size + 1,
            " ".join("%s:%d" % pair for pair in batch),
        ))
    print("# %d rolls with crops, %d batches of %d" % (
        len(todo), -(-len(todo) // args.size), args.size))


if __name__ == "__main__":
    main()
