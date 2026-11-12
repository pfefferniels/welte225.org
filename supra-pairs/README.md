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
| linked-rolls | 0.76.0 at `55d09d5`, and the same with the fixes on its branch `claude/keen-hamilton-t432x3` (below) |
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
  to its end, with the published library as with the fixed one.
- **Every document is valid and comes back the same.** All 44 editions
  pass `validate`, and read back and written again they say what they
  said, key order aside.
- **It is quick.** A pair takes 4.4 s in the median and 25 s at most
  (WM 662, 19,000 chains a copy), of which the proposal takes 11 s at
  most.
- **Every version plays.** 103 versions of the pairs and 17 of the
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

The fix keeps the rewind where it leaves the chains on the bar, give
or take a stray, and otherwise takes the shift that keeps the most
chains on the bar, the middle of the paper choosing where several do.
With it 447 of 456 agree with the raw MIDI (`truth.tsv`), and 37 of the
38 pairs have both copies on the same tracks. Six of the seven rolls
recover:

| WM | readings shared, 0.76.0 | fixed |
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
bad, the expression tracks among them. (It was not beyond the reader:
see 9.)

The fix is on linked-rolls' branch `claude/keen-hamilton-t432x3`, with
three tests.

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
rather than the text. The shifts piled up where the copies lie furthest
apart, at the two ends of a roll: 1,250 in the first fifth and 1,891 in
the last, of 5,892.

**Since.** The window of a pair is now centred on the drift of the two
copies, read off stretch by stretch (linked-rolls `8bb319e`). On the 37
pairs the readings on one copy alone fall from 43,839 to 12,825, where
the copies differ by 5,352 chains track for track; the edits proposed
from 30,056 to 7,506; the shifts from 5,892 to 1,030, between 58 and 142
in every tenth of the roll. WM 1473 goes from 6,522 readings on one copy
alone to 146, WM 1339 from 2,880 to 176, WM 662 from 20,348 to 2,100.
The alignment itself is as it was: one shift and one scale, which for
WM 662 leaves the copies 20 cm apart at the head of the roll, and the
first two metres there are still not matched.

### 3. On two copies the proposal says the same thing nearly every time

For 35 of 38 pairs the search finds `*(St1,St2)`, a lost version with
both copies derived from it; for two `St2(St1)` (WM 1213 and 1447, which
differ in four and seven readings); for WM 371, whose copies never
aligned, `St1(St2)`. The cost of `*(St1,St2)`
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
readings. Along the roll Ph1 lies 11 mm before St1 at the head, 3 mm
after it in the middle and 19 mm before it at the end; St2 lies within
half a millimetre until the last three metres and 2.9 mm off at the end.
The closing notes, long ones, were read as three notes each, one to a
copy, inserted by three versions and missing from the root.

**Since.** With the window centred on the drift, four readings of 3,142
stand on one copy alone, and the proposal is `St1(St2+Ph1)`: St2 and Ph1
carry one text, derived from St1's by ten insertions and four deletions.
That is what the chains say.

### 4a. A lost version that nothing derived from

Adopted, seven of the 44 editions held a version no copy carried and
nothing derived from, which a stemma cannot have: the search posits a
lost version only above two others. It came from the step after the
search. Where the root has two branches, the readings only the less
refined one carries are taken for the base text if the other branch has
them moved or cleaned up. On a clean pair that took every reading a
copy's version had of its own (WM 2086: all nine), and the version was
proposed all the same, inserting and deleting nothing. Its copy then
carries exactly what the root inserts, so the root read as carried by it
and the emptied version as the lost one. For WM 570's three copies it
was the lost version above the two scans that was emptied, and stayed
between `r1` and them with no edit.

A version that changes nothing is now the version it derives from. The
six pairs concerned (321, 570, 1262, 1654, 2086, 3310) and WM 1462 at
one speed come out as one copy with the other derived from it, and WM
570's three copies as three versions below one lost one. The proposal
gives that stemma (`stemma`) beside the one the search found
(`notation`), which the cost and the runners-up still speak of; of the
38 pairs it is `*(St1,St2)` for 29 and a derivation for nine. The cost
that preferred a lost version to the copy losing those readings is not
paid in the end: the derived copy deletes them. That is finding 3 seen
from the other side, and not resolved by this.

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

All but the last of these have been fixed since (below); they are left
here as they were found.

- **Roll Desk in development mode goes blank on the first upload**, with
  "Cannot assign to read only property 'siglum'". React's strict mode
  runs the reducer twice; the operation pushes the copy object it closed
  over, immer freezes it after the first run, and the second run names
  and aligns a frozen object. The production build runs the reducer
  once and is not affected. `createVersion` copying what it is given
  would end it.
- **Two copies that share nothing were called one text.** WM 371's
  unaligned copies have no reading in common, so they differ in none
  "where both can tell", and the proposal merged them into one version
  of 2,915 readings (`St1+St2`, cost 0).
- **A copy that did not align was not mentioned** in the filiation
  dialog, which went on to collate it.
- **One analysis could not be read.** `bb988jx6754` closes its ROLLINFO
  with `@END:` for `@@END:`, and the reader failed with "Cannot read
  properties of undefined (reading 'HOLES')".
- **In the stemma panel the circles of sibling versions touched** (WM
  570): the discs of a row collided at their own radius, 63.99995 px
  apart at a radius of 32.
- **linked-rolls' tests of WM 225's filiation fail against the published
  edition.** With `../welte225.org` beside it at edition 1.0.14, three
  tests of `test/Filiation.test.ts` fail on `main`, before any change
  here: 624 edits where 690 are expected, 16 disagreements on the kind
  of change where 2 are expected, 75.2 % where more than 78 % is. They
  are skipped where the checkout is missing, so nothing reports it.

### 8. A torn end joined the notes of a whole roll

WM 1253 (Chopin, Étude op. 25 no. 9, Paderewski) stayed the odd one out
after everything above: its copies aligned, on 765 notes of 1,092, with
no drift between them, and still shared 873 readings of 2,194.

The second copy (`hp956bx4547`) has a ragged end: 904 edge tears and
477 holes set aside as bad, all in its last 30 cm. roll-image-parser
joins the holes of a track into one note where the paper between them
is no longer than 1.37 average hole widths (`groupHoles`), and it takes
that average before the tears are set aside. The analysis states
`@AVG_HOLE_WIDTH: 197.71px` where the holes it lists are 28 px wide, so
the bridge was 271 px, 23 mm, where on the first copy it is 30 px,
2.5 mm. Everything repeated within 23 mm became one long note, along
the whole roll: 1,245 notes from 2,400 holes, where the first copy has
1,740 from 2,254. Of the first copy's chains with no counterpart on the
second, 530 began inside a longer chain there. The reader took the
parser's chains as they stood.

Two of SUPRA's 457 analyses state an average hole width that is not
that of their holes: this one, and `nq087cp3030` (WM 1386, 78.28 px for
28 px), which has no second copy here.

Two smaller things came up with it, in what the reader takes over from
the holes set aside. A tear among them, thousands of pixels wide, was
put on the track its middle fell on and read as a note, which is where
the second copy's notes on tracks the first never uses came from. And
a speck too small for a hole carries an attack with an off time of
`0px`, which made a chain running backwards to the head of the roll;
SUPRA has 1,035 of those, in 123 of its analyses.

**Since.** Where the stated average is more than a quarter over that of
the holes listed, the reader chains the holes itself, over a bridge
taken from those holes; what is wider than a track or ends before it
begins is no chain (linked-rolls `4b39e8e`). WM 1253's second copy now
has 1,780 chains for the first's 1,740; the copies align on 1,049
notes, share 1,569 readings of 1,943, and differ by 164 chains track
for track where it was 620.

What was left was put before the scans (`strips.py`, which cuts the same stretch out of each copy's scan by
the edition's own alignment and calibration). They show three
things.

- **The copies are two cuts.** The first is on plain paper with oblong
  slots 1.8 mm across; the second on paper printed with a line between
  every two tracks, with round punches 2.4 mm across. And their bass
  dynamics are coded differently: where the first has a crescendo hole
  on every beat (track 4), the second has forzando off, then forzando
  on with the crescendo, half a centimetre later (tracks 5, then 4 and
  6). That is 134 chains for 76 on tracks 5 and 6, and it is in the
  paper. In the stretch looked at (2.5 to 2.7 m) the treble is the
  same on both; over the roll its counts differ too (track 96, 72
  chains for 52; track 98, 32 for 57), which was not looked at.
- **The second copy has lost its tail.** Its red paper is cut straight
  across 4,976 mm into the reference copy and joined with tissue to
  white paper, before the rewind perforation the first copy has at
  5,115 mm. The last note ends at 4,781 mm, so no music is lost. The 904 "tears" and 477 "bad
  holes" are the tissue and the white, and so are 16 one-hole "notes"
  in a row across the roll at the cut, which the parser lists among
  its holes and the reader therefore still takes.
- **The parser's bridge is too wide for round punches.** Of the 43
  notes that stood on the first copy alone, 37 are strokes of a fast
  repetition that the second copy has too, with 2 to 3.3 mm of paper
  between them; 1.37 widths of a 2.4 mm punch is 3.3 mm, so they are
  joined. Laid against the first copy, 574 of the second's 594 webs
  under 1.4 mm lie within a note there, and all 50 between 1.7 and
  3.7 mm part two. With the holes chained over 1.7 mm of paper, six notes are left
  on the first copy alone and two on the second.

The last holds beyond this roll. Over all of SUPRA the paper between
two holes of a track is rarest between 1.7 and 2.3 mm, whatever the
punch: below lie the webs within a chain, above the repetitions. On
the narrow punches of 320 analyses the parser's bridge is 2.1 to
2.7 mm, at the far edge of that gap; on the wide ones of the other
137 it is 2.8 to 3.4 mm, among the repetitions.

**Since, again.** The reader now takes only the holes from an analysis
and chains them itself, over 1.7 mm of paper unless `bridge` says
otherwise (linked-rolls `e00a26e`). What the parser joined is not read
any more, nor its average hole width, so the mending above went with
it. A hole set aside for its shape takes part wherever it lies; torn
paper does not, and a speck makes no chain of its own. A first
comparison had a fixed bridge lose on some pairs (WM 1473, WM 662):
that was the reader leaving out a punch the parser had set aside in
the middle of a note, which split the note in two.

| the 37 pairs | on one copy alone | edits proposed | chains apart |
|---|---|---|---|
| the parser's notes, as read at first | 12,825 | 7,506 | 5,352 |
| with the torn end's average mended | 11,979 | 7,207 | 4,882 |
| the holes chained over 1.7 mm | 10,939 | 6,833 | 4,567 |

Track for track the copies of 24 pairs differ by fewer chains than
with the parser's notes, 11 by as many, two by more (WM 57 by three,
WM 2844 by one; `bridges.mjs`, `bridges.tsv`). WM 1259 goes from 949
readings on one copy alone to 641, WM 1247 from 453 to 178. WM 1253
shares 1,640 readings of 1,893, with 11 notes left on one copy alone
after the displaced are paired. WM 757, whose copies now differ in
four readings, is proposed as one text, `St1+St2`. WM 662 has 30
readings more on one copy alone, and WM 660 turns to `St1(St2)`.

### 9. A roll whose outer tracks the parser set aside

WM 371 (Carreño, Little waltz) was the one pair left unaligned, and was
put down above as beyond the reader. It was not.

The first copy (`hc909pp9868`) is on dark green paper, with lines
drawn along the middle of the roll. The parser put the edges of the
paper far inside it (a bass drift of 1,203 px, a treble drift of
961 px on a roll 3,887 px wide), apparently on those lines, and set
aside as lying beyond the edges every hole outside the middle 38
tracks: 1,766 of the roll's 8,789, as `bass` or `treble`. They are all
in the file, each with its place and size. The reader went wrong on
them twice.

- **The shift.** It was found from the holes the parser lists. Those
  span the middle of the bar only, so any of 63 shifts keeps them on
  it; the tail of the last note trails the last attack as a rewind
  would; and the shift that puts that tail on the rewind track was
  taken, 23 tracks where it is −3. The rewind is now also held
  against the holes set aside, which that shift throws far off the bar.
  They do not choose the shift themselves: on two other analyses
  (`tb323rh4122`, `nz852nk6103`) the holes set aside at the margins are
  torn paper beside the bar, and letting them choose moved both off
  their tracks.
- **The wander.** A hole set aside carries no track number, and was put
  on the track its column falls on. The paper wanders sideways under
  the scanner, here by 52 px, a track and a third, and the parser
  states for every hole by how much. Without that, 2,159 of the 7,022
  holes this analysis lists would land on the neighbouring track; the
  holes set aside are now placed with it.

With both (linked-rolls `badcfc7`) the copy reads as 2,877 chains for
the other's 2,872. The pair aligns on 1,435 notes, shares 2,848
readings of 2,891, and differs by seven chains track for track; before,
it shared none. On the bass expression tracks between 5.0 and 5.2 m,
`strips.py` shows the same holes on the same tracks of both scans. Of SUPRA's analyses 448 of 456 now lie on the tracks of
Stanford's raw MIDI, this one more and none fewer, and all 38 pairs
align. Nothing else moves but WM 1253, by six readings.

## What has been fixed since

On branches named `claude/keen-hamilton-t432x3`, none of them merged or
released. Roll Desk takes linked-rolls from npm, so the library's fixes
reach the desk with its next release; the desk's own work without it.

| Found | Fix | Where |
|---|---|---|
| analyses read on the wrong tracks (1) | the shift that keeps the chains on the bar, the middle of the paper choosing among several | linked-rolls `ae3a644` |
| the desk blank on the first upload in development (7) | the copy is taken afresh each time the operation runs | roll-desk `9df05a9`, and at the root in linked-rolls `582c8ec` |
| copies sharing nothing called one text (7) | no reading in common, no shared text | linked-rolls `932e7fe` |
| an analysis that cannot be read (7) | an unclosed ROLLINFO is read; a file that is no analysis is refused by name | linked-rolls `503342d` |
| nothing said of a copy that did not align (1, 7) | the upload says with how many of its notes the copy lies on the reference copy; the filiation dialog names every copy lying there with less than two thirds of them | roll-desk `9df05a9` |
| every e-roll read on the accelerating spool (5) | the dialog asks whether the e-roll comes from a roll reader or a scan, tries both against the reference copy and prefills the better; a scanned e-roll is no longer said to be Phillips's | roll-desk `9df05a9` |
| the discs of a row touching (7) | a gap of 8 px | roll-desk `cab669f` |
| a lost version that nothing derives from (4a) | a version that changes nothing stands in the one it derives from | linked-rolls `02d52bc` |
| the stemma of two leaves cut off at the panel's edges, by the gap above | the stemma is fitted by what its discs and captions take | roll-desk `65864c2` |
| readings of drifted stretches taken for readings of their own, and for shifts (2, 4) | the window of a pair is centred on its drift along the roll, and is no narrower than the pitch of a chain | linked-rolls `8bb319e` |
| the parser's joining of holes into notes: a torn end joining the notes of a whole roll, wide punches joining fast repetitions, tears and specks read as chains (8) | the reader takes the holes and chains them itself over 1.7 mm of paper | linked-rolls `4b39e8e`, `e00a26e` |
| a roll whose outer tracks the parser set aside read 23 tracks off, and holes set aside put on a track without the paper's wander (9) | the rewind is held against the holes set aside as well; a hole set aside lies where its corrected column falls | linked-rolls `badcfc7` |
| rollscan2image naming `-g` and `-l` (6) | the README says `-r` for every Welte system, and why | rollscan2image, same branch |

Not touched: the alignment itself, which is still one shift and one
scale, so the places an edition gives for a copy's features are as far
off as before and only the collation looks past it; the cost of a lost
version on two copies (3); the line rate of Smythe's CIS (6); and the three failing tests, where either the
tests or the edition has moved.

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
| `bridges.mjs` | how many chains the copies of each pair differ by, with the parser's chains and with the holes chained over a fixed length of paper; writes `bridges.tsv` |
| `strips.py` | the same stretch of every copy of an edition, cut from its scan, one above the other |
| `summary.py` | the tables of `summary.md` from the results |
| `rolls.json`, `further.json` | the lists: the 38 pairs, and the six sets with copies from elsewhere |
| `out/results.jsonl` | the 38 pairs with the fixed library, one record a roll |
| `out-0.76.0/results.jsonl` | the same with linked-rolls 0.76.0 |
| `out-further/results.jsonl` | the six further sets, fixed library |
| `truth.tsv`, `truth-0.76.0.tsv` | the shift of each of the 457 analyses, fixed and published |
| `drift.tsv` | the drift of each pair, in twelve stretches |
| `summary.md` | every roll in one table, and the comparison before and after |

To run it again: checkouts of linked-rolls (built, `npm ci && npx tsc -p .`),
`pianoroll/SUPRA` and `pianoroll/piano-roll-analyses` two levels up
(`../../linked-rolls`, `../../pianoroll/…`), Node 22 or later, `bzip2`.

```sh
python3 pairs.py > rolls.json
node cycle.mjs --out out
node cycle.mjs --rolls further.json --out out-further
node truth.mjs > truth.tsv
node drift.mjs --out out > drift.tsv
node bridges.mjs > bridges.tsv
python3 strips.py out/wm1253/edition.jsonld 2500 2700 1-10 strips.png
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
  twice** that the pairs can show. The 447 of 456 is agreement with it,
  not correctness; on the files outside the pairs nothing here says who
  is right.
- **No stemma was checked against a roll.** That the proposals are
  uniform, and that one contradicts the track counts, is shown; what the
  true filiation of any of these pairs is, is not known.
- **The browser runs were single passes** on WM 1213 and WM 570 in Roll
  Desk and on WM 1213 in MPM Desk, in headless Chromium at 1440 px.
  They show that the flow works, not that every dialog does.
