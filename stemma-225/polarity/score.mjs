// score alignment: symbol id -> score note (msm date, pitch), from the MEI recordings
import { readFileSync } from 'node:fs'
import { inRoot } from '../paths.mjs'
const mei = readFileSync(inRoot('mpm', 'transcription.mei'), 'utf8')
const msm = readFileSync(inRoot('mpm', 'score.msm'), 'utf8')
export const scoreNotes = new Map()
for (const m of msm.matchAll(/<note xml:id="([^"]+)" date="(\d+)" midi.pitch="(\d+)"[^>]*duration="(\d+)"/g)) scoreNotes.set(m[1], { id: m[1], date: +m[2], pitch: +m[3], dur: +m[4] })
export const recordings = {}
for (const r of mei.matchAll(/<recording source="([^"]+)">([\s\S]*?)<\/recording>/g)) {
  const map = new Map()
  for (const w of r[2].matchAll(/<when ([^>]*)>/g)) {
    const c = w[1].match(/corresp="([^"]+)"/), d = w[1].match(/data="#([^"]+)"/)
    if (!c || !d) continue
    for (const sid of c[1].split(' ')) map.set(sid, d[1])
  }
  recordings[r[1]] = map
}
export const PPQ = 720, BAR = 2880, START = 720
export const barOf = date => date < START ? 0 : Math.floor((date - START) / BAR) + 1
export const beatOf = date => ((date - START) % BAR + BAR) % BAR / PPQ // 0..4
