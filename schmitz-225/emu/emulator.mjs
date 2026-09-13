import { readFileSync } from 'node:fs'
const LR = '/Users/nielspfeffer/Projects/linked-rolls/lib'
const { importJsonLd } = await import(`${LR}/importJsonLd.js`)
const { EditionView } = await import(`${LR}/EditionView.js`)
const { Emulation } = await import(`${LR}/Emulation.js`)
const { isPerforation } = await import(`${LR}/Symbol.js`)
const systemModule = await import(`${LR}/systems/welteT100/system.js`)

export const system = Object.values(systemModule).find(value => value && typeof value.perform === 'function')
export const { instruments, instrumentNames, nuanceOf } = systemModule
export const edition = importJsonLd(JSON.parse(readFileSync('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld', 'utf8')))
export const view = new EditionView(edition)
export const version = siglum => edition.versions.find(v => v.siglum === siglum)

const punchDiameters = edition.copies.map(copy => copy.measurements.punchDiameter?.value).filter(value => value > 0)
const punchDiameter = punchDiameters.length ? punchDiameters.reduce((a, b) => a + b) / punchDiameters.length : undefined

export const symbolsById = new Map()
const snapshotIds = siglum => {
    const symbols = view.snapshot(version(siglum).id)
    symbols.forEach(symbol => symbolsById.set(symbol.id, symbol))
    return new Set(symbols.map(symbol => symbol.id))
}
export const snap = Object.fromEntries(['A', 'A1', 'B', 'B1', 'C'].map(s => [s, snapshotIds(s)]))
const minus = (a, b) => new Set([...a].filter(id => !b.has(id)))

export const layers = {
    A1: { add: minus(snap.A1, snap.A), remove: minus(snap.A, snap.A1) },
    B: { add: minus(snap.B, snap.A), remove: minus(snap.A, snap.B) },
    B1: { add: minus(snap.B1, snap.B), remove: minus(snap.B, snap.B1) },
    Cadd: { add: minus(snap.C, snap.B), remove: new Set() },
    Cdel: { add: new Set(), remove: minus(snap.B, snap.C) },
}

export const negotiated = id => view.simplifySymbol(symbolsById.get(id), system.trackerBar)

/** Emulated note-on velocities, by note id, of the text made of these symbols. */
export const perform = (ids, nuance = nuanceOf(instruments.consensus)) => {
    const options = { ...system.defaultOptions, nuance }
    const emulation = new Emulation(system, options)
    emulation.negotiatedEvents = [...ids].map(id => symbolsById.get(id))
        .filter(isPerforation)
        .map(symbol => view.simplifySymbol(symbol, system.trackerBar))
        .filter(event => event !== null)
        .map(event => structuredClone(event))
        .sort((a, b) => a.horizontal.from - b.horizontal.from)
    emulation.applyConstraints(view)
    const performance = system.perform(emulation.negotiatedEvents, options,
        { punchDiameter, tempo: edition.tempoAdjustment, toOwnPaper: view.toOwnPaperOf(version('C')) })
    return new Map(performance.events.filter(event => event.type === 'noteOn').map(event => [event.performs.id, event.velocity]))
}
