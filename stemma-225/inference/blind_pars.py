"""Dollo parsimony on the blind matrix (collation without the editor), three Bo1 treatments, with the per-question
margins of pars_questions.py. Reconstructed when the analysis was packaged (the original was run ad hoc); it
reproduces results_blind_pars.txt. usage: MATRIX_JSON=matrix_blind.json python3 blind_pars.py > results_blind_pars.txt"""
import matrix as MX, run as R, ml_report as Mr

print('matrix', MX.MJ)
for title, bo1 in [('blind, Bo1 via recoding links, Dollo G=10 eps=.25', 'links'),
                   ('blind, Bo1 own near-match', 'near5m'),
                   ('blind, Bo1 red expr missing', 'missing')]:
    res, named, sc = R.analyze(MX.build(bo1=bo1), G=10, eps=0.25)
    R.report(title, res, named, topk=4)
    b = res[0][0]
    for q, f in Mr.Q.items():
        yes = next((r for r in res if f(r[3])), None); no = next((r for r in res if not f(r[3])), None)
        print(f'   {q:45s} yes +{yes[0]-b:6.2f} | no +{no[0]-b:6.2f}')
