# Open-source toolchains for rendering an exact melody (ms onsets/offsets, pitch, dynamics) as synthetic singing or humming, plus prior work on voicing piano-roll/performance data (status: late October 2026)

Method note: the GitHub REST API was blocked in this session, so repositories were read via raw.githubusercontent.com and shallow `git clone`. "Last commit" dates come from `git log -1` on 2026-10-24. Hugging Face licence fields come from the public HF model API (`https://huggingface.co/api/models/<id>`). Statements marked "source inspection" were verified directly in the cloned code at the URL given.

## OpenUtau + DiffSinger voicebanks (ONNX): scripting, available voicebanks, licences, languages, hum phonemes

### Takeaway
DiffSinger is the most controllable open option. Its native `.ds` JSON input is tempo-free: offsets and note/phoneme durations are in seconds, F0 is sampled every 5 ms, and frame-level loudness-like curves (energy/voicing) are supported. The practical catch is tooling. OpenUtau, which hosts the free ONNX community voicebanks, is GUI-only: it has no CLI or batch-render mode. openvpi's `scripts/infer.py` runs PyTorch checkpoints, not the ONNX voicebanks people distribute. Driving ONNX voicebanks from a script therefore needs a third-party runner (e.g. Jobsecond's C++ `ds_onnx_infer`, a work in progress) or a small home-made onnxruntime pipeline that mirrors OpenUtau's `DiffSingerRenderer.cs`. Voicebank licences are set per voicebank, as bespoke character terms. They usually allow non-commercial use, often forbid redistribution, and sometimes add AI-related restrictions.

### Cited Findings
**openvpi/DiffSinger (engine)**
- openvpi/DiffSinger is the maintained refactor of DiffSinger. It provides 44.1 kHz output and "variance models and parameters for prediction and control of pitch, energy, breathiness, etc." It is licensed Apache 2.0 and names OpenUTAU (and DiffScope, "under development") as its production front-ends — [openvpi/DiffSinger README](https://github.com/openvpi/DiffSinger). Last commit was 2026-10-16, so it is actively maintained (git log of https://github.com/openvpi/DiffSinger).
- Requirements are Python ≥ 3.10 and PyTorch ≥ 2.4. Inference "is based on DS files": `python scripts/infer.py variance my_song.ds --exp my_experiment` and `python scripts/infer.py acoustic my_song.ds --exp my_experiment`. Deployment format is ONNX (`python scripts/export.py acoustic --exp ...`) — [GettingStarted.md](https://github.com/openvpi/DiffSinger/blob/main/docs/GettingStarted.md).
- `infer.py acoustic` has the options `--spk` (speaker or speaker mix), `--lang`, `--key` (transpose), `--gender` (formant shift, −1…1), `--steps` (diffusion sampling steps) and `--mel`. It loads a training checkpoint plus `vocoder_ckpt` from the hparams (source inspection) — [scripts/infer.py](https://github.com/openvpi/DiffSinger/blob/main/scripts/infer.py).
- DS files are "JSON files with .ds suffix that contain phoneme sequence, phoneme durations, music scores or curve parameters". The "current recommended way of using a model for production purposes is to use OpenUTAU for DiffSinger. It can export DS files as well" — [BestPractices.md](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md).
- The bundled sample `.ds` files are lists of segments with the keys `offset` (seconds, e.g. "7.0"), `text`, `ph_seq`, `ph_dur` (seconds), `ph_num`, `note_seq` (note names such as `D#3`, `rest`), `note_dur` (seconds), `note_slur`, `f0_seq` and `f0_timestep` ("0.005") (source inspection) — [DiffSinger samples/](https://github.com/openvpi/DiffSinger/tree/main/samples).
- Division of labour between the models: the variance model takes phonemes, word division, word durations and the score, and outputs phoneme durations, the pitch curve and other parameters. The acoustic model needs `ph_seq`, `ph_dur` and F0. Variance parameters "do not have default values, so they are usually obtained from the variance model at inference time" — [BestPractices.md](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md).
- Loudness-like curves:
  - Energy is the RMS curve in dB. It is "no longer recommended in favor of the new voicing parameter".
  - Voicing is the RMS of the harmonic part in dB.
  - Breathiness is the RMS of the aperiodic part.
  - Tension changes timbre.
  - "changing voicing (or energy) will change the loudness but keep the timbre."
  - Energy, breathiness and voicing "should NOT be enabled together."
  
  Source: [BestPractices.md](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md).

**OpenUtau (the host for ONNX voicebanks)**
- OpenUtau is "a free, open-source editor made for the UTAU community". It ships Windows and Linux x64 zips, runs on Windows, macOS and Linux, and supports ENUNU AI singers — [stakira/OpenUtau README](https://github.com/stakira/OpenUtau). The licence is MIT ([LICENSE.txt](https://github.com/stakira/OpenUtau/blob/master/LICENSE.txt)). Last commit was 2026-10-21, so it is very active (git log).
- No command-line renderer (source inspection): the only command-line handling opens a single project file (`if (args.Length == 2 && File.Exists(args[1])) … LoadProject`). "Headless" code exists only in the UI test project — [MainWindowViewModel.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau/ViewModels/MainWindowViewModel.cs), [OpenUtau.UiTest/HeadlessUi.cs](https://github.com/stakira/OpenUtau/tree/master/OpenUtau.UiTest). A web search also found no documented CLI/batch export. Audio export is via File → Export Audio — [fileinfo.com USTX](https://fileinfo.com/extension/ustx).
- Import formats (source inspection) are USTX, VSQ3/VSQ4 (VOCALOID VSQX), UST, MIDI, UFDATA, MusicXML (detected by `score-partwise`) and SVP (Synthesizer V) — [Formats.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/Format/Formats.cs). USTX projects are YAML — [fileinfo.com](https://fileinfo.com/extension/ustx).
- Timing grid (source inspection): the project resolution is hard-coded as `public int resolution => 480;`. A tempo map (`List<UTempo> tempos`, default 120 bpm) supports tempo changes — [UProject.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/Ustx/UProject.cs).
- Dynamics (source inspection):
  - OpenUtau registers a "dynamics (curve)" expression `dyn` with range −240…120 — [USTx.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/Format/USTx.cs).
  - The DiffSinger renderer samples the `DYN`, breathiness (`BREC`), tension (`TENC`), velocity (`VELC`), energy (`ENE`) and voicing curves into frame-level tensors fed to the ONNX acoustic model.
  - `VELC` is consonant speed on a "logarithmic scale, Default value 100 = original speed". It is not loudness.
  
  Source: [DiffSingerRenderer.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/DiffSinger/DiffSingerRenderer.cs).
- DiffSinger phonemizers in the OpenUtau source tree cover Chinese, Jyutping (Cantonese), English (ARPAbet and ARPA+), Filipino, French, German (`DIFFS DE`, plus a "GermanMarzipan" variant), Italian, Japanese, Korean, Portuguese, Russian and Spanish, plus a generic G2p phonemizer and a "Rhythmizer" (directory listing) — [OpenUtau.Core/DiffSinger/Phonemizers](https://github.com/stakira/OpenUtau/tree/master/OpenUtau.Core/DiffSinger/Phonemizers).
- Voicebank layout: an OpenUtau DiffSinger voicebank has a root `dsconfig.yaml` for the acoustic model. Optional `dspitch/dsconfig.yaml` and `dsvariance/dsconfig.yaml` folders hold the pitch and variance predictors — [OpenUtau DiffSingerSinger.cs](https://github.com/openutau/OpenUtau/blob/master/OpenUtau.Core/DiffSinger/DiffSingerSinger.cs) (via search summary); [OpenUtau wiki: Voicebank development](https://github.com/stakira/OpenUtau/wiki/Voicebank-development).

**Running ONNX voicebanks outside OpenUtau**
- Jobsecond/diffsinger-onnx-infer is a C++ CLI. Usage: `ds_onnx_infer --ds-file <.ds> --acoustic-config <dsconfig.yaml> --vocoder-config <vocoder.yaml> [--spk "name1:0.25|name2:0.75"] --out out.wav [--ep cpu|directml|cuda]`. Its README says "still working in progress. Tested on Windows only." Last commit was 2024-04-13 — [Jobsecond/diffsinger-onnx-infer](https://github.com/Jobsecond/diffsinger-onnx-infer).
- `ds2svc` (PyPI) only detects and extracts SVC models disguised as DiffSinger voicebanks. Its inference step is "planned", so it is not a general runner — [ds2svc on PyPI](https://pypi.org/project/ds2svc/).

**Voicebank availability and licences**
- One community list ([haru0l's DiffSinger page](https://sites.google.com/view/haru0l/diffsinger)) gives no licence terms. It names:
  - Japanese: No.7 (SEVEN), Namine Ritsu (canon-voice.com), Deshimaru Gakuto, PJS, Otozora Rinly, Printto Magicbeat, Kurobousoku, Hikuine Kiiro
  - Chinese: ZhiBin, 灰雨千
  - English: Peiton DS, Tiger, POTG
  - Russian: Keiro, Monone, Ashera Lyre (the last three also EN/JP) and Llane Crow
  - Brazilian Portuguese: Umidaji Rainbow-α
  - Polish: PIX AI v2.0
  - Thai: Printto Magicbeat Thai
- The page points to the DiffSinger Discord (discord.gg/JtKYyZgmGt) as the community hub.
- Licence examples:
  - NoLyui (DiffSinger) allows several commercial uses for original music without authorization. Redistribution always requires the voicer's permission, and derivatives must inherit the restrictions — [nolyui.carrd.co](https://nolyui.carrd.co/).
  - AltEOS/MindLess terms say "usage of AI tools like DiffSinger or RVC is prohibited in any way, even if personal usage, unless the provider gives permission" — [alteos-mindless.carrd.co](https://alteos-mindless.carrd.co/).
  - Peiton sells a separate "DIFFSINGER+UTAU COMMERCIAL-USE LICENSE" — [nebm.gumroad.com](https://nebm.gumroad.com/l/vvhyg).
  - Vocoders carry their own licences. Two LoFiVocoder repos are marked "other" and CreativeML OpenRAIL-M respectively — [usamireko/LoFiVocoder](https://huggingface.co/usamireko/LoFiVocoder/blob/main/README.md), [PC-DDSP-LoFiVocoder](https://huggingface.co/usamireko/PC-DDSP-LoFiVocoder/blob/e67306bf29a9662a46fd51149cf5b211db2ca633/README.md).
- Few DiffSinger voicebanks are on Hugging Face. An HF search for "diffsinger" returned only six models, e.g. `karl-wang/Carl-timbre-diffsinger` (cc-by-nc-nd-4.0) and `LogiAI10/diffsinger-mobile-onnx` (MIT) — [HF API search](https://huggingface.co/api/models?search=diffsinger). Most voicebanks are distributed as ZIPs from voicer pages, via a "DiffSinger Custom Voicebank Share Page" or the UTAU wiki — [OpenUtauMobile README](https://github.com/vocoder712/OpenUtauMobile).
- Namine Ritsu exists as a voicebank for Sinsy, ENUNU, DiffSinger, RVC, VOICEVOX and others — [Vocal Synth wiki: Namine Ritsu](https://vocalsynth.fandom.com/wiki/Namine_Ritsu).

**Hum phonemes**
- Japanese voicebanks use the moraic nasal `N` (ん). ENUNU's README shows `[N]` entered as its own note in direct-phoneme input (`[i][r a][N][k a]…`) — [ENUNU README](https://github.com/oatsu-gh/ENUNU). OpenUtau's DiffSinger Japanese phonemizer emits `"N"` (source inspection) — [DiffSingerJapanesePhonemizer.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/DiffSinger/Phonemizers/DiffSingerJapanesePhonemizer.cs).
- The English DiffSinger phonemizer's ARPAbet set contains `m`, `n` and `ng`. The German phonemizer also has `m`, `n` and `ng` (source inspection) — [DiffSingerEnglishPhonemizer.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/DiffSinger/Phonemizers/DiffSingerEnglishPhonemizer.cs), [DiffSingerGermanMarzipanPhonemizer.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/DiffSinger/Phonemizers/DiffSingerGermanMarzipanPhonemizer.cs).
- The bundled Mandarin dictionary `opencpop-extension.txt` has no stand-alone `m`/`n`/`ng` syllable. A grep found only `en` (source inspection) — [DiffSinger dictionaries](https://github.com/openvpi/DiffSinger/tree/main/dictionaries).

### Inferences
- For millisecond-exact rendering, write `.ds` files directly. Note onsets and durations are absolute seconds, so no tempo mapping is needed:
  - put each phrase's start in `offset`;
  - give note lengths in `note_dur`;
  - list one or more phonemes per note via `ph_seq`/`ph_num`.
  
  Run the voicebank's variance model to predict phoneme durations, F0 and voicing. Then overwrite `f0_seq` and the voicing/energy curve (5 ms grid) with your own data before the acoustic pass. This works natively with `infer.py` only if you have the PyTorch checkpoints. Community voicebanks are ONNX, so you need `ds_onnx_infer` or a home-made onnxruntime script. Porting the tensor wiring of `DiffSingerRenderer.cs` (tokens, durations, f0, velocity, energy/voicing, speaker embedding → mel → vocoder) to Python is a modest job. CPU inference is feasible because `ds_onnx_infer` defaults to the CPU execution provider.
- The OpenUtau GUI route is still usable as a semi-manual step:
  1. Generate a USTX (YAML) or MIDI/MusicXML file programmatically, setting tempo so that ticks map cleanly to ms. At 480 PPQ, 125 bpm gives exactly 1 ms per tick (60000 / 125 / 480 = 1.0); 62.5 bpm gives 2 ms per tick.
  2. Write loudness as the `dyn` curve or the voicing/energy expression curves.
  3. Open the file in OpenUtau and use File → Export Audio.
- For humming, set every note's lyric to `N` in a Japanese DiffSinger, ENUNU or Sinsy voice. With English/German voicebanks, try phoneme strings such as `m` or `n` held for the full note. Training corpora contain few long sustained nasals, so quality must be checked by ear. Closed-vowel `u` is a fallback.
- For a scholarly project, the licence risk sits with the voicebank, not the engine (DiffSinger is Apache-2.0, OpenUtau MIT). Pick a voicebank whose terms explicitly allow non-commercial or academic publication and audio redistribution, and credit the voicer.

### Gaps
- I found no authoritative, licence-annotated master list of DiffSinger voicebanks. The "Custom Voicebank Share Page" was not located.
- I did not verify the exact terms of the specific voicebanks named above (e.g. ZhiBin, Ritsu DiffSinger, PJS, Tiger), including whether any contains an explicit "no AI training" clause.
- I did not confirm whether openvpi or the OpenUtau team plans an official headless renderer. DiffScope is listed only as "under development".

## NNSVS / ENUNU: pretrained models, downloads, input formats, sub-grid timing

### Takeaway
NNSVS is a research library with a clean Python API: `SPSVS(model_dir).svs(hts_labels)` on CPU. Development has stalled (last commit October 2023), and its built-in `nnsvs.pretrained` registry contains only two "yoko" models hosted on Dropbox. Most usable voices (Namine Ritsu, Ofuton P and others) are ENUNU/NNSVS model folders downloaded from the voicers' own sites and governed by character terms. Input is HTS full-context labels made from MusicXML (pysinsy) or UST (utaupy/ENUNU). Timing is therefore score-based: precise ms timing has to be encoded through tempo and fine divisions or ticks, after which the model's own timing predictions still shift phoneme onsets.

### Cited Findings
- NNSVS is a "neural network-based singing voice synthesis library for research", MIT-licensed, on PyPI as `nnsvs`. The citation is Yamamoto, Yoneyama & Toda, arXiv:2210.15987 — [nnsvs/nnsvs README](https://github.com/nnsvs/nnsvs). Last commit was 2023-10-10 (git log), so it is effectively unmaintained.
- API (quoted from the docs):
  - The constructor is `SPSVS(model_dir, device='cpu', verbose=0)`.
  - `svs(labels, vocoder_type='world', post_filter_type='gv', …, style_shift=0, …, loudness_norm=False, target_loudness=-20, segmented_synthesis=False)` takes `labels` as an `nnmnkwii.io.hts.HTSLabelFile`. `vocoder_type` is `world`, `pwg` or `usfgan`.
  - Frontend conversion happens outside the engine via "pysinsy or utaupy". Example:
    ```python
    engine = SPSVS(model_dir)
    contexts = pysinsy.extract_fullcontext(example_xml_file(key="get_over"))
    labels = hts.HTSLabelFile.create_from_contexts(contexts)
    wav, sr = engine.svs(labels)
    ```
  
  Source: [nnsvs.svs docs](https://nnsvs.github.io/modules/svs.html).
- The built-in registry (`nnsvs.pretrained`) lists only `r9y9/yoko_latest` and `r9y9/20220322_yoko_timelag_mdn_duration_mdn_acoustic_resf0conv`. Both download from Dropbox via `create_svs_engine(name)` into `~/.cache/nnsvs` — [nnsvs/pretrained/__init__.py](https://github.com/nnsvs/nnsvs/blob/master/nnsvs/pretrained/__init__.py).
- The NNSVS docs show demo samples for Ritsu (Diffusion + SiFiGAN, 2023-03-12) and "Cipher". The docs point non-researchers to ENUNU/Simple-ENUNU and include a guide on converting ENUNU models to NNSVS format — [nnsvs.github.io](https://nnsvs.github.io/).
- ENUNU is a UTAU plugin, MIT-licensed, that makes NNSVS models usable like UTAU voicebanks:
  - Usage: open a UST, choose an ENUNU model as the voicebank, use hiragana single-mora lyrics, select notes, run the plugin and save the WAV.
  - Phonemes can be typed directly (e.g. `[i][r a][N][k a]`).
  - Users must follow "each character's terms".
  - The dev environment is Python 3.12.
  - Extensions include `timing_repairer`, `velocity_applier` (adjusts consonant length from UST consonant velocity), `f0_smoother` and `vibrato_applier`.
  
  Source: [oatsu-gh/ENUNU](https://github.com/oatsu-gh/ENUNU). Last commit was 2025-12-14; SimpleEnunu's was 2025-12-13 (git log of https://github.com/oatsu-gh/SimpleEnunu).
- ENUNU's full-context labels differ from Sinsy's. They drop phrase info, note dynamics and other musical symbols (fields e26–e56), measure info and beat info — [ENUNU README](https://github.com/oatsu-gh/ENUNU).
- Model folder setup: add `enuconfig.yaml` at the model root, following the files bundled with "波音リツ ENUNU Ver.2" from [canon-voice.com/enunu.html](http://www.canon-voice.com/enunu.html), or the Ofuton P ENUNU model — [ENUNU README](https://github.com/oatsu-gh/ENUNU).
- ENUNU in OpenUtau:
  - Builds: the official ENUNU-0.4.0 server ([stakira/ENUNU releases](https://github.com/stakira/ENUNU/releases)) and the unofficial ENUNU ≥1.0.0 and SimpleEnunuServer ≥0.5.0 by rokujyushi. The server (`enunu_server.bat`) must be running before OpenUtau starts.
  - Dynamics come only through the `p9` style flag (Loudest, Loud, Normal, Soft).
  - The feature is "experimental", and rendering is slow after note edits because `python.exe` starts for each phrase.
  
  Source: [OpenUtau wiki: ENUNU-NNSVS-Support](https://github.com/stakira/OpenUtau/wiki/ENUNU-NNSVS-Support).
- A community guide lists publicly available NNSVS/ENUNU voice models by language (Chinese, English, Japanese, Polish, Spanish, Russian), last updated 2022-10-23, but the list did not render in fetch — [nnsvs.carrd.co](https://nnsvs.carrd.co/). An example is the Polish model [SCERYP/polish-nnsvs-voicebank-albert](https://github.com/SCERYP/polish-nnsvs-voicebank-albert).
- HTS label times are absolute, in units of 100 ns. pysinsy output starts `0 10909090 sil` — [pysinsy README](https://github.com/r9y9/pysinsy).

### Inferences
- Sub-grid timing works if the score encodes it. With MusicXML at tempo 60 (one quarter = 1000 ms) and `<divisions>1000</divisions>`, one division equals 1 ms. With UST/USTX at 480 PPQ and 125 bpm, one tick equals 1 ms. Per-note tempo changes are another option.
- NNSVS models include time-lag and duration models that move phoneme boundaries relative to note onsets, much as real singers place consonants before the beat. Exact onset reproduction therefore means either accepting these shifts (vowel onsets still land near note onsets) or using lower-level calls such as `predict_acoustic` on labels with fixed durations. That second option is an inference from the API docs' mention of `predict_acoustic`/`postprocess_acoustic`, not a documented workflow.
- NNSVS offers no continuous loudness input. ENUNU's label spec drops dynamics, and the OpenUtau bridge exposes only four discrete loudness styles. Apply continuous dynamics as a post-render gain envelope.

### Gaps
- I could not retrieve the current list of downloadable ENUNU/NNSVS models with licences. nnsvs.carrd.co did not render the list.
- I did not verify the exact Ritsu, Kiritan or Ofuton P ENUNU terms.
- Whether NNSVS can bypass its duration models cleanly via a documented flag is unverified.

## ESPnet-Muskits / ESPnet SVS: pretrained models, inference, score format, licences

### Takeaway
ESPnet is the most "pip-and-Python" research option with absolute timing. `espnet2.bin.svs_inference.SingingGenerate` takes a score of `(start_sec, end_sec, lyric, midi, phonemes)` tuples, and a tempo value that is ignored for the result. Two dozen pretrained Japanese and Mandarin models (RNN, XiaoiceSing, VISinger/VISinger2, TokSing) are on Hugging Face under CC-BY-4.0, Apache-2.0 or MIT model-card licences. There is no loudness/energy input, and the underlying datasets carry their own terms.

### Cited Findings
- HF models under `espnet/` include:
  - Japanese (ja): `kiritan_svs_rnn`, `kiritan_svs_xiaoice`, `kiritan_svs_visinger`, `kiritan_svs_visinger2`, `ofuton_p_utagoe_db_svs_{naive_rnn_dp,xiaoice,visinger,visinger2}`, `oniku_kurumi_utagoe_db_svs_{visinger,visinger2}`, `oniku_kurumi_utagoe_svs_db_naive_rnn_dp`
  - Mandarin (zh): `m4singer_svs_naive_rnn_dp`, `m4singer_svs_xiaoice`, `opencpop_{naive_rnn_dp,xiaoice,visinger,visinger2}`, `opencpop_svs2_toksing_pretrain`, `acesinger_opencpop_visinger{,2}_44khz`, `aceopencpop_svs_visinger2_40singer_pretrain`, `acekising_svs_visinger2`
  - Multilingual (zh+ja): `mixdata_svs_visinger2_spk{emb,embed}_lang_pretrained` and `visinger2-zh-jp-multisinger-svs`
  
  Source: [HF API listing](https://huggingface.co/api/models?author=espnet&search=svs).
- Licence fields from the HF API:

  | Model | Licence |
  |---|---|
  | `kiritan_svs_visinger2` | apache-2.0 |
  | `kiritan_svs_visinger` | cc-by-4.0 |
  | `aceopencpop_svs_visinger2_40singer_pretrain` | cc-by-4.0 (zh) |
  | `visinger2-zh-jp-multisinger-svs` | mit (zh, ja) |
  | `ofuton_p_utagoe_db_svs_visinger2` | cc-by-4.0 (ja) |
  | `acekising_svs_visinger2` | cc-by-4.0 |
  | `m4singer_svs_xiaoice` | cc-by-4.0 |
  | `opencpop_visinger2` | cc-by-4.0 |
  | `acesinger_opencpop_visinger2_44khz` | cc-by-4.0 |

  Source: e.g. [espnet/visinger2-zh-jp-multisinger-svs](https://huggingface.co/espnet/visinger2-zh-jp-multisinger-svs), [espnet/kiritan_svs_visinger](https://huggingface.co/espnet/kiritan_svs_visinger).
- Python inference as used by the SingingSDS Space:
  - Load with `from espnet2.bin.svs_inference import SingingGenerate` and `from espnet_model_zoo.downloader import ModelDownloader`, then `ModelDownloader(cache_dir).download_and_unpack(model_id)` and `SingingGenerate(train_config=…, model_file=…, device="cpu"|"cuda")`.
  - The input batch is `{"score": (120, notes), "text": " ".join(phns)}`. `notes` holds tuples `(st, ed, lyric, midi_pitch, "phn1_phn2")`, and the code comments that the tempo "does not affect svs result, as note durations are in time unit".
  - Multi-singer models take `sids=`. Mixed-language models take `lids=` and `spembs=`.
  
  Source: [SingingSDS modules/svs/espnet.py](https://huggingface.co/spaces/espnet/SingingSDS/blob/main/modules/svs/espnet.py).
- Recipe-style inference: check out the pinned ESPnet commit and run e.g. `egs2/opencpop/svs1` with `--skip_train true --download_model <model-id>` — [espnet/opencpop_naive_rnn_dp card](https://huggingface.co/espnet/opencpop_naive_rnn_dp/blob/main/README.md?code=true); [espnet/kiritan_svs_rnn](https://huggingface.co/espnet/kiritan_svs_rnn).
- Data format in the SVS recipe template:
  - `label` lines are `uttid (start, end, phone) …`.
  - `score.scp` maps keys to `score.json`.
  - Scores come from MusicXML or HTS labels, and note durations can be rebuilt from MIDI (Natsume recipe). Special marks are supported in MusicXML.
  - Model families: Naive-RNN, RNN-DP, XiaoiceSing, DiffSinger (FFTSinger), VISinger 1/2, VISinger 2 Plus, Singing Tacotron.
  
  Source: [egs2/TEMPLATE/svs1/README.md](https://github.com/espnet/espnet/blob/master/egs2/TEMPLATE/svs1/README.md).
- VISinger 2 Plus (SLT 2024) pretrained models trained on Opencpop or ACE-Opencpop are at [yifengyu/svs_train_visinger2plus_mert_raw_phn_None_zh_200epoch](https://huggingface.co/yifengyu/svs_train_visinger2plus_mert_raw_phn_None_zh_200epoch) — [svs1 README](https://github.com/espnet/espnet/blob/master/egs2/TEMPLATE/svs1/README.md).
- Muskits-ESPnet toolkit paper: [arXiv:2409.07226](https://arxiv.org/pdf/2409.07226). ESPnet is Apache-2.0 (LICENSE) and very active (last commit 2026-10-23).
- The model ID is spelled both `mixdata_svs_visinger2_spkemb_lang_pretrained` and `…spkembed…`. Both exist on the Hub — [HF listing](https://huggingface.co/api/models?author=espnet&search=svs); [SingingSDS code](https://huggingface.co/spaces/espnet/SingingSDS/blob/main/modules/svs/espnet.py).

### Inferences
- ESPnet maps most directly onto an onset/offset/pitch table: convert ms to seconds, pick a lyric (Japanese `N`/`n` phones from pyopenjtalk for humming in the Japanese models), pass the MIDI pitch, and run on CPU.
- Pitch is quantised to MIDI note numbers. There is no F0-curve or loudness input in this path, so continuous dynamics must be applied as a gain envelope afterwards. Microtonal or glide detail would need a post-hoc pitch shift or a different engine.
- The model-card licences cover the weights. The training corpora (Kiritan, Opencpop, Ofuton P, M4Singer, ACE-KiSing) have their own terms, which should be checked before publishing audio.

### Gaps
- The terms of the Opencpop, Kiritan and Ofuton P databases could not be retrieved: the Opencpop site reset the connection.
- Whether newer ESPnet releases still load the 2023 checkpoints without the pinned commit is unverified.

## Sinsy / pysinsy (HTS voices) and NEUTRINO

### Takeaway
Sinsy (Modified BSD) with its CC BY 3.0 Japanese HTS voice "NIT SONG070 F001" is the simplest fully open, CPU-light, MusicXML-driven baseline. The voice is old (2013) HMM quality, and timing must be encoded via MusicXML tempo and divisions. NEUTRINO is free but closed. It is MusicXML-driven, with a batch-script CLI and 17 Japanese characters as of September 2026.

### Cited Findings
- The HTS voice "NIT SONG070 F001" v0.90 (2013-12-25) is © Nagoya Institute of Technology and "licensed under the Creative Commons Attribution 3.0 license". It is released as part of Sinsy — [HTS voice readme](https://sinsy.sourceforge.net/readme_hts_voice_nitech_jp_song070_f001.php). Sinsy itself is "released under the Modified BSD license" — [Sinsy readme](https://sinsy.sourceforge.net/readme_sinsy.php).
- pysinsy is a Python wrapper (`pip install pysinsy`, MIT, "alpha state") around a modified Sinsy fork. It loads MusicXML (`loadScoreFromMusicXML`) and emits mono or full-context labels with absolute times — [r9y9/pysinsy](https://github.com/r9y9/pysinsy). Last commits: pysinsy 2023-10-09, r9y9/sinsy 2022-02-06 (git log).
- A `sinsy-cli` package exists on PyPI — [sinsy-cli](https://pypi.org/project/sinsy-cli/).
- The Sinsy label spec includes note dynamics fields (e26–e56), which ENUNU drops — [ENUNU README](https://github.com/oatsu-gh/ENUNU).
- NEUTRINO is freeware that reads MusicXML (e.g. from MuseScore). Users edit a batch file (Run.bat), setting `BASENAME` to the MusicXML name, and get a WAV. Parameters include PitchShift and FormantShift — [Classmethod tutorial](https://dev.classmethod.jp/articles/tutorial-about-neutrino-neural-singing-synthesizer/); [Vocasphere](https://vocasphere.net/2020/02/neutrino-neural-singing-synthesizer-available-for-download/).
- It is "not open-source software" — (search summary citing) [nnsvs PyPI 0.0.1 page](https://pypi.org/project/nnsvs/0.0.1/).
- Current status: "NEUTRINO – Tau v3.2.5" updates were posted 2026-09-25 and 2026-10-09. "As of September 2026, 17 characters are published", including Tohoku Kiritan, Tohoku Zunko, Zundamon, No.7 and Merrow — [studio-neutrino.com](https://studio-neutrino.com/).

### Inferences
- For a reproducible, licence-clean open baseline in Japanese: generate MusicXML with `<divisions>` ≥ 1000 at a constant 60 bpm (1 division = 1 ms), use lyric `ん` for humming, and render with Sinsy + NIT SONG070 F001 (credit: CC BY 3.0, Nagoya Institute of Technology). The dynamics marks in MusicXML may influence the label context, but a continuous curve still has to be a post-gain.
- NEUTRINO likely gives better quality than Sinsy. Because it is closed and its terms were not retrieved, it is weaker for scholarly reproducibility.

### Gaps
- I did not retrieve NEUTRINO's current licence or terms page, its supported OSes, or whether a Linux/macOS CLI still ships.
- I did not verify whether Sinsy handles very fine MusicXML divisions or very frequent tempo changes without rounding.

## Other runnable models: Amphion (Vevo/Vevo1.5/Vevo2), Seed-VC, so-vits-svc-fork, RVC, DDSP-SVC, MIDI-DDSP, DDSP, Bark, ACE-Step/YuE

### Takeaway
None of these tools takes a note list with ms timing and a loudness curve, except DDSP-style models, which are conditioned directly on frame-wise F0 and loudness. The singing-voice-conversion family (Seed-VC, RVC/Applio, DDSP-SVC, so-vits-svc) is still very useful in a two-stage pipeline:
1. Synthesise a guide signal (sine/additive "hum") with exact timing, F0 and amplitude.
2. Voice-convert it into a singer's timbre, preserving frame-level timing and F0.

Song generators (ACE-Step, YuE/YuE2) and Bark generate whole songs or speech-like audio. They give no note-level, ms-precise control.

### Cited Findings
**Amphion Vevo family**
- Amphion code is MIT, "free for both research and commercial use". It supports TTS, SVS and SVC — [Amphion README](https://github.com/open-mmlab/Amphion).
- Vevo2 (released 2026-03-25) unifies speech and singing generation: TTS, SVS, VC/SVC, editing, singing style conversion, "Humming-to-Singing and Instrument-to-Singing" and "Melody Control".
  - Its prosody tokenizer produces "coarse-grained prosody tokens (which can also be interpreted as melody contour)" at 6.25 Hz.
  - The AR model is based on Qwen2.5-0.5B. It also has a 350M flow-matching transformer and a 250M Vocos vocoder.
  - Training data was Emilia-101k plus "SingNet-7k" (about 7,000 h of internal singing data).
  - Inference: `python -m models.svc.vevo2.infer_vevo2_ar`.
  
  Source: [Vevo2 README](https://github.com/open-mmlab/Amphion/blob/main/models/svc/vevo2/README.md).
- Weight licences: RMSnow/Vevo2 and amphion/Vevo1.5 are both cc-by-nc-nd-4.0 — [HF RMSnow/Vevo2](https://huggingface.co/RMSnow/Vevo2), [HF amphion/Vevo1.5](https://huggingface.co/amphion/Vevo1.5). Amphion's last commit was 2026-03-25.

**Seed-VC**
- Seed-VC does zero-shot SVC from a 1–30 s reference: `python inference.py --source <wav> --target <wav> --diffusion-steps 30-50 --f0-condition True --semi-tone-shift 0`. The SVC model `seed-uvit-whisper-base` runs at 44.1 kHz with about 200M parameters and BigVGAN, and auto-downloads from HF — [seed-vc README](https://github.com/Plachtaa/seed-vc).
- Licence is GPL-3.0 (repo LICENSE; HF card [Plachta/Seed-VC](https://huggingface.co/Plachta/Seed-VC)). Last commit was 2025-04-20.

**so-vits-svc-fork, RVC, Applio**
- so-vits-svc-fork's README has a "No Longer Maintained" section. It recommends Applio (MIT, "actively maintained"), says original RVC (MIT) is "no longer maintained", and calls fish-diffusion "not actively maintained" — [so-vits-svc-fork README](https://github.com/voicepaw/so-vits-svc-fork). The repo LICENSE is MIT, and RVC's LICENSE is MIT (git).

**DDSP-SVC**
- DDSP-SVC is MIT and active (last commit 2026-10-04). Inference: `python main_reflow.py -i input.wav -m model.pt -o out.wav -k <semitones> -id <spk>`. It needs a model trained on the target voice, using a ContentVec/HuBERT encoder, the RMVPE pitch extractor and an NSF-HiFiGAN vocoder. Pretrained base checkpoints are on HF (ms903/Diff-SVC-refactor-pre-trained-model) — [DDSP-SVC README](https://github.com/yxlllc/DDSP-SVC).

**MIDI-DDSP**
- Install with `pip install midi-ddsp` in **Python 3.8**; it was developed on TensorFlow 2.7. Use `midi_ddsp_download_model_weights` and then `midi_ddsp_synthesize --midi_path <mid>`.
- It covers only 13 URMP instruments (violin, viola, cello, double bass, flute, oboe, clarinet, saxophone, bassoon, trumpet, horn, trombone, tuba). There is no voice, and it cannot be installed on M1 Macs.
  
  Source: [midi-ddsp README](https://github.com/magenta/midi-ddsp). Apache-2.0, last commit 2022-11-29 (unmaintained).

**DDSP (magenta)**
- The timbre-transfer colab's pretrained models are only Violin, Flute, Flute2, Trumpet and Tenor_Saxophone (`gs://ddsp/models/timbre_transfer_colab/2021-07-08`). The `train_autoencoder` colab trains your own model from audio files — [magenta/ddsp colab demos](https://github.com/magenta/ddsp/tree/main/ddsp/colab/demos).

**Bark**
- Bark is MIT-licensed text-to-audio that "sometimes chooses to generate text as music". Users "can help it out by adding music notes around your lyrics" (`♪ … ♪`). It runs on CPU and GPU, and it does not support custom voice cloning — [suno-ai/bark](https://github.com/suno-ai/bark). Last commit was 2024-04-05.

**ACE-Step**
- ACE-Step is a diffusion song generator: up to 4 minutes in 20 s on an A100. It has lyric editing and a "Lyric2Vocal (LoRA)", and v1.5 was released 2026-01-28 — [ACE-Step README](https://github.com/ace-step/ACE-Step).
- Licences: code Apache-2.0; HF weights `ACE-Step/ACE-Step-v1-3.5B` apache-2.0 and `ACE-Step/Ace-Step1.5` mit (HF API).

**YuE2**
- YuE2 (September 2026) takes lyrics and a style prompt, writes an editable "melody-and-chord plan" as **ABC notation**, and then renders a full song. Users can supply their own score via `abc=…` (`cot="melody"` mode).
- It requires Linux, Python 3.12 and an NVIDIA GPU with BF16 and 24 GB VRAM.
- The YuE2-3B weights are cc-by-nc-4.0 (HF API); the repo LICENSE is Apache.
  
  Source: [YuE README](https://github.com/multimodal-art-projection/YuE).

### Inferences
- Guide-tone + SVC pipeline (the most flexible way to get exact ms timing, continuous F0 and dynamics into a natural-sounding voice):
  1. Render a harmonic "hum" (e.g. a few harmonics, or a vocal-like formant-filtered pulse) from the note table at 44.1 kHz. Use exact sample-accurate onsets and offsets, F0 including glides, and an amplitude envelope taken from the dynamics.
  2. Convert it with Seed-VC (`--f0-condition True`, a target reference of a singer humming or singing on "mm"), Applio/RVC or DDSP-SVC.
  
  Timing survives because these models are frame-synchronous. Loudness transfer varies by model and should be re-imposed afterwards by matching the RMS envelope.
- The cleanest "humming synthesiser" with direct F0 + loudness control is a DDSP autoencoder trained on 10–20 minutes of consented humming (one's own, or a dataset whose licence allows it; see HumTrans/MLEnd in the prior-work section). Its inputs are exactly a pitch curve and a loudness curve, so a performance table maps 1:1. This is an inference from the DDSP conditioning design; no pretrained hum/voice DDSP checkpoint was found.
- Vevo2's melody control works from audio prosody tokens at 6.25 Hz (160 ms per token). That is far too coarse for ms-level note timing, and its weights are NC-ND.
- ACE-Step, YuE/YuE2 and Bark cannot honour fixed ms onsets. Their inputs are lyrics, style text or quantised ABC, and they compose accompaniment and timing themselves. They are illustrations of uncontrolled AI singing, not renderers.

### Gaps
- I found no openly licensed, pretrained SVC target voice designed for humming.
- I did not verify the licences of RVC/Applio's pretrained base models (e.g. their training data).
- How faithfully each SVC model preserves the input's loudness envelope was not tested or documented in the sources read.

## Absolute timing and continuous loudness across tools (cross-cutting)

### Takeaway
Only DiffSinger `.ds` files (seconds, with 5 ms F0 and curve grids) and ESPnet `SingingGenerate` (start and end seconds per note) take tempo-free absolute timing natively. DiffSinger alone also takes continuous loudness-like curves (voicing/energy), and OpenUtau exposes curves (dyn, voicing, energy, breathiness, tension) on its 480-PPQ grid. Everything score-based (OpenUtau USTX/UST/MIDI, Sinsy/NNSVS/NEUTRINO MusicXML) can reach about 1 ms resolution by choosing tempo and resolution: for example 125 bpm at 480 PPQ, or 60 bpm with 1000 divisions per quarter.

### Cited Findings
- DiffSinger `.ds`: `offset`, `ph_dur` and `note_dur` are in seconds, with `f0_timestep` 0.005 — [DiffSinger samples](https://github.com/openvpi/DiffSinger/tree/main/samples). Voicing/energy are dB RMS curves controlling loudness — [BestPractices.md](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md).
- ESPnet: score tuples are `(start, end, lyric, midi, phn)` in seconds, and the tempo "does not affect svs result" — [SingingSDS espnet.py](https://huggingface.co/spaces/espnet/SingingSDS/blob/main/modules/svs/espnet.py).
- OpenUtau: resolution is fixed at 480 ticks per quarter with a tempo list — [UProject.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/Ustx/UProject.cs). The `dyn` curve is −240…120 — [USTx.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/Format/USTx.cs). DiffSinger receives the voicing/energy/breathiness/tension curves — [DiffSingerRenderer.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/DiffSinger/DiffSingerRenderer.cs).
- NNSVS takes HTS labels, whose times are in 100 ns units — [pysinsy README](https://github.com/r9y9/pysinsy); [nnsvs.svs docs](https://nnsvs.github.io/modules/svs.html).
- "Velocity" in vocal synths means consonant speed or length, not loudness: see OpenUtau `VELC` ([DiffSingerRenderer.cs](https://github.com/stakira/OpenUtau/blob/master/OpenUtau.Core/DiffSinger/DiffSingerRenderer.cs)) and ENUNU `velocity_applier` ([ENUNU README](https://github.com/oatsu-gh/ENUNU)).
- meico can render MPM performances to expressive MIDI. Its CLI flag `-ex/--expressive` converts to expressive MIDI, and `-t` sets the MIDI tempo (default 120 bpm) — [meico README](https://github.com/cemfi/meico).

### Inferences
Recipes for mapping arbitrary ms onsets onto a tempo grid:
- **Constant tempo, fine grid.** Ticks per ms = PPQ × bpm / 60000. At 480 PPQ (OpenUtau/UST), 125 bpm gives exactly 1 tick = 1 ms. In SMF/MIDI, use a PPQ such as 960 or 1000 at 60 bpm. In MusicXML, use `<divisions>1000</divisions>` at 60 bpm. Round each onset and offset to the nearest tick (≤0.5 ms error).
- **Per-note tempo encoding.** Keep the notated rhythm (e.g. quarters) and insert a tempo change at every note so that each notated duration equals the measured ms duration (bpm = 60000 × beats / ms). This preserves a readable score and suits tools that cope with dense tempo maps. Robustness was not verified for every tool.
- **Rests carry the gaps.** Encode the time between one note's offset and the next note's onset as rests. For overlapping (legato) notes in a monophonic voice, truncate the earlier note.
- **Phoneme timing caveat.** Neural SVS models put consonants before the note onset and align the vowel onset to it. For hums on `N`/`m`, the voiced onset is close to the note onset. Check alignment by onset detection on the rendered audio.
- **Loudness.** If the engine lacks curve input (ESPnet, Sinsy, NNSVS, NEUTRINO), multiply the output by a smoothed gain envelope derived from the dynamics (e.g. MIDI velocity → dB via a calibrated map). Timbre will not change with dynamics in that case; DiffSinger voicing/tension curves partly can.

### Gaps
- Robustness of OpenUtau, Sinsy and NEUTRINO to per-note tempo changes (hundreds of tempo events) was not tested.
- I found no source documenting maximum MusicXML divisions in Sinsy or NEUTRINO.

## Prior work: sonifying piano rolls / expressive performance data with voices; historical roll performances re-rendered; MPM/meico and singing synthesis

### Takeaway
There is a solid line of work on digitising reproducing-piano rolls into expressive MIDI: SUPRA/Stanford for Welte T-100, and the Peter Phillips library. Roll performances have long been re-performed with live orchestras, famously Gershwin's Duo-Art "Rhapsody in Blue". MPM/meico supplies an open performance-rendering engine to expressive MIDI. I found no published project that drives a singing synthesizer from Welte, Duo-Art or Ampico data or from MPM. The closest precedents are Sony's patents on singing instrumental MIDI performance data (including velocity), sonification of expressive piano timing for pedagogy, and rule-based expressive singing synthesis (KTH). A "humming rendition of a Welte roll" appears to be novel.

### Cited Findings
**Roll digitisation and re-performance**
- SUPRA (Stanford University Piano Roll Archive) converts roll scans into MIDI. Outputs are a raw hole-level MIDI, an "expressive" MIDI that translates hole data into dynamics, and an audio rendering. The software, MIDI and audio are CC BY-NC-SA 4.0. It covered 456 Welte-Mignon T-100 rolls as of November 2019 and was described at ISMIR 2019 (best paper) — [SUPRA about](https://supra.stanford.edu/about); [Shi et al., ISMIR 2019](https://archives.ismir.net/ismir2019/paper/000062.pdf).
- The SUPRA timing correction scales Welte tracker-bar hole length by 0.75 to approximate valve timing — [ISMIR 2019 paper](https://archives.ismir.net/ismir2019/paper/000062.pdf) (via search summary). An earlier ISMIR 2017 paper models and digitises reproducing rolls with expression templates specific to Welte-Mignon — [Modeling and Digitizing Reproducing Piano Rolls](https://www.academia.edu/69064979/Modeling_and_Digitizing_Reproducing_Piano_Rolls).
- Peter Phillips' library has about 530 classical Welte-Mignon MIDI files derived mostly from T-100 (red) rolls via analogue models of the expression systems — [About the Phillips piano roll MIDI files](https://petersmidi.com/About_the_MIDI_files.pdf).
- Gershwin's 1924 Duo-Art rolls of "Rhapsody in Blue" were converted to MIDI and played on a Yamaha Disklavier with the Cincinnati Symphony Orchestra (2013). The digitisation had earlier been used in projects at Stanford and with the Sydney Symphony — [Yamaha Hub: Gershwin in Cincinnati](https://hub.yamaha.com/pianos/p-artists/gershwin-in-cincinnati).
- A 1976 performance had the Columbia Jazz Band under Michael Tilson Thomas accompanying Gershwin's Duo-Art roll. Art Reblitz described adapting a Duo-Art piano and roll for an orchestra concert — [Mechanical Music Digest 2023-09-26](https://www.mmdigest.com/Archives/Digests/202309/2023.09.26.01.html).
- Welte's Friburgia piano orchestrions added drums, xylophone and harp whose "strength … follows the piano's shades of expression", using a modified 100-key Welte-Mignon roll. This is a historical precedent for roll expression driving other instruments — [mechanicalmusicpress.com, Welte](https://mechanicalmusicpress.com/history/welte/wt_ageop_p31_f50-52.htm).
- Welte Philharmonie organ rolls: Rumsey discusses the tempo and registration accuracy of rolls on the Seewen organ. The organ's mechanism was assessed as running about 20% too slowly — [HKB Geisterhand, Rumsey](https://www.hkb-interpretation.ch/fileadmin/user_upload/documents/Publikationen/Geisterhand/Recording_06_Rumsey_2.pdf).
- Expressiveness in metronomic (non-reproducing) rolls was detected via IOI analysis on about 700 rolls converted to MIDI (Pavia/Padua) — [research.unipd.it PDF](https://research.unipd.it/retrieve/d4c17a9d-1085-4320-8322-469599337c80/Expressiveness%20in%20metronomic%20rolls%20for%20player%20piano%20-%20A%20new%20field%20of%20research.pdf).

**MPM and meico**
- MPM is an XML format with mathematical models of tempo, rubato, dynamics, articulation and metrical accentuation, for analysis and for "simulation/reconstruction" of performances. Its rendering engine is implemented in meico — [Berndt, ISMIR 2021: The Music Performance Markup Format and Ecosystem](https://archives.ismir.net/ismir2021/paper/000005.pdf); [McGill project blog](https://www.mcgill.ca/timbre-orchestration/research/project-blog/project-updates/music-performance-markup).
- meico converts MEI→MSM/MPM and MSM→MIDI (raw and expressive), renders MIDI→WAV/MP3 with SoundFonts/DLS, and runs as a CLI (`java -jar meicoApp.jar -ex -i -w …`), a GUI, a REST API and a Java library — [cemfi/meico README](https://github.com/cemfi/meico).
- Licences: the meico LICENSE file is GPL v3 (the README says GPL 3.0, though a badge says LGPL v3), last commit 2026-09-22. The MPM schema repo is BSD-2-Clause, last commit 2026-09-18 — [axelberndt/MPM](https://github.com/axelberndt/MPM).
- Targeted searches found no publication linking MPM/meico to singing-voice synthesis — [search results incl. ris.uni-paderborn.de](https://ris.uni-paderborn.de/record/47329).

**Voices driven by instrumental performance data; expressive singing**
- Sony patents (about 2003–2006) render MIDI performance data written for instruments as singing. Pitch, length and velocity are analysed, and an arbitrary lyric is assigned when none exists — [US7173178B2](https://patents.google.com/patent/US7173178B2); [US7241947B2](https://patents.google.com/patent/US7241947B2/en).
- Sonification of expressive piano timing: MIDI timing and velocity of three pianists' Chopin Nocturne recordings were sonified as feedback, helping students imitate interpretive nuances faster and more accurately — [PMC8993505](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8993505/).
- Raphael (IJCAI 2009) extends expressive rendering from piano (onset, damping and loudness parameters) to melody synthesis — [Representation and Synthesis of Melodic Expression](https://www.ijcai.org/Proceedings/09/Papers/247.pdf).
- The review "Expression Control in Singing Voice Synthesis" (Umbert et al., IEEE SPM 2015, co-authored with Sundberg) surveys timing, F0 and dynamics control. It discusses rule-based performance models such as KTH's — [PDF](https://staff.aist.go.jp/m.goto/PAPER/IEEESPM201511umbert.pdf).
- The KTH rule system (Director Musices) covers phrasing, micro-timing, articulation and so on. Sundberg's MUSSE was used for early singing synthesis — [KTH rule system thesis summary](https://www.speech.kth.se/music/publications/thesisaf/sammfa2nd.htm); [Three applications of analysis-by-synthesis](https://labs.sonicfield.org/library/three-applications-of-analysis-by-synthesis-in-music-science).
- F0-trajectory sonification with a sinusoidal synthesizer is an established MIR evaluation technique — [FMP notebook B_Sonification](https://www.audiolabs-erlangen.de/resources/MIR/FMP/B/B_Sonification.html).
- RenderBox (2025) does text- and score-controlled expressive performance audio generation for instruments, not voice — [arXiv:2502.07711](https://arxiv.org/pdf/2502.07711).

**Humming data, for training or evaluating a hum renderer**
- HumTrans has 500 compositions and 1000 segments of humming with MIDI labels ([arXiv:2309.09623](https://arxiv.org/abs/2309.09623v2); third-party HF mirror [dadinghh2/HumTrans](https://huggingface.co/datasets/dadinghh2/HumTrans)).
- MLEnd Hums & Whistles is downloadable via `pip install mlend` ([MLEnd docs](https://mlend.readthedocs.io/en/latest/)).
- Licences for both were not found.

### Inferences
- A pipeline from Welte roll to humming voice would likely be new. The likely chain:
  1. SUPRA expressive MIDI, or the user's own MPM-modelled performance.
  2. A meico expressive MIDI export, or direct ms note tables.
  3. Melody extraction.
  4. DiffSinger `.ds` with voicing curves, or a guide-tone + SVC pipeline.
  
  The Gershwin/orchestra and Friburgia cases are the nearest historical analogues of "roll performance data driving other sounding bodies". Sony's patents are the nearest technical analogue of "instrumental MIDI → singing voice".
- SUPRA's CC BY-NC-SA 4.0 licence propagates to derived renderings. Any published sung renderings of SUPRA MIDI would need to be non-commercial and share-alike.

### Gaps
- I found no paper, DLfM/ISMIR/SMC or otherwise, that sonifies piano-roll or expressive performance data specifically with synthetic voices or humming, and none that drives a singing synthesizer from MPM or expressive MIDI.
- No 2023–2026 DLfM papers on Welte rolls surfaced in searches.
- No Grainger/Grieg Duo-Art concerto-with-orchestra source was retrieved.
