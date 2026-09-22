"""What the punch dates say about when the punch changed.

    python3 summary.py

The corpus check in ../corpus.py found the punch width of Stanford's red
rolls to be bimodal at Hagmann's two values and belonging to the copy rather
than to the title, but could bound the change only between January 1914,
which is roll 225's later Stanford copy, and November 1922, which is the
dated control. A date read off each copy narrows that from both sides: the
latest dated copy with a wide punch and the earliest with a narrow one.

Writes summary.txt beside this script.
"""

from __future__ import annotations

import json
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

import condon
from rolls import index_entries

HERE = Path(__file__).resolve().parent
DPI = 300.25
BUILD = "Mar 26 2019 16:32:26"
WIDE, NARROW = 2.05, 1.95
OLD_PITCH = 2.75
LONG_STEP = 0.75
RESOLVED = 0.25
COMB = (0.85, 1.15)   # a period this near 1.0 mm is the early advance; 1.4 to 1.6 is not


def measured(name: str, field: str, floor: float = 0.0) -> dict[str, float]:
    """One column of pitch.json or step.json, keyed by druid."""
    path = HERE / name
    if not path.exists():
        return {}
    return {
        row["druid"]: row[field]
        for row in json.loads(path.read_text())
        if row.get(field) and row.get("strength", 1.0) >= floor
    }


def machines(records: list[dict]) -> list[str]:
    """When each state of the perforator was in use, as the dates show it.

    Two quantities separate the states, and they do not agree about what kind
    of criterion they are. The pitch names which of two perforators cut a
    copy, and both were in service for a decade, so it cannot bound a date.
    The advance changed once, and every dated copy falls on the right side of
    it.
    """
    pitch = measured("pitch.json", "pitch")
    step = {
        druid: value for druid, value in measured("step.json", "advance", RESOLVED).items()
        if value < LONG_STEP or COMB[0] <= value <= COMB[1]
    }

    def span(kept: list[dict], label: str) -> str:
        dates = sorted(r["date_iso"] for r in kept)
        return "  %-28s %3d copies   %s to %s" % (label, len(kept), dates[0], dates[-1])

    lines = ["", "The two quantities that separate the states of the machine.", ""]
    for holder, low, high, a, b in [
        (pitch, OLD_PITCH, None, "pitch 2.75 mm and over", "pitch under 2.75 mm"),
        (step, LONG_STEP, None, "advance 0.75 mm and over", "advance under 0.75 mm"),
    ]:
        over = [r for r in records if holder.get(r["druid"], 0) >= low]
        under = [r for r in records if r["druid"] in holder and holder[r["druid"]] < low]
        if over and under:
            lines.append(span(over, a))
            lines.append(span(under, b))
            lines.append("")

    long_copies = sorted(
        (r["date_iso"], r["welte_number"])
        for r in records
        if step.get(r["druid"], 0) >= LONG_STEP
    )
    first_short = min((r["date_iso"] for r in records
                       if r["druid"] in step and step[r["druid"]] < LONG_STEP), default=None)
    before = [d for d, _ in long_copies if first_short and d < first_short]
    if before:
        lines += [
            "  The advance changed once, between %s and %s." % (before[-1], first_short),
            "  Copies with the long advance dated after that: %s." % (
                ", ".join("%s (Welte %s)" % (d, w) for d, w in long_copies if d > first_short)
                or "none"),
        ]
    return lines


def widths() -> dict[str, float]:
    """The parser's average hole width, for the rolls one build measured alike."""
    out = {}
    for entry in index_entries():
        if entry.get("SOFTWARE_DATE") != BUILD or entry.get("THRESHOLD") != "249":
            continue
        try:
            width = float(entry["AVG_HOLE_WIDTH"].rstrip("px")) * 25.4 / DPI
        except (KeyError, ValueError):
            continue
        if width <= 4:
            out[entry["DRUID"]] = width
    return out


def dated(records: list[dict]) -> list[dict]:
    return sorted(
        (r for r in records if r.get("date_iso") and r.get("confidence") in ("high", "medium")),
        key=lambda r: r["date_iso"],
    )


def timeline(rows: list[tuple[str, dict, float]]) -> list[str]:
    """Every dated copy whose punch was measured, in order, with its width."""
    lines = [
        "",
        "Dated copies against their punch, as AVG_HOLE_WIDTH of the SUPRA index:",
        "the same quantity whose bimodality ../corpus.txt reports, so the two",
        "tables compare. It is the parser's own box and runs a little under the",
        "width measured at half contrast in ../punch.txt.",
        "",
        "  punched      Welte  punch     druid         read as",
    ]
    lines += [
        "  %-11s %5s  %.3f mm  %s  %s" % (
            record["date_iso"], record["welte_number"], width, record["druid"],
            (record.get("inscription") or record.get("reading") or "").replace("\n", " ")[:46],
        )
        for _, record, width in rows
    ]
    return lines


def boundary(rows: list[tuple[str, dict, float]]) -> list[str]:
    wide = [(r["date_iso"], r, w) for _, r, w in rows if w >= WIDE]
    narrow = [(r["date_iso"], r, w) for _, r, w in rows if w < NARROW]
    if not wide or not narrow:
        return ["", "Not enough dated copies on both sides of the change to bound it."]

    latest = max(wide, key=lambda row: row[0])
    earliest = min(narrow, key=lambda row: row[0])
    return [
        "",
        "The change in the punch, as the dated copies bound it.",
        "",
        "  latest wide punch    %s  Welte %-5s %.3f mm  %s" % (
            latest[0], latest[1]["welte_number"], latest[2], latest[1]["druid"]),
        "  earliest narrow      %s  Welte %-5s %.3f mm  %s" % (
            earliest[0], earliest[1]["welte_number"], earliest[2], earliest[1]["druid"]),
        "",
        "  %d dated copies with a wide punch, %d with a narrow one." % (len(wide), len(narrow)),
        "  Overlapping: %d wide copies dated after the earliest narrow one." % (
            sum(1 for row in wide if row[0] > earliest[0])),
    ]


def by_year(rows: list[tuple[str, dict, float]]) -> list[str]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for date, _, width in rows:
        grouped[date[:4]].append(width)
    lines = ["", "Median punch by year of punching.", "", "  year   copies   median punch   share >= 2.0 mm"]
    lines += [
        "  %s    %4d      %.3f mm         %3.0f %%" % (
            year, len(group), st.median(group),
            100 * sum(1 for w in group if w >= 2.0) / len(group))
        for year, group in sorted(grouped.items())
    ]
    return lines


def both_ways(records: list[dict], measured: dict[str, float]) -> list[str]:
    """Titles Stanford holds as a wide copy and a narrow one, with their dates.

    One matrix and two copies, one either side of the change, so a pair
    brackets the change for that title without any other roll entering. If
    the two dates of a pair turn out close together, that bears directly on
    whether two perforators were running at once.
    """
    grouped: dict[int, list[dict]] = defaultdict(list)
    for record in records:
        if record["welte_number"] and record["druid"] in measured:
            grouped[record["welte_number"]].append(record)

    split = sorted(
        (number, group) for number, group in grouped.items()
        if len(group) > 1
        and max(measured[r["druid"]] for r in group) >= WIDE
        and min(measured[r["druid"]] for r in group) < NARROW
    )
    if not split:
        return []

    def side(record: dict) -> str:
        return "%s %.3f %s" % (
            record["druid"], measured[record["druid"]],
            record["date_iso"] or "unread")

    lines = [
        "",
        "Titles held both ways: one matrix, a wide copy and a narrow one. These",
        "show that a title could go to either machine. They do NOT date the",
        "change and they are not evidence for the two machines running at once:",
        "in every pair whose copies are both dated at high or medium confidence,",
        "the wide copy falls in 1904-1913 and the narrow one in 1914-1925, which",
        "is what a single changeover would leave. Twelve titles of 418 is no",
        "sample. The overlap rests on individual copies, not on these.",
        "%d pairs." % len(split),
        "",
    ]
    lines += [
        "  Welte %-5d  %s   |   %s" % (
            number,
            side(min(group, key=lambda r: measured[r["druid"]])),
            side(max(group, key=lambda r: measured[r["druid"]])))
        for number, group in split
    ]
    dated_pairs = [
        (number, group) for number, group in split
        if all(r["date_iso"] for r in group)
    ]
    lines.append("")
    lines.append("  %d of the %d pairs have both copies dated." % (len(dated_pairs), len(split)))
    return lines


def set_aside(records: list[dict]) -> list[str]:
    """Readings the table above leaves out, so that leaving them out is visible."""
    doubtful = [r for r in records if r.get("date_iso") and r.get("confidence") == "low"]
    unsigned = [
        r for r in records
        if not r.get("date_iso") and (r.get("hand") or r.get("roll_number"))
    ]
    lines = []
    if doubtful:
        lines += [
            "",
            "Dates read but not used, one figure or the grouping being arguable.",
            "",
        ]
        lines += [
            "  %-11s %5s  %s  %s" % (
                r["date_iso"], r["welte_number"], r["druid"], (r.get("inscription") or "")[:40])
            for r in sorted(doubtful, key=lambda r: r["date_iso"])
        ]
    if unsigned:
        lines += [
            "",
            "Copies inscribed without a date: a name, a number, or both. %d of them." % len(unsigned),
            "",
        ]
        lines += [
            "  %5s  %-12s  %s" % (r["welte_number"], r["druid"], (r.get("inscription") or "")[:46])
            for r in sorted(unsigned, key=lambda r: (r["welte_number"] is None, r["welte_number"]))
        ]
    return lines


def hands(records: list[dict]) -> list[str]:
    """The names and initials written with the dates, and how many rolls each signed."""
    counted = Counter(
        (record.get("hand") or "").strip()
        for record in records
        if (record.get("hand") or "").strip()
    )
    if not counted:
        return []
    return ["", "The hands that signed the dates.", ""] + [
        "  %-18s %3d" % (name, count) for name, count in counted.most_common()
    ]


def main() -> None:
    records = condon.records()
    measured = widths()
    rows = [
        (record["date_iso"], record, measured[record["druid"]])
        for record in dated(records)
        if record["druid"] in measured
    ]

    report = "\n".join([
        "Punch dates read off the scans of Stanford's red Welte rolls.",
        "%d rolls searched, %d with a date read, %d of those measured by the parser." % (
            len(records), len(dated(records)), len(rows)),
        *timeline(rows),
        *by_year(rows),
        *boundary(rows),
        *machines(dated(records)),
        *both_ways(records, measured),
        *set_aside(records),
        *hands(records),
    ])
    (HERE / "summary.txt").write_text(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
