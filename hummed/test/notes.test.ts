// The piece as espressivo performs the MPM, note by note, for whoever draws it (worker/notes.ts):
// every note of the score, each struck before it is let go, and at other times once a tempo is
// brought out.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emphasised } from '../src/worker/emphasis.ts';
import { performedNotes } from '../src/worker/notes.ts';
import { loadScore } from '../tools/node-support.ts';

describe('the piece performed note by note', () => {
  const score = loadScore();
  const written = [...score.msm.matchAll(/<note\b[^>]*?\sxml:id="([^"]+)"/g)].map((m) => m[1]);
  const sound = (notes: ReturnType<typeof performedNotes>): void => {
    for (const [id, { on, off, velocity }] of notes) {
      assert.ok(Number.isFinite(on) && Number.isFinite(off) && Number.isFinite(velocity), id);
      assert.ok(on >= 0 && on < off, `${id}: ${on} to ${off}`);
      assert.ok(velocity > 0, id);
    }
  };
  const plain = performedNotes(score);

  it('has every note of the score, by its id, struck before it is let go', () => {
    assert.equal(written.length, 476);
    assert.deepEqual(new Set(plain.map(([id]) => id)), new Set(written));
    assert.equal(plain.length, written.length);
    sound(plain);
    // at the piece's own tempo: 2:41, as the MPM has it, where the top of the fader takes 2:43
    const end = Math.max(...plain.map(([, note]) => note.off));
    assert.ok(end > 160_000 && end < 163_000, `${end}`);
  });

  it('comes at other times with a tempo brought out, the same notes', () => {
    const mpm = emphasised(score.mpm, { ids: ['tempo_2160', 'tempo_2880'], factor: 1.8, attenuation: 0.35 });
    const brought = new Map(performedNotes({ msm: score.msm, mpm }));
    assert.equal(brought.size, plain.length);
    sound([...brought]);
    const moved = plain.filter(([id, note]) => Math.abs((brought.get(id)?.on ?? NaN) - note.on) > 50);
    assert.ok(moved.length > plain.length / 2, `${moved.length} notes moved`);
    // an exaggerated tempo slows down by more than it speeds up: the piece is longer
    const end = (notes: Iterable<readonly [string, { readonly off: number }]>): number =>
      Math.max(...[...notes].map(([, note]) => note.off));
    assert.ok(end(brought) > end(plain) + 5000);
  });

  it('keeps every note possible where much is brought out as far as it goes', () => {
    const ids = [
      'ornament_720',
      'ornament_4320',
      'tempo_2160',
      'dynamics_720',
      'rubato_2880',
      'articulation_1440',
    ];
    const notes = performedNotes({
      msm: score.msm,
      mpm: emphasised(score.mpm, { ids, factor: 1.9, attenuation: 0.05 }),
    });
    assert.equal(notes.length, written.length);
    sound(notes);
  });
});
