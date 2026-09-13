# Schmitz's copy of WM 225, compared by its dynamics

TACET's recording of Grünfeld's *Träumerei* in *The Welte Mignon
Mystery*, Vol. XXI (TACET 220, 2016), plays a red Welte roll 225 in a
copy by Hans-W. Schmitz. The copy itself is not accessible and the roll
it was made from is not known. This directory holds the scripts and the
derived data of a comparison of that recording with the versions of the
edition. The edition's beliefs about the copy cite these files.

The comparison asks which version's emulated dynamics explain the
loudness of the recorded notes. The note text and its timing are the
same in all red versions, so dynamics are the only evidence. On five
loudness estimators and under seven instrument settings of the
emulator, version C fits best. The readings B and C add to A are
present, the readings only A1 has are absent, and no passage departs
from C beyond what chance produces. Stanford-1's own layer B1, the
perforations C removes and the soft-pedal readings do not change the
loudness of the notes enough to be judged. Every number is in
`trans/report_data.json`.

## Sources

- **Recording.** The YouTube release of the track by Naxos of America,
  video `Myn21YML3P0`, Opus at about 140 kbit/s, converted with ffmpeg to
  a mono WAV at 44.1 kHz. The audio is not part of this directory.
- **Edition.** `edition.jsonld` of this repository at commit `ae3330a`,
  with uncommitted additions to the `readFrom` of two copies. The versions
  are those of `ae3330a`. SHA-256 of the file used:
  `e583a4cbaf687f4b56729d2e1bfad7fa60a10bcf8d6b2062529dc09455155cf6`.

## Layout and order of work

The scripts are archived as they ran on 13 September 2026, without
cleaning up. They resolve paths relative to the directory holding
`trans/` and `emu/`.

**Emulation** (`emu/`)
- `emulate.mjs` writes `versions.json`: notes, velocities and bellows
  curves of versions A, A1, B, B1 and C. At 20 MB it is not archived and
  can be regenerated.
- `emulator.mjs` is shared by the next three.
- `hybrids.mjs` writes `hybrids.json`: the 32 combinations of the
  layers A1, B, B1, C's additions and C's removals, and each version
  under each of the seven instrument settings.
- `scan.mjs` writes `scan.json`: the 109 passages of distinguishing
  readings that change the emulated dynamics, each switched against C.
- `perforations.mjs` writes `perforations.json`: every perforation with
  the versions that contain it.
- `extensionless.mjs` is an import hook that the built linked-rolls
  library needed at the time.

**Transcription** (`trans/`)
- `run_kong.py` writes `kong.json`, the transcription by Kong et al.
  (2021).
- The `transkun` command wrote a MIDI file, which `midi_to_notes.py`
  turned into `transkun_rec.json`.
- `transcribe.py` transcribed the synthetic renderings used in the
  validation.

**Alignment**
- `align.py` pairs every note symbol with a heard note and writes
  `matched.json` (Kong) and `matched_transkun.json` (Transkun).
- In `matched_transkun.json` the column `kong_velocity` holds
  Transkun's velocity; the name is inherited from the first run.
- `matched_refA_kong.json` and `matched_refA_transkun.json` repeat the
  alignment against version A instead of B. The note pairing and the
  time map are identical, since the alignment reads note timing only.

**Loudness per note**
- `nmf_loudness.py` writes `rec_nmf.json` from `rec_aligned.json`,
  after Ewert and Müller (2012), at the harmonic peak and at the attack.
- `transkun_loudness.json` holds Transkun's velocities by row.
- `composite.py` writes `rec_composite.json`, the mean of four
  standardised estimators.

**Analyses.** All reported numbers use the model with scale and offset
for each keyboard half, selected by `PER_HALF=1`.
- `analysis.py`: fit of each version with block bootstrap.
- `hybrid_analysis.py`: posterior probabilities of the layers.
- `cluster_analysis.py`: likelihood ratios per passage.
- `residual_runs.py`: runs of notes that no version explains.
- `pedal_test.py`: soft and sustain pedal.
- `compare_texts.py` with `emu/selected.json` and `emu/units3361.json`:
  the passage at 3360.8 mm taken apart.
- `mismatch_simulation.py` writes `mismatch_simulation.json`: known
  texts played on foreign instrument settings and velocity maps.
- `export_report.py` writes `report_data.json`.

**Validation** (`trans/validation/`)
- `emu/to_midi.py` and `emu/render_mismatch.py` wrote MIDI files of
  known texts, rendered with FluidSynth 2.5.3 and the soundfont
  "Full Grand Piano.sf2".
- The renderings were transcribed and aligned like the recording.
  Each comes out as the text it was rendered from, except B1, which
  comes out as B; the two differ audibly in one note only.

## Software

- Python 3.13.5 with numpy 2.2.6, scipy 1.16.1, librosa 0.11.0,
  soundfile 0.13.1, mido 1.3.3.
- piano_transcription_inference 0.0.6 with the checkpoint
  `note_F1=0.9677_pedal_F1=0.9186.pth`, and transkun 2.0.1 with its
  pretrained model 2.0. The environment held torch 2.10.0 when this
  directory was written. Kong's transcription ran before transkun was
  installed and probably with torch 2.11.0.
- Node 24.19.0. linked-rolls with `lib/` built on 12 September 2026
  from commit `d58de15` (0.23.0). welte-t100 at commit `29bbd84`; its
  next commit, `a805805`, changes only the T-98 instruments.

To run the emulation again, `emu/*.mjs` needs the paths to linked-rolls
and to `edition.jsonld` adjusted; they point to the author's machine.
The transcription scripts expect the audio at `yt/rec.wav`.

## Limits

- The evidence is one recording in lossy audio.
- The transcription models were trained on recordings of a Yamaha
  Disklavier, and the emulator's constants were fitted to the drawn
  expression lines of six other rolls.
- The statistical settings were chosen on this recording and have not
  been tried on another: bootstrap blocks of 24 notes, a detectability
  threshold of 2 for passages, a cubic term in pitch and a separate scale
  for each half.

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
