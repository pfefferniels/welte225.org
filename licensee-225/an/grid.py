import json, numpy as np, mido
doc = json.load(open('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld'))
SHORT = {'d229954b':'S1','88460599':'S2','a7ff95b7':'W','6e1ce072':'L','9ae56c3e':'G'}
def features_of(c):
    """Every feature the copy states, whichever act brought it about."""
    acts = [c.get('production') or {}] + (c.get('modifications') or [])
    return [f for a in acts for f in (a.get('produced') or []) + (a.get('added') or [])]

def coherence(x, steps):
    x = np.asarray(x)
    return np.array([abs(np.exp(2j*np.pi*x/s).mean()) for s in steps])

def local_step(x, lo, hi, window, n=4000):
    """Median of the best lattice step in windows of the given length; the smallest strong step wins."""
    x = np.sort(np.asarray(x)); steps = np.linspace(lo, hi, n); found = []
    for start in np.arange(x[0], x[-1] - window, window/2):
        w = x[(x >= start) & (x < start + window)]
        if len(w) < 25: continue
        r = coherence(w - start, steps)
        best = r.max()
        cand = steps[r > 0.8 * best]
        found.append((cand.min() if best > 0.5 else np.nan, best, len(w)))
    return found

for c in doc['copies']:
    name = SHORT.get(c['@id'][:8])
    if not name or not features_of(c): continue
    m = c.get('measurements', {}); shift = m.get('shift', {}).get('horizontal', 0.0); scale = m.get('scale', 1.0)
    raw = [(f['horizontal']['from'] - shift) / scale for f in features_of(c)]
    res = local_step(raw, 0.3, 1.2, 400)
    steps = np.array([r[0] for r in res]); good = steps[~np.isnan(steps)]
    print(name, 'raw paper mm, windows', len(res), 'step median %.4f IQR %.4f–%.4f' % (np.median(good), *np.percentile(good, [25, 75])), 'coh med %.2f' % np.median([r[1] for r in res]))

ev = json.load(open('midi_events.json'))
for k in ['gourlin', 'chaseEmR']:
    ons = [n['on'] for n in ev[k]['notes']]
    res = local_step(ons, 4, 30, 5000 if k == 'gourlin' else 5000)
    steps = np.array([r[0] for r in res]); good = steps[~np.isnan(steps)]
    print(k, 'ticks, windows', len(res), 'step median %.3f IQR %.3f–%.3f' % (np.median(good), *np.percentile(good, [25, 75])) if len(good) else 'none', 'coh med %.2f' % np.median([r[1] for r in res]))
    offs = [n['off'] for n in ev[k]['notes']]
    res = local_step(offs, 4, 30, 5000)
    steps = np.array([r[0] for r in res]); good = steps[~np.isnan(steps)]
    print(k, 'offsets, step median %.3f' % np.median(good) if len(good) else 'none', 'coh med %.2f' % np.median([r[1] for r in res]))
