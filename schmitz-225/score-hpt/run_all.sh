#!/bin/sh
# The order of work, run from this directory. Three inputs are not part of the repository:
#   FLAC   track 14 of TACET 220 as a 24-bit FLAC (see README.md)
#   REPO   a clone of github.com/zhanh-he/score-informed-amt at 22b4db6, with its checkpoint
#   SMD    Saarland Music Data v2 (zenodo.org/records/13753319), unpacked
set -e
: "${FLAC:?}" "${REPO:?}" "${SMD:?}"
PY=${PY:-python}
LEAD_IN=3.2927  # the YouTube transfer starts this much later than the FLAC (recording/same_recording.py)

ffmpeg -loglevel error -y -i "$FLAC" -map 0:a -ac 1 -ar 44100 rec.wav

# The FLAC is the recording the analyses in ../trans heard: both transcribers come out as before.
transkun rec.wav recording/flac_transkun_rec.mid
$PY ../trans/midi_to_notes.py recording/flac_transkun_rec.mid recording/flac_transkun_rec.json
$PY recording/run_kong.py rec.wav recording/flac_kong
$PY recording/same_recording.py ../trans/transkun_rec.json recording/flac_transkun_rec.json

# Score-HPT on the roll's notes, with the onsets Transkun heard and with the onsets the time map projects.
$PY score_hpt.py rec.wav ../trans/matched_transkun.json scorehpt_heard.json --repo "$REPO" --lead-in $LEAD_IN
$PY score_hpt.py rec.wav ../trans/matched_transkun.json scorehpt_mapped.json --repo "$REPO" --lead-in $LEAD_IN --onsets mapped
for s in -0.05 -0.02 0.02 0.05 0.1; do
  $PY score_hpt.py rec.wav ../trans/matched_transkun.json variants/shift$s.json --repo "$REPO" --lead-in $LEAD_IN --shift $s
done
for j in 0.01 0.02 0.03 0.05; do
  $PY score_hpt.py rec.wav ../trans/matched_transkun.json variants/jitter$j.json --repo "$REPO" --lead-in $LEAD_IN --jitter $j
done

# The same against the newer tree, on the control alignment of ../../simonton-225.
C=../../simonton-225/control/tacet_matched_transkun.json
$PY score_hpt.py rec.wav $C control_scorehpt.json --repo "$REPO" --lead-in $LEAD_IN
$PY score_hpt.py rec.wav $C control_scorehpt_mapped.json --repo "$REPO" --lead-in $LEAD_IN --onsets mapped
$PY control_fits.py ../../simonton-225/trans control_scorehpt.json control_scorehpt_mapped.json

# Known texts rendered and measured both ways.
for s in A1 B1 C; do
  $PY synth/synth.py ../trans/matched_transkun.json ../trans/kong.json $s synth/synth_$s.mid
  fluidsynth -ni -q -g 0.6 -r 44100 -F synth/synth_$s.wav /usr/share/sounds/sf2/FluidR3_GM.sf2 synth/synth_$s.mid
  $PY synth/normalise.py synth/synth_$s.wav rec.wav synth/synth_${s}_norm.wav
  transkun synth/synth_${s}_norm.wav synth/transkun_$s.mid
  $PY ../trans/midi_to_notes.py synth/transkun_$s.mid synth/transkun_rec_$s.json
  $PY synth/pair.py ../trans/matched_transkun.json synth/transkun_rec_$s.json synth/transkun_loudness_$s.json
  $PY score_hpt.py synth/synth_${s}_norm.wav ../trans/matched_transkun.json synth/scorehpt_$s.json --repo "$REPO"
done

# What the editor does with made-up notes, and the implementation against the paper's own test set.
$PY editor_probe.py "$REPO"
$PY smd_check.py "$REPO" "$SMD" 1000 smd_check.json

$PY report.py
