# The punch dates of Stanford's red Welte rolls

Most red Welte rolls carry, on the blank paper after the music stops, the
roll's number, the date it was punched and the name or initials of whoever
punched it. This directory reads that inscription off every scan in
Stanford's SUPRA archive and asks what the dates say about the two criteria
the literature offers for dating a roll from its perforations.

The short of it: the punch does not date a roll. Two perforators with
different punches were in service side by side for at least a decade, so the
size of a perforation says which machine cut a copy, not when. The advance
does date one, and closely: it halved once, between December 1909 and May
1910, and none of the 204 copies dated at high or medium confidence whose
advance resolves falls on the wrong side of that.

## What was searched, and what was found

456 red rolls are indexed. Two of them, `hw588xk2111` and `wh678yv0330`,
return 404 from Stanford's image server and have no scan to read. Of the
remaining 454, 452 were read by the end of this run.

| | |
|---|---|
| rolls with a scan | 454 |
| rolls read | 454 |
| copies with a date | 298 |
| of those, at high or medium confidence | 259 |
| copies with no date found | 156 |
| pitch measured on the scan | 453 |
| advance resolved | 360 |

The dates run from 1904 to 1928. They thin out over the war — 8 copies
across 1915 to 1918 against 51 in 1922 alone — which is what a Freiburg
works with its export markets closed would look like, but the period is not
empty.

## The three quantities

`../corpus.py` established that the punch width of these rolls is bimodal at
Hagmann's two values, 2.2 and 1.8 mm, and that the width belongs to the copy
rather than to the title, since Stanford holds twelve titles both ways. What
it could not do is date the change, having only roll 225's copy of January
1914 and a control of November 1922 to bound it.

**The punch, and the pitch that goes with it, is not a date.** On 248 dated
copies the two states overlap for ten years and eight months. A copy punched
24 August 1911 (`vf252dc4872`, Welte 1697) has the new pitch of 2.503 mm,
two and a half years before roll 225's copy of January 1914 has the old one
at 2.999 mm; and a copy punched 25 April 1922 (`jw822wm2644`, Welte 1275)
still has the old pitch at 3.004 mm, seven months before the control of
November 1922 has the new one at 2.496 mm. Both were read at magnification
rather than taken from a reader. Three more old-pitch copies fall between,
dated 1914 and 1917 twice; a fourth, Welte 1534, once read as 1916, was
punched on 1 February 1910 (see ../README.md).

So Hagmann's "rot-alt until about 1910 and rot-neu after" is wrong in a way
a corrected date would not repair: the two were never consecutive states of
one machine. What survives is a tendency. Essentially every copy dated
before 1911 has the old punch and essentially every copy after 1920 the new
one, so the punch indicates a period without bounding one.

**The advance is a date.** Read as the period the slot lengths keep
(`../advance.py`), and counting only the rolls where that period is actually
resolved:

| | copies | span |
|---|---|---|
| advance 1.00 to 1.03 mm | 11 | 20 November 1908 to 16 December 1909 |
| advance 0.49 to 0.52 mm | 193 | 21 May 1910 to 19 June 1928 |

The latest copy with the old advance is `rb625rv7300`, Welte 569, which
advances 1.001 mm at R = 0.80 and has the old pitch, 3.026 mm. Its
inscription was first read as `569 Hans u. Pflugel 16.12.19`, which made
it the one exception, old on every measure ten years after the change. The
editor read the year on the scan as 09, which puts the roll in December
1909 and leaves no copy on the wrong side.

`jw822wm2644` of April 1922 has the wide pitch, but its advance is noise and
says nothing about the change.

Roll 225's own two copies sit either side of the change, January 1909 at
1.027 mm and January 1914 at 0.503 mm, which is how `../README.md` came to
bracket it between those dates. The corpus closes that to about five months.

**A third state, in the pitch, that does have a boundary.** Fifteen dated
copies have a pitch between 2.78 and 2.92 mm, and every one of them falls
between 1904 and 1909. The obvious objection is paper shrunk along its
length, and it fails: if the paper of those rolls had shrunk the 5.8 per
cent that separates 2.833 from 3.008, their slots would be shortened by the
same fraction and the punch would read oval. Measured, `slot / across` is
1.038 in that group against 1.055 in the 3.01 group, where shrinkage would
predict 0.994. The difference is not in the slot but in the bridge, 0.590 mm
against 0.707 mm — the same punch with less paper left between firings,
which is a setting and not the paper.

## The perforators, from how pitch and advance relate

On a held note the punch fires once every few steps of the paper, so the
pitch should be a whole number of advances. It is. On all 342 rolls where
both are measured, pitch divided by advance lands within 0.15 of a whole
number, and takes only the values 3, 4, 5 and 6. The two were measured by
unrelated methods — the pitch from the edges of held notes, the advance from
the periodicity of slot lengths — so the agreement is a check on both that
neither had to pass.

Each roll is therefore cut in one of a few settings, fixed by the punch, the
step and how many steps pass between firings:

| punch | step | fires every | pitch | rolls | dated |
|---|---|---|---|---|---|
| wide | 1.00 mm | 3rd | 3.00 mm | 17 | Nov 1908 – Dec 1909 |
| wide | 0.50 mm | 6th | 3.00 mm | 39 | May 1910 – Sep 1917 |
| narrow | 0.50 mm | 5th | 2.50 mm | 159 | 1911 – 1928 |
| narrow | 0.52 mm | 5th | 2.60 mm | 75 | 1911 – 1928 |

The first two rows are one change seen from both sides. Between December
1909 and May 1910 the wide machine's step halved and it fired twice as often,
so its pitch stayed at 3.0 mm. That is why the advance moves there while the
pitch does not, which roll 225's two copies had shown without explaining.

The last two are two steps of the narrow punch, with nothing measured between
0.506 and 0.514 mm, and both occur in nearly every year from 1911 to 1928 —
25 and 16 copies in 1922, 23 and 10 in 1924. The difference is in the step,
not the scan: slot over width is 1.065 in one group and 1.064 in the other,
where a scale error would have stretched the holes.

How many machines that makes is an inference, and it rests on one
assumption: that running a second perforator is likelier than re-fitting one
back and forth for years. On that assumption there were at least two — the
two punches were in use together from 1911 to 1922 — and most economically
three: one wide machine, re-geared once, and two narrow ones at the two
steps. Two further narrow groups, 0.62 mm every 4th step (14 rolls) and
0.40 mm every 6th (25), are too thinly dated to place, and the second could
be the period search locking onto half of a 0.80 mm step. The 1904–1909
pitch of 2.78 to 2.92 mm would need a step of about 0.94 mm at every third,
which fits its shortened bridge, but its advance resolves on only two of its
26 rolls, so that setting is a reading of the pitch alone.

### Where the perforators stood, and what the labels cannot say

Two kinds of evidence bear on it, and they point different ways.

**The workshop practice separates the machines.** In 1911–1914, when both
ran, 15 of 42 wide-punch copies are signed — every name German, written in
the Kurrent hand with the roll number first — while one of 12 narrow-punch
copies is signed, and the name is "Smith". The narrow copies carry the date
alone, often run together, and rarely a number. Over the same years that is
two crews with different habits, not one crew over time.

**The label language does not.** Stanford transcribed each title from the
roll (`labels.py`), so its language says which market the copy was labelled
for. Across the corpus the wide punch looks German, 76 %, and the narrow
English, 31 %. But the German share falls with the date whichever machine cut
the copy — 90 % before 1911, about a third in the 1920s — and the narrow
machine is the one running in the 1920s. Within one period the machines
differ little, on counts of six and eight.

Nor are labels necessarily contemporary with the punching. The narrow machine
has genuinely German-labelled rolls punched in January and August 1918
(*Wiener Walzer*; *Du und Du aus Fledermaus : Walzer*) and an
English-labelled one of April 1917. Each sits badly with one location for
that machine, and together they are most easily read as leaders labelled, or
relabelled, for whatever market a copy was sold into, sometimes long after
it was cut.

Two further things are worth weighing against a simple "the narrow machine
was American". Its dates are written day first, which the strings show
without any help from how they were parsed: `26323`, `311022` and `28722`
open with a day above twelve, and a month-first writer would have written
26 March 1923 as `32623`. And it was running by August 1911. Whether and when
Welte perforated rolls in America is a documentary question these scans
cannot answer, and the answer would settle much of this.

## How a date was got

Finding the ink is arithmetic, reading it is not, so the work splits.

`rolls.py` assembles the corpus and its geometry. `ink.py` fetches each scan
in downscaled strips, fits a background to the paper and keeps what stands
darker than it by more than a few times the paper's own noise; `scan.py`
runs that over every roll end to end and writes `candidates.json`.
`crops.py` renders each candidate as a JPEG a reader can look at. Readers
worked through `reading.md` and wrote what they saw into `readings/`. The
reading that won for each roll is kept in condon-dates, in
`data/readings.json`, and a date is corrected there and nowhere else;
`condon.py` lays it over `candidates.json` for the scripts here. `pitch.py`
and `step.py` measure the pitch and the advance on every roll, and
`summary.py` writes `summary.txt`.

Four things about the images cost several passes to learn, and none of them
is in the literature.

- **The ink is a red-channel signal.** The paper reads about 90 there and
  the ink about 50; in the green channel, which the punch measurements use
  because a perforation is a hole and not a pigment, both are dark and the
  contrast is a third of it.
- **How dark the paper reads varies from scan to scan**, from 77 to 178, and
  some rolls are buff rather than red. A fixed threshold silently produces
  nothing on the pale ones, so the level comes from each strip's histogram.
- **The workshop wrote along the roll in both directions.** Condon Roll 47
  reads at a quarter turn one way and Roll 48 at a quarter turn the other.
  Every crop therefore carries the picture twice, the second turned through
  180 degrees.
- **Three things are dark and are not writing**: creases running along the
  roll, which sit exactly where inscriptions do and are known by their
  columns staying dark the whole strip; damp stains, which are the largest
  dark patches on these rolls and are known by surviving an erosion where a
  pen stroke does not; and the printed label and colour target on the
  leader, which are solid in the same way.

## Reviewing and correcting the dates

The readings are provisional and meant to be corrected. Under every roll of
the review page sit two buttons and a field for what the roll says instead,
each writing one document to the page's own database under
`verdicts/{druid}`. What the two buttons mean depends on whether a reader
got anything:

| | mark | what it records |
|---|---|---|
| a reading exists | *stands* | the reading is right |
| | *wrong or unreadable* | it is misread, or the figures cannot be made out |
| no reading | *no date on this roll* | this copy carries no punch date at all |
| | *a date is there, not found* | the search failed to surface one |

**The four are four different findings, and none of them is silence.**

A bare *wrong* withdraws the date and keeps the inscription. That is the
honest mark for a roll whose figures cannot be made out: it takes a bad date
out of the tables without inventing a good one. Typing a correction instead
asserts a new reading, and a new date where the text carries one. Where a
figure is illegible rather than misread, the bare mark is the one that says
so.

*No date on this roll* is a positive finding, not a shrug. Some of these
rolls are genuinely blank after the music — several end margins were checked
by eye and carry nothing at all — and until someone says so, a roll with no
reading is ambiguous between a copy that was never dated and a copy whose
date was missed. Every blank marked turns part of an unusable 168 into a
denominator: how many copies the workshop dated at all.

*A date is there, not found* is the complement, and the only measure of what
the ink search failed to see. `verdicts.py` prints those druids with the
command that re-crops them wider.

Those verdicts are readings, so they belong in condon-dates'
`data/readings.json` and are to be applied there. `verdicts.py` turns a dump
of the collection, made with the ArtifactData tool,

    action=list  collection=verdicts  out_dir=punch-225/cache/verdicts

into `readings/reviewed.json`, the form the readers' files have. Nothing here
folds that file into `readings.json`, so it is not to be run until the step
that applies the verdicts sits in condon-dates. In the ranking `merge.py`
keeps, `reviewed.json` comes before every other file, so an editor's verdict
outranks a reader's reading and the re-readings done here. A
correction replaces the inscription and its date is parsed from it, in any
of the forms the workshop used — `26. 1. 14`, `7 Dezb 1908`, `14114`,
`1910-09-14`. A string that could be split more than one way, `2424` or
`5724`, is left undated rather than guessed at, and says so in its notes. A
roll marked wrong without a correction loses its date and keeps its
inscription.

Nothing is destroyed by a rerun: the readers' files stay as they were, and
re-running the search or the measurements does not touch the readings, which
are kept in condon-dates.

## Reading candidates.json

It holds the catalogue fields, the regions and the search notes, and no
readings. `condon.records()` returns each record with its reading from
condon-dates laid over it: `inscription`, `reading`, `date_iso`,
`confidence`, `roll_number`, `hand`, `crop` and `read_notes`. condon-dates
calls the reader's notes `notes`; they are renamed so as not to shadow the
search notes, which keep that name here.

**A reading points at its crop by box.** `crop` is `{"box": "x,y,w,h",
"rot": 90}`, the box the reader looked at with the re-cut already resolved.
The region read is the one whose `view`, `view_e` or `view_w` has that box,
which is how `review/build.py` finds it; a place in the `regions` list would
not survive a rerun of the search.

**A region has up to three boxes.** `view` is the crop every roll got;
`view_w` is a wider second cut, on the 24 rolls whose line was clipped; and
`view_e` is the cut carried past the nominal paper edge, on the 122 undated
rolls that touch it. Each holds its own `x, y, w, h`, `file` and `url`. The
region's own `x, y, w, h` are the detected patch, padded, and are not what
any reader looked at.

## How far to trust the dates

- **On some rolls the inscription is physically gone, not merely hard to
  see.** The workshop wrote at the very edge of the paper, and where the
  edge has since been trimmed or has worn away, the tops of the figures went
  with it. Several readers arrived at this independently: on
  `bx815rz0622`, `dx555xv9093`, `zv706jf8277` and `gh272kd2238` the scan
  shows the scanner's backing directly above the truncated figures, so the
  paper ends there and no crop can recover what is missing. This bounds what
  the archive can yield: for those copies the date is lost, not unread.
- **A small looped mark at the paper edge, on rolls otherwise unrelated, is
  not an inscription.** It recurs identically on `zf037wk3650`,
  `jx095ty1753` and `wp877mn0317`, and is most likely a checker's tick.
- **The ranking is right 94 per cent of the time, and being right does not
  matter much.** Of the 285 dated copies, 267 had their date in the
  top-scoring region; 18 did not. Thirteen of those eighteen were outranked
  by a patch cut off at the edge of the searched stretch, which is the music
  or a crease continuing past the window rather than an inscription;
  `truncated()` now scores those down, which would have recovered five of
  the eighteen and demoted one that was already right. The readings
  themselves are unaffected, since a reader opens the other regions when the
  first holds nothing. Anything downstream that treats the top region as the
  answer, rather than `read_region`, will be wrong on about one roll in
  twenty. Stamped dates rank exactly as well as handwritten ones, 94 per
  cent on each of 49 and 236.
- **A single reader's "high" is worth about a "medium".** Seven rolls were
  read twice by different readers and two of the seven disagree, both times
  with at least one reader confident. On `bj606rp8160` one gave
  `867. 19. 9. 10.` and the other `864. 14. 4. 10`; the roll reads
  `367. 14. 9. 10.`, so each had half of it.
- **The number on the paper is the check that works.** Where a copy's
  written number can be compared with the catalogue's, it has agreed, and
  in the case above it is what identified the right reading. A date whose
  number disagrees is suspect: `ky458kj7325` reads 369 against a catalogue
  number of 2882 and is flagged rather than used.
- **The earliest date per catalogue band should rise with the number**, and
  it does: 1908 for Welte 500–999, 1910 for 1500–1999, 1912 for 2500–2999,
  1913 for 3000–3499, 1924 for 5500 and above. A date that breaks that
  ordering has been re-read. One did, `pj688nx2384`, read as 1904 and
  actually 1909; one still does, `fj448by1666`, which reads `1474 8 8 04`
  plainly and would put catalogue number 1474 in August 1904.
- **A bare four-figure group is a date or a roll number, and which is not
  always decidable.** Seventeen are read as dates here, and the class holds
  together: with a two-figure year a four-figure string forces one split, so
  the parse is not a choice; all seventeen give a day and a month in 1 to 9,
  as they must; none of the seventeen equals its own roll's catalogue
  number; and all seventeen fall in 1920 to 1925, which is where the
  compressed forms belong. Against that, eight of the 88 four-figure roll
  numbers recorded — 1033, 1035, 1063, 2000, 2068, 3045, 3084, 7033 — could
  not be dates at all, since their second figure is 0. So a group that
  parses is only a candidate: what decides it is whether the roll's own
  number appears separately on the paper. Where both a number and a second
  four-figure group are written, the second is probably a date; where only
  one four-figure group appears and it matches the catalogue, it is the
  number.
- **A date printed on a label is a recording date, not a punch date, and is
  deliberately not used.** Four rolls carry one in their `inscription` with
  `date_iso` left empty — `dz678wd2724` (5. XII. 05), `jx095ty1753`
  (19. II. 06), `xx766cn9843` (19. III. 07) and `gr034qm4805`
  (23. III. 09) — and that is correct, not an oversight. All four are
  letterpress, in the construction "Gespielt von X, date", and the tells are
  the Roman-numeral month and the facsimile signature. Roll 225 settles the
  principle: its label reads "Gespielt von Alfred Grünfeld 20. I. 1905"
  while its two Stanford copies were punched in January 1909 and January
  1914. Such a date is still a floor, since a copy cannot predate the
  performance it carries, but it is far too weak to record as the copy's.
- **A period near 1.5 mm in the advance is noise, not a third setting.**
  Fourteen rolls have their strongest period between 1.40 and 1.60 mm, and
  none of them has a clean second peak: their runner-ups sit at R of 0.20 or
  below. The genuine 1.0 mm comb is a different regime altogether, R between
  0.75 and 0.87 on every one of the eleven copies that show it. `summary.py`
  therefore takes the early advance as a band, 0.85 to 1.15, rather than as
  everything above a threshold — a 1.562 mm reading at R = 0.26 had
  otherwise put a spurious 1907 copy at the head of the group. `step.json`
  records the runner-up peaks of every roll for exactly this kind of check.
- **Dates written without separators are parsed, not read.** `26323` is
  26.3.23 only on the convention that roll 225's `14114` is 14.1.1914. The
  figures are certain and the grouping is an inference; those readings are
  marked medium.
- **Later hands are not punch dates.** Conservators' and owners' notes of
  1950, 1979, 1987, 1991, 1994, 1998 and 2002 appear on this paper, and
  printed publication dates appear on the labels. Neither is used.
- **Nothing is taken from the catalogue.** Several of Stanford's records
  quote Peter Phillips's inventory, which dates Phillips's copy of a title
  and not the roll Stanford scanned. Those are recorded in the notes so that
  their exclusion is visible, and no date here comes from anywhere but the
  image.
- **The corpus is a collection, not a sample.** Condon collected what he
  could find, so the number of surviving copies in each state is not the
  number produced. The spans above are sound; the proportions are not
  evidence about production.

## Files

| File | Content |
|---|---|
| `rolls.py` | the 456 red rolls, their geometry and their catalogue notes |
| `ink.py` | where the ink is on a scan: strips, background, blobs, ranking |
| `scan.py` | the search over every roll; writes `candidates.json` |
| `crops.py` | the candidate regions as images, both ways up |
| `batches.py`, `remaining.py` | handing the crops out to readers, and resuming |
| `condon.py` | the readings from condon-dates, laid over `candidates.json` |
| `merge.py` | the rule that ranked the readers' files into one reading per roll |
| `pitch.py` | the pitch of every roll, measured on the scan |
| `step.py` | the advance of every roll, from the analyses |
| `summary.py` | the tables above; writes `summary.txt` |
| `reading.md` | what the readers were told |
| `candidates.json` | one record per roll: catalogue, regions, search notes |
| `pitch.json`, `step.json` | the measurements |
| `readings/` | what each reader wrote, and `authoritative.json` for rolls re-read here; kept as written, the readings live in condon-dates |
