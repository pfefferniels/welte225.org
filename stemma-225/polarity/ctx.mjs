import { textOf, latchRedundancies, fmt, place, carrierCopies, insertedIn, keyOf } from './common.mjs'
const [key, from, to] = [process.argv[2], +process.argv[3], +process.argv[4]]
for (const sg of ['r1', 'R1.1', 'R2', 'r3', 'R4', 'L1']) {
  const t = textOf(sg), red = latchRedundancies(t)
  console.log(sg.padEnd(5), t.filter(s => keyOf(s) === key && place(s).from > from && place(s).from < to).map(s => fmt(s) + (red.has(s.id) ? '(RED)' : '') + '<' + insertedIn.get(s.id) + '>').join(' '))
}
