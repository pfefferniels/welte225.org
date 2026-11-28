// Writes ../described/remarks.json: the reconstruction's hand-made segments carried over as remarks
// (src/described/segments.ts), which the described page shows until remarks made in MPM Desk are
// published in ../mpm/work.json. It is given the work file that still had segments, today's work
// file, and the directory of the places the segments were given when they were replayed (one JSON
// file each, with the segment's `id` and its `scope`):
//
//     npm run remarks -- <work file with segments> <today's work file> <directory of places>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { carryOver, type CarriedCall, type Placed, type Segment } from '../src/described/segments.ts';
import { ROOT } from './node-support.ts';

const [thenPath, todayPath, placesPath] = process.argv.slice(2);
if (!thenPath || !todayPath || !placesPath) {
  console.error(
    'usage: node tools/remarks.ts <work file with segments> <today’s work file> <directory of places>',
  );
  process.exit(2);
}

const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const then = json(thenPath) as { segments?: Segment[]; provenance: CarriedCall[] };
if (!then.segments?.length) throw new Error(`${thenPath} has no segments`);
const today = json(todayPath) as { provenance: CarriedCall[] };
const placed = readdirSync(placesPath)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => json(join(placesPath, name)) as Placed);

const remarks = carryOver({ segments: then.segments, provenance: then.provenance }, today, placed);
const out = join(ROOT, '../described/remarks.json');
// as a work file holds its steps, so that the page reads either with the same reader
writeFileSync(out, JSON.stringify({ provenance: remarks }, null, 1) + '\n');
const calls = new Set(remarks.flatMap((remark) => remark.options.calls));
console.log(`described/remarks.json: ${remarks.length} remarks, naming ${calls.size} of today’s calls`);
