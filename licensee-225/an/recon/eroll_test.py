"""The binding readings of the Licensee e-roll tested in the velocities of Phillips's own standard file (truth known) and of Gourlin's copy."""
import json
import numpy as np
exec(open('calib3.py').read().split('def c_units')[0])

HOLES = [h for h in json.load(open('../../eroll/placed.json')) if h['type'] == 'expression' and h['expressionType'].startswith(('SlowCrescendo', 'Forzando'))]
OFFSET = 1.0
as_symbol = lambda h: {'id': f"E@{h['track']}@{h['from']:.2f}", 'type': 'expression', 'expressionType': h['expressionType'], 'scope': h['scope'], 'from': h['from'] - OFFSET, 'to': max(h['to'], h['from']) - OFFSET}
E_CODING = [as_symbol(h) for h in HOLES]

def holes_at(*places):
    """The e-roll's commands at given edition places, as (type, scope, place)."""
    out = []
    for t, sc, x in places:
        near = [s for s in E_CODING if s['expressionType'] == t and s['scope'] == sc and abs(s['from'] - x) < 1.6]
        assert len(near) == 1, (t, sc, x, near)
        out += near
    return out

def edition(*places, sig='C'):
    out = []
    for t, sc, x in places:
        near = sorted((abs(s['from'] - x), s['id'], s) for s in expression(sig) if s['expressionType'] == t and s['scope'] == sc and abs(s['from'] - x) < 3.5)
        assert near and (len(near) == 1 or near[1][0] - near[0][0] > 2.0), (t, sc, x, sig, [n[:2] for n in near])
        out.append(near[0][2])
    return out

On, Off = 'SlowCrescendoOn', 'SlowCrescendoOff'
FOn, FOff = 'ForzandoOn', 'ForzandoOff'
PRESENT = [
    ('B1 leader pair', holes_at((On, 'bass', 1417.2), (Off, 'bass', 1436.2))),
    ('C forzando 2365', holes_at((FOn, 'bass', 2364.5), (FOff, 'bass', 2372.5))),
    ('C bass pair 2464', holes_at((On, 'bass', 2461.4), (Off, 'bass', 2472.4))),
    ('C forzando 4281', holes_at((FOn, 'bass', 4282.2), (FOff, 'bass', 4287.9))),
    ('C treble pair 5159', holes_at((On, 'treble', 5157.9), (Off, 'treble', 5178.6))),
    ('C treble 4816, shifted', holes_at((On, 'treble', 4827.4), (Off, 'treble', 4833.4))),
    ('C treble 5037, shifted', holes_at((On, 'treble', 5031.0), (Off, 'treble', 5054.5))),
    ('C treble 6607, shifted', holes_at((On, 'treble', 6601.6), (Off, 'treble', 6640.5))),
    ('C treble 6663, shifted', holes_at((On, 'treble', 6661.2), (Off, 'treble', 6692.4))),
    ('C treble 7831, shifted', holes_at((On, 'treble', 7829.5), (Off, 'treble', 7852.9))),
]
mittel = [dyn(e['insert']) for e in VERSIONS['C']['edits'] if (e.get('motivation') or '').startswith('426a') and dyn(e['insert'])]
ABSENT = [
    ('C leader forzando', edition((FOn, 'bass', 1434.5), (FOff, 'bass', 1440.5))),
    ('C leader pair', edition((On, 'bass', 1462.5), (Off, 'bass', 1473.4))),
    ('B On 3459', edition((On, 'bass', 3459.2), sig='B')),
    ('B forzando On 4052', edition((FOn, 'bass', 4052.0), sig='B')),
    ('B pair 7939', edition((On, 'bass', 7939.2), (Off, 'bass', 7980.1), sig='B')),
    ('B On 8070', edition((On, 'bass', 8070.3), sig='B')),
    ('B On 8104', edition((On, 'bass', 8104.3), sig='B')),
    ('B treble On 9043', edition((On, 'treble', 9042.8), sig='B')),
] + [(f'C Mittelstimmen {syms[0]["from"]:.0f}', syms) for syms in mittel]

def run(name, soft_sig):
    ctx = Context(name, 'B', soft_sig)
    ctx.base = E_CODING + soft_of(soft_sig); ctx.ids = {s['id'] for s in ctx.base}
    ctx.sigma = {sc: sigma_safe(r, ctx.base) for sc, r in ctx.regs.items()}
    rows = []
    for label, syms in PRESENT:
        ids = {s['id'] for s in syms}
        rows.append(('in E', label, *ctx.test(ctx.base, [s for s in ctx.base if s['id'] not in ids], sorted({s['scope'] for s in syms}))))
    for label, syms in ABSENT:
        rows.append(('not in E', label, *ctx.test(ctx.base + syms, ctx.base, sorted({s['scope'] for s in syms}))))
    return rows

results = {name: run(name, 'A1') for name in ('phillipsL', 'gourlin')}
print(f"{'':9} {'unit':<28} {'Phillips LW: z (E)':>20} {'Gourlin: z (E)':>18}")
for i, (where, label, *_) in enumerate(results['phillipsL']):
    cells = [f"{z_of(L, E):+6.2f} ({E:5.1f})" for L, E in (results[n][i][2:] for n in ('phillipsL', 'gourlin'))]
    if label.startswith('C Mittelstimmen'): continue
    print(f"{where:9} {label:<28} {cells[0]:>20} {cells[1]:>18}")
for n in ('phillipsL', 'gourlin'):
    m = [(L, E) for where, label, L, E in results[n] if label.startswith('C Mittelstimmen') and E >= 0.5]
    print(f"not in E  C Mittelstimmen pooled ({len(m)} with E≥0.5) {n}: z {sum(l for l, _ in m) / sum(e for _, e in m):+.2f} ± {np.sqrt(2 / sum(e for _, e in m)):.2f}")
for n in ('phillipsL', 'gourlin'):
    for group in ('in E', 'not in E'):
        use = [(L, E) for where, label, L, E in results[n] if where == group and not label.startswith('C Mittelstimmen') and E >= 1.0]
        print(f"{n:<10} {group:<9} units with E≥1: {len(use):2}, pooled z {sum(l for l, _ in use) / sum(e for _, e in use):+.2f} ± {np.sqrt(2 / sum(e for _, e in use)):.2f}, sign agreeing {np.mean([(l > 0) == (group == 'in E') for l, _ in use]):.2f}")
print({k: v for k, v in json.load(open('split.json')).items() if k.split('/')[0] in ('gourlin', 'phillipsL')}.keys())
