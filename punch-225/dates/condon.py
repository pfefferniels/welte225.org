"""What was read off each roll, as condon-dates records it.

The search here finds where on a scan a date may be written; what a reader
then made of it, the inscription, the date, its confidence and the hand, is
kept in condon-dates and corrected there alone. This lays each roll's reading
over its record in candidates.json, under the names the scripts here use.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANDIDATES = HERE / "candidates.json"
READINGS = Path("/Users/nielspfeffer/Projects/condon-dates/data/readings.json")

UNREAD = {
    "inscription": None,
    "reading": None,
    "date_iso": None,
    "confidence": "none",
    "roll_number": None,
    "hand": None,
    "crop": None,
    "read_notes": None,
}


def readings() -> dict[str, dict]:
    """Each roll's reading keyed by druid, its notes renamed so they do not shadow the search's."""
    return {
        druid: {("read_notes" if key == "notes" else key): value for key, value in entry.items()}
        for druid, entry in json.loads(READINGS.read_text()).items()
    }


def records() -> list[dict]:
    """The rolls of candidates.json, each with its reading from condon-dates."""
    found = readings()
    return [
        {**record, **UNREAD, **found.get(record["druid"], {})}
        for record in json.loads(CANDIDATES.read_text())
    ]
