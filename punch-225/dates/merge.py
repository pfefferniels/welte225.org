"""How the readers' files in readings/ rank into one reading per roll.

The readings are kept in condon-dates, in data/readings.json, and corrected
there. That file names, as each roll's `source`, the file in readings/ whose
reading won under the rule below; the files themselves stay as they were read.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
READINGS = HERE / "readings"

CONFIDENCE = ("high", "medium", "low", "none")


RANK = {"reviewed.json": 0, "authoritative.json": 1}
BATCH = 2


def readings() -> dict[str, dict]:
    """One entry per roll, the best-placed reader of it winning.

    Three ranks, and the rank decides before the confidence does.
    reviewed.json is the editor's own verdicts from the artifact.
    authoritative.json holds rolls read again here, at magnification, mostly
    where two readers disagreed or a crop had clipped the line. The batch and
    edge files are the readers'.

    Rank has to beat confidence rather than the other way round. A second,
    closer look often ends less certain than the first — it is what finds
    that a figure is cut rather than merely faint — and a reading withdrawn
    for good reason must not be overridden by the confident one it corrects.

    Among the readers' own files, which share a rank, a reading that found a
    date beats one that found none, and only then does confidence decide. A
    reader who saw nothing has not contradicted one who saw something; the
    deliberate withdrawals all sit in authoritative.json, which outranks
    both.
    """
    best: dict[str, tuple[tuple[int, int, int], dict]] = {}
    for path in sorted(READINGS.glob("*.json"), key=lambda p: (RANK.get(p.name, BATCH), p.name)):
        rank = RANK.get(path.name, BATCH)
        for entry in json.loads(path.read_text()):
            druid = entry.get("druid")
            if not druid:
                continue
            order = (rank,
                     0 if entry.get("date_iso") else 1,
                     CONFIDENCE.index(entry.get("confidence", "none")))
            kept = best.get(druid)
            if kept is None or order < kept[0]:
                best[druid] = (order, entry | {"source": path.name})
    return {druid: entry for druid, (_, entry) in best.items()}


if __name__ == "__main__":
    raise SystemExit("the readings are kept in condon-dates/data/readings.json; correct a reading there")
