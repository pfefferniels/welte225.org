import { readFileSync, writeFileSync } from 'node:fs';
import { convertMeiToMsm, performMsmToData, renderExpressiveMidi, renderMidi } from 'espressivo';

const dir = '../data/';
const mei = readFileSync(dir + 'transcription.mei', 'utf-8');
const mpm = readFileSync(dir + 'performance.mpm', 'utf-8');
const [movement] = convertMeiToMsm(mei, { sourceName: 'transcription.mei' });
writeFileSync('score_converted.msm', movement.msm);
const data = performMsmToData({ msm: movement.msm, mpm });
writeFileSync('performed.json', JSON.stringify(data, null, 1));
writeFileSync('gruenfeld_full.mid', renderExpressiveMidi({ msm: movement.msm, mpm }));
writeFileSync('score_deadpan.mid', renderMidi({ msm: movement.msm }));
for (const part of data.parts) console.log(part.name, part.midiChannel, part.notes.length, Object.keys(part.controlChanges ?? {}));
console.log(JSON.stringify(data.parts[0].notes.slice(0, 3), null, 1));
