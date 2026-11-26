// Writes data/melody.json: the ids of the piece's top voice, read from the transcription
// (../mpm/transcription.mei), which the worker would otherwise have to load whole to sing the melody.
// Run it again when the transcription changes (test/melody.test.ts says when).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { topVoiceIds } from '../src/worker/repeats.ts';
import { ROOT } from './node-support.ts';

const ids = topVoiceIds(readFileSync(join(ROOT, '../mpm/transcription.mei'), 'utf8'));
writeFileSync(join(ROOT, 'data/melody.json'), JSON.stringify(ids) + '\n');
console.log(`data/melody.json: ${ids.length} notes of the top voice`);
