// One exaggeration level: espressivo scales every expressive dimension of the MPM by s
// (exaggerateMpm with weightedFactors(s, {}): 0 = neutral, 1 = as encoded, 2 = doubled), then
// renders it like render.mjs and render_curve.mjs do.  node exag_render.mjs <s> <outdir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { convertMeiToMsm, performMsmToData, exaggerateMpm, weightedFactors } from 'espressivo';
const [s, out] = [Number(process.argv[2]), process.argv[3]];
const mei = readFileSync('../data/transcription.mei', 'utf-8');
const src = readFileSync('../data/performance.mpm', 'utf-8');
const { mpm, report } = exaggerateMpm(src, { factors: weightedFactors(s, {}) });
for (const d of ['data', 'render', 'work/dry', 'work/final', 'work/mp3', 'work_rec']) mkdirSync(`${out}/${d}`, { recursive: true });
writeFileSync(`${out}/data/performance.mpm`, mpm);
const [movement] = convertMeiToMsm(mei, { sourceName: 'transcription.mei' });
const data = performMsmToData({ msm: movement.msm, mpm });
writeFileSync(`${out}/render/performed.json`, JSON.stringify(data));
const sub = mpm.replace(/<dynamics /g, '<dynamics subNoteDynamics="true" ');
const cv = performMsmToData({ msm: movement.msm, mpm: sub }).parts[0].controlChanges.find(c => c.kind === 'channelVolume');
writeFileSync(`${out}/render/dynamics_curve.json`, JSON.stringify(cv.points));
const notes = data.parts.flatMap(p => p.notes);
const end = Math.max(...notes.map(n => n.milliseconds.end));
console.log(`s=${s}: ${report.totalWrites} writes, ${notes.length} notes, ends ${(end / 1000).toFixed(1)} s, ${cv.points.length} curve points`);
