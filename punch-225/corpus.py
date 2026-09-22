"""Is a 1.8 mm punch real, and does it date a roll? Asked of Stanford's red rolls.

    python3 corpus.py

Roll 225 has no copy with a small punch, which on its own leaves two readings:
either the 1.8 mm of Hagmann's table is not a real measurement, or it is real
and belongs to rolls punched later than any copy of this roll. Two things
separate them, and both are had from Stanford, whose red rolls were all read
on one machine and parsed at one threshold by one build, so their punch widths
are comparable to each other and to the two copies of 225 measured here.

The first is a dated control: roll 3309, whose Stanford copy was punched on
22 November 1922, measured by the same code as the copies of 225.

The second is the SUPRA index, which carries the parser's average hole width
and the Welte catalogue number for 433 red rolls. If the width is bimodal at
Hagmann's two values, the 1.8 mm is real. If a title appears with both widths,
then the width belongs to the copy rather than to the title, which is what a
dating criterion needs. And the highest catalogue number that still shows a
wide punch bounds the change from below, since a copy cannot be older than
the title it carries.

Writes corpus.txt beside this script.
"""

from __future__ import annotations

import bz2
import re
import statistics as st
from collections import defaultdict
from pathlib import Path

import images
from advance import gaps, peaks
from holes import alone, aton, chain_spans, rollinfo, spread

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
DPI = 300.25

INDEX = "https://raw.githubusercontent.com/pianoroll/SUPRA/master/index.aton"
ANALYSES = "https://raw.githubusercontent.com/pianoroll/piano-roll-analyses/main/analysis"

CONTROL = ("jq774vx6544", "roll 3309, Backhaus, Schubert Militärmarsch", "22 Nov 1922")
BUILD = "Mar 26 2019 16:32:26"
WIDE, NARROW = 2.05, 1.95


def mm(pixels: float) -> float:
    return pixels * 25.4 / DPI


def fetched(name: str, url: str) -> Path:
    """Download once into the cache. Uses `requests`, whose certificate
    bundle urllib does not share on this machine."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        response = images.session.get(url, timeout=240)
        response.raise_for_status()
        path.write_bytes(response.content)
    return path


def analysis_of(druid: str) -> Path:
    packed = fetched(f"{druid}_analysis.txt.bz2", f"{ANALYSES}/{druid[0]}/{druid}_analysis.txt.bz2")
    plain = CACHE / f"{druid}_analysis.txt"
    if not plain.exists():
        plain.write_bytes(bz2.decompress(packed.read_bytes()))
    return plain


def rolls() -> list[dict]:
    """The red rolls of the SUPRA index that one build measured alike."""
    text = fetched("supra_index.aton", INDEX).read_text(encoding="utf-8", errors="replace")
    out = []
    for block in text.split("@@BEGIN: ROLL")[1:]:
        field = dict(re.findall(r"^@([A-Z_]+):\s*(.*?)\s*$", block, re.M))
        if field.get("SOFTWARE_DATE") != BUILD or field.get("THRESHOLD") != "249":
            continue
        number = re.search(r"Welte-Mignon\s+(\d+)", field.get("LABEL", ""))
        try:
            width = mm(float(field["AVG_HOLE_WIDTH"].rstrip("px")))
        except (KeyError, ValueError):
            continue
        if number is None or width > 4:
            continue
        out.append({"number": int(number.group(1)), "width": width, "druid": field["DRUID"]})
    return out


def control() -> str:
    """The dated control, measured as the copies of 225 were."""
    druid, label, punched = CONTROL
    path = analysis_of(druid)
    holes = aton(path)
    info = rollinfo(path)

    clear = alone(chain_spans(holes))
    held = spread([h for h in clear if 200 <= h.length <= 1200], 160)
    notes = images.gather(images.chained, druid, held)
    slots = [s for note in notes for s in note.slots[1:-1]]
    bridges = [b for note in notes for b in note.bridges[1:-1]]
    pitches = [p for note in notes for p in note.pitches[1:-1]]
    across = images.gather(images.width, druid, spread([h for h in clear if 16 <= h.length <= 34], 150))
    found = peaks(gaps([mm(h.length) for h in holes]))
    best = max(found, key=lambda item: item[1])

    return "\n".join([
        "A dated control: %s," % label,
        "druid %s, Stanford copy punched %s." % (druid, punched),
        "",
        "  Teilung                      %.3f mm" % mm(float(info["HOLE_SEPARATION"])),
        "  punch across, parser box     %.3f mm  (AVG_HOLE_WIDTH %s)" % (
            mm(st.median([h.width for h in holes])), info["AVG_HOLE_WIDTH"]),
        "  punch across, half contrast  %.3f mm  (n=%d)" % (mm(st.median(across)), len(across)),
        "  slot along the roll          %.3f mm" % mm(st.median(slots)),
        "  bridge                       %.3f mm" % mm(st.median(bridges)),
        "  pitch                        %.3f mm" % mm(st.median(pitches)),
        "  advance                      %.3f mm  (R=%.2f)" % (best[0], best[1]),
        "  round? slot / across         %.3f" % (st.median(slots) / st.median(across)),
    ])


def distribution(found: list[dict]) -> str:
    widths = [roll["width"] for roll in found]
    counted: dict[float, int] = defaultdict(int)
    for width in widths:
        counted[round(width * 10) / 10] += 1

    rows = [
        "",
        "The punch of %d red Welte rolls at Stanford, from the SUPRA index." % len(found),
        "One machine, one threshold, one parser build, so the widths compare.",
        "",
    ]
    top = max(counted.values())
    rows += [
        "  %.1f mm  %-52s %d" % (level, "#" * max(1, round(52 * counted[level] / top)), counted[level])
        for level in sorted(counted)
    ]
    rows += [
        "",
        "  median %.3f mm, and the two modes fall at Hagmann's two values." % st.median(widths),
    ]
    return "\n".join(rows)


def by_number(found: list[dict]) -> str:
    rows = [
        "",
        "Against the Welte catalogue number, which orders the titles and so",
        "gives each copy an earliest possible date.",
        "",
        "  Welte no.      rolls   median punch   share >= 2.0 mm",
    ]
    bands = [(0, 500), (500, 1000), (1000, 1500), (1500, 2000), (2000, 2500), (2500, 3000), (3000, 3500), (3500, 99999)]
    for low, high in bands:
        band = [roll["width"] for roll in found if low <= roll["number"] < high]
        if not band:
            continue
        rows.append("  %5d-%-9d %4d      %.3f mm         %3.0f %%" % (
            low, high - 1, len(band), st.median(band),
            100 * sum(1 for width in band if width >= 2.0) / len(band),
        ))

    wide = [roll for roll in found if roll["width"] >= WIDE]
    rows += [
        "",
        "  No title above Welte %d shows a wide punch; below that the two are" % max(r["number"] for r in wide),
        "  mixed, which is what a width belonging to the copy rather than to the",
        "  title would look like.",
    ]
    return "\n".join(rows)


def both_ways(found: list[dict]) -> str:
    """Titles that exist as a wide copy and as a narrow one."""
    grouped: dict[int, list[dict]] = defaultdict(list)
    for roll in found:
        grouped[roll["number"]].append(roll)

    split = sorted(
        (number, group) for number, group in grouped.items()
        if len(group) > 1
        and max(r["width"] for r in group) >= WIDE
        and min(r["width"] for r in group) < NARROW
    )

    rows = [
        "",
        "Titles held both ways: one matrix, two punches, so the width is the",
        "copy's and not the title's. %d of them." % len(split),
        "",
    ]
    rows += [
        "  Welte %-5d  %s" % (number, "   ".join(
            "%.3f mm (%s)" % (r["width"], r["druid"]) for r in sorted(group, key=lambda r: r["width"])
        ))
        for number, group in split
    ]
    return "\n".join(rows)


def dated(found: list[dict], keep: int = 4) -> str:
    """What Stanford's catalogue says about the latest wide-punch rolls.

    The catalogue number only orders the titles. A date comes from the
    record, and where Condon read one off the roll itself it is a punch
    date rather than a publication date, which is what bounds the change.
    """
    wide = sorted((r for r in found if r["width"] >= WIDE), key=lambda r: -r["number"])[:keep]
    rows = ["", "The latest wide-punch rolls, as Stanford's catalogue dates them.", ""]

    for roll in wide:
        try:
            response = images.session.get(f"https://purl.stanford.edu/{roll['druid']}.json", timeout=60)
            response.raise_for_status()
            record = response.json()
        except Exception:
            rows.append("  Welte %-5d %.3f mm  %s  (record not read)" % (roll["number"], roll["width"], roll["druid"]))
            continue

        description = record.get("description", {})
        dates = [
            value.get("value", "")
            for event in description.get("event", [])
            for value in event.get("date", [])
        ]
        notes = [
            note.get("value", "")
            for note in description.get("note", [])
            if "dated" in note.get("value", "").lower()
        ]
        rows.append("  Welte %-5d %.3f mm  %s  published %s" % (
            roll["number"], roll["width"], roll["druid"], "/".join(sorted(set(dates))) or "–"))
        rows += ["      %s" % note for note in notes]

    return "\n".join(rows)


def main() -> None:
    found = rolls()
    report = "\n".join([control(), distribution(found), by_number(found), both_ways(found), dated(found)])
    (HERE / "corpus.txt").write_text(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
