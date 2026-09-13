import { readFileSync, writeFileSync } from 'node:fs'
import { perform, snap } from './emulator.mjs'

const { clusters } = JSON.parse(readFileSync('scan.json', 'utf8'))
const cluster = clusters.find(c => c.family === 'B' && Math.round(Math.min(...c.symbols.map(s => s.from))) === 3361)
const ofType = prefix => cluster.symbols.filter(s => s.type.startsWith(prefix)).map(s => s.id)
const without = ids => {
    const text = new Set(snap.C)
    ids.forEach(id => text.delete(id))
    return text
}
const texts = {
    C: snap.C,
    'C − crescendo 3361/3388': without(ofType('SlowCrescendo')),
    'C − sforzando 3423/3429': without(ofType('Forzando')),
    'C − both': without(cluster.symbols.map(s => s.id)),
}
writeFileSync('units3361.json', JSON.stringify({ runs: Object.entries(texts).map(([label, ids]) => ({ label, notes: [...perform(ids)].map(([id, v]) => [id, 0, 0, +v.toFixed(3)]) })) }))
console.log(cluster.symbols)
