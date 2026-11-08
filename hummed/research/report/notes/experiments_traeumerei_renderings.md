# Experiments: Grünfeld's Träumerei melody rendered 24 ways (2026-10-24)

These notes record a hands-on experiment run in this session, complementing the literature notes in this folder. Everything below was measured or observed directly. No external sources are cited, except where a model or dataset is named. The scripts are in `traeumerei-humming/scripts/` of the welte-ads repository (branch `claude/ecstatic-davinci-hmt310`), and the audio is on the listening page published with the report.

## Takeaway

When a synthesiser is told exactly when each pitch should sound, timing and pitch are the easy part. Every system that accepts phoneme durations held Grünfeld's onsets to within one frame. Every system that accepts an f0 curve followed it to within about 4 cents. What decides whether the result sounds like a person humming is everything else:

- the timbre;
- the treatment of the hum phoneme;
- whether the model can sing the melody's range at all.

The melody's range proved the hardest limit for freely available neural voices. Of seven open voices tried, only VISinger2 trained on Oniku Kurumi sang the whole melody (C4–B♭5) at pitch.

## Material and method

**Source.**
- The MEI transcription and MPM reconstruction of Welte-Mignon roll 225 (Alfred Grünfeld plays Schumann's *Träumerei*, 1905), from https://welte225.org/mpm/ (`transcription.mei`, `performance.mpm`).
- These were rendered with espressivo 0.11, the TypeScript port of meico, giving 476 performed notes with millisecond onsets and offsets and velocities.
- A second render of the MPM, with `subNoteDynamics` switched on, sampled the dynamics map as a continuous curve.

**Melody.**
- The melody is staff 1, layer 1, taking the top note wherever that layer has a chord: 162 notes over 2:41, including the repeat of bars 1–8.
- Velocities run from 28 to 53. Converted with the MIDI DLS curve 40·log₁₀(v/127), that is about 10 dB in total. Most notes lie within about 4 dB, and the note-level standard deviation is about 1.6 dB.

**Shared voice model.** All versions share one set of decisions:

- *Note ends.* A note sounds until its key release or, while the sustain pedal is down (value ≥ 40 of 127), until the pedal release. It never extends past the next melody onset.
- *Breaths.* There are 15:
  - at the nine phrase starts;
  - wherever Grünfeld leaves a gap of at least 120 ms after a note of at least 0.5 s;
  - never directly after an upbeat, never before the final note, and at most one every 3 s.
- *Articulation.* Six repeated notes are re-articulated; every other join is legato.
- *Pitch contour.* This follows Saitou et al. (2007): their overshoot filter (ω = 0.0348 rad/ms, ζ = 0.5422) runs forwards and their preparation filter (ω = 0.0292 rad/ms, ζ = 0.6681) backwards over the note steps. The vibrato and fluctuation values below are design choices informed by the literature notes:
  - vibrato of 5.6 Hz, rising 10 % through the note, with ±20–35 cents of depth, starting 0.32 s into notes of 0.45 s or longer;
  - slow drift of 6 cents RMS;
  - fine fluctuation of 3 cents RMS;
  - a 35-cent upward scoop at the start of each phrase.
- *Loudness.* The MPM dynamics curve plus each note's own velocity offset (from metrical accentuation and arpeggio gradients) gives a velocity scale, which is converted to dB with the DLS curve.

**Deadpan control.** The same 162 notes at a single tempo (Grünfeld's mean, so the total length is identical) and a single velocity (his median).

**Mastering.** All files are level-normalised (−23 dBFS RMS over the voiced part) and played through the same synthetic hall (RT60 1.1 s, wet −16 dB).

**Dynamics transplant.** This applies to systems with no loudness input (DiffSinger, ESPnet, Sinsy) and to the physical models, whose loudness depends on pitch. Each note's level (the 80th percentile of a 40 ms RMS envelope over the middle of the note) is moved to the MPM target. Steps are crossfaded over 40 ms, with at most 18 dB of cut and 9 dB of boost.

**Measurement.** WORLD Harvest pitch tracking (5 ms) on the dry files, giving three figures per version:

| Figure | How it is measured |
|---|---|
| Pitch error | Median deviation of the f0 in the middle of each note (30–85 % of its length) from the target |
| Arrival | First time the f0 stays within 60 cents of a new pitch for 40 ms, relative to Grünfeld's onset. Only notes reached by a leap of at least a whole tone or after a breath. |
| Dynamics r | Correlation of each note's level with the dB value its velocity asks for |

## Results

| Version | Family | Transposed | Timing | Pitch | Median pitch error (cents) | Notes within 50 cents | Pitch arrival after onset (median, IQR) | Dynamics r |
|---|---|---|---|---|---|---|---|---|
| Melody only (piano) | Reference | — | Grünfeld | written | 5.4 | 100 % | — | — |
| Sine tones, literal roll data | Reference | — | Grünfeld | written | 1.7 | 100 % | — | 1.00 |
| Sine tones, deadpan score | Reference | — | deadpan | written | 1.7 | 100 % | — | — |
| Additive hum, deadpan score | Signal processing | — | deadpan | shared contour | 3.6 | 100 % | +15 ms (16) | — |
| Additive hum "mmm" | Signal processing | — | Grünfeld | shared contour | 3.8 | 100 % | +14 ms (15) | 0.94 |
| Glottal source + nasal tract "mmm" | Signal processing | — | Grünfeld | shared contour | 3.9 | 100 % | +14 ms (14) | 0.90 |
| Glottal source + vowel tract "ooh" | Signal processing | — | Grünfeld | shared contour | 3.9 | 100 % | +14 ms (15) | 0.89 |
| VocalTractLab hum (male, 8vb) | Articulatory | -12 | Grünfeld | shared contour | 4.5 | 99 % | +16 ms (13) | 0.94 |
| VocalTractLab "ooh" (male, 8vb) | Articulatory | -12 | Grünfeld | shared contour | 4.5 | 100 % | +16 ms (12) | 0.95 |
| Pink Trombone hum | Articulatory | — | Grünfeld | shared contour | 4.3 | 100 % | +14 ms (14) | 0.89 |
| Pink Trombone "ooh" | Articulatory | — | Grünfeld | shared contour | 3.9 | 100 % | +15 ms (14) | 0.68 |
| DiffSinger, our pitch curve (minor sixth lower) | Neural singing synthesis | -8 | Grünfeld | shared contour | 3.8 | 100 % | +15 ms (14) | 0.85 |
| DiffSinger, deadpan score | Neural singing synthesis | -8 | deadpan | shared contour | 3.8 | 100 % | +16 ms (14) | — |
| VISinger2 (Oniku Kurumi) | Neural singing synthesis | — | Grünfeld | model's own | 8.2 | 90 % | +35 ms (31) | 0.94 |
| DiffSinger at the written pitch | Where the models break | — | Grünfeld | shared contour | 4.0 | 100 % | +15 ms (15) | 0.49 |
| VISinger (Kiritan) at the written pitch | Where the models break | — | Grünfeld | model's own | 63.6 | 41 % | +111 ms (138) | 0.94 |
| VISinger2 (Ofuton P, male, 8vb) | Where the models break | -12 | Grünfeld | model's own | 14.7 | 65 % | +48 ms (27) | 0.94 |
| Sinsy (HMM), "moo" vocalise | Pre-neural singing synthesis | — | Grünfeld | model's own | 93.7 | 33 % | +29 ms (45) | 0.21 |
| DDSP violin, same curves | Neural instrument (DDSP) | — | Grünfeld | shared contour | 4.4 | 100 % | +46 ms (91) | 0.41 |
| DDSP flute, same curves | Neural instrument (DDSP) | — | Grünfeld | shared contour | 4.4 | 97 % | +100 ms (94) | 0.71 |

Other renderings had no per-note measurement:
- The whole roll on piano.
- Two mixes of a hum with Grünfeld's own accompaniment: DiffSinger and glottal-source hum, each over the roll's other 314 notes.

## Observations, by system

**Timing.**
- Systems that accept phoneme durations reproduce Grünfeld's onsets to within one frame: DiffSinger (11.6 ms frames), ESPnet (12.5 ms at 24 kHz, 11.6 ms at 44.1 kHz) and the DSP and articulatory renderers.
- This required cumulative rounding of phoneme boundaries. ESPnet's preprocessor rounds each phoneme separately, which would drift over 300 phonemes.
- The shared contour settles on new pitches a median 14–16 ms after the onset, by design of the transition filters.
- VISinger2-Kurumi's own transitions settle 35 ms after the onset (Ofuton 48 ms). This is comparable to the 3–50 ms by which Lieder singers' vowel onsets lag the piano, a figure in the literature notes.

**Pitch, when the model takes our curve.**
- DiffSinger's acoustic model takes an f0 curve and its NSF-HiFiGAN vocoder re-imposes it. It follows our contour within 4 cents; so does DDSP.
- The metric cannot see timbre failures. DiffSinger at the written pitch scores 100 % in tune although its mel output collapses to noise above about E5: the vocoder still imposes the periodicity. Only the level data reveal it (dynamics r 0.49; individual high notes 15–30 dB down).

**Pitch, when the model predicts it.** The ESPnet VISinger family regresses towards each singer's training range:
- Kiritan (VISinger) sings F5 and A5 as roughly A4–C5, a fourth to a sixth low.
- Ofuton P (male, an octave down) sings several top notes an octave low.
- Four of the 30 ACESinger voices (VISinger2, 44.1 kHz, trained on synthesised ACE Studio data) were scanned: all sang the F5s 2.5–6.6 semitones flat.
- Only Oniku Kurumi handled the range: median error 8 cents, 90 % of notes within 50 cents, though with little vibrato.

**Sinsy (HMM, NIT SONG070 F001, 2013).**
- The pitch range is compressed towards the voice's centre: low notes up to a semitone sharp, high notes flat and capped near C♯5. Transposed down a ninth, the low notes became nearly unvoiced.
- ん comes out almost silent, and is not voiced at all when it begins a phrase (it never begins a Japanese word), so this version uses む/う.
- The HMM uses its own duration model, so onsets deviate (median arrival +29 ms, IQR 45 ms).

**The hum phoneme.**
- The Japanese moraic nasal ん (phoneme N) worked in DiffSinger and VISinger.
- DiffSinger lets phrase-final ん notes fade early, ahead of the breath token (AP).
- With DiffSinger a repeated ん–ん on one pitch needed an explicit two-frame silence to be re-articulated.
- The Mandarin models have no closed-mouth syllable; 嗯 (en) is the nearest.

**Dynamics.**
- None of the open neural singers has a loudness input. Their own note-to-note level variation (DiffSinger: standard deviation 9.2 dB) dwarfs Grünfeld's (about 1.6 dB), so the MPM dynamics had to be transplanted afterwards.
- The physical models' loudness depends on pitch through tract resonances:
  - Pink Trombone "ooh": r = 0.15 before levelling, 0.68 after.
  - VocalTractLab "ooh": r = 0.30 before, 0.95 after.
- DDSP's loudness input must be mapped into each model's training distribution. With the violin's centring, the flute stayed silent, because the flute data are about 10 dB quieter.

**DDSP.**
- Rendering 160 s in one pass ran out of memory for one model.
- The pass that succeeded drifted up to 1.5 semitones late in the piece, apparently from float32 phase accumulation over 2.6 M samples.
- Overlapping 10 s windows with 2 s crossfades fixed both.
- Only instrument checkpoints exist (violin, flute, trumpet, saxophone).

**Seed-VC** (zero-shot singing voice conversion, f0-conditioned 44 kHz model, GPL-3.0).
- Source: the glottal-source hum. Reference: vocadito track 17, singer S12, "la la" (CC BY 4.0).
- On 4 CPU cores one diffusion step took about 40 s per 12 s of audio (real-time factor 44 on the final run). Only bars 1–8 (40 s) were converted, at 15 steps.
- Result on bars 1–8: median pitch error 5.3 cents, pitch arrival +24 ms (IQR 13). The long A5 of bar 7 came out an octave low (the metric forgives octave errors). The source's loudness contour was not kept (dynamics r = −0.03), so note levels were transplanted afterwards (r = 0.82).

**Articulatory models.**
- VocalTractLab 2.4's glottis model stops at 600 Hz, so it sang an octave lower. Its predefined shapes give the hum (labial closure, velum open 0.25 cm²) and [u].
- Its nasal output has a strong band near 2.8 kHz.
- Rendering took about 32 s per 13 s of audio.
- Pink Trombone (MIT) ran offline in Node in 7 s for the whole piece.
- Neither model was driven by learned (e.g. RL) control: the articulatory targets were set by hand, and only the glottal f0 and loudness followed our curves.

**Compute (4 CPU cores, no GPU).**

| Renderer | Time for the 2:43 piece |
|---|---|
| DSP versions | 1–15 s each |
| DiffSinger (ONNX, 10-step diffusion) | 10–15 min |
| ESPnet VISinger2 | 4–8 min |
| DDSP | about 2 min |
| Sinsy | 14 s |

## Inferences

- For a musicologist who wants a hummed sonification with exact timing and dynamics, the most controllable routes today are:
  - a formant or articulatory synthesiser (exact, but audibly synthetic);
  - DiffSinger with one's own f0 curve plus a dynamics transplant (natural timbre within the voicebank's range);
  - two-stage synthesis-then-voice-conversion, if GPU time is available.
- A commercial editor (Synthesizer V Studio 2, ACE Studio) would add loudness and tension curves and wider-range voices. It was not tested here.
- The bottleneck for "perfect imitation" is not control but the voice model's coverage: range, sustained nasal timbre, breath and phrase-end behaviour.

## Gaps

- No listening test (MOS) was run; the figures measure fidelity to the input, not naturalness.
- Commercial systems were not tested.
- The f0 metric cannot detect timbral collapse (see DiffSinger at the written pitch).
- Seed-VC covered bars 1–8 only.
