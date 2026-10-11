"""Exhaustive ML/BIC search over all system-admissible stemmata (22,472 trees).
usage: python3 mlsearch.py <out.jsonl> <classes> <bo1> [merge_d] [subset_file]"""
import sys, json, os, time
from multiprocessing import Pool
import matrix as MX, trees as T, run as R
import fastml as ml

OUT, CLASSES, BO1 = sys.argv[1], sys.argv[2], sys.argv[3]
MERGE = (float(sys.argv[4]), 'Ne1') if len(sys.argv) > 4 and sys.argv[4] != '-' else None
SUBSET = sys.argv[5] if len(sys.argv) > 5 else None
chars = MX.build(bo1=BO1, merge=MERGE)
D = ml.Data(chars, classes=CLASSES)


def work(t):
    ll, nodes, th = ml.fit(t, D)
    k = ml.n_params(t, D)
    return dict(tree=T.fmt(t), ll=ll, k=k, bic=ml.bic(ll, k, D.n), hidden=T.n_hidden(t), t=t)


if __name__ == '__main__':
    trees = [t for t in T.all_trees(MX.COPIES) if T.ok_systems(t, MX.SYSTEM)]
    if SUBSET:
        keep = set(json.load(open(SUBSET)))
        trees = [t for t in trees if T.fmt(t) in keep]
    t0 = time.time()
    with Pool(4) as pool, open(OUT, 'w') as f:
        for i, r in enumerate(pool.imap_unordered(work, trees, chunksize=8)):
            f.write(json.dumps(r) + '\n')
            if i % 1000 == 0:
                f.flush(); print(i, round(time.time() - t0), flush=True)
    print('done', len(trees), round(time.time() - t0))
