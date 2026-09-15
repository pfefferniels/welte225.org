# Gourlin and Phillips Licensee copies of Welte 225: established results (2026-09-14)

Sources: Trachtman's emulation of Gourlin's copy (WSTco beta 9 July 2006, CIS 12 March 2007, MK4 at 300 LPI, roll no. C-225, printed tempo 75); Phillips's LW file ((c) 2014, pneumatic reader, emulated). Edition: ../welte225.org/edition.jsonld, tree A → A1 (W), A → B → B1 (S1), B → C (S2) → C1 (Schmitz), C → D1 (Chase), C → D2 (Dyer green). Sigla in the dissertation (04-varianten.tex:141–153): C = Chase, B = Both/Dyer, G = Gourlin, P = Phillips.

## Method and controls
- Notes and pedals put on the edition axis by pitch-sequence alignment (Needleman–Wunsch, chords sorted by pitch) and a running-median displacement over ±6 notes; collation at the edition's 8 mm tolerance.
- Controls: Phillips's red file reproduces C at 463/463 notes and 103/103 pedal events; Trachtman's emulation of Chase's copy reproduces D1 at 463 same + 1 duration, 0 added, 0 missing, and shows D1's readings against C.

## One text on both copies
Gourlin against Phillips: 463 notes same, pedals all shared. Only difference: the c♯′′ of bar 14 is split on Gourlin's (web ≈ 3 mm), one note on Phillips's (reader or exemplar, undecidable).

## Readings of the pair against C (both copies agree)
- Local stretches: +26/29 mm between bar 3 (2073) and just after the downbeat of bar 4 (2244); +27 mm between bar 8 (3340) and bar 1′ (3474).
- Durations: about a dozen held notes end 2–4 mm after the next attack where the T-100 holds them 13–25 mm longer (bars 2, 3, 4′, 10, 11, 12, 16 ×2, 20, 24); lengthened: bar 8 f′ +10, bar 23 f′′ +15; bar 14 e′′ tied through (re-attack at 6611 removed); bar 24 c′ cut and re-struck with the final chord.
- Bars 6–7: a held from 2671 cut at 2851 and re-struck at 2865; d moved 18 mm before the downbeat of bar 7.
- Pedal: five added depressions (bars 5–6, 8, 1′–2′, 9–10, 16); bar 15 first On 21 mm later, release added at 6795, second On kept at 6827; about ten further events shifted 8–24 mm, both directions, no single rule (pedal-on median 8.7 mm after last attack in C, 10.3 in the pair).
- Gourlin only: a second sustain Off 9 mm after C's at 4465 (bar 5′/6′), and an Off in the leader at 1354.

## Diagnostic readings of the tree
- D1 (Chase): the "repeated c′" at 5242 is a 3 mm leading fragment (Chase emR 5242.0–5244.9, then 5246.9–5284.3; CIS analysis has two overlapping features 5242.4–5284.5 and 5247.4–5284.6) — exemplar-level, weak. The retimed c of bar 23 (8871.5/8942.5 on Chase) is absent: pair has C's 8872.5–8943.8 and 8955.6–9105.7.
- D2 (green): no longer g (bar 14), no stray f′′. Bar 15: green lifts 6785–6798 and holds to 6880; pair lifts 6795–6827 and re-depresses at the T-100's second On. Different solutions of the same double-On.
- A1 (Widuch): pair has the release at 5370.9 (bar 9 downbeat).
- B vs C, the only note reading: c′ of bar 4 ends, measured from the onset of B♭ (p46) inside each source: S1 +25.0, W +29.7 | S2 +18.2, Chase +18.4, green +20.5 | Gourlin +25.4, Phillips +25.9. Pair sides with A/B.

## Physical evidence
- Trachtman's ticks sit on a lattice of 11.90 ticks = 0.7557 mm at 400 ticks/inch, Stahnke's "late" Licensee advance (MMD 1996.12.02.01: "Late Welte-Mignon Licensee rolls exhibit a punch advance of about 0.756 mm. (Early rolls use a coarser advance.)"). Trachtman's converter can impose a step a priori (his "Recovering Inherent Roll Punch Matrix Spacing Information"), so this is not necessarily a measurement.
- Gourlin's paper per edition mm 0.883 (Trachtman calibration). Phillips's spool-law fit gives an initial speed of 42.1 edition-mm/s, i.e. 7.3 ft/min on that paper, near the printed 75; LW/RW duration 193.2/172.2 s = 1.122 against 1.114 predicted from 0.883 at tempo 75.
- Chase's scan: round single punches measure length/width 0.773 (IQR 0.727–0.810, 8720 holes), 22 px across, 17 px along; every calibrated control is 1.00 (Stanford S1, S2 and four other rolls, Widuch, Dyer green). Across scale is confirmed by track spacing. Either Licensee punches are oval, or Chase's along-roll calibration (header 180 LPI) is about 23 % short, which would put his copy near T-100 length (scale ≈ 1.006) and make the agreement of 1.30 with the green copy's 1.293 a coincidence. Corrected lattice 0.608/0.773 ≈ 0.79 mm, coarser than 0.756 as Stahnke says of early rolls. Unresolved; needs a Licensee roll on a calibrated scanner or a caliper measurement of a Licensee perforation.

## Expression, first test (an/expr/expression_test.md)
Cross-validated R², bass: Chase control C 0.95 against B 0.91; Gourlin B 0.62 against C 0.43 (A 0.12, A1 0.35); Phillips B 0.44 against C 0.31. The treble does not separate B from C. Engine builds differ (Chase file Oct 2005, Gourlin's July 2006). This is a model comparison, not a reconstruction.

## Dynamics: ablation (an/expr2/ablation.md) and reconstruction (an/recon/reconstruction.md)
- **Controls.** Chase emR (D1) for Trachtman's engine, R² 0.987 in both registers. Phillips red (S2 = C; C 0.856 against B 0.519) for his, R² 0.93/0.89. B's and C's edits with power are recovered at 96–100 %, A1's readings come out absent, and displaced edits come out "present" in at most 8 % of cases.
- **C's additions.** Ablation: the 47 bass additions are detectable, and the pair has none (bars 14–16 and 20 absent at power ≥0.95). Reconstruction: "Mittelstimmen" bass pairs −1.00 ± 0.23 (Gourlin) and −1.17 ± 0.42 (Phillips); other bass pairs −0.67/−0.33; treble pairs −0.88 ± 0.43 (Gourlin), no power for Phillips. No C group is present in either method.
- **Re-coding at C's places (H5′) is not supported.** The controls show excess residual under B at C's bass places (1.79, 2.11); the pair does not (0.47, 0.32).
- **B's edits.** Additions present, +0.99/+1.04 on 27 edits; shifts present. Missing: the bass group of bars 19–21 (ablation) and the forzando of bar 3′ plus crescendi at bars 19 and 20 (reconstruction).
- **B1 and A1.** B1's one testable reading is absent; A1's readings are absent.
- **Soft pedal (Gourlin).** Decoded: on through bars 8′–9, off 5574–5636, on until bar 13 (6394), then off. Fixed-timeline NLL: Gourlin 106 for the Widuch pattern against 150 for B/C; control 1244 against 160. Ablation: treble prefers the Widuch pattern by 1.74 (threshold 0.42), but finds no bass attenuation in Gourlin.
- **Places neither B nor C explains, on both copies:** the stretch at bar 3→4, the pedal at bar 2′, the missing forzando at bar 3′, and bars 13–14.
- **Precision:** 31–68 mm per group, never "exactly the same place".

## Correction after Niels's objection on the soft pedal
- **Bars 9–10.** No redundancy in any sequence and no shared addition at the same place, so only the nuance presumption applies. The Widuch flicker is A1's addition. B's plain release (5315.6–5770.6, shared by S1, S2, Chase and, as a hold, green) is either A's reading or B's own addition; parsimony slightly favours A. B's 52 dangling deletions and the motivation "extend-area-without-una-corda" are relics of the view that the flicker belonged to A.
- **Bar 13, decided by Niels.** Widuch's On 6250.4 belongs to A, since a perforation that retrospectively explains a redundancy is implausible. B removed it, leaving the Off at 6338.5 redundant, and D1 removed that Off. B's existing deletion of the On (currently dangling, motivation None) becomes valid, and the label "Verlängerung des Bereichs ohne Verschiebung" fits it: the area without una corda runs from 6185.7 to 6715.5.
- **For the pair, the soft pedal is withdrawn as evidence.**
  - The decoded short release at 5574–5636 overlaps the sustain depression the Licensee editor added (5542–5593).
  - Bars 13–14 are editor-only in dynamics, and the ablation finds no bass soft-pedal effect.
  - The missing crescendi of bars 19–20 lie among the editor's changes in bars 18 and 20.
- **Verdict.** α is unsupported. The pair derives from B with its own layer; B1 against B stays undecided.

## Under Niels's rules (04-varianten.tex 40–118, 440–600)
- **What C added.** 76 edits: 73 additions (23 bass pairs "Differenzierung der Mittelstimmen", 13 unmotivated bass pairs, 20 treble pairs, 5 bass forzando pairs, 12 single commands), 2 redundancy removals (cleanup-c; treble-crescendo-thinned with 6 deletions), 1 note shift (c′ bar 4). Only the additions bind (rule 2), so B against C is a question of dynamics.
- **Bar-4 c′.** It is a shift and binds nothing. The velocity fit cannot show "exactly the same place". Blind reconstruction runs in an/recon/, ablation in an/expr2/.
- **D1 is not the source.** The bar-23 c retiming is a D1-only shift, and reverting it exactly is implausible. The pair shares no Licensee innovation with D1. They are separate productions (tempo 75 against 80, length).
- **Soft pedal and rule 3.** The data's A reads On 1345.6, Off 6185.7, Off* 6338.5, On 6715.5. A1's On 6250.4 would make that redundancy meaningful, which rule 3 excludes. B's extend-area-without-una-corda deletions of the Widuch commands dangle (53 dangling B deletions in all). Chapter 5 (05-rekonstruktion.tex:761–770) gives A the Widuch una corda pattern. D1's "soft-pedal-held" removes only the redundant Off 6338.5.
- **Gourlin against Phillips.**
  - Gourlin-only c♯′′ re-attack, bar 14, web 3.4 mm. Phillips's reader resolves 3.0–3.1 mm webs at bars 7 and 10.
  - Gourlin-only redundant sustain Off at bar 5′, 4468.0 and 4473.9. Phillips's pipeline keeps redundant events (bar-15 double On in his red file).
  - Revised after Niels's objection: most likely both are faults in Gourlin's exemplar, not edits. The c♯′′ gap is 47 ticks = 3.95 punch steps, the smallest same-pitch web on the roll (intended repeats start at 4.7 steps), i.e. a missed perforation, and a machine fault is no version in his model. The gap's second onset lies 0.3 mm from the T-100's e′′ re-attack (chance about 3 %). One version, witnessed by both copies.
- **Bar 15.** The pair and the green copy both correct the archetype's double On in different ways. "Korrektur eines offensichtlichen Fehlers" is a listed edit type but conflicts with rule 3's wording, so treat this as polygenesis.
- **Chronology.** The dissertation's table gives S1 1909 (B1), W 1910 (A1), S2 1914 (C). States coexisted, so a post-1916 transfer from a pre-C state is not excluded on dates.

Scripts: an/export_versions.mjs, parse_midi.py, collate.py, align_dp.py, detail.py, holeshape.py, grid2.py; bar map an/bars/.
