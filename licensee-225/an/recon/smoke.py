import json, time
import numpy as np
from model import *
from decode import decode, intervals, DT

def envelope_range(name, clock, pitches, gap=0.03):
    tps = ticks_per_second(name)
    notes = sorted((n["on"] / tps, n["vel"]) for n in E[name]["notes"] if n["pitch"] in pitches)
    groups = []
    for note in notes:
        if groups and note[0] - groups[-1][-1][0] <= gap: groups[-1].append(note)
        else: groups.append([note])
    t = np.array([np.mean([a for a, _ in g]) for g in groups]); v = np.array([float(np.median([b for _, b in g])) for g in groups])
    return Envelope(t, v, clock.millimetres(t))

name = "chaseEmR"; clock = clock_of(name)
eng = Engine(slow=0.25, decay=0.213, fast=3.0, fast_decay=12.0, forzando="momentary", soft=0.1)
env = envelope_range(name, clock, range(0, 60))
events = version_coding("D1", clock)
n = int(clock.s.max() / STEP) + 200
la, sa = evaluate(events, env, "bass", eng, n)
p, coef = predict(la, sa, env.v, eng.soft)
sigma = float(np.std(env.v - p))
att = 1 - eng.soft * sa
t0 = time.time()
c, f, level, total = decode(env.t, env.v, att, eng, coef[0], coef[1], sigma, lam_c=8.0, lam_f=8.0, duration=float(clock.s.max()) + 1)
print('decode seconds', round(time.time() - t0, 1), 'sigma', round(sigma, 2), 'coef', coef)
dec = [(a * DT, b * DT) for a, b in intervals(c)]
truth_c = latched(events, "SlowCrescendo", "bass", n)
tru = [(a * STEP, b * STEP) for a, b in intervals(truth_c)]
tol = 0.2
hit = sum(any(abs(x - y) <= tol and abs(x2 - y2) <= tol for y, y2 in dec) for x, x2 in tru)
print('true bass crescendo intervals', len(tru), 'decoded', len(dec), 'matched both edges within 0.2 s', hit)
pred_dec = (coef[0] + coef[1] * level[np.clip((env.t / DT).astype(int), 0, len(level) - 1)]) * att
print('decoded fit r2', round(r2(env.v, pred_dec), 3))
