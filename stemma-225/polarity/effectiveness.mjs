// emulator effectiveness of every expression symbol in a version's text: remove it, re-emulate, compare
import { writeFileSync } from 'node:fs'
import { ed, sig, V, LR, symById, fmt, textOf, latchRedundancies, carrierCopies, place } from './common.mjs'
import { effectOf } from './emu.mjs'
const sg = process.argv[2]
const t = textOf(sg), red = latchRedundancies(t)
const out = []
for (const s of t.filter(s => s.type === 'expression')) {
  const r = effectOf(sg, { remove: [s.id] })
  out.push({ id: s.id, sym: fmt(s), at: place(s)?.from, carriers: carrierCopies(s), latchRed: red.get(s.id)?.kind ?? null, maxDv: r.maxDv, n1: r.n1, n01: r.n01, damper: r.pedal.damper, hammerRail: r.pedal.hammerRail })
}
writeFileSync(new URL(`eff_${sg}.json`, import.meta.url), JSON.stringify(out, null, 0))
console.log(sg, 'done', out.length)
