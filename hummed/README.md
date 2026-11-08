# Träumerei, hummed

Alfred Grünfeld's 1905 Welte-Mignon recording of Schumann's _Träumerei_ (WM 225), played from the
roll's reconstruction (`/mpm/`), with the inner voice of a pianist humming along: rendered live in
the browser by VocalTractLab, for any exaggeration of the performance from 0 to 2.

<https://welte225.org/>: the site's front page. The page is the repository's root `index.html`;
it loads everything else from here (`<base href="/hummed/">`), and `/hummed/` itself sends
visitors on to it.

The page shows the hum's spectrogram filling the window, scrolling under a playhead. Over it, on
the left, three faders: the piano, the humming, and the exaggeration; on the right, the
transport. Moving the exaggeration renders the voice anew and takes it over at the same place in
the score. The page is titled as the reconstruction is: the comment in the MPM's metadata, read
from `/mpm/performance.mpm` (`src/shared/mpm.ts`; the HTML carries the same text for readers
without scripts and for link previews, and a test keeps the two equal). A small info button opens
a card with that title, the author, the year and the DOI (a placeholder until one is minted), links
to the overview of the site's projects (`/overview/`) and to the source, and the credits; small
info buttons beside Humming and Exaggeration explain those two. The cards are native popovers:
closed until asked for, and closed again by Escape or a click anywhere else.

## What is hummed: a reduction for a pianist's voice

A pianist humming along is no singer: about an octave, low, and a breath wherever the line changes
hands. `reduction/reduction.mei` is what is hummed, written as its own MEI: one bass staff,
114 notes from E2 to A3 (mostly F2 to G3), each pointing with `@corresp` to the note of
`/mpm/transcription.mei` it comes from (the repeat's notes as `…-rend2`). That is how the
performance reaches it: a sung note takes its onset and dynamics from that piano note and, where
it is the whole written note, the piano's release too. The page reads the MEI itself; edit it and
reload.

![the reduction](reduction/reduction.png)

The draft (`reduction/draft.py`) is a list of choices read from the score and from Grünfeld's
playing: which voice to follow from where, an octave shift where the range needs it, sung pedal
notes where the harmony holds still, rests to breathe, and air in two places.

- **A (1–8):** the opening motif an octave down; the tenor's answer (2–3); the bass walk Grünfeld
  leans on (4); F2 held under the restarting melody (5); A3 (6); the tenor's rise D3 F3 G3 A3 (7);
  the bass (8).
- **A repeated (1′–8′):** the melody itself, two octaves down (1′–3′); the bass; F2; in 6′, under the
  climb to A5, the voice is silent; then as in 7–8.
- **B (9–16):** F2, then the melody at mf; the tenor C3 D3 F♯3 G3 … (10–12); a short breath out
  through the teeth at the quiet turn in 12; B♭2 over Grünfeld's low B♭1 (13); A2 under the climax
  (14); D3 C♯3 D3 (15); the ritardando A2 B♭2 C3 (16).
- **A and the close (17–24):** as before, with F2 pedal notes; silent through the fermata (22); the
  last F2, then a breath out through lips and teeth as the chord fades.

What the MEI says, and how the voice reads it:

- **Breaths** are rests with `@type="breath"` (and a `<breath>` for the eye): 29 of them. Where the
  voice changes without a written rest, the draft cut the note before by about 0.45 s at
  Grünfeld's tempo there (a sixteenth at least), and no stretch runs over 8 s without a breath (the
  longest is 7.9 s). Because a rest is a score position, the tempo times it: a breath in a slower
  passage lasts longer. The dynamics set its depth: a deeper, audible intake before a louder
  stretch.
- **Pedal notes** (`@type="pedal"`) are held to their written end, not to the piano key's release.
- **Air** is written as x noteheads, `@type` `air-teeth` or `air-lips`: the glottis open, the velum
  closed, the tongue tip (an s) or the lower lip (an f) at the teeth. It is a breath out, not a held
  hiss: it comes in over 120 ms, starts some 20 dB under the hum around it, and fades by a further
  15 dB or so. Long passages of it (3–4 s, in 6′ and over the fermata) sounded comical and were taken out.
- Ties join notes; a plain rest after another rest extends it; `<beam>` is looked through. A chord
  or a tuplet is refused: the voice sings one note at a time.

After changing the reduction, run `npm run calibrate` (below) so the new notes are as loud as the
dynamics ask; until then they sound uncorrected, which is close.

## How the voice hums

For one exaggeration level the worker (`src/worker/worker.ts`) does this:

1. **The performance.** espressivo (`exaggerateMpm`, `performMsmToData`) performs the MPM twice:
   for the piano at the level, and for the voice a step further. The voice is the inner guide of
   the playing: always 0.3 more exaggerated than the piano, except in the dimensions that move
   notes in time (tempo, tempo shape, rubato, asynchrony, arpeggio spread and spacing, timing
   imprecision), which it shares with the piano, so the two keep the same onsets to the
   millisecond. A third rendering, with sub-note dynamics, gives the dynamics as a curve.
2. **The voice's decisions** (`src/hummer/vocal-map.ts`): a breath at each breath rest, sized by the
   dynamics; a scoop into each phrase and a fall at its end; between notes, what Grünfeld's
   fingers do: where the keys overlap by more than 30 ms the voice slides over half the overlap,
   within 15 ms it sings legato, a gap of 15–110 ms (or a repeated pitch) becomes a breath pulse,
   from 110 ms it stops; a note that came out of a spread chord slides up from the chord's first
   note. The mouth opens with the dynamics smoothed over ±1.5 s, at most 30 % of the way to the
   open shapes, less before high notes, and closes as each phrase fades; the humming shape changes
   at pedal presses and in long notes.
3. **Gestures** (`src/hummer/gestures.ts`): the pitch line with its wobble; the effort, lung
   pressure following the dynamics within held notes (velocity^1.5, each note offset by its own
   velocity against the curve, corrected by the calibration) and the glottis from breathy to modal
   with loudness; two gestural scores, lips closed and lips open at their widest, and the opening
   that blends them, lagged as VocalTractLab lags a gesture (`src/hummer/gestural-score.ts`).
4. **Sound** (`src/vtl/engine.ts`): VocalTractLab in WebAssembly turns both scores into tract
   states, and the tract states into sound, 110 samples (2.5 ms) at a time. The tube geometry is
   computed every 10 ms and only where the tract has moved, and interpolated in between (under
   0.02 dB from computing it every step); the closed and open tubes are blended by the opening,
   so the lips part gradually rather than with VocalTractLab's jump.

The worker streams the sound to the page in blocks, with their spectrogram columns, from the
requested place to the end and then from the beginning up to it. The page (`src/page/`) plays the
voice as it arrives, plays the roll on a sampled grand from the same performance, holds notes with
the sustain pedal as the roll does, and sends both into one small room: early reflections and a
stereo tail whose highs die sooner than its lows (1.6 s in the bass, 0.6 s in the treble), the
voice a little further in than the piano and after a 20 ms pre-delay. A recent laptop renders the
voice about twice as fast as it plays.

espressivo 0.11, strongly exaggerated (from about ×1.8), leaves a few arpeggiated notes with
impossible times: an onset equal to the note's tick position or tens of seconds past the end, or
an end before the onset. `repair` (`src/hummer/performance.ts`) puts such a note back at the head
of its chord, and gives a note that ends too early a length, before the piano or the voice uses it.

## Code

| Path                             | What it is                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `../index.html`, `style.css`     | the page (the site's front page) and its styles                                                                                   |
| `app.js`, `worker.js` (+ `.map`) | the page's and the worker's bundles, built from `src/` and committed, since GitHub Pages serves the repository as it is           |
| `vtl.js`                         | VocalTractLab compiled to WebAssembly (`vtl/build.sh`), committed likewise                                                        |
| `src/reduction/`                 | reading the reduction's MEI                                                                                                       |
| `src/hummer/`                    | from a performance and the reduction to the two gestural scores                                                                   |
| `src/vtl/`                       | VocalTractLab's module, typed, and the streaming engine around it                                                                 |
| `src/worker/`                    | the worker: levels, piano notes, spectrogram, the render loop                                                                     |
| `src/page/`                      | the page: audio graph and room, piano sampler, renderings, transport, spectrogram view                                            |
| `src/shared/`                    | what both sides use: units, maths, the messages between them                                                                      |
| `data/`                          | the speaker (VocalTractLab's JD3 with 264 mouth shapes fitted to a recorded hum), the hum style measured from it, the calibration |
| `piano/`                         | Salamander Grand Piano samples, a minor third apart, at four velocities, mono, 7 s                                                |
| `reduction/`                     | what is hummed (`reduction.mei`), its rendering, and the script that drafted it                                                   |
| `tools/`                         | build, calibration, a browser smoke test, and what they share for running in Node                                                 |
| `test/`                          | unit tests, the voice against its fingerprint, VocalTractLab in Node                                                              |
| `vtl/`                           | the VocalTractLab build and its patch                                                                                             |
| `research/`                      | how it came to be: the report, the offline pipeline, the first renderings                                                         |

The score and the performance are the site's own (`/mpm/score.msm`, `/mpm/performance.mpm`), so
the voice follows the reconstruction as it is published.

## Development

Node 22.18 or later runs the TypeScript directly; nothing is compiled but the two bundles.

```sh
npm ci
npm run check        # types (tsc, strict), lint (typescript-eslint, strict, type-aware), format, tests
npm run build        # app.js and worker.js
npm run calibrate    # after changing the reduction, the hum style or the reconstruction
npm run smoke        # the page in Chromium (needs Playwright installed): plays, switches, seeks, info
```

Serve the repository root (`python3 -m http.server`) and open `/`: the page loads `/hummed/` and
`/mpm/`.

`test/voice.test.ts` holds the voice to a fingerprint (`test/golden.json`), taken when the
TypeScript was shown to produce gestural scores byte for byte identical to the JavaScript it
replaced; after an intended change to what the voice does, `UPDATE_GOLDEN=1 npm test`. CI
(`.github/workflows/hummed.yml`) runs the checks on every change to `hummed/` or `mpm/`, and fails
if the committed bundles are not what the sources build to.

`npm run calibrate` renders the voice at ×1 in Node, measures each sung note's level against what
the dynamics ask, and writes per-note corrections (by `xml:id`) and the output gain to
`data/calibration.json`; two rounds bring the notes within 0.01 dB of the dynamics.

`vtl/build.sh` rebuilds `vtl.js` (Emscripten 3.1.6): VocalTractLab 2.4.2 with
`vtl/vocaltractlab.patch`, which raises the gestural model's limit from 60 s to 240 s (in one pass
over the whole piece every parameter froze after a minute) and adds `vtlGesturalScoreToStates`,
which returns a score's tract states in memory. `research/scripts/prep_static.py` wrote the
speaker, the hum style and the piano samples from the offline pipeline.

## Research

`research/` keeps how this came about, starting from a question: can any AI model imitate human
humming or singing perfectly when told exactly when which pitch should sound?

- `research/report/` answers it, from four literature surveys and the experiment record
  (`notes/`).
- `research/scripts/` rendered the melody of the roll (then the top line, 162 notes) with every
  voice synthesiser available in 2026: sine and additive tones, a Klatt cascade, VocalTractLab,
  Pink Trombone, DiffSinger, ESPnet's VISinger, Sinsy, DDSP, Seed-VC, each taking onsets, ends
  and dynamics from the MPM (`render.mjs`, `extract_melody.py`, `voicemodel.py`, the `render_*`
  scripts, `master.py`, `analysis.py`). `scripts/hummer/` fitted VocalTractLab to a recording of
  the pianist humming (`profile.py`, `step1`–`step5_ges.py`; the recording itself is not
  published) and wrote the voice's decisions into the MPM as a `<vocalMap>` in its global
  `<dated>` section (`hummer.py`, `run_hummer.py`): a proposal, not part of the MPM standard,
  which espressivo ignores (`research/data/performance_hummed.mpm`).
- Before the voice rendered live, five exaggeration levels were rendered ahead
  (`exag_render.mjs`, `exag_build_level.sh`, `research/data/exaggerated/`).
- `research/wasm-feasibility/` measured VocalTractLab in the browser: three quarters of its cost is
  the geometry; computing it only where the tract moves brought it from 0.35× to 1.2× real time on
  one core of a cloud server, and about 2× on a recent laptop.

The live page's hummer is a TypeScript port of `hummer.py` and `voicemodel.py`; the two differ in
the random wobble and falls (a seeded generator of its own), in the mouth (two scores blended
rather than rendered and cross-faded), and in what is sung (the reduction rather than the top
line).

## Licences

- The code is GPL-3.0-only (`LICENSE`): `worker.js` bundles espressivo (GPL-3.0-only) and
  `vtl.js` is VocalTractLab 2.4.2 (GPL-3.0, Peter Birkholz et al.), whose source is the
  vocaltractlab-cython 0.0.17 sdist on PyPI with `vtl/vocaltractlab.patch` applied.
- The reduction, the data and the texts are CC BY 4.0, like the rest of the site.
- The piano samples are from the Salamander Grand Piano by Alexander Holm, CC BY 3.0, trimmed and
  made mono.
