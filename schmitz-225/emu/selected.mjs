import { readFileSync, writeFileSync } from 'node:fs'
import { perform, snap } from './emulator.mjs'

const { clusters } = JSON.parse(readFileSync('scan.json', 'utf8'))
const pick = (family, start) => clusters.find(c => c.family === family && Math.round(Math.min(...c.symbols.map(s => s.from))) === start)
const without = picked => {
    const text = new Set(snap.C)
    picked.flatMap(c => c.symbols).forEach(({ id }) => text.delete(id))
    return text
}
const texts = {
    C: snap.C,
    'C − B@3361': without([pick('B', 3361)]),
    'C − B@3459': without([pick('B', 3459)]),
    'C − B@9502': without([pick('B', 9502)]),
    'C − B@{3361,3459,9502}': without([pick('B', 3361), pick('B', 3459), pick('B', 9502)]),
}
const runs = Object.entries(texts).map(([label, ids]) => ({ label, notes: [...perform(ids)].map(([id, v]) => [id, 0, 0, +v.toFixed(3)]) }))
writeFileSync('selected.json', JSON.stringify({ runs }))
console.log(runs.map(r => r.label).join(' | '))
