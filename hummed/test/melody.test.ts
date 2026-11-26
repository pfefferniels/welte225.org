// The melody the voice sings: the piece's top voice, its ids kept in data/melody.json so that the
// worker need not load the transcription; and the piece struck again, which data/melody.json picks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { melodyLine, topVoiceIds } from '../src/worker/repeats.ts';
import { loadMaterials, loadReduction, loadScore, ROOT } from '../tools/node-support.ts';

const ids = JSON.parse(readFileSync(join(ROOT, 'data/melody.json'), 'utf8')) as string[];

describe('the melody', () => {
  it('is the transcription’s top voice (else: npm run melody)', () => {
    assert.deepEqual(ids, topVoiceIds(readFileSync(join(ROOT, '../mpm/transcription.mei'), 'utf8')));
  });

  it('is one note at a time, each in the score, by octaves where it is sung', () => {
    const { msm } = loadScore();
    const line = melodyLine(msm, new Set(ids), loadReduction().bars, -2);
    const notes = line.events.flatMap((e) => (e.kind === 'note' ? [e] : []));
    assert.ok(notes.length > 150, String(notes.length));
    notes.forEach((n, i) => {
      assert.ok(n.end > n.start);
      if (i > 0) assert.ok(n.start >= (notes[i - 1]?.end ?? 0));
      assert.ok(msm.includes(`xml:id="${n.ref}"`), n.ref);
      // below where the piano plays it: Träumerei's melody lies above C4
      assert.ok(n.pitch < 60, String(n.pitch));
    });
  });
});

describe('the piece struck again', () => {
  const count = (msm: string): number => (msm.match(/<note\b/g) ?? []).length;
  const piece = loadScore();

  it('strikes every voice again on every eighth, the melody alone on every sixteenth', () => {
    const eighths = loadMaterials().piece('piece on eighths');
    const sixteenths = loadMaterials().piece('piece on sixteenths');
    assert.ok(count(eighths.msm) > 2 * count(piece.msm));
    const again = [...sixteenths.msm.matchAll(/xml:id="([^"]+)-r\d+"/g)].map((m) =>
      m[1].replace(/-rend2$/, ''),
    );
    assert.ok(again.length > 300);
    assert.ok(again.every((id) => ids.includes(id)));
  });

  it('rolls a chord struck again between the chords rolled before and after it', () => {
    const { mpm } = loadMaterials().piece('piece on eighths');
    const morphs = [...mpm.matchAll(/<ornament date="(\d+)" name\.ref="(def_morph_\d+)"/g)];
    assert.ok(morphs.length > 100);
    // each has its definition, in the style the map's ornaments are found in
    for (const [, , name] of morphs) assert.ok(mpm.includes(`<ornamentDef name="${name}">`), name);
    // halfway between two rolls, halfway between their spreads: at 1080, between 720 and 1440
    const spread = (name: string): number =>
      Number(
        new RegExp(`<ornamentDef name="${name}">[\\s\\S]*?frameLength="([-\\d.]+)ticks"`).exec(mpm)?.[1],
      );
    assert.ok(
      Math.abs(
        spread('def_morph_1080') -
          (spread('def_global_ornament_720') + spread('def_global_ornament_1440')) / 2,
      ) < 1e-3,
    );
  });
});
