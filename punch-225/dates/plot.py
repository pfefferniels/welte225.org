"""Punch, advance and pitch of every dated copy, against the date it was punched.

    python3 plot.py [--open]

Three quantities on three panels over one date axis, because they have
different ranges and a second y-scale would make them look comparable when
they are not. Each dot is one dated copy, coloured by which of the two
perforators cut it, as its pitch says. That colouring is the point of the
figure: the punch and the pitch separate the two machines and overlap in
time, while the advance steps once, in 1909-10, across both of them.

Writes measures_by_year.png, and measures_by_year.csv with the plotted values
as the table the figure is drawn from.
"""

from __future__ import annotations

import argparse
import csv
import subprocess
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt                     # noqa: E402
from matplotlib.lines import Line2D                 # noqa: E402

import condon                                       # noqa: E402
from summary import COMB, LONG_STEP, OLD_PITCH, RESOLVED, measured, widths   # noqa: E402

HERE = Path(__file__).resolve().parent
PNG = HERE / "measures_by_year.png"
CSV = HERE / "measures_by_year.csv"

NARROW, WIDE = "#2a78d6", "#eb6834"                # categorical slots 1 and 2, validated on white
INK, SECOND, MUTED = "#111827", "#4b5563", "#6b7280"
GRID, AXIS, BAND = "#e5e7eb", "#d1d5db", "#f3f4f6"

ADVANCE_CHANGE = (date(1909, 12, 16), date(1910, 5, 21))
WAR = (date(1914, 8, 1), date(1918, 11, 11))


@dataclass(frozen=True)
class Copy:
    """One dated copy and what was measured on it."""

    druid: str
    welte: int | None
    punched: date
    punch: float | None
    advance: float | None
    pitch: float

    @property
    def year(self) -> float:
        start = date(self.punched.year, 1, 1)
        return self.punched.year + (self.punched - start).days / 365.25

    @property
    def machine(self) -> str:
        return "wide" if self.pitch >= OLD_PITCH else "narrow"


def punched(iso: str) -> date | None:
    """A date to plot. A bare year is left out rather than set at mid-year."""
    parts = iso.split("-")
    if len(parts) == 3:
        return date(*map(int, parts))
    if len(parts) == 2:
        return date(int(parts[0]), int(parts[1]), 15)
    return None


def early_advance(value: float) -> bool:
    """A resolved advance that is a real setting, not the 1.4-1.6 mm noise band."""
    return value < LONG_STEP or COMB[0] <= value <= COMB[1]


def copies() -> list[Copy]:
    records = condon.records()
    punch = widths()
    pitch = measured("pitch.json", "pitch")
    advance = {
        druid: value
        for druid, value in measured("step.json", "advance", RESOLVED).items()
        if early_advance(value)
    }
    found = [
        Copy(
            druid=r["druid"],
            welte=r["welte_number"],
            punched=when,
            punch=punch.get(r["druid"]),
            advance=advance.get(r["druid"]),
            pitch=pitch[r["druid"]],
        )
        for r in records
        if r.get("date_iso") and r.get("confidence") in ("high", "medium")
        and r["druid"] in pitch
        and (when := punched(r["date_iso"])) is not None
    ]
    return sorted(found, key=lambda c: c.punched)


def decimal(day: date) -> float:
    return day.year + (day - date(day.year, 1, 1)).days / 365.25


def dots(axis, found: list[Copy], value) -> None:
    """One dot per copy, narrow machine drawn first so the rarer wide sits on top."""
    for machine, colour in (("narrow", NARROW), ("wide", WIDE)):
        kept = [c for c in found if c.machine == machine and value(c) is not None]
        axis.scatter(
            [c.year for c in kept], [value(c) for c in kept],
            s=36, color=colour, edgecolors="white", linewidths=1.3, zorder=3,
        )


def style(axis, label: str) -> None:
    axis.set_ylabel(label, color=SECOND, fontsize=10)
    axis.grid(axis="y", color=GRID, linewidth=0.8)
    axis.set_axisbelow(True)
    axis.tick_params(colors=MUTED, labelsize=9, length=0)
    for side in ("top", "right", "left"):
        axis.spines[side].set_visible(False)
    axis.spines["bottom"].set_color(AXIS)
    axis.axvspan(decimal(WAR[0]), decimal(WAR[1]), color=BAND, zorder=0, linewidth=0)


def draw(found: list[Copy]) -> plt.Figure:
    figure, (top, middle, bottom) = plt.subplots(
        3, 1, figsize=(10, 9.4), sharex=True, facecolor="white",
        gridspec_kw={"hspace": 0.22},
    )

    dots(top, found, lambda c: c.punch)
    style(top, "Punch across (mm)")
    top.text(decimal(WAR[0]) + 0.15, 0.97, "war", color=MUTED, fontsize=9, va="top",
             transform=top.get_xaxis_transform())

    dots(middle, found, lambda c: c.advance)
    style(middle, "Advance (mm)")
    middle.axvspan(decimal(ADVANCE_CHANGE[0]), decimal(ADVANCE_CHANGE[1]),
                   color="#e5e7eb", zorder=1, linewidth=0)
    middle.text(decimal(ADVANCE_CHANGE[1]) + 0.25, 1.06,
                "halves between Dec 1909\nand May 1910", color=SECOND, fontsize=9, va="top")
    exception = next((c for c in found if c.advance and c.advance > LONG_STEP
                      and c.punched > ADVANCE_CHANGE[1]), None)
    if exception:
        middle.annotate(
            "Welte %s, %s\nthe one exception" % (exception.welte, exception.punched.strftime("%-d %b %Y")),
            xy=(exception.year, exception.advance), xytext=(exception.year - 3.6, 0.80),
            color=SECOND, fontsize=9,
            arrowprops={"arrowstyle": "-", "color": MUTED, "linewidth": 0.8},
        )

    dots(bottom, found, lambda c: c.pitch)
    style(bottom, "Pitch (mm)")
    bottom.text(1904.1, 2.99, "wide machine", color=SECOND, fontsize=9, va="center")
    bottom.text(1904.1, 2.55, "narrow machine,\nin two settings", color=SECOND, fontsize=9, va="center")

    bottom.set_xlim(1903.5, 1929)
    bottom.set_xticks(range(1904, 1930, 2))
    bottom.set_xlabel("Date of punching, as written on the copy", color=SECOND, fontsize=10)

    key = [
        Line2D([], [], marker="o", linestyle="", markersize=7, markerfacecolor=colour,
               markeredgecolor="white", label=label)
        for colour, label in ((WIDE, "wide machine, pitch 2.8–3.1 mm"),
                              (NARROW, "narrow machine, pitch 2.4–2.7 mm"))
    ]
    figure.legend(handles=key, loc="upper right", bbox_to_anchor=(0.9, 0.955),
                  frameon=False, fontsize=9, labelcolor=SECOND, ncol=2)
    figure.suptitle("Red Welte rolls at Stanford: %d dated copies" % len(found),
                    x=0.125, y=0.975, ha="left", color=INK, fontsize=13, weight="semibold")
    return figure


def table(found: list[Copy]) -> None:
    with CSV.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["druid", "welte", "punched", "machine", "punch_mm", "advance_mm", "pitch_mm"])
        writer.writerows(
            [c.druid, c.welte, c.punched.isoformat(), c.machine,
             "" if c.punch is None else round(c.punch, 3),
             "" if c.advance is None else round(c.advance, 3),
             round(c.pitch, 3)]
            for c in found
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--open", action="store_true", help="open the figure when written")
    args = parser.parse_args()

    found = copies()
    draw(found).savefig(PNG, dpi=180, bbox_inches="tight", facecolor="white")
    table(found)
    print("%d dated copies; wrote %s and %s" % (len(found), PNG.name, CSV.name))
    if args.open:
        subprocess.run(["open", str(PNG)], check=True)


if __name__ == "__main__":
    main()
