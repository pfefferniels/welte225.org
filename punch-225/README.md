# The punch of WM 225, measured across the copies

Most Welte rolls note their punch date at the end of the roll. Where one
does not, the literature offers the size of its perforations as a way of
supplying it: red T-100 rolls are said to have been punched at 2.2 mm
until about 1910 and at 1.8 mm afterwards. Roll 225 is a good place to
test that, because three of its copies are red T-100 rolls whose punch
dates are known and which straddle the stated boundary: January 1909,
October 1910 and January 1914. This directory holds the scripts and the
derived data of that measurement, taken on every copy of the roll that
exists as a scan, and of the wider check the roll's own copies turned out
to need.

The short of it: both of Hagmann's figures are real, and the date
between them is about eight years too early. No copy of roll 225 has a
1.8 mm punch, including the one punched in 1914; the 1.8 mm punch is
there to be found on red rolls punched later. The roll also shows a
second change, in the advance of the perforator, which happened between
1909 and 1914 and which the literature does not describe.

## What Hagmann says

Hagmann gives the figures in a table (*Das Welte-Mignon-Klavier*, p. 76):

| Art der Rolle | Perforationen ∅ | Schritt | Teilung |
|---|---|---|---|
| Philharmonie | 1,6 mm | 0,9 mm | 2,8 mm |
| Mignon rot-alt | 2,2 mm | 0,9 mm | 3,2 mm |
| Mignon rot-neu | 1,8 mm | 0,9 mm | 3,2 mm |
| Mignon grün | 1,6 mm | 0,9 mm | 2,8 mm |

His footnotes define the two spacings: *Schritt* is the distance along
the roll between the centres of two perforations, *Teilung* the distance
across it, which is the pitch of the tracker grid. "rot-alt" is
production up to about 1910 and "rot-neu" from about 1910, and both
datings rest on a communication from Heinrich Weiss-Stauffacher of
21 August 1978 rather than on measurement. Hagmann notes in the same
passage (p. 76, n. 7) that comparisons between older and younger Mignon
rolls of the same content, accompanied by measurements, could say more.
This is such a comparison.

## What the copies show

Figures in millimetres, from `punch.txt`, with the dated control from
`corpus.txt`:

| Copy | Punched | System | Teilung | ∅ across | slot | bridge | pitch | advance |
|---|---|---|---|---|---|---|---|---|
| St1 | 18 Jan 1909 | T-100 red | 3.195 | 2.200 / 2.348 | 2.289 | 0.716 | 3.002 | 1.01 |
| Wi1 | 28 Oct 1910 | T-100 red | 3.186 | 2.030 | 2.115 | 0.846 | 2.961 | (1.03) |
| St2 | 14 Jan 1914 | T-100 red | 3.193 | 2.284 / 2.383 | 2.353 | 0.648 | 2.998 | 0.50 |
| Ch1 | after 1916 | Licensee | 2.827 | 1.861 | 1.438 | 0.931 | 2.453 | 0.63 |
| Bo1 | after 1924 | T-98 green | 2.817 | 1.607 | 1.607 | 0.677 | 2.200 | 0.43 |
| *3309* | *22 Nov 1922* | *T-100 red* | *3.194* | *1.777 / 1.877* | *1.915* | *0.579* | *2.496* | *0.49* |

Roll 3309 is not a copy of 225 but a control: Backhaus playing Schubert's
*Militärmarsch*, the Stanford copy punched 22 November 1922, read on the
same machine and measured by the same code. Where two figures stand under
∅ across, the first is the box the parser drew at its own grey level and
the second the width measured on the scan at half the contrast between
paper and slot; the spread between them is the measurement's own, not the
roll's. The advance of the Widuch copy is bracketed because its scan does
not resolve it. *Slot* is the length of a perforation along the roll,
*bridge* the paper standing between two of them, *pitch* their sum, and
*advance* the smallest step the perforator took.

- **The Teilung holds, and vouches for the scales.** 3.19 mm on the red
  copies against Hagmann's 3.2 mm, 2.82 mm on the green and the Licensee
  copy against his 2.8 mm. Since the lateral scale of a scan is what a
  punch diameter is measured in, this agreement is the reason to believe
  the diameters at all.
- **The green copy's punch is where Hagmann puts it.** 1.61 mm against
  his 1.6 mm for "Mignon grün".
- **The 1909 copy is "rot-alt".** 2.20 mm at the parser's level, 2.35 mm
  at half contrast, against Hagmann's 2.2 mm.
- **No copy of 225 is "rot-neu".** The copy punched in October 1910
  reads 2.03 mm across the roll and 2.12 mm along it; the copy punched in
  January 1914 reads 2.28 and 2.35 mm. Nothing in this roll approaches
  1.8 mm, and the later of the two Stanford copies has, if anything, the
  larger punch. Across the sweep of edge levels their difference holds at
  +0.73 px, 0.062 mm, so it is not the level's doing. It is also the wrong
  sign, and six times too small for the criterion, which asks for 0.4 mm
  downwards.
- **The 1.8 mm punch is real, eight years later.** The control punched in
  November 1922 reads 1.78 mm at the parser's level and 1.88 mm at half
  contrast. So the two figures of Hagmann's table are two real states of
  the machine, and what fails is only the date he puts between them:
  the punch was still 2.2 mm in January 1914.
- **The punch shrank together with the pitch.** From 1914 to 1922 the
  punch went from 2.35 to 1.92 mm along the roll and the distance from
  one slot of a held note to the next from 3.00 to 2.50 mm, while the
  advance stayed at 0.5 mm. A held note on a late red roll is a finer
  dotted line than on an early one.
- **The advance is a second, earlier criterion.** The machine that
  punched the 1909 copy stepped 1.01 mm at a time, the one that punched
  the 1914 copy 0.50 mm, and the 1922 control 0.49 mm. Both figures for
  225 are confirmed by an independent quantity: asked of the onsets of
  notes, which the lengths of slots do not enter, each copy peaks where
  its slot lengths said it would, at 1.005 and 0.500 mm. So between
  January 1909 and January 1914 the advance halved while the punch did
  not change, and between January 1914 and November 1922 the punch shrank
  while the advance did not. Two changes, separately datable, where the
  literature describes one.

What Hagmann's 0.9 mm *Schritt* names is less clear than his footnote
makes it sound. Read as he defines it, centre to centre along the roll, it
should be the pitch, and the pitch is 3.0 mm on every red copy of 225,
more than three times his figure. It sits closer to two other quantities:
the advance on the earliest copy (1.01 mm), and the bridge, which runs
between 0.58 and 0.93 mm on all six rolls here. The bridge is measured
edge to edge and so contradicts his wording, and the advance is not one
value across the roll types, the rolls here giving 1.01, 0.50, 0.63 and
0.43 mm. Of the three columns of his table this is the one the scans
agree with least, and which quantity it was meant to record is not
something these measurements can settle.

## Does the punch date a roll? (`corpus.txt`)

One roll cannot answer that, so the question goes to the 431 red Welte
rolls of Stanford's SUPRA index, all read on one machine and parsed at
one threshold by one build, and therefore comparable to each other and to
the copies above.

- **The width is bimodal, at Hagmann's two values.** One mode at 1.7 to
  1.8 mm holding 265 rolls, another at 2.1 to 2.3 mm holding 94, with a
  thin valley between. The 1.8 mm is not an artefact of one measurement.
- **The width belongs to the copy, not to the title.** Twelve titles are
  held at Stanford both ways, one copy with a wide punch and one with a
  narrow one — Welte 365, 570, 660, 1033, 1213, 1247, 1259, 1263, 1352,
  1447, 1474 and 1480. One matrix, two punches, years apart. This is the
  structure a dating criterion needs, and it is why the criterion is
  worth correcting rather than dropping.
- **The change is after 1913.** No title above Welte 2703 shows a wide
  punch, and below that number the two are mixed, as they must be if
  early titles stayed in the catalogue and were re-punched for years.
  Welte 2703 itself measures 2.220 mm and is published in 1913, with
  Condon's note on its leader reading "Dated 1913 at the reroll point".
  Together with roll 225's copy of January 1914 and the control of
  November 1922, the change falls between 1914 and 1922.

So the criterion stands with its boundary moved. A red roll with a 2.2 mm
punch was punched before the middle of the 1910s and one with a 1.8 mm
punch after it, and how much narrower the window can be made depends on
finding dated copies between 1914 and 1922.

## How far to trust the numbers

- **The absolute diameter depends on where an edge is put.** A scan does
  not say where the paper ends; a level has to be chosen, and moving it
  from 30 % to 70 % of the contrast moves the slot by 1.3 px, about
  0.11 mm (`sweep.txt`). Every absolute figure above carries that. It is
  a quarter of the 0.4 mm the criterion turns on, which is why the
  criterion is legible at all.
- **Slot and bridge trade off; their sum does not.** A blur moves the two
  edges of a slot outward and the two edges of a bridge inward by the
  same amount, so the pitch survives what the other two carry. Compare
  copies on the pitch, and read slot and bridge as a pair.
- **The punch is round, which is what lets the two cuts check each
  other.** Slot along the roll over width across it is 0.98 on the 1909
  copy, 0.99 on the 1914 copy and 1.02 on the 1922 control. A slot that
  were two punches overlapping at the 0.5 mm advance would be a quarter
  longer than it is wide, so the reading that a wide slot is a narrow
  punch plus an advance does not hold.
- **Absolute figures do not travel between scanners.** The Licensee copy
  reads 1.86 mm across the roll and 1.44 mm along it, a disagreement of
  0.4 mm on a punch that is round. Its scan is one bit deep, so the hole
  is where the scanner's own slicing level put it, and that level did not
  treat the two axes alike. Only the Stanford rolls were read on one
  machine, and only their comparison is clean — which is why the control
  and the corpus are Stanford's.
- **The Widuch copy's Teilung is not independent.** `mrs2roll.py` sets
  the lateral scale of that scan from the nominal track pitch in the roll
  trailer, so 3.186 mm is close to 3.2 mm by construction. Its along-roll
  scale is the transport's design step and is independent; its pitch of
  2.961 mm is 1.3 % under the Stanford copies', which may be the paper or
  may be that step. Its punch of 2.03 mm, the lowest of the three red
  copies of 225, is also the one measured on the coarsest scan, and no
  weight should be put on its being lower than the other two.
- **The Widuch copy's advance is not resolved.** The Bern scanner writes
  a line every 0.2 mm, and a 0.5 mm comb is two and a half lines. The
  strongest period found is 1.03 mm but only at R = 0.22, too weak to
  place that copy on either side of the change in the advance. Reading
  the `.mrs` at its own resolution rather than the resampled image might
  settle it, and would date that change more closely than 1909 to 1914.
- **The catalogue number is not a date.** It orders the titles and so
  gives a copy its earliest possible date, nothing more. The bound "after
  1913" rests on that ordering together with the published date of Welte
  2703 and Condon's reading of its leader, not on the number itself.
- **The dates are the edition's.** St1's rests on the inscription "225.
  Fritz. 18 Jan 09." and is held true; St2's on "225. 14. 114." and is
  held possible. A different reading of the second would move the later
  copy within the 1910s but would not bring a 1.8 mm punch into the roll.

## How it is measured

`measure.py` writes the three tables for the copies of 225, `corpus.py`
the control and the corpus check. The Stanford rolls are read over IIIF
at full resolution as PNG, so nothing measured has been through a lossy
coder; the other three copies from the ATON analysis their local scans
were parsed into.

Two cuts are taken through a perforation. Down the roll, a strip through
the middle of a held note gives its slots, the bridges between them and
their sum (`images.chained`). Across the roll, rows through a short note
give the punch's own width, which no chaining can lengthen
(`images.width`).

Edges are placed two ways (`edges.py`). Where the profile passes half the
contrast is the obvious one and the one the sweep varies. Both Stanford
scans clip — their slots sit at 255 whatever the exposure while their
paper does not — so the half level falls differently in each session, and
the steepest point of the transition, which a symmetric blur and a change
of exposure both leave alone, is used where copies are compared.

The advance is read as the period the slot lengths keep (`advance.py`).
Since most slots are a single punch and that one tall tooth shares a
phase at every trial period, the lengths are not folded directly:
differences between pairs of slots far enough apart are, which drops the
tooth and leaves the distances between teeth. The same period is then
asked of the onsets of notes, a quantity the slot lengths do not enter.

## Files

| File | Content |
|---|---|
| `measure.py` | the copies of WM 225; writes `punch.txt`, `advance.txt`, `sweep.txt` |
| `corpus.py` | the dated control and Stanford's 431 red rolls; writes `corpus.txt` |
| `holes.py` | the perforations of a copy, from an analysis file or from the edition's IIIF regions |
| `images.py` | the Stanford scans over IIIF, and the two cuts through a perforation |
| `edges.py` | sub-pixel edges, by half contrast and by steepest point |
| `advance.py` | the perforator's advance, as the period the lengths keep |
| `punch.txt` | the table of diameters and spacings |
| `advance.txt` | the advance, from slot lengths and from onsets |
| `sweep.txt` | slot and bridge at a range of edge levels |
| `corpus.txt` | the control, the distribution, the titles held both ways |

Run them with `python3 measure.py` and `python3 corpus.py`. They need
`numpy`, `Pillow` and `requests`, the network, and for `measure.py` the
scans of the three local copies at `../../rollscan2image/scans` or at
`--scans`. Downloads are kept in `cache/`, which is not committed.

## Sources

- Hagmann, Peter. *Das Welte-Mignon-Klavier, die Welte-Philharmonie-Orgel
  und die Anfänge der Reproduktion von Musik*, Freiburg 1984, p. 76 with
  nn. 7–11.
- Phillips, Peter. *Piano Rolls and Contemporary Player Pianos*, p. 123
  and Table 4.3, for the Licensee's 98 positions at nine to the inch on
  11¼ in paper.
- roll-image-parser, <https://github.com/pianoroll/roll-image-parser>;
  the SUPRA index, <https://github.com/pianoroll/SUPRA>; the published
  analyses, <https://github.com/pianoroll/piano-roll-analyses>; and the
  SUPRA MIDI specification, <https://supra.stanford.edu/midi-spec/>, for
  the analysis fields and for Stanford's along-roll resolution of
  300.25 dpi.
- The punch date of roll 3309's Stanford copy is from the dissertation's
  chapter 1, n. 50, as `welte-t100/docs/sources.md` records it.
- The scans of the Widuch, Chase and Dyer copies were prepared for the
  parser by `mrs2roll.py` and `cis2roll.py` in
  <https://github.com/pfefferniels/rollscan2image>, whose README states
  what each scanner's scales rest on.
