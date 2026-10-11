#!/bin/sh
# Pattern audit: rebuild matrix and all analyses; logs go to out/
cd "$(dirname "$0")" || exit 1
mkdir -p out
node matrix.mjs        > out/matrix.txt
node missing.mjs       > out/missing.txt
node forward_table.mjs > out/forward_table.txt
node dev_forward.mjs   > out/forward_deviations.txt
node rule.mjs          > out/rule.txt
node rule_stats.mjs    > out/rule_stats.txt
node wi1only.mjs       > out/wi1only.txt
node wi1rule.mjs       > out/wi1rule.txt
node baserate.mjs      > out/baserate.txt
node st1.mjs           > out/st1_r3_r4.txt
node st1branch.mjs     > out/st1branch.txt
node pairs.mjs         > out/pairs.txt
node l1.mjs            > out/l1.txt
node merge.mjs         > out/merge_splits.txt
node splits.mjs 4      > out/splits4.txt
node g1.mjs            > out/g1.txt
node g1b.mjs          >> out/g1.txt
node claims.mjs        > out/claims.txt
