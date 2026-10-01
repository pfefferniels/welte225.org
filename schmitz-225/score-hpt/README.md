# Score-HPT on Schmitz's copy of WM 225

Zhanhong He, Roberto Togneri and Defeng Huang (arXiv:2508.07757, for
SMC 2026) refine the velocities an acoustic model hears with a small
transformer that reads the aligned score. The comparisons in `../trans`
have the roll's notes aligned to the recording, so the method could
stand in for, or add to, the per-note loudness measures there. This
directory runs the authors' released checkpoint on TACET's recording
and puts its velocities through the analyses of `../trans` unchanged.
Every number below is in `report_data.json`.

## What the comparison shows

- **The editor hardly edits.**
  - On the 463 notes the editor lowers every acoustic estimate by
    7.4 ± 0.6 velocity units (range −8.7 to −5.8). Its output follows
    the acoustic estimate with r = 0.997.
  - The correction stays the same when the score is shifted or
    jittered, and on the synthetic renderings (−7.9 ± 0.5).
  - With made-up notes (`editor_probe.json`) it subtracts 7.4 to 8.3
    whatever the acoustic estimate, ±0.4–0.8 by pitch and place. Raising
    every note's estimate from 26 to 102 changes the correction by 0.9.
  - On the paper's own test set it is the same. Over the 50 pieces of
    SMD the editor brings the onset error of the acoustic branch from
    17.9 to 10.6 velocity units; subtracting its mean correction of 7.6
    from every note gives 10.6 as well. Its correlation with the true
    velocities rises by 0.004 per piece (0.907 to 0.911), its correction is
    −7.6 ± 0.8.
  - A constant offset is absorbed by the regression's intercept, so
    Score-HPT judges the versions as its acoustic branch does.
- **The versions.** R² of each version's emulated velocities against
  the measured loudness, per keyboard half, onsets as Transkun heard
  them:

  | Measure | A | A1 | B | B1 | C | n·log RSS, B1 − C | A1 − C |
  |---|---|---|---|---|---|---|---|
  | Transkun velocities | 0.451 | 0.505 | 0.609 | 0.607 | 0.651 | 54.6 | 161.5 |
  | Kong velocities | 0.273 | 0.332 | 0.486 | 0.486 | 0.553 | 64.6 | 185.3 |
  | Composite of `../trans` | 0.054 | 0.135 | 0.315 | 0.316 | 0.397 | 58.0 | 166.0 |
  | Score-HPT, editor | 0.263 | 0.324 | 0.460 | 0.458 | 0.512 | 47.9 | 150.5 |
  | Score-HPT, acoustic branch | 0.312 | 0.369 | 0.492 | 0.491 | 0.541 | 47.9 | 146.9 |

  - Score-HPT finds C, as every measure in `../trans` does, and
    separates the versions less. The 95 % intervals of the block
    bootstrap for B1 − C are 17.6 to 79.7 against 25.7 to 104.4 for
    Transkun, for A1 − C 94.8 to 232.9 against 105.8 to 261.9.
  - The editor lowers the fit of its own acoustic branch. Reading the
    maximum over a note's frames, the default of the authors'
    `inference.py`, gives 0.536 for C.
- **It needs the transcriber's onsets.** Score-HPT reads the velocity
  at the onset frame of the score, so it is only as good as the
  alignment.
  - With the roll's onsets projected by the time map of `../trans`,
    which scatter 30 ms around the heard onsets, C falls to 0.383 and
    B1 − C to 34.0.
  - Random displacements of 10, 20, 30 and 50 ms leave B1 − C at 47.4,
    37.9, 24.9 and 10.9.
  - Moving every onset 20 ms earlier or later costs little; 50 ms later
    leaves B1 − C at 32.4, 50 ms earlier turns it to −11.5: B and B1
    then fit better than C.
  - Used here, the method therefore rests on Transkun's onsets and
    adds an estimate of loudness at them.
- **Known texts.** Rendered with FluidSynth from the matched notes,
  each version's velocities and the damper Kong heard, A1, B1 and C
  come out as themselves, except that Score-HPT puts B1 0.5 nearer B,
  from which it differs audibly in one note (Kong did the same in
  `../trans/validation`). Transkun separates them two to five times as
  far. R² of the best version, and n·log RSS to the nearest other:

  | Rendered | Transkun | nearest | Score-HPT | nearest |
  |---|---|---|---|---|
  | A1 | A1, 0.646 | A, 312.3 | A1, 0.363 | B, 66.9 |
  | B1 | B1, 0.530 | B, 11.6; C, 102.9 | B, 0.361 | B1, 0.5; C, 50.2 |
  | C | C, 0.552 | B1, 186.7 | C, 0.362 | B, 68.7 |
- **Passages.** Switched against C one at a time, 29 passages are
  detectable on Score-HPT's velocities, 34 on Transkun's and 33 on
  Kong's. 28 of the 29 favour C and one is flagged at p < 0.05, as
  with the others.
- **Agreement with the other measures.** Freed of their pitch trends,
  Score-HPT's velocities correlate 0.906 with Kong's, 0.840 with
  Transkun's and 0.62–0.66 with the NMF measures. Its acoustic branch
  is Kong's velocity network retrained, and it adds to the composite
  about what Kong adds: C rises from 0.377 to 0.395 when it joins
  Transkun and the two NMF measures, and to 0.397 with Kong.
- **The newer tree.** On the control alignment of
  `../../simonton-225/control`, Score-HPT also finds C (0.506 against
  0.329 for A; Transkun 0.647 against 0.509), and A − C is 141.5 in
  n·log RSS against 151.9 for Transkun. With the projected onsets it
  cannot tell C from D1 (0.377 and 0.378).
- **The implementation.** `score_hpt.py` gives the same velocities as
  the authors' `inference.py` on SMD's Chopin Op. 28 No. 11, all 313
  notes alike. Its onset error of 10.6 over SMD lies above the paper's
  8.0, which comes from another checkpoint (below), and near the 10.0
  the paper gives for its HPT baseline.

## Sources

- **Recording.** The YouTube release used in `../trans` could not be
  downloaded from the environment this ran in. The Internet Archive
  item `the-welte-mignon-mystery` holds the album as FLAC; track
  "TWMM, Vol. 21 - Alfred Grünfeld/14. Kinderszenen, Op. 15 - No. 7,
  Träumerei.flac" (24 bit, 96 kHz, stereo, SHA-256
  `e73333b48548b176f66a9a0a126a8fee12de716e5a4e16367b8b09299969f180`)
  was converted with ffmpeg to a mono WAV at 44.1 kHz.
  - It is the recording `../trans` heard. Transkun pairs 463 of its
    464 notes with the 463 heard there, 2.6 ms apart once the YouTube
    transfer's 3.293 s longer lead-in is added, at a speed ratio of
    1.000002; the velocities differ by 1.4 (sd). Kong pairs 462 notes,
    1.1 ms apart, velocities within 1.1 (`recording/`).
  - The scripts add that lead-in as silence, so the matched files of
    `../trans` serve unchanged.
  - The audio is not part of this directory.
- **Method.** github.com/zhanh-he/score-informed-amt at commit
  `22b4db6`, with its one released checkpoint
  `workspaces/checkpoints/hpt+onset+frame+score_note_editor/100000_iterations.pth`
  (SHA-256 `d3419b97b7a2f37c909b8296e9aeaff9f22d9a057ef920d0a1aba01835550e8f`),
  the paper's Score-HPT with onset and frame conditioning.
- **Test set.** Saarland Music Data, version 2,
  zenodo.org/records/13753319: the 50 pieces with their MIDI files and
  44.1 kHz recordings. The paper read version 1, as MP3, and 49
  pieces.

## The method as released

Read from the code, since the paper differs from it in places.

- The acoustic branch is the velocity network of Kong et al. (2021),
  trained anew on MAESTRO together with the editor; it is not Kong's
  released model. It hears 22.05 kHz audio through 128 mel bands (the
  paper says 229) at a hop of 220 samples, 100.23 frames per second,
  while the score rolls run at 100. Within each 10 s window the two
  drift apart by up to 2.3 frames; the checkpoint was trained so, and
  `score_hpt.py` keeps it.
- The editor sees, for each score onset in the window, its pitch, its
  frame and the acoustic estimate there. The frame roll it is given is
  1 at every onset and adds nothing. It changes the velocity only at
  the onset frame, by at most ±25.6.
- The paper's numbers are read at the onset frame. The authors'
  `inference.py` reads the maximum over the note's frames by default,
  and its mode table names a function that does not exist
  (`run_dataset_score_mode`), so it stops before running; the check
  above used a copy with that name corrected.
- The paper's SMD figures come from a checkpoint of 20 000 iterations
  (the authors' `Test.ipynb`); only the one of 100 000 is released. No checkpoint
  of the HPT baseline is released either: "acoustic branch" above is
  the branch trained with the editor.

## Layout and order of work

`run_all.sh` lists the steps with their arguments. Paths are relative
to this directory.

- `recording/`: `run_kong.py` and the `transkun` command transcribe
  the FLAC (`flac_kong.json`, `flac_transkun_rec.json`);
  `same_recording.py` pairs them with the transcriptions of `../trans`.
- `score_hpt.py` writes, for every row of a matched file, the acoustic
  estimate and the editor's value, each at the onset frame and as the
  maximum over the note.
  - `scorehpt_heard.json`: onsets as Transkun heard them.
  - `scorehpt_mapped.json`: onsets projected by the time map.
  - `variants/`: every onset moved by `--shift`, or displaced at
    random by `--jitter` (seed 225).
  - `control_scorehpt.json`, `control_scorehpt_mapped.json`: the same
    on the control alignment against the newer tree, which
    `control_fits.py` compares with the tools of
    `../../simonton-225/trans` (`control_fits.json`).
- `synth/`: `synth.py` writes the MIDI of a known text, which
  FluidSynth renders and `normalise.py` brings to the recording's peak
  level; `pair.py` matches Transkun's notes of a rendering to the rows.
- `editor_probe.py` feeds the editor made-up notes
  (`editor_probe.json`).
- `smd_check.py` measures the onset error on SMD (`smd_check.json`).
- `report.py` reads all of these with the modules of `../trans` and
  writes `report_data.json`.

## Software

- Python 3.11.15 with torch 2.14.1 (CPU), torchaudio 2.11.0,
  hydra-core 1.3.7, omegaconf 2.3.1, nnAudio 0.3.4, librosa 0.11.0,
  numpy 2.4.6, scipy 1.17.1, soundfile 0.14.0 and mido 1.3.3.
- transkun 2.0.1 with its model 2.0, and piano_transcription_inference
  0.0.6 with the checkpoint `note_F1=0.9677_pedal_F1=0.9186.pth`, as
  in `../trans`.
- ffmpeg 6.1.1, FluidSynth 2.3.4 with `FluidR3_GM.sf2` of the Ubuntu
  package fluid-soundfont-gm 3.1.

## Limits

- One recording, and of Simonton's copy none: its YouTube transfer
  could not be downloaded either.
- The released checkpoint is not the one behind the paper's SMD
  figures, and the paper's HPT baseline is not released.
- The renderings use FluidR3_GM rather than the "Full Grand
  Piano.sf2" of `../trans/validation`, and the damper Kong heard rather
  than the roll's, since `../emu/versions.json` is not archived.
- The model was trained on a Yamaha Disklavier, like the transcribers.

## References

- Zhanhong He, Roberto Togneri and Defeng (David) Huang,
  "Score-Informed Transformer for Refining MIDI Velocity in Automatic
  Music Transcription", arXiv:2508.07757v2, submitted to SMC 2026.
- Qiuqiang Kong, Bochen Li, Xuchen Song, Yuan Wan and Yuxuan Wang,
  "High-Resolution Piano Transcription With Pedals by Regressing Onset
  and Offset Times", *IEEE/ACM Transactions on Audio, Speech, and
  Language Processing* 29 (2021), pp. 3707–3717.
- Yujia Yan and Zhiyao Duan, "Scoring Time Intervals Using
  Non-Hierarchical Transformer for Automatic Piano Transcription",
  *Proceedings of the 25th International Society for Music Information
  Retrieval Conference*, 2024.
- Meinard Müller, Verena Konz, Wolfgang Bogler and Vlora Arifi-Müller,
  "Saarland Music Data (SMD)", *Late-Breaking and Demo Session of the
  12th International Society for Music Information Retrieval
  Conference*, 2011.
