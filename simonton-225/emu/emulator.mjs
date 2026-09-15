import { readFileSync } from 'node:fs'

const LR = '/Users/nielspfeffer/Projects/measuring-early-records/node_modules/linked-rolls/lib'
const EDITION = '/Users/nielspfeffer/Projects/welte225.org/edition.jsonld'

const { importJsonLd } = await import(`${LR}/importJsonLd.js`)
const { EditionView } = await import(`${LR}/EditionView.js`)
const emulationModule = await import(`${LR}/Emulation.js`)
const { isPerforation } = await import(`${LR}/Symbol.js`)
export const { versionsWitnessedBy } = await import(`${LR}/witnesses.js`)
export const t100 = await import(`${LR}/systems/welteT100/system.js`)
const licensee = await import(`${LR}/systems/welteLicensee/system.js`)
const t98 = await import(`${LR}/systems/welteT98/system.js`)

export const { Emulation } = emulationModule
const systemIn = module => Object.values(module).find(value => value && typeof value.perform === 'function')
const modules = {
    'https://w3id.org/reo/type/system/welte-t100': t100,
    'https://w3id.org/reo/type/system/welte-licensee': licensee,
    'https://w3id.org/reo/type/system/welte-green': t98,
}
export const systemOf = version => systemIn(modules[version.system?.id ?? version.system?.['@id']] ?? t100)
export const redSystem = systemIn(t100)

export const edition = importJsonLd(JSON.parse(readFileSync(EDITION, 'utf8')))
export const view = new EditionView(edition)
export const version = siglum => edition.versions.find(v => v.siglum === siglum)
export const RED = ['A', 'A1', 'B', 'B2', 'C']

const diameterOf = copy => {
    const d = copy.measurements?.punchDiameter
    return typeof d === 'number' ? d : d?.value
}
const punchDiameters = edition.copies.map(diameterOf).filter(value => value > 0)
export const punchDiameter = punchDiameters.length ? punchDiameters.reduce((a, b) => a + b) / punchDiameters.length : undefined

export const symbolsById = new Map()
const idsOf = siglum => {
    const symbols = view.snapshot(version(siglum).id)
    symbols.forEach(symbol => symbolsById.set(symbol.id, symbol))
    return new Set(symbols.map(symbol => symbol.id))
}
export const snap = Object.fromEntries(edition.versions.map(v => [v.siglum, idsOf(v.siglum)]))
const minus = (a, b) => new Set([...a].filter(id => !b.has(id)))

export const layers = {
    A1: { add: minus(snap.A1, snap.A), remove: minus(snap.A, snap.A1) },
    B: { add: minus(snap.B, snap.A), remove: minus(snap.A, snap.B) },
    B2: { add: minus(snap.B2, snap.B), remove: minus(snap.B, snap.B2) },
    Cadd: { add: minus(snap.C, snap.B2), remove: new Set() },
    Cdel: { add: new Set(), remove: minus(snap.B2, snap.C) },
}
export const versionToggles = { A: [], A1: ['A1'], B: ['B'], B2: ['B', 'B2'], C: ['B', 'B2', 'Cadd', 'Cdel'] }

export const textOf = toggles => {
    const ids = new Set(snap.A)
    Object.entries(layers).filter(([name]) => toggles.includes(name)).forEach(([, layer]) => {
        layer.add.forEach(id => ids.add(id))
        layer.remove.forEach(id => ids.delete(id))
    })
    return ids
}

export const negotiated = id => view.simplifySymbol(symbolsById.get(id), redSystem.trackerBar)

const isNote = symbol => symbol.type === 'note'
const placeOf = symbol => symbol.horizontal?.from ?? view.simplifySymbol(symbol, redSystem.trackerBar)?.horizontal.from

/** A note symbol outside C stands for the note of the same pitch C has nearest to it, within 20 mm. */
export const canonicalNoteIds = (() => {
    const cNotes = [...snap.C].map(id => symbolsById.get(id)).filter(isNote)
        .map(symbol => ({ id: symbol.id, pitch: symbol.pitch, at: negotiated(symbol.id)?.horizontal.from }))
    const canonical = new Map()
    for (const [id, symbol] of symbolsById) {
        if (!isNote(symbol)) continue
        if (snap.C.has(id)) {
            canonical.set(id, id)
            continue
        }
        const at = negotiated(id)?.horizontal.from
        const nearest = cNotes.filter(n => n.pitch === symbol.pitch && Math.abs(n.at - at) < 20)
            .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0]
        if (nearest) canonical.set(id, nearest.id)
    }
    return canonical
})()

/** Emulated note-on events of the red text made of these symbols, keyed by symbol id. */
export const perform = (ids, nuance = t100.nuanceOf(t100.instruments.consensus)) => {
    const options = { ...(redSystem.defaultOptions ?? t100.defaultWelteT100Options), nuance }
    const emulation = new Emulation(redSystem, options)
    emulation.negotiatedEvents = [...ids].map(id => symbolsById.get(id))
        .filter(isPerforation)
        .map(symbol => view.simplifySymbol(symbol, redSystem.trackerBar))
        .filter(event => event !== null)
        .map(event => structuredClone(event))
        .sort((a, b) => a.horizontal.from - b.horizontal.from)
    emulation.applyConstraints(view)
    const performance = redSystem.perform(emulation.negotiatedEvents, options,
        { punchDiameter, tempo: edition.tempoAdjustment, toOwnPaper: view.toOwnPaperOf(version('C')) })
    return new Map(performance.events.filter(event => event.type === 'noteOn')
        .map(event => [event.performs.id, { velocity: event.velocity, at: event.at, pitch: event.pitch }]))
}

export { placeOf }
