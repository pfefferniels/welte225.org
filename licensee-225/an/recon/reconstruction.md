# Reconstructing the dynamics coding of the Licensee pair from velocities

Scripts in this folder: `model.py` (forward engine, clocks), `identify.py` and `split.py` (engine identification), `decode.py` and `smoke.py` (Viterbi over switch times), `recon.py`, `calib.py`, `calib2.py` and `calib3.py` (interval reconstruction and edit tests), `softdecode.py` (blind soft pedal), `layer.py` (Licensee layer). Results are in the matching `.json` files.

## 1. Engines, identified on controls with known coding
Both controls use the momentary forzando; the latched variant fits worse (CV R² 0.64/0.72 against 0.98/0.83 on Chase's file). Notes 60–65 (and 66 for Phillips) fit neither register and are left out.

| control | bass (<60) CV R² | treble CV R² | rates (bass) |
|---|---|---|---|
| Trachtman, Chase's copy (D1) | 0.987 | 0.987 (≥66) | slow 0.25/s, decay 0.21/s |
| Phillips, red S2 (C) | 0.931 | 0.892 (≥67) | slow 0.18/s, decay 0.18/s |

## 2. What velocities can recover
- **Switch times within a gap between notes cannot be recovered.** A Viterbi over level, crescendo latch and forzando bursts reproduces Chase's bass velocities at R² 0.977 with 2 crescendo intervals, where the coding has 86.
- **The net crescendo time between consecutive notes of a register can.** The level at a note is pinned to about 0.013.
- **Method.** Invert each note to a level. Run a coding from that observed level to the next note. Score an edit by the log-likelihood with it against without it, divided by the value expected if present (z ≈ +1 present, ≈ −1 absent).
- **Positional precision** is the gap between notes the edit spans: median 31–68 mm per group. That can suggest a reading but never shows "exactly the same place" in the sense of rule 2.

Interval negative log-likelihood per version, bass/treble:

| file | C | B | A |
|---|---|---|---|
| Chase control | 311/136 | 1122/497 | 6613/4832 |
| Phillips red control | 97/82 | 464/133 | 1619/1010 |
| Gourlin (engine fitted with C) | 472/80 | **328/72** | 959/161 |
| Phillips Licensee | 117/77 | **93/74** | 194/147 |

## 3. Edit tests in a fixed context (pooled z ± se, n edits with power)

| group | Trachtman control | Phillips red control | Gourlin | Phillips Licensee |
|---|---|---|---|---|
| C bass pairs "Mittelstimmen" | +0.99 (20) | +1.60 (19) | −1.00 ± 0.23 (19) | −1.17 ± 0.42 (11) |
| C bass pairs, other | +0.86 (8) | +1.51 (8) | −0.67 ± 0.37 (8) | −0.33 ± 0.56 (8) |
| C bass halves joined into pairs | +0.93 (3) | +0.90 (3) | −2.42 (3) | −2.94 (3) |
| C treble pairs | +0.88 (20) | +1.04 (18) | −0.88 ± 0.43 (11) | no power |
| C forzando pairs | 1 | – | no power | – |
| A1 readings (negative control) | −1.03 (22) | −0.94 (22) | −1.05 (20) | −1.04 (19) |
| B1 readings | – | – | −1.00 (1) | −1.17 (1) |
| B additions, bass | +1.00 (29) | +1.01 (29) | +0.99 (27) | +1.04 (27) |
| B additions, treble | +0.97 (23) | +1.01 (22) | +0.88 ± 0.25 (17) | +1.50 ± 0.40 (7) |
| B shifts, bass / treble | +1.00 / +0.94 | +0.98 / +0.91 | +1.07 / +1.23 | +1.15 / +1.06 |

**Controls.**
- B and C edits with expected evidence ≥ 2 come out z > 0 in 96–100 %.
- In C's own context, 58 of 73 C additions are called present on Chase's file and 46 of 73 on Phillips's red, with 2 and 0 called absent.
- Edits displaced by ±1.2–3 s come out present in 0–8 % (C groups).

**Pair.**
- **C's additions (68 units).** Neither copy shows any with power. 20 units are absent with power in at least one copy.
- **B's edits.** Those with power are z > 0 in 86 % (Gourlin, 59) and 91 % (Phillips, 45).
- **B edits absent in both copies:** forzando on at bar 3′ (4050); crescendo on at bars 19 (7939) and 20 (8070); a pair at bar 20 (8104–8136).
- **Thinned commands.** The B edits that made three of C's thinned treble commands redundant (1759, 2569, 7431) have no power in the pair (E ≤ 1), so that question stays open.

## 4. Soft pedal
**Control.** The blind decode on Chase's file finds the coded changes at every penalty:

| change | decoded | coded |
|---|---|---|
| Off | 5322 | 5316 |
| On | 5770 | 5771 |
| Off | 6178 | 6186 |
| On | 6723 | 6716 |

**Gourlin.** Soft on through bars 8′–9, off 5574–5636, on to 6394 (bar 13), off to 6745. The Widuch pattern has Off 5584 → On 5667 and Off 6338; B has Off 5316 → On 5771.

Fixed timelines, negative log-likelihood:

| file | B/C | A1 (Widuch) | decoded |
|---|---|---|---|
| Chase control | 160 | 1244 | – |
| Gourlin | 150 | 106 | 104 |
| Phillips Licensee | 149 | 134 | 131 |

Phillips's file carries no soft-pedal controller, so its preference may reflect level rather than the soft pedal.

## 5. Licensee layer
Intervals unexplained by both B and C in both copies (|r| > 3σ):
- bass, bar 3→4 (2165–2189), louder; this is the stretch
- treble, bar 2′ (3654–3691), louder; at the pair's added pedal depression
- bass, bar 3′ (4049–4079), quieter; this is B's forzando 4050, which the pair lacks
- bass, bar 13 (6229–6294), quieter
- bass, bar 14 (6473–6508), louder than C

## 6. Under the rules (04-varianten.tex 112–118)
- **Not below C.** No C addition shows in the pair, while the same test recovers them on both controls. Confidence is good for C's bass pairs in Gourlin and moderate in Phillips.
- **No intermediate between B and C.** No subset of C's groups is present, so no β between B and C is indicated.
- **Below B's dynamics.** B's additions and shifts show at control rates, and A1's and B1's readings do not.
- **Possibly a lost state between A and B.** The una corda follows A (the Widuch pattern, which rule 3 gives to A), while the dynamics follow B. So either B's una corda revision postdates B's other dynamics work, with a lost α that feeds both B and the pair, or the Licensee editor re-created an A-like pattern. Rule 2 cannot decide, because the soft change is a shift located only to the gap between notes. Confidence is low to moderate.
- **The four missing B edits** (bars 3′, 19, 20) could be further staging of B or the Licensee editor's own changes. They cannot be separated.
- **What would overturn this.**
  - The pair's own perforations (Phillips's Licensee e-roll, or Gourlin's CIS) showing C's bass pairs at bar 3 (1995–2060), bars 2′–3′ (3863–3922) or bar 18 (7736).
  - Those perforations showing B's soft-pedal release at 5316–5771.
  - A 2006 Trachtman build that ignores short crescendo pairs. Phillips's independent engine agrees, but with less power.
