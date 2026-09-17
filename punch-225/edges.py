"""Where an edge in a scan is, to a fraction of a pixel.

Two ways of placing it are kept, because they fail differently.

Taking the edge where the profile passes halfway between paper and slot is
the obvious one, and it assumes the slot reaches the level an open hole
would give. Both Stanford scans clip: their slots sit at 255 whatever the
exposure while their paper does not, so the half level falls at a different
place in each session. The slot then reads long in one scan and short in the
other, and the bridge gives back exactly what the slot gained, which is how
a difference of exposure passes itself off as a difference of punch.

The steepest point of the transition does not move with exposure. A
symmetric blur leaves the inflection where the edge was, and scaling the
profile scales its gradient without moving the extremum. The transition is
about two pixels wide here, so the extremum is placed by fitting a parabola
through the three samples at its top.

Neither is right in the absolute. `sweep` is what settles a comparison: it
measures at a range of levels, and a difference that holds across the range
is not the level's doing.
"""

from __future__ import annotations

import numpy as np


def inflections(profile: np.ndarray, contrast: float, floor: float = 0.25) -> list[tuple[float, int]]:
    """Rising and falling edges, in order, at the steepest point of each."""
    gradient = np.gradient(profile)
    found: list[tuple[float, int]] = []

    for sign in (1, -1):
        signal = gradient * sign
        peaks = np.nonzero(
            (signal[1:-1] >= signal[:-2])
            & (signal[1:-1] > signal[2:])
            & (signal[1:-1] > floor * contrast)
        )[0] + 1
        found.extend((_apex(signal, int(index)), sign) for index in peaks)

    found.sort()
    return _alternating(found)


def _apex(signal: np.ndarray, index: int) -> float:
    left, middle, right = signal[index - 1], signal[index], signal[index + 1]
    curvature = left - 2 * middle + right
    if curvature == 0:
        return float(index)
    return float(index + 0.5 * (left - right) / curvature)


def crossings(level: np.ndarray, at: float) -> list[tuple[float, int]]:
    """Rising and falling edges, in order, where the profile passes `at`."""
    above = level > at
    found = []
    for index in np.nonzero(above[1:] != above[:-1])[0]:
        low, high = level[index], level[index + 1]
        if high == low:
            continue
        found.append((index + (at - low) / (high - low), 1 if high > low else -1))
    found.sort()
    return _alternating(found)


def _alternating(found: list[tuple[float, int]]) -> list[tuple[float, int]]:
    """One edge per transition, so rises and falls take turns."""
    kept: list[tuple[float, int]] = []
    for edge in found:
        if kept and kept[-1][1] == edge[1]:
            continue
        kept.append(edge)
    return kept


def runs(edges: list[tuple[float, int]]) -> tuple[list[float], list[float]] | None:
    """Lit runs and dark runs, from a list of edges that starts with a rise."""
    if len(edges) < 3 or edges[0][1] != 1:
        return None
    at = [position for position, _ in edges]
    return (
        [b - a for a, b in zip(at[0::2], at[1::2])],
        [b - a for a, b in zip(at[1::2], at[2::2])],
    )
