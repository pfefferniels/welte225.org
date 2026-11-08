"""Analyse the recording, calibrate VTL, build the codebook; save to step1.npz."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import vtlfit as V

y = V.load_target(sys.argv[1])
A = V.analyse(y)
print('frames', len(A['t']), 'voiced', A['voiced'].mean().round(3), 'floor (dB) at 100/1k/4k Hz',
      np.interp([100, 1000, 4000], V.GRID, A['floor']).round(1))
t = time.time(); calib = V.calibrate(); print('calibration', round(time.time() - t, 1), 's', calib[::8].round(1))
t = time.time(); cb = V.codebook(1500)
cbdb = np.array([V.tf_db(s) for s in cb]); print('codebook', len(cb), round(time.time() - t, 1), 's')
np.savez('step1.npz', y=y, calib=calib, cb=cb, cbdb=cbdb, **{k: v for k, v in A.items()})
