# f0/loudness-driven voice & humming synthesis: DDSP family, source-filter vocoders, singing voice conversion, RL & articulatory synthesis (state as of 2026-10-24)

Scope note: I cover systems that take an explicit pitch curve (f0 or MIDI) plus a loudness curve or energy, not score+lyrics SVS. Repo facts (licences, last-commit dates, README text) come from shallow clones of the GitHub default branches made on 2026-10-24. "Last commit" means the date of the HEAD commit at that time. Paper facts are dated by the paper's publication date.

---

## 1. DDSP (Engel et al. 2020) and its singing/voice descendants: inputs, quality, weights, licences

### Takeaway
Of everything here, original DDSP is the closest fit to "f0 + loudness → audio". Its decoder is conditioned exactly on f0 and loudness at a 4 ms frame rate. It has been trained on singing (Alonso & Erkut 2021) and gives recognisable "song-like" voice output, but **no pretrained voice or humming DDSP checkpoint is distributed by Magenta**. The singing-vocoder descendants (SawSing 2022, GOLF 2023) are **mel-spectrogram-driven vocoders**, not f0+loudness synths. They predict f0 internally. They are tiny (about 0.5–0.7M parameters) and very fast on CPU, but on 3 h of data their MOS is only around 2–3/5. DDSP-SVC (MIT, actively developed in Oct 2026) is the most practical open DDSP descendant. Its model is explicitly `forward(units, f0, volume, spk_id…)`, so it takes f0 *and* a volume curve, plus content units.

### Cited Findings
**DDSP core (ICLR 2020; library still maintained)**
- The DDSP paper (arXiv Jan 2020) claims "independent control of pitch and loudness", extrapolation to pitches not seen in training, and timbre transformation "between disparate sources", all without large autoregressive models or adversarial losses — [arXiv 2001.04643](https://arxiv.org/abs/2001.04643)
- DDSP synthesis parameters run at a 4 ms frame (16 kHz audio, 64 samples/frame = 250 frames/s): 127 parameters per frame (60 harmonic amplitudes, 65 noise-filter magnitudes, f0, amplitude). This is as used in MIDI-DDSP (ICLR 2022) — [MIDI-DDSP paper](https://arxiv.org/html/2112.09312)
- magenta/ddsp is **Apache-2.0** (Copyright 2019 Google), with the latest commit on 2026-10-19. The README's timbre-transfer demo is "turning your voice into a violin…" (voice → instrument, not instrument → voice). The README does not list a pretrained voice model — [magenta/ddsp](https://github.com/magenta/ddsp)
- The DDSP-VST page says you can train a custom model with "as little as a couple minutes of audio" via a free web trainer, and play it from MIDI like a virtual instrument. The page names no voice/vocal model — [Magenta DDSP-VST](https://magenta.withgoogle.com/ddsp-vst)

**DDSP singing (Alonso & Erkut, arXiv Mar 2021)**
- The DDSP model was trained on "small datasets of unprocessed audio" for about 12 hours, conditioned **only on pitch (f0) and amplitude (loudness)**. It produced "song-like utterances" in which melody and singer are recognisable. Using DDSP's optional latent z improved singer identification and lyric comprehension. Zero-config training notebooks are on GitHub (juanalonso/DDSP-singing-experiments). This is a preprint and does not appear to be peer-reviewed. No MOS was given on the abstract page — [arXiv 2103.07197](https://arxiv.org/abs/2103.07197)

**SawSing / DDSP singing vocoders (Wu et al., ISMIR 2022)**
- **Input is an 80-band mel-spectrogram** (24 kHz, hop 240 = 10 ms). The f0 training target comes from WORLD, and at inference the network predicts f0 from the mel. Data: MPop600, two singers, ~3 h each — [SawSing paper HTML](https://arxiv.org/html/2208.04756v2)
- Model sizes and GPU RTF (RTX 3090): SawSing 0.5M params, RTF 0.003; DDSP-Add 0.5M, 0.003; NSF 1.2M, 0.006; HiFi-GAN 13.9M, 0.004; FastDiff 15.3M, 0.017. FAD (female singer, regular data): SawSing 0.12, NSF 0.49, HiFi-GAN 0.59, DDSP-Add 0.56. SawSing's f0 MAE was 30–32 cents with full data and 76–80 cents with limited data — [SawSing paper HTML](https://arxiv.org/html/2208.04756v2)
- **MOS was low across the board.** In the regular scenario most systems scored 2–3/5. In the resource-limited (3-recording) scenario DDSP-Add and SawSing scored above 2 while HiFi-GAN scored about 1. Listener panels were 23 (female singer) and 18 (male singer) — [SawSing paper HTML](https://arxiv.org/html/2208.04756v2)
- Artifacts: SawSing has audible "buzzing" on breathy sounds and unvoiced consonants (/s/, /t/), which V/UV-gating reduces. PWG and HiFi-GAN show phase-discontinuity "glitch"/"voice tremor" — [SawSing paper HTML](https://arxiv.org/html/2208.04756v2)
- YatingMusic/ddsp-singing-vocoders is **AGPL-3.0**; last commit 2022-08-28. Inference runs "from existed mel-spectrograms" — [GitHub](https://github.com/YatingMusic/ddsp-singing-vocoders)

**GOLF – GlOttal-flow LPC Filter (Yu & Fazekas, ISMIR 2023; follow-up Interspeech 2024)**
- The harmonic source is a wavetable of **transformed-LF glottal-flow pulses**, and the vocal tract is a frame-wise all-pole (LPC/IIR) filter, plus filtered noise. **Input is a log-mel (24 kHz, hop 120 = 5 ms)**. The encoder (about 0.7M params) predicts f0, voicing, gains and filter coefficients, and the authors found a 200 Hz frame rate sufficient. Data: MPop600, ~3 h per singer — [GOLF paper PDF](https://arxiv.org/pdf/2306.17252)
- Speed and memory (i5-4790K CPU / RTX 3070): GOLF needs 2.6 GB of VRAM to train versus 7.3 GB for DDSP. **CPU RTF is 0.023 for GOLF versus 0.237 for DDSP** and 0.240 for SawSing. GPU RTF is 0.009 versus 0.015 — [GOLF paper PDF](https://arxiv.org/pdf/2306.17252)
- MOS (33 listeners, 0–100 scale normalised to 1–5): **DDSP scored highest**, and was not significantly different from the f1 ground truth (p=0.168). GOLF significantly beat SawSing (p<0.0001). Pulse-train and glottal variants showed fast noise-gain fluctuation, an amplitude-modulation artifact that is worse for higher-f0 (female) voices — [GOLF paper PDF](https://arxiv.org/pdf/2306.17252)
- The paper says trained checkpoints, code and samples are released. yoyololicon/golf is **MIT**, last commit 2024-11-14, and also implements DDSP, NHV, ∇WORLD and MLSA decoders for comparison — [GOLF paper PDF](https://arxiv.org/pdf/2306.17252); [GitHub golf](https://github.com/yoyololicon/golf)

**DDSP-SVC (yxlllc; no paper; MIT)**
- **MIT** licence; last commit 2026-10-04. The current version is DDSP plus a rectified-flow enhancer, and earlier versions used a vocoder enhancer and then shallow diffusion. The README claims quality "no less than SOVITS-SVC and RVC" for some datasets, with much lower hardware needs. The default config trains 44.1 kHz on an RTX 4060, and a real-time GUI is included — [DDSP-SVC README](https://github.com/yxlllc/DDSP-SVC)
- Code: `forward(self, units, f0, volume, spk_id=None, spk_mix_dict=None, …)`, so **f0 and a volume (loudness) envelope are explicit inputs** alongside ContentVec/HuBERT units. The default f0 range is 50–1100 Hz. Output passes through an NSF-HiFiGAN vocoder `infer(mel, f0)` — [DDSP-SVC reflow/vocoder.py & main_reflow.py](https://github.com/yxlllc/DDSP-SVC)
- Pretrained components it depends on: ContentVec, OpenVPI **pc-nsf-hifigan (CC BY-NC-SA 4.0)**, and RMVPE. A per-target-voice model must be trained (~1000 clips of at least 2 s recommended). It supports multi-speaker timbre mixing (`-mix "{1:0.5, 2:0.5}"`) — [DDSP-SVC README](https://github.com/yxlllc/DDSP-SVC)

**NeuralSVB (ACL 2022)**
- NeuralSVB is a "singing voice beautifier" for amateur singing → improved singing. It is not text-driven but uses ASR-derived PPGs. The PopBuTFy dataset requires registration. **GPL-3.0**; last commit 2024-01-02. It is not a DDSP/f0+loudness synthesiser in the sense needed here — [NeuralSVB README](https://github.com/MoonInTheRiver/NeuralSVB)

### Inferences
- For "hum this f0 at this loudness", vanilla DDSP (harmonic + filtered noise, conditioned on f0 + loudness) is architecturally ideal. A closed-mouth hum has nearly stationary spectral envelope and little phonetic content, which is exactly where Alonso & Erkut's f0+loudness-only singing model was weakest on lyrics but adequate on timbre. Training a DDSP autoencoder on a few minutes to hours of one person's humming (Apache-2.0 code) is the most direct route. The quality ceiling is probably MOS ~3 ("clearly synthetic but voice-like"), extrapolating from the SawSing/GOLF MOS results on similar data sizes.
- SawSing and GOLF expose f0 among their synthesis parameters, so one could in principle replace the predicted f0 with a target f0 curve. That would be a code modification, since the released inference APIs take mel only.
- GOLF's ~0.02 CPU RTF and its glottal-source parameterisation (the Rd parameter relates to vocal effort) make it attractive for a CPU-only, physically interpretable hum synth. Quality is still below DDSP in its own listening test.

### Gaps
- I found no MOS for humming specifically from any DDSP model, and no public pretrained DDSP *voice* checkpoint (Magenta, DDSP-VST, or Alonso's repo weights were not verified).
- I could not verify the list of DDSP-VST built-in instruments or whether it contains a vocal model; the page fetched names none.
- I did not find a DDSP-SVC paper or a published MOS/f0-accuracy evaluation. Its quality claim is self-reported in the README.

---

## 2. MIDI-DDSP (Wu et al., ICLR 2022): hierarchy, instruments, vibrato/dynamics, availability, retrainability

### Takeaway
MIDI-DDSP maps notes → 6 note-level expression controls → DDSP synthesis parameters (250 frames/s) → audio. It ships pretrained only for **13 URMP orchestral instruments (no voice)**. The pip package (`midi-ddsp`, TF 2.7, Python 3.8) and code are Apache-2.0 but **unmaintained since Nov 2022**. Its training code officially supports only URMP, so retraining on humming would need dataset-pipeline work plus a monophonic, note-annotated humming corpus.

### Cited Findings
- There are three separately trained modules: DDSP Inference, Synthesis Generator and Expression Generator. Synthesis parameters use a 4 ms frame (250 fps) — [MIDI-DDSP paper](https://arxiv.org/html/2112.09312)
- The six note-expression controls (normalised 0–1) are volume, volume fluctuation, volume peak position, **vibrato** (DFT peak of f0 within a note, counted only if 3–9 Hz and the note is longer than 200 ms), brightness, and attack noise (first ~40 ms). Dynamics (crescendo/decrescendo) come from volume, fluctuation and peak position — [MIDI-DDSP paper](https://arxiv.org/html/2112.09312)
- Dataset: URMP, 3.75 h, 13 instruments (violin, viola, cello, double bass, flute, oboe, clarinet, saxophone, bassoon, trumpet, horn, trombone, tuba). There is no voice model — [MIDI-DDSP paper](https://arxiv.org/html/2112.09312); [README](https://github.com/magenta/midi-ddsp)
- Listening test (violin realism, 960 ratings): MIDI-DDSP beat Ableton 59–5, FluidSynth 55–9 and MIDI2Params 56–8. Ground truth still beat MIDI-DDSP 44–20 (p=0.00018). Control correlation: volume r=.97, brightness .92, attack noise .93, vibrato .70, volume peak position .57 — [MIDI-DDSP paper](https://arxiv.org/html/2112.09312)
- `pip install midi-ddsp` (Python 3.8, TF 2.7) gives a command-line `midi_ddsp_synthesize --midi_path …` with downloadable weights. The README says "The current codebase does not support training with arbitrary dataset" and that training takes about 18 h on one RTX 8000 (24 GB+ recommended). It cannot be installed on M1 Macs. **Apache-2.0**; last commit 2022-11-29 — [magenta/midi-ddsp README](https://github.com/magenta/midi-ddsp)

### Inferences
- MIDI-DDSP's expression layer (vibrato depth, volume shape, attack noise) is exactly the "MIDI → realistic f0/loudness curves" stage a humming synth needs. Even without a voice model, one could reuse its Expression/Synthesis Generator idea, or feed its generated f0/loudness curves into a separately trained voice DDSP or DDSP-SVC model.
- Retraining on humming is plausible in principle: the model is monophonic, and humming is monophonic with stable timbre. In practice it means porting TF 2.7 code and building note-aligned humming data. HumTrans-style humming datasets exist, but I did not verify their licences.

### Gaps
- I found no published or community MIDI-DDSP model trained on voice/singing/humming.
- I have no figures for CPU inference speed of MIDI-DDSP.

---

## 3. Neural source-filter vocoders that take f0 explicitly (NSF, NSF-HiFiGAN, OpenVPI pc-nsf-hifigan, SiFi-GAN)

### Takeaway
These vocoders take a **mel (or cepstral) envelope plus an explicit f0 curve**. The f0 drives a sine/pulse excitation, so the output pitch follows the supplied f0 closely. They do not invent timbre: you still need an envelope (mel) from somewhere. OpenVPI's **pc-nsf-hifigan (Feb 2025)** is trained specifically so that f0 can be shifted ±12 semitones away from the mel's pitch while preserving formants (range ~E2–D#7). That makes it the best open candidate for "arbitrary f0 + a hum-like envelope → hum". Its weights are **CC BY-NC-SA 4.0 (non-commercial)**.

### Cited Findings
- The NSF waveform model (Wang, Takaki, Yamagishi; arXiv 2019, TASLP) uses a sine-based source module whose excitation is filtered by a non-autoregressive dilated-conv filter. It is "at least 100 times faster than WaveNet", with quality "better than or equally good as" WaveNet — [arXiv 1904.12088](https://arxiv.org/abs/1904.12088)
- OpenVPI vocoder releases, all 44.1 kHz with hop 512 (≈11.6 ms), 128 mel bins, window 2048 and 40–16000 Hz mel:
  - NSF-HiFiGAN v1 (2022-12-11): ~93 h of data, more than 1M steps.
  - Finetuned NSF-HiFiGAN (2024-02-19): range up to C6.
  - **PC-NSF-HiFiGAN (2025-02-27)**: ~79 h, MiniNSF source; pitch shifting −12 to +12 semitones with formants preserved; typical range E2–D#7, and "may shrink with pitch shifting".
  
  "Pretrained models are released under the Attribution-NonCommercial-ShareAlike 4.0 International" licence — [openvpi/vocoders releases](https://github.com/openvpi/vocoders/releases)
- The openvpi/vocoders repo code is **AGPL-3.0** (last commit 2025-02-28). openvpi/SingingVocoders, the training/fine-tuning code ("mini_nsf and pc_aug enabled by default"; 24 GB GPU default config), is **MIT** (last commit 2026-03-08) — [openvpi/vocoders](https://github.com/openvpi/vocoders); [openvpi/SingingVocoders](https://github.com/openvpi/SingingVocoders)
- These OpenVPI NSF-HiFiGAN checkpoints are reused as vocoders by DDSP-SVC and so-vits-svc (shallow diffusion / enhancer) — [DDSP-SVC README](https://github.com/yxlllc/DDSP-SVC); [so-vits-svc README](https://github.com/svc-develop-team/so-vits-svc)
- **SiFi-GAN** (Yoneyama et al., ICASSP 2023):
  - Inputs: a sine excitation from continuous F0, plus WORLD mel-cepstrum and aperiodicity at a 5 ms shift.
  - Data: Namine Ritsu singing database, 110 songs, ~4.35 h, 24 kHz.
  - F0×0.5: SiFi-GAN MOS 3.29 vs hn-uSFGAN 2.97 and WORLD 2.63. F0×2.0: hn-uSFGAN 3.23 vs SiFi-GAN 3.05 vs HiFi-GAN+Sine 2.69. Ground truth was 3.99.
  - CPU RTF on an AMD EPYC 7542: SiFi-GAN 0.74, HiFi-GAN 0.84, hn-uSFGAN 3.97.
  
  [SiFi-GAN paper HTML](https://arxiv.org/html/2210.15533v3)
- chomeyama/SiFiGAN is **MIT**; last commit 2023-07-30. Its example recipe is Namine Ritsu (NNSVS-based features) — [GitHub SiFiGAN](https://github.com/chomeyama/SiFiGAN)
- In the SawSing benchmark, NSF had 1.2M params and GPU RTF 0.006, and beat HiFi-GAN in MOS under limited data — [SawSing paper HTML](https://arxiv.org/html/2208.04756v2)

### Inferences
- **Can they be driven with an arbitrary f0 to produce a hum?** Yes for pitch: these models are built so that the output periodicity follows the supplied f0. For timbre and loudness they need a mel/cepstral envelope matching "closed-mouth /m/ hum at this loudness". A practical hack is to take mel frames from a real recorded hum (or the mel of a DDSP/GOLF hum), time-stretch or tile them to the target duration, offset log-mel energy to follow the loudness curve, and feed the target f0. pc-nsf-hifigan tolerates f0 that differs from the mel's pitch by up to an octave. The result would likely be static and "vocoded" without envelope dynamics. This is untested inference, not a published result.
- Timing resolution: f0 and mel frames are 11.6 ms (OpenVPI) or 5 ms (SiFi-GAN). The excitation is generated sample-wise from an upsampled f0, so note onsets are quantised to about one frame, and attacks are smeared over a frame or two.
- All of these run on CPU near real-time (SiFi-GAN RTF 0.74 on one CPU; NSF/HiFi-GAN-size models are similar). For offline rendering CPU is fine.

### Gaps
- I did not find any published test of NSF-type vocoders on humming or on tiled/static mels.
- NSF MOS numbers were not retrieved (only the abstract was read).

---

## 4. Singing voice conversion (SVC) as a route: render exact f0/loudness synthetically, then convert to human timbre

### Takeaway
Frame-synchronous SVC systems (RVC, so-vits-svc, DDSP-SVC, Diff-/Diffusion-SVC, Seed-VC with `--f0-condition True`, `--length-adjust 1.0`) preserve the source's timing frame by frame (≈10–12 ms) and re-impose an f0 curve taken from the source. Measured F0 correlation after conversion is about 0.94 (Seed-VC 0.9375, RVCv2 0.9404, F0 RMSE ~30–33) on M4Singer. So a synthetic hum with exact f0/loudness can, in principle, be re-voiced into a human timbre while keeping its melody. **Token-based zero-shot systems (Vevo/Vevo2) do not preserve exact f0 or ms timing.** Vevo2's prosody tokens are octave-free chromagram codes at 6.25 Hz, and its humming-to-singing FPC is only ~0.78. Licences differ widely:
- Code: RVC and DDSP-SVC are MIT; Seed-VC is GPL-3.0; so-vits-svc is AGPL-3.0 with "academic purposes" terms.
- Weights: Vevo/Vevo2 are CC BY-NC(-ND); the OpenVPI vocoder is CC BY-NC-SA.

The 2023 open-source voice-changer wave has largely stalled. so-vits-svc is unmaintained (last commit Oct 2023) and so-vits-svc-fork is explicitly "No Longer Maintained".

### Cited Findings
**Quality evidence, field level**
- SVCC 2023: 26 submissions. "Human-level naturalness was achieved by the top system", but no team reached target-speaker similarity, and cross-domain conversion was harder — [SVCC 2023 overview, arXiv 2306.14422](https://arxiv.org/html/2306.14422v2)
- A later analysis puts the SVCC 2023 top system at about 3.9 naturalness, matching ground truth, and about 65% similarity versus about 80% for ground truth — [SVCC 2025 analysis, arXiv 2509.15629](https://arxiv.org/pdf/2509.15629) (figures as summarised by search results; the table was not inspected directly)

**Seed-VC (Plachtaa; arXiv Nov 2024)**
- Zero-shot VC and SVC from a 1–30 s reference. The SVC model (v1.0 `seed-uvit-whisper-base`, 44.1 kHz) is a DiT with a Whisper content encoder and **explicit f0 conditioning** (`--f0-condition True`), plus `--semi-tone-shift`; 30–50 diffusion steps are recommended for singing. Real-time VC has about 430 ms latency on an RTX 3060 laptop, and a GPU is "strongly recommended". A v2.0 model adds an `--anonymization-only` mode that converts to an "average voice" — [Seed-VC README](https://github.com/Plachtaa/seed-vc)
- M4Singer zero-shot SVC eval (README EVAL.md):

  | System | F0CORR | F0RMSE | SECS | CER | DNSMOS OVRL |
  |---|---|---|---|---|---|
  | Seed-VC | 0.9375 | 33.35 | 0.7405 | 19.70 | 3.06 |
  | RVCv2-f0-48k (trained per character) | 0.9404 | 30.43 | 0.7264 | 28.46 | 3.12 |

  Soprano sources were worst: Seed-VC F0RMSE was 64.0 versus 47.8 for RVC. F0RMSE units are not stated in the README — [Seed-VC EVAL.md](https://github.com/Plachtaa/seed-vc/blob/main/EVAL.md)
- Code is **GPL-3.0**; last commit 2025-04-20, so it is in effect dormant as of Oct 2026 — [Seed-VC repo](https://github.com/Plachtaa/seed-vc)

**RVC (Retrieval-based Voice Conversion WebUI)**
- Code is **MIT**; last commit 2026-08-04. The Hugging Face repo hosting the base assets (lj1995/VoiceConversionWebUI, e.g. hubert_base.pt, also used by so-vits-svc) is tagged **MIT**, with an empty model card — [RVC repo](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI); [HF lj1995/VoiceConversionWebUI](https://huggingface.co/lj1995/VoiceConversionWebUI)
- The so-vits-svc-fork README recommends Applio (MIT, "actively maintained") as the maintained RVC-family front-end — [so-vits-svc-fork README](https://github.com/voicepaw/so-vits-svc-fork)

**so-vits-svc and so-vits-svc-fork**
- svc-develop-team/so-vits-svc is **AGPL-3.0**; last commit 2023-10-03.
  - Pipeline: ContentVec/SoftVC content features go directly into VITS without a text intermediate, so "the pitch and intonations of the original audio" are kept. Optional shallow diffusion uses the Diffusion-SVC/DDSP-SVC-compatible diffusion model, and the vocoder is OpenVPI NSF-HiFiGAN.
  - The Terms of Use say: "exclusively established for academic purposes… not intended for deployment in production". Videos must credit the input source. Users must respect commercial vocal synths' terms, since many "explicitly state that they cannot be used to convert input sources".
  
  [so-vits-svc README](https://github.com/svc-develop-team/so-vits-svc)
- voicepaw/so-vits-svc-fork is **MIT**, with a README headed "No Longer Maintained". It says "The voice changer boom that occurred in 2023 has come to an end", and that CPU inference "is fast enough" — [so-vits-svc-fork README](https://github.com/voicepaw/so-vits-svc-fork)

**Diff-SVC / Diffusion-SVC**
- prophesier/diff-svc is **AGPL-3.0**; its README changelog ends in Dec 2022. CNChTu/Diffusion-SVC is **MIT** (last commit 2026-01-20) and supplies the diffusion model shared with so-vits-svc/DDSP-SVC — [diff-svc](https://github.com/prophesier/diff-svc); [Diffusion-SVC](https://github.com/CNChTu/Diffusion-SVC); [so-vits-svc README](https://github.com/svc-develop-team/so-vits-svc)

**Amphion: Vevo (ICLR 2025) and Vevo2 (arXiv Aug 2025)**
- Vevo HF model card: **CC BY-NC 4.0**. Its released models (Vevo-Timbre, -Style, -Voice, -TTS) are speech-oriented, with no SVC listed and no F0 input mentioned — [HF amphion/Vevo](https://huggingface.co/amphion/Vevo)
- Vevo2 architecture:
  - An AR content-style model (509M, initialised from Qwen2.5-0.5B), a flow-matching acoustic model (363M) and a Vocos-type vocoder (255M).
  - The prosody tokenizer (38M) quantises **50 Hz chromagram features → 6.25 Hz tokens, which are "octave-free"**.
  - Pre-training used 101k h of Emilia speech plus ~7k h of source-separated singing.
  
  [Vevo2 paper](https://arxiv.org/html/2508.16332v2)
- Vevo2 humming-to-singing (prosody from a hum; text and timbre from prompts): FPC 0.769 → **0.784** with the prosody reward. Instrument-to-singing FPC is 0.745. SVC FPC is 0.782–0.846, or 0.826–0.878 for the FM-only variant. The SVC Melody-MOS is 2.24–2.38 on a 1–3 scale — [Vevo2 paper](https://arxiv.org/html/2508.16332v2)
- The Vevo2 HF card licence is **CC BY-NC-ND 4.0**. Listed tasks include SVC, singing style conversion, and humming-to-singing / instrument-to-singing. The card notes that SingNet-7k is internal data — [HF RMSnow/Vevo2](https://huggingface.co/RMSnow/Vevo2)

**YingMusic-SVC (arXiv Dec 2025)**
- Zero-shot SVC with a singing-trained RVC "timbre shifter", an "F0-aware timbre adaptor", rectified flow, and **Flow-GRPO RL** post-training. It reportedly beats open baselines, especially on accompanied or harmony-contaminated input. The abstract gives no numbers, and code/weights availability is not stated — [arXiv 2512.04793](https://arxiv.org/abs/2512.04793)

**FreeVC and NANSY++**
- OlaWod/FreeVC is **MIT**; last commit 2025-01-20. It is a VITS-based text-free VC with pretrained models on OneDrive, and its README mentions no f0/pitch conditioning or singing — [FreeVC README](https://github.com/OlaWod/FreeVC)
- NANSY++ (Choi et al., ICLR 2023) is a self-supervised analysis/synthesis backbone (its NANSY predecessor used "Yingram" pitch features) adapted to VC, TTS, SVS and voice design without paired annotation. I found no official code release — [ICLR 2023 page](https://iclr.cc/virtual/2023/poster/11803); [mlanthology](https://mlanthology.org/iclr/2023/choi2023iclr-nansy)

### Inferences
- **f0/timing faithfulness:**
  - Frame-synchronous systems carry source frames 1:1, so onsets are preserved to roughly one hop (~10 ms at 16 kHz/hop 160 in HuBERT-based systems; 11.6 ms for 44.1k/hop 512 vocoders).
  - Pitch is re-extracted from the source (RMVPE/FCPE/DIO) unless the user supplies their own f0. DDSP-SVC's model API takes the f0 array directly, so a score-derived f0 can bypass the extractor with a small script.
  - Residual f0 error (~30 RMSE, F0CORR ~0.94 measured on natural singing) is mostly extraction error and octave/voicing mistakes. A clean synthetic source with known f0 should do better, though this is unverified.
  - Vevo2-style AR token models resynthesise melody at the note level and are not suitable for "this exact f0 at this ms".
- **Loudness:** most SVC models carry loudness implicitly through content features and RMS-matching post-processing. DDSP-SVC is the exception, with an explicit `volume` input. Expect the source loudness contour to be followed approximately but not exactly.
- **Content-encoder risk:** HuBERT/ContentVec/Whisper features of a synthetic sine or sawtooth "hum" may decode to unstable or phonetically random content, producing mumbling artifacts. A source that already sounds like a nasal /m/ (a DDSP/GOLF/formant hum, or a VocalTractLab hum) is likely to convert more cleanly. The so-vits-svc terms explicitly anticipate synthetic-voice inputs ("a voice synthesized by another voice synthesis engine"), which shows that synthetic-source → SVC is an established community workflow.
- **Ethics and licensing for a product:**
  - Use your own or consented recordings to train a per-voice model (RVC, DDSP-SVC, so-vits-svc-fork), or a timbre mix (DDSP-SVC `-mix`) or anonymised "average voice" (Seed-VC v2 `--anonymization-only`) to avoid cloning an identifiable person.
  - Commercial use is blocked by CC BY-NC(-SA/-ND) weights (OpenVPI vocoders, Vevo/Vevo2). AGPL/GPL code (so-vits-svc, Seed-VC, diff-svc) imposes copyleft.
  - MIT options are RVC, DDSP-SVC, Diffusion-SVC, so-vits-svc-fork and FreeVC code. Even DDSP-SVC defaults to the CC BY-NC-SA pc-nsf-hifigan unless you train your own vocoder with MIT SingingVocoders code.

### Gaps
- Whether the current RVC WebUI still exposes an "F0 curve file" input to override extracted f0 (it existed historically) could not be verified: the current code tree was restructured and the file could not be located.
- The licence of Seed-VC's Hugging Face weights (Plachta/Seed-VC) and of the Amphion repository code were not checked.
- I found no published experiment converting a *synthetic* hum (sine, DDSP or formant) through SVC with measured f0/onset fidelity or MOS.
- Official SVCC 2023 per-team tables were not inspected directly.

---

## 5. RL and articulatory (vocal-tract) / formant synthesis: what is achieved vs. speculative

### Takeaway
Articulatory and formant synthesisers *can* sing given explicit f0. Birkholz's VocalTractLab sang a canon from a score in 2007, and Cantor Digitalis performs vowels in real time from stylus pitch and effort. A sustained nasal hum is physically one of the easiest sounds for them, being a closed lips/velum-open configuration. But their naturalness is well below neural vocoders. **RL/imitation work on articulatory synthesis remains at the toy stage**: vowel-to-vowel transitions without pitch control (Shitov et al. 2023, VocalTractLab), Pink Trombone parameter matching for yawns (Cámara et al. 2023, genetic/swarm optimisers, not RL), and self-supervised infant-style imitation. No RL system has been shown to produce convincing singing or humming. The most promising "articulatory + explicit pitch/loudness" model is **SPARC** (Berkeley, 2024). It is a neural HiFi-GAN decoder driven by 12 articulator trajectories plus pitch and loudness at 50 Hz, with code on GitHub. It has only been tested on speech.

### Cited Findings
- **VocalTractLab singing.** Birkholz, "Articulatory synthesis of singing" (Interspeech 2007): a rule-based transformation of a musical score into a gestural score, pitch-dependent vowel articulation, and a demo of the canon "Dona nobis pacem" — [ISCA archive](https://www.isca-archive.org/interspeech_2007/birkholz07b_interspeech.html)
- An earlier VTL version used for this work reportedly took 2nd place at the Interspeech 2007 Synthesis of Singing Challenge. VTL 2.3 (Aug 2020) is described as open source under the GPL, Windows-only — [Leiden VTL workshop handout](https://liacs.leidenuniv.nl/%7Ebakkerem2/api/VocalTractWorkshop_2023.pdf)
- A VTL 2.4 manual exists. The current vocaltractlab.de homepage (© 2025) names no version, licence or singing feature, and lists TargetOptimizer for estimating pitch targets from f0 contours — [VTL 2.4 manual](https://vocaltractlab.de/download-vocaltractlab/VTL2.4-manual.pdf); [vocaltractlab.de](https://vocaltractlab.de/)
- VTL-based TTS was compared with other German TTS systems in Krug et al., SSW 2021 — [ISCA SSW 2021](https://www.isca-archive.org/ssw_2021/krug21_ssw.html)
- **Deep RL for articulatory vowel imitation.** Shitov, Pirogova, Wysocki & Lech, *Sensors* (Mar 2023):
  - Synthesiser: VocalTractLab with 23 continuous control parameters (none pitch-related), 40 ms time steps.
  - Method: model-based RL that learns a neural forward model alongside the policy, guided by a 16-dim acoustic word embedding reward.
  - Task: imitating synthetic vowel-to-vowel transitions (5 cardinal vowels), reaching near-reference DTW/correlation in the easier scenarios. The pure-acoustic scenario was the least stable, and training failed with MFCCs instead of AWE.
  - Cost: about 5 h per run on a Quadro P6000.
  - The authors call full-word imitation future work and note that voice-matching robustness is untested.
  
  [PMC10147087](https://pmc.ncbi.nlm.nih.gov/articles/PMC10147087/)
- A 2026 IEICE technical report on RL-based articulatory parameter estimation found that pre-training data quality and reward design strongly affect synthesised-speech quality. This is from the search snippet only — [IEICE 2026](https://ken.ieice.org/ken/paper/20260302Lct2/eng/)
- Self-supervised (non-RL) vocal imitation: "Repeat after me" learns an acoustic-to-articulatory inverse model through a neural articulatory synthesiser — [paperswithcode](https://www.paperswithcode.com/paper/repeat-after-me-self-supervised-learning-of)
- A 2025 arXiv preprint models infant vocal imitation with a self-supervised inverse model plus synthesiser — [arXiv 2509.05849](https://arxiv.org/html/2509.05849v2) (details from search summary)
- **Pink Trombone.** Cámara, Xu, Zong, Blanco & Reiss (DAFx 2023) treat Pink Trombone as a black box and fit its parameters to target **yawns** with genetic, swarm, least-squares and neural-network optimisers. Genetic and swarm optimisers beat least squares but are slower. No RL was used — [arXiv 2309.14761](https://arxiv.org/abs/2309.14761)
- A 2024 paper maps audio to Pink Trombone parameters with neural encoders — [arXiv 2406.14379](https://www.arxiv.org/pdf/2406.14379) (from search summary)
- **SPARC / articulatory coding.** Cho, Wu, Prabhune, Agarwal, Anumanchipalli (IEEE JSTSP, Dec 2024):
  - The synthesiser takes 12 EMA articulator channels plus **pitch (CREPE) and loudness**, 14 channels at 50 Hz, with a 64-dim speaker embedding. A HiFi-GAN decoder with FiLM speaker conditioning outputs 16 kHz audio.
  - Pitch is an explicit input, rescaled for VC.
  - **Singing was not tested** and is listed as future work. Code is at GitHub Berkeley-Speech-Group/Speech-Articulatory-Coding, with the code/weights licence not stated in the paper.
  
  [arXiv 2406.12998](https://arxiv.org/html/2406.12998v4)
- **Formant/parametric singing.** Cantor Digitalis (LIMSI/LAM; Feugère, d'Alessandro, Doval, Perrotin, EURASIP JASMP 2017) is a "chironomic" performative singing synthesiser:
  - Engine: a spectral glottal-source model (CALM), parallel formant filters, and rules linking pitch, vocal effort and formants.
  - Controls: six dimensions — pitch, tension, breathiness, roughness, laryngeal mechanism, vocal effort — driven by a graphic tablet. v2.0 added a finer vocal-effort model.
  
  [Cantor Digitalis page](https://chorus-digitalis.lam.jussieu.fr/cantor-digitalis_eng.html); [EURASIP paper, open access](https://gala.gre.ac.uk/id/eprint/23553) (details from search summaries; full text not read)

### Inferences
- **Achieved:** rule-driven articulatory singing (VTL 2007) and real-time formant singing of vowels from explicit pitch and effort (Cantor Digitalis). Both accept exactly "pitch at this time at this loudness/effort" with sample-accurate timing, and both run on CPU in real time.
- **Not achieved:** RL agents learning to sing or hum convincingly. The best RL result is synthetic vowel transitions with fixed pitch. "RL learns to hum a melody like a human" is speculative.
- For humming specifically, a physical model only has to hold one articulatory posture (lips closed, velum lowered) and modulate subglottal pressure and f0. That is a much easier control problem than speech, so VTL/Pink Trombone/Cantor-style engines could produce a recognisable hum with explicit f0/loudness curves without any learning. Realism would be limited by the glottal source model and the lack of natural micro-variation. Such output could serve as a clean *source* for the SVC route in §4.
- SPARC is the most interesting hybrid. Freezing the lip channels at closure and supplying a target pitch/loudness curve might produce a neural-quality hum. This is untested; the model was trained on speech only, and its 50 Hz control rate (20 ms) limits onset precision.

### Gaps
- I could not confirm VTL's current version (2.4 vs later), licence for the latest release, or any recent singing-specific feature or evaluation.
- No source specifically on Klatt-synthesiser singing was retrieved. KTH's rule-based singing synthesis and IRCAM CHANT/FOF are well known but were not sourced in this session.
- No naturalness or MOS figures were found for VTL singing or Cantor Digitalis.
- The Cantor Digitalis download licence was not verified.

---

## 6. Is RL used in voice synthesis beyond articulatory toy problems?

### Takeaway
Yes. Since 2024, RL and preference optimisation are mainstream post-training for neural TTS, and in late 2025 they spread to singing:
- SpeechAlign (NeurIPS 2024): iterative preference optimisation of a codec LM.
- Seed-TTS (2024): REINFORCE with WER/SIM/emotion rewards.
- Vevo2 (2025): intelligibility and prosody reward post-training.
- YingMusic-Singer and YingMusic-SVC (Dec 2025): Flow-GRPO with melody/pitch-accuracy and timbre rewards.

None of these is driven by an explicit f0+loudness curve. RL is used to improve melody adherence, intelligibility and similarity in token or flow models.

### Cited Findings
- **SpeechAlign** (Zhang et al., Fudan, NeurIPS 2024) iteratively builds preference pairs (golden versus synthetic codec tokens) and applies preference optimisation to a codec language model, closing the training/inference distribution gap — [NeurIPS 2024](https://papers.neurips.cc/paper_files/paper/2024/hash/5a016da670821af25f151f523a2e563f-Abstract-Conference.html); [arXiv 2404.05600](https://arxiv.org/html/2404.05600v1)
- **Seed-TTS** (ByteDance, Jun 2024):
  - Uses **REINFORCE** with external rewards. Seed-TTS_RL-SIM-WER uses speaker similarity plus WER; Seed-TTS_RL-SER uses emotion-recognition accuracy. PPO and DPO are discussed as alternatives.
  - Results: EN WER 2.249→1.945, SIM 0.762→0.766; CMOS +0.14 versus the ICL baseline; "Surprise" emotion accuracy 0.13→0.82.
  - The authors report **reward hacking**: lower WER came with slower, over-articulated speech.
  
  [Seed-TTS paper](https://arxiv.org/html/2406.02430)
- **Vevo2** (Aug 2025) post-trains with an intelligibility reward model (trained on 250K INTP speech preference pairs) and a prosody reward. Humming-to-singing WER fell 32.86→17.27 and FPC rose 0.769→0.784. For instrument-to-singing, adding only the intelligibility reward cut melody accuracy from 65% to 50%, while both rewards raised text accuracy from 75% to 90% — [Vevo2 paper](https://arxiv.org/html/2508.16332v2)
- **YingMusic-Singer** (arXiv 2512.04779, Dec 2025) applies Flow-GRPO with a multi-objective reward for pronunciation clarity and melodic fidelity. Its own framing is that there is still "a lack of research systematically applying reinforcement learning to SVS". A later version (arXiv 2603.24589) reportedly adds curriculum plus GRPO and beats Vevo2 on melody preservation — [arXiv 2512.04779](https://arxiv.org/html/2512.04779v1); [arXiv 2603.24589](https://arxiv.org/pdf/2603.24589) (from search summary)
- **YingMusic-SVC** (Dec 2025) uses Flow-GRPO post-training for zero-shot SVC to optimise non-differentiable perceptual objectives — [arXiv 2512.04793](https://arxiv.org/abs/2512.04793)
- Other preference optimisation work in speech:
  - Emo-DPO for emotional TTS (2024) — [arXiv 2409.10157](https://arxiv.org/html/2409.10157v1)
  - DPO for non-verbal vocalisations such as laughter, coughs and sighs (2026), reporting that standard DPO works well — [arXiv 2608.24163](https://arxiv.org/pdf/2608.24163)
  - Voxtral TTS (2026) uses DPO to improve WER and speaker similarity — [arXiv 2603.25551](https://arxiv.org/pdf/2603.25551)
  - LatinX uses DPO for multilingual voice-cloning TTS — [arXiv 2509.05863](https://arxiv.org/pdf/2509.05863)
  
  (DPO-for-speech items above are from search summaries; the papers were not read in full.)

### Inferences
- RL in modern voice synthesis is a *fine-tuning* tool on top of large generative models, rewarding WER, similarity, pitch accuracy or emotion. It is not a way of learning motor control.
- For an f0+loudness-driven humming synth, RL is unnecessary when the control signal is given explicitly. It could matter only if one wanted a model to *invent* expressive deviations (vibrato, scoops) with a human-preference reward, as MIDI-DDSP's expression generator does by supervised learning.
- Reward hacking (Seed-TTS) and the trade-off between melody and intelligibility rewards (Vevo2) are documented risks.

### Gaps
- I found no paper applying RL or DPO to an explicitly f0-conditioned vocoder or DDSP model, and none on humming.
- Numbers from YingMusic-Singer and YingMusic-SVC were not verified.

---

## 7. Cross-family comparison: control granularity, onset accuracy, artifacts, compute, CPU

### Takeaway
Explicit-control families (DDSP, NSF vocoders, DDSP-SVC, articulatory/formant) run at 4–20 ms control frames and follow the given f0 to within tens of cents. The frame-synchronous SVC family keeps timing to about 10–12 ms and pitch to F0CORR ~0.94. AR/token models (Vevo2) work at 6.25–12.5 Hz tokens and do not follow exact f0 or ms onsets. Everything except the large token models runs offline on CPU. GOLF, DDSP and NSF-class models are faster than real time on one CPU core-class machine.

### Cited Findings
| Family / model | Explicit inputs | Control frame | Measured pitch fidelity | Quality evidence | Compute / CPU | Weights & licence (checked 2026-10-24) |
|---|---|---|---|---|---|---|
| DDSP (Magenta) | f0 + loudness (+ optional z) | 4 ms (250 fps) [MIDI-DDSP](https://arxiv.org/html/2112.09312) | DDSP had lowest f0 MAE among DDSP vocoders, e.g. 52.95 cents on male singer [GOLF](https://arxiv.org/pdf/2306.17252) | Highest MOS in GOLF test; not significantly different from f1 ground truth [GOLF](https://arxiv.org/pdf/2306.17252) | CPU RTF 0.237 [GOLF](https://arxiv.org/pdf/2306.17252) | Apache-2.0 code; no voice weights [ddsp](https://github.com/magenta/ddsp) |
| DDSP singing (Alonso & Erkut 2021) | f0 + loudness | DDSP default | n/a | "song-like utterances", recognisable singer [arXiv](https://arxiv.org/abs/2103.07197) | ~12 h training | notebooks on GitHub [arXiv](https://arxiv.org/abs/2103.07197) |
| SawSing | mel (f0 predicted) | 10 ms | 30–32 cents MAE (full data) | MOS ~2–3 [SawSing](https://arxiv.org/html/2208.04756v2) | 0.5M params; GPU RTF 0.003 | AGPL-3.0 [repo](https://github.com/YatingMusic/ddsp-singing-vocoders) |
| GOLF | mel (f0 predicted); glottal LF + LPC | 5 ms | ~54–77 cents MAE | Significantly better than SawSing; below DDSP [GOLF](https://arxiv.org/pdf/2306.17252) | CPU RTF 0.023 | MIT; checkpoints released [repo](https://github.com/yoyololicon/golf) |
| MIDI-DDSP | MIDI notes + 6 expression controls | 4 ms | vibrato control r=.70 | Beat FluidSynth/Ableton in realism [paper](https://arxiv.org/html/2112.09312) | 18 h training on RTX 8000 | Apache-2.0; instruments only [repo](https://github.com/magenta/midi-ddsp) |
| OpenVPI pc-nsf-hifigan | mel + f0 | 11.6 ms (hop 512 @ 44.1k) | f0 shift ±12 st, formant-preserving | Widely reused in SVC/SVS | small GAN, CPU-capable | CC BY-NC-SA 4.0 weights [releases](https://github.com/openvpi/vocoders/releases) |
| SiFi-GAN | WORLD mgc/bap + sine from f0 | 5 ms | F0 RMSE 0.08 (×0.5) / 0.13 (×2.0); the fetched table header said "Hz" but values this small suggest a log-F0 scale, so treat units as unverified | MOS 3.29 (×0.5) / 3.05 (×2) vs GT 3.99 [paper](https://arxiv.org/html/2210.15533v3) | CPU RTF 0.74 | MIT [repo](https://github.com/chomeyama/SiFiGAN) |
| DDSP-SVC | units + f0 + volume (+ speaker id/mix) | block = vocoder hop (11.6 ms default) | not published | self-reported ≥ so-vits/RVC on some datasets [README](https://github.com/yxlllc/DDSP-SVC) | trains on RTX 4060; real-time GUI | MIT code; depends on CC BY-NC-SA vocoder |
| RVC v2 | source audio (HuBERT) + extracted f0 | ~10 ms | F0CORR 0.9404 / RMSE 30.43 (M4Singer) [Seed-VC EVAL](https://github.com/Plachtaa/seed-vc/blob/main/EVAL.md) | DNSMOS OVRL 3.12 | per-voice training | MIT code & base assets [HF](https://huggingface.co/lj1995/VoiceConversionWebUI) |
| Seed-VC (SVC) | source audio (Whisper) + f0 condition + ref audio | diffusion over mel, 44.1k | F0CORR 0.9375 / RMSE 33.35 | SECS 0.7405, CER 19.7 | GPU recommended; 430 ms RT latency on RTX 3060 laptop [README](https://github.com/Plachtaa/seed-vc) | GPL-3.0 code |
| so-vits-svc 4.1 / fork | ContentVec + f0 | ~10 ms | "pitch and intonations… kept" [README](https://github.com/svc-develop-team/so-vits-svc) | 2023-era baseline | fork: CPU inference "fast enough" [fork](https://github.com/voicepaw/so-vits-svc-fork) | AGPL-3.0 + academic-only terms / MIT fork; both unmaintained |
| Vevo2 | prosody tokens (chromagram, octave-free) + text + timbre ref | 6.25 Hz prosody, 12.5 Hz content-style | humming→singing FPC 0.784 | Melody-MOS 2.24–2.38 (1–3) [paper](https://arxiv.org/html/2508.16332v2) | ~1.2B params → GPU | CC BY-NC-ND 4.0 [HF](https://huggingface.co/RMSnow/Vevo2) |
| SPARC (articulatory neural) | 12 articulators + pitch + loudness + spk emb | 20 ms (50 Hz) | n/a (speech only) | speech MOS/UTMOS [paper](https://arxiv.org/html/2406.12998v4) | HiFi-GAN-size decoder | code on GitHub; licence unstated |
| VocalTractLab / Cantor Digitalis | gestural score + f0 / stylus pitch + effort | sample-level physical sim / real-time | explicit f0 | sang a canon in 2007 [ISCA](https://www.isca-archive.org/interspeech_2007/birkholz07b_interspeech.html) | CPU real-time | VTL 2.3 GPL (per handout) [Leiden](https://liacs.leidenuniv.nl/%7Ebakkerem2/api/VocalTractWorkshop_2023.pdf) |
| RL articulatory (Shitov 2023) | learned 23-dim VTL control | 40 ms | no pitch control | vowel transitions only [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10147087/) | 5 h/run on P6000 | n/a |

- Artifact catalogue:
  - DDSP/SawSing: buzzing on unvoiced/breathy segments without V/UV gating [SawSing](https://arxiv.org/html/2208.04756v2).
  - GOLF/PULF: amplitude-modulation "fluctuation" from fast-varying gains, worse at high f0 [GOLF](https://arxiv.org/pdf/2306.17252).
  - GAN vocoders without a sine source: phase-discontinuity glitches and tremor [SawSing](https://arxiv.org/html/2208.04756v2).
  - Pitch-scaled GAN vocoders: V/UV errors rise to 19–26% at ×2 F0 for HiFi-GAN+Sine variants, versus 10% for SiFi-GAN [SiFi-GAN](https://arxiv.org/html/2210.15533v3).
  - Soprano/high-pitch sources: largest SVC F0 errors (Seed-VC RMSE 64.0) [Seed-VC EVAL](https://github.com/Plachtaa/seed-vc/blob/main/EVAL.md).

### Inferences
- **Millisecond-accurate onsets:** no neural family here works at sub-4 ms control resolution. DDSP (4 ms) and GOLF/SiFi-GAN (5 ms) are best. NSF-HiFiGAN, RVC and so-vits work at ~10–12 ms, SPARC at 20 ms, and token models at 80–160 ms. A Welte-roll-style onset accuracy target of a few ms is therefore achievable at 4–5 ms with DDSP-class models, or exactly with physical/formant synthesisers.
- **Most practical open pipeline as of Oct 2026, offline and CPU-friendly:**
  1. Expand MIDI to f0 and loudness curves with vibrato and dynamics, à la MIDI-DDSP's expression features.
  2. Render with a DDSP model trained on a consented humming dataset (Apache-2.0), or render a crude hum (formant/VTL/DDSP) and re-voice it with DDSP-SVC, feeding the score f0 directly (MIT code). Train your own NSF vocoder with MIT SingingVocoders if commercial use rules out the CC BY-NC-SA OpenVPI weights.
  
  This is a synthesis of the findings above, not a published system.
- Quality expectation: DDSP-only output on ~3 h of data scores about 2–3 MOS (SawSing/GOLF tests). SVC with a good vocoder reaches near-natural quality on *natural* singing input (SVCC 2023 top system ≈ ground-truth naturalness). Hum-specific quality is unmeasured.

### Gaps
- There is no benchmark of any system on humming, and no MOS for hum outputs anywhere in the literature found.
- CPU RTFs for DDSP-SVC, RVC and Seed-VC are not published in the sources read.
- Exact frame hop of RVC v2 and so-vits-svc was not verified from code in this session; the ~10 ms figure is inferred from 16 kHz HuBERT/f0 extraction conventions.
