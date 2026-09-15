import { writeFileSync } from 'node:fs'
import { canonicalNoteIds, perform, snap, t100 } from './emulator.mjs'

const consensus = t100.nuanceOf(t100.instruments.consensus)
const scaled = (factors) => Object.fromEntries(Object.entries(consensus).map(([half, p]) =>
    [half, { ...p, ...Object.fromEntries(Object.entries(factors).map(([key, f]) => [key, p[key] * f])) }]))
const deformations = {
    consensus: {},
    'slow crescendo pump ×0.3': { crescendoRate: 0.3, releaseRate: 0.3 },
    'slow sforzando ×0.3': { sforzandoRate: 0.3, sforzandoAssistRate: 0.3 },
    'all pumps slow ×0.3': { crescendoRate: 0.3, releaseRate: 0.3, sforzandoRate: 0.3, sforzandoAssistRate: 0.3 },
    'all pumps fast ×3': { crescendoRate: 3, releaseRate: 3, sforzandoRate: 3, sforzandoAssistRate: 3 },
    'dead sforzando valve': { sforzandoRate: 0, sforzandoAssistRate: 0 },
    'dead crescendo valve': { crescendoRate: 0 },
}
const velocities = (ids, nuance) => Object.fromEntries([...perform(ids, nuance)].map(([id, e]) => [canonicalNoteIds.get(id) ?? id, +e.velocity.toFixed(3)]))
const runs = []
for (const [name, factors] of Object.entries(deformations)) {
    for (const truth of ['A', 'B', 'C']) runs.push({ deformation: name, truth, velocities: velocities(snap[truth], scaled(factors)) })
}
writeFileSync('deformed.json', JSON.stringify(runs))
console.log('runs', runs.length)
