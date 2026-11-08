#!/bin/bash
# build_level.sh <level dir name> <top dB>: piano, hum (one VTL pass with level 1's calibration),
# mastering, mono stems and spectrogram tiles for one exaggeration level
set -e
S=${S:?set S to the working directory (render/, work/, work_rec/, exag/, envs/)}
L=$1; TOP=$2; E=$S/exag/$L; OUT=$S/site_mix/levels/$L
DSP=$S/envs/dsp/bin/python; VTL=$S/envs/vtl/bin/python
mkdir -p $OUT
if [ "$L" != "x100" ]; then
  cd $E/work && $DSP $S/work/render_piano.py piano_full
  cd $E/work_rec && HUMMER_WORK=$E/work HUMMER_DATA=$E/data $VTL $S/work_rec/run_hummer.py --calibration $S/exag/calibration_x100.json 2>&1 | grep -v "Warn\|pkg_res\|corrected\|^ *$"
  cd $E/work && $DSP $S/work/master.py vtl_hummer piano_full 2>&1 | grep -iv "warn\|pkg_res"
  FIN=$E/work/final
else
  FIN=$S/work/final
fi
ffmpeg -y -loglevel error -i $FIN/vtl_hummer.wav -ac 1 -codec:a libmp3lame -q:a 4 $OUT/hum.mp3
ffmpeg -y -loglevel error -i $FIN/piano_full.wav -ac 1 -codec:a libmp3lame -q:a 4 $OUT/piano.mp3
$DSP $S/work/spectrogram_tiles.py $FIN/vtl_hummer.wav $OUT/spec $TOP 2>&1 | grep -v "Warn\|pkg_res" | cut -c1-40
echo "done $L"
