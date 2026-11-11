# The whole cycle on rolls other than WM 225

A test of 11 November 2026. The edition of WM 225 was made by hand over
months, and the stemma proposal, the proposal of edits and the costs
behind them were tuned on its six copies. This directory runs the same
cycle, unattended, on every roll Stanford's SUPRA archive holds in more
than one copy, and on what further copies of SUPRA's rolls could be
found elsewhere, to see what holds on material the tools have not met.

The cycle is the one Roll Desk runs: read each copy, give it a version,
align it with the reference copy, propose a stemma and the edits of its
versions, adopt both, perform every version on its system, write the
edition out, check it against the schema and read it back. `cycle.mjs`
does this through linked-rolls with the operations the desk's dialogs
call; the desk itself and MPM Desk were then driven in a browser on a
few of the rolls.

Nothing here is an edition. No editor looked at a single reading, so the
stemmata below say what the program makes of the files, and the test is
whether that is believable.

## What was run

| | |
|---|---|
| linked-rolls | 0.76.0 at `55d09d5`, and the same with `linked-rolls-track-shift.patch` |
| roll-desk | `326f5d8`, production build, in Chromium |
| mpm-desk | `ffc9cc0`, production build, in Chromium |
| SUPRA | index and raw MIDI at `b2becba`, analyses (piano-roll-analyses) at `429ce87` |

**The rolls.** SUPRA's index lists 456 red Welte rolls under 418 labels.
38 labels occur twice, none three times; WM 225 is one of them. That
makes 38 pairs and 76 analyses (`rolls.json`).

**Copies from elsewhere** (`further.json`), six sets on four rolls:

| Roll | Copy | From | Kind |
|---|---|---|---|
| WM 570 | Ph1 | Peter Phillips, free sample on petersmidi.com | e-roll MIDI from his pneumatic reader |
| WM 1462, 1463 | Be1 | Hochschule der Künste Bern, magic-piano.ch | e-roll MIDI from the Bern scanner |
| WM 965 | Ke1 | Keystone Music Roll Co., pianorollmusic.org | CIS scan of the Licensee roll F965 |

SUPRA holds 570 twice and the other three once, so these give one set of
three copies, two pairs read by two different machines, and one pair
across two systems.

## What holds

- **Nothing threw.** Over 38 pairs and six further sets, every step ran
  to its end, with the published library as with the patched one.
- **Every document is valid and comes back the same.** All 44 editions
  pass `validate`, and read back and written again they say what they
  said, key order aside.
- **It is quick.** A pair takes 4.5 s in the median and 24 s at most
  (WM 662, 19,000 chains a copy), of which the proposal takes 11 s at
  most.
- **Every version plays.** 110 versions of the pairs and 20 of the
  further sets were performed and written as MIDI, lost ones included.
- **The desk does what the script does.** Roll Desk's editor, driven
  through its own dialogs, took three uploads for WM 570 (two analyses
  and the e-roll), proposed `*(*(St1,St2),Ph1)` at a cost of 33.25 in
  4 s, adopted it, and downloaded the edition and a ZIP of five MIDI
  files: the stemma, cost and file sizes the script gave.
- **CIS works where the converter knows the scanner.** Keystone's F965
  went from `.CIS` through `cis2roll.py` and `tiff2holes` into a
  Licensee copy that aligns with Stanford's red copy (1,280 notes, scale
  1.281, residual 0.9 mm), shares 2,326 of 2,387 readings with it, has
  three recodings proposed for the transfer, and plays on the Licensee
  emulation.
- **Bern's e-roll reads as it is**, through the reader written for
  Phillips's files: 8,301 chains against Stanford's 8,312 on WM 1462,
  with 8,260 of 8,297 readings shared, once its time is put on the paper
  correctly (below).

## What does not

### 1. One analysis in ten was read on the wrong tracks

`readFromStanfordAton` finds how the analysis numbers its columns from
the rewind perforation, which it takes to be whatever trails the last
attack. Where nothing trails it, it took the columns to start at the
bar's first position if they spanned exactly a hundred, and otherwise
read the file at a shift of nought. A rewind slot punched in one piece
is a chain with an attack of its own, so nothing trails it; and one
stray hole beside the bar, or an outermost position the roll leaves
unpunched, puts the span off a hundred. Such a copy came out two to five
tracks off, with nothing said.

Stanford's raw MIDI gives the position of every hole independently of
the reader (`truth.mjs`). Against it, 0.76.0 reads 409 of 455 analyses
on the right tracks and 46 not (`truth-0.76.0.tsv`). Among the pairs
that is seven rolls of 38 (365, 371, 1213, 1253, 1262, 1654, 2086): six
second copies did not align at all, the seventh on 523 chance matches.
In the desk this shows as "St1 and St2, 1085 readings apart" for two
copies of one roll that differ in four, with no word that the second
copy was never aligned.

The patch keeps the rewind where it leaves the chains on the bar, give
or take a stray, and otherwise takes the shift that keeps the most
chains on the bar, the middle of the paper choosing where several do.
With it 446 of 455 agree with the raw MIDI (`truth.tsv`), and 37 of the
38 pairs have both copies on the same tracks. Six of the seven rolls
recover:

| WM | readings shared, 0.76.0 | patched |
|---|---|---|
| 365 | 156 | 8,046 of 8,263 |
| 1213 | 2 | 573 of 577 |
| 1253 | 47 | 859 of 2,208 |
| 1262 | 113 | 2,202 of 2,220 |
| 1654 | 210 | 2,400 of 2,460 |
| 2086 | 177 | 2,492 of 2,510 |

Of the nine files that still differ from the raw MIDI, the pairs show
two to be right and the raw MIDI wrong: with Stanford's own shift, the
second copies of WM 1213 (`vj076nk8220`) and WM 1253 (`hp956bx4547`) sit
two tracks and one track off their first copies, so SUPRA's published
MIDI of those two scans is itself on the wrong tracks. The seventh roll,
WM 371, is beyond the reader: its analysis `hc909pp9868` holds chains on
38 columns in the middle of the roll only and sets 1,767 holes aside as
bad, the expression tracks among them.

The patch is in `linked-rolls-track-shift.patch`, with three tests. It
is not pushed anywhere.

### 2. Two copies of one roll do not lie on one line

A copy is carried onto the axis by one shift and one scale. `drift.mjs`
takes the aligned copies and asks, stretch by stretch along the roll,
how far the second copy's notes still lie from the first's. On 18 of the
37 aligned pairs the medians wander by more than 4 mm, on six by more
than 10 mm (`drift.tsv`). Two shapes recur:

- a bow, the ends off one way and the middle the other (WM 28: −5.2 mm
  at the head, +1.9 in the middle, −2.6 at the tail; WM 3309, 1339,
  2995 likewise), as two papers stretched unevenly would give;
- a step, the copies agreeing to a millimetre and then standing 10 to
  50 mm apart from one place on (WM 723: 23 mm off for the first quarter
  of the roll; WM 1447, 662, 1473), as a splice, a repair or a scan
  joined from parts would give.

The collation then looks for each reading within one window for the
whole pair, a few millimetres wide, and whatever lies beyond it is read
as present in one copy and absent from the other. Of the 263,857
readings of the 37 pairs, 43,839 stand on one copy alone, and 26,894 of
those (61 %) have a reading of the same meaning on the other copy alone
within 40 mm: one hole counted twice. That is an upper bound, since a
command the other copy really moved pairs up the same way, but the size
of it is not in doubt. WM 662 has 20,348 readings on one copy alone and
16,656 edits proposed, where the two copies differ by 397 chains, track
for track, wherever those lie; WM 1339 has 2,880 against 50; WM 570 has
214 against 6, and 8 are left once the displaced ones are paired.

So on a long roll most of what the stemma is scored on, and most of the
edits proposed (5,892 "shifts" over the 38 rolls), is the alignment
rather than the text.

### 3. On two copies the proposal says the same thing nearly every time

35 of 38 pairs come out as `*(St1,St2)`, a lost version with both copies
derived from it; two as `St2(St1)` (WM 1213 and 1447, which differ in
four and seven readings); WM 371 as one text. The cost of `*(St1,St2)`
is 4 whatever the copies hold: a reading arising once is free, so every
reading one copy has alone arises at its own leaf, and only the lost
state is paid for. The alternative costs one per reading the parent has
and the child lacks. A lost state is therefore proposed as soon as each
copy has about four readings the other lacks, and with finding 2 every
pair has. The proposal cannot tell a pair differing in 12 readings of
11,756 (WM 1474) from one differing in 20,348 of 29,105 (WM 662), nor
measurement from text.

WM 225 itself comes out as `*(St1,St2)` from its two Stanford copies,
where the edition, with six copies and an editor, puts St2's version
below St1's.

### 4. With a third copy, the stemma followed the reader

For WM 570 the proposal is `*(*(St1,St2),Ph1)`: the two Stanford scans
together, Phillips's reading apart, 39.75 ahead of the next. Counted
track for track, which needs no alignment, Ph1 has the chains of St2 on
every musical and expression track; they differ in three chains at the
end of the roll (the rewind and its neighbours). St1 differs from both
in six chains on four expression tracks. By the perforations, then, Ph1
and St2 carry one text and St1 another, which is the reverse of what was
proposed. Phillips is reported to have read the Condon collection before
it went to Stanford (found by the search, not checked here); if so, Ph1
may be the very roll St2 is.

What separates Ph1 is its residual of 3.0 mm against 0.8 mm: time read
off a pneumatic reader and put back onto the paper does not land where a
scan does, 134 notes fall outside the window, and they are scored as
readings.

Adopting this proposal also leaves a lost version `r2` with no edit and
no witness, between `r1` and the two Stanford versions: what it was
posited for went to the base text, and the node stayed.

### 5. An e-roll is not always a pneumatic reading

The desk's dialog offers one way to read a `.mid`: as Phillips's e-roll,
its seconds put onto the paper by the Welte spool, which accelerates.
Bern's e-rolls are written from a scan at a constant speed. Read as the
dialog reads them, WM 1462 aligns on 784 notes at a scale of 0.904 and
shares 2,451 of 14,106 readings with Stanford's copy; at constant speed,
5,448 notes, a scale of 1.0004, a residual of 0.6 mm and 8,260 of 8,297.
WM 1463 likewise (5,320 of 21,911 against 13,576 of 13,655). The reader
has the option (`placeAt`); the dialog has no field for it, and nothing
warns when the alignment comes out at 0.9.

### 6. The CIS route stops at the second scanner

Smythe's scan of the Licensee 1196 (`1196W.CIS`, position encoder, 495
lines per inch with an encoder division of 16) is the other public CIS
of a roll SUPRA holds. `cis2roll.py` divides the line rate by the
division, arrives at 30.9 lines per inch, would write an image of two
million rows, and finds a tracker pitch of 6.7 to the inch at a
coherence of 0.30 where a Licensee roll has nine. The file says "not
re-clocked"; the format note in rollscan2image already says it rests on
few scans. Nothing came of this roll.

rollscan2image's README names `tiff2holes -g` and `-l` for green and
Licensee rolls. The fork's `tiff2holes` exits on `-g` ("GREEN ROLL NOT
IMPLEMENT YET") and has no branch for `-l`; F965 was parsed with `-r`,
which works because the reader, not the parser, says which bar the
columns are read on.

### 7. Smaller things

- **Roll Desk in development mode goes blank on the first upload**, with
  "Cannot assign to read only property 'siglum'". React's strict mode
  runs the reducer twice; the operation pushes the copy object it closed
  over, immer freezes it after the first run, and the second run names
  and aligns a frozen object. The production build runs the reducer
  once and is not affected. `createVersion` copying what it is given
  would end it.
- **Two copies that share nothing are called one text.** WM 371's
  unaligned copies have no reading in common, so they differ in none
  "where both can tell", and the proposal merges them into one version
  of 2,915 readings (`St1+St2`, cost 0).
- **A copy that did not align is not mentioned** in the filiation
  dialog, which goes on to collate it.
- **One analysis cannot be read.** `bb988jx6754` closes its ROLLINFO
  with `@END:` for `@@END:`, and the reader fails with "Cannot read
  properties of undefined (reading 'HOLES')".
- **linked-rolls' tests of WM 225's filiation fail against the published
  edition.** With `../welte225.org` beside it at edition 1.0.14, three
  tests of `test/Filiation.test.ts` fail on `main`, before any change
  here: 624 edits where 690 are expected, 16 disagreements on the kind
  of change where 2 are expected, 75.2 % where more than 78 % is. They
  are skipped where the checkout is missing, so nothing reports it.
- **In the stemma panel the circles of sibling versions overlap** once a
  lost version has two children beside a third branch (WM 570).

## Other things the runs show

- **Six pairs are copies of different lengths.** The second copy runs
  11.7 % longer than the first on WM 2844, 4.0 % on 660, 3.9 % on 1473,
  2.4 % on 662 and on 2260, and 3.0 % shorter on 2538, far beyond what
  paper does (the three red copies of WM 225 lie within ±0.2 %).
  `alignmentProblems` reports each as `paper-beyond-its-spread`. Their
  texts agree well (WM 2844: 13,599 of 13,677 readings), so these look
  like the same master cut at two speeds or advances, which is a fact
  about the copies and a premise for dating them.
- **Two emulators, one roll.** Bern publishes its own emulation of WM
  1462 and 1463. Paired note for note with linked-rolls' performance of
  the version Bern's e-roll carries (`emulations.mjs`; all 5,449 and
  8,238 notes pair), the velocities correlate at 0.76 and 0.81 (rank
  0.72 and 0.85). Bern's clock gains on ours steadily, to 1.5 % and
  2.2 % in the last quarter of the roll: its spool accelerates more.
- **MPM Desk takes over where the cycle ends.** A new project from an
  MEI of Chopin's op. 28 no. 20 (the Humdrum encoding of Craig Sapp's
  chopin-preludes, converted with Verovio) took the emulated MIDI of WM
  1213, aligned its 288 notes with the score's 286 in under two seconds
  in the browser, and left six divergences to decide. After Apply the
  tempo and dynamics desks open on the data. From there every curve is
  the editor's gesture; nothing in MPM Desk fits by itself, and nothing
  was fitted here.

## What exists elsewhere, and what does not

The search covered pianorollmusic.org entirely (23,601 files of 14
contributors, the `PDfiles`, `NonPDfiles` and `CISfiles_zipped` of
each), magic-piano.ch, Peter Phillips's site, Stanford's CCRMA pages,
archive.org, the Deutsches Museum's catalogue and GitHub.

| Source | What it has of SUPRA's rolls | Usable as a copy |
|---|---|---|
| pianorollmusic.org, Julian Dyer | green T-98 readings of about 100 SUPRA numbers, 20 of them among the 38 pairs | not as they are: "playback" MIDI with the expression turned into velocities. The notes keep the roll's timing, so they could serve as copies of the notes alone; no reader does that yet |
| pianorollmusic.org, Keystone, Trachtman, Smythe | Licensee readings of 225, 371, 445, 446, 1033, 1216, 1259, 1263, 1450 and red ones of 757, 1247, 1474, 1480, 2254, 2260 | no: emulated MIDI |
| pianorollmusic.org, CIS | F965 (Keystone) and 1196W (Smythe); the catalogue lists scans of C-225, D371, C446, C1216, C1259 and 1450 whose CIS files are not in the public folders | F965 yes, 1196W not yet (finding 6) |
| magic-piano.ch | ten rolls in all, of which WM 1462 and 1463 are SUPRA's | yes, as e-roll MIDI |
| petersmidi.com | a free e-roll of 570; his catalogue lists every one of the 38 numbers as red-Welte readings, in a package sold for US$110 | yes |
| ccrma.stanford.edu | earlier scans of Condon rolls SUPRA holds (57, 225, 371, 570, 660, 1213) with analyses of January and February 2018 | not without work: those analyses carry no `TRACKER_HOLE`, `DRUID` or `LENGTH_DPI`. They are the same rolls scanned again, which would measure the scanner, not the roll |
| Deutsches Museum | physical copies of 29 of the 38 numbers | no: metadata and four photographs a roll |
| Spencer Chase, iammp.org, web.archive.org | – | could not be reached from here |

**Recordings.** A recording of a roll being played is a witness of the
kind the edition already has in Sc1 and Si1, through a study of its own
rather than through the collation. None could be fetched: YouTube
answers a request for a track's audio from this machine with 403, while
still giving its title and length. The route is the one `schmitz-225/`
documents and has to start from audio fetched elsewhere.

No roll was found with three independent hole-level copies in the open,
unless Ph1 and St2 are two rolls.

## Files

| File | Content |
|---|---|
| `pairs.py` | the rolls SUPRA holds twice, with their analyses; writes `rolls.json` |
| `cycle.mjs` | the cycle on every roll of a list; writes `<out>/results.jsonl`, and the editions and MIDI beside it |
| `truth.mjs` | the track shift of every SUPRA analysis by Stanford's raw MIDI, beside the reader's |
| `drift.mjs` | how the second copy lies against the first along the roll, after alignment |
| `emulations.mjs` | two emulations of one roll, note for note |
| `summary.py` | the tables of `summary.md` from the results |
| `rolls.json`, `further.json` | the lists: the 38 pairs, and the six sets with copies from elsewhere |
| `out/results.jsonl` | the 38 pairs with the patched reader, one record a roll |
| `out-0.76.0/results.jsonl` | the same with linked-rolls 0.76.0 |
| `out-further/results.jsonl` | the six further sets, patched reader |
| `truth.tsv`, `truth-0.76.0.tsv` | the shift of each of the 457 analyses, patched and published |
| `drift.tsv` | the drift of each pair, in twelve stretches |
| `summary.md` | every roll in one table, and the comparison before and after |
| `linked-rolls-track-shift.patch` | the change to the Stanford reader, with its tests, against `55d09d5` |

To run it again: checkouts of linked-rolls (built, `npm ci && npx tsc -p .`),
`pianoroll/SUPRA` and `pianoroll/piano-roll-analyses` two levels up
(`../../linked-rolls`, `../../pianoroll/…`), Node 22 or later, `bzip2`.

```sh
python3 pairs.py > rolls.json
node cycle.mjs --out out
node cycle.mjs --rolls further.json --out out-further
node truth.mjs > truth.tsv
node drift.mjs --out out > drift.tsv
python3 summary.py > summary.md
```

The copies from elsewhere are not in this directory, since none of them
is ours to pass on. `further.json` names where each was fetched; they go
into `further/` under the names it gives. `F965_analysis.txt` is made
from Keystone's `.CIS` with `cis2roll.py` of rollscan2image and
`tiff2holes -r` of the roll-image-parser fork.

## How far to trust the numbers

- **"Displaced" is a count, not a judgement.** A reading on one copy
  alone is called displaced where the other copy has one of the same
  meaning alone within 40 mm. A command an editor really moved is
  counted with the holes the alignment lost, so 61 % is the most that
  misalignment can account for, and what is "left" is the least that
  may be text.
- **"Chains apart" is a floor.** It counts, track by track, how many
  chains one copy has more than the other. A chain missing in one place
  and added in another on the same track cancels out, and a hole the
  parser merged or split on one scan counts as text.
- **Stanford's raw MIDI is the measure for the tracks, and it is wrong
  twice** that the pairs can show. The 446 of 455 is agreement with it,
  not correctness; on the files outside the pairs nothing here says who
  is right.
- **No stemma was checked against a roll.** That the proposals are
  uniform, and that one contradicts the track counts, is shown; what the
  true filiation of any of these pairs is, is not known.
- **The browser runs were single passes** on WM 1213 and WM 570 in Roll
  Desk and on WM 1213 in MPM Desk, in headless Chromium at 1440 px.
  They show that the flow works, not that every dialog does.
