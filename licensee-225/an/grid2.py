import json, numpy as np
doc = json.load(open('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld'))
def features_of(c):
    """Every feature the copy states, whichever act brought it about."""
    acts = [c.get('production') or {}] + (c.get('modifications') or [])
    return [f for a in acts for f in (a.get('produced') or []) + (a.get('added') or [])]

SHORT = {'d229954b':'S1','88460599':'S2','a7ff95b7':'W','6e1ce072':'L','9ae56c3e':'G'}

def spectrum(x, steps, window):
    """Mean over windows of lattice coherence at each step; windows keep slow drift from smearing the phase."""
    x = np.sort(np.asarray(x)); acc = np.zeros(len(steps)); n = 0
    for start in np.arange(x[0], x[-1] - window, window / 2):
        w = x[(x >= start) & (x < start + window)]
        if len(w) < 30: continue
        acc += np.abs(np.exp(2j * np.pi * (w - start)[:, None] / steps[None, :]).mean(axis=0)); n += 1
    return acc / max(n, 1)

def peaks(steps, r, k=6):
    idx = [i for i in range(1, len(r) - 1) if r[i] >= r[i - 1] and r[i] >= r[i + 1]]
    idx.sort(key=lambda i: -r[i])
    return [(round(float(steps[i]), 4), round(float(r[i]), 3)) for i in idx[:k]]

steps = np.linspace(0.12, 1.6, 6000)
for c in doc['copies']:
    name = SHORT.get(c['@id'][:8])
    if not name or not features_of(c): continue
    m = c.get('measurements', {}); shift = m.get('shift', {}).get('horizontal', 0.0); scale = m.get('scale', 1.0)
    for edge in ('from', 'to'):
        raw = [(f['horizontal'][edge] - shift) / scale for f in features_of(c)]
        r = spectrum(raw, steps, 300)
        print(name, edge, 'top peaks (step mm, coherence):', peaks(steps, r))

ev = json.load(open('midi_events.json'))
tsteps = np.linspace(2, 40, 8000)
for edge in ('on', 'off'):
    x = [n[edge] for n in ev['gourlin']['notes']]
    r = spectrum(x, tsteps, 6000)
    print('gourlin', edge, 'top peaks (ticks, coherence):', peaks(tsteps, r))
    x = [p['t'] for p in ev['gourlin']['pedal']]
