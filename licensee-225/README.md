# The Licensee copies of WM 225, compared by perforations and dynamics

Besides Spencer Chase's copy, two copies of the Licensee issue C-225 of
Grünfeld's *Träumerei* are known: Philippe Gourlin's, through Warren
Trachtman's emulated MIDI file, and Peter Phillips's, through the files
of his pneumatic roll reader. This directory holds the scripts and the
derived data of their comparison with the versions of the edition. The
edition's beliefs about version D3, about the lost state B2 and about
Gourlin's copy cite these files.

## What the comparison shows

- **One reading, two files.** Phillips's e-roll is the reading behind
  his standard MIDI file of the same copy: all 464 notes agree in pitch,
  onset and length, shifted by 1274 ticks. It is placed on the edition's
  axis through the notes (`eroll/place.py`). There the reading's
  archetypal punches lie within 3.3 mm of their place on the red copies
  in 95 % of cases.
- **B's additions.** The reading carries 140 of the 155 punches B adds
  (`eroll/binding.txt`, counted before Stanford-1's crescendo before the
  upbeat moved to B). Where one is missing, its Off often still stands
  as a new redundancy (3474, 8136 and 9054 mm), the trace of an accent
  withdrawn by striking its On (`eroll/redundancy.txt`).
- **C's additions.** Twelve punches of eight of C's additions lie at the
  place C has them. Punches displaced at random hit such places 1.2
  times on average and at most six times in 2000 runs. None of the 23
  edits of the "Differenzierung der Mittelstimmen" is there, nor C's
  cleanups. Hence a lost state B2 between B and C, from which both C and
  the Licensee version D3 descend.
- **A's punches.** At four of the 45 places where B moves or strikes
  a punch of A, known only from the Widuch copy, the reading shows A's
  punch, and at 30 of them B's (`eroll/retentions.txt`). Displaced at
  random, the reading's unexplained punches hit such places 0.66 times on
  average and five times or more in one run of a hundred. All four lie in
  passages the Licensee editor demonstrably reworked. The same punch is
  hardly set twice at the same place independently, and the On at
  2873 mm would make effective the Off that B's strike leaves standing at
  2893 mm; since D3 descends from B all the same, the edition takes the
  four from a second model in A's state. It holds that contamination
  possible, not likely. Chance remains, and so does a lost state between
  A and B with B's new punches beside A's old ones, which would explain
  D3's two accents at 1931 and 1964 mm; but then B and C would each have
  struck the same two sounding accents, at 1964 and 2873 mm.
- **Gourlin's copy.** Tested in the coding Phillips's punches show
  (`an/recon/eroll_test.py`, `an/recon/eroll_test.txt`), the velocities
  of Trachtman's emulation carry the shared additions of C (seven units,
  pooled z +1.15 ± 0.23) and lack the punches of B that D3 strikes (four
  units, −1.26 ± 0.10) and the differentiation of the middle voices
  (−1.00 ± 0.18). On Phillips's own standard file the same test recovers
  what his punches show, except before the first note.
- **Soft pedal.** The e-roll shows no soft-pedal command inside the
  music, though the switch of position 7 reads in the cancel row and
  after the last note. Position 8 never occurs, and whether the reader
  reads it is not known. Gourlin's velocities show no soft-pedal change
  in bars 8′ to 15 (`an/expr2/soft_test.json`).

## Superseded

`an/findings.md`, `an/recon/reconstruction.md` and `an/expr2/ablation.md`
were written on 14 September 2026 from the two emulations alone. They
conclude that none of C's additions is present and that there is no
state between B and C. The e-roll contradicts both. The velocity tests
had no power for the forzando pairs and pooled the shared additions with
the absent ones. The files are kept as they were.

## Sources

None of the source files is part of this directory.

- **Trachtman's file.** `WelteMignon-C-225_Traumerei(Schumann)_eRollMIDI_Wexp.mid`
  at https://www.pianorollmusic.org/html/trachtman/midifiles/NonPDfiles/.
- **Phillips's files.** The standard MIDI files of his red and his
  Licensee copy (`Traumerei (Schumann) Grunfeld RW.mid`, `… LW.mid`),
  sent on 8 September 2026, and the Licensee e-roll
  (`Traumerei (Schumann) Grunfeld LW e.mid`), sent on 15 September 2026.
  They are © Peter Phillips 2014 and are not redistributed. Derived
  files that would reproduce them (`midi_events.json`, `placed*.json`)
  are left out as well, and so is `an/expr/followup.json`, which quotes
  the velocities of single notes.
- **Edition.** `edition.jsonld` of this repository at commit `39c403f`.
  The export of its versions (`versions.json`, 4 MB) is not archived and
  can be regenerated with `an/export_versions.mjs` or
  `eroll/export_versions.mjs`.
- **Phillips's thesis.** *Piano Rolls and Contemporary Player Pianos*,
  PhD thesis, University of New South Wales 2016, for his reader
  (ch. 3) and his expression model (ch. 4).

## Layout and order of work

The scripts are archived as they ran on 14 and 15 September 2026,
without cleaning up. They name their inputs by absolute paths on the
machine they ran on.

**Emulations** (`an/`)
- `parse_midi.py` reads the three MIDI files into `midi_events.json`.
- `collate.py` and `align_dp.py` put their notes and pedals on the
  edition's axis and collate them with the versions. `detail.py`,
  `local.py`, `variants.py`, `loci.py`, `holeshape.py`, `grid*.py` and
  `audit.py` look at single readings. `findings.md` sums up.
- `bars/` maps bar numbers to millimetres.

**Dynamics from velocities** (`an/expr/`, `an/expr2/`, `an/recon/`)
- `expr/` holds the first model comparison (`expression_test.md`).
- `expr2/` holds the ablation of edit groups and the soft-pedal test
  (`ablation.md`, `soft_test.json`).
- `recon/` identifies the engines on the two controls (`identify.py`,
  `split.py`), reconstructs the coding between notes (`recon.py`,
  `calib*.py`, `reconstruction.md`) and finally tests the readings that
  bind in the coding of Phillips's punches (`eroll_test.py`).

**Phillips's e-roll** (`eroll/`)
- `place.py` places the e-roll through the notes of his standard file.
- `additions.py` and `binding.py` collate its expression punches with
  every version's additions and test their place against chance
  (`binding.txt`). `local.py` looks at the binding readings with local
  offsets (`local.txt`), `redundancy.py` at redundancies (`redundancy.txt`),
  and `retentions.py` at the punches of A that B changed (`retentions.txt`).

The edition itself was changed by `scripts/add-licensee-d3.ts` in
`pfefferniels/measuring-early-records`. That script reads the e-roll
again through linked-rolls' `readFromPhillipsEroll`, places it by its
own alignment of the note sequence against C, collates it with B2, and
writes version D3 with its edits and the copies of Phillips and Gourlin.
Its counts differ slightly from the ones above, because Stanford-1's
leader crescendo belongs to B there and its placement is its own.
