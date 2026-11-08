"""From Grünfeld's performed melody to the control curves of a hummed rendition.

Everything a voice synthesizer needs that the piano roll does not say directly is decided
here, once, so that every synthesizer renders the same performance:

* which notes are joined legato, where the voice breathes, where a repeated note is
  re-articulated;
* a continuous f0 contour (cents) with transitions, overshoot, preparation, vibrato and drift,
  after Saitou et al. (2007), "Speech-to-singing synthesis" / the F0 control model of
  Saitou, Unoki & Akagi (2005);
* a continuous loudness contour (dB) from the MPM dynamics curve plus each note's own
  velocity offset (metrical accentuation and ornament gradients are additive in MPM).

Timing: onsets are Grünfeld's, to the millisecond. Ends are what the piano lets one hear: the
key release, or, while the sustain pedal is down, the pedal release, but never past the next
melody onset. A breath is taken where Grünfeld himself lifts (a gap of >= BREATH_MIN between
key release and next onset) and at the starts of the phrases.
"""
import json
from dataclasses import dataclass, field

import numpy as np
from scipy.signal import lfilter

CR = 1000  # control rate, Hz (1 ms)


@dataclass
class VNote:
    index: int
    pitch: float          # MIDI
    on: float             # s
    off: float            # s, voice end
    key_off: float        # s, as on the roll
    velocity: float
    legato_in: bool = False     # joined to the previous note without a break
    repeated_in: bool = False   # same pitch as the previous note, re-articulated
    breath_before: bool = False
    phrase_start: bool = False


# Phrase starts of Träumerei in the melody list (see extract_melody.py output): the pickups and
# the restarts after a cadence. Breaths are also taken wherever Grünfeld leaves a gap.
PHRASE_STARTS = {0, 21, 41, 61, 81, 98, 118, 138, 159}
BREATH_MIN = 0.12      # s: a key-release gap at least this long becomes a breath
BREATH_STEAL = 0.22    # s: taken from the end of the previous note at a phrase start without a gap
BREATH_SPACING = 3.0   # s: no two breaths closer than this, phrase starts aside


def load_melody(path):
    return json.load(open(path))


def build_notes(mel, mode='gruenfeld', transpose=0.0, mean_tempo=None):
    """Return the voice notes. mode='deadpan' replaces Grünfeld's timing and dynamics by the
    score at one tempo (the mean of his performance) and one velocity (his median)."""
    src = mel['notes']
    notes = []
    if mode == 'deadpan':
        total_ms = src[-1]['onset_ms'] + (src[-1]['key_off_ms'] - src[-1]['onset_ms'])
        # symbolic time is cumulative over the unrolled repeat: use note order, not MSM dates
        # (the repeat restarts its dates), by accumulating durations to the next note.
        ticks = []
        t = 0.0
        for k, n in enumerate(src):
            ticks.append(t)
            if k + 1 < len(src):
                nxt = src[k + 1]
                step = nxt['date'] - n['date']
                if step <= 0:  # repeat jump: the note's own notated length
                    step = n['duration']
                t += step
        end_ticks = ticks[-1] + src[-1]['duration']
        ms_per_tick = total_ms / end_ticks if mean_tempo is None else 60000 / mean_tempo / 720
        vel = float(np.median([n['velocity'] for n in src]))
        for k, n in enumerate(src):
            on = ticks[k] * ms_per_tick / 1000
            off = (ticks[k] + n['duration']) * ms_per_tick / 1000
            notes.append(VNote(k, n['pitch'] + transpose, on, off, off, vel))
        for k in range(len(notes) - 1):
            notes[k].off = min(notes[k].off, notes[k + 1].on)
            notes[k].key_off = notes[k].off
    else:
        for k, n in enumerate(src):
            notes.append(VNote(k, n['pitch'] + transpose, n['onset_ms'] / 1000,
                               n['sounding_off_ms'] / 1000, n['key_off_ms'] / 1000, n['velocity']))

    # Where to breathe: every phrase start, and where Grünfeld lifts after a note of some length
    # (largest gaps first), but not right after a pickup, not before the final note, and not
    # within BREATH_SPACING of another breath.
    breaths = {k for k in PHRASE_STARTS if k < len(notes)}
    lifts = []
    for k in range(1, len(notes) - 1):
        prev = notes[k - 1]
        gap = notes[k].on - prev.key_off
        if gap >= BREATH_MIN and prev.key_off - prev.on >= 0.5 and (k - 1) not in PHRASE_STARTS:
            lifts.append((gap, k))
    for gap, k in sorted(lifts, reverse=True):
        if all(abs(notes[k].on - notes[j].on) >= BREATH_SPACING for j in breaths):
            breaths.add(k)

    for k, n in enumerate(notes):
        n.phrase_start = k in PHRASE_STARTS
        if k == 0:
            n.breath_before = True
            continue
        prev = notes[k - 1]
        lifted = n.on - prev.key_off >= BREATH_MIN
        if k in breaths:
            n.breath_before = True
            if lifted:
                prev.off = min(prev.off, prev.key_off)
            else:
                steal = min(BREATH_STEAL, 0.35 * (n.on - prev.on))
                prev.off = min(prev.off, n.on - steal)
        else:
            prev.off = n.on       # legato: the voice does not stop between notes
            n.legato_in = True
            n.repeated_in = abs(n.pitch - prev.pitch) < 0.01
    return notes


def dynamics_curve(mel):
    """MPM macro dynamics as (seconds, velocity-scale value), monotone in time."""
    pts = [(p['milliseconds'] / 1000, p['value']) for p in mel['dynamics_curve']]
    pts = [p for p in pts if p[1] != 100 or p[0] == 0]  # drop the channel-volume reset at the end
    t = np.array([p[0] for p in pts])
    v = np.array([p[1] for p in pts])
    # keep the last value at duplicate times
    keep = np.r_[t[1:] != t[:-1], True]
    return t[keep], v[keep]


def vel_to_db(v):
    """Velocity to level, the MIDI DLS convention: 40 log10(v/127)."""
    return 40 * np.log10(np.maximum(v, 1) / 127)


@dataclass
class Controls:
    t: np.ndarray            # s, control grid
    f0_cents: np.ndarray     # MIDI cents (6900 = A4) , valid where voiced
    level_db: np.ndarray     # dB re full scale, -inf where silent
    voiced: np.ndarray       # bool
    gain: np.ndarray         # linear amplitude 0..1 (level and envelopes)
    breath: np.ndarray       # linear, 0..1 inhalation noise
    notes: list = field(default_factory=list)

    @property
    def f0_hz(self):
        return 440.0 * 2 ** ((self.f0_cents - 6900) / 1200)


def _second_order(x, omega, zeta, fs=CR):
    """Unity-gain 2nd-order lowpass y'' + 2 zeta omega y' + omega^2 y = omega^2 x, bilinear."""
    w = omega
    T = 1 / fs
    k = 2 / T
    a0 = k * k + 2 * zeta * w * k + w * w
    b = np.array([w * w, 2 * w * w, w * w]) / a0
    a = np.array([1, (2 * w * w - 2 * k * k) / a0, (k * k - 2 * zeta * w * k + w * w) / a0])
    zi = _zi(b, a) * x[0]
    y, _ = lfilter(b, a, x, zi=zi)
    return y


def _zi(b, a):
    from scipy.signal import lfilter_zi
    return lfilter_zi(b, a)


def render_controls(notes, mel=None, seed=1, mode='gruenfeld', vibrato_cents=28.0,
                    vibrato_rate=5.6, expressive=True, dyn_scale=1.0, pad=0.6, note_wise=False):
    rng = np.random.default_rng(seed)
    end = notes[-1].off + pad + 0.8
    n = int(end * CR) + 1
    t = np.arange(n) / CR
    voiced = np.zeros(n, bool)
    step = np.zeros(n)
    idx = np.full(n, -1)
    for k, nt in enumerate(notes):
        a, b = int(round((nt.on + pad) * CR)), int(round((nt.off + pad) * CR))
        voiced[a:b] = True
        step[a:b] = nt.pitch * 100
        idx[a:b] = k
    # hold pitch through silences so filters see no jumps there
    last = notes[0].pitch * 100
    for i in range(n):
        if idx[i] < 0:
            step[i] = last
        else:
            last = step[i]

    f0 = step.copy()
    if expressive:
        # Transitions inside legato segments: overshoot (forward) and preparation (backward)
        # filters on the step contour, Saitou et al. 2007 parameter values.
        segs = _segments(voiced)
        for a, b in segs:
            x = step[a:b]
            y = _second_order(x, omega=34.8, zeta=0.5422)              # overshoot, 0.0348 rad/ms
            y = _second_order(y[::-1], omega=29.2, zeta=0.6681)[::-1]  # preparation, run backwards
            f0[a:b] = y
            # onset scoop: start 35 cents below, reach the note in ~70 ms
            m = min(90, b - a)
            f0[a:a + m] -= 35 * np.exp(-np.arange(m) / 25.0)
        # Vibrato on long notes
        for k, nt in enumerate(notes):
            a, b = int(round((nt.on + pad) * CR)), int(round((nt.off + pad) * CR))
            dur = (b - a) / CR
            if dur < 0.45:
                continue
            rate = vibrato_rate * (1 + rng.normal(0, 0.04))
            delay = min(0.32, 0.35 * dur)
            ramp = 0.35
            tt = np.arange(b - a) / CR
            env = np.clip((tt - delay) / ramp, 0, 1)
            env = env * env * (3 - 2 * env)
            env *= np.clip((dur - tt) / 0.08, 0, 1)   # fade before the next transition
            depth = vibrato_cents * (0.75 + 0.5 * rng.random()) * min(1, dur / 1.2)
            inst_rate = rate * (1 + 0.10 * np.clip(tt / max(dur, 1e-3), 0, 1))  # Prame 1994: rate rises towards the end
            phase = 2 * np.pi * np.cumsum(inst_rate) / CR + rng.random() * 2 * np.pi
            # vibrato is roughly symmetric around the note, slightly asymmetric in real voices
            f0[a:b] += depth * env * np.sin(phase)
        # Drift (slow wander) and fine fluctuation
        drift = lfilter([1 - 0.998], [1, -0.998], rng.normal(0, 1, n))
        drift = drift / (np.std(drift) + 1e-9) * 6.0
        fine = lfilter(*_butter_lp(12, CR), rng.normal(0, 1, n))
        fine = fine / (np.std(fine) + 1e-9) * 3.0
        f0 += drift + fine

    # Loudness
    if mel is not None and mode == 'gruenfeld' and not note_wise:
        ct, cv = dynamics_curve(mel)
        macro = np.interp(t - pad, ct, cv)
        offs = np.zeros(n)
        for k, nt in enumerate(notes):
            a, b = int(round((nt.on + pad) * CR)), int(round((nt.off + pad) * CR))
            offs[a:b] = nt.velocity - np.interp(nt.on, ct, cv)
        vel = macro + offs
    else:
        vel = np.zeros(n)
        for k, nt in enumerate(notes):
            a, b = int(round((nt.on + pad) * CR)), int(round((nt.off + pad) * CR))
            vel[a:b] = nt.velocity
        # hold through gaps
        lastv = notes[0].velocity
        for i in range(n):
            if idx[i] < 0:
                vel[i] = lastv
            else:
                lastv = vel[i]
    level = vel_to_db(vel) * dyn_scale
    # smooth step changes of note-wise level a little (30 ms)
    level = _smooth(level, 30)

    env = np.zeros(n)
    env[voiced] = 1.0
    if expressive:
        # attack/release envelopes, legato dips, re-articulation of repeated notes
        env = _shape_envelope(env, notes, pad, voiced)
    else:
        env = _smooth(env, 8)
    gain = env * 10 ** (level / 20)

    breath = np.zeros(n)
    if expressive:
        for k, nt in enumerate(notes):
            if not nt.breath_before or k == 0:
                continue
            gap = nt.on - notes[k - 1].off
            if gap < 0.08:
                continue
            a = int(round((notes[k - 1].off + pad + 0.02) * CR))
            b = int(round((nt.on + pad - 0.01) * CR))
            if b <= a:
                continue
            tt = np.linspace(0, 1, b - a)
            breath[a:b] = np.sin(np.pi * tt) ** 1.5 * min(1.0, gap / 0.3)
        a = int(round((notes[0].on + pad - 0.35) * CR))
        breath[max(a, 0):int((notes[0].on + pad - 0.02) * CR)] = np.sin(
            np.pi * np.linspace(0, 1, int((notes[0].on + pad - 0.02) * CR) - max(a, 0))) ** 1.5
    return Controls(t, f0, level, voiced, gain, breath, notes)


def _segments(voiced):
    d = np.diff(np.r_[0, voiced.astype(int), 0])
    starts = np.where(d == 1)[0]
    ends = np.where(d == -1)[0]
    return list(zip(starts, ends))


def _butter_lp(fc, fs):
    from scipy.signal import butter
    return butter(2, fc / (fs / 2))


def _smooth(x, ms):
    w = max(1, int(ms))
    k = np.hanning(w * 2 + 1)
    k /= k.sum()
    return np.convolve(np.pad(x, w, mode='edge'), k, mode='valid')


def _shape_envelope(env, notes, pad, voiced):
    n = len(env)
    out = np.zeros(n)
    for a, b in _segments(voiced):
        seg = np.ones(b - a)
        att = min(70, (b - a) // 3)
        rel = min(110, (b - a) // 3)
        seg[:att] = np.sin(0.5 * np.pi * np.linspace(0, 1, att)) ** 2
        seg[-rel:] *= np.cos(0.5 * np.pi * np.linspace(0, 1, rel)) ** 1.5
        out[a:b] = seg
    for k, nt in enumerate(notes):
        if not nt.legato_in:
            continue
        c = int(round((nt.on + pad) * CR))
        if nt.repeated_in:
            w, depth = 70, 0.22    # re-articulated: a clear dip (about -13 dB)
        else:
            w, depth = 60, 0.80    # pitch change in legato: a small dip (about -2 dB)
        a, b = max(0, c - w), min(n, c + w // 2)
        tt = np.linspace(-1, 0.5, b - a)
        dip = 1 - (1 - depth) * np.exp(-(tt / 0.45) ** 2)
        out[a:b] *= dip
    return out


def summary(notes):
    br = sum(n.breath_before for n in notes)
    lg = sum(n.legato_in for n in notes)
    rp = sum(n.repeated_in for n in notes)
    return f'{len(notes)} notes, {br} breaths, {lg} legato joins, {rp} repeated notes, ' \
           f'{notes[0].on:.2f}-{notes[-1].off:.2f} s'
