import { blindCollation } from './blind.mjs'
import { compare } from './compare.mjs'
for (const linkage of ['single', 'average', 'complete']) {
  const { clusters } = blindCollation({ linkage })
  const r = compare(clusters)
  const t = r.tallyKind
  console.log(linkage.padEnd(9), 'clusters', clusters.length, 'exact', r.exact, (100 * r.exact / r.n).toFixed(1) + '%', 'notes', JSON.stringify(t.note), 'expr', JSON.stringify(t['red/Lic expr']), 'pairs onlyEd', r.pairs.onlyEdition.length, 'onlyBl', r.pairs.onlyBlind.length)
}
