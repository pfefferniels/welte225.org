#!/usr/bin/env python3
"""The same stretch of every copy of an edition, cut from its scan and laid
one above the other: what the paper has where the copies are said to differ.

    python3 strips.py out/wm1253/edition.jsonld 2500 2700 1-10 strips.png [--cacert root.pem]

The stretch is given in millimetres on the reference copy and the tracks
as the bar counts them; each copy's alignment and calibration, as the
edition has them, say where that is on its own scan. The roll runs from
left to right with the bass at the bottom. Needs Pillow and curl.

Stanford's image server ends its certificate chain in "emSign Root CA -
G1", which not every trust store holds; `--cacert` takes that root, as
Chrome's root store has it
(chromium/chromium: net/data/ssl/chrome_root_store/root_store.certs).
"""
import io
import json
import subprocess
import sys

from PIL import Image, ImageDraw

args = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
cacert = sys.argv[sys.argv.index('--cacert') + 1] if '--cacert' in sys.argv else None
if cacert: args.remove(cacert)
edition_path, start, end, tracks, out = args[0], float(args[1]), float(args[2]), args[3], args[4]
first, last = (int(t) for t in tracks.split('-'))
edition = json.load(open(edition_path))
MARGIN, LABEL = 26, 22


def cut(scan, x, y, width, height):
    url = f'{scan.rstrip("/")}/{x},{y},{width},{height}/full/0/default.jpg'
    command = ['curl', '-sS', '--fail', '-m', '180', *(['--cacert', cacert] if cacert else []), url]
    return Image.open(io.BytesIO(subprocess.run(command, capture_output=True, check=True).stdout)).convert('RGB')


rows = []
for copy in edition['copies']:
    measurements = copy['measurements']
    grid, dpi = measurements['trackCalibration'], measurements['scanResolution']['value']
    alignment = measurements.get('alignment')
    # a place on the reference copy, on this copy's own paper
    own = (lambda place: (place - alignment['shift']['horizontal']) / alignment['scale']) if alignment else (lambda place: place)
    column = lambda t, grid=grid: grid['offset'] + grid['separation'] * (t - grid['shift'])
    x0, x1 = round(column(first - 1.5)), round(column(last + 1.5))
    y0, y1 = round(own(start) / 25.4 * dpi), round(own(end) / 25.4 * dpi)
    # turned a quarter: the roll then runs from left to right and the bass lies at the bottom
    strip = cut(copy['scan'], max(x0, 0), max(y0, 0), x1 - max(x0, 0), y1 - max(y0, 0)).transpose(Image.ROTATE_90)
    rows.append((copy.get('siglum') or copy.get('@id', ''), strip, max(x0, 0), column))

width = max(strip.width for _, strip, _, _ in rows) + MARGIN
sheet = Image.new('RGB', (width, sum(strip.height + LABEL for _, strip, _, _ in rows) + 18), 'white')
draw, y = ImageDraw.Draw(sheet), 0
for siglum, strip, x0, column in rows:
    draw.text((4, y + 4), f'{siglum}   {start:.0f} to {end:.0f} mm on the reference copy', fill='black')
    y += LABEL
    sheet.paste(strip, (MARGIN, y))
    for t in range(first, last + 1):
        draw.text((2, y + strip.height - (column(t) - x0) - 6), str(t), fill=(200, 0, 0))
    y += strip.height
for place in range(int(start // 50 + 1) * 50, int(end) + 1, 50):
    x = MARGIN + round((place - start) / (end - start) * (width - MARGIN))
    draw.line([(x, y), (x, y + 5)], fill='black')
    draw.text((x - 12, y + 6), str(place), fill='black')
sheet.save(out)
print(out, sheet.size)
