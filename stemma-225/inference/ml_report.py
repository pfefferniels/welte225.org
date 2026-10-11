"""Summarise an ML/BIC search (jsonl from mlsearch.py): optimum, uniqueness, runner-ups, and per-question margins."""
import sys, json, math
import trees as T, run as R


def tup(x):
    return (x[0], tuple(tup(c) for c in x[1]))


def parent_map(t, par=None, out=None):
    out = {} if out is None else out
    out[id(t)] = par
    for c in t[1]:
        parent_map(c, t, out)
    return out


def nodes(t):
    yield t
    for c in t[1]:
        yield from nodes(c)


def find(t, lab):
    return next((n for n in nodes(t) if n[0] == lab), None)


def labels_below(n):
    return T.descendants_labels(n)


def mrca(t, a, b):
    best = None
    for n in nodes(t):
        L = labels_below(n)
        if a in L and b in L:
            best = n  # pre-order: last match is the deepest
    return best


Q = {
    'r3: MRCA(St2,Ne1) is a hidden node below St1': lambda t: (lambda m: m is not None and m[0] is None and 'St1' not in labels_below(m)
                                                               and any(n[0] == 'St1' and m in list(nodes(n))[1:] for n in nodes(t)))(mrca(t, 'St2', 'Ne1')),
    'St1 is a sampled ancestor (internal node)': lambda t: bool(find(t, 'St1')[1]),
    'St1 is an ancestor of St2 and Ne1': lambda t: {'St2', 'Ne1'} <= labels_below(find(t, 'St1')),
    'Wi1 branches off at an unobserved root': lambda t: t[0] is None and any(c[0] == 'Wi1' and not c[1] for c in t[1]),
    'Ch1 is a child of St2': lambda t: any(c[0] == 'Ch1' for c in find(t, 'St2')[1]),
    'Bo1 is a child of St2': lambda t: any(c[0] == 'Bo1' for c in find(t, 'St2')[1]),
    'Ne1 groups with St2 (not with Wi1/St1)': lambda t: 'Ne1' in labels_below(mrca(t, 'St2', 'Ne1')) and 'Wi1' not in labels_below(mrca(t, 'St2', 'Ne1')) and 'St1' not in (labels_below(mrca(t, 'St2', 'Ne1')) - {mrca(t, 'St2', 'Ne1')[0]}),
    'exact editor topology': lambda t: T.canon(t) == T.canon(R.EDITOR),
}


def main(path, top=15):
    rows = [json.loads(l) for l in open(path)]
    for r in rows:
        r['t'] = tup(r['t'])
    rows.sort(key=lambda r: r['bic'])
    b = rows[0]['bic']
    print(f'{path}: {len(rows)} trees; best BIC {b:.2f}')
    for i, r in enumerate(rows[:top]):
        print(f"  {i + 1:2d}. BIC {r['bic']:9.2f} (+{r['bic'] - b:6.2f})  logL {r['ll']:9.2f} k={r['k']:2d} hidden={r['hidden']}  {r['tree']}")
    ed = next((i for i, r in enumerate(rows) if T.canon(r['t']) == T.canon(R.EDITOR)), None)
    if ed is not None:
        print(f"  editor's tree: rank {ed + 1}, BIC +{rows[ed]['bic'] - b:.2f}")
    print('  per question: best tree WITH / WITHOUT the property (delta BIC relative to optimum)')
    for q, f in Q.items():
        yes = next((r for r in rows if f(r['t'])), None)
        no = next((r for r in rows if not f(r['t'])), None)
        fy = f"+{yes['bic'] - b:7.2f} {yes['tree'][:48]:48s}" if yes else 'none'
        fn = f"+{no['bic'] - b:7.2f} {no['tree']}" if no else 'none'
        print(f"    {q:45s} yes: {fy} | no: {fn}")
    return rows


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 15)
