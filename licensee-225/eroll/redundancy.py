"""Rule 3 on the Licensee e-roll: redundant commands in its lock-and-cancel sequences, set against B's and C's texts."""
import json
BASE = '/private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records/b3fcaa9b-5098-45c5-9d78-739ba6a01268/scratchpad/'
HOLES = [p for p in json.load(open(BASE + 'eroll/placed.json')) if p['type'] == 'expression']
V = json.load(open(BASE + 'eroll/versions.json'))
OFFSET = 1.0
FUNCTIONS = [('SlowCrescendo', 'bass'), ('SlowCrescendo', 'treble'), ('Forzando', 'bass'), ('Forzando', 'treble'), ('SoftPedal', 'bass'), ('SustainPedal', 'treble')]

def redundancies(events):
    """Commands that repeat the state already set, as (place, command, place of the earlier one)."""
    out, state, since = [], False, None
    for at, on in sorted(events):
        if on == state: out.append((at, 'On' if on else 'Off', since))
        else: state, since = on, at
    return out

def events_of(items, function, scope, place):
    return [(place(x), x['expressionType'].endswith('On')) for x in items
            if x['expressionType'] in (function + 'On', function + 'Off') and x['scope'] == scope]

for function, scope in FUNCTIONS:
    print(f'\n== {function} {scope}')
    e = redundancies(events_of(HOLES, function, scope, lambda h: h['from'] - OFFSET))
    print('  E:', [(round(a, 1), c, round(s, 1) if s else None) for a, c, s in e if 1400 < a < 9790])
    for sig in ('A', 'B', 'B1', 'C'):
        items = [s for s in V['snapshots'][sig] if s['type'] == 'expression']
        r = redundancies(events_of(items, function, scope, lambda s: s['from']))
        print(f'  {sig}:', [(round(a, 1), c) for a, c, _ in r])
