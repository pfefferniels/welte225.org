"""Where the ink is on the paper of a scanned roll.

A punch date is a few hundred pixels of pencil somewhere in a scan a quarter
of a million pixels long. Looking for that with a reader is wasteful, so it
is found first by arithmetic: the roll comes back in downscaled strips, a
background is fitted to the paper, and what stands darker than the paper by
more than a few times its own noise is kept.

The paper is red, so the ink's contrast lives in the red channel, where the
paper reads about 90 and the ink about 50; in the green channel, which the
punch measurements use, both are dark. How dark the paper reads varies from
scan to scan — 77 on one roll, 178 on another — so the level that separates
paper from what shines through the perforations is taken from each strip's
own histogram rather than fixed.

Three things on these rolls are dark and are not writing. Damp stains, which
are broad and have an interior that survives an erosion where a stroke of a
pen does not. Creases along the length of the roll, whose columns stay dark
the whole strip. And the printed label and the colour target on the leader,
which are solid in the same way a stain is.
"""

from __future__ import annotations

import io
import time
from dataclasses import dataclass
from typing import Iterator

import numpy as np
import requests
from PIL import Image
from scipy import ndimage as ndi

from rolls import Roll

SCALE = 8
PRE = 4000
CHUNK = 40000
OVERLAP = 1600
LIT = 60
Z = 6.0
MIN_INK = 10
MERGE_ALONG = 900
MERGE_ACROSS = 250
PAD_ALONG = 350
PAD_ACROSS = 90

IIIF = "https://stacks.stanford.edu/image/iiif/{druid}%2F{druid}_0001/{region}/{size}/{rotation}/default.{fmt}"

session = requests.Session()


def url(druid: str, x: int, y: int, w: int, h: int,
        size: str = "full", rotation: int = 90, fmt: str = "jpg") -> str:
    return IIIF.format(druid=druid, region=f"{x},{y},{w},{h}", size=size, rotation=rotation, fmt=fmt)


def end_window(roll: Roll) -> tuple[int, int]:
    """The end margin and a run-up before the last hole: where a date belongs."""
    return max(roll.first_hole, roll.last_hole - PRE), roll.length


def served(address: str, timeout: int = 300, tries: int = 4) -> bytes:
    """One IIIF request, retried: a scan of the whole archive meets reset connections."""
    for attempt in range(tries):
        try:
            response = session.get(address, timeout=timeout)
            response.raise_for_status()
            return response.content
        except requests.HTTPError:
            raise
        except requests.RequestException:
            if attempt == tries - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def red(druid: str, y: int, height: int, width: int, scale: int = SCALE) -> np.ndarray:
    """The red channel of one stretch of the roll, across its whole width, downscaled."""
    content = served(url(druid, 0, y, width, height, size=f"{width // scale},", rotation=0, fmt="png"))
    image = Image.open(io.BytesIO(content)).convert("RGB")
    return np.asarray(image, dtype=np.float64)[:, :, 0]


def strips(druid: str, start: int, stop: int, width: int,
           chunk: int = CHUNK, overlap: int = OVERLAP) -> Iterator[tuple[int, np.ndarray]]:
    """The stretch in overlapping pieces, so nothing written falls across a seam."""
    y = start
    while y < stop:
        height = min(chunk, stop - y)
        if height < 32:
            return
        yield y, red(druid, y, height, width)
        y += chunk - overlap


def _median(values: np.ndarray, mask: np.ndarray, axis: int) -> np.ndarray:
    with np.errstate(all="ignore"):
        return np.nanmedian(np.where(mask, values, np.nan), axis=axis)


def paper_mask(strip: np.ndarray) -> np.ndarray:
    """Paper, as against whatever shines through a hole or past the roll's edge."""
    counts, edges = np.histogram(strip, bins=64, range=(0, 256))
    counts[-1] = 0
    level = edges[int(np.argmax(counts))] + 2
    return strip < level + LIT


def darkness(strip: np.ndarray) -> np.ndarray:
    """How far below the paper each pixel sits, in units of the paper's own noise.

    The background is fitted as a profile across the roll plus a drift along
    it. Across is where the real variation is — the lamp falls off towards the
    edges steeply enough that a blockwise fit lags behind it and leaves the
    edges looking inked.
    """
    paper = paper_mask(strip)
    across = _median(strip, paper, 0)
    across = np.where(np.isnan(across), np.nanmedian(across), across)
    residual = strip - across[None, :]
    along = np.nan_to_num(_median(residual, paper, 1))
    residual = residual - along[:, None]

    noise = 1.4826 * _median(np.abs(residual), paper, 0)
    noise = np.where(np.isnan(noise) | (noise < 0.6), 0.6, noise)
    return (-residual * paper) / noise[None, :]


@dataclass(frozen=True)
class Blob:
    """A patch of ink in the scan, in the scan's own pixels."""

    x: int
    y: int
    w: int
    h: int
    ink: int
    peak: float
    spread: float
    solid: float

    @property
    def box(self) -> tuple[int, int, int, int]:
        return self.x, self.y, self.w, self.h


def _blobs(z: np.ndarray, y0: int, scale: int) -> list[Blob]:
    ink = z > Z
    labels, count = ndi.label(ndi.binary_dilation(ink, np.ones((5, 5))))
    if count == 0:
        return []

    indices = range(1, count + 1)
    sizes = ndi.sum(ink, labels, indices)
    peaks = ndi.maximum(z, labels, indices)
    cores = ndi.sum(ndi.binary_erosion(ink, np.ones((3, 3))), labels, indices)

    found = []
    for index, box in enumerate(ndi.find_objects(labels)):
        if sizes[index] < MIN_INK:
            continue
        rows, cols = box
        band = ink[:, cols].any(axis=1)
        found.append(Blob(
            x=cols.start * scale,
            y=y0 + rows.start * scale,
            w=(cols.stop - cols.start) * scale,
            h=(rows.stop - rows.start) * scale,
            ink=int(sizes[index]),
            peak=float(peaks[index]),
            spread=float(band.mean()),
            solid=float(cores[index] / sizes[index]),
        ))
    return found


def _merged(blobs: list[Blob]) -> list[Blob]:
    """Strokes of one inscription, gathered into one box."""
    groups: list[list[Blob]] = []
    for blob in sorted(blobs, key=lambda b: b.y):
        for group in groups:
            near = any(
                blob.y - (other.y + other.h) <= MERGE_ALONG
                and other.y - (blob.y + blob.h) <= MERGE_ALONG
                and blob.x - (other.x + other.w) <= MERGE_ACROSS
                and other.x - (blob.x + blob.w) <= MERGE_ACROSS
                for other in group
            )
            if near:
                group.append(blob)
                break
        else:
            groups.append([blob])

    def gather(group: list[Blob]) -> Blob:
        x = min(b.x for b in group)
        y = min(b.y for b in group)
        ink = sum(b.ink for b in group)
        return Blob(
            x=x, y=y,
            w=max(b.x + b.w for b in group) - x,
            h=max(b.y + b.h for b in group) - y,
            ink=ink,
            peak=max(b.peak for b in group),
            spread=max(b.spread for b in group),
            solid=sum(b.solid * b.ink for b in group) / ink,
        )

    return [gather(group) for group in groups]


CAP = 1000
BAND = 500
CUT = 0.25


def score(blob: Blob, roll: Roll) -> float:
    """How much an inscription this looks like, before anyone has read it.

    Ink carries the weight, capped, because the largest patches on these rolls
    are not writing. A line of writing turned on its side is a narrow band
    across the roll, a few hundred pixels of letter height, where a stain or a
    printed label is a thousand and more; writing is thin strokes, so almost
    nothing of it survives an erosion; and a patch whose columns stay dark the
    length of the strip is a crease.

    Sitting after the last perforation, where both dated copies have their
    date, counts for something but is not required. Sitting on the leader,
    where the label and the colour target are, counts against.
    """
    value = float(min(blob.ink, CAP))
    value *= 0.15 if blob.spread > 0.5 else 1.0 - blob.spread
    value *= 1.0 - min(0.9, 2.0 * blob.solid)
    if blob.w > BAND:
        value /= (blob.w / BAND) ** 2
    if blob.w < 48:
        value *= 0.3
    if not 120 <= blob.h <= 6000:
        value *= 0.4
    if blob.y >= roll.last_hole:
        value *= 1.6
    if blob.y + blob.h <= roll.first_hole:
        value *= 0.25
    return value


def padded(blob: Blob, roll: Roll) -> tuple[int, int, int, int]:
    """The blob's box, opened out far enough that a reader sees whole letters."""
    left, right = roll.paper
    x = max(left, blob.x - PAD_ACROSS)
    y = max(0, blob.y - PAD_ALONG)
    return (
        x,
        y,
        min(right, blob.x + blob.w + PAD_ACROSS) - x,
        min(roll.length, blob.y + blob.h + PAD_ALONG) - y,
    )


def truncated(blob: Blob, start: int, stop: int, slack: int = 16) -> bool:
    """Does this patch run off the end of the stretch that was searched?

    An inscription is a few hundred pixels of writing with blank paper round
    it, so it lies wholly inside whatever was searched. A patch that reaches
    the first or last row of the window has been cut by the window and is
    almost always the music, or a crease, continuing past it. Ranking those
    above a real date cost six per cent of the top-ranked regions in the
    first full pass.
    """
    return blob.y <= start + slack or blob.y + blob.h >= stop - slack


def search(roll: Roll, start: int, stop: int) -> list[Blob]:
    """Every patch of ink between two rows of the scan, merged and ranked."""
    found = [
        blob
        for y, strip in strips(roll.druid, start, stop, roll.width)
        for blob in _blobs(darkness(strip), y, roll.width // strip.shape[1])
    ]
    merged = _merged(found)
    merged.sort(key=lambda blob: -score(blob, roll)
                * (CUT if truncated(blob, start, stop) else 1.0))
    return merged
