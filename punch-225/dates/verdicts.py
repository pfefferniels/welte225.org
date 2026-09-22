"""Niels's own verdicts on the readings, folded back into the corpus.

    python3 verdicts.py [--from cache/verdicts]

The review artifact carries, under every roll, two buttons and a text field.
What the buttons mean depends on whether a reader got anything:

    a reading exists    stands   the reading is right
                        wrong    it is misread or cannot be made out
    no reading          blank    this copy carries no punch date at all
                        missed   a date is there and the search did not find it

Each writes a document to the artifact's own database, one per roll, under
`verdicts/{druid}`. Those documents are the editor's, not a reader's, so
they outrank everything else here.

The last two are not the same as silence, and neither is a failure. `blank`
is a finding: a roll with no date is evidence about how many copies were
dated at all, and 168 rolls with no reading are ambiguous where 168 minus
the blanks is a denominator. `missed` is a work item, and the only honest
measure of what the ink search failed to surface.

This turns a dump of that collection into readings/reviewed.json, which
merge.py reads before any other file and so lets win. Getting the dump needs
the ArtifactData tool rather than this script:

    ArtifactData action=list url=<artifact> collection=verdicts
                 out_dir=punch-225/cache/verdicts

then run this. A verdict of "stands" confirms the reading at the confidence
it already had; a verdict of "wrong" with no correction withdraws the date
and leaves the roll undated; a correction replaces the inscription, and its
date is parsed from it where the wording allows.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
DUMP = HERE.parent / "cache" / "verdicts"
OUT = HERE / "readings" / "reviewed.json"

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "mär": 3, "maer": 3, "apr": 4, "mai": 5, "may": 5,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "okt": 10, "oct": 10, "nov": 11, "dez": 12, "dec": 12,
}


def date_of(text: str) -> str | None:
    """A date out of what the editor typed, in the forms this workshop used."""
    if not text:
        return None
    plain = text.strip()

    iso = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", plain)
    if iso:
        return iso.group(0)

    # A month written out. The month names go into the pattern rather than
    # being looked up after it, so that a name standing where a month might
    # ("225. Fritz. 18 Jan 09.") does not consume the date behind it.
    named = "|".join(sorted(MONTHS, key=len, reverse=True))
    for found in re.finditer(
            r"(?<!\d)(\d{1,2})\.?\s*(%s)[A-Za-zÄÖÜäöü]*\.?\s*(\d{2}|\d{4})(?!\d)" % named,
            plain, re.I):
        day = int(found.group(1))
        if 1 <= day <= 31:
            return "%s-%02d-%02d" % (
                _year(found.group(3)), MONTHS[found.group(2)[:3].lower()], day)

    for found in re.finditer(r"(?<!\d)(\d{1,2})\s*[.,\-/ ]\s*(\d{1,2})\s*[.,\-/ ]\s*(\d{2}|\d{4})(?!\d)", plain):
        day, month = int(found.group(1)), int(found.group(2))
        if 1 <= day <= 31 and 1 <= month <= 12:
            return "%s-%02d-%02d" % (_year(found.group(3)), month, day)

    # The compressed form the workshop used, on roll 225's own convention that
    # 14114 is 14.1.1914. Spaces inside a run of figures are ignored, since
    # the readers transcribe "19 623" for what the paper writes unbroken.
    # Only a run with exactly one possible split is taken.
    for found in re.finditer(r"(?<!\d)(\d[\d ]{3,6}\d)(?!\d)", plain):
        digits = found.group(1).replace(" ", "")
        if not 5 <= len(digits) <= 6:
            continue
        splits = {
            (int(digits[:d]), int(digits[d:d + m]), digits[d + m:])
            for d in (1, 2) for m in (1, 2)
            if d + m + 2 == len(digits)
        }
        possible = [
            (day, month, year) for day, month, year in splits
            if 1 <= day <= 31 and 1 <= month <= 12
        ]
        if len(possible) == 1:
            day, month, year = possible[0]
            return "%s-%02d-%02d" % (_year(year), month, day)
    return None


def _year(digits: str) -> str:
    return digits if len(digits) == 4 else "19%s" % digits


def collected(folder: Path) -> list[dict]:
    """Every verdict document the dump holds, as reading records."""
    out = []
    for path in sorted(folder.rglob("*.json")):
        entry = json.loads(path.read_text())
        druid = entry.get("druid") or path.stem
        verdict = (entry.get("verdict") or "").strip().lower()
        correction = (entry.get("correction") or "").strip()
        if not verdict and not correction:
            continue

        record = {
            "druid": druid,
            "region": None,
            "inscription": correction or entry.get("was"),
            "reading": correction or entry.get("was"),
            "roll_number": None,
            "hand": None,
            "verdict": verdict or ("corrected" if correction else None),
            "date_iso": None,
            "confidence": "none",
            "notes": "reviewed by the editor in the artifact on %s" % (entry.get("at") or "an unrecorded date"),
        }
        if correction:
            record["verdict"] = "corrected"
            record["date_iso"] = date_of(correction)
            record["confidence"] = "high" if record["date_iso"] else "none"
            record["notes"] += (
                "; corrected from %r" % (entry.get("was") or "")
                + ("" if record["date_iso"] else ", and no date could be parsed from the correction"))
        elif verdict == "wrong":
            record["inscription"] = entry.get("was")
            record["notes"] += "; marked wrong or unreadable, the date withdrawn"
        elif verdict == "blank":
            record["inscription"] = None
            record["reading"] = None
            record["notes"] += "; the editor finds no punch date written on this copy"
        elif verdict == "missed":
            record["inscription"] = None
            record["reading"] = None
            record["notes"] += "; a date is on this roll and the ink search did not surface it"
        else:
            record["date_iso"] = date_of(entry.get("was") or "")
            record["confidence"] = "high"
            record["notes"] += "; the reading confirmed"
        out.append(record)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="folder", type=Path, default=DUMP)
    args = parser.parse_args()

    if not args.folder.exists():
        raise SystemExit(
            "no verdicts at %s — dump them first with the ArtifactData tool:\n"
            "  action=list collection=verdicts out_dir=%s" % (args.folder, args.folder))

    records = collected(args.folder)
    OUT.write_text(json.dumps(records, indent=1, ensure_ascii=False) + "\n")

    counted: dict[str, int] = {}
    for record in records:
        counted[record["verdict"] or "unmarked"] = counted.get(record["verdict"] or "unmarked", 0) + 1
    print("%d verdicts, %d of them giving a date" % (
        len(records), sum(1 for r in records if r["date_iso"])))
    for verdict in sorted(counted):
        print("   %-10s %d" % (verdict, counted[verdict]))
    missed = [r["druid"] for r in records if r["verdict"] == "missed"]
    if missed:
        print("\n%d rolls the editor says carry a date the search missed:" % len(missed))
        print("   " + " ".join(missed))
        print("   these want a wider crop: python3 crops.py --tag w --across 1100 --along 2600 --druids " + ",".join(missed))
    print("\nwrote %s; run merge.py to fold it into candidates.json" % OUT)


if __name__ == "__main__":
    main()
