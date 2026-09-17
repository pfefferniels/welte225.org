"""The advance of the perforator, found as the period its slot lengths keep.

A note is cut by a punch that fires while the paper steps past it, so a slot
is the punch plus whole advances and the lengths a copy uses fall on a comb.
Reading the comb off a histogram needs bins, and a scan whose lines are
coarser than the comb loses it in the binning, so the lengths are folded onto
a trial period instead: at the machine's own period the phases agree and the
mean of the unit vectors is long, at any other they scatter and it is short.

Most slots are a single punch, and that one tall tooth shares a phase at
every trial period, which would drown the comb. Differences between pairs
of lengths have no such offset, and dropping the small ones drops the tooth
along with them, leaving the distances between teeth to be folded.
"""

from __future__ import annotations

import math

import numpy as np

STEP = 0.001


def strength(lengths: np.ndarray, period: float) -> float:
    """How far the phases are from scattered at this period, from 0 to 1."""
    return float(abs(np.exp(2j * math.pi * lengths / period).mean()))


def gaps(lengths: list[float], least: float = 0.35, most: float = 6.0, draw: int = 400_000) -> np.ndarray:
    """Distances between pairs of slots far enough apart to skip the mode."""
    values = np.asarray(lengths, dtype=float)
    generator = np.random.default_rng(12345)
    difference = np.abs(generator.choice(values, draw) - generator.choice(values, draw))
    return difference[(difference >= least) & (difference <= most)]


def profile(lengths: np.ndarray, low: float = 0.30, high: float = 1.60) -> tuple[np.ndarray, np.ndarray]:
    periods = np.arange(low, high, STEP)
    return periods, np.array([strength(lengths, period) for period in periods])


def peaks(lengths: np.ndarray, low: float = 0.30, high: float = 1.60, keep: int = 4) -> list[tuple[float, float]]:
    """The strongest periods in the window, strongest first."""
    periods, power = profile(lengths, low, high)
    local = np.nonzero((power[1:-1] > power[:-2]) & (power[1:-1] >= power[2:]))[0] + 1
    best = sorted(local, key=lambda index: -power[index])[:keep]
    return [(float(periods[index]), float(power[index])) for index in sorted(best)]
