"""Unrooted view of the ML/BIC results: group trees by their set of splits (bipartitions of the 6 copies)."""
import json, sys, collections
import trees as T, ml_report as Mr
ALL6 = frozenset(['St1','St2','Wi1','Ch1','Bo1','Ne1'])
def splits(t):
    out = set()
    def rec(n):
        L = T.descendants_labels(n)
        for c in n[1]:
            Lc = frozenset(T.descendants_labels(c))
            if 1 < len(Lc) < 5:   # nontrivial
                out.add(min(Lc, ALL6 - Lc, key=lambda s: (len(s), sorted(s))))
            if len(Lc) == 1 or len(Lc) == 5:
                pass
            rec(c)
    rec(t)
    return frozenset(out)
def fs(s): return '|'.join(sorted('{'+','.join(sorted(x))+'}' for x in s))
rows = [json.loads(l) for l in open(sys.argv[1])]
for r in rows: r['t'] = Mr.tup(r['t'])
rows.sort(key=lambda r: r['bic'])
b = rows[0]['bic']; bl = max(r['ll'] for r in rows)
best = {}
for r in rows:
    k = splits(r['t'])
    if k not in best: best[k] = r
print('best tree per unrooted split set (top 12 by BIC); max logL overall', round(bl,2))
for i,(k, r) in enumerate(sorted(best.items(), key=lambda kv: kv[1]['bic'])[:12]):
    # also best logL within this split set
    mll = max(x['ll'] for x in rows if splits(x['t']) == k)
    print(f"  {i+1:2d}. dBIC +{r['bic']-b:7.2f}  best logL in class {mll:9.2f} (d {mll-bl:+.2f})  splits {fs(k):40s} e.g. {r['tree']}")
target = frozenset([frozenset(['St1','Wi1'])])
r3split = frozenset(['St1','Wi1'])
noR3 = next(r for r in rows if r3split not in splits(r['t']))
print('best tree WITHOUT the r3 split {St1,Wi1}|{St2,Ch1,Bo1,Ne1}:', noR3['tree'], 'dBIC', round(noR3['bic']-b,2), 'logL', round(noR3['ll'],2))
pars = next(r for r in rows if r['tree'] == '*(*(*(*(Bo1,St2(Ch1)),St1),Ne1),Wi1)')
print('parsimony optimum *(*(*(*(Bo1,St2(Ch1)),St1),Ne1),Wi1): dBIC', round(pars['bic']-b,2), 'logL', round(pars['ll'],2))
