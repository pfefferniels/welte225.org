"""The rolls of one batch that no reader has recorded yet.

    python3 remaining.py 06

The network on this machine drops often enough that readers are killed
part-way through a batch. They save after every roll, so a replacement should
start from what is on disk rather than from the beginning.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BATCHES = HERE / "readings" / "batches"


def remaining(batch: str) -> list[str]:
    listed = [
        line.split()[0]
        for line in (BATCHES / ("batch-%s.txt" % batch)).read_text().splitlines()
        if line.strip()
    ]
    done = HERE / "readings" / ("batch-%s.json" % batch)
    already = set()
    if done.exists():
        already = {
            entry["druid"]
            for entry in json.loads(done.read_text())
            if entry.get("druid")
        }
    return [druid for druid in listed if druid not in already]


def main() -> None:
    batch = sys.argv[1].zfill(2)
    crops = HERE.parent / "cache" / "crops"
    todo = remaining(batch)
    for druid in todo:
        print("%s  %d crops" % (druid, len(list(crops.glob("%s_*.jpg" % druid)))))
    print("# %d rolls left in batch-%s" % (len(todo), batch))


if __name__ == "__main__":
    main()
