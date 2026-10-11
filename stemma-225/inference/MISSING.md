# Left out of inference/

All scripts here read and write files next to themselves; run them from any directory.
`MATRIX_JSON=matrix_blind.json` switches a script from the editor's collation (`matrix.json`) to the blind one.

| File | Size | Why left out | Regenerate with | Time |
|---|---|---|---|---|
| `ml_all_near5m.jsonl` | 5.1 MB | large, regenerable | `python3 mlsearch.py ml_all_near5m.jsonl all near5m` | about 30 min on 4 cores (`ml_all_near5m.log`: 22,472 trees, 1813 s) |
| `results_rules.pkl` | 4.9 MB | pickled score table, read by no script | `python3 rules_run.py` (also rewrites `results_rules.txt`) | about 75 s |
| `results_rules_blind.pkl` | 4.9 MB | as above | `MATRIX_JSON=matrix_blind.json BO1=links python3 rules_run.py results_rules_blind.txt` | about 75 s |

`ml_all_near5m.jsonl` is the input of `results_ml_main.txt`
(`python3 ml_report.py ml_all_near5m.jsonl; python3 ml_splits.py ml_all_near5m.jsonl`) and of
`results_ml_robust.txt` (`python3 ml_robust.py ml_all_near5m.jsonl N`; the N used is not recorded, the run refitted
103 candidate trees). The smaller blind search is included: `ml_blind_links.jsonl` came from
`MATRIX_JSON=matrix_blind.json python3 mlsearch.py ml_blind_links.jsonl all links - ml_subset.json` (3176 trees, 255 s),
and `results_ml_blind.txt` is `python3 ml_report.py ml_blind_links.jsonl 8; python3 ml_splits.py ml_blind_links.jsonl`.

## Outputs without a saved script

- `results_ml_params.txt` (fitted per-edge parameters of the editor's tree under the model of `ml.py`) was written by
  an ad-hoc command that was not saved.
- `results_rootedge.txt`: `rootedge.py` writes lines 1–9; the last four lines (the 13 candidates never hit up to
  100 mm, and their null model) were appended by an ad-hoc command that was not saved.
- `blind_pars.py` was reconstructed when the analysis was packaged; it reproduces `results_blind_pars.txt`
  byte for byte (`MATRIX_JSON=matrix_blind.json python3 blind_pars.py > results_blind_pars.txt`).
