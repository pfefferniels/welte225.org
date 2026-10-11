import { createHash } from 'node:crypto'
import { readings } from './base.mjs'
import { blindCollation } from './blind.mjs'
const shuffle = (xs, seed) => { const a = [...xs]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
const seed = Number(process.env.SEED ?? 0)
const input = seed ? shuffle(readings, seed) : readings
const { clusters } = blindCollation({ input, linkage: 'single' })
const canon = clusters.map(c => c.rids.join(',')).sort().join('\n')
console.log(process.env.COPY_ORDER ?? 'default order', 'seed', seed, 'clusters', clusters.length, createHash('sha1').update(canon).digest('hex').slice(0, 12))
