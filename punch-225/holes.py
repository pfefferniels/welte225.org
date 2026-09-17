"""The perforations of a copy, from whichever reading of it exists.

Three of the copies were parsed by roll-image-parser and leave an ATON
analysis with a box around every slot. The two Stanford copies are in the
edition with a IIIF region per held note, and the region is that same box:
its width is the parser's WIDTH_COL and its height the note's span, so the
boxes can be recovered from the edition without the analysis file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

FIELD = re.compile(r"^@([A-Z_]+):\s*(.*?)(?:px|ppm|ppi|deg|sec)?\s*$")
REGION = re.compile(r"/(\d+),(\d+),(\d+),(\d+)/")


@dataclass(frozen=True)
class Hole:
    """One slot in the paper, as the reading bounded it."""

    row: int
    col: int
    length: int
    width: int
    track: int | None = None
    circularity: float | None = None


def _fields(lines: list[str]) -> dict[str, str]:
    found = {}
    for line in lines:
        match = FIELD.match(line)
        if match:
            found[match.group(1)] = match.group(2).strip()
    return found


def rollinfo(path: Path) -> dict[str, str]:
    """The analysis file's header, up to the first hole."""
    head = []
    with path.open() as handle:
        for line in handle:
            if line.startswith("@@BEGIN: HOLES"):
                break
            head.append(line.rstrip("\n"))
    return _fields(head)


def aton(path: Path) -> list[Hole]:
    """Every slot the parser kept, in the order it read them."""
    holes: list[Hole] = []
    block: list[str] = []
    inside = False

    with path.open() as handle:
        for line in handle:
            line = line.rstrip("\n")
            if line == "@@BEGIN: HOLE":
                inside, block = True, []
            elif line == "@@END: HOLE":
                if inside:
                    holes.append(_hole(_fields(block)))
                inside = False
            elif inside:
                block.append(line)
            elif line.startswith(("@@BEGIN: BADHOLES", "@@BEGIN: DRIFT")):
                break
    return holes


def _hole(found: dict[str, str]) -> Hole:
    circularity = found.get("CIRCULARITY")
    return Hole(
        row=int(float(found["ORIGIN_ROW"])),
        col=int(float(found["ORIGIN_COL"])),
        length=int(float(found["WIDTH_ROW"])),
        width=int(float(found["WIDTH_COL"])),
        track=int(float(found["TRACKER_HOLE"])) if "TRACKER_HOLE" in found else None,
        circularity=float(circularity) if circularity else None,
    )


def from_edition(copy: dict) -> list[Hole]:
    """The boxes the edition keeps in its IIIF depictions."""
    holes = []
    for feature in copy.get("production", {}).get("produced", []):
        match = REGION.search(feature.get("depiction", ""))
        if match:
            col, row, width, length = (int(group) for group in match.groups())
            holes.append(Hole(row=row, col=col, length=length, width=width))
    return holes


def chain_spans(holes: list[Hole], reach: int = 30) -> list[Hole]:
    """One box per held note, spanning the run of slots that make it up.

    The edition keeps such a box for the two copies it holds, because the
    parser's note grouping made it. For any other Stanford roll it has to be
    rebuilt from the slots, which is what this does, so that a strip down the
    middle of a note can be cut for a roll the edition does not carry.
    """
    from collections import defaultdict

    by_track: dict[int | None, list[Hole]] = defaultdict(list)
    for hole in holes:
        by_track[hole.track].append(hole)

    spans = []
    for group in by_track.values():
        group.sort(key=lambda hole: hole.row)
        run = [group[0]]
        for previous, hole in zip(group, group[1:]):
            if 0 <= hole.row - (previous.row + previous.length) <= reach:
                run.append(hole)
            else:
                spans.append(_span(run))
                run = [hole]
        spans.append(_span(run))
    return spans


def _span(run: list[Hole]) -> Hole:
    last = run[-1]
    return Hole(
        row=run[0].row,
        col=run[0].col,
        length=last.row + last.length - run[0].row,
        width=run[0].width,
        track=run[0].track,
    )


def alone(holes: list[Hole], gap: int = 46) -> list[Hole]:
    """Slots with paper on both sides, so a crop holds one perforation only."""
    spans = [(hole.row, hole.row + hole.length, hole.col, hole) for hole in holes]
    return [
        hole
        for hole in holes
        if not any(
            other is not hole
            and top < hole.row + hole.length
            and hole.row < bottom
            and abs(col - hole.col) < gap
            for top, bottom, col, other in spans
        )
    ]


def spread(holes: list[Hole], count: int) -> list[Hole]:
    """An even sample along the roll, so no one stretch of paper dominates."""
    if len(holes) <= count:
        return holes
    step = len(holes) / count
    return [holes[int(i * step)] for i in range(count)]
