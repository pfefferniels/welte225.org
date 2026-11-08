# State of the Art of Score-Conditioned Neural Singing Voice Synthesis (SVS), as of late 2026

Scope note: lyric-bearing singing synthesized from a score (note pitches, onsets/offsets, lyrics/phonemes, optionally dynamics). Humming/lyrics-free synthesis is covered elsewhere and only appears here incidentally. All MOS numbers below were extracted directly from the papers' tables (PDF text), not from secondary summaries, unless stated otherwise. **MOS values are not comparable across papers**: listeners, languages, datasets, sample rates and anchors differ. The meaningful quantity is the **gap to ground-truth recordings in the same test**.

---

## 1. Academic SVS models: reported MOS / naturalness vs. ground-truth recordings

### Takeaway
In every peer-reviewed human listening test I found from 2020 to 2025, score-conditioned SVS stays clearly below real recordings. The naturalness/quality gap is typically **0.3–0.8 MOS on a 5-point scale**: 0.27 at best (HiFiSinger, 2020, internal data), more often 0.45–0.75. Even in 2025 zero-shot models (TCSinger 2) the gap is ~0.45 MOS against GT and ~0.2 against vocoded GT. The newest 2026 models (SoulX-Singer, VocalRender) report **automatic** MOS predictors (SingMOS) that are equal to or within ~0.15 of GT, but they do not publish human MOS against recordings. VocalRender's own authors note that the automatic metrics have "limited discriminative resolution", and their human CMOS tests still show clear differences between systems.

### Cited Findings

**Early neural era (2020, older results)**
- **XiaoiceSing (Microsoft, Interspeech 2020)**, FastSpeech-based, WORLD vocoder, 48 kHz; 10 listeners, 30 samples. Recording vs XiaoiceSing vs CNN baseline: **naturalness 4.78 vs 3.61** vs 2.23; **sound quality 4.54 vs 3.70** vs 2.26; **pronunciation accuracy 4.79 vs 4.32** vs 3.14. Gap on naturalness is about 1.17 MOS. The authors attribute the sub-4.0 quality to "deficiencies of WORLD or higher expectations of listeners". — [XiaoiceSing, arXiv 2006.06261](https://arxiv.org/abs/2006.06261)
- **HiFiSinger (Microsoft, 2020)**: 48 kHz, 11 h internal studio data, 100 test pieces, at least 20 judges per audio. **Recording 4.03 ± 0.06; HiFiSinger 3.76 ± 0.06** (gap 0.27); Recording downsampled to 24 kHz 3.70; HiFiSinger@24 kHz 3.47; baseline@48 kHz 3.44; XiaoiceSing 2.93 in the same test. The authors stress that HiFiSinger beats 24 kHz recordings. — [HiFiSinger, arXiv 2009.01776](https://arxiv.org/abs/2009.01776)
- **DeepSinger (KDD 2020)**: trained on singing data mined from the web; at least 20 native-speaker testers per language. GT / GT(Linear+Griffin-Lim) / DeepSinger: **Chinese 4.36 / 4.12 / 3.78; Cantonese 4.38 / 4.18 / 3.42; English 4.15 / 3.95 / 3.52**. Gaps to real GT are 0.58–0.96. — [DeepSinger, arXiv 2007.04590](https://arxiv.org/abs/2007.04590)
- **ByteSing (ByteDance, 2020)**: Tacotron-like model with duration allocation and a WaveRNN vocoder. Five professional music experts rated rhythm, pitch, pronunciation, breath and expressiveness (shown only in a figure). The paper reports that "all the measure criteria for ByteSing system have exceeded 80 percent of these for original recorded songs". The largest gaps were in **pronunciation and breath**. Rhythm was rated *better* than the real singer because of duration post-processing, and the authors note this "can lead in the deficiency for singing expressiveness". — [ByteSing, arXiv 2004.11012](https://arxiv.org/abs/2004.11012)
- **Sinsy (Nitech; DNN version, IEEE/ACM TASLP 2021)**: four modules (time-lag, duration, acoustic model, PeriodNet vocoder) plus vibrato modeling and automatic pitch correction. Its MOS results are shown only in figures. In the later NNSVS benchmark (below), Sinsy variants scored **2.64–2.99 vs recordings 4.39**. — [Sinsy, arXiv 2108.02776](https://arxiv.org/abs/2108.02776); [NNSVS, arXiv 2210.15987](https://arxiv.org/abs/2210.15987)

**Diffusion / end-to-end era (2021–2023)**
- **DiffSinger (AAAI 2022, Zhejiang Univ.)**: PopCS Mandarin dataset, 18 listeners. **GT 4.30 ± 0.09; GT(Mel+PWG vocoder) 4.04 ± 0.11; DiffSinger 3.85 ± 0.11** (gap 0.45 to GT, 0.19 to vocoded GT); DiffSinger without shallow diffusion 3.71; GAN-Singer 3.74; FFT-Singer 3.67; FFT-NPSS (WORLD) 1.75. In the PopCS setup the pitch condition comes from F0 extracted from the recordings, so this is closer to an acoustic-model test than to full score-to-singing (see Inferences). — [DiffSinger, arXiv 2105.02446](https://arxiv.org/abs/2105.02446)
- **VISinger (ICASSP 2022, NWPU)**: end-to-end VITS-style model, Opencpop, 10 listeners × 30 segments. **Recording: sound quality 4.38, naturalness 4.32. VISinger: 3.93 / 3.76** (naturalness gap 0.56). FastSpeech+HiFiGAN (fine-tuned) scored 3.85 / 3.75. — [VISinger, arXiv 2110.08813](https://arxiv.org/abs/2110.08813)
- **VISinger 2 (2022; DSP-synthesizer-enhanced)**: 10 listeners × 30 segments. **44.1 kHz: recording 4.32 ± 0.11 vs VISinger 2 3.81 ± 0.14** (gap 0.51); 22 kHz: recording 4.22 vs VISinger 2 3.69 vs VISinger 3.46. In the ablation test, **recording 4.47 vs VISinger 2 3.96**. — [VISinger 2, arXiv 2211.02903](https://arxiv.org/abs/2211.02903)
- **NNSVS (ICASSP 2023, open-source toolkit)**: Japanese single-singer corpus, 18 native Japanese listeners, 25 samples per system, all synthesized **from the musical score**. Results: Sinsy 2.64; Sinsy with pitch correction 2.84; Sinsy with vibrato modeling 2.99; Muskits RNN 2.22; **DiffSinger 2.90**; NNSVS-Mel v1/v2/v3 3.51/3.58/2.58; NNSVS-WORLD v0–v4 3.28/3.21/3.35/3.60/**3.86**. Analysis-synthesis upper bounds (hn-uSFGAN) 4.19. **Recordings 4.39.** The best score-driven system is therefore 0.53 below the recordings and 0.33 below its own vocoder ceiling. The authors note DiffSinger "often generated unnatural pitches such as discontinuous F0 and unstable vibrato, especially for dynamic voices." — [NNSVS, arXiv 2210.15987](https://arxiv.org/abs/2210.15987)
- **RMSSinger (ACL Findings 2023)**: synthesizes from a "realistic music score" (word-level, no phoneme alignment). MOS-P (pitch naturalness) and MOS-Q (quality): **GT 4.55 / 4.58; GT(vocoder) 4.10 / 4.09; RMSSinger 3.77 / 3.84**; DiffSinger 3.63 / 3.79; FFTSinger 3.57 / 3.46. — [RMSSinger, arXiv 2305.10686](https://arxiv.org/abs/2305.10686)

**Zero-shot / style / prompt / audio-LM era (2023–2025)**
- **Make-A-Voice (2023, audio-LM with discrete units)**, zero-shot SVS: **GT 4.08 ± 0.08; Make-A-Voice 3.99 ± 0.08; DiffSinger 3.98 ± 0.07**; FFT-Singer 3.83. Note the GT anchor itself is low (4.08). — [Make-A-Voice, arXiv 2305.19269](https://arxiv.org/abs/2305.19269)
- **UniAudio (2023, ICLR-2024 submission; universal audio LM)**: SVS on the M4Singer test set. **UniAudio 4.08 ± 0.04 vs DiffSinger 3.94, Make-A-Voice 3.96**; the SVS table has no GT row. — [UniAudio, arXiv 2310.00704](https://arxiv.org/abs/2310.00704)
- **StyleSinger (AAAI 2024)**, out-of-domain style transfer: **Reference 4.53 ± 0.05; Reference (vocoder) 4.13; StyleSinger 3.90 ± 0.05** (gap 0.63); RMSSinger 3.84; YourTTS 3.65. — [StyleSinger, arXiv 2312.10741](https://arxiv.org/abs/2312.10741)
- **Prompt-Singer (NAACL 2024)**, natural-language control of gender, volume and range: MOS **3.75–3.85** across model variants. I did not extract the GT row. — [Prompt-Singer, arXiv 2403.11780](https://arxiv.org/abs/2403.11780)
- **TCSinger (EMNLP 2024)**, zero-shot style transfer and multi-level style control: **GT 4.58 ± 0.06; GT(vocoder) 4.34; TCSinger 4.12 ± 0.08** (gap 0.46); StyleSinger 3.94; RMSSinger 3.86. — [TCSinger, arXiv 2409.15977](https://arxiv.org/abs/2409.15977)
- **TCSinger 2 (arXiv May 2025)**, customizable multilingual zero-shot SVS. Parallel test: **GT 4.58 ± 0.11; GT(vocoder) 4.36; TCSinger 2 4.13 ± 0.12**; TCSinger 3.94. Cross-lingual: TCSinger 2 3.96. Style-control test: **GT 4.56 vs TCSinger 2 4.07**. — [TCSinger 2, arXiv 2505.14910](https://arxiv.org/abs/2505.14910)
- **TechSinger (AAAI 2025)**, technique-controllable SVS via flow matching: **Reference 4.54; Reference (vocoder) 4.15; TechSinger 3.89 ± 0.07**; StyleSinger 3.69; DiffSinger 3.59; VISinger2 3.52. — [TechSinger, arXiv 2502.12572](https://arxiv.org/abs/2502.12572)
- **Seed-Music (ByteDance, Sept 2024)** is primarily lyrics-to-song generation. It uses "lead sheet tokens" that "represent note-level details such as pitch, duration, position within a bar, vocal phonemes aligned to notes", which allows score-driven Leadsheet2Song. Evaluation uses only CMOS from "musically-trained raters" plus WER and tagging; the paper reports **no absolute MOS vs ground truth**. The authors write that "there are no equivalent benchmarks for music generation that provide quantitative scores." — [Seed-Music, arXiv 2409.09214](https://arxiv.org/abs/2409.09214)
- **Vevo (ICLR 2025, Amphion)** is a speech voice-imitation model (TTS, VC, accent/emotion). Singing is not its focus, and I found no SVS MOS in it. — [Vevo, arXiv 2502.07243](https://arxiv.org/abs/2502.07243)
- **Vevo2 (CUHK-Shenzhen/ByteDance Seed/Amphion; arXiv Aug 2025, v3 Mar 2026)**, unified speech and singing generation with a notation-free prosody tokenizer. Zero-shot SVS uses only relative N-CMOS plus **Melody-MOS on a 1–3 scale** ("unable to follow" / "roughly following" / "completely following all melody details"). Vevo2 scores **2.29 (EN) / 2.44 (ZH)**; TCSinger scores 2.55 / 2.58. WER is **24.77 vs GT 17.89 (EN)** and **9.83 vs GT 7.40 (ZH)**. Melody correlation (FPC) is 0.752 vs GT 0.815 (EN). There is no absolute MOS vs GT. — [Vevo2, arXiv 2508.16332](https://arxiv.org/abs/2508.16332)

**2025–2026 frontier (names verified)**
- **YingMusic-Singer (NWPU ASLP + GiantNetwork AI Lab, arXiv Dec 2025)**: DiT/flow-matching. Its melody comes from a **pre-trained melody extractor applied to a reference singing clip**, so it is not a symbolic score, and it needs no phoneme alignment. Subjective results are relative only: **N-CMOS Vevo −0.75 vs Ours 0.00**; Melody-MOS 1.76 vs 1.62. There is no GT MOS. — [YingMusic-Singer, arXiv 2512.04779](https://arxiv.org/abs/2512.04779)
- **YingMusic-Singer-Plus (arXiv Mar 2026, v2 renames it)**: **N-MOS 4.31–4.36 and M-MOS (melody adherence) 4.44–4.51**, vs Vevo2 4.25–4.31 / 4.28–4.31 (ZH/EN, melody control). The subjective table has no GT row. It synthesizes at 44.1 kHz with open weights. — [YingMusic-Singer-Plus, arXiv 2603.24589](https://arxiv.org/abs/2603.24589); [HF Space README](https://huggingface.co/spaces/ASLP-lab/YingMusic-Singer-Plus/blob/main/README.md)
- **SoulX-Singer (Soul AI Lab, arXiv Feb 2026, v2 Mar 2026)**: zero-shot SVS trained on **~42,000 h** of vocals (~20k h Mandarin, ~20k h English, ~2k h Cantonese), "an order-of-magnitude increase compared to the data scale used in existing SVS studies". It is controllable by **MIDI score or continuous F0 contour**, with Apache-2.0 weights. **It reports only automatic quality predictors (SingMOS, Sheet-SSQA), not a human listening test.** On GMO-SVS (Chinese), SingMOS is **GT 4.624; SoulX-Singer 4.458 (melody mode) / 4.445 (score mode)**; Vevosing 4.355; TCSinger 3.977; StyleSinger 3.938. English: **GT 4.441; SoulX-Singer 4.323 / 4.303**. WER (ZH) is 0.065–0.069 vs GT 0.074. — [SoulX-Singer, arXiv 2602.07803](https://arxiv.org/abs/2602.07803)
- **VocalRender (Xi'an Jiaotong/NTU/Ant Group, arXiv 30 Jul 2026)**: "score-native" model that takes lyrics, pitches, symbolic note values and tempo, with no explicit durations. It uses an autoregressive diffusion model over continuous latents and is trained on 2,300 h. **Automatic SingMOS: GT 4.59 vs VocalRender 4.59 (Opencpop); GT 4.49 vs 4.53 (CrawlSinger-Eval, songs published after 2026-06-01)**; SoulX-Singer 4.45 / 4.44. The authors caution: "the evaluated automatic perceptual metrics may have limited discriminative resolution among frontier generation models. However, the subjective N-CMOS test shows that the musical quality difference among those models are still obvious." Human N-CMOS relative to VocalRender is SoulX-Singer −0.42, Vevo2 −0.93, TechSinger −0.99, TCSinger −1.20. Score-following MS-MOS (1–4 scale) is VocalRender 2.96 and SoulX-Singer 2.84. There is no human MOS against GT. — [VocalRender, arXiv 2607.27768](https://arxiv.org/abs/2607.27768)
- A 2025/2026 review (IJCNLP-AACL 2025; arXiv Jan 2026) says that "Mean Opinion Score (MOS) remains the gold standard for perceptual quality". It notes SingMOS-style learned predictors and VoiceMOS-challenge SVS tracks, and suggests SVDD detectors as an authenticity metric. — [Synthetic Singers review, arXiv 2601.13910](https://arxiv.org/abs/2601.13910); [ACL Anthology version](https://aclanthology.org/2025.ijcnlp-long.24.pdf)

**Adjacent: singing voice *conversion* challenges (audio-to-audio, not score-to-audio)**
- **SVCC 2023**: "although human-level naturalness was achieved by the top system, no team was able to obtain a similarity score as high as the target speakers." Top systems T23, T07 and T02 were "not significantly different from the natural samples" in naturalness. — [SVCC 2023, arXiv 2306.14422](https://arxiv.org/abs/2306.14422)
- **SVCC 2025** (33 systems, singing-style conversion added): "for naturalness, no system achieved human-level naturalness, unlike in the previous challenges", "primarily due to the difficulty in modeling dynamic information in breathy, glissando, and vibrato singing styles." — [SVCC 2025 analysis, arXiv 2509.15629](https://arxiv.org/abs/2509.15629)

### Inferences
- Across 2020–2025 papers the gap to real recordings is fairly stable at roughly 0.3–0.6 MOS for the best system in each paper. Part of that gap is the vocoder: GT-vs-vocoded-GT gaps are 0.2–0.45 in DiffSinger, RMSSinger, StyleSinger, TCSinger and TechSinger. Score-to-acoustics adds another ~0.2–0.4.
- No academic paper I found claims statistically indistinguishable naturalness from recordings for **score-conditioned SVS** in a human test. Audio-to-audio SVC (SVCC 2023) reached that, but only when the source singer's real performance supplies all timing and expression. This strongly suggests that **generating expressive timing and F0 from a score is the bottleneck**, not timbre or waveform quality.
- The 2026 frontier (SoulX-Singer, VocalRender) has moved to learned MOS predictors that saturate at GT level. "SingMOS = GT" should not be read as human parity. VocalRender's human CMOS tests show the predictors cannot even separate frontier systems from each other.
- DiffSinger's AAAI MOS (3.85 vs 4.30) appears to use F0 extracted from the recordings (pitch condition comes from Parselmouth-extracted F0 on PopCS). Its gap therefore probably *understates* the gap for full score-to-singing. In NNSVS's score-driven test, DiffSinger scored only 2.90 vs 4.39 recordings. This is moderate-confidence: the paper's data-prep text supports it, but I did not find an explicit "GT F0 at test time" sentence.
- Several "LLM/zero-shot" systems (YingMusic-Singer, Vevo2, Make-A-Voice) are really melody-reference or F0-guided rather than strictly symbolic-score-driven. SoulX-Singer (score mode), VocalRender, TCSinger/TCSinger 2, TechSinger, RMSSinger and the DiffSinger/NNSVS lineage are the truly score-conditioned ones.

### Gaps
- I found no HMM-era Sinsy (2009–2013) MOS-vs-recording numbers. The "Sinsy" numbers above are the 2021 DNN Sinsy as re-evaluated in NNSVS.
- I found no published human MOS (absolute, vs GT) for SoulX-Singer, VocalRender, YingMusic-Singer(-Plus), Vevo2 or Seed-Music.
- I did not extract Prompt-Singer's GT row. I did not verify the exact NNSVS corpus name (the paper says "recorded by a single Japanese singer").
- I did not verify whether Vevo2's TASLP acceptance claim is accurate (a third-party GitHub issue).
- I did not find an independent cross-paper benchmark with a common listening test and a recording anchor covering 2025–2026 models.

---

## 2. Commercial systems: claims vs. independent evidence

### Takeaway
Commercial tools (Synthesizer V Studio 2 Pro, ACE Studio 2.0, VOCALOID 6, CeVIO AI/VoiSona, NEUTRINO, Emvoice One) all market "natural/realistic/studio-quality" vocals. The only "human-parity" claim is Dreamtonics' own unpublished test. Independent evidence is limited to journalist reviews, which are positive (e.g., Sound On Sound: SynthV "can be incredibly realistic"), plus one indirect machine-detection result: in the SVDD 2024 challenge, all top detectors were at chance level (~50% EER) on ACE Studio output. That result is confounded by domain mismatch. I found no peer-reviewed listening test of any commercial product against human singers.

### Cited Findings
**Dreamtonics Synthesizer V Studio 2 Pro**
- Released 21 March 2025 after being unveiled at NAMM 2025. It is described as a major update with retrained AI models, ~300% faster rendering on modern hardware, and new features. — [KVR Audio news](https://www.kvraudio.com/news-print.php?id=63333); [Dreamtonics store page](https://store.dreamtonics.com/?p=47318)
- The store comparison table lists:
  - a new **Mouth Opening** parameter
  - a **Phoneme Timing panel** that replaces the Duration/Strength sliders
  - **Vocal Modes** extended to Pitch/Timbre/Pronunciation (v1 had timbre only)
  - **Smart Pitch Controls**
  - **AI Retakes** for Pitch/Timbre/Timing
  - Tension, Breathiness, Voicing, Gender and Tone Shift carried over
  - VST3/AU/AAX/ARA plugin formats. — [Dreamtonics store page](https://store.dreamtonics.com/?p=47318)
- **Company claim, unverified**: CEO Kanru Hua said that "in testing, the vocals generated by the Synthesizer V actually received the same naturalness ratings as real human vocals". This was distributed in Dreamtonics' press materials. — [RecordingMag](https://www.recordingmag.com/news/dreamtonics-unveils-synthesizer-v-studio-2-pro/). Mixdown describes the test, presented at ADC London 2023, more cautiously: musically trained listeners heard human and SynthV vocal lines, and "the synthesized vocals achieved near-human naturalness". — [Mixdown review](https://mixdownmag.com.au/reviews/review-dreamtonics-synthesizer-v-studio-2-pro/). No sample size, scale or statistics are published.
- **Independent review**: Sound On Sound (John Walden, July 2025) says results "can be incredibly realistic". It repeats from its v1 review that "many listeners will not realise that they are hearing a synthesized voice until you tell them", and notes SynthV is not text-prompted generation but resynthesis from MIDI-style notes, lyrics and parameters. — [Sound On Sound review](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro)
- Gearnews notes that users cannot (yet) draw emotions and expressions in the automation lanes, nor have them added by the AI. — [Gearnews](https://gearnews.com/?p=215693)

**ACE Studio 2.0 (Timedomain)**
- The product page claims "professional-level, studio-quality singing vocals", "140+ Voices" and "8 Languages", with no listening-test or indistinguishability claims on the page. — [acestudio.ai](https://acestudio.ai/)
- Reviews say vocal synthesis is "very much the headline feature" ([Sound On Sound](https://soundonsound.com/reviews/ace-studio-2)). MusicTech gives 4/5, praising "high-quality vocal sounds and ethically trained AI models" but criticizing render times and workflow ([MusicTech](https://musictech.com/reviews/digital-audio-workstations/ace-studio-2-review/)). Mixdown highlights VoiceMix timbre blending and control over pronunciation, pitch, vibrato and emotion ([Mixdown](https://mixdownmag.com.au/reviews/review-ace-studio-2-0/)).
- **Indirect independent evidence**: CtrSVDD/SVDD 2024 attack A14 is "ACESinger", described as a "blackbox commercial system with manual tuning". Its deepfake clips were generated in the ACE Studio desktop app. **All top-8 challenge systems scored 49.53–50.44% EER on ACESinger, i.e., chance.** The organizers attribute this to strong out-of-domain attributes: unknown training data, and bonafide clips supplied by Timedomain that "may apply additional processing". — [SVDD 2024, arXiv 2408.16132](https://arxiv.org/abs/2408.16132)

**Yamaha VOCALOID 6 / VOCALOID:AI**
- Released 13 Oct 2022. It is the first VOCALOID version with a machine-learning engine (VOCALOID:AI), with multilingual (JP/EN/ZH) singing per voicebank and VOCALO CHANGER (audio-to-VOCALOID). — [Wikipedia: Vocaloid 6](https://en.wikipedia.org/wiki/Vocaloid_6); [vocaloid.com VOCALOID6](https://www.vocaloid.com/en/vocaloid6/)
- Version 6.5 (Dec 2024) added direct pitch-curve drawing for VOCALOID:AI parts and an "Air" parameter for breath strength. Dynamics, Pitch Bend and Pitch Bend Sensitivity work on AI tracks, while the classic parameters (e.g., brightness, growl) are VOCALOID-track-only. — [Wikipedia: Vocaloid 6](https://en.wikipedia.org/wiki/Vocaloid_6); [VOCALOID FAQ](https://www.vocaloid.com/en/support/faq/647); [VOCALOID learn page](https://www.vocaloid.com/en/learn/ln6212). These details came via search summaries of these pages; I could not open Yamaha's 2022 press release (HTTP 403).
- I found no Sound On Sound or other formal review of VOCALOID 6. Forum and Reddit sentiment (low reliability) often compares VOCALOID:AI unfavourably with SynthV. — [Wikipedia: Vocaloid 6](https://en.wikipedia.org/wiki/Vocaloid_6)

**CeVIO AI / VoiSona (Techno-Speech)**
- VoiSona began as CeVIO Pro (alpha Feb 2022, v1.0 Sept 2022). It is a free editor with paid voice libraries. — [CeVIO & VoiSona wiki](https://cevio.fandom.com/wiki/VoiSona); [App Store listing](https://apps.apple.com/app/voisona/id6478200421)
- CeVIO reportedly generates natural parameters and breath sounds automatically from lyrics and score (unlike VOCALOID), with user-adjustable parameters. — [Moegirl: VoiSona](https://zh.moegirl.org.cn/VoiSona). This is a fan wiki and low reliability.

**NEUTRINO (Studio SHACHI, 2020– )**
- It reads MusicXML (e.g., from MuseScore), and a neural network predicts timing, pitch and voice parameters before vocoding. User-side controls are limited (pitch shift, formant shift, voicebank choice). — [VocaSphere](https://vocasphere.net/2020/02/neutrino-neural-singing-synthesizer-available-for-download/)

**Emvoice One**
- A cloud-based plugin: the user types lyrics and enters one note per syllable. "World's most realistic" is the maker's tagline. Mixdown says it can "hover around pitch and timing, just like a human would". — [Mixdown review](https://mixdownmag.com.au/reviews/review-emvoice-one-vocal-synthesis/); [KVR reviews](https://www.kvraudio.com/product/emvoice-one-by-emvoice/reviews); [Sound On Sound news](https://www.soundonsound.com/node/4929694)

### Inferences
- The strongest commercial realism claim (SynthV "same naturalness ratings as real human vocals") is company-reported, methodologically undisclosed, and refers to a 2023 in-development build. Treat it as marketing until published.
- Journalists who listen closely, like Sound On Sound, report that well-tuned SynthV output often passes casual listening. "Indistinguishable" in practice also depends on user tuning ("with practice"). ACE's A14 attack likewise used "manual tuning".
- The SVDD chance-level result on ACE Studio shows that 2024-era detectors trained on open-source SVS/SVC do not generalize to commercial output. It is not evidence that ACE output is perceptually indistinguishable to humans.

### Gaps
- I found no peer-reviewed or independent blind listening test of any commercial SVS (SynthV, ACE, VOCALOID:AI, CeVIO/VoiSona, NEUTRINO, Emvoice) against human singers.
- No technical papers for SynthV 2 or ACE Studio internals. Whether they use RL or preference optimization is undisclosed.
- I did not verify VoiSona/CeVIO AI's specific singing parameter list. No Sound On Sound VOCALOID 6 review was found.

---

## 3. Deepfake-detection evidence: how detectable is synthetic singing (machines and humans)?

### Takeaway
Machines detect synthetic singing well **in-domain**: the best CtrSVDD EER was 1.65% in 2024. They fail **out-of-domain**: ~50% EER on commercial ACE Studio output, ~38–58% for speech-trained detectors on SingFake, and degradation on unseen singers, codecs and languages. Human-listener evidence for singing is thin. The only systematic human comparisons I found concern full AI-generated *songs* (Suno/Udio) rather than score-conditioned SVS, and there humans perform poorly (sensitivity 23–82% in SONICS; 97% failure in a company-commissioned Deezer/Ipsos survey). I found no Turing-style human test specifically for score-based SVS.

### Cited Findings
- **SingFake (ICASSP 2024, Univ. of Rochester)**: in-the-wild dataset of **28.93 h bonafide + 29.40 h deepfake** clips, 40 singers, 5 languages, gathered from user-generated-content platforms. Speech-trained detectors fail on singing. On SingFake T02 (unseen singers), **EERs are 45–58% on song mixtures** (AASIST 58.12%, Spectrogram+ResNet 51.87%, LFCC+ResNet 45.12%, W2V2+AASIST 56.75%) and **~38% on separated vocals for AASIST and Spec+ResNet**. On ASVspoof2019 the same detectors score 0.83–7.03%. Training on SingFake helps substantially, but unseen singers, codecs, languages (Persian test set) and musical contexts remain hard. — [SingFake, arXiv 2309.07525](https://arxiv.org/abs/2309.07525)
- **CtrSVDD (Interspeech 2024)**: controlled dataset with **47.64 h bonafide and 260.34 h deepfake** (188,486 clips) from 14 attack systems. The systems include SVS models XiaoiceSing (A01), VISinger (A02), VISinger2 (A03), NNSVS (A04), Naive RNN (A05) and DiffSinger (A12), several SVC systems (NU-SVC, So-VITS-SVC variants), and commercial ACESinger (A14). — [CtrSVDD, arXiv 2406.02438](https://arxiv.org/abs/2406.02438)
- **SVDD 2024 challenge (IEEE SLT 2024)**: 47 teams submitted to CtrSVDD, and the best EER was **1.65%** (excluding ACESinger) vs baselines of 12.03% and 11.16%. Including ACESinger, the top team's overall EER is 4.32%.
  - **Per-attack**: among open systems, DiffSinger (A12) was the hardest for the top-8 teams (**4.19–7.30% EER**, vs ≤1.6% for most SVC attacks).
  - **ACESinger (A14): 49.53–50.44% EER for all top-8 teams, i.e., chance.**
  - The WildSVDD track received no submissions. — [SVDD 2024, arXiv 2408.16132](https://arxiv.org/abs/2408.16132)
- I found no 2025–2026 successor SVDD challenge round in searches. The Jan 2026 SVS review cites SVDD as a possible authenticity metric for evaluating synthesis. — [Synthetic Singers review, arXiv 2601.13910](https://arxiv.org/abs/2601.13910)
- **Human vs machine, AI songs (SONICS, ICLR 2025)**: 520-sample human benchmark with **only three human participants** and 25-s clips. "AI-based methods consistently outperform human participants across all test partitions". **Human sensitivity dropped to 23% on Udio-32** and reached **82% on Suno v3.5**. The authors note real songs show "unpredictability, dynamic variation", "non-standard pitch variations", "melismatic phrasing", traits often absent in fakes. This is text-to-song generation, not score-conditioned SVS. — [SONICS, arXiv 2408.14080](https://arxiv.org/abs/2408.14080)
- **Deezer/Ipsos survey (Nov 2025)**: 9,000 adults in 8 countries, three tracks each (two AI, one human). **97% failed to tell fully AI-generated tracks from human-made ones.** It is company-commissioned, covers full songs, and its methodology is not independently verified. — [Deezer newsroom](https://newsroom-deezer.com/2025/11/deezer-ipsos-survey-ai-music/)
- **Speech proxy, not singing**: in a 2025 PLOS ONE study (QMUL) on ElevenLabs voice clones, 58% of cloned voices were misclassified as human. — [QMUL press release](https://www.qmul.ac.uk/news/latest-news/2025/science-and-engineering/se/ai-generated-voices-now-indistinguishable-from-real-human-voices.html)

### Inferences
- Machine detectability of SVS artefacts is high when the generator family is known (DiffSinger remains the hardest open-source attack, at a few % EER). It collapses for unknown commercial pipelines. This mirrors speech anti-spoofing generalization problems.
- Human detection of full AI songs is already near chance for some generators (Udio), and accompaniment masks artefacts (SingFake). Isolated, a-cappella score-driven SVS is probably *easier* for humans to spot than mixed songs, but no study measures this.

### Gaps
- I found no human-listener Turing/ABX test specifically for score-conditioned SVS (academic or commercial) against matched human recordings.
- I found no published 2025/2026 SVDD challenge round or updated WildSVDD results.

---

## 4. Precision of timing / pitch / dynamics control; typical control parameters

### Takeaway
Editor-style systems give fine-grained, effectively continuous control:
- **Synthesizer V**: notes positioned in "blicks" (705,600,000 per quarter note), phoneme-timing offsets, and drawable pitch-deviation and parameter curves (loudness in dB, tension, breathiness, voicing, gender, tone shift, mouth opening).
- **OpenVPI DiffSinger**: absolute-seconds phoneme/note durations, F0 curve at 5 ms steps, and energy/breathiness/voicing/tension curves.
- **VOCALOID 6**: Dynamics/pitch-bend curves and, since v6.5, direct pitch drawing and an Air parameter.

Score-file-driven systems (NEUTRINO, Sinsy/NNSVS via MusicXML/UST) and the newest academic "score-native" or zero-shot models (VocalRender, SoulX-Singer score mode) take quantized note values and **predict their own timing**, so millisecond onset control is not a native input there. Several zero-shot models instead accept continuous F0 contours or a reference melody.

### Cited Findings
- **Synthesizer V parameters** (official docs):
  - **Loudness** −∞ to +24 dB (fine-tunes "volume (dynamics)")
  - **Tension** −2 to +2
  - **Breathiness** −2 to +2
  - **Voicing**: lowering it makes the voice "more whisper-like"
  - **Gender**: formant shift, −2 to +2
  - **Tone Shift** (Pro): changes perceived register without changing pitch
  - Parameter panel curves "over time" also include **Pitch Deviation** and **Vibrato Envelope**. — [Dreamtonics docs: parameters](https://svdocs.dreamtonics.com/en/synthv/advanced-usage/parameters); [SynthV manual: editing parameters](https://synthesizerv.com/manual/editing_parameters.htm)
- **Synthesizer V time resolution**: the scripting API defines `SV.QUARTER` = **705,600,000 blicks** per quarter note, an integer unit chosen to be divisible by common musical subdivisions. At 120 BPM one blick is about 0.7 ns, so onset placement is effectively continuous, though expressed in musical time via the tempo map. — [Dreamtonics scripting manual](https://resource.dreamtonics.com/scripting/SV.html)
- **SynthV Studio 2** adds the Phoneme Timing panel, Mouth Opening, Smart Pitch Controls, AI Retakes and Vocal Modes ([store page](https://store.dreamtonics.com/?p=47318)). It also adds pitch control points or freehand pitch drawing that "the engine tries to pass through" naturally, and an X/Y panel for expressiveness and vibrato amount ([Sound On Sound](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro)).
- **OpenVPI DiffSinger (community fork; used in OpenUtau)** "introduced variance models and parameters for prediction and control of pitch, energy, breathiness, etc." — [openvpi/DiffSinger README](https://github.com/openvpi/DiffSinger)
  - **Input format** (sample `.ds` file from the repo): `offset` in seconds (e.g., 7.0); `ph_dur` in seconds with 4 decimals (0.1 ms resolution, e.g., "0.3947 0.209 …"); `note_seq` (e.g., "D#3 C4"); `note_dur` in seconds; `note_slur`; `f0_seq` with **`f0_timestep` = 0.005 s (5 ms)**. — [openvpi/DiffSinger samples](https://github.com/openvpi/DiffSinger/tree/main/samples)
  - **Variance curves**: **Energy** (RMS of full signal, dB; deprecated in favour of voicing), **Breathiness** (RMS of aperiodic part, dB), **Voicing** (RMS of harmonic part, dB), **Tension** (logit of base-harmonic to full-harmonic energy ratio). They come from harmonic-noise separation. A duration predictor, a pitch predictor and a multi-variance predictor supply defaults that users can override. Key-shift and speed embeddings act as transition parameters. — [DiffSinger BestPractices](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md)
  - The config exposes flags `predict_dur`, `predict_pitch`, `predict_energy`, `predict_breathiness`, `predict_voicing`, `predict_tension`, a melody encoder for the pitch predictor, and glide-type embeddings. Default `hop_size` is 512 samples. — [DiffSinger ConfigurationSchemas](https://github.com/openvpi/DiffSinger/blob/main/docs/ConfigurationSchemas.md)
- **VOCALOID 6**: Dynamics, Pitch Bend and Pitch Bend Sensitivity are available on VOCALOID:AI tracks. Version 6.5 added direct pitch-curve drawing on AI parts, the Air (breath) parameter, a Vibrato Assist switch, and Leading/Following Depth in the Vibrato Tool. — [VOCALOID FAQ](https://www.vocaloid.com/en/support/faq/647); [VOCALOID learn page](https://www.vocaloid.com/en/learn/ln6214); [Wikipedia: Vocaloid 6](https://en.wikipedia.org/wiki/Vocaloid_6)
- **Sinsy / NNSVS / NEUTRINO** take MusicXML/UST scores. NNSVS converts MusicXML into HTS labels and predicts timing with a **time-lag model** (note-onset deviation) plus a duration model, normalizing phone durations "so that the sum of the predicted durations equals to the note durations". — [NNSVS, arXiv 2210.15987](https://arxiv.org/abs/2210.15987); [Sinsy, arXiv 2108.02776](https://arxiv.org/abs/2108.02776); [NEUTRINO at VocaSphere](https://vocasphere.net/2020/02/neutrino-neural-singing-synthesizer-available-for-download/)
- **Academic zero-shot and score-native control modes**
  - **SoulX-Singer** accepts MIDI notes ("score-control mode") or continuous F0 contours ("melody-control mode"). F0 control gives far better pitch accuracy: FFE (ZH) **0.044 melody mode vs 0.122 score mode**; GT-referenced FFE counts frames deviating >20% from GT F0. — [SoulX-Singer, arXiv 2602.07803](https://arxiv.org/abs/2602.07803)
  - **VocalRender** takes "lyrics, pitches, symbolic note values, and tempo" and predicts output length itself, with no duration input. It explicitly targets composers' symbolic scores rather than time-aligned input. — [VocalRender, arXiv 2607.27768](https://arxiv.org/abs/2607.27768)
  - **YingMusic-Singer** takes melody from a reference singing clip through a melody extractor, with no phoneme-level duration/pitch annotation. — [YingMusic-Singer, arXiv 2512.04779](https://arxiv.org/abs/2512.04779)
  - **Vevo2** uses a notation-free prosody tokenizer (works from speech, singing, even instruments), and duration can be controlled via its fixed token frame rates. — [Vevo2, arXiv 2508.16332](https://arxiv.org/abs/2508.16332)
- **Objective adherence numbers** (the typical metrics are FFE, F0 RMSE, FPC and duration error):
  - Vevo2 melody correlation (FPC) is 0.752 vs GT 0.815 (EN). — [Vevo2](https://arxiv.org/abs/2508.16332)
  - RMSSinger F0 RMSE is 12.2 vs GT(vocoder) 3.77; DiffSinger 12.4. — [RMSSinger](https://arxiv.org/abs/2305.10686)
  - VocalRender's human score-following MS-MOS is only 2.96 on a 1–4 scale. — [VocalRender](https://arxiv.org/abs/2607.27768)

### Inferences
- For a user who needs **millisecond-precise onsets/offsets plus continuous pitch and loudness curves**, the practical options are the editor-based systems: SynthV (musical-time blicks, phoneme timing panel, loudness in dB) and OpenVPI DiffSinger/OpenUtau (absolute seconds, 5 ms F0 grid, dB-scale voicing/breathiness curves). For DiffSinger these are native inputs. For SynthV, ms timing can be achieved by converting through the tempo map.
- The 2026 academic trend runs *away* from explicit time-aligned control: score-native models (VocalRender) and annotation-free melody guidance (YingMusic). That favours composer convenience over precise timing control. Continuous-F0 modes (SoulX melody mode, Vevo2 prosody) offer pitch precision but not separately specifiable dynamics curves.
- Loudness/dynamics control in academic zero-shot models is mostly global or prompt-level (e.g., Prompt-Singer "volume" attribute), not a frame-level curve. That is an inference from the papers reviewed: none expose frame-level loudness curves as input.

### Gaps
- I did not verify VOCALOID 6's internal tick resolution, or whether VOCALOID:AI exposes a "breathiness/exaggeration" control beyond Air and Dynamics (no official manual retrieved).
- I did not find quantitative measurements (e.g., onset error in ms) of how precisely any commercial engine honours user-specified timing.

---

## 5. Automatic modeling of expressive deviations (vibrato, portamento, overshoot, preparation, breath)

### Takeaway
Nearly all modern systems generate F0 expression automatically from notes: vibrato, glides/portamento, overshoot/preparation (implicitly via learned F0) and breath (as AP tokens or breath parameters). Dedicated modeling clearly helps, e.g., Sinsy's explicit vibrato model and NNSVS's autoregressive F0 streams. Expression is still where the residual gap lies. Pitch-naturalness MOS trails GT by ~0.8 (RMSSinger). SVCC 2025 identifies "breathy, glissando, and vibrato" as the unsolved part, and experts/listeners point to breath, melisma and unpredictability as tell-tales.

### Cited Findings
- **Sinsy (2021)** explicitly separates vibrato as sinusoidal parameters and adds a time-lag model for timing fluctuations and automatic pitch correction. It aims to reproduce "singing expressions that are not described on the musical score, such as vibrato and timing fluctuations". In NNSVS's test, Sinsy with vibrato modeling scored 2.99 vs 2.64 without it. — [Sinsy, arXiv 2108.02776](https://arxiv.org/abs/2108.02776); [NNSVS, arXiv 2210.15987](https://arxiv.org/abs/2210.15987)
- **NNSVS**: autoregressive, multi-stream F0/spectral modeling gave the best score-driven naturalness (3.86 vs recordings 4.39). DiffSinger in the same test "often generated unnatural pitches such as discontinuous F0 and unstable vibrato, especially for dynamic voices." — [NNSVS, arXiv 2210.15987](https://arxiv.org/abs/2210.15987)
- **RMSSinger** pitch-naturalness MOS-P is **3.77 vs GT 4.55** (DiffSinger 3.63), which quantifies the remaining pitch-expression gap in 2023. — [RMSSinger, arXiv 2305.10686](https://arxiv.org/abs/2305.10686)
- **XiaoiceSing** adds a residual connection in F0 prediction "to attenuate off-key issues". Its F0 model was preferred over the baseline in 97.3% of A/B tests. — [XiaoiceSing, arXiv 2006.06261](https://arxiv.org/abs/2006.06261)
- **ByteSing**: expert ratings show the largest synthetic-vs-real gaps in pronunciation and **breath**. Duration post-processing made rhythm "better than the real singer", at the cost of expressiveness. — [ByteSing, arXiv 2004.11012](https://arxiv.org/abs/2004.11012)
- **OpenVPI DiffSinger** predicts phoneme durations, pitch curves (melody encoder with glide-type embeddings) and breathiness/voicing/tension automatically; users can override. — [DiffSinger BestPractices](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md); [ConfigurationSchemas](https://github.com/openvpi/DiffSinger/blob/main/docs/ConfigurationSchemas.md)
- **Technique-controllable SVS**: TechSinger controls techniques (e.g., vibrato, breathy, glissando) and reaches MOS-C (controllability) 4.10 vs vocoded reference 4.30, with MOS-Q 3.89 vs 4.54 for the reference ([TechSinger, arXiv 2502.12572](https://arxiv.org/abs/2502.12572)). TCSinger 2 does multi-level style/technique control from text prompts, scoring MOS-C 4.19 ([TCSinger 2, arXiv 2505.14910](https://arxiv.org/abs/2505.14910)).
- **SVCC 2025** (SVC): naturalness lags "primarily due to the difficulty in modeling dynamic information in breathy, glissando, and vibrato singing styles." — [arXiv 2509.15629](https://arxiv.org/abs/2509.15629)
- **VocalRender (2026)**: professional listeners attribute perceived differences between frontier systems partly to "the realization of melismatic pronunciation". — [arXiv 2607.27768](https://arxiv.org/abs/2607.27768)
- **SONICS**: real songs show "non-standard pitch variations, intricate rhythmic complexity, and expressive techniques like melismatic phrasing", traits often absent in fakes. — [arXiv 2408.14080](https://arxiv.org/abs/2408.14080)
- **Commercial**: SynthV generates pitch, timing and timbre automatically, and "AI Retakes" produce alternative takes varying timing, pitch and/or timbre ([Sound On Sound](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro); [store page](https://store.dreamtonics.com/?p=47318)). Emotions and expressions cannot be drawn or AI-added in automation ([Gearnews](https://gearnews.com/?p=215693)). CeVIO reportedly auto-generates parameters and breath sounds from the score ([Moegirl, low reliability](https://zh.moegirl.org.cn/VoiSona)). NEUTRINO predicts timing and pitch from MusicXML ([VocaSphere](https://vocasphere.net/2020/02/neutrino-neural-singing-synthesizer-available-for-download/)).

### Inferences
- Automatic vibrato, portamento and onset deviation are standard and produce "plausible" singing. The remaining distance to human singing concentrates in long-range expressive choices: breath, melisma, dynamic variation and phrase-level unpredictability. These are exactly the features listeners and detectors key on.
- Per-phenomenon evaluation (overshoot, preparation) is essentially absent from the recent literature. Expression is evaluated holistically (MOS-P, MOS-C, FFE).

### Gaps
- I found no recent paper that quantitatively evaluates overshoot/preparation modeling separately. Most of that work predates neural SVS (e.g., Saitou et al. 2007 parametric F0 models), and I did not review it here.
- I found no quantitative evaluation of SynthV's or VOCALOID:AI's automatic expression quality.

---

## 6. Reinforcement learning / RLHF / preference optimization in SVS and singing generation

### Takeaway
RL in score-conditioned SVS is **real but recent and marginal (2025–2026)**. The concrete examples are Vevo2 (GRPO; intelligibility and prosody-similarity rewards), YingMusic-Singer (Flow-GRPO; content-accuracy and melody rewards) and YingMusic-Singer-Plus (GRPO with multiple reward models). The rewards target lyric intelligibility and melody fidelity, **not human-likeness or naturalness directly**. RL/DPO is more established in full song generation: Seed-Music RL, LeVo multi-preference DPO, and DPO/PPO/GRPO for lyric hallucination. Classic score-driven SVS lines (TCSinger 2, TechSinger, SoulX-Singer, VocalRender) do not use RL. No commercial vendor discloses RL use.

### Cited Findings
- **Vevo2 (arXiv Aug 2025)**: "multi-objective post-training" with GRPO, using an intelligibility reward model trained on the INTP preference corpus (250K speech preference pairs) plus a prosody-similarity reward, with the two group-normalized rewards summed. In zero-shot SVS, post-training cut WER from **60.83 → 24.77 (EN)** and **23.60 → 9.83 (ZH)** (Vevo2-base vs Vevo2), with similar gains in singing lyric editing (29.69 → 17.98). — [Vevo2, arXiv 2508.16332](https://arxiv.org/abs/2508.16332)
- **YingMusic-Singer (arXiv Dec 2025)** claims to "pioneer the integration of reinforcement learning into the DiT-based SVS task". It applies Flow-GRPO with "a multi-objective reward function that incorporates content accuracy and melodic accuracy". It states that "there is still a lack of research systematically applying reinforcement learning to SVS". Ablation (zero-shot editing): without post-training WER 16.75 / FPC 76.64%; with it **15.18 / 82.84%**. — [YingMusic-Singer, arXiv 2512.04779](https://arxiv.org/abs/2512.04779)
- **YingMusic-Singer-Plus (arXiv Mar 2026)** argues that "DPO suffer[s] from distribution shift" and PPO needs a costly value network, so it uses online GRPO with M reward models jointly. GRPO "resolves this trade-off by recovering PER while further improving F0-CORR and VS". — [YingMusic-Singer-Plus, arXiv 2603.24589](https://arxiv.org/abs/2603.24589)
- **YingMusic-SVC (arXiv Dec 2025)** applies Flow-GRPO to singing voice *conversion*, with rewards for vocal quality, timbre consistency and musicality. — [YingMusic-SVC, arXiv 2512.04793](https://arxiv.org/abs/2512.04793)
- **Seed-Music (Sept 2024)**: "Post-training of Seed-Music is conducted through Reinforcement Learning (RL)". Rewards are lyric edit distance (from a singing transcription model), genre accuracy and song-structure match. The paper adds that "incorporating human feedback ... can produce reward models that capture subtle user preferences", and "we leave the thorough study of RL for future work." — [Seed-Music, arXiv 2409.09214](https://arxiv.org/abs/2409.09214)
- **LeVo (Tencent AI Lab et al., arXiv Jun 2025)**: lyrics-to-song with "a multi-preference alignment method based on Direct Preference Optimization (DPO)" over semi-automatically constructed preference data, which it calls "the first attempt to apply multi-preference DPO to song generation". — [LeVo, arXiv 2506.07520](https://arxiv.org/abs/2506.07520)
- **Hallucination-free song generation (Tencent AI Lab et al., arXiv Aug 2025)**: preference data from phoneme error rate. **DPO reduced PER by 7.4%, PPO by 4.9% and GRPO by 4.7%.** — [arXiv 2508.05011](https://arxiv.org/abs/2508.05011)
- **Adjacent, not singing**: DPO for non-verbal vocalization TTS (laughter, sighs; arXiv Aug 2026). — [arXiv 2608.24163](https://arxiv.org/abs/2608.24163)
- The SVS review (Jan 2026) lists RL as a *future direction* ("apply reinforcement learning to align model behavior with human preferences"; "incorporating reinforcement learning and contrastive learning to improve perceptual quality"), which confirms that it is not yet mainstream in SVS. — [Synthetic Singers review, arXiv 2601.13910](https://arxiv.org/abs/2601.13910)
- No RL/DPO/GRPO terms appear in TCSinger 2, TechSinger or VocalRender. SoulX-Singer mentions GRPO only in citing YingMusic-SVC. This is from full-text searches of the PDFs: [TCSinger 2](https://arxiv.org/abs/2505.14910), [TechSinger](https://arxiv.org/abs/2502.12572), [VocalRender](https://arxiv.org/abs/2607.27768), [SoulX-Singer](https://arxiv.org/abs/2602.07803)

### Inferences
- RL in SVS today is used as **reward-driven post-training for controllability**: pronunciation and melody adherence via ASR/PER and F0-similarity rewards. It is not RLHF on human naturalness judgments. No SVS paper I found trains a reward on human preference ratings of singing; Vevo2's intelligibility reward is trained on *speech* preference data.
- An obvious open direction, not yet found in the literature, is RL with a singing-quality reward (e.g., SingMOS-type predictor or SVDD detector as reward). The review hints at this idea.

### Gaps
- I found no SVS/singing paper using human-preference RLHF on naturalness, and no published RL use by commercial SVS vendors.
- I did not extract LeVo's quantitative DPO gains.
