# Per-group ablation of the edition's expression edits against the Licensee pair

Question: is the source of the Licensee pair (Trachtman's emulation of Gourlin's copy, Phillips's
LW file) B itself or a lost intermediate version? The candidates are an α between A and B holding
part of B's edits, a β between B and C holding part of C's edits, and B1. Every figure below is a
property of this test design on these files. None of them says whether a command is recoverable
from velocities in principle. For groups the design sees poorly, blind reconstruction (an/recon/)
is the stronger test.

Scripts: `ablation.py` (primary context, `ablation.json`), `ablation_both.py` (calibrated in both
contexts, `ablation_both.json`), `tables.py` (verdicts, `tables.json`), `soft_test.py`
(`soft_test.json`), `loci.py` (thinned treble crescendo and H5′, `loci.json`), `control_red.py`.

## Design

- **Edits and groups.** Edits of B, C, B1, A1 and D1 are read from `an/versions.json`.
  - A deletion counts only if its symbol stands in the version's parent snapshot. That removes
    52 of B's deletions (they point at A1 symbols) and 1 of A1's as no-ops.
  - Each edit is classified in the terms of 04-varianten.tex 110–118:
    - addition: inserted commands that act in the version's own snapshot
    - redundant insertion
    - redundancy removal: deleting a command that does nothing in the parent
    - withdrawal: deleting a command that acts
    - shift: deletion and insertion of the same command
  - Groups are one version, one scope (bass, treble, soft) and edits within 150 mm.
- **Statistic.**
  - Each file's dynamics are fitted freely on a context coding (B or C), and the group is toggled
    in that context.
  - The gain is the held-out (5-fold) log-likelihood of the edited coding over the unedited one, in
    the rows the group changes.
  - Soft-pedal groups refit the attenuation factor.
- **Verdict.** A parametric bootstrap (60 runs) on the file's own fitted model gives the gains when
  the model is given the group and when it is not.
  - has: the gain lies above the 95th percentile of "not given" and inside the "given" range.
  - lacks: the mirror case.
  - between: above "not given" but below "given", so partial or modified.
  - overlap: the two ranges overlap, so the design cannot decide.
  - Power is the rate at which the design reaches the right verdict on its own simulations.
  - The primary context is C for the controls and B for the pair. Both contexts are reported
    because fixed dynamics favour the context.
- **Precision.** The gain profile over displacements of the whole group by ±0.05 to ±0.7 s gives
  the half-width in mm within 2 log-units of the best displacement. "Best at x mm" means the
  optimum is not at 0. "≥ 30 mm" means there is no peak within ±0.7 s.
- **Correction.** In `calibrate()` the keys `critical_has` and `critical_lacks` are named the wrong
  way round. `tables.py` reads them correctly, and the "undecided" labels in the raw JSON are
  superseded by `tables.json`.

## 1. Controls

- **Which copy Phillips's red file reads.** Free fits, cross-validated R², bass:
  - C 0.856, B 0.519, B1 0.550, A1 0.201, A 0.011
  - treble: C 0.504, B 0.486
  - So it witnesses C, as enrich-edition.ts argues from the edge tears (S2, Condon 48). It is the
    C-truth control for Phillips's engine.
- **Chase emR.** Its coding D1 is C for this model: C 0.952, B 0.908.
- **Edit classification.**
  - C's 76 edits: 73 additions, 1 note shift, 2 redundancy removals.
  - B: 103 additions, 1 redundant insertion, 13 edits that are no-ops.
  - B1: 2 additions and 1 redundant insertion.
  - A1: 52 additions, 5 redundant insertions, 1 withdrawal.

## 2. Power and verdicts per group (primary context | other context)

Detection by at least one control, then the verdicts of Gourlin (G) and Phillips LW (P). Only
groups with rows are listed; the rest are named under each version.

### C (73 additions)

| group (bar) | add. | controls detect | G | P | pair power (has, lacks) |
|---|---|---|---|---|---|
| bass upbeat | 2 | yes | overlap \| has | lacks \| lacks | .37/.88, .28/.40 |
| bass 2–3 | 5 | yes | lacks \| lacks | lacks \| overlap | .65/.75, .58/.83 |
| bass 4–5 | 3 | yes (PhR) | overlap | overlap \| has | .23/.50, .00/.10 |
| bass 6 | 1 | yes | lacks \| overlap | lacks \| overlap | .50/.70, .18/.65 |
| bass 6–8 | 5 | yes | lacks \| overlap | lacks \| overlap | .37/.62, .18/.65 |
| bass 8 | 2 | yes | lacks \| overlap | lacks \| overlap | .18/.83, .25/.57 |
| bass 2′–3′ | 2 | yes | lacks \| overlap | overlap | .37/.85, .45/.25 |
| bass 4′ | 1 | yes (PhR) | no rows | – \| has | – |
| bass 7′–8′ | 2 | yes | lacks \| overlap | overlap | .30/.62, .22/.58 |
| bass 14–16 | 12 | yes | lacks \| lacks | lacks \| lacks | 1.0/1.0, 1.0/1.0 |
| bass 18–19 | 5 | yes | lacks \| overlap | lacks \| overlap | .73/.70, .45/.57 |
| bass 20 | 1 | yes | lacks \| lacks | lacks \| lacks | .98/.95, .98/.98 |
| bass 22–23 | 6 | yes | overlap | lacks \| overlap | .33/.05, .25/.57 |
| treble 6′–8′ | 6 | yes (PhR, power .53) | lacks \| lacks | overlap | .08/.37, .15/.28 |
| treble, 10 further groups | 20 | **no** | mostly overlap | mostly overlap | ≤ .65 on controls |

- **Additions no control detects: 20 of 73, all treble.** Together with the 2 redundancy removals
  (one changes no row, the other sits in a group no control resolves) and the note shift, which
  lies outside this model, the design cannot see 23 of C's 76 edits.
- **Detected additions: 53** (all 47 bass, 6 treble).
  - In the primary context the pair has none of them.
  - One file or the other lacks 43 of the 47 bass additions.
  - Both files lack them in both contexts at bars 14–16 and 20 (13 additions, power ≥ 0.95).
  - "has" occurs only in the C-fitted context and only in one file: bass upbeat (G), 4–5 and 4′
    (P), 6 additions in all. Power there is ≤ 0.37, or the group has no rows.

### B (103 additions)

- **"has" in the pair**, in groups with design power ≥ 0.8, 69 additions:
  - bass: 3–5, 8–1′, 2′, 3′–5′, 6′–7′, 8′–11, 12–13, 24
  - treble: 2 (P), 5–6, 9–11 (P), 13–14, 17–18, 21
- **"lacks" in both files, both contexts, power ≥ 0.97:** bass 19–21, 9 additions. Both controls
  carry it (between \| has).
- **The two copies disagree:** treble 19–20 (G has, P lacks, 2 additions).
- **No rows or low power:** bass bar 1 and bars 16–17 (5 additions, no rows); treble 3′, 6′,
  22–23 and 23 (overlap).

### B1, A1, D1

- **B1.** The bass upbeat group has too few rows to judge: G has \| overlap, P has no rows. It is
  context-dependent even on the controls, which lack it (Chase between \| has, PhR lacks \| has).
  The other B1 edit is a redundant insertion and has no rows. The design does not decide B1.
- **A1.** The pair lacks A1 wherever power is ≥ 0.8: bass 3–4, 3′, 8′–9, 19–20, 22; treble 9–10,
  21–22.
  - The one exception is treble bar 3 (1964–2112, 6 additions). Both files show "has" in both
    contexts, while both controls lack it.
  - Power there is only 0.17–0.37, and the locus lies in the pair's own re-timed bar 3→4
    (+27 mm), so it is not usable.
- **D1.** Neither of D1's expression edits changes a row in any file: the mezzoforte hook at
  1145–1243 mm lies before the first note at 1438, and the Off removed at 6338.5 was redundant.
  So D1's expression edits cannot be tested in this design.

### Positional precision (rule 2)

- **The pair.** Where a peak exists: bass 8′–11 1.1/2.3 mm, 12–13 1.1/1.1, 3′–5′ 3.3/5.7,
  8–1′ 5.2/8.6; treble 5–6 13.2/13.1, 9–11 (P) 1.1.
  - About 60 % of the pair's group–file cells have no peak within ±30 mm, or the best
    displacement is not at 0. This concentrates near its own stretches, with the best at
    −18 mm in bars 3–5.
  - These half-widths are for joint displacements of whole groups under the model. Single
    punches are not resolved, so nothing here is binding under rule 2.
  - The nearest to "same place" are B's bass additions in bars 8′–13, at ±1–2 mm jointly.
- **The controls:** 0–16 mm.

## 3. Specific loci

- **The six treble crescendo commands C removed** (all carried only by S1 and W).
  - 1691.3 and 2608.5 already do nothing in A.
  - 1770.0, 2582.3 and 7444.5 act in A and are made redundant by single B additions placed
    11–14 mm earlier (1759.1, 2568.6, 7430.8). These are commands "nach vorne gezogen" with the
    old one left standing (04-varianten.tex 102).
  - 8036.8 acts only in A1. B's Off at 8019.6 sits 17 mm earlier.
- **Does the pair carry B's four earlier commands?**
  - With B's positions against A's, context B: G has (+4.5, power .68/.52), P has (+3.6, .45/.27).
  - In context C: G between (−0.8), P has (+2.6).
  - The best displacement is −18 mm, so the design does not resolve an 11–17 mm shift near these
    loci. A's state and B's state cannot be told apart here.
  - The earlier observation that both Licensee files rise after the four struck commands is
    equally explained by B's commands 14 mm earlier, so it is not evidence for α.
- **Soft pedal, bars 8′–15 (Gourlin only).**
  - Chase is the control: B's pattern 0.952 bass / 0.833 treble, Widuch/A1 0.802 / 0.686,
    data A 0.803 / 0.711, no soft pedal 0.636 / 0.425. Design power 1.0.
  - Phillips's red file is no soft-pedal control, since its velocities carry no attenuation
    (factor 0 bass, 0.04 treble).
  - Gourlin's bass carries no attenuation either (factor 0), so the bass is uninformative.
  - Gourlin's treble (factor 0.04–0.08), window 5300–6750 mm, gains against B's pattern:
    Widuch **+1.74**, data A −3.26, none −16.6.
  - The 95th percentile under simulated B is 0.42, and the design power at the file's own
    factor is 0.78.
  - Among the ablation groups:
    - B's Off at 5316 shows "has" in the treble (+2.4, power .88/.63). A release near bars 8′–9
      stands, but whether it is B's 5316 or Widuch's 5507 is not resolved (best at −30 mm).
    - B's On at 5771 gains only +0.2.
    - A1's groups are overlap.
  - This is an indication, not a binding reading: positional precision is ≥ 30 mm, and the 2006
    Trachtman build attenuates about a third as strongly as the 2005 build.
- **H5′ (C's edits present, but the dynamics re-coded at C's loci).** Mean squared residual
  under B, at C's loci against the whole file, with a circular-shift null:
  - Controls (they carry C): bass 1.79 (p .053, Chase) and 2.11 (p < .001, PhR). The test sees
    C's presence.
  - Pair: bass 0.47 (p .88, G) and 0.32 (p .95, P). At C's loci the pair fits B better than
    elsewhere.
  - The pair's departures from B concentrate in the treble at B's loci (G 1.41, p < .001;
    P 1.29, p .064) and at its own note and pedal edits (G 1.28, p .036; P 1.21, p .053).
  - A correlation of residual with C's predicted change came out −0.87/−0.77 on the controls,
    which carry C. It is biased by the fixed dynamics and is not used.

## 4. Hypotheses

| | separative / conjunctive readings | power | verdict |
|---|---|---|---|
| **H1** B → pair | Conjunctive with B: 69 B additions present. Separative against C: 43 of 47 bass additions absent, 13 robustly. **Against H1:** B's bass 19–21 group (9 additions) absent. | high in the bass | Consistent with everything except bars 19–21 bass. **Moderate.** |
| **H3** A → α → B, α → pair | Separative: B's bass 19–21 absent (power ≥ .97, both copies, both contexts). Weak: Widuch soft pattern in Gourlin's treble (+1.7, power .78). B's four "vorgezogen" commands not resolved. A1 treble bar 3 unusable. | one well-powered group | **Possible, not established.** Bars 19–22 also carry the pair's own pedal and duration edits, so a Licensee re-coding there explains the same data. Rule 1 forbids withdrawing acting commands, but a transfer to another system need not obey it (as D2 shows). |
| **H4** B → β → C, β → pair | β needs C additions in the pair. Bass: none in the primary context; 6 in the C-fitted context only, power ≤ .37, contradicted by the other copy. Treble: 20 of 26 C additions unseen by the controls. | none in the treble | Bass part **not supported**. A β holding only treble C additions **cannot be tested by ablation**; reconstruction should decide. |
| **H11** B1 → pair | B1's only rowed group is context-dependent even on controls lacking it. | none | **Undecided.** |
| **H5** C → pair with reversion or contamination, and H5′ | Needs ≥ 43 acting bass additions withdrawn at C's loci. At C's loci the residual under B shows no excess (0.47/0.32 against controls' 1.79/2.11). | high in the bass | **Not supported in the bass.** The treble cannot be judged here. |

## Caveats

- The dynamics are fixed per context, which favours the context. Only verdicts that agree across
  both contexts should be relied on: in C, bars 14–16 and 20; in B, bars 19–21; most B "has".
- The inputs are the edition's collated symbols placed through the pair's pitch alignment, not
  the pair's own holes. The pair's stretches (bar 3→4, bar 8→1′) and pedal shifts put the best
  displacements 17–30 mm off in places.
- Engine builds differ (2005 against 2006), and the printed tempi are 80 and 75.
- The two Licensee files are not independent in their coding: they are one text.
- Absence at 19–21 could be the Licensee editor's.
