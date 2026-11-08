# Humming-specific (lyric-less) voice synthesis and note-to-expression modelling (pitch contour, loudness, breathing), as of late 2026

Scope note: these notes cover (a) what exists for synthesizing humming or lyric-less vocalise from a melody and (b) rule-based and learned models that turn a note list (pitch, onset, offset, dynamics) into an f0 contour and loudness envelope. They also cover the question of mapping a piano performance onto a voice, which matters for rendering Alfred Grünfeld's 1905 Welte-Mignon roll of Schumann's *Träumerei* as humming. General neural SVS architectures and product rankings are out of scope here. Numbers are quoted from the sources; anything I derived myself is marked as an inference.

---

## 1. Humming data and models: datasets (size, content, licence) and models that claim humming support

### Takeaway
I found humming datasets only for transcription and query-by-humming. HumTrans (2023, 56.22 h, MIDI-labelled, CC BY-NC 4.0 on Hugging Face) is the largest, and its hums are open-syllable "Da-Da-Da", not closed-mouth "mmm". I found no published model whose purpose is to generate closed-mouth humming from notes. Recent "humming" models such as Vevo2, MusicLM and YingMusic-Singer take humming as a melody *input* and output sung lyrics, music, or (in a 2026 query-by-melody study) synthetic nonsense-syllable singing.

### Cited Findings

**HumTrans (Liu, Li, Li, Shan; Tencent; arXiv Sept 2023)**
- About 56.22 hours of audio in 14,614 recording files after filtering. Source material: 500 compositions split into 1,000 melody-only segments with rests added for breathing. Each segment was hummed twice by each of 10 students (5 male, 5 female) who were music majors or proficient on at least one instrument — [HumTrans arXiv HTML](https://arxiv.org/html/2309.09623v2); [arXiv abstract](https://arxiv.org/abs/2309.09623)
- Participants were told to hum with the syllable **"Da-Da-Da"**. The paper does not describe closed-mouth humming. A score and the reference melody audio were presented during web-based recording — [HumTrans arXiv HTML](https://arxiv.org/html/2309.09623v2)
- Audio is 44.1 kHz WAV with one reference MIDI file per segment, and there are official train/valid/test splits — [Hugging Face dataset](https://huggingface.co/datasets/dadinghh2/HumTrans); baseline code is in the [GitHub repo](https://github.com/shansongliu/HumTrans)
- Licence: the Hugging Face dataset card metadata says **cc-by-nc-4.0**. The paper itself states no licence — [Hugging Face API/card](https://huggingface.co/datasets/dadinghh2/HumTrans); [arXiv](https://arxiv.org/abs/2309.09623)
- HumTrans Table 1 compares humming corpora as follows (hours, has score annotations, year): MTG-QBH 0.88 h, no, 2012; AudioSet "Humming" 1.20 h, no, 2017; MIR-QBSH 9.85 h, yes, 2009; MLEnd Hums and Whistles 29.77 h, no, 2022; HumTrans 56.22 h, yes, 2023 — [HumTrans arXiv HTML](https://arxiv.org/html/2309.09623v2)

**MLEnd Hums and Whistles (Queen Mary University of London, 2022)**
- The official site describes it as "Humming and whistling to songs • 6K audio files, 8 songs • 2 interpretations: Hums and Whistles • 235 interpreters" — [MLEnd Datasets site](https://mlenddatasets.github.io/)
- A student analysis counts 6,613 files across 8 songs, 73% hums and 27% whistles. This is a secondary source — [Plaksha student deck](https://ai3011.plaksha.edu.in/Spring%202024/PDFs/Shruti%20Laddha.pdf). Song names visible in the docs include "Potter" and "Frozen" — [mlend docs](https://mlend.readthedocs.io/en/latest/)
- The Kaggle listing (creator Jesús Requena, last updated 2022-04-22) is about 16.5 GB and its licence field reads **"Unknown"**. The dataset was "created by students at the School of Electronic Engineering and Computer Science, Queen Mary University of London" and includes demographic data — [Kaggle dataset (API metadata)](https://www.kaggle.com/datasets/jesusrequena/mlend-hums-and-whistles)
- A 2026 paper describes MLEnd as "hums and whistles of 8 songs from about 200 people, with no song recordings". Its closed-set test uses 339 whistles from 26 performers, with 136 training performers — [Whistle and Wrong Lyrics, arXiv 2610.25371 (Oct 2026)](https://arxiv.org/abs/2610.25371)

**MIR-QBSH and other query-by-humming sets**
- MIR-QBSH: "4,431 hummed or sung queries of 48 MIDI songs" — [arXiv 2610.25371 (2026)](https://arxiv.org/abs/2610.25371). HumTrans lists it at 9.85 h with score annotations (2009) — [HumTrans](https://arxiv.org/html/2309.09623v2)
- Hum2Song (Zalo AI Challenge 2021) is another query-by-humming resource, comparable to Google's Hum to Search — [arXiv 2410.20352 (2024)](https://arxiv.org/abs/2410.20352)

**Adjacent (non-humming) singing datasets the requester named**
- **vocadito** (Bittner et al., 2021): "40 short excerpts of monophonic singing, sung in 7 different languages", with f0, lyrics and two independent note annotations made by musicians. Agreement between the two note annotations is low, and quantizing f0 "does not provide a reasonable note estimate" — [arXiv 2110.05580](https://arxiv.org/abs/2110.05580). Licence on Zenodo: **CC BY 4.0** — [Zenodo record 5578807](https://zenodo.org/records/5578807)
- **GTSinger** (Zhejiang Univ., NeurIPS 2024 Spotlight): 80.59 h of studio singing by 20 professional singers in 9 languages. It annotates six techniques (mixed voice, falsetto, breathy, pharyngeal, vibrato, glissando) and includes realistic scores, manual phoneme alignments and 16.16 h of paired speech. **Humming is not one of the techniques** — [arXiv 2409.13832](https://arxiv.org/abs/2409.13832); [GitHub README](https://github.com/AaronZ345/GTSinger). Licence: **CC BY-NC-SA 4.0** plus an indemnity clause — [dataset_license.md](https://github.com/AaronZ345/GTSinger/blob/master/dataset_license.md)

**Models that claim humming support (all take humming as input)**
- **Vevo2** (CUHK-Shenzhen/ByteDance; arXiv 2508.16332, v3 March 2026): in the humming-to-singing task the inputs are "text, humming wav, singer wav" and the output is sung lyrics in the target voice — [Vevo2 arXiv v3](https://arxiv.org/html/2508.16332v3)
  - The prosody tokenizer is built on a **chromagram** rather than f0 ("octave-free"). It takes 24 chroma bins at 50 Hz and produces 6.25 Hz tokens through a 512-entry VQ codebook — [Vevo2](https://arxiv.org/html/2508.16332v3)
  - Humming appears only in evaluation (a 1,000-sample humming plus instrument test set), not in training. Humming-to-singing results for the full model: WER 17.27, SIM 0.585, F0 Pearson correlation 0.784. The paper reports no subjective scores for humming input — [Vevo2](https://arxiv.org/html/2508.16332v3)
  - Generating closed-mouth humming as *output* "is not addressed" — [Vevo2](https://arxiv.org/html/2508.16332v3)
  - The Hugging Face checkpoint lists Humming-to-Singing among its tasks and is licensed **CC BY-NC-ND 4.0** — [HF RMSnow/Vevo2](https://huggingface.co/RMSnow/Vevo2); demos at [versasinger.github.io](https://versasinger.github.io/)
- **MusicLM** (Google, 2023) "can transform whistled and hummed melodies according to the style described in a text caption" — [arXiv 2301.11325](https://arxiv.org/abs/2301.11325)
- **YingMusic-Singer** (Dec 2025): a zero-shot SVS model that synthesizes "arbitrary lyrics following any reference melody" taken from reference audio, with no phoneme alignment or annotated melody; code and checkpoints are released — [arXiv 2512.04779](https://arxiv.org/abs/2512.04779)
- **VITA-QinYu** (May 2026): an end-to-end spoken language model that treats performance elements "such as … humming a song" as part of expressive speech. It is trained on 15.8K hours of synthesized conversation, role-play and singing data and is open-sourced — [arXiv 2605.06765](https://arxiv.org/abs/2605.06765)
- **Synthetic lyric-less singing for query-by-melody** ("Whistle and Wrong Lyrics", Oct 2026):
  - A "physics-grounded generator" renders nonsense-syllable singing from 16 harmonics with 1/k tilt, filtered through three fixed resonances per vowel. Syllables (*la, na, ma, du, lu, ni, me, lo*) last 180–280 ms.
  - Its human-error model uses: drift 1 st, jitter 0.25 st, tempo stretch 0.5–1.9, one note moved ±1–2 st (p = 0.5), plus glides and vibrato.
  - A second pipeline drove YingMusic-Singer-Plus with nonsense syllables (*da, na, la, ooh, doo*). "La-la" singing came from ElevenLabs music_v2_5 conditioned on separated vocals.
  - None of these synthetic queries transferred to real queries. The commercial model's clips "copy the timing and intonation of the original vocal closely" — [arXiv 2610.25371](https://arxiv.org/abs/2610.25371)

### Inferences
- No public corpus of closed-mouth "mmm" humming with note labels turned up. HumTrans is open-syllable "da", and MLEnd has no note annotations. A model trained to *produce* hums would need new data, or a nasal-phoneme SVS workaround (Section 2).
- The licences (HumTrans CC BY-NC, GTSinger CC BY-NC-SA, Vevo2 weights CC BY-NC-ND, MLEnd "Unknown") allow non-commercial research use at most. Vevo2's ND clause may restrict distributing fine-tuned derivatives.
- Vevo2's chromagram tokenizer throws away octave and fine f0 detail. That suits melody transfer but makes it a poor tool for imposing an exact, externally specified f0 contour and timing, such as Grünfeld's roll timings.

### Gaps
- **IOACAS QBH corpus:** I could not verify its size or availability (the MIREX wiki returned 503). The numbers I remember (about 759 queries, 298 songs) are unverified, so I have not used them.
- **"Singing-to-humming" or "humming synthesis" papers:** arXiv searches found none; the closest is the 2026 synthetic nonsense-syllable work above.
- **MTG-QBH and AudioSet Humming** licences were not checked.
- **MLEnd:** total hours come only from HumTrans (29.77 h); the official site gives just "6K files".

---

## 2. How SVS tools render humming in practice; evaluations of lyric-less SVS

### Takeaway
In practice, humming in commercial and open SVS is improvised. Users type a nasal (m, n, Japanese ん "N") or a vowel ("u", "ra") as the lyric on each note. Some users fall back on sampled choir libraries with dedicated hum articulations. I found no documented "hum" phoneme or mode in Synthesizer V, ACE Studio, DiffSinger or OpenUtau, and no formal listening evaluation of lyric-less or hummed SVS output.

### Cited Findings
- In Synthesizer V "you play or paint in notes with piano roll and then type the lyrics/phonetics on each note". A user discussion notes that nasals (m, n, ng) use both the oral and the nasal cavity. The same thread mentions special phonemes `sil` (silence) and `cl` (stop), the latter from an undocumented script — [VI-Control SynthV thread](https://vi-control.net/community/threads/synthesizer-v-vocaloid-haters-might-want-to-check-this.115973/page-84)
- Users looking for hums are pointed to choir libraries with hum articulations, e.g. Orchestral Tools *Salu* Female Ensemble ("a number of humming, buzzing and syllabic articulations") — [VI-Control thread on humming/vocalising VSTs](https://vi-control.net/community/threads/vst-featuring-female-vocals-specifically-huming-and-vocalizing.167458/)
- Synthesizer V Studio 2 Pro (2025) added a mouth-opening control and vocal-mode parameters (Chest, Airy, Open, Soft). None is described as a hum mode — [Radio World](https://www.radioworld.com/tech-and-gear/products/dreamtonics-releases-synthesizer-v-studio-2-pro-update)
- On the VOCALOID Keyboard, holding the lyric-advance button enters a humming mode, and users set a single humming-like syllable such as 「ら」 (ra) or 「う」 (u) — [ITmedia, 2017](https://www.itmedia.co.jp/news/article/1711/12/1171112007/5)
- A Japanese vocal-pedagogy blog notes that Japanese ん is basically [n] (tongue on the palate), whereas humming corresponds to closed-lip [m]. This is general phonetics, not SVS documentation — [ITmedia blog, 2015](https://blogs.itmedia.co.jp/nagaichika/2015/01/post_43.html)
- DiffSinger takes lyric/phoneme, note and duration sequences as input. Its original Chinese pipeline converts lyrics to phonemes with pypinyin, so any hum has to be expressed as a phoneme in the voicebank's dictionary — [DiffSinger arXiv 2105.02446](https://arxiv.org/pdf/2105.02446). OpenUtau runs UTAU, NNSVS/ENUNU and DiffSinger voicebanks through language "phonemizers" — [GitHub singing-synthesis topic](https://github.com/topics/singing-synthesis?o=asc&s=stars)
- In 2026, open neural SVS was used to produce nonsense-syllable and "ooh"/"doo" singing from a pitch guide (YingMusic-Singer-Plus), which shows that lyric-less rendering is feasible. The study measured retrieval transfer, not naturalness — [arXiv 2610.25371](https://arxiv.org/abs/2610.25371)

### Inferences
- With current tools, the most faithful "mmm" is probably a sustained [m] lyric on every note. It needs a voicebank whose training data contains long nasal codas, which Japanese banks have for ん. Otherwise a closed vowel such as "u"/"oo" gives an "oo" vocalise. Note-by-note re-onsets need care: a single continuous [m] across legato notes avoids spurious consonant attacks.
- Sustained nasals are a small, out-of-distribution share of typical SVS training data. Long hummed notes such as the *Träumerei* melody's held tones may therefore show artefacts. Listening tests would be needed (see Gaps).

### Gaps
- I found no official documentation for a hum phoneme in Synthesizer V, ACE Studio, DiffSinger or OpenUtau. The Dreamtonics forum and ACE Studio docs did not surface in searches.
- I found no peer-reviewed evaluation (MOS or otherwise) of hummed or lyric-less SVS output.

---

## 3. Acoustics of humming (nasal murmur, source, spectral slope)

### Takeaway
A closed-mouth hum is acoustically a sustained nasal murmur. It has one strong, well-isolated low resonance near 250–300 Hz, weaker and heavily damped upper resonances, antiresonances (for bilabial /m/, roughly 1 kHz and above), and lower overall amplitude than vowels. Together these give a dark, low-passed spectrum. I found no study that measured the spectral slope of hummed versus sung tones directly.

### Cited Findings
- Nasals are voiced "but with lower amplitudes than the vowels". "F1 in characteristic 'nasal murmur' at 250 Hz", formants spaced about 850 Hz apart rather than 1000 Hz because the tract is longer, and "for non-intervocalic nasals, F1 often the only visible formant". Nasals have antiresonances (zeros) as well as poles — [OGI spectrogram-reading tutorial (Univ. Amsterdam mirror)](https://www.fon.hum.uva.nl/rob/Courses/InformationInSpeech/CDROM/Literature/LOTwinterschool2006/speech.bme.ogi.edu/tutordemos/SpectrogramReading/cse551html/cse551/node35.html)
- Fujimura's analysis of nasal consonants (JASA 34:1865–1875, 1962) is summarized as showing "a low-frequency first formant around 300 Hz that is well isolated from any formant above it, relatively high damping factors of upper formants, and the high density … of formants … including the presence of anti-formants" — [Dickson, ICPhS 1987](https://www.coli.uni-saarland.de/Phonetics/icphs/ICPhS1987/11_ICPhS_1987_Vol_5/p11.5_400.pdf)
- In a measured /m/ example from phonetics lecture notes, possible antiresonances appear at about 1000, 1800 and 3000 Hz and have "greatly attenuated the second formant peak". These values are from a teaching example, not from Fujimura — [Mannell, Macquarie Univ. nasal stops notes](https://www.mq.edu.au/__data/assets/pdf_file/0005/911642/nasal_stops.pdf)
- A resonant-voice study describes nasal murmur as primarily low-frequency energy (200–300 Hz) — [Acoustic Interpretation of Resonant Voice, J Voice 2001](https://www.sciencedirect.com/science/article/abs/pii/S0892199701000522)
- Without vocal-tract filtering, the voice source spectrum "is generally approximated by an average slope of −12 dB/octave, but it typically varies with vocal loudness" (citing Sundberg 1987) — [Umbert et al., IEEE SPM 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- An acoustic profile of Zubeen Garg's humming (J Voice 2026) reported mean jitter ≈ 0.34 and shimmer ≈ 0.18, with significant f0 differences between his humming and his singing. It found only non-significant trends towards a lower spectral centroid (P ≈ 0.11) and more roughness in humming, and no perceptual testing — [Dutta & Saikia, J Voice 2026](https://doi.org/10.1016/j.jvoice.2026.05.016)

### Inferences
- A parametric hum model consistent with these sources would use:
  - a glottal source of about −12 dB/oct, steeper when soft and flatter when loud (Section 5);
  - one pole near 250–300 Hz with a moderate bandwidth;
  - a zero near 1 kHz for /m/;
  - weak, broad upper poles spaced about 850 Hz apart;
  - total output several dB below an open vowel at the same effort.

  The synthetic singing generator in the 2026 query-by-melody paper (16 harmonics, 1/k tilt, three resonances; [arXiv 2610.25371](https://arxiv.org/abs/2610.25371)) is a similar, simpler recipe.
- Because the hum suppresses energy above about 1 kHz, the brightening that comes with louder singing (Section 5) will be much less audible in a hum. Dynamics in a hum will be carried mainly by level, not timbre.

### Gaps
- I could not consult Stevens' *Acoustic Phonetics* or Fujimura (1962) directly for exact pole and zero values or bandwidths.
- I found no long-term-average-spectrum or spectral-slope comparison of hummed versus sung tones by the same singers, and no humming-specific measurement of radiated level relative to vowels.

---

## 4. f0 expression models from notes (Saitou model, KTH rules, HMM/DNN, vibrato, portamento, jitter/drift, timing of transitions, perceived onset)

### Takeaway
The best-documented explicit note-to-f0 model is Saitou et al. (2007). It adds four fluctuations to a step-function melody: overshoot, vibrato, preparation and fine fluctuation. Three of them are second-order-system responses with published parameter values, and listeners found its output close to real singing in naturalness. The KTH rules and their Vocaloid port give note-level timing, dynamics and articulation rules, while HMM/DNN systems such as Sinsy learn the same effects from context labels. Measured data put classical vibrato at about 5.5–6.5 Hz (mean 6.0 Hz, Prame 1994), with an extent of ±34 to ±123 cents (mean ±71, Prame 1997). Pitch transients occupy roughly 120 ms at both the start and end of each note (Dai & Dixon 2019), and sung onsets are perceived at the vowel onset.

### Cited Findings

**Saitou et al. (2007) F0 control model (speech-to-singing; WASPAA 2007)**
- The input is a "score-based melody contour … described by the sum of consecutive step functions, each corresponding to a musical note". Four fluctuations are added — [Saitou, Goto, Unoki, Akagi, WASPAA 2007](https://staff.aist.go.jp/m.goto/PAPER/WASPAA2007saitou.pdf):
  1. Overshoot: "a deflection exceeding the target note after a note change".
  2. Vibrato: "a quasi-periodic frequency modulation (4–7 Hz)".
  3. Preparation: "a deflection in the direction opposite to a note change observed just before the note change".
  4. Fine fluctuation: "an irregular frequency fluctuation higher than 10 Hz".
- Overshoot, vibrato and preparation come from a second-order system H(s) = k/(s² + 2ζωs + ω²). Overshoot and preparation use the damped case (0 < ζ < 1); vibrato uses the oscillation case (ζ = 0) — [WASPAA 2007](https://staff.aist.go.jp/m.goto/PAPER/WASPAA2007saitou.pdf)
- **Fitted parameters (ω, ζ, k):** overshoot (0.0348 rad/ms, 0.5422, 0.0348); vibrato (0.0345 rad/ms, 0, 0.0018); preparation (0.0292 rad/ms, 0.6681, 0.0292). They were "determined using the nonlinear least-squared-error method … to minimize errors between the generated F0 contours and actual ones" — [WASPAA 2007](https://staff.aist.go.jp/m.goto/PAPER/WASPAA2007saitou.pdf)
- **Fine fluctuation:** white noise, "high-pass-filtered" with a cutoff of 10 Hz and a −20 dB/oct roll-off, amplitude-normalized "so that its maximum is 5 Hz", then added to the contour — [WASPAA 2007](https://staff.aist.go.jp/m.goto/PAPER/WASPAA2007saitou.pdf). A search-engine summary of the Interspeech 2007 version described the noise branch as *low-pass* filtered, so the filter type differs between descriptions; the WASPAA text explicitly says high-pass — [Interspeech 2007](https://www.isca-archive.org/interspeech_2007/saitou07_interspeech.html)
- **Companion spectral model:**
  - A singing-formant boost of 12 dB at the spectral peak near 3 kHz, with bandwidth Fb = 2000 Hz.
  - Amplitude modulation synchronized with vibrato at f_am = 5.5 Hz and depth k_am = 0.2.
  - Duration model: consonant–vowel boundary region from 10 ms before to 30 ms after the boundary (40 ms) — [WASPAA 2007](https://staff.aist.go.jp/m.goto/PAPER/WASPAA2007saitou.pdf)
- **Perceptual results:** synthesized singing had "naturalness … close to that of actual singing voices", and "F0 fluctuations are more dominant acoustic cues than the spectral characteristics" — [WASPAA 2007](https://staff.aist.go.jp/m.goto/PAPER/WASPAA2007saitou.pdf). In the 2004 precursor, removing any fluctuation lowered perceived quality, and "the effect of overshoot is the largest" — [Saitou et al., Interspeech 2004](https://www.isca-archive.org/interspeech_2004/saitou04_interspeech.pdf)

**KTH rules and related rule systems**
- KTH developed an analysis-by-synthesis rule system for sung performance from the 1970s onwards ([Sundberg, "The KTH synthesis of singing", Adv. Cogn. Psychol. 2(2–3):131–143, 2006], as summarized in [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)). Singing-related rules include:
  - Vowel onset synchronized with timing ("even though lag and lead of onset are often used for expressive purposes").
  - Spectrum slope decreases with increasing intensity (a compulsory rule, because higher subglottal pressure gives a less steep slope).
  - Vibrato depth increases with intensity.
  - "Pitch in coloratura passages": each short legato note is a rising–falling gesture, i.e. one vibrato-like cycle around the target.
  - "Pitch phrase attack": start or end from 11 semitones below target (the "bull's roaring onset"), an ornament "completely out of place in a tender context" — [Umbert et al. 2015, Table 6](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- KTH rules ported to Vocaloid (Alonso 2005; Bresin & Friberg palettes) — [Umbert et al. 2015, Table 7](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf):
  - duration contrast (shorten and soften short notes next to long ones);
  - punctuation (insert a **20 ms micropause** when a note is three tones lower than the next and 20% longer);
  - high-pitch notes get **+3 dB/octave** intensity;
  - legato vs staccato (staccato pause > 30% of the inter-onset interval);
  - phrasing arch (tempo and energy rise at phrase start, fall at phrase end) and final ritardando;
  - attack, transition and release pitch and energy shapes;
  - vibrato and tremolo as a cosine plus random fluctuation;
  - brightness rises with energy.
- The general KTH performance rule system is described in [Friberg, Bresin & Sundberg, "Overview of the KTH rule system for musical performance", Adv. Cogn. Psychol. 2006] — cited in [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- Vocaloid's corpus-derived rules use anchor points for pitch and intensity, interpolated at synthesis; the number of points per note depends on duration. The vowel onset is synchronized with the note onset — [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)

**HMM/DNN (Sinsy) approaches**
- HMM-based singing synthesis (Sinsy, Oura et al.) uses phoneme, mora, note, phrase and song context labels. These include the musical tone, key, tempo, length and **dynamics** of the previous, current and next notes, position within the current crescendo or decrescendo, tie and slur flags, and distance to accents and staccato — [Umbert et al. 2015, Table 8](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- The DNN Sinsy has a time-lag model (deviations of sung onsets from the score), a duration model, an acoustic model with "improved approaches to modeling pitch and vibrato", and automatic pitch correction — [Hono et al., arXiv 2108.02776 (2021)](https://arxiv.org/abs/2108.02776)

**Vibrato data**
- Vibrato rate (10 singers, Schubert *Ave Maria* CDs): mean 6.0 Hz. Rate "typically increased at the end of each tone, +15% in average", with no typical structure at tone beginnings and a within-artist variation of about ±8% — [Prame, JASA 96, 1994](https://doi.org/10.1121/1.410141)
- A secondhand account of the same study gives individual singers from about 5.5 Hz (Pavarotti) to 6.7 Hz (Marian Anderson) — [MMD post, 1999](https://www.mmdigest.com/archives/Digests/199910/1999.10.13.09.html)
- Vibrato extent: mean per tone between **±34 and ±123 cents**, overall mean **±71 cents**; "Informal measurements on Verdi opera arias showed much higher figures". Extent correlates negatively with tone duration — [Prame, JASA 102, 1997](https://doi.org/10.1121/1.419735)
- Operatic vibrato: "a rate that tends to range from 5.5 to 7.5 Hz and a depth around ±0.5 or 1 semitones" — [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- Classical vs jazz (48 professional singers, a sustained note in *Summertime*). Extent here is **peak-to-peak**:

  | Group | Rate | Extent (p-p) | Vibrato duration |
  |---|---|---|---|
  | Male classical | 6.03 ± 0.95 Hz | 82 ± 35 cents | 2.3–2.6 s (classical) |
  | Male jazz | 6.09 ± 0.62 Hz | 67 ± 20 cents | 1.1–1.2 s (jazz) |
  | Female classical | 5.82 ± 0.76 Hz | 145 ± 52 cents | 2.3–2.6 s (classical) |
  | Female jazz | 6.16 ± 0.71 Hz | 53 ± 17 cents | 1.1–1.2 s (jazz) |

  Rates did not differ between groups. Extent was larger in operatic singers, especially females, and vibrato jitter and shimmer were larger in jazz — [Manfredi et al., J Voice 29(4), 2015](https://flore.unifi.it/bitstream/2158/953249/5/Automatic-Assessment-of-Acoustic-Parameters-of-the-Singing-Voic_2015_Journal.pdf)

**Transitions, drift, timing relative to onsets**
- In SATB quartet singing, "there are transient parts of approximately 120 ms duration at both the beginning and end of a note, where the pitch varies rapidly". Transient shapes depend on the adjacent pitch, singers "tend to have a descending transient at the end of a note", and onset shapes differ between female and male singers — [Dai & Dixon, JASA 2019](https://doi.org/10.1121/1.5120483)
- Unaccompanied singing (24 singers, about 50 s recordings): median absolute intonation drift 11 cents, median note error 19 cents, and drift significant in 22% of recordings — [Mauch, Frieler & Dixon, JASA 2014](https://doi.org/10.1121/1.4881915)
- Maximum speed of voluntary pitch change: the time to complete a whole pitch shift ("excursion time") is "nearly twice as long as response time". Speed "varies quite linearly with excursion size" and differs between rises and falls; speech often approaches this limit — [Xu & Sun, JASA 2002](https://doi.org/10.1121/1.1445789). The singing-specific counterpart is Sundberg (1979), "Maximum speed of pitch changes in singers and untrained subjects", J. Phonetics — [DOI](https://doi.org/10.1016/s0095-4470(19)31040-x) (numbers not retrieved)
- **Perceived onset of sung notes:** in Lieder, vowel onsets lagged the piano accompaniment by a mean of 3 to 50 ms for all singers in two songs (*Ich kann's nicht fassen*, *Seit ich ihn*), and by close to 0 in *Die Rose*. The study frames this with the p-centre, the perceptual beat of a syllable near the vowel's rapid amplitude rise — [Sundberg & Bauer-Huppmann, "When does a sung tone start?", J Voice 21(3):285–293, 2007](https://www.sciencedirect.com/science/article/abs/pii/S0892199706000051) (details via search abstracts)
- Common SVS practice is that "the first vowel onset in a syllable is synchronized with the note onset and any preceding phoneme in the syllable is" placed before it — [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)

### Inferences
- **Saitou parameters converted to time constants (my calculations).**
  - Overshoot: ω = 34.8 rad/s gives a natural frequency of about 5.5 Hz. With ζ = 0.54 the damped ringing is about 4.7 Hz and the 2% settling time ≈ 4/(ζω) ≈ 210 ms.
  - Preparation: ζω ≈ 0.0195 /ms, settling ≈ 205 ms.
  - Vibrato: ω = 34.5 rad/s ≈ 5.5 Hz, which matches the 5.5 Hz amplitude-modulation rate the authors chose.

  So each note change carries a deviation of about 200 ms, beginning just before the change (preparation) and ending after it (overshoot). This fits the roughly 120 ms transients that Dai & Dixon measured at both note ends.
- **Applying this to Grünfeld's roll** (each perforation gives onset and offset):
  1. Treat each roll onset as the hum's perceptual onset (p-centre).
  2. Centre the f0 transition on that onset, starting about 50–100 ms before it.
  3. Add a Saitou-style overshoot after it.
  4. Start vibrato only on longer notes, with a delayed onset and a rate rising about 15% towards the note end (Prame 1994).
  5. Make vibrato extent smaller on long notes (Prame 1997) and larger at higher intensity (KTH).

  For a closed "mmm" there is no consonant–vowel boundary, so the 3–50 ms vowel-lag finding applies only loosely.
- **Vibrato convention:** "±71 cents" (Prame, half-extent) and "82 cents" (Manfredi, peak-to-peak) are different conventions, so take care when choosing a depth parameter.

### Gaps
- I did not obtain the full text of Sundberg (2006), "The KTH synthesis of singing", so specific KTH parameter values (e.g. vibrato onset delay) are missing.
- I found no source giving explicit portamento durations in classical singing beyond the ~120 ms transient figure. I also did not retrieve Xu & Sun's fitted equations or Sundberg (1979)'s numbers.
- I found no standard values for phonatory jitter and shimmer in trained singing; the 2026 humming study's units are unclear.
- How Saitou's preparation (an *anticipatory* deflection) is implemented causally, e.g. by time-reversed filtering, is not described in the text I extracted.
- I could not retrieve Vos & Rasch (1981), "The perceptual onset of musical tones" ([DOI](https://doi.org/10.3758/bf03207341)), which deals with perceived onsets of slowly rising tones; its thresholds are therefore not reported.

---

## 5. Loudness: within-note shaping (messa di voce), intensity vs spectral tilt, dynamic range, breathing

### Takeaway
Vocal loudness is controlled mainly by subglottal pressure, and higher pressure flattens the spectral slope. In baritones, a 10 dB rise at 600 Hz brings a 16 dB rise at 3 kHz. A synthetic hum therefore needs loudness and brightness coupled, although the nasal filter will hide much of the brightening. *Messa di voce* (crescendo–decrescendo on one note) is an exercise in graded control of expiratory pressure, and it is often asymmetric. I found no published dynamic range for humming specifically. Breath data from Lieder show shorter phrase-medial than phrase-initial inhalations, but the paper gives no millisecond values.

### Cited Findings
- **Intensity vs spectral tilt (baritones):** "a 10-dB increase at 600 Hz was accompanied by a 16-dB increase at 3 kHz" (5 professional baritones, loudest to softest, at 25/50/75% of range) — [Sjölander & Sundberg, JASA 2004](https://doi.org/10.1121/1.1646403)
- **Intensity vs spectral tilt (speech LTAS):** in 31 untrained voices the Leq range was about 28 dB (27.9/28.4 dB). The rate of spectrum-level increase per dB of Leq went from "about 0.5 at low frequencies to about 1.5 in the frequency range 1.5–3 kHz" — [Nordenberg & Sundberg, Logoped Phoniatr Vocol 2004](https://pubmed.ncbi.nlm.nih.gov/15764212/)
- The alpha ratio (energy above vs below 1 kHz) ranged over 19.0 dB (female) and 11.7 dB (male) across loudness levels and is predictable from Leq — [Sundberg & Nordenberg, JASA 2006](https://pubmed.ncbi.nlm.nih.gov/16875241/)
- "Vocal effort is primarily related to the spectrum slope of the glottal sound source rather than the overall sound level". Intensity also rises with f0 to keep loudness similar — [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf). Related KTH/Vocaloid rules: spectrum slope decreases with intensity, high notes get +3 dB/octave, and brightness rises with energy — [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- In Saitou's model, the singing-formant amplitude and overall envelope are modulated in sync with vibrato (AM at 5.5 Hz, depth 0.2), following Oncley (1971) — [Saitou et al. 2007](https://staff.aist.go.jp/m.goto/PAPER/WASPAA2007saitou.pdf). Umbert et al. call this tremolo, "the vibrato counterpart observed in intensity", caused by harmonics moving relative to formants — [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- **Messa di voce (Titze et al. 1997):** six trained singers. Symmetry between crescendo and decrescendo depends on subglottal pressure and peak airflow, and "Subjects also differed greatly in their soft–loud dynamic ranges" — [Titze et al., JASA 1997](https://doi.org/10.1121/1.420208)
- **Messa di voce at two speeds (Köberlein et al. 2025):** ten professional singers on [i:] with 3 s or 1 s phases.
  - Most showed no correlation between vibrato and the SPL course.
  - In five subjects the decreasing phase of the slow task was 1–2 s longer.
  - "The majority of subjects ended the tasks softer than they had started".
  - SPL variation is "mainly controlled on vocal fold level rather than by vocal tract resonances" — [Köberlein et al., PLoS One 2025](https://doi.org/10.1371/journal.pone.0325284). The untrained comparison group is in [Kirsch et al., PLoS One 2025](https://doi.org/10.1371/journal.pone.0314457)
- A 2026 narrative review describes messa di voce, *filar il suono* and sustained tones as "exercises in graded expiratory pressure control" — [Jin & Ryu, J Voice 2026](https://doi.org/10.1016/j.jvoice.2026.06.042)
- Phrasing is an "arch-like shape" applied to both tempo and intensity across a phrase. The intensity contour rises and decays at the start and end of each note — [Umbert et al. 2015](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf)
- **Breathing in Lieder (six professional singer–pianist duos, 2026):**
  - 282 inhalations analysed (141 by singers; 130 phrase-initial, 152 phrase-medial). Singers took 14–17 breaths per performance of Schubert's *Die Liebe hat gelogen* and 7–10 in Lang's *Scheideblick*.
  - Phrase-medial inhalations were significantly shorter than phrase-initial ones (log-duration coefficient −0.596, p = 0.0005).
  - Breathing was "more synchronized … at the beginning of a musical phrase", and pianists' inhalation onsets came earlier: "pianists seem to anticipate the singing part".
  - The paper reports no absolute durations in ms — [Frontiers in Psychology 2026](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1888535/full)
- HumTrans melodies were edited to include rests "for breathing", acknowledging that phrase-level breath gaps are needed even in humming — [HumTrans](https://arxiv.org/html/2309.09623v2)

### Inferences
- For loudness-to-timbre coupling in a synthetic hum, the Sjölander & Sundberg ratio (about +1.6 dB at 3 kHz per +1 dB at 600 Hz) or the Nordenberg & Sundberg gain factors (0.5 low to 1.5 at 1.5–3 kHz) can be applied to the source before the nasal filter. Because the nasal filter attenuates the upper spectrum, the audible result will be a modest darkening at soft dynamics.
- Long *Träumerei* notes should not have flat envelopes. A slight swell or decay within each note, shaped by the phrase arch and ending softer, is supported by the messa di voce and phrasing data, and level should rise slightly with pitch (+3 dB/oct rule).
- Breath gaps would have to be inserted at phrase boundaries. Where the piano roll has no gap (pedalled legato), the synthesis must "steal" time from the preceding note's offset.

### Gaps
- I found no measured dynamic range (dB) for humming vs open singing. The only ranges found are speech (~28 dB Leq) and individual singers' soft–loud variation (qualitative in Titze 1997).
- I found no absolute inhalation durations (ms) for classical singers between phrases. Thomasson & Sundberg (1999), "Consistency of phonatory breathing patterns in professional operatic singers", J Voice ([DOI](https://doi.org/10.1016/s0892-1997(99)80008-3)), was located but its abstract was not available.
- I found no published model of where singers place breaths given a note list.

---

## 6. Mapping a piano performance (onset/velocity) onto voice

### Takeaway
I found no study that transfers a pianist's measured timing and dynamics directly onto a sung or hummed rendering. The relevant pieces are listed below. In this literature, *Träumerei* is one of the most-analysed piano performance pieces (Repp 1992, 1996). Piano "melody lead" of about 30 ms is mostly a hammer-velocity artefact. Sung onsets are perceived at the vowel onset (p-centre). Welte reproducing-piano rolls encode dynamics in bass and treble expression channels rather than as clean per-note velocities. The 19th-century cantabile ideal, Thalberg's *L'art du chant appliqué au piano*, holds that pianists should imitate singers.

### Cited Findings
- **Repp (1992):** 28 recorded performances of *Träumerei*. Global timing reflects the hierarchical grouping (ritardandi at section ends, lengthening of accented tones), and within-gesture ritardandi follow "a parabolic timing function". Cortot and Horowitz stand out as individual — [Repp, JASA 92, 1992](https://doi.org/10.1121/1.404425)
- **Repp (1996):** 10 pianists on a Disklavier, *Träumerei* dynamics.
  - The soprano melody was played louder than other voices.
  - "Velocity [tended] to increase with pitch".
  - Velocities tended to rise with local tempo, though with salient exceptions.
  - Individual differences in dynamics were only weakly related to those in timing — [Repp, JASA 100, 1996](https://doi.org/10.1121/1.415889)
- **Melody lead:** the melody tends to be played "about 30 ms earlier (melody lead)" at hammer–string level. The lead "decreases almost to zero at the finger-key level", supporting the velocity-artefact hypothesis (22 pianists, Bösendorfer SE) — [Goebl, JASA 2001](https://doi.org/10.1121/1.1376133)
- **Imitation:** when pianists imitated model performances, "imitating different dynamic patterns affected expressive timing, whereas imitating different timing patterns had little effect on produced dynamics" — [Repp 2000 (via ResearchGate)](https://www.researchgate.net/publication/271787141_Pattern_Typicality_and_Dimensional_Interactions_in_Pianists'_Imitation_of_Expressive_Timing_and_Dynamics)
- **Voice vs piano onsets:** in Lieder, singers' vowel onsets lagged the piano by 3–50 ms in some songs and by about 0 in another — [Sundberg & Bauer-Huppmann 2007](https://www.sciencedirect.com/science/article/abs/pii/S0892199706000051). Pianists' inhalations precede singers', i.e. they anticipate the vocal phrase — [Frontiers 2026](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1888535/full)
- **Cantabile and Thalberg:** *cantabile* in instrumental music is "a particular style of playing designed to imitate the human voice", and in later piano music it often means projecting one line over the accompaniment — [Wikipedia: Cantabile](https://en.wikipedia.org/wiki/Cantabile). Thalberg's *L'art du chant appliqué au piano* Op. 70 (24 vocal transcriptions, 1853–1863, with a preface of technical principles) was explicitly meant to teach pianists to reproduce vocal expressiveness and breath — [Paul Wee/Interlude review](https://interlude.hk/paul-wee-sigismond-thalberg-lart-du-chant/)
- **Welte dynamics encoding:**
  - In the later Welte-Mignon *Licensee* format, bass and treble expression are coded on separate channel groups split at F#4 (channels 1–6 bass, 93–98 treble) — [ISMIR 2017 paper on reproducing rolls](https://archives.ismir.net/ismir2017/paper/000025.pdf)
  - "The volume of the bass and treble is controlled separately. Because of this the dynamic differentiation of notes sounded simultaneously is to a certain extent limited" — [Tacet: What is Welte-Mignon?](https://www.tacet.de/en_us/was-ist-welte-mignon/)
  - The original Freiburg T-100 system (1901–1904 development) differs from Licensee — [MMD, 2003](https://www.mmdigest.com/archives/Digests/200309/2003.09.27.04.html)
  - Whether Welte's recording piano captured per-key dynamics is disputed. A Welte expert argues it did ([MMD, 2003](https://www.mmdigest.com/archives/Digests/200309/2003.09.27.04.html)); the Pianola Institute says the usual account "is contradicted by the small amount of documentary evidence that has actually survived" ([Pianola Institute factsheet](https://pianola.org/factsheets/welte_recording.cfm))

### Inferences
- **Onset mapping.** Hammer-level melody lead (~30 ms) is largely a velocity artefact, while sung notes are heard at the vowel or p-centre. For a hum, it is defensible to align the hum's perceptual onset, not its acoustic start, with the roll's melody onset. A hum's "m" attack rises in amplitude more slowly than a piano hammer strike, so the hum's acoustic start may need to begin a few tens of ms earlier to sound simultaneous. This is untested and should be verified by listening.
- **Offset mapping.** A piano tone decays from the moment of the strike, and the roll's hole length marks key-down time. The hum sustains at controlled level until its offset, so roll offsets map naturally onto hum offsets. Sustain-pedal legato on the roll has no vocal counterpart and has to be turned into legato hum or breath gaps.
- **Dynamics mapping.**
  - A hammer velocity sets an initial level that then decays. A sung or hummed "dynamic" is a sustained level plus an envelope shape (Section 5).
  - With Welte rolls the melody's dynamic is the treble expression level, shared with any treble accompaniment notes, not a per-note velocity. Any voice rendering therefore inherits a smoothed, half-keyboard dynamic curve.
  - Repp (1996) shows melody velocity correlates with pitch and local tempo, so a pitch-dependent loudness term (also KTH "+3 dB/octave") is consistent with both piano and voice practice.
- **Timing.** The parabolic within-gesture timing that Repp found across 28 *Träumerei* performances means Grünfeld's tempo shaping can be transferred directly, since it is phrase-level and instrument-independent. Note-level piano artefacts such as chord spreading and melody–bass dislocation have no direct vocal analogue and should be decided case by case.

### Gaps
- I found no empirical study comparing the same melody's expressive timing or dynamics when played on piano and when sung or hummed by the same musician.
- I found no perception study of onset asynchrony between a voice and a piano-derived timing grid beyond Sundberg & Bauer-Huppmann 2007.
- I did not verify the exact T-100 (red Welte, as used c. 1905) expression channel layout or split point; the F#4 split is documented for the Licensee format only. The roll-specific expression decoding is presumably covered by the companion research notes.
- Grünfeld-specific performance analyses (e.g. whether Repp's 28-recording sample included Grünfeld) were not checked.
