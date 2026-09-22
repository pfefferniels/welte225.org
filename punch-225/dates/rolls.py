"""The red Welte rolls of the SUPRA archive, with the geometry a date needs.

A punch date is written on the paper after the music stops, so finding one
needs only two numbers per roll: where the last perforation is and how long
the scan is. The SUPRA index carries both for 433 of the 456 rolls; the rest
are read from the published analysis of the same scan.

What the index does not carry, and what must not be taken from Stanford's
catalogue, is a date. Several records quote Peter Phillips's inventory, which
describes Phillips's copy of a title and not the roll Stanford scanned, and a
title was re-punched over many years. Only Condon's notes are kept here, and
only as something to check a reading against.
"""

from __future__ import annotations

import bz2
import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "cache"

INDEX = "https://raw.githubusercontent.com/pianoroll/SUPRA/master/index.aton"
ANALYSES = "https://raw.githubusercontent.com/pianoroll/piano-roll-analyses/main/analysis"
PURL = "https://purl.stanford.edu"

session = requests.Session()


def fetched(name: str, url: str) -> bytes:
    """A file kept in the cache, downloaded once."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        response = session.get(url, timeout=180)
        response.raise_for_status()
        path.write_bytes(response.content)
    return path.read_bytes()


def _fields(text: str) -> dict[str, str]:
    return dict(re.findall(r"^@([A-Z_0-9]+):\s*(.*?)\s*$", text, re.M))


def _px(field_value: str) -> int:
    return int(round(float(field_value.rstrip("px"))))


@dataclass(frozen=True)
class Roll:
    """One scanned copy, as the archive describes it."""

    druid: str
    welte: int | None
    callnum: str
    label: str
    title: str
    performer: str
    width: int
    length: int
    first_hole: int
    last_hole: int
    margin_bass: int
    margin_treble: int
    notes: tuple[str, ...] = field(default=())

    @property
    def end_margin(self) -> int:
        return self.length - self.last_hole

    @property
    def paper(self) -> tuple[int, int]:
        """The columns the paper may reach, at its widest along the roll."""
        return self.margin_bass, self.width - self.margin_treble

    @property
    def condon(self) -> tuple[str, ...]:
        """Condon's own notes, which describe the roll he owned and Stanford scanned."""
        return tuple(note for note in self.notes if "condon" in note.lower())

    @property
    def phillips(self) -> tuple[str, ...]:
        """Dates belonging to another copy of the title. Never data, kept to be visible."""
        return tuple(note for note in self.notes if "phillips" in note.lower())


def _geometry(fields: dict[str, str]) -> dict | None:
    try:
        return {
            "width": _px(fields["IMAGE_WIDTH"]),
            "length": _px(fields["IMAGE_LENGTH"]),
            "first_hole": _px(fields["FIRST_HOLE"]),
            "last_hole": _px(fields["LAST_HOLE"]),
            "margin_bass": _px(fields["HARD_MARGIN_BASS"]),
            "margin_treble": _px(fields["HARD_MARGIN_TREBLE"]),
        }
    except (KeyError, ValueError):
        return None


def _analysis_geometry(druid: str) -> dict | None:
    """The same fields from the published analysis, for the partial index entries."""
    packed = fetched(f"{druid}_analysis.txt.bz2", f"{ANALYSES}/{druid[0]}/{druid}_analysis.txt.bz2")
    head = bz2.decompress(packed)[:8192].decode("utf-8", errors="replace")
    return _geometry(_fields(head))


def _catalogue_notes(druid: str) -> tuple[str, ...]:
    """The record's notes, cached, so a reading can be checked against Condon's."""
    name = f"{druid}_purl.json"
    try:
        record = json.loads(fetched(name, f"{PURL}/{druid}.json"))
    except Exception:
        return ()
    description = record.get("description", {})
    return tuple(
        note.get("value", "")
        for note in description.get("note", [])
        if note.get("value")
    )


def index_entries() -> list[dict[str, str]]:
    text = fetched("supra_index.aton", INDEX).decode("utf-8", errors="replace")
    return [_fields(block) for block in text.split("@@BEGIN: ROLL")[1:]]


def corpus(with_notes: bool = True, workers: int = 12) -> list[Roll]:
    """Every red roll of the index, geometry filled in from the analyses."""
    entries = [entry for entry in index_entries() if entry.get("ROLL_TYPE") == "welte-red"]

    def build(entry: dict[str, str]) -> Roll | None:
        druid = entry["DRUID"]
        geometry = _geometry(entry) or _analysis_geometry(druid)
        if geometry is None:
            return None
        number = re.search(r"Welte-Mignon\s+(\d+)", entry.get("LABEL", ""))
        return Roll(
            druid=druid,
            welte=int(number.group(1)) if number else None,
            callnum=entry.get("CALLNUM", ""),
            label=entry.get("LABEL", ""),
            title=entry.get("TITLE", ""),
            performer=entry.get("PERFORMER", ""),
            notes=_catalogue_notes(druid) if with_notes else (),
            **geometry,
        )

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return [roll for roll in pool.map(build, entries) if roll is not None]


if __name__ == "__main__":
    found = corpus()
    print("%d red rolls, %d with a Condon note, %d quoting Phillips" % (
        len(found),
        sum(1 for roll in found if roll.condon),
        sum(1 for roll in found if roll.phillips),
    ))
    margins = sorted(roll.end_margin for roll in found)
    print("end margin: min %d median %d max %d, %d shorter than 2000 px" % (
        margins[0], margins[len(margins) // 2], margins[-1],
        sum(1 for m in margins if m < 2000)))
