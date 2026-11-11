#!/usr/bin/env python3
"""The tables of the README, from what `cycle.mjs`, `truth.mjs` and
`drift.mjs` wrote.

    python3 summary.py > summary.md
"""
import csv
import json
import os

here = os.path.dirname(os.path.abspath(__file__))


def records(directory):
    path = os.path.join(here, directory, 'results.jsonl')
    return [json.loads(line) for line in open(path)] if os.path.exists(path) else []


def table(path):
    return list(csv.DictReader(open(os.path.join(here, path)), delimiter='\t')) if os.path.exists(os.path.join(here, path)) else []


def aligned(record, i=1):
    return record['copies'][i].get('alignment') if len(record['copies']) > i else None


def row(record, drift):
    proposal = record.get('proposal') or {}
    alignment = aligned(record) or {}
    alone = proposal.get('readings', 0) - proposal.get('shared', 0)
    displaced = proposal.get('displaced') or {'pairs': 0, 'left': alone}
    apart = (record.get('chainsApart') or [{}])[0].get('chains', '')
    derived = sum(version['edits'] for version in record['versions'] if version['derivesFrom'])
    return (f"| {record['number']} | {record['copies'][0]['features'].get('HoleChain', 0)} / {record['copies'][1]['features'].get('HoleChain', 0)} "
            f"| {apart} | {alignment.get('matched', '–')} | {alignment.get('scale', '–')} | {alignment.get('residual', '–')} | {drift.get(str(record['number']), '–')} "
            f"| {proposal.get('readings', '–')} | {alone} | {2 * displaced['pairs']} | {displaced['left']} | `{proposal.get('notation', '–')}` | `{proposal.get('stemma', '–')}` | {derived} |")


after, before, further = records('out'), records('out-0.76.0'), records('out-further')
drift = {line['roll']: line['spread of medians (mm)'] for line in table('drift.tsv') if line.get('spread of medians (mm)')}

print('## The 38 rolls, with the library as fixed\n')
print('| WM | chains St1 / St2 | chains apart | notes matched | scale | residual mm | drift mm | readings | on one copy | of them displaced | left | stemma searched | as proposed | edits |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for record in after:
    print(row(record, drift))

laid = [r for r in after if aligned(r)]
readings = sum(r['proposal']['readings'] for r in laid)
alone = sum(r['proposal']['readings'] - r['proposal']['shared'] for r in laid)
displaced = sum(2 * r['proposal']['displaced']['pairs'] for r in laid)
print(f'\nThe {len(laid)} rolls whose copies aligned: {readings} readings, {alone} on one copy alone, {displaced} of them ({100 * displaced / max(alone, 1):.0f} %) with a displaced counterpart, {alone - displaced} left.\n')

print('## Before and after the fixes\n')
print('| | linked-rolls 0.76.0 | fixed |')
print('|---|---|---|')
for label, test in (
    ('rolls whose second copy aligned', lambda r: aligned(r) is not None),
    ('rolls sharing more than 90 % of their readings', lambda r: (r.get('proposal') or {}).get('shared', 0) > 0.9 * (r.get('proposal') or {}).get('readings', 1)),
    ('rolls sharing more than 97 %', lambda r: (r.get('proposal') or {}).get('shared', 0) > 0.97 * (r.get('proposal') or {}).get('readings', 1)),
    ('steps that threw', lambda r: len(r['errors']) > 0),
    ('documents valid against the schema', lambda r: r.get('document', {}).get('valid') is True),
    ('documents the same when read back and written again', lambda r: r.get('document', {}).get('roundTrips') is True),
):
    print(f'| {label} | {sum(1 for r in before if test(r))} of {len(before)} | {sum(1 for r in after if test(r))} of {len(after)} |')
for name, rows in (('linked-rolls 0.76.0', table('truth-0.76.0.tsv')), ('fixed', table('truth.tsv'))):
    both = [r for r in rows if r['reader'] != '' and r['stanford'] != '']
    print(f"\nTrack shift, {name}: {sum(1 for r in both if r['reader'] == r['stanford'])} of {len(both)} analyses on the tracks of Stanford's raw MIDI; "
          f"{sum(1 for r in rows if r['error'])} unreadable.")
    differing = [f"{r['druid']} ({r['reader']} for {r['stanford']})" for r in both if r['reader'] != r['stanford']]
    if len(differing) <= 12:
        print('Differing: ' + ', '.join(differing) + '.')

shared = lambda record: (record.get('proposal') or {}).get('shared', 0)
print('\nRolls the fixes read differently (chains St1 / St2 and readings shared, before → after):\n')
for was, now in zip(before, after):
    if abs(shared(was) - shared(now)) > 0.02 * max(shared(now), 1):
        chains = lambda record: ' / '.join(str(copy['features'].get('HoleChain')) for copy in record['copies'])
        print(f"- WM {was['number']}: {chains(was)} → {chains(now)} chains, {shared(was)} → {shared(now)} readings shared")

print('\n## Copies from elsewhere\n')
print('| set | copies | chains | chains apart | matched | scale | residual mm | readings | shared | displaced | left | stemma | versions performed |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for record in further:
    proposal = record.get('proposal') or {}
    displaced = proposal.get('displaced') or {'pairs': 0, 'left': 0}
    alignments = [copy.get('alignment') or {} for copy in record['copies'][1:]]
    print(f"| {record['number']} | {', '.join(copy['siglum'] for copy in record['copies'])} | {' / '.join(str(copy['features'].get('HoleChain', 0)) for copy in record['copies'])} "
          f"| {'–' if len({version['system'] for version in record['versions']}) > 1 else ', '.join(str(pair['chains']) for pair in record.get('chainsApart') or [])} | {' / '.join(str(a.get('matched', '–')) for a in alignments)} "
          f"| {' / '.join(str(a.get('scale', '–')) for a in alignments)} | {' / '.join(str(a.get('residual', '–')) for a in alignments)} "
          f"| {proposal.get('readings', '–')} | {proposal.get('shared', '–')} | {2 * displaced['pairs']} | {displaced['left']} | `{proposal.get('notation', '–')}` "
          f"| {', '.join(version['siglum'] + ' ' + str((version.get('performed') or {}).get('notes', '–')) for version in record['versions'])} |")
