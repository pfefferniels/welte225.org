import { ed, sig, V, LR, symById, fmt, textOf } from './common.mjs'
import { effectOf, contextOf, baseline } from './emu.mjs'
let t = Date.now()
const c = contextOf('R2'); console.log('events', c.events.length, 'props', JSON.stringify(c.props), Date.now() - t, 'ms'); t = Date.now()
const b = baseline('R2'); console.log('notes', b.vel.size, Date.now() - t, 'ms'); t = Date.now()
const id = [...symById.values()].find(s => fmt(s).startsWith('CrOn.t@1932')).id
console.log(effectOf('R2', { remove: [id] }), Date.now() - t, 'ms')
