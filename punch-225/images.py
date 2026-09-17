"""The Stanford copies measured on the scans themselves, over IIIF.

Full-resolution crops come back as PNG, so nothing the measurement reads has
been through a lossy coder. Two cuts are taken through a perforation. Down
the roll a strip through the middle of a held note gives its slots, the
bridges of paper left between them, and their sum, the pitch at which the
perforator repeated itself. Across the roll a strip through a short note
gives the punch's own width, which no chaining can lengthen.
"""

from __future__ import annotations

import io
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import numpy as np
import requests
from PIL import Image

from edges import crossings, inflections, runs
from holes import Hole

MARGIN = 24
STRIP = 9
PAD = 20
CONTRAST = 25

session = requests.Session()


def _crop(druid: str, col: int, row: int, width: int, height: int) -> np.ndarray:
    url = (
        f"https://stacks.stanford.edu/image/iiif/{druid}%2F{druid}_0001/"
        f"{col},{row},{width},{height}/full/0/default.png"
    )
    response = session.get(url, timeout=180)
    response.raise_for_status()
    image = Image.open(io.BytesIO(response.content)).convert("RGB")
    return np.asarray(image, dtype=np.float64)[:, :, 1]


def _levels(profile: np.ndarray, margin: int) -> tuple[float, float] | None:
    paper = float(np.median(np.concatenate([profile[:margin], profile[-margin:]])))
    lit = float(np.percentile(profile, 98))
    return (paper, lit) if lit - paper >= CONTRAST else None


def along(druid: str, hole: Hole) -> np.ndarray:
    """A strip down the middle of a note, with paper at both ends."""
    col = hole.col + hole.width // 2 - STRIP // 2
    patch = _crop(druid, col, hole.row - MARGIN, STRIP, hole.length + 2 * MARGIN)
    return np.median(patch, axis=1)


def across(druid: str, hole: Hole, rows: int = 8) -> np.ndarray:
    """Rows through the middle of a note, each one crossing the roll."""
    row = hole.row + hole.length // 2 - rows // 2
    return _crop(druid, hole.col - PAD, row, hole.width + 2 * PAD, rows)


@dataclass(frozen=True)
class Note:
    """One held note as the scan shows it, in pixels."""

    row: int
    slots: tuple[float, ...]
    bridges: tuple[float, ...]

    @property
    def pitches(self) -> tuple[float, ...]:
        return tuple(slot + bridge for slot, bridge in zip(self.slots, self.bridges))


def chained(druid: str, hole: Hole) -> Note | None:
    """The slots and bridges of one held note, measured at the inflections."""
    profile = along(druid, hole)
    levels = _levels(profile, MARGIN - 6)
    if levels is None:
        return None

    paper, lit = levels
    found = runs(inflections(profile, lit - paper))
    if found is None or len(found[1]) < 1:
        return None
    return Note(hole.row, tuple(found[0]), tuple(found[1]))


def single(druid: str, hole: Hole) -> float | None:
    """The length of a note short enough to be one uninterrupted slot."""
    profile = along(druid, hole)
    levels = _levels(profile, MARGIN - 6)
    if levels is None:
        return None

    paper, lit = levels
    edges = inflections(profile, lit - paper)
    if len(edges) != 2 or edges[0][1] != 1:
        return None
    return edges[1][0] - edges[0][0]


def width(druid: str, hole: Hole) -> float | None:
    """The punch's width across the roll, from the widest of several rows.

    A slot narrows between two punches and at its ends, so a row taken at
    random reads narrow. The widest of the rows about the middle is the one
    through a punch's equator.
    """
    patch = across(druid, hole)
    found = []
    for row in patch:
        levels = _levels(row, 6)
        if levels is None:
            continue
        paper, lit = levels
        edges = crossings((row - paper) / (lit - paper), 0.5)
        if len(edges) == 2 and edges[0][1] == 1:
            found.append(edges[1][0] - edges[0][0])
    return max(found) if len(found) >= 3 else None


def sweep(druid: str, hole: Hole, levels: tuple[float, ...]) -> dict[float, tuple[list[float], list[float]]] | None:
    """Slots and bridges of one note, at each of several edge levels."""
    profile = along(druid, hole)
    found = _levels(profile, MARGIN - 6)
    if found is None:
        return None

    paper, lit = found
    normalised = (profile - paper) / (lit - paper)
    out = {}
    for level in levels:
        got = runs(crossings(normalised, level))
        if got is not None:
            out[level] = got
    return out or None


def gather(function, druid: str, holes: list[Hole], workers: int = 10) -> list:
    """Run one measurement over many perforations, a few requests at a time."""

    def one(hole):
        try:
            return function(druid, hole)
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return [got for got in pool.map(one, holes) if got is not None]
