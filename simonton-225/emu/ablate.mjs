import { writeFileSync } from 'node:fs'
import { canonicalNoteIds, layers, negotiated, perform, snap, symbolsById } from './emulator.mjs'

const controlOf = type => type.replace(/(On|Off)$/, '')
const keyOf = id => {
    const event = negotiated(id)
    return event ? `${controlOf(event.expressionType)}|${event.scope ?? '-'}` : 'none'
}
const expressionsIn = ids => [...ids].filter(id => symbolsById.get(id).type === 'expression')
const groupsOf = ids => Map.groupBy(expressionsIn(ids), keyOf)
const velocities = ids => Object.fromEntries([...perform(ids)].map(([id, e]) => [canonicalNoteIds.get(id) ?? id, +e.velocity.toFixed(3)]))
const variant = (name, count, change) => {
    const text = new Set(snap.A)
    change(text)
    return { name, count, velocities: velocities(text) }
}

const variants = [variant('A', 0, () => {})]
for (const [key, ids] of groupsOf(snap.A)) variants.push(variant(`A without its own ${key}`, ids.length, text => ids.forEach(id => text.delete(id))))
for (const [key, ids] of groupsOf(layers.B.add)) variants.push(variant(`A with B's added ${key}`, ids.length, text => ids.forEach(id => text.add(id))))
for (const [key, ids] of groupsOf(layers.B.remove)) variants.push(variant(`A without the ${key} B removes`, ids.length, text => ids.forEach(id => text.delete(id))))
writeFileSync('ablate.json', JSON.stringify(variants))
console.log(variants.map(v => `${v.name} (${v.count})`).join('\n'))
