import { ed, sig, V, LR, symById, fmt, textOf, carrierCopies } from './common.mjs'
const pairs = [['St1','R2'],['Wi1','R1.1'],['St2','R4'],['Ch1','L2'],['Ne1','L1']]
for (const [c, v] of pairs) {
  const carried = new Set([...symById.values()].filter(s => carrierCopies(s).includes(c)).map(s => s.id))
  const text = new Set(textOf(v).map(s => s.id))
  const a = [...text].filter(id => !carried.has(id)), b = [...carried].filter(id => !text.has(id))
  console.log(c, v, 'carried', carried.size, 'text', text.size, 'inText-notCarried', a.length, a.slice(0,5).map(id => fmt(symById.get(id))), 'carried-notInText', b.length, b.slice(0,5).map(id => fmt(symById.get(id))))
}
