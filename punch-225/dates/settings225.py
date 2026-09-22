"""The perforator setting of roll 225's five scanned copies: chain pitch and advance.

    python3 settings225.py

St1 and St2 are Stanford scans, so their chain pitch is the one pitch.py took
from the images, as for every other Stanford roll. Wi1, Ch1 and Bo1 exist only
as local scans, so theirs is taken from roll-image-parser's slots instead:
for each held note, the distance from the first inner slot to the last divided
by the steps between them, which reads to a fraction of a pixel where the
median of single distances would round to whole ones. On St1 and St2 that
route gives 3.003 and 2.999 mm against the images' 3.001 and 2.999.

The advance is the strongest period the slot lengths keep (../advance.py),
for all five alike. A period is held likely when it is found at a strength of
at least 0.35 and the pitch is within 0.15 of a whole number of it, possible
when only one of the two holds, and unlikely when neither does.

Ch1's scan was resampled from 180 lines per inch along the roll by
../../../rollscan2image/cis2roll.py, so its millimetres along the roll rest on
the scanner's header; the ratio of pitch to advance does not.

Writes settings225.json beside this script.
"""

from __future__ import annotations

import json
import statistics as st
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import corpus                          # noqa: E402
from advance import gaps, peaks        # noqa: E402
from holes import Hole, aton, rollinfo  # noqa: E402

SCANS = Path("/Users/nielspfeffer/Projects/rollscan2image/scans")
STANFORD = {"St1": "mf320jq4997", "St2": "wv912mm2332"}
LOCAL = {
    "Wi1": SCANS / "WR0225_02_2023-04-12_09-29-48"
                 / "WR0225_02_2023-04-12_09-29-48_I_Schumann_Traeumere_analysis_straightened_300.25dpi.txt",
    "Ch1": SCANS / "chase_WelteLicensee_225_Gruenfeld" / "WelteLicensee_225_Gruenfeld_Traeumerei_analysis.txt",
    "Bo1": SCANS / "dyer_WelteT98_225_Gruenfeld" / "WelteT98_225_Gruenfeld_Traeumerei_analysis.txt",
}
BRIDGE_REACH = 30          # px; a longer gap on one track ends the note
INNER_SLOTS = 6            # a note needs this many slots between its ends to count
LEAST_STRENGTH = 0.35
WHOLE = 0.15


@dataclass(frozen=True)
class ChainPitch:
    value: float
    n: int
    method: str
    slot: float | None = None
    bridge: float | None = None
    spread: float | None = None      # interquartile range over notes, mm


@dataclass(frozen=True)
class Advance:
    value: float
    strength: float
    n: int
    others: list[list[float]]


@dataclass(frozen=True)
class Setting:
    siglum: str
    chain_pitch: ChainPitch
    advance: Advance

    @property
    def steps(self) -> float:
        return self.chain_pitch.value / self.advance.value

    @property
    def advance_certainty(self) -> str:
        strong = self.advance.strength >= LEAST_STRENGTH
        whole = abs(self.steps - round(self.steps)) <= WHOLE
        return "likely" if strong and whole else "possible" if strong or whole else "unlikely"


def notes(holes: list[Hole]) -> list[list[Hole]]:
    """The slots of each held note, one run per note, on each track."""
    by_track: dict[int | None, list[Hole]] = {}
    for hole in holes:
        by_track.setdefault(hole.track, []).append(hole)
    runs = []
    for track in by_track.values():
        track.sort(key=lambda hole: hole.row)
        run = [track[0]]
        for previous, hole in zip(track, track[1:]):
            if 0 <= hole.row - (previous.row + previous.length) <= BRIDGE_REACH:
                run.append(hole)
            else:
                runs.append(run)
                run = [hole]
        runs.append(run)
    return [run[1:-1] for run in runs if len(run) - 2 >= INNER_SLOTS]


def parsed_pitch(holes: list[Hole], dpi: float) -> ChainPitch:
    per_note = [(inner[-1].row - inner[0].row) / (len(inner) - 1) for inner in notes(holes)]
    quartiles = st.quantiles(per_note, n=4)
    mm = 25.4 / dpi
    return ChainPitch(
        value=round(st.median(per_note) * mm, 4),
        n=len(per_note),
        method="roll-image-parser slots, one sub-pixel pitch per held note",
        spread=round((quartiles[2] - quartiles[0]) * mm, 4),
    )


def folded_advance(holes: list[Hole], dpi: float) -> Advance:
    found = peaks(gaps([hole.length * 25.4 / dpi for hole in holes]))
    best = max(found, key=lambda item: item[1])
    return Advance(
        value=round(best[0], 4),
        strength=round(best[1], 4),
        n=len(holes),
        others=[[round(p, 4), round(r, 4)] for p, r in found if p != best[0]][:3],
    )


def stanford(siglum: str, druid: str) -> Setting:
    image = {row["druid"]: row for row in json.loads((HERE / "pitch.json").read_text())}[druid]
    step = {row["druid"]: row for row in json.loads((HERE / "step.json").read_text())}[druid]
    return Setting(
        siglum=siglum,
        chain_pitch=ChainPitch(value=image["pitch"], n=image["n"], method="pitch.py, on the IIIF images",
                               slot=image["slot"], bridge=image["bridge"]),
        advance=Advance(value=step["advance"], strength=step["strength"], n=step["n"],
                        others=[pair for pair in step["others"] if pair[0] != step["advance"]]),
    )


def local(siglum: str, path: Path) -> Setting:
    dpi = float(rollinfo(path)["LENGTH_DPI"])
    holes = aton(path)
    return Setting(siglum=siglum, chain_pitch=parsed_pitch(holes, dpi), advance=folded_advance(holes, dpi))


def main() -> None:
    settings = [stanford(s, d) for s, d in STANFORD.items()] + [local(s, p) for s, p in LOCAL.items()]
    rows = [{**asdict(s), "steps": round(s.steps, 3), "advance_certainty": s.advance_certainty} for s in settings]
    (HERE / "settings225.json").write_text(json.dumps(rows, indent=1) + "\n")
    for s in settings:
        print("%s  pitch %.4f mm (n %d)  advance %.4f mm at %.3f  = %.2f steps  %s" % (
            s.siglum, s.chain_pitch.value, s.chain_pitch.n, s.advance.value, s.advance.strength,
            s.steps, s.advance_certainty))


if __name__ == "__main__":
    main()
