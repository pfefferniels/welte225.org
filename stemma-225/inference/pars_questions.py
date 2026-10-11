"""Per-question margins for Dollo parsimony (best admissible tree with / without each property)."""
import matrix as MX, run as R, trees as T, ml_report as Mr
for title, mo, ao in [('A near5m G=10 eps=.25', dict(bo1='near5m'), dict(G=10, eps=0.25)),
                      ('A2 + Ne1 merge 10mm', dict(bo1='near5m', merge=(10, 'Ne1')), dict(G=10, eps=0.25)),
                      ('B Bo1 missing', dict(bo1='missing'), dict(G=10, eps=0.25))]:
    res, named, sc = R.analyze(MX.build(**mo), **ao)
    b = res[0][0]
    print(f'\n== {title}: optimum {res[0][2]} cost {b}')
    for q, f in Mr.Q.items():
        yes = next((r for r in res if f(r[3])), None); no = next((r for r in res if not f(r[3])), None)
        print(f'   {q:45s} yes +{yes[0]-b:6.2f} {yes[2]:42s} | no +{no[0]-b:6.2f} {no[2]}')
