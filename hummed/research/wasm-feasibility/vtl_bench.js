// VocalTractLab in the browser: three ways to synthesize the same 10 s of the hum, timed.
//   tract : VTL's own path, one tract state every 110 samples (geometry + acoustics each time)
//   tube  : geometry only when the tract has moved, then VTL's acoustics from tube shapes
//   score : the whole gestural score file at once (vtlGesturalScoreToAudio)
// Works in a browser worker and in Node; `M` is an instance of the Emscripten module.
(function (root) {
  function api(M, speakerText) {
    M.FS.writeFile('/hummer.speaker', speakerText);
    if (M.ccall('vtlInitialize', 'number', ['string'], ['/hummer.speaker']) !== 0) throw new Error('vtlInitialize failed');
    const p = M._malloc(64);
    M.ccall('vtlGetConstants', 'number', ['number', 'number', 'number', 'number', 'number', 'number'],
      [p, p + 4, p + 8, p + 12, p + 16, p + 24]);
    const c = { sr: M.getValue(p, 'i32'), sections: M.getValue(p + 4, 'i32'), nT: M.getValue(p + 8, 'i32'),
      nG: M.getValue(p + 12, 'i32'), step: M.getValue(p + 16, 'i32') };
    M._free(p);
    return c;
  }
  const H = M => M.HEAPF64 || new Float64Array(M.wasmMemory ? M.wasmMemory.buffer : M.buffer);

  function runTract(M, c, T, G, N) {
    const tp = M._malloc(8 * c.nT), gp = M._malloc(8 * c.nG), au = M._malloc(8 * c.step);
    const out = new Float32Array((N - 1) * c.step);
    M._vtlSynthesisReset();
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const h = H(M);
      h.set(T.subarray(i * c.nT, (i + 1) * c.nT), tp >> 3); h.set(G.subarray(i * c.nG, (i + 1) * c.nG), gp >> 3);
      M._vtlSynthesisAddTract(i ? c.step : 0, au, tp, gp);
      if (i) out.set(H(M).subarray(au >> 3, (au >> 3) + c.step), (i - 1) * c.step);
    }
    const ms = performance.now() - t0;
    [tp, gp, au].forEach(x => M._free(x));
    return { audio: out, ms };
  }

  function runTube(M, c, T, G, N, tol, fast) {
    const n = c.sections;
    const tp = M._malloc(8 * c.nT), gp = M._malloc(8 * c.nG), au = M._malloc(8 * c.step);
    const len = M._malloc(8 * n), area = M._malloc(8 * n), art = M._malloc(4 * n), sc = M._malloc(24);
    const geom = fast ? M._vtlFastTractToTube : M._vtlTractToTube;
    const out = new Float32Array((N - 1) * c.step);
    let last = null, calcs = 0, inc = 0, tts = 0, vel = 0;
    M._vtlSynthesisReset();
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const tr = T.subarray(i * c.nT, (i + 1) * c.nT);
      let moved = !last;
      if (last) for (let k = 0; k < c.nT; k++) if (Math.abs(tr[k] - last[k]) > tol) { moved = true; break; }
      if (moved) {
        H(M).set(tr, tp >> 3);
        geom(tp, len, area, art, sc, sc + 8, sc + 16);
        const h = H(M); inc = h[sc >> 3]; tts = h[(sc >> 3) + 1]; vel = h[(sc >> 3) + 2];
        last = tr.slice(); calcs++;
      }
      H(M).set(G.subarray(i * c.nG, (i + 1) * c.nG), gp >> 3);
      M._vtlSynthesisAddTube(i ? c.step : 0, au, len, area, art, inc, vel, tts, gp);
      if (i) out.set(H(M).subarray(au >> 3, (au >> 3) + c.step), (i - 1) * c.step);
    }
    const ms = performance.now() - t0;
    [tp, gp, au, len, area, art, sc].forEach(x => M._free(x));
    return { audio: out, ms, calcs };
  }

  function runScore(M, c, gesText) {
    M.FS.writeFile('/score.ges', gesText);
    const p = M._malloc(8);
    M.ccall('vtlGetGesturalScoreDuration', 'number', ['string', 'number', 'number'], ['/score.ges', p, p + 4]);
    const n = M.getValue(p, 'i32'); M._free(p);
    const au = M._malloc(8 * (n + 1000)), np = M._malloc(4);
    const t0 = performance.now();
    const r = M.ccall('vtlGesturalScoreToAudio', 'number', ['string', 'string', 'number', 'number', 'boolean'],
      ['/score.ges', '', au, np, false]);
    const ms = performance.now() - t0;
    const got = M.getValue(np, 'i32');
    const audio = Float32Array.from(H(M).subarray(au >> 3, (au >> 3) + got));
    M._free(au); M._free(np);
    return { audio, ms, ok: r === 0 };
  }

  root.VTLBench = { api, runTract, runTube, runScore };
})(typeof self !== 'undefined' ? self : globalThis);
