#!/usr/bin/env python3
"""The rolls Stanford's SUPRA archive holds in more than one copy, with
the analysis file of each copy: the list `cycle.mjs` runs over.

    python3 pairs.py --supra ../../pianoroll/SUPRA --analyses ../../pianoroll/piano-roll-analyses > rolls.json

A roll is told by its label ("Welte-Mignon 1213"), a copy by its DRUID.
The files are named relative to the directory the script is run in,
which is where `rolls.json` is expected to lie.
The copies are named St1, St2 in the order of their Condon numbers, as
the edition of WM 225 names its two.
"""
import argparse
import collections
import glob
import html
import json
import os
import re
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--supra', default='../../pianoroll/SUPRA')
parser.add_argument('--analyses', default='../../pianoroll/piano-roll-analyses')
args = parser.parse_args()

rolls, current = [], None
for line in open(os.path.join(args.supra, 'index.aton'), encoding='utf-8', errors='replace'):
    line = line.rstrip('\n')
    if line.startswith('@@BEGIN'):
        current = {}
    elif line.startswith('@@END'):
        rolls.append(current)
        current = None
    elif current is not None:
        field = re.match(r'@([A-Z_]+):\s*(.*)', line)
        if field:
            current[field.group(1)] = html.unescape(field.group(2).strip())

analyses = {os.path.basename(path).split('_')[0]: os.path.relpath(path)
            for path in glob.glob(os.path.join(args.analyses, 'analysis', '*', '*_analysis.txt*'))}

by_label = collections.defaultdict(list)
for roll in rolls:
    by_label[roll['LABEL']].append(roll)


def condon(roll):
    number = re.search(r'(\d+)\s*$', roll['CALLNUM'])
    return int(number.group(1)) if number else 0


listed = []
for label, copies in by_label.items():
    if len(copies) < 2:
        continue
    copies.sort(key=condon)
    missing = [copy['DRUID'] for copy in copies if copy['DRUID'] not in analyses]
    if missing:
        print(f'{label}: no analysis for {", ".join(missing)}', file=sys.stderr)
    listed.append({
        'number': int(label.split()[-1]),
        'title': copies[0]['TITLE'],
        'composer': copies[0]['COMPOSER'],
        'performer': copies[0]['PERFORMER'],
        'copies': [{
            'siglum': f'St{i + 1}',
            'id': copy['DRUID'],
            'callnum': copy['CALLNUM'],
            'purl': copy['PURL'],
            'file': analyses[copy['DRUID']],
            'system': 'welte-t100',
            'index': {key.lower(): copy.get(key) for key in ('MUSICAL_NOTES', 'MUSICAL_HOLES', 'IMAGE_LENGTH', 'EDGE_TEAR_COUNT', 'BAD_HOLE_COUNT', 'MANUAL_EDITS')}
        } for i, copy in enumerate(copies) if copy['DRUID'] in analyses]
    })

listed.sort(key=lambda roll: roll['number'])
json.dump(listed, sys.stdout, indent=1, ensure_ascii=False)
