"""Measure every copy of WM 225 that can be measured, and write the tables.

    python3 measure.py [--scans DIR] [--edition FILE] [--sample N]

The two Stanford copies are read over IIIF and need the network; the other
three are read from the analysis files of their local scans. Writes
punch.txt, advance.txt and sweep.txt beside this script.
"""

from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "condon-dates" / "perforator"))   # the libraries

import images                                                        # noqa: E402
from advance import gaps, peaks                                      # noqa: E402
from holes import Hole, alone, aton, from_edition, rollinfo, spread  # noqa: E402

SCANS = HERE.parent.parent / "rollscan2image" / "scans"
EDITION = HERE.parent / "edition.jsonld"
FIXTURE = HERE.parent.parent / "linked-rolls" / "test" / "fixtures" / "mf320jq4997_analysis.txt"

DPI = 300.25
LEVELS = (0.3, 0.4, 0.5, 0.6, 0.7)


def mm(pixels: float) -> float:
    return pixels * 25.4 / DPI


@dataclass(frozen=True)
class Copy:
    siglum: str
    keeper: str
    system: str
    punched: str
    druid: str | None = None
    index: int | None = None
    analysis: Path | None = None


COPIES = [
    Copy("St1", "Stanford, Condon 47", "T-100 red", "18 Jan 1909", druid="mf320jq4997", index=0, analysis=FIXTURE),
    Copy("Wi1", "Marc Widuch", "T-100 red", "28 Oct 1910",
         analysis=SCANS / "WR0225_02_2023-04-12_09-29-48"
                  / "WR0225_02_2023-04-12_09-29-48_I_Schumann_Traeumere_analysis.txt"),
    Copy("St2", "Stanford, Condon 48", "T-100 red", "14 Jan 1914", druid="wv912mm2332", index=1),
    Copy("Ch1", "scanned by Spencer Chase", "Licensee", "after 1916",
         analysis=SCANS / "chase_WelteLicensee_225_Gruenfeld"
                  / "WelteLicensee_225_Gruenfeld_Traeumerei_analysis.txt"),
    Copy("Bo1", "Peter Both", "T-98 green", "after 1924",
         analysis=SCANS / "dyer_WelteT98_225_Gruenfeld"
                  / "WelteT98_225_Gruenfeld_Traeumerei_analysis.txt"),
]


def chains(holes: list[Hole], reach: int = 30) -> dict[str, list[float]]:
    """Slot, bridge and pitch, from runs of slots in one track."""
    by_track: dict[int | None, list[Hole]] = defaultdict(list)
    for hole in holes:
        by_track[hole.track].append(hole)

    slots, bridges, pitches = [], [], []
    for group in by_track.values():
        group.sort(key=lambda hole: hole.row)
        for previous, hole in zip(group, group[1:]):
            bridge = hole.row - (previous.row + previous.length)
            if 0 <= bridge <= reach:
                slots.append(float(previous.length))
                bridges.append(float(bridge))
                pitches.append(float(hole.row - previous.row))
    return {"slot": slots, "bridge": bridges, "pitch": pitches}


def stated(copy: Copy, sample: int, edition: dict) -> dict:
    """Everything one copy can be asked for, in pixels of its own scan."""
    out: dict = {"copy": copy}

    if copy.analysis is not None and copy.analysis.exists():
        holes = aton(copy.analysis)
        info = rollinfo(copy.analysis)
        out["separation"] = float(info["HOLE_SEPARATION"])
        out["threshold"] = info.get("THRESHOLD")
        out["boxes"] = holes
        out["parser"] = chains(holes)
        out["lengths"] = [float(hole.length) for hole in holes]

    if copy.index is not None:
        boxes = from_edition(edition["copies"][copy.index])
        out["boxes_edition"] = boxes
        out["separation"] = float(
            edition["copies"][copy.index]["measurements"]["holeSeparation"]["value"]
        )
        out["across_box"] = [float(hole.width) for hole in boxes]

        clear = alone(boxes)
        held = spread([h for h in clear if 200 <= h.length <= 1200], sample)
        notes = images.gather(images.chained, copy.druid, held)
        out["image"] = {
            "slot": [s for note in notes for s in note.slots[1:-1]],
            "bridge": [b for note in notes for b in note.bridges[1:-1]],
            "pitch": [p for note in notes for p in note.pitches[1:-1]],
            "notes": len(notes),
        }

        short = spread([h for h in clear if 20 <= h.length <= 110], sample + 140)
        out["singles"] = images.gather(images.single, copy.druid, short)
        out["across_image"] = images.gather(
            images.width, copy.druid, spread([h for h in clear if 20 <= h.length <= 34], 150)
        )

    if "across_box" not in out and "boxes" in out:
        out["across_box"] = [float(hole.width) for hole in out["boxes"]]

    return out


def punch_table(measured: list[dict]) -> str:
    rows = [
        "Copy  Keeper                     System      Punched       "
        "Teilung   ∅ across    ∅ across    slot       bridge     pitch",
        "                                                            "
        "(mm)      box (mm)    image (mm)  (mm)       (mm)       (mm)",
        "-" * 122,
    ]
    for got in measured:
        copy = got["copy"]
        image = got.get("image", {})
        parser = got.get("parser", {})

        def one(values):
            return "%.3f" % mm(st.median(values)) if values else "–"

        slot = image.get("slot") or parser.get("slot")
        bridge = image.get("bridge") or parser.get("bridge")
        pitch = image.get("pitch") or parser.get("pitch")

        rows.append(
            "%-5s %-26s %-11s %-13s %-9s %-11s %-11s %-10s %-10s %-10s"
            % (
                copy.siglum, copy.keeper, copy.system, copy.punched,
                "%.3f" % mm(got["separation"]),
                one(got.get("across_box")),
                one(got.get("across_image")),
                one(slot), one(bridge), one(pitch),
            )
        )
    return "\n".join(rows)


def advance_table(measured: list[dict]) -> str:
    rows = [
        "The perforator's advance: the strongest periods in the slot lengths.",
        "R runs from 0 (scattered) to 1 (every length on the comb).",
        "",
        "Copy  Source            n       best period      other peaks",
        "-" * 92,
    ]
    for got in measured:
        copy = got["copy"]
        for source, lengths in (("image", got.get("singles")), ("parser", got.get("lengths"))):
            if not lengths:
                continue
            values = gaps([mm(x) for x in lengths])
            if len(values) < 500:
                continue
            found = peaks(values)
            best = max(found, key=lambda item: item[1])
            others = " ".join("%.3f(R=%.2f)" % item for item in found if item != best)
            rows.append(
                "%-5s %-17s %-7d %.3f mm (R=%.2f)  %s"
                % (copy.siglum, source, len(lengths), best[0], best[1], others)
            )
    return "\n".join(rows)


def onset_table(edition: dict) -> str:
    """The advance, asked of where notes begin rather than of how long they are.

    The two quantities are independent: a slot's length is the punch plus
    whole advances, a note's onset is where on the grid it was let start.
    Paper that has stretched unevenly since smears the onsets, so the
    agreement is weaker, but it is not the same measurement twice.
    """
    rows = [
        "",
        "The same advance, from the onsets of notes rather than from slot lengths.",
        "Differences up to five notes apart and 40 mm are folded.",
        "",
        "Copy  n       best period       other peaks",
        "-" * 92,
    ]
    for siglum, index in (("St1", 0), ("St2", 1)):
        onsets = np.sort(np.array([hole.row for hole in from_edition(edition["copies"][index])]) * 25.4 / DPI)
        spans = np.concatenate([onsets[k:] - onsets[:-k] for k in range(1, 6)])
        spans = spans[(spans >= 0.6) & (spans <= 40)]
        found = peaks(spans)
        best = max(found, key=lambda item: item[1])
        others = " ".join("%.3f(R=%.2f)" % item for item in found if item != best)
        rows.append("%-5s %-7d %.3f mm (R=%.2f)   %s" % (siglum, len(spans), best[0], best[1], others))
    return "\n".join(rows)


def sweep_table(edition: dict, sample: int) -> str:
    rows = [
        "Slot and bridge of the two Stanford copies at a range of edge levels.",
        "Their sum, the pitch, does not move with the level; what one gains the",
        "other loses. A difference that holds across the range is not the level's.",
        "",
        "level |        slot (px)         |       bridge (px)        |    pitch (px)",
        "      |    St1     St2     diff  |    St1     St2     diff  |    St1     St2",
        "-" * 78,
    ]
    table: dict[str, dict[float, tuple[float, float, float]]] = {}
    for siglum, druid, index in (("St1", "mf320jq4997", 0), ("St2", "wv912mm2332", 1)):
        clear = alone(from_edition(edition["copies"][index]))
        held = spread([h for h in clear if 200 <= h.length <= 1200], sample)
        got = images.gather(lambda d, h: images.sweep(d, h, LEVELS), druid, held)
        table[siglum] = {}
        for level in LEVELS:
            slots = [s for one in got if level in one for s in one[level][0][1:-1]]
            bridges = [b for one in got if level in one for b in one[level][1][1:-1]]
            pitches = [
                a + b for one in got if level in one
                for a, b in list(zip(*one[level]))[1:-1]
            ]
            table[siglum][level] = (st.median(slots), st.median(bridges), st.median(pitches))

    for level in LEVELS:
        a, b = table["St1"][level], table["St2"][level]
        rows.append(
            " %.1f  | %6.3f %7.3f %7.3f | %6.3f %7.3f %7.3f | %6.3f %7.3f"
            % (level, a[0], b[0], b[0] - a[0], a[1], b[1], b[1] - a[1], a[2], b[2])
        )
    return "\n".join(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scans", type=Path, default=SCANS)
    parser.add_argument("--edition", type=Path, default=EDITION)
    parser.add_argument("--sample", type=int, default=260)
    args = parser.parse_args()

    edition = json.loads(args.edition.read_text())
    measured = [stated(copy, args.sample, edition) for copy in COPIES]

    (HERE / "punch.txt").write_text(punch_table(measured) + "\n")
    (HERE / "advance.txt").write_text(advance_table(measured) + "\n" + onset_table(edition) + "\n")
    (HERE / "sweep.txt").write_text(sweep_table(edition, args.sample) + "\n")

    print(punch_table(measured))
    print()
    print(advance_table(measured))
    print(onset_table(edition))


if __name__ == "__main__":
    main()
