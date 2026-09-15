# Which version's expression coding explains the Licensee pair's velocities

Question: the note and pedal text cannot separate A, B, C and D1, because they differ almost only in
expression. Trachtman's emulation of Gourlin's copy (C-225) and Phillips's LW file carry that expression
only as velocities. Which version's coding, run through a model of the engine, reproduces them best?

Scripts: `expr_test.py` (first run, own clock, `results.json`), `followup.py` (placement from
`placed_dp.json`, event and soft-pedal tests, `followup.json`), `noise2.py` (timing-noise control at
realistic sizes, `noise2.json`). The level model and output stage are the earlier study's
(`welte_fit.LevelModel`, latched constant-rate ramp; `emulator_fit._fit_output`), with a multiplicative
soft-pedal factor added (signatures.md measured 8/9 on emR). A fast integrator replaces
`LevelModel.run` and is asserted equal to it.

## Two facts that bound the test

- **Different engine builds.** W225emR.mid (Chase's copy) says "Expression Emulator – Beta Version 1 –
  Oct 23, 2005"; Gourlin's file says "Beta Version 1 – July 09, 2006". Parameters fitted on Chase's file
  therefore describe a different build. That is why the free refit per candidate (below) carries the
  argument, not the transfer.
- **C and D1 are the same coding to this engine.** D1 differs from C by a mezzoforte hook set and
  cancelled in the leader (1145–1242 mm, before the first note at 1438) and by the deletion of a
  soft-pedal release at 6338.5 mm that follows another release at 6185.7. Level and soft state come out
  identical (checked). The test cannot separate C from D1, only B from C.

## Positive control: Chase's emR, where the coding is known (D1 ≡ C)

Cross-validated R² (5 contiguous folds), free refit per coding, dp placement.

| coding | bass | treble |
|---|---|---|
| A | 0.083 | 0.357 |
| A1 | 0.455 | 0.531 |
| B | 0.908 | 0.831 |
| B1 | 0.916 | 0.831 |
| **C = D1** | **0.952** | **0.833** |
| null | −0.084 | −0.117 |
| C shifted −4/−2/−1/+1/+2/+4 s | 0.34/0.34/0.67/0.55/0.46/0.41 | 0.63/0.67/0.74/0.63/0.61/0.44 |

The method recovers the true coding in the bass, with C ahead of B by **0.044**. In the treble it does
not separate B from C (0.002), so only the bass can speak to B against C.

## Gourlin (Trachtman, C-225)

| coding | bass | treble |
|---|---|---|
| A | 0.119 | 0.171 |
| A1 | 0.353 | 0.237 |
| **B** | **0.623** | **0.316** |
| B1 | 0.630 | 0.316 |
| C = D1 | 0.433 | 0.301 |
| null | −0.030 | −0.072 |
| C shifted −4/−2/−1/+1/+2/+4 s | 0.12/0.22/0.32/0.23/0.21/0.21 | 0.18/0.16/0.23/0.14/0.11/0.08 |

B is ahead of C by **0.190** in the bass, against the control's 0.044 for the true coding the other way.
The first run on a cruder clock gave the same order (B 0.641, C 0.432). The two clocks place the control
commands differently by 0.18 s rms, so the ranking is not a product of either placement.

All parameters carried over from Chase's fit (a different build), scale-free correlation r:
bass B 0.742, B1 0.745, C 0.689, A1 0.575, A 0.422, best shifted C 0.522; treble B 0.527, A1 0.510, C 0.507.
Same order. The variant that keeps Chase's dynamics and refits only the output stage gives negative
cross-validated R² for every coding, controls included, so it is not usable and is not cited.

Soft factor: the free fits choose 0 in Gourlin's bass for B and C, where Chase's choose 1/9. So the B/C
soft-pedal places do not help on Gourlin (see the soft-pedal edges below).

## Phillips (LW)

| coding | bass | treble |
|---|---|---|
| A | 0.119 | 0.118 |
| A1 | 0.235 | 0.237 |
| **B** | **0.438** | **0.252** |
| C = D1 | 0.311 | 0.223 |
| null | −0.025 | −0.037 |

The fits are low, as in the earlier study, which could not fit his engine at all (R² < 0.2 with Chase's
copy as a stand-in). With the placement from his own file they now reach 0.44, and the order agrees with
Gourlin's: B ahead of C by 0.127. Transferred r: bass B 0.590, C 0.549.

## Where B and C predict differently (bass, free-fit held-out predictions, > 1 velocity unit)

- Chase (truth C): 36 rows, C closer at 23.
- Gourlin: 15 rows, B closer at 10. At bars 3 and 3′ C predicts a lift (54.5) and the file sits on the
  floor (53), as B predicts. In bar 14 B predicts 58, C 54.5, the file has 61. Bar 10 is mixed.
- Phillips: 69 rows, B closer at 58, spread over bars 2–8, 3′–9, 13–16 and 23.

## Timing-noise control: can placement error alone make B beat C?

On Chase's file the true coding was jittered and B and C refitted, 8 seeds each. Mean C − B in bass CV R²:

| jitter | σ 0.03 s | 0.05 s | 0.1 s | 0.25 s |
|---|---|---|---|---|
| each on/off pair moved together | +0.044 (B wins 0/8) | +0.044 (0/8) | +0.038 (0/8) | +0.033 (1/8, min −0.007) |
| each hole moved on its own | +0.037 (0/8) | +0.077 (0/8) | −0.008 (3/8, min −0.126) | −0.018 (5/8, min −0.151) |
| smooth warp, periods 7–37 s (5 seeds) | – | – | +0.033 | +0.021 |

Copies of the edition differ in placement by 1.8 mm median across carriers, about 0.035–0.04 s. At that
size, and for command pairs moved as units at any tested size, C stays ahead. Only holes displaced
independently by 0.1 s or more (about 4–5 mm) reverse the order, by at most 0.15. That is still short of
Gourlin's 0.19, but not by much.

## Model-free event test: velocity change across each bass crescendo (after its Off minus before its On)

| category | Chase | Gourlin | Phillips |
|---|---|---|---|
| bass, only in C (39 On) | −0.38 ± 0.37 (5/21 > 0) | 0.00 ± 0.34 (1/18) | −0.22 ± 0.64 (7/19) |
| bass, in B and C (47) | +0.22 ± 0.79 (9/27) | +0.11 ± 0.34 (10/27) | −0.12 ± 0.68 (11/27) |
| treble, only in B, struck by C (4) | −0.62 ± 0.62 (1/4) | +3.00 ± 1.22 (4/4) | +7.88 ± 0.97 (4/4) |
| treble, only in C (24) | −0.39 ± 0.49 | +0.30 ± 0.60 | −0.10 ± 1.12 |

The bass rows have no power: even on Chase, where C is true, the crescendi only C has show no measurable
rise. So they neither support nor contradict. The four treble crescendi that C struck (the thinned treble
crescendo, witnessed by S1 and W alone) are followed by a rise in both Licensee files and not in Chase's.
That fits B, but it rests on four events.

## Soft-pedal edges, measured directly

Ratio of median velocity 0.3–1.8 s after an edge to 1.5 s before it, all notes. The places are the union
of the A, A1, B and C soft-pedal commands.

| mm | bar | command, in | Chase | Gourlin | Phillips |
|---|---|---|---|---|---|
| 5316 | 8′ | Off, B/C | 1.08 | 1.05 | 1.14 |
| 5535–5584 | 9 | On/Off ×2, A1 (W) | 1.03–1.05 | 0.95–0.97 | 0.88–0.91 |
| 5667 | 10 | On, A1 (W) | 0.96 | 0.95 | 0.98 |
| 5771 | 10 | On, B/C | **0.85** | **0.98** | 0.92 |
| 6250 | 13 | On, A1 (W) | 0.93 | 0.89 | 0.77 |
| 6716 | 15 | On, all | 0.89 | 0.87 | 0.78 |

Chase's velocities drop where B/C put the una corda on (bar 10, 5771 mm). Gourlin's do not. Both Licensee
files are lower than Chase's in bar 9 and at 6250 mm, where only the Widuch copy (A1) has soft-pedal
commands. These are windows of 1–9 notes, overlapping where edges lie 15–30 mm apart, and Phillips says
he edits or omits soft-pedal data. Suggestive only.

## Residuals of the best coding (B) on Gourlin

Clusters above 2.5 robust deviations: bars 3–4 (2164–2248, 2338–2470 mm, +1.0), 4′ (4172–4287, +1.4),
9–10 (5434–5632, −0.9), 11 (5852–5889, +0.7), 14–15 (6473–6676, +1.2), 19–20 (7877–8204, −1.5), 24 (9421).
Every point of the roll lies within 150 mm of some expression edit of A1, B, B1, C or D1 (coverage 1.0),
so nearness to an edit carries no information and is not argued from. Absolute fit is low throughout
(0.62 against 0.95 on the control), so B does not describe Gourlin's coding completely either. The copy
may carry expression of its own.

## Verdict

In the bass, where the method demonstrably separates B from C, both Licensee emulations follow B's coding
better than C's. The margins are 0.19 (Gourlin) and 0.13 (Phillips), against 0.044 for the true coding on
the control. All parameters transferred from a different engine build give the same order, and so do the
bar-by-bar comparison and the four treble crescendi C struck. A and A1 fit far worse, so the pair's coding
contains B's additions over A. B1 is indistinguishable from B. C and D1 cannot be separated by
construction. This agrees with the note reading (the c′ of bar 4 ending like S1 and W) in placing the
pair's source before C rather than after it.

Confidence: moderate. The result survives clock errors, paired command displacement and hole jitter of
the size copies show. It does not survive independent displacement of individual expression holes by
0.1 s or more, which would reverse the ranking by up to 0.15 without any difference in text. Nothing here
measures how far the Licensee transfer moved single expression holes.

What would falsify it:
- a scan or e-roll of either Licensee copy showing C's added bass crescendo pairs, above all in bars 3,
  3′ and 14
- the expression holes of such a scan, run through this model, favouring C

## Caveats

- Different emulator builds (Oct 2005 against July 2006); different printed and play tempi (80 against 75).
- The inputs are the edition's collated symbols, placed through matched notes, not the copies' own holes.
  The earlier study found an imperfect input reconstruction costs most of a fit.
- The treble cannot separate B from C even on the control. On the treble, a correct model reached only
  R² 0.47 in the midi2exp control.
- Phillips's engine is otherwise unfitted and his files are edited, so his numbers only corroborate the order.
- Model selection by cross-validated R² over a grid is optimistic, but equally so for every candidate.
