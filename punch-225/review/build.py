"""Build the payload for the review page, from the candidates and their crops.

A published Artifact may not load an image from another host, so the crops
cannot be linked live from Stanford: whatever is to be looked at travels with
the page. Only the best-scoring candidate of each roll carries a picture —
454 of them at a readable width come to some six megabytes — and the rest are
listed by their box, their score and the reason they were kept, each with a
link to open at Stanford.

The crops are rendered by dates/crops.py, which stacks each region twice, the
second turned 180 degrees, because the writing runs in both directions along
the roll and the rotation is not a constant.

    python3 build.py [--width N] [--quality N]

Writes data.js beside this script.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from dates import condon  # noqa: E402

PITCH = ROOT / "dates" / "pitch.json"
STEP = ROOT / "dates" / "step.json"
CROPS = ROOT / "cache" / "crops"
SUPRA = HERE / "regions.json"

KEEP = 4

# Readings that want a wider crop before anything rests on them. They stay in
# the list and keep their date; they are only kept out of the summary, so that
# a doubtful reading cannot set the earliest or latest date of either machine.
FLAGGED = {
    "gg384dv5303": "written number 1253 does not match the catalogue's 194; wants a wider crop",
    "ng103jj1150": "the line is cut by the crop boundary; the year could be 3, 5 or 8",
}


def plain(text: str | None) -> str | None:
    if not text:
        return None
    return re.sub(r"&#x([0-9A-Fa-f]+);", lambda m: chr(int(m.group(1), 16)), text)


def picture(name: str, width: int, quality: int) -> str | None:
    path = CROPS / name
    if not path.exists():
        return None
    try:
        image = Image.open(path)
        image.thumbnail((width, 6000), Image.LANCZOS)
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=quality, optimize=True)
    except Exception:
        return None
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


def punches() -> dict[str, float | None]:
    if not SUPRA.exists():
        return {}
    return {r["druid"]: r["punch_mm"] for r in json.loads(SUPRA.read_text())}


def pitches() -> dict[str, dict]:
    """Slot, bridge and pitch per roll, swept over the archive.

    The pitch is what sorts a copy by the machine that cut it. It is the
    sum of a slot and the bridge after it, and where the grey level chosen
    for an edge moves those two against each other it leaves their sum
    alone, so it compares across scans where a diameter does not.
    """
    if not PITCH.exists():
        return {}
    return {r["druid"]: r for r in json.loads(PITCH.read_text()) if r.get("pitch")}


def advances() -> dict[str, dict]:
    """The perforator's advance per roll, and how well the period resolved.

    Unlike the pitch this comes from the analysis alone, with no image
    fetched: it is the period the slot lengths keep, and `strength` is how
    far their phases are from scattered. Below about 0.25 the roll simply
    does not use enough different lengths to show one.
    """
    if not STEP.exists():
        return {}
    return {r["druid"]: r for r in json.loads(STEP.read_text()) if r.get("advance")}


def box_of(view: dict | None) -> str | None:
    """A view's IIIF box in the form condon-dates stores a crop in."""
    if not view or not all(key in view for key in "xywh"):
        return None
    return f"{view['x']},{view['y']},{view['w']},{view['h']}"


def read_at(record: dict) -> tuple[int | None, str | None]:
    """Which region a reading came from, and which of its crops.

    condon-dates keeps the box the reader looked at. The region whose view,
    or whose view re-cut wider to the east or west, has that box is the one
    read; the number returned is only its place in this file's list.
    """
    crop = record.get("crop")
    if not crop:
        return None, None
    return next(
        ((index, side)
         for index, region in enumerate(record.get("regions") or [], 1)
         for side in (None, "e", "w")
         if box_of(region.get(f"view_{side}" if side else "view")) == crop["box"]),
        (None, None),
    )


def region_of(region: dict, n: int, read: bool) -> dict:
    """One candidate, keeping the number the reader knew it by.

    The read region is found by its place in the file's list, not in order
    of score. Sorting them by score before
    picking the picture is how an earlier version of this page came to show
    the highest-scoring patch of a roll beside a date read off a different
    one, on 94 of the 404 rolls that carry a reading.
    """
    return {
        "n": n,
        "read": read,
        "box": [region["x"], region["y"], region["w"], region["h"]],
        "score": region.get("score"),
        "why": region.get("why"),
        "after": region.get("after_last_hole"),
        "url": region.get("iiif_url"),
        "view": (region.get("view") or {}).get("url"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=760)
    parser.add_argument("--quality", type=int, default=60)
    args = parser.parse_args()

    records = condon.records()
    punch = punches()
    pitch = pitches()
    step = advances()

    rolls = []
    pictures = {}
    for record in records:
        druid = record["druid"]
        listed = record.get("regions", []) or []
        index, side = read_at(record)

        # The picture is of the line that was actually read, where there is
        # one; only where nothing was read does the best-scoring patch stand
        # in for it.
        shown = None
        if index and 1 <= index <= len(listed):
            shown = listed[index - 1]
        elif listed:
            shown = max(listed, key=lambda r: r.get("score") or 0)

        if shown:
            view = (side and shown.get(f"view_{side}")) or shown.get("view") or {}
            if view.get("file"):
                shot = picture(view["file"], args.width, args.quality)
                if shot:
                    pictures[druid] = shot

        numbered = [
            region_of(region, i, i == index)
            for i, region in enumerate(listed, 1)
        ]
        # The read one first, then the rest by score, so the picture is
        # always the first thing listed.
        regions = sorted(numbered, key=lambda r: (not r["read"], -(r["score"] or 0)))

        rolls.append({
            "druid": druid,
            "welte": record.get("welte_number"),
            "callnum": (record.get("callnum") or "").replace("Stanford Libraries ", "") or None,
            "title": plain(record.get("title")),
            "performer": plain(record.get("performer")),
            "punch": punch.get(druid),
            "pitch": (pitch.get(druid) or {}).get("pitch"),
            "slot": (pitch.get(druid) or {}).get("slot"),
            "bridge": (pitch.get(druid) or {}).get("bridge"),
            "teilung": (pitch.get(druid) or {}).get("teilung"),
            "advance": (step.get(druid) or {}).get("advance"),
            "advanceR": (step.get(druid) or {}).get("strength"),
            "purl": f"https://purl.stanford.edu/{druid}",
            "regions": regions[:KEEP],
            "more": max(0, len(regions) - KEEP),
            "reading": record.get("reading"),
            "date": record.get("date_iso"),
            "confidence": record.get("confidence") or "none",
            "inscription": plain(record.get("inscription")),
            "hand": plain(record.get("hand")),
            "onpaper": record.get("roll_number"),
            "notes": plain(record.get("notes")),
            "flagged": FLAGGED.get(druid),
        })

    rolls.sort(key=lambda r: (r["welte"] is None, r["welte"] or 0, r["druid"]))

    payload = {"rolls": rolls, "pictures": pictures}
    out = HERE / "data.js"
    out.write_text("window.ROLLS = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")

    dated = [r for r in rolls if r["date"] and r["pitch"]]
    print(f"{len(rolls)} rolls, {len(pictures)} with a crop, "
          f"{sum(1 for r in rolls if r['pitch'])} with a pitch, {len(dated)} dated and measured")
    print(f"wrote data.js, {out.stat().st_size // 1024 // 1024} MB")


if __name__ == "__main__":
    main()
