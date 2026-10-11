import sys, collections, numpy as np
import matrix as MX, trees as T, run as R
def decompose(chars, t1, t2, G=10, eps=0.25, show=25):
    sc = T.Scorer(chars, MX.COPIES, G=G, eps=eps)
    a = sc.per_class(t1); b = sc.per_class(t2)
    d = collections.defaultdict(float)
    for k, w, x, y in zip(sc.keys, sc.w, a, b):
        if x != y: d[(''.join(s if s!='0' else '.' for s in k[0]), k[1])] += w*(y-x)
    tot = sum(d.values())
    print(f'cost({T.fmt(t2)}) - cost({T.fmt(t1)}) = {tot:.2f}')
    for k, v in sorted(d.items(), key=lambda kv: -abs(kv[1]))[:show]:
        print(f'   {k[0]} loss={k[1]}  {v:+.2f}')
if __name__ == '__main__':
    chars = MX.build(bo1='subst5')
    res, named, sc = R.analyze(chars)
    decompose(chars, res[0][3], R.EDITOR)
