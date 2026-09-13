import { writeFileSync } from 'node:fs'
import { negotiated, snap, symbolsById } from './emulator.mjs'

const all = new Set(Object.values(snap).flatMap(ids => [...ids]))
const perforations = [...all].map(id => {
    const symbol = symbolsById.get(id)
    const event = negotiated(id)
    if (!event) return null
    return {
        id,
        kind: symbol.type,
        pitch: symbol.pitch ?? null,
        type: event.expressionType ?? null,
        scope: event.scope ?? null,
        from: +event.horizontal.from.toFixed(2),
        to: +event.horizontal.to.toFixed(2),
        in: Object.entries(snap).filter(([, ids]) => ids.has(id)).map(([siglum]) => siglum),
    }
}).filter(Boolean).sort((a, b) => a.from - b.from)
writeFileSync('perforations.json', JSON.stringify(perforations))
console.log(perforations.length, perforations.filter(p => p.kind === 'note').length, 'notes', perforations.find(p => p.kind === 'note'))
