import { pairWindows, blindCollation } from './blind.mjs'
import { compare } from './compare.mjs'
const windows = pairWindows(8)
const line = (name, o) => { const { clusters } = blindCollation({ windows, linkage: 'single', ...o }); const r = compare(clusters); return `${name.padEnd(14)} clusters ${clusters.length} exact ${r.exact} (${(100 * r.exact / r.n).toFixed(1)}%) splits ${[...r.status.values()].filter(s => s.startsWith('split')).length} merges ${[...r.status.values()].filter(s => s.includes('merge')).length}` }
for (const T of [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 10]) console.log(line('fixed ' + T, { fixed: T }))
for (const s of [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]) console.log(line('scatter x' + s, { scale: s }))
