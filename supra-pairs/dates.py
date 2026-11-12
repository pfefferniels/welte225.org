#!/usr/bin/env python3
"""The proposed edits of each pair beside when its copies were punched.

    python3 dates.py [--condon-dates ../../pfefferniels/condon-dates] > dates.json

Reads `rolls.json`, `out/results.jsonl` and `edits.tsv` (from `edits.mjs`),
and from a checkout of pfefferniels/condon-dates the punch date read off
each copy (`data/readings.json`) and its paper and perforator
(`docs/data/measures.json`). Writes one record a pair to `dates.tsv` and,
to standard output, what the overview shows: the edits by kind, how they
go with the years between the two punchings, with the perforator, and
which copy a derivation puts first.

The correlations are Spearman's, their p the share of 20,000 shufflings
that do as well; with 19 dated pairs they say where to look, no more.
"""
import collections
import csv
import datetime
import json
import os
import random
import statistics
import sys

here = os.path.dirname(os.path.abspath(__file__))
dates = sys.argv[sys.argv.index('--condon-dates') + 1] if '--condon-dates' in sys.argv else os.path.join(here, '../../pfefferniels/condon-dates')
readings = json.load(open(os.path.join(dates, 'data/readings.json')))
measures = json.load(open(os.path.join(dates, 'docs/data/measures.json')))['rolls']
rolls = json.load(open(os.path.join(here, 'rolls.json')))
results = {r['number']: r for r in map(json.loads, open(os.path.join(here, 'out/results.jsonl')))}
SHAPES = ['unshaped', 'additional-accent', 'shift', 'prolong', 'shorten', 'remove-redundancy']

edits = collections.defaultdict(collections.Counter)      # roll -> (shape, touches) -> edits
for line in csv.DictReader(open(os.path.join(here, 'edits.tsv')), delimiter='\t'):
    edits[int(line['roll'])][(line['shape'], line['touches'])] += int(line['edits'])


def day(iso):
    """A date as read: a year alone stands for its middle, a month for its first day."""
    if not iso: return None
    parts = [int(part) for part in iso.split('-')]
    return datetime.date(parts[0], parts[1] if len(parts) > 1 else 7, parts[2] if len(parts) > 2 else 1)


def ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    out, i = [0.0] * len(values), 0
    while i < len(values):
        j = i
        while j + 1 < len(values) and values[order[j + 1]] == values[order[i]]: j += 1
        for k in range(i, j + 1): out[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return out


def pearson(a, b):
    ma, mb = statistics.mean(a), statistics.mean(b)
    spread = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / spread if spread else 0.0


def spearman(a, b, shufflings=20000):
    ra, rb = ranks(a), ranks(b)
    rho, chance, shuffled, hits = pearson(ra, rb), random.Random(1), rb[:], 0
    for _ in range(shufflings):
        chance.shuffle(shuffled)
        hits += abs(pearson(ra, shuffled)) >= abs(rho) - 1e-12
    return {'rho': round(rho, 2), 'p': round(hits / shufflings, 3), 'n': len(a)}


pairs = []
for roll in rolls:
    record, number = results[roll['number']], roll['number']
    ids = [copy['id'] for copy in roll['copies'][:2]]
    read = [readings.get(i) or {} for i in ids]
    punched = [day(r.get('date_iso')) for r in read]
    measured = [measures.get(i) or {} for i in ids]
    # the chain pitch tells the two perforators apart: 2.5 mm on the narrow one, 3.0 mm on the wide
    perforators = ['wide' if m.get('pitch', 0) > 2.75 else 'narrow' if m.get('pitch') else None for m in measured]
    proposal = record['proposal']
    by_shape = {shape: sum(n for (s, _), n in edits[number].items() if s == shape) for shape in SHAPES}
    pairs.append({
        'wm': number, 'sigla': [copy['siglum'] for copy in roll['copies'][:2]],
        'dates': [r.get('date_iso') for r in read], 'confidence': [r.get('confidence') for r in read],
        'years': round(abs((punched[0] - punched[1]).days) / 365.25, 1) if all(punched) else None,
        'paper': [m.get('paper') for m in measured], 'perforator': perforators,
        'readings': proposal['readings'], 'alone': proposal['readings'] - proposal['shared'],
        'edits': sum(by_shape.values()), 'shapes': by_shape, 'stemma': proposal.get('stemma'),
    })
for pair in pairs:
    pair['share'] = round(100 * pair['alone'] / pair['readings'], 2)
    pair['per1000'] = round(1000 * pair['edits'] / pair['readings'], 1)
    pair['perforatorsDiffer'] = len(set(pair['perforator'])) > 1
    pair['papersDiffer'] = pair['paper'][0] != pair['paper'][1]

with open(os.path.join(here, 'dates.tsv'), 'w') as table:
    print('\t'.join(['roll', 'punched St1', 'punched St2', 'confidence', 'years apart', 'paper', 'perforator', 'readings', 'on one copy alone', 'edits', *SHAPES, 'proposed']), file=table)
    for p in pairs:
        print('\t'.join(str(v) for v in [p['wm'], p['dates'][0] or '', p['dates'][1] or '', '/'.join(p['confidence']), p['years'] if p['years'] is not None else '',
              '/'.join(str(x) for x in p['paper']), '/'.join(str(x) for x in p['perforator']), p['readings'], p['alone'], p['edits'], *[p['shapes'][s] for s in SHAPES], p['stemma']]), file=table)

total = sum(p['edits'] for p in pairs)
kinds = [{'shape': shape,
          'expression': sum(n for e in edits.values() for (s, t), n in e.items() if s == shape and t == 'expression'),
          'note': sum(n for e in edits.values() for (s, t), n in e.items() if s == shape and t == 'note'),
          'pairs': sum(1 for p in pairs if p['shapes'][shape])} for shape in SHAPES]
most = sorted(pairs, key=lambda p: -p['edits'])[:5]
dated = [p for p in pairs if p['years'] is not None]
years = [p['years'] for p in dated]
halves = {name: [p for p in pairs if p['perforatorsDiffer'] == differ] for name, differ in (('differ', True), ('same', False))}
median = lambda group, key: round(statistics.median(p[key] for p in group), 1)


def shuffled(differ, same):
    """How often two shuffled halves of the pairs differ in their median share as much as these two do."""
    shares, chance, hits = [p['share'] for p in pairs], random.Random(2), 0
    gap = abs(statistics.median(p['share'] for p in differ) - statistics.median(p['share'] for p in same))
    for _ in range(20000):
        chance.shuffle(shares)
        hits += abs(statistics.median(shares[:len(differ)]) - statistics.median(shares[len(differ):])) >= gap
    return round(hits / 20000, 2)


papers = {name: [p for p in pairs if p['papersDiffer'] == differ] for name, differ in (('differ', True), ('same', False))}

# a derivation puts one copy first: is it the one punched first?
directions = []
for p in dated:
    if p['stemma'] and '(' in p['stemma'] and not p['stemma'].startswith('*'):
        first = p['stemma'].split('(')[0]
        i = p['sigla'].index(first)
        directions.append({'wm': p['wm'], 'stemma': p['stemma'], 'first': first, 'firstPunched': p['dates'][i], 'derived': p['sigla'][1 - i], 'derivedPunched': p['dates'][1 - i],
                           'agrees': day(p['dates'][i]) <= day(p['dates'][1 - i])})

json.dump({
    'totals': {'edits': total, 'readings': sum(p['readings'] for p in pairs), 'pairs': len(pairs),
               'expression': sum(k['expression'] for k in kinds), 'note': sum(k['note'] for k in kinds),
               'medianPerPair': statistics.median(p['edits'] for p in pairs), 'medianPer1000': median(pairs, 'per1000'),
               'most': [{'wm': p['wm'], 'edits': p['edits']} for p in most], 'mostShare': round(100 * sum(p['edits'] for p in most) / total)},
    'kinds': kinds,
    'pairs': pairs,
    'dated': {'pairs': len(dated), 'sure': sum(1 for p in dated if all(c in ('high', 'medium') for c in p['confidence'])),
              'share': spearman(years, [p['share'] for p in dated]), 'per1000': spearman(years, [p['per1000'] for p in dated]),
              'shapes': {shape: spearman(years, [1000 * p['shapes'][shape] / p['readings'] for p in dated]) for shape in SHAPES},
              'farApart': {'pairs': sum(1 for p in dated if p['years'] >= 9), 'onDifferentPerforators': sum(1 for p in dated if p['years'] >= 9 and p['perforatorsDiffer'])}},
    'perforator': {name: {'pairs': len(group), 'share': median(group, 'share'), 'per1000': median(group, 'per1000'),
                          'shapes': {shape: round(statistics.median(1000 * p['shapes'][shape] / p['readings'] for p in group), 1) for shape in SHAPES}} for name, group in halves.items()}
                  | {'p': shuffled(halves['differ'], halves['same'])},
    'paper': {name: {'pairs': len(group), 'share': median(group, 'share'), 'per1000': median(group, 'per1000')} for name, group in papers.items()}
             | {'p': shuffled(papers['differ'], papers['same'])},
    'directions': directions,
}, sys.stdout, ensure_ascii=False, indent=1)
