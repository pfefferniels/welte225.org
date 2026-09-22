"""The candidate regions as images a reader can actually look at.

    python3 crops.py [--druids a,b,c] [--all]

An inscription runs along the roll, so it only reads when the crop is turned
a quarter turn; and a box drawn tight around the ink usually cuts off what
stands beside it, which on these rolls is the roll's number before the date
and the puncher's name after it. Every crop is therefore opened out to a
minimum of a hand's width of paper before it is written to cache/crops/.

Which quarter turn is not fixed. The two dated copies of roll 225 are written
in opposite directions — Condon Roll 47 reads at a turn clockwise, Roll 48 at
a turn the other way — so the workshop held the roll whichever way came to
hand. Rather than guess, each file carries the crop twice, the lower panel
the upper one turned through 180 degrees, and the reader takes whichever of
the two reads.
"""

from __future__ import annotations

import argparse
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

import ink
from scan import OUT

CROPS = Path(__file__).resolve().parent.parent / "cache" / "crops"
MIN_ACROSS = 460
MIN_ALONG = 1900
FIT = 1500
GAP = 12
BUDGET = 1_100_000


EDGE = 140


def view(region: dict, columns: tuple[int, int], length: int,
         across: int = MIN_ACROSS, along: int = MIN_ALONG,
         width_px: int = 4096) -> tuple[int, int, int, int]:
    """The region opened out to a readable minimum.

    The bound is the image, not the paper columns. Those come from the hard
    margins, which are the narrowest the margin gets anywhere on the roll, so
    the paper at any particular row usually reaches further out — and the
    workshop wrote at the very edge. Clamping to the nominal edge sheared the
    tops off the figures on rolls whose inscription sits there, which is most
    of them.
    """
    left = max(0, columns[0] - EDGE)
    right = min(width_px, columns[1] + EDGE)
    width = min(max(region["w"], across), right - left)
    height = min(max(region["h"], along), length)
    x = min(max(left, region["x"] + region["w"] // 2 - width // 2), right - width)
    y = min(max(0, region["y"] + region["h"] // 2 - height // 2), length - height)
    return x, y, width, height


def size_for(w: int, h: int) -> str:
    return "full" if max(w, h) <= FIT else "!%d,%d" % (FIT, FIT)


def both_ways(image: Image.Image) -> Image.Image:
    """The crop above, the same crop turned through 180 degrees below."""
    width, height = image.size
    sheet = Image.new("RGB", (width, 2 * height + GAP), (255, 255, 255))
    sheet.paste(image, (0, 0))
    sheet.paste(image.rotate(180), (0, height + GAP))
    if sheet.width * sheet.height > BUDGET:
        shrink = (BUDGET / (sheet.width * sheet.height)) ** 0.5
        sheet = sheet.resize((int(sheet.width * shrink), int(sheet.height * shrink)), Image.LANCZOS)
    return sheet


def fetch(druid: str, box: tuple[int, int, int, int], path: Path) -> tuple[int, int]:
    if path.exists():
        with Image.open(path) as image:
            return image.size
    response = ink.session.get(ink.url(druid, *box, size=size_for(box[2], box[3])), timeout=300)
    response.raise_for_status()
    with Image.open(io.BytesIO(response.content)) as image:
        sheet = both_ways(image.convert("RGB"))
    sheet.save(path, quality=90)
    return sheet.size


def crop_all(records: list[dict], workers: int = 10, tag: str = "",
             across: int = MIN_ACROSS, along: int = MIN_ALONG) -> int:
    CROPS.mkdir(parents=True, exist_ok=True)
    key = "view" + ("_" + tag if tag else "")

    wanted = [
        (record, index, region)
        for record in records
        for index, region in enumerate(record["regions"], start=1)
    ]

    def one(job) -> str | None:
        record, index, region = job
        box = view(region, tuple(record["paper_columns"]), record["image_length"],
                   across, along, record.get("image_width", 4096))
        path = CROPS / ("%s_%s%d.jpg" % (record["druid"], tag, index))
        try:
            got = fetch(record["druid"], box, path)
        except Exception as error:
            region[key] = {"error": "%s: %s" % (type(error).__name__, error)}
            return None
        region[key] = {
            "x": box[0], "y": box[1], "w": box[2], "h": box[3],
            "file": path.name,
            "pixels": list(got),
            "url": ink.url(record["druid"], *box, size=size_for(box[2], box[3])),
        }
        return path.name

    with ThreadPoolExecutor(max_workers=workers) as pool:
        done = [name for name in pool.map(one, wanted) if name]
    return len(done)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--druids")
    parser.add_argument("--workers", type=int, default=10)
    parser.add_argument("--file", type=Path, default=OUT)
    parser.add_argument("--tag", default="", help="prefix the crop number, for a second, wider look")
    parser.add_argument("--across", type=int, default=MIN_ACROSS)
    parser.add_argument("--along", type=int, default=MIN_ALONG)
    args = parser.parse_args()

    records = json.loads(args.file.read_text())
    wanted = set(args.druids.split(",")) if args.druids else None
    chosen = [r for r in records if wanted is None or r["druid"] in wanted]

    made = crop_all(chosen, args.workers, args.tag, args.across, args.along)
    args.file.write_text(json.dumps(records, indent=1, ensure_ascii=False) + "\n")
    print("%d crops for %d rolls, in %s" % (made, len(chosen), CROPS))


if __name__ == "__main__":
    main()
