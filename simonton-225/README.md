# Simonton's copy of WM 225, compared by its dynamics

*Legendary Masters of the Piano* (The Classics Record Library, 1963)
includes Grünfeld's *Träumerei*, played from a Welte roll 225 on a
Vorsetzer in Los Angeles in the winter of 1962/63. The set was made for
the Book-of-the-Month Club by Richard C. Simonton and produced by
Walter S. Heebner. Which roll was played is not known. This directory
holds the scripts and the derived data of a comparison of that recording
with the versions of the edition. The edition's beliefs about the copy
cite these files.

The comparison follows `../schmitz-225/` and runs against the version
tree as it stands after the lost state B2, the Licensee version D3 and
the dissolution of B1. Every number below is in `trans/report_data.json`.

## What the comparison shows

- **Red paper.**
  - D3's two re-strikes (the a at 2864.4 mm, the final c′) are not
    heard. The e″ at 6611.5 mm, which D3 ties over, is struck.
  - Where both Licensee copies run about 27 mm longer than the red ones
    (bars 3→4 and 8→1′), the recording departs from the red timing by
    −0.2 and +0.1 mm. All 411 spans of that length vary with a standard
    deviation of 1.4 mm.
- **The dynamics of A.** R² of each version's emulated velocities against
  the recorded loudness, per keyboard half:

  | Measure | A | A1 | B | B2 | C | D3 |
  |---|---|---|---|---|---|---|
  | Transkun velocities | 0.737 | 0.734 | 0.546 | 0.537 | 0.520 | 0.503 |
  | Kong velocities | 0.690 | 0.698 | 0.532 | 0.524 | 0.518 | 0.483 |
  | NMF, harmonic peak | 0.221 | 0.224 | 0.094 | 0.083 | 0.075 | 0.053 |
  | NMF, onset peak | 0.428 | 0.429 | 0.165 | 0.137 | 0.123 | 0.089 |
  | Mean of the four | 0.470 | 0.476 | 0.140 | 0.116 | 0.095 | 0.047 |

  A and A1 fit better than B and C under all seven instrument settings of
  the emulator.
- **Passage by passage, against A** (`emu/scan_A.json`, Transkun
  velocities).
  - Of 23 detectable passages that hold additions of B, one favours them.
  - Of 15 detectable passages where B moves or strikes a punch of A, none
    favours B. Long spans are among them, which a sluggish instrument
    blurring short accents would not explain.
  - On the mean of the three measures without Kong the counts are 19 and
    0, and 14 and 0.
- **The instrument.**
  - The recording follows A's own crescendi in both halves: removing them
    worsens the fit by 211 (bass) and 147 (treble) in n·log RSS.
  - Played on deformed instruments (pumps three times slower or faster,
    a dead forzando or crescendo valve, compressive or expansive velocity
    maps), B and C read as A or A1 in at most 0.5 % of 200 draws each.
- **No departure from A.** No run of 6, 12 or 24 notes in either half
  departs from A beyond a family-wise bound.
- **A or A1.** Undecided.
  - Transkun favours A and the mean of the four measures favours A1.
  - The soft-pedal flicker of bars 8′–10, A1's addition, leaves no trace
    in the loudness: A is preferred in 0.65 of 1000 resamples.
- **Bar 13.** The una corda, which B strikes, is weakly supported: A is
  preferred in 0.69 of resamples.
- **Control.** The same code, run on TACET's recording of Schmitz's copy
  (`control/`), still finds C (R² 0.647 against 0.509 for A).
- **Green.** On the 367 notes the green version D2 carries, D2 fits worst
  (R² 0.579 against 0.761 for A). Why 92 of C's notes find no D2
  counterpart in `emu/emulator.mjs`'s mapping is not resolved.

## Sources

- **Recording.**
  - David Hertzberg's YouTube upload of 23 November 2022, video
    `ma3FOR-eUQQ`, whose title gives the number SWV 6633. Of yt-dlp
    2026.07.04's clients only `web_embedded` downloaded it: Opus, stereo,
    about 133 kbit/s.
  - ffmpeg 8.0.1 wrote `yt/rec.wav` (mono) and `yt/rec_stereo.wav` at
    44.1 kHz. sox brought the mono file down by 19.1 cents with
    `speed 0.98903` (`yt/rec_corr.wav`), which the transcriptions read.
  - The audio is not part of this directory.
- **Sleeve.** The transcription at
  https://www.mmdigest.com/Pictures/Welte/lp1963.html. It gives the
  catalogue number WV 6633. The roll numbers and recording dates in its
  list are credited to Mark Reinhart and are not from the sleeve.
- **Instrument.** Rex Lawson, "On the Right Track: The Recording of
  Dynamics for the Reproducing Piano (Part One)", *The Pianola Journal*
  20 (2009), p. 37. Kenneth K. Caswell owned the Welte push-up used and
  recalled fitting an Ampico stack in place of the Welte mechanism.
- **The rolls.** "Welte Piano Roll Collection (Simonton Collection).
  Index by Composer", University of Southern California, Department of
  Special Collections, 2000, retrieved from
  http://web.archive.org/web/2001id_/http://www.usc.edu/isd/locations/ssh/special/176WelteRolls.pdf.
  It lists no. 0225 in three copies, box 2, with no comment.
- **Edition.** `edition.jsonld` of this repository at commit `1a7b95d`,
  SHA-256 `81eac10c75a03d56ead95d319a5734490d4c5d33d2f426dbfd8a7ceef082a4f3`.

## Layout and order of work

Paths resolve relative to the directory holding `emu/` and `trans/`.

**Emulation** (`emu/`, run as `node --import ./extensionless.mjs <script>`)
- `emulator.mjs` is shared. It holds the layers A1, B, B2, C's additions
  and C's removals, and maps a note outside C to C's note of the same
  pitch within 20 mm.
- `emulate.mjs` writes `versions.json` (15 MB, not archived): notes,
  velocities and pedal curves of every version, each on its own system.
- `hybrids.mjs` writes `hybrids.json`: the 32 combinations of the layers,
  and A, A1, B, B2 and C under each of the seven instrument settings.
- `scan.mjs` with `BASE=A` writes `scan_A.json`: the passages of
  distinguishing readings, each switched against A.
- `ablate.mjs` writes `ablate.json`, `deformed.mjs` writes
  `deformed.json`.

**Transcription and alignment** (`trans/`)
- `transcribe_all.sh`, as it ran with absolute paths, calls `run_kong.py`
  (Kong et al. 2021), `transkun` and `midi_to_notes.py`. It writes
  `kong.json` and `transkun_rec.json`.
- `align.py` pairs the notes of C with the heard notes. It writes
  `matched_transkun.json`, and `matched.json` for Kong with
  `--time-map matched_transkun.json`. Kong's own alignment lost the final
  bars. In both files the column `kong_velocity` holds the velocity of
  the transcription at hand.
- `aligned_notes.py` writes `rec_aligned.json` and `transkun_loudness.json`.
- `nmf_loudness.py yt/rec_corr.wav trans/rec_aligned.json trans/rec_nmf.json`
  estimates loudness after Ewert and Müller (2012).
- `composite.py` writes `rec_composite.json` (Kong, Transkun and both NMF
  measures, on `matched.json`) and `rec_composite3.json` (without Kong, on
  `matched_transkun.json`).

**Analyses.** All numbers use the model with scale and offset for each
keyboard half, selected by `PER_HALF=1`.
- `analysis.py`, `hybrid_analysis.py`, `cluster_analysis.py` and
  `residual_runs.py` come from `../schmitz-225/`, adapted to the new tree.
  `cluster_analysis.py` also classes a passage by its span, and
  `residual_runs.py` takes `--base`.
- `red_paper.py`: the note text and the timing against D3's paper.
- `pedal_test.py`: soft pedal against A1 and B, and the damper.
- `ablation.py`: the functions and registers one at a time.
- `deformed_simulation.py` writes `deformed_simulation.json`.
- `probe_audio.py` writes `audio_probe.json`: pitch against A = 440 Hz,
  and the agreement of the two channels.
- `export_report.py` writes `report_data.json`.

**Control** (`control/`). `tacet_matched_transkun.json` is
`../schmitz-225/trans/transkun_rec.json` aligned with this `align.py`.

## Software

- **Python.** Python 3.13.5 with numpy 2.2.6, scipy 1.16.1, librosa
  0.11.0, soundfile 0.13.1 and mido 1.3.3.
- **Transcription.** It ran in the environment named in
  `../schmitz-225/README.md`: torch 2.10.0, piano_transcription_inference
  0.0.6 with the checkpoint `note_F1=0.9677_pedal_F1=0.9186.pth`, and
  transkun 2.0.1 with its model 2.0.
- **Emulation.** Node 24.19.0 with linked-rolls 0.29.0 and
  welte-mignon-emulator 1.0.0, as installed in measuring-early-records.
  `emu/emulator.mjs` points to that installation and to `edition.jsonld`
  on the author's machine.

## Limits

- **The recording.** The evidence is one recording, in a lossy transfer
  of an LP. The silence before the music is digital, so the transfer may
  have been cleaned.
- **Pitch.** The transfer sounds 19 cents sharp throughout (15–22 cents
  in every ten-second window). Whether that is the transfer's speed or
  the piano's tuning is not known.
- **The instrument.**
  - The instrument's regulation is not known, and its Vorsetzer carried
    an Ampico stack.
  - The emulator's constants were fitted to the drawn expression lines of
    six Freiburg rolls.
- **Kong.** Kong's transcription is unreliable here: 1108 notes for 463,
  262 of the unmatched ones with velocity 40 or more.
- **The text of A.** A itself is reconstructed from the Widuch copy.
- **Settings.**
  - The statistical settings come unchanged from `../schmitz-225/`:
    bootstrap blocks of 24 notes, a detectability threshold of 2, a cubic
    term in pitch, and a scale for each half.
  - The noise level of the simulation (R² 0.52) is taken from this
    recording.
- **Master or production copy.** The comparison cannot tell a master or
  second master from a production copy.

## References

- Qiuqiang Kong, Bochen Li, Xuchen Song, Yuan Wan and Yuxuan Wang,
  "High-Resolution Piano Transcription With Pedals by Regressing Onset
  and Offset Times", *IEEE/ACM Transactions on Audio, Speech, and
  Language Processing* 29 (2021), pp. 3707–3717.
- Yujia Yan and Zhiyao Duan, "Scoring Intervals Using Non-Hierarchical
  Transformer for Automatic Piano Transcription", *Proceedings of the
  25th International Society for Music Information Retrieval
  Conference*, 2024.
- Sebastian Ewert and Meinard Müller, "Using Score-Informed Constraints
  for NMF-Based Source Separation", *Proceedings of the IEEE
  International Conference on Acoustics, Speech and Signal Processing*,
  2012, pp. 129–132.
- Rex Lawson, "On the Right Track: The Recording of Dynamics for the
  Reproducing Piano (Part One)", *The Pianola Journal* 20 (2009).
