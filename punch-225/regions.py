"""Where to look on each Stanford roll for the date it was punched.

A punch date is written at the end of the roll, near the rewind, along the
paper's edge and along the roll's length, so it only reads turned a quarter
turn. Roll 225's two dated copies say how far in from the edge and how far
past the last perforation to look: 545 px and 24 px from the treble edge,
2401 px and 401 px past LAST_HOLE. A strip 900 px deep over the end margin
holds both, and is cut from each edge because neither copy proves the treble
side is the only one used.

These are suggestions to review, not findings. They come from the geometry of
each scan alone; nothing here has looked at a single pixel.

    python3 regions.py

Writes review/regions.json.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
INDEX = HERE / "cache" / "supra_index.aton"
OUT = HERE / "review" / "regions.json"

DEPTH = 900
BEFORE = 1500
RENDER = 1800
DPI = 300.25

GEOMETRY = ("IMAGE_WIDTH", "IMAGE_LENGTH", "HARD_MARGIN_BASS", "HARD_MARGIN_TREBLE", "LAST_HOLE")

KNOWN = {
    "mf320jq4997": {"region": [3170, 124010, 264, 1300], "text": "225. Fritz. 18 Jan 09.", "date": "1909-01-18"},
    "wv912mm2332": {"region": [3780, 123060, 140, 930], "text": "225. 14. 114.", "date": "1914-01-14"},
}


def plain(text: str) -> str:
    """The index escapes its non-ASCII as numeric entities."""
    return re.sub(r"&#x([0-9A-Fa-f]+);", lambda m: chr(int(m.group(1), 16)), text)


def url_for(druid: str, box: list[int], render: int | None = RENDER) -> str:
    """A IIIF url for the box, turned a quarter turn so the writing reads.

    The size is given as a height because it applies before the rotation:
    the box's height is the roll's length, which is the long side of the
    picture that comes back, and asking by width would blow the strip up
    rather than scale it down.
    """
    size = f",{render}" if render else "full"
    return (
        f"https://stacks.stanford.edu/image/iiif/{druid}%2F{druid}_0001/"
        f"{box[0]},{box[1]},{box[2]},{box[3]}/{size}/270/default.jpg"
    )


def entries() -> list[dict]:
    text = INDEX.read_text(encoding="utf-8", errors="replace")
    found = []
    for block in text.split("@@BEGIN: ROLL")[1:]:
        field = dict(re.findall(r"^@([A-Z_]+):\s*(.*?)\s*$", block, re.M))
        if field.get("DRUID"):
            found.append(field)
    return found


def strips(field: dict) -> list[dict]:
    """The two edge strips over the end margin, bass side and treble side."""
    geometry = {key: float(field[key].rstrip("px")) for key in GEOMETRY}
    bass = int(geometry["HARD_MARGIN_BASS"])
    treble = int(geometry["IMAGE_WIDTH"] - geometry["HARD_MARGIN_TREBLE"])
    top = max(0, int(geometry["LAST_HOLE"]) - BEFORE)
    height = int(geometry["IMAGE_LENGTH"]) - top

    return [
        {"edge": edge, "box": box, "why": why}
        for edge, box, why in (
            ("treble", [treble - DEPTH, top, DEPTH, height],
             "outer 900 px of the treble edge, from 1500 px before the last perforation to the end"),
            ("bass", [bass, top, DEPTH, height],
             "outer 900 px of the bass edge, over the same stretch"),
        )
    ]


def record(field: dict) -> dict:
    druid = field["DRUID"]
    number = re.search(r"Welte-Mignon\s+(\d+)", field.get("LABEL", ""))
    width = field.get("AVG_HOLE_WIDTH")

    out = {
        "druid": druid,
        "welte": int(number.group(1)) if number else None,
        "callnum": field.get("CALLNUM", "").replace("Stanford Libraries ", "") or None,
        "title": plain(field.get("TITLE", "")) or None,
        "performer": plain(field.get("PERFORMER", "")) or None,
        "punch_mm": round(float(width.rstrip("px")) * 25.4 / DPI, 3) if width else None,
        "purl": f"https://purl.stanford.edu/{druid}",
        "regions": [],
        "reading": None,
        "date_iso": None,
        "confidence": "none",
        "source": "geometry",
    }

    if all(key in field for key in GEOMETRY):
        out["regions"] = [
            {**strip, "url": url_for(druid, strip["box"])} for strip in strips(field)
        ]
    else:
        out["note"] = "the index carries no geometry for this scan; its analysis has to be fetched first"

    if druid in KNOWN:
        known = KNOWN[druid]
        out["known"] = {
            **known,
            "url": url_for(druid, known["region"], render=None),
        }
        out["reading"], out["date_iso"], out["confidence"] = known["text"], known["date"], "high"
        out["source"] = "edition"

    return out


def main() -> None:
    records = [record(field) for field in entries()]
    records.sort(key=lambda r: (r["welte"] is None, r["welte"] or 0, r["druid"]))

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=1))

    with_regions = sum(1 for r in records if r["regions"])
    print(f"{len(records)} rolls, {with_regions} with suggested regions, {len(records) - with_regions} awaiting geometry")
    print(f"wrote {OUT.relative_to(HERE)}")


if __name__ == "__main__":
    main()
