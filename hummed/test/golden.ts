// Fingerprints in test/golden.json, taken when the output they pin was shown to be right.
// After an intended change:  UPDATE_GOLDEN=1 npm test
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../tools/node-support.ts';

const GOLDEN = join(ROOT, 'test/golden.json');

export function assertGolden(key: string, actual: string): void {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
  if (process.env['UPDATE_GOLDEN']) {
    golden[key] = actual;
    writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
  }
  assert.equal(actual, golden[key]);
}
