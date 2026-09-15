set -e
cd /private/tmp/claude-501/-Users-nielspfeffer-Projects-measuring-early-records/b2a6dcbb-0eab-4ff3-a7ef-3c5155f70a31/scratchpad/simonton
time /private/tmp/claude-501/-Users-nielspfeffer-Projects-welte225-org/3fb84bde-7bf6-4d02-a274-24a975b23084/scratchpad/venv/bin/python trans/run_kong.py yt/rec_corr.wav trans/kong
time /private/tmp/claude-501/-Users-nielspfeffer-Projects-welte225-org/3fb84bde-7bf6-4d02-a274-24a975b23084/scratchpad/venv/bin/transkun yt/rec_corr.wav trans/transkun_rec.mid
/private/tmp/claude-501/-Users-nielspfeffer-Projects-welte225-org/3fb84bde-7bf6-4d02-a274-24a975b23084/scratchpad/venv/bin/python trans/midi_to_notes.py trans/transkun_rec.mid trans/transkun_rec.json
echo done
