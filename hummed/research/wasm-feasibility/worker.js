// One benchmark run of VocalTractLab in a worker: load the engine, the speaker and 10 s of the
// hum's tract and glottis states, synthesize, report the time and send the audio back.
// the states travel as base64 text: binary files are not among the types artifacts serve
const unb64 = t => Uint8Array.from(atob(t.trim()), ch => ch.charCodeAt(0)).buffer;

self.onmessage = async (e) => {
  const { engine, task, tol, fast } = e.data;
  try {
    importScripts(engine.file, 'vtl_bench.js');
    const M = await self[engine.factory]({ print() {}, printErr() {} });
    const [spk, tb, gb] = await Promise.all([
      fetch('hummer_speaker.xml').then(r => r.text()),
      fetch('tract_b64.txt').then(r => r.text()).then(unb64),
      fetch('glottis_b64.txt').then(r => r.text()).then(unb64),
    ]);
    const c = self.VTLBench.api(M, spk);
    const vp = M._malloc(64); M._vtlGetVersion(vp);
    let version = ''; for (let i = 0; i < 63; i++) { const ch = M.getValue(vp + i, 'i8'); if (!ch) break; version += String.fromCharCode(ch); }
    M._free(vp);
    const T = new Float64Array(tb), G = new Float64Array(gb), N = T.length / c.nT;
    const r = task === 'tract' ? self.VTLBench.runTract(M, c, T, G, N) : self.VTLBench.runTube(M, c, T, G, N, tol, fast);
    self.postMessage({ ok: true, ms: r.ms, secs: (N - 1) * c.step / c.sr, calcs: r.calcs || N, version, audio: r.audio }, [r.audio.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
