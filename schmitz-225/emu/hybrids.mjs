import { readFileSync, writeFileSync } from 'node:fs'
const LR = '/Users/nielspfeffer/Projects/linked-rolls/lib'
const { importJsonLd } = await import(`${LR}/importJsonLd.js`)
const { EditionView } = await import(`${LR}/EditionView.js`)
const { Emulation } = await import(`${LR}/Emulation.js`)
const { isPerforation } = await import(`${LR}/Symbol.js`)
const systemModule = await import(`${LR}/systems/welteT100/system.js`)

const system = Object.values(systemModule).find(value => value && typeof value.perform === 'function')
const { instruments, instrumentNames, nuanceOf } = systemModule
const edition = importJsonLd(JSON.parse(readFileSync('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld', 'utf8')))
const view = new EditionView(edition)
const version = siglum => edition.versions.find(v => v.siglum === siglum)

const punchDiameters = edition.copies.map(copy => copy.measurements.punchDiameter?.value).filter(value => value > 0)
const punchDiameter = punchDiameters.length ? punchDiameters.reduce((a, b) => a + b) / punchDiameters.length : undefined

const symbolsById = new Map()
const snapshotIds = siglum => {
    const symbols = view.snapshot(version(siglum).id)
    symbols.forEach(symbol => symbolsById.set(symbol.id, symbol))
    return new Set(symbols.map(symbol => symbol.id))
}
const snap = Object.fromEntries(['A', 'A1', 'B', 'B1', 'C'].map(s => [s, snapshotIds(s)]))
const minus = (a, b) => new Set([...a].filter(id => !b.has(id)))

const layers = {
    A1: { add: minus(snap.A1, snap.A), remove: minus(snap.A, snap.A1) },
    B: { add: minus(snap.B, snap.A), remove: minus(snap.A, snap.B) },
    B1: { add: minus(snap.B1, snap.B), remove: minus(snap.B, snap.B1) },
    Cadd: { add: minus(snap.C, snap.B), remove: new Set() },
    Cdel: { add: new Set(), remove: minus(snap.B, snap.C) },
}
Object.entries(layers).forEach(([name, layer]) => console.log(name, 'adds', layer.add.size, 'removes', layer.remove.size))

const textOf = toggles => {
    const ids = new Set(snap.A)
    Object.entries(layers).filter(([name]) => toggles.includes(name)).forEach(([, layer]) => {
        layer.add.forEach(id => ids.add(id))
        layer.remove.forEach(id => ids.delete(id))
    })
    return [...ids].map(id => symbolsById.get(id))
}

const perform = (symbols, nuance) => {
    const options = { ...system.defaultOptions, nuance }
    const emulation = new Emulation(system, options)
    emulation.negotiatedEvents = symbols
        .filter(isPerforation)
        .map(symbol => view.simplifySymbol(symbol, system.trackerBar))
        .filter(event => event !== null)
        .map(event => structuredClone(event))
        .sort((a, b) => a.horizontal.from - b.horizontal.from)
    emulation.applyConstraints(view)
    const performance = system.perform(emulation.negotiatedEvents, options,
        { punchDiameter, tempo: edition.tempoAdjustment, toOwnPaper: view.toOwnPaperOf(version('C')) })
    return performance.events.filter(event => event.type === 'noteOn')
        .map(event => [event.performs.id, event.pitch, +event.at.toFixed(4), +event.velocity.toFixed(3)])
}

const consensus = nuanceOf(instruments.consensus)
const reference = new Emulation(system)
reference.emulateVersion(version('C'), view)
const referenceVelocity = new Map(reference.midiEvents.filter(e => e.type === 'noteOn').map(e => [e.performs.id, e.velocity]))
const check = perform(textOf(['B', 'Cadd', 'Cdel']), consensus)
console.log('hybrid B+Cadd+Cdel vs emulateVersion(C): max |Δv|', Math.max(...check.map(([id, , , v]) => Math.abs(v - referenceVelocity.get(id)))))

const names = Object.keys(layers)
const runs = []
for (let mask = 0; mask < 1 << names.length; mask++) {
    const toggles = names.filter((_, k) => mask & (1 << k))
    runs.push({ kind: 'hybrid', instrument: 'consensus', toggles, notes: perform(textOf(toggles), consensus) })
}
const versionToggles = { A: [], A1: ['A1'], B: ['B'], B1: ['B', 'B1'], C: ['B', 'Cadd', 'Cdel'] }
for (const name of instrumentNames) {
    for (const [siglum, toggles] of Object.entries(versionToggles)) {
        runs.push({ kind: 'version', siglum, instrument: name, toggles, notes: perform(textOf(toggles), nuanceOf(instruments[name])) })
    }
}
writeFileSync('hybrids.json', JSON.stringify({ layers: Object.fromEntries(Object.entries(layers).map(([k, l]) => [k, { add: [...l.add], remove: [...l.remove] }])), runs }))
console.log('runs', runs.length, 'instruments', instrumentNames.join(','))
