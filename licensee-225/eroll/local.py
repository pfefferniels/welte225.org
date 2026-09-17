"""Local look at the readings that bind: offsets from neighbouring archetypal holes, windows, and nearness of C's additions."""
import json, collections
import numpy as np

def features_of(c):
    """Every feature the copy states, whichever act brought it about."""
    acts = [c.get('production') or {}] + (c.get('modifications') or [])
    return [f for a in acts for f in (a.get('produced') or []) + (a.get('added') or [])]

exec(open('/private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records/b3fcaa9b-5098-45c5-9d78-739ba6a01268/scratchpad/eroll/binding.py').read().split("for home in ('B1', 'C', 'D1'):")[0])

anchors = sorted((symbols[k]['at'], match[k][1]) for k, s in symbols.items()
                 if s['home'] in ('A', 'B') and not deleted_by[k] and k in match and music(s))
def local_offset(x, half=150):
    ds = [d for at, d in anchors if abs(at - x) <= half]
    return float(np.median(ds)) if len(ds) >= 5 else m

def window(lo, hi):
    print(f'\n-- {lo:.0f}–{hi:.0f} mm, local offset {local_offset((lo + hi) / 2):+.2f}')
    off = local_offset((lo + hi) / 2)
    rows = [(h['from'] - off, 'E', h['expressionType'], h['scope'], '') for h in HOLES if lo <= h['from'] - off <= hi and not h['expressionType'].startswith('Sustain')]
    rows += [(s['at'], s['home'], s['expressionType'], s['scope'], ''.join(sorted(set(c['copy'] for c in s['carriers']))) + (' del ' + ','.join(deleted_by[k]) if deleted_by[k] else ''))
             for k, s in symbols.items() if lo <= s['at'] <= hi and not s['expressionType'].startswith('Sustain')]
    for scope in ('bass', 'treble'):
        for at, who, t, sc, wit in sorted(r for r in rows if r[3] == scope):
            print(f"   {scope:<6} {at:8.1f}  {who:<3} {t:<17} {wit}")

for lo, hi in ((1400, 1500), (2330, 2500), (4250, 4300), (4780, 4860), (5020, 5070), (5140, 5200), (6590, 6700), (7800, 7870), (7920, 8150)):
    window(lo, hi)

# how near C's additions lie to free holes of their kind, against the displaced null
explained = {match[k][0] for k, s in symbols.items() if s['home'] in ('A', 'B', 'B1') and k in match}
free = [h for i, h in enumerate(HOLES) if i not in explained]
def nearest_free(s, at):
    ds = [abs(h['from'] - local_offset(at) - at) for h in free if kind(h) == kind(s)]
    return min(ds) if ds else 1e9
groups = collections.defaultdict(list)
for k, s in symbols.items():
    if s['home'] == 'C': groups['Mittelstimmen' if edit_of[k][2] and 'Mittelstimmen' in edit_of[k][2] else 'other'].append(k)
rng = np.random.default_rng(5)
for g, ks in groups.items():
    obs = np.array([nearest_free(symbols[k], symbols[k]['at']) for k in ks])
    null = np.array([[nearest_free(symbols[k], symbols[k]['at'] + rng.choice([-1, 1]) * rng.uniform(40, 200)) for k in ks] for _ in range(200)])
    for lim in (3.3, 10, 30):
        print(f'C {g:<13} n={len(ks):3}: within {lim:>4} mm of a free hole of its kind: observed {(obs <= lim).mean():.2f}, displaced {(null <= lim).mean():.2f}')

print('\nS1 bass crescendo holes, lengths (mm): leader pair against the rest')
s1 = next(c for c in json.load(open('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld'))['copies'] if c['@id'].startswith('d229954b'))
lens = [(f['horizontal']['from'], f['horizontal']['to'] - f['horizontal']['from'], f['vertical']['from']) for f in features_of(s1) if f['vertical']['from'] in (3, 4)]
print('  leader:', [(round(a, 1), round(l, 2), t) for a, l, t in lens if 1400 < a < 1440], ' median of all:', round(float(np.median([l for _, l, _ in lens])), 2), 'IQR', np.round(np.percentile([l for _, l, _ in lens], [25, 75]), 2))
