import re, glob, numpy as np
files = sorted(set(glob.glob('/Users/nielspfeffer/Projects/rollscan2image/scans/*/*analysis*.txt') + glob.glob('/Users/nielspfeffer/Downloads/**/*_analysis.txt', recursive=True)))
field = re.compile(r'^@(\w+):\s+([-\d.]+)', re.M)
for path in files:
    text = open(path, errors='replace').read()
    info = dict(field.findall(text.split('@@BEGIN: HOLES')[0]))
    holes = [dict(field.findall(block)) for block in text.split('@@BEGIN: HOLE\n')[1:]]
    rows = np.array([float(h['WIDTH_ROW']) for h in holes if 'WIDTH_ROW' in h]); cols = np.array([float(h['WIDTH_COL']) for h in holes if 'WIDTH_ROW' in h])
    circ = np.array([float(h.get('CIRCULARITY', 0)) for h in holes if 'WIDTH_ROW' in h])
    round_ = (circ >= 0.8) & (rows < 1.6 * cols)
    sep = [v for k, v in info.items() if 'SEPARATION' in k]
    print(path.split('/scans/')[-1][:70], '| LENGTH_DPI', info.get('LENGTH_DPI'), '| hole separation', sep[:1], '| holes', len(holes))
    if round_.sum():
        r = rows[round_] / cols[round_]
        print(f"   round single punches (circularity ≥ 0.8): {round_.sum()}, length/width median {np.median(r):.3f} (IQR {np.percentile(r, 25):.3f}–{np.percentile(r, 75):.3f}); width median {np.median(cols[round_]):.1f} px, length median {np.median(rows[round_]):.1f} px")
    short = rows <= np.percentile(rows, 10)
    print(f"   shortest decile of all holes: length median {np.median(rows[short]):.1f} px against width median {np.median(cols[short]):.1f} px")
