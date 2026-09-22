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

The short of it: both of Hagmann's figures are real, and his dating of
them is not. The two punches were not successive states of one machine.
They belong to two perforators that ran side by side from August 1911 to
April 1922 at least, on the copies dated so far, so the
size of a perforation says which machine cut a copy and not when. What
remains is a tendency rather than a bound: before 1911 almost every dated
copy carries the wide punch, after 1920 almost every one carries the
narrow. The roll also shows a change in the advance of the perforator,
between January 1909 and December 1913, which the literature does not
describe and which does what the punch cannot: the advance halved once,
between December 1909 and May 1910, and on all 204 copies dated at high or
medium confidence where it resolves it falls on the right side of that date.

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
- **The 1.8 mm punch is real.** The control punched in November 1922
  reads 1.78 mm at the parser's level and 1.88 mm at half contrast. So
  the two figures of Hagmann's table are two real states, and what fails
  is his account of how they relate: they are two machines rather than
  two periods, as the dated copies below show.
- **The narrow punch goes with a shorter pitch.** Where the punch is
  1.9 mm the distance from one slot of a held note to the next is 2.50 mm,
  where it is 2.3 mm that distance is 3.00 mm, and the two travel
  together on every copy measured here. A held note on a narrow-punch
  roll is a finer dotted line. The pitch is the better of the two to
  measure, since it survives the grey level chosen for an edge where a
  diameter does not.
- **The advance is a separate quantity, and the more promising one.**
  The copy punched in 1909 stepped 1.01 mm at a time, the one punched in
  1914 0.50 mm, and the 1922 control 0.49 mm. Both figures for 225 are
  confirmed independently of the slot lengths, by the onsets of notes:
  each copy peaks where its slot lengths said it would, at 1.005 and
  0.500 mm. The two copies of 225 carry the same 3.00 mm pitch, so the
  advance changed while the machine did not, and over the archive it
  halved once, within six months of the turn of 1909 to 1910. It is the
  dating criterion the punch turned out not to be.

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
  1.8 mm holding 265 rolls, another at 2.1 to 2.3 mm holding 94. The
  1.8 mm is not an artefact of one measurement.
- **The valley between them is thin but not empty.** Of 439 rolls, 311
  measure under 1.90 mm and 115 over 2.05 mm, leaving 13 in between: one
  in 1.90–1.95, two in 1.95–2.00, ten in 2.00–2.05. Whether those
  thirteen are intermediate punches or ordinary rolls whose average is
  dragged by a tear or a dust run is a question their punch dates can
  answer, since a genuine intermediate should date inside the window and
  a spoiled average should not. Until they are read, the corpus does not
  say whether the change was a clean swap of the punch or a gradual one,
  and the shape of the distribution alone should not be read as deciding
  it.
- **The width belongs to the copy, not to the title.** Twelve titles are
  held at Stanford both ways, one copy with a wide punch and one with a
  narrow one — Welte 365, 570, 660, 1033, 1213, 1247, 1259, 1263, 1352,
  1447, 1474 and 1480. One matrix, two punches, years apart. This is the
  structure a dating criterion needs, and it is why the criterion is
  worth correcting rather than dropping.
- **The wide punch stops appearing above Welte 2703.** Below that number
  the two are mixed, as they must be if early titles stayed in the
  catalogue and were re-punched for years. Read with the dated copies
  below, this is about which machine took the later titles rather than
  about a date after which the wide punch was gone.
  Welte 2703 itself measures 2.220 mm, and Condon's note on its leader
  reads "Dated 1913 at the reroll point" — a date written at the end of
  the roll, which is where a punch date belongs. Stanford holds one copy
  of that title, Condon Roll 1360, so the note attaches to the roll that
  was scanned.

  That note dates one copy; it does not date the punch. What it is good
  for is confirming that a wide-punch copy was being cut as late as 1913,
  which the dated copies below extend to 1922.

So the two figures are real. What they are *not* is two consecutive
states of one machine, which is what Hagmann's table says and what the
dated copies, once there were enough of them, refuse.

### Two perforators, side by side, for more than ten years

An earlier draft of this file dated the change to thirteen weeks in the
spring of 1914. That was wrong, and the way it was wrong is worth
keeping on the record: on the nineteen dated copies then available, no
wide-punch roll was dated after January 1914 and no narrow one before
April 1914, and the step looked clean. The absence was a property of the
sample, not of the archive. With 220 dated and measured copies it
disappears.

The pitch — the distance from one slot of a held note to the next, and
the one quantity that survives the grey level chosen for an edge —
sorts every copy into one of two states, 3.00 mm or 2.50 mm, with the
Teilung holding at 3.19 mm throughout, so both are real geometry and
neither is shrunken paper. Set against the punch dates:

| year | 3.00 mm | 2.50 mm | | year | 3.00 mm | 2.50 mm |
|---|---|---|---|---|---|---|
| 1904 | 3 | 0 | | 1916 | 1 | 1 |
| 1907 | 4 | 0 | | 1917 | 2 | 1 |
| 1908 | 11 | 1 | | 1918 | 0 | 2 |
| 1909 | 16 | 0 | | 1919 | 0 | 4 |
| 1910 | 10 | 0 | | 1920 | 0 | 6 |
| 1911 | 11 | 2 | | 1921 | 0 | 2 |
| 1912 | 11 | 0 | | 1922 | 1 | 41 |
| 1913 | 9 | 1 | | 1923 | 0 | 16 |
| 1914 | 3 | 4 | | 1924 | 0 | 29 |
| 1915 | 0 | 1 | | 1925 | 0 | 19 |

The old pitch runs from August 1904 to April 1922 over 87 copies, the new
one from August 1911 to May 1928 over 147. They overlap by ten years and
eight months.
Two rolls carry the point on their own, and both were measured here
independently of the run that read them:

| Copy | Inscription | Punched | pitch | Teilung |
|---|---|---|---|---|
| W1697 `vf252dc4872` | "24. 8. 11" | Aug 1911 | **2.500** | 3.194 |
| W1275 `jw822wm2644` | "1275. 25. 4. 22." with a signature | 25 Apr 1922 | **3.015** | 3.191 |

The second is legible at a glance and its written number matches the
catalogue. A roll cut on the 3.00 mm machine in April 1922 stands seven
months later than the 3309 control cut on the 2.50 mm machine, and a roll
cut on the 2.50 mm machine in August 1911 stands two and a half years
before roll 225's own copy of January 1914, which is 3.00 mm. Four more
old-pitch copies fall after January 1914: W1254 (6 Mar 1914), W1534
(1 Feb 1916), W589 (4 Jun 1917), W2609 (19 Sep 1917).

**The same title on both machines.** Twelve titles are held at Stanford
in both states, and eight now have both copies dated. Pitch in
millimetres, wide copy first:

| Welte | wide | narrow |
|---|---|---|
| 1474 | 8 Aug 1904, 2.834 | 24 Oct 1923, 2.518 |
| 1352 | 4 Mar 1907, 2.916 | 6 Oct 1924, 2.519 |
| 1263 | 6 Mar 1909, 2.942 | Sep 1924, 2.502 |
| 1447 | 6 May 1909, 2.839 | 24 Apr 1914, 2.506 |
| 1259 | 1909, 3.014 | 29 Aug 1925, 2.602 |
| 1213 | 18 Apr 1912, 3.002 | 8 Nov 1923, 2.590 |
| 570 | 4 Sep 1913, 3.008 | 25 Oct 1922, 2.585 |
| 1480 | 1914, 3.025 | 19 Aug 1914, 2.502 |

One matrix, two machines, in every case — which is what the twelve were
always going to show. What they do not show is the two machines running
at once. Seven of the eight have their wide copy in 1904–1913 and their
narrow one in 1914–1925, which is exactly the pattern a single
changeover in 1914 would leave, and taken alone these pairs would
support the very reading this file withdrew.

The eighth, Welte 1480, has both copies in 1914 and would be the
striking one. It should not be leaned on. Its wide copy is a
low-confidence reading, clipped at the crop edge so that the upper third
of every figure is missing, and the roll number written on the paper
reads 1450 against the catalogue's 1480 — the same mismatch that flagged
`gg384dv5303`. It wants a wider crop before it carries anything.

So the pairs corroborate that a title could go to either machine and
they do not date the change. The evidence for the two running together
remains what it was: `vf252dc4872`, narrow in August 1911, and
`jw822wm2644`, wide in April 1922, each verified individually and each
resting on a single roll.

**What this does to the criterion.** The punch does not bound a red
Welte roll's date. It says which of two perforators cut that copy, and
both were in service from 1911 to 1922 at least. "rot-alt until about
1910, rot-neu after" is wrong more deeply than in its date, because the
two were never successive.

What survives is weaker and wants stating carefully. The proportion
shifts hard: before 1911 almost everything is old pitch, after 1920
almost everything is new. So the punch gives a probabilistic indication
of period, not a bound — useful for saying a roll is *likely* early or
late, useless for saying it cannot be one or the other. And that shift
carries its own caveat: these are the copies Denis Condon happened to
collect, so the year-by-year counts describe what survived in one
collection as much as what Welte was running, and the data cannot
separate the two.

The twelve titles held at Stanford in both states now have a plain
explanation. One matrix, two machines, and the copies need not be years
apart at all.

**The corpus pitch: two families, and a low shoulder.** Swept over 453
rolls (`dates/pitch.json`), the pitch has two hard gaps and one soft one.
Nothing lies between 2.661 and 2.780 mm, which separates the narrow
family from the wide one and is the 17 per cent that matters. Nothing
lies between 2.523 and 2.583 mm either, so the narrow family is itself
two settings, 2.50 mm on 235 rolls and 2.60 mm on 77. The wide family is
one broad mode running from 2.78 to 3.08, with a low shoulder around
2.78–2.88 and only a 0.035 gap above it. An earlier draft of this file
called that shoulder a fourth cluster on 0.05 mm bins; at 0.025 mm it is
not one, and the claim is withdrawn.

The shoulder is still worth naming, because all fifteen of its dated
copies fall between 1904 and 1909 and none later. It is a setting rather
than shrunken paper, and the test is roundness rather than the Teilung.
Had that paper shrunk the 5.8 per cent separating it from the 3.01 mm
mode, the slots would have shortened by the same fraction and the punch
would read oval, slot over width falling from 1.055 to about 0.994.
Measured, the shoulder sits at 1.038. And the shortfall is not in the
slot but in the bridge: 0.609 mm against 0.708 mm, a seventh less, while
the slot loses only a twentieth. Paper cannot shrink one and spare the
other. The same punch was fired with less paper left standing between
firings.

### The advance tracks time, on a narrow base

Of the three quantities, the advance is the one that sorts by date
rather than by machine. Read from the analyses alone
(`dates/step.json`), on the dated copies whose period resolves:

| advance | dated copies | range |
|---|---|---|
| 1.00–1.03 mm | 13 | 20 Nov 1908 to 16 Dec 1909 |
| 0.45–0.55 mm | 223 | 21 May 1910 to 19 Jun 1928 |

Eleven of the thirteen fall on or before 31 March 1909, and the two that
do not are rolls of 4 November and 16 December 1909, the second of which
bounds the change. The halving is bracketed to about five months, between
16 December 1909 and 21 May 1910. Roll 225's
own copies sit either side of it: the copy of 18 January 1909 advances
1.027 mm, the copy of 14 January 1914 advances 0.500 mm. This closes
what this file previously gave as "between January 1909 and December
1913", and it is a criterion Hagmann's table does not contain at all —
though his *Schritt* of 0.9 mm, which matches no pitch measured here,
sits closest to the early advance.

Read the four sections that follow before quoting any of this. The
bracket is narrow, and so is what holds it up.

**What the advance can and cannot be asked.** The period does not
resolve on every roll, and it fails unevenly. Of the dated copies it
resolves on none from 1904, on a third to a half through 1908 to 1910,
and on all of them from 1915 on. That gradient is mechanical rather than
accidental: a 0.5 mm advance puts twice as many teeth in the same range
of slot lengths as a 1.0 mm one, so the finer setting is intrinsically
the easier to see. The filter therefore correlates with the quantity
being filtered, and the eighteen old-advance rolls are an undercount of
a kind the archive cannot correct.

So the criterion is asymmetric, and should be used as such. A roll that
resolves at 1.0 mm was cut before the change; a roll that resolves at
0.5 mm after it; a roll that does not resolve says little, and its
silence is itself weak evidence of the older setting. What the gradient
does not do is let a later roll pass as an earlier one. A comb at 1.0 mm
carries power at 0.5 as well, since every tooth also sits on the finer
grid, but a comb at 0.5 mm folds antipodally at 1.0 and carries none, so
a new-advance roll cannot be misread as an old one. Three rolls read
near 1.5 mm, all at R barely above the threshold, and are noise rather
than a third setting.

**Most hands' rolls do not quantise, and three hands carry the
chronology.** A draft of this file reported that one countersigner's
twenty-one rolls never yield an advance while eighty-seven per cent of
contemporaries do, and took that for a fact about him. It is not. Asked
of the other clustered hands, the same thing happens to almost all of
them. Per hand, rolls whose advance resolves:

| resolve | | do not resolve | |
|---|---|---|---|
| Fritz | 9 of 9 | Wissler | 0 of 21 |
| Gündner | 2 of 2 | Kopf | 0 of 7 |
| Schlegel | 2 of 3 | Roth | 0 of 7 |
| | | Hohnrieder | 0 of 6 |
| | | Krämer | 0 of 5 |
| | | Kummer | 0 of 4 |
| | | B. Schäfer | 1 of 9 |

Kopf's seven share no roll with the countersigner and every one of them
smears, including one of 1904 carrying 32,928 slots. So the grouping is
not his, and the earlier claim is withdrawn.

What this costs the chronology has to be said plainly. Of the eighteen
rolls that resolve at the old advance, nine are Fritz's, two Gündner's
and two Schlegel's; five carry no clustered signature. The 1.0 mm
setting is therefore attested on the rolls of three signers and five
unattributed ones, not across the workshop, and "the advance was 1.0 mm
before 1910" cannot be separated from "the rolls of those three men show
1.0 mm" by anything here.

Two things keep it from collapsing. The smear rolls show no comb at
either setting, and a 0.5 mm comb is the easy one to see, so they are
not new-advance rolls hiding — whatever they are, they are not evidence
against the change. And the mechanism predicts exactly this asymmetry: a
1.0 mm advance puts half as many teeth in range as a 0.5 mm one, so
before the change a roll needs a wider spread of slot lengths to show
its comb at all, and after it almost any roll will. The reading that
fits both is that the smear is what an unresolved old-advance roll looks
like, and that Fritz, Gündner and Schlegel worked on rolls with enough
variety of slot length to show it. That is a reading, not a result.

The window stays at 16 December 1909 to 21 May 1910, on the rolls that do
resolve, with that narrower base understood.

**The hands are no check at all, and the reason is worth keeping.** A
draft of this file offered the signatures as independent corroboration:
clustered by letterform alone, three hands have rolls whose advance
resolves and all carry the old setting — Fritz on nine, Gündner on two,
Schlegel on two. The argument does not hold. Those rolls are dated from
their own inscriptions, and the inscription is the thing that was
clustered, so one line of ink yields both the hand and the date. What
the measurement then confirms is that rolls inscribed November 1908 to
February 1909 carry the old advance, which is the chronology itself and
not a test of it. Any nine rolls of that window would do the same
whether or not one man signed them. The point is condon-dates's own,
against its own work.

So the hands neither support the dating nor contradict it, and the
entanglement runs the other way too: where an inscribed date is wrong,
the cluster and the chronology move together rather than one catching
the other. What remains is the narrowest reading — nothing in the
measurements gives a positive reason to think any cluster is wrong —
and that is a consistency not disturbed rather than a check passed.

There is no unentangled remainder to fall back on. Eighteen rolls
resolve at the old advance, but five of those carry no date at all —
their inscriptions are printed labels or undeciphered words — so the
dated evidence is thirteen rolls, and every one of the thirteen belongs
to one of the three hands: Fritz nine, Gündner two, Schlegel two.

Set out by date, the anchor is thinner than a count of thirteen makes it
sound:

| | rolls | span |
|---|---|---|
| Fritz | 9 | 20 Nov 1908 to 9 Feb 1909 |
| Gündner | 2 | 19 Jan and 25 Mar 1909 |
| Schlegel | 2 | 4 Nov and 16 Dec 1909 |

Eleven of the thirteen fall inside four months of 1908–09. The lower
bound of the window rests on Schlegel's roll of 16 December 1909 alone,
whose year is discussed below, and the upper bound on `tj337qh7786` of
21 May 1910 alone. Two single rolls, one at each end. That is what "the
advance halved between December 1909 and May 1910" currently rests on,
and it should be quoted that way or not at all.

**The two settings are nested, not paired.** Where the advance
resolves, the old advance of 1.0 mm appears only on wide-pitch rolls,
18 of 18, and never on a narrow-pitch one; the wide pitch appears with
both advances, 18 old against 43 new. That is the shape a single
mechanical history would leave: the wide machine cut with the old
advance first, was re-set to the new one around the turn of 1909 to
1910, and the narrow machine used the new advance from the start. It
also means the two must not be counted as independent evidence about any
one roll.

**The one exception was a misreading.** Welte 569, `rb625rv7300`, is
inscribed "569 Hans u. [Pfl/Sch]legel 16.12.09". The written number
matches the catalogue, and the roll advances 1.001 mm at R = 0.80 with a
pitch of 3.026 mm. The year was first read as 19, which made the roll old
on every measure ten years after the change. It was queried, since that
hand also signs rolls of November 1909 and January 1910, and a look at
native resolution from the IIIF endpoint seemed to confirm the nine. On
22 September 2026 the editor read the year on the scan as 09, and that
check is withdrawn. The roll falls in December 1909, beside the hand's
other two, and is the latest dated copy with the old advance.

Welte 1275 of April 1922 carries the wide pitch, but its advance does not
resolve, so it says nothing about the change in the advance.

**Still open.** Welte 104, punched 10 July 1920, has a pitch of 2.603 mm
with an ordinary Teilung, which is neither state and is not shrunken
paper. Two readings want a wider crop before anything rests on them:
`ng103jj1150`, whose year could be 3, 5 or 8, and `gg384dv5303`, whose
1908 date sits with a 2.400 pitch and whose written number does not match
its catalogue number.

## Looking for the dates (`regions.py`, `dates/`, `review/`)

Closing that window means reading the punch dates off the scans. A date
is written at the end of the roll, near the rewind, along the paper's
edge and along its length, so it reads only turned a quarter turn, and
often in a shorthand: "225. 14. 114." on Stanford's second copy of 225
is 14 January 1914.

`regions.py` is the first, geometric guess: the outer 900 px of either
paper edge over the end margin, sized so that both of roll 225's known
inscriptions fall inside. `dates/` supersedes it. It searches each scan
end to end for ink on paper and scores every patch, and it recovers both
known inscriptions as the top candidate of their roll. Four things it
found that the geometric guess did not know:

- **The writing runs both ways along the roll.** Condon Roll 47 reads at
  rotation 90, Roll 48 at 270. Every crop is rendered twice, the second
  turned 180 degrees.
- **An inscription is usually three things** — the roll's own number, the
  date, and the hand that punched it: "660. Fritz 7 Dezb 1908", "No 669
  16. 11. 08 E. Naumann". Where the number on the paper matches the
  catalogue, the reading is anchored to the right roll. Named hands so
  far: Fritz, Kummer, Guendner, Hofmann, C. Herrmann, Langenbach, Kopf,
  E. Naumann.
- **Three things imitate an inscription**: creases running along the
  roll, damp stains, and the printed leader. They are told apart by how
  solid the patch is and how far its columns stay dark.
- **Ink is in the red channel, holes in the green.** Paper reads about
  90 against ink at 50 in red; in green both are dark. The punch
  measurements in `images.py` use green deliberately — a hole is white
  against red paper there, which is the greatest contrast the scan
  offers — so the two channels are right for their own jobs and neither
  is a mistake to fix.

`review/` builds a page to review the suggestions on, published at
<https://claude.ai/artifact/GEMocymDCNVbZuXqHej3jJ>. A published page may
not load an image from another host, so the crops travel with it: the
best-scoring patch of each roll is pictured, the rest are listed by box,
score and reason, and every region links to Stanford at full resolution.

A catalogue date is not a substitute for reading the roll. See the
caveat on that below before using one.

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
  gives a copy its earliest possible date, nothing more.
- **A catalogue date is a date for some copy, not for this one.** Several
  of Stanford's records carry a punch date taken from Peter Phillips's
  inventory, which describes Phillips's copy of that title and not the
  roll Stanford scanned. Since a title was re-punched over many years —
  the twelve titles held both ways above are the proof — such a date says
  nothing about the scan it sits beside, and none is used here. Only two
  kinds of date are: one read off the scanned roll itself, and Condon's
  note on the leader of a roll of which Stanford holds a single copy.
  Thirty-eight titles have more than one Stanford copy, and for those
  even a "copy 1" note needs tying to the right one before it is worth
  anything.
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
| `regions.py` | the first, geometric guess at where to look; writes `review/regions.json` |
| `dates/` | the ink search over the whole scan and the crops (`candidates.json`, `summary.txt`, `reading.md`), and the two archive-wide sweeps, `pitch.json` and `step.json`; the readings are kept in condon-dates |
| `review/build.py` | the review page's payload, strips and all; writes `review/data.js` |
| `review/index.html` | the review page, published at <https://claude.ai/artifact/GEMocymDCNVbZuXqHej3jJ> |

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
