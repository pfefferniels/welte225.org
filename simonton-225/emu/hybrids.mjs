import { writeFileSync } from 'node:fs'
import { canonicalNoteIds, Emulation, layers, perform, t100, textOf, version, versionToggles, view } from './emulator.mjs'

Object.entries(layers).forEach(([name, layer]) => console.log(name, 'adds', layer.add.size, 'removes', layer.remove.size))

const rows = (performance) => [...performance].map(([id, e]) => [canonicalNoteIds.get(id) ?? id, e.pitch, +e.at.toFixed(4), +e.velocity.toFixed(3)])

const consensus = t100.nuanceOf(t100.instruments.consensus)
const reference = new Emulation(Object.values(t100).find(value => value && typeof value.perform === 'function'))
reference.emulateVersion(version('C'), view)
const referenceVelocity = new Map(reference.midiEvents.filter(e => e.type === 'noteOn').map(e => [e.performs.id, e.velocity]))
const check = perform(textOf(versionToggles.C), consensus)
console.log('hybrid of C vs emulateVersion(C): max |Δv|', Math.max(...[...check].map(([id, e]) => Math.abs(e.velocity - referenceVelocity.get(id)))),
    'notes', check.size, referenceVelocity.size)

const names = Object.keys(layers)
const runs = []
for (let mask = 0; mask < 1 << names.length; mask++) {
    const toggles = names.filter((_, k) => mask & (1 << k))
    runs.push({ kind: 'hybrid', instrument: 'consensus', toggles, notes: rows(perform(textOf(toggles), consensus)) })
}
for (const name of t100.instrumentNames) {
    for (const [siglum, toggles] of Object.entries(versionToggles)) {
        runs.push({ kind: 'version', siglum, instrument: String(name), toggles, notes: rows(perform(textOf(toggles), t100.nuanceOf(t100.instruments[name]))) })
    }
}
writeFileSync('hybrids.json', JSON.stringify({ layers: Object.fromEntries(Object.entries(layers).map(([k, l]) => [k, { add: [...l.add], remove: [...l.remove] }])), runs }))
console.log('runs', runs.length, 'instruments', t100.instrumentNames.join(','))
