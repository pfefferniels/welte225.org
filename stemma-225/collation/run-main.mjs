import { writeFileSync } from 'node:fs'
import { readings, edSymbols, COPIES } from './base.mjs'
import { blindCollation } from './blind.mjs'
import { compare } from './compare.mjs'
for (const linkage of ['single', 'complete']) for (const onsetOnly of [false, true]) {
  const { clusters } = blindCollation({ linkage, onsetOnly })
  const r = compare(clusters)
  console.log(`\n=== scatter windows, ${linkage} linkage, ${onsetOnly ? 'onset only' : 'both ends'}: clusters ${clusters.length}, edition symbols ${r.n}, exact ${r.exact} (${(100*r.exact/r.n).toFixed(1)}%)`)
  console.table(r.tallyKind)
  console.log('pairs edition', r.pairs.edition, 'blind', r.pairs.blind, 'common', r.pairs.common, 'onlyEd', r.pairs.onlyEdition.length, 'onlyBlind', r.pairs.onlyBlind.length)
}
