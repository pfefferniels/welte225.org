import trees as T
ALL6 = frozenset(['St1','St2','Wi1','Ch1','Bo1','Ne1'])
def splits(t):
    out = set()
    def rec(n):
        for c in n[1]:
            Lc = frozenset(T.descendants_labels(c))
            if 1 < len(Lc) < 5:
                out.add(min(Lc, ALL6 - Lc, key=lambda s: (len(s), sorted(s))))
            rec(c)
    rec(t)
    return frozenset(out)
