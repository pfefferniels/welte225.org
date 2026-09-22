"""What "punch across" and "pitch" each measure, drawn.

    python3 explain.py [--open]

The two are easy to confuse because both are a few millimetres and both are
about the perforations. They are measured in perpendicular directions on
different things. Punch across is the size of one hole, taken across the roll.
Pitch is the spacing of the holes a held note is cut as, taken along it.

Three rows: a schematic of what each measures; the same schematic sharp and
blurred, which is why the pitch is the one to trust; and a real held note from
each machine at the same scale, measured where it lies.

Writes explain.png.
"""

from __future__ import annotations

import argparse
import io
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt                      # noqa: E402
import numpy as np                                   # noqa: E402
from matplotlib.patches import Circle, FancyBboxPatch  # noqa: E402
from PIL import Image                                # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import images                                        # noqa: E402

PNG = HERE / "explain.png"

ACROSS, ALONG = "#4a3aa7", "#008300"                 # validated pair on white
INK, SECOND, MUTED = "#111827", "#4b5563", "#6b7280"
PAPER, TRACK = "#d1d5db", "#9ca3af"

PX_PER_MM = 300.25 / 25.4                            # Stanford's scans, along and across alike
TEILUNG = 3.19

# One held note on each machine, found in the analyses and measured by images.chained.
NOTES = {
    "wide": ("wv912mm2332", 60566, 1997, 26, 412, "roll 225, punched 14 Jan 1914"),
    "narrow": ("jq774vx6544", 58681, 1842, 21, 487, "roll 3309, punched 22 Nov 1922"),
}


def arrow(axis, start, end, colour) -> None:
    axis.annotate("", xy=end, xytext=start,
                  arrowprops={"arrowstyle": "<->", "color": colour, "linewidth": 1.4,
                              "shrinkA": 0, "shrinkB": 0})


def along(axis, x0, x1, y, text, colour=ALONG, reach=None, below=True) -> None:
    """A dimension along the roll, with extension lines up to the holes."""
    if reach is not None:
        for x in (x0, x1):
            axis.plot([x, x], [reach, y], color=colour, linewidth=0.7)
    arrow(axis, (x0, y), (x1, y), colour)
    axis.text((x0 + x1) / 2, y - 0.35 if below else y + 0.35, text, color=INK,
              fontsize=9, ha="center", va="top" if below else "bottom")


def across(axis, y0, y1, x, text, colour=ACROSS, reach=None, right=True) -> None:
    """A dimension across the roll, with extension lines out from the holes."""
    if reach is not None:
        for y in (y0, y1):
            axis.plot([reach, x], [y, y], color=colour, linewidth=0.7)
    arrow(axis, (x, y0), (x, y1), colour)
    axis.text(x + 0.4 if right else x - 0.4, (y0 + y1) / 2, text, color=INK,
              fontsize=9, ha="left" if right else "right", va="center")


def paper(axis, x0, x1, y0, y1) -> None:
    axis.add_patch(FancyBboxPatch((x0, y0), x1 - x0, y1 - y0,
                                  boxstyle="round,pad=0,rounding_size=0.3",
                                  facecolor=PAPER, edgecolor="none", zorder=0))


def punch(axis, x, y, diameter, soft=False) -> None:
    if soft:
        axis.add_patch(Circle((x, y), diameter / 2 + 0.18, facecolor="#f3f4f6",
                              edgecolor="none", zorder=1))
    axis.add_patch(Circle((x, y), diameter / 2, facecolor="white", edgecolor="none", zorder=2))


def blank(axis) -> None:
    axis.set_aspect("equal")
    axis.axis("off")


def schematic(axis) -> None:
    """Two tracks: a held note cut as a chain of punches, and one single punch."""
    d, pitch = 2.3, 3.0
    paper(axis, -2.0, 21.5, -2.1, TEILUNG + 2.1)
    for y in (0, TEILUNG):
        axis.plot([-1.8, 21.3], [y, y], color=TRACK, linewidth=0.6, zorder=1)
    chain = [i * pitch for i in range(5)]
    for x in chain:
        punch(axis, x, 0, d)
    punch(axis, 17.0, TEILUNG, d)

    along(axis, chain[1], chain[2], -3.2,
          "pitch 3.0 mm\nspacing of a held note's holes, centre to centre",
          reach=-0.2)
    along(axis, chain[3] - d / 2, chain[3] + d / 2, -1.65, "slot", reach=-1.1, below=False)
    along(axis, chain[3] + d / 2, chain[4] - d / 2, 1.45, "bridge", below=False, reach=0.5)

    across(axis, TEILUNG - d / 2, TEILUNG + d / 2, 19.1,
           "punch across 2.3 mm\nthe size of one hole", reach=17.0 + d / 2)
    across(axis, 0, TEILUNG, -3.0, "track spacing\n3.19 mm", reach=-1.8, right=False)

    axis.annotate("", xy=(21.2, TEILUNG + 2.8), xytext=(15.5, TEILUNG + 2.8),
                  arrowprops={"arrowstyle": "->", "color": MUTED, "linewidth": 1})
    axis.text(15.3, TEILUNG + 2.8, "paper travels", color=MUTED, fontsize=9, ha="right", va="center")
    axis.set_xlim(-8.5, 27)
    axis.set_ylim(-5.8, TEILUNG + 3.6)
    blank(axis)


def blurred(axis) -> None:
    """The same chain as a sharper and a softer scan would give it."""
    pitch = 3.0
    rows = ((1.6, 2.3, False, "sharper scan"), (-1.6, 2.6, True, "softer scan"))
    paper(axis, -2.2, 13.9, -3.4, 3.4)
    for y, d, soft, label in rows:
        for i in range(5):
            punch(axis, i * pitch, y, d, soft)
        axis.text(-2.7, y, label, color=SECOND, fontsize=9, ha="right", va="center")
        along(axis, pitch, 2 * pitch, y + (1.95 if y > 0 else -1.95),
              "pitch 3.0" if y > 0 else "pitch 3.0 — unchanged",
              below=y < 0, reach=y + (d / 2 if y > 0 else -d / 2))
        across(axis, y - d / 2, y + d / 2, 13.2 + 1.0,
               "across %.1f" % d, reach=12 + d / 2)
    axis.text(6.0, -5.9,
              "A softer scan lets more light round each hole: every hole reads wider,\n"
              "every bridge narrower, by the same amount. The size of a hole moves; the\n"
              "distance between successive holes does not. That is why pitch compares\n"
              "across scans and punch across does not.",
              color=SECOND, fontsize=9, ha="center", va="top")
    axis.set_xlim(-9.5, 20.5)
    axis.set_ylim(-9.2, 4.6)
    blank(axis)


@dataclass(frozen=True)
class Setting:
    """One configuration of a perforator: its punch, its step, and how often it fires on a held note."""

    die: str
    punch: float
    advance: float
    every: int
    span: str

    @property
    def pitch(self) -> float:
        return self.advance * self.every


# From step.json and pitch.json: pitch / advance lands within 0.15 of a whole
# number on all 342 rolls where both are measured, and takes only 3, 5 and 6
# in quantity. These are the four settings with enough dated copies to place.
SETTINGS = (
    Setting("wide", 2.3, 1.00, 3, "17 rolls, dated Nov 1908 – Dec 1909"),
    Setting("wide", 2.3, 0.50, 6, "39 rolls, dated May 1910 – Sep 1917"),
    Setting("narrow", 1.85, 0.50, 5, "159 rolls, dated 1911 – 1928"),
    Setting("narrow", 1.85, 0.52, 5, "75 rolls, dated 1911 – 1928"),
)


def perforators(axis) -> None:
    """Each setting as a held note drawn over the paper's steps: a hole every N ticks."""
    length, gap = 16.0, 5.6
    for index, s in enumerate(SETTINGS):
        y = -index * gap
        half = s.punch / 2 + 0.55
        paper(axis, 0, length, y - half, y + half)
        steps = int(length / s.advance)
        for k in range(steps + 1):
            x = k * s.advance
            axis.plot([x, x], [y + half, y + half - 0.3], color=ALONG, linewidth=0.8, zorder=3)
        holes = [1.4 + j * s.pitch for j in range(int((length - 2.5) / s.pitch) + 1)]
        for x in holes:
            punch(axis, x, y, s.punch)
        arrow(axis, (holes[1], y - half - 0.45), (holes[2], y - half - 0.45), ALONG)
        axis.text((holes[1] + holes[2]) / 2, y - half - 0.8,
                  "%d steps × %.2f = pitch %.2f mm" % (s.every, s.advance, s.pitch),
                  color=INK, fontsize=8.5, ha="center", va="top")
        axis.text(-0.7, y, "%s punch\n%.2f mm step,\nfires every %s step" % (
                      s.die, s.advance, {3: "3rd", 5: "5th", 6: "6th"}[s.every]),
                  color=SECOND, fontsize=8.5, ha="right", va="center")
        axis.text(length + 0.7, y, s.span, color=SECOND, fontsize=8.5, ha="left", va="center")

    top = SETTINGS[0].punch / 2 + 0.55
    axis.text(0, top + 0.5, "ticks: the paper's smallest step, the advance", color=ALONG,
              fontsize=8.5, ha="left", va="bottom")
    bottom = -(len(SETTINGS) - 1) * gap - 3.6
    axis.text(length / 2, bottom,
              "The paper moves in small steps, the advance, and on a held note the punch fires once every few\n"
              "of them, so the pitch is a whole number of steps. The wide machine was re-geared between\n"
              "Dec 1909 and May 1910: its step halved and it fired twice as often, which left the pitch at 3.0 mm.\n"
              "That is why the advance changes there and the pitch does not. The narrow punch ran at two\n"
              "steps, 0.50 and 0.52 mm, side by side in nearly every year from 1911 to 1928.",
              color=SECOND, fontsize=9, ha="center", va="top")
    axis.set_xlim(-7.5, 30)
    axis.set_ylim(bottom - 6.2, top + 1.6)
    blank(axis)


def crop(druid, row, col, width, length) -> np.ndarray:
    """A held note and the tracks either side, full resolution, travel running left to right."""
    margin = 50
    x, y = col - margin, row + 30
    w, h = width + 2 * margin, min(length - 60, 330)
    url = ("https://stacks.stanford.edu/image/iiif/%s%%2F%s_0001/%d,%d,%d,%d/full/0/default.png"
           % (druid, druid, x, y, w, h))
    response = images.session.get(url, timeout=180)
    response.raise_for_status()
    return np.asarray(Image.open(io.BytesIO(response.content)).convert("RGB")).transpose(1, 0, 2)


def runs(profile: np.ndarray) -> list[tuple[int, int]]:
    """The bright stretches of a profile, as (start, end) in pixels, at half contrast.

    The paper level is a low percentile, not the median: along a held note's
    own track the holes cover three-quarters of the length, so the median is
    the holes' brightness and nothing would clear it.
    """
    level = (profile.max() + np.percentile(profile, 5)) / 2
    lit = np.concatenate([[False], profile > level, [False]])
    change = np.flatnonzero(np.diff(lit.astype(int)))
    return list(zip(change[::2], change[1::2]))


def measured(axis, image: np.ndarray, machine: str, caption: str) -> None:
    """A real note, with its pitch and punch across taken off the image itself."""
    rows, cols = image.shape[:2]
    axis.imshow(image, extent=(0, cols / PX_PER_MM, rows / PX_PER_MM, 0), interpolation="lanczos")

    centre_row = int(np.argmax(image[:, :, 1].astype(float).mean(axis=1)))
    holes = [h for h in runs(image[centre_row, :, 1].astype(float)) if h[1] - h[0] > 8]
    middle = len(holes) // 2
    (a0, a1), (b0, b1) = holes[middle - 1], holes[middle]
    ca, cb = (a0 + a1) / 2 / PX_PER_MM, (b0 + b1) / 2 / PX_PER_MM
    pitch = cb - ca

    column = int((b0 + b1) / 2)
    top, bottom = max(runs(image[:, column, 1].astype(float)), key=lambda r: r[1] - r[0])
    t, b = top / PX_PER_MM, bottom / PX_PER_MM

    height = rows / PX_PER_MM
    arrow(axis, (ca, height + 1.0), (cb, height + 1.0), ALONG)
    axis.text((ca + cb) / 2, height + 1.45, "pitch %.2f mm" % pitch, color=INK,
              fontsize=9, ha="center", va="top")          # the y axis runs downward here
    across(axis, t, b, cols / PX_PER_MM + 0.9, "across\n%.2f mm" % (b - t), reach=cols / PX_PER_MM)
    for x in (ca, cb):
        axis.plot([x, x], [centre_row / PX_PER_MM - 0.5, height], color=ALONG, linewidth=0.7)

    axis.set_title("%s machine — %s" % (machine, caption), color=INK, fontsize=10, loc="left", pad=6)
    axis.set_xlim(-0.5, cols / PX_PER_MM + 6.5)
    axis.set_ylim(height + 3.2, -0.6)
    blank(axis)


def draw() -> plt.Figure:
    figure = plt.figure(figsize=(11, 21), facecolor="white")
    grid = figure.add_gridspec(5, 2, height_ratios=[1.15, 1.0, 2.35, 0.95, 0.95], hspace=0.24, wspace=0.05,
                                top=0.935, bottom=0.1)

    top = figure.add_subplot(grid[0, :])
    schematic(top)
    top.set_title("What each measures — one held note, and one single hole on the next track",
                  color=INK, fontsize=11, loc="left", weight="semibold")

    middle = figure.add_subplot(grid[1, :])
    blurred(middle)
    middle.set_title("Why pitch is the one to trust", color=INK, fontsize=11, loc="left", weight="semibold")

    settings = figure.add_subplot(grid[2, :])
    perforators(settings)
    settings.set_title("Where the advance comes in: pitch = steps × advance",
                       color=INK, fontsize=11, loc="left", weight="semibold")

    for index, machine in enumerate(("wide", "narrow")):
        druid, row, col, width, length, caption = NOTES[machine]
        axis = figure.add_subplot(grid[3 + index, :])
        measured(axis, crop(druid, row, col, width, length), machine, caption)

    figure.suptitle("Punch across, pitch and advance", x=0.125, y=0.995, ha="left",
                    color=INK, fontsize=14, weight="semibold")
    figure.text(0.125, 0.975,
                "Punch across is the size of one hole, measured across the roll.  "
                "Pitch is the spacing of a held note's holes, measured along it.\n"
                "Advance is the smallest step the paper takes; the pitch is a whole number of them.",
                color=SECOND, fontsize=10, ha="left", va="top")
    figure.text(0.125, 0.957, "Violet: across the roll.   Green: along the roll.",
                color=MUTED, fontsize=9, ha="left", va="top")
    figure.text(0.125, 0.085,
                "The real notes are shown at one scale, so the two machines compare directly: "
                "the wide machine's holes are bigger AND further apart.",
                color=SECOND, fontsize=9, ha="left")
    return figure


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    draw().savefig(PNG, dpi=170, bbox_inches="tight", facecolor="white")
    print("wrote %s" % PNG.name)
    if args.open:
        subprocess.run(["open", str(PNG)], check=True)


if __name__ == "__main__":
    main()
