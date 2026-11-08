import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { mpmTitle } from '../src/shared/mpm.ts';
import { ROOT } from '../tools/node-support.ts';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('mpmTitle', () => {
  it('reads the comment in the metadata', () => {
    const doc = parse(
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><metadata><author>A</author><comment>  A\n title </comment></metadata></mpm>',
    );
    assert.equal(mpmTitle(doc), 'A title');
  });
  it('is null without one', () => {
    assert.equal(mpmTitle(parse('<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><metadata/></mpm>')), null);
  });
  it('finds the published reconstruction’s, which the front page shows', () => {
    const doc = parse(readFileSync(join(ROOT, '../mpm/performance.mpm'), 'utf8'));
    const title = mpmTitle(doc);
    assert.ok(title?.includes('Grünfeld'));
    // the page's own text (for readers without scripts, and for link previews) is the same
    const page = readFileSync(join(ROOT, '../index.html'), 'utf8');
    const text = (pattern: RegExp): string | undefined =>
      pattern.exec(page)?.[1]?.replace(/\s+/g, ' ').trim();
    assert.equal(text(/<title>([^<]*)<\/title>/), title);
    assert.equal(text(/<h1 id="info-title">([^<]*)<\/h1>/), title);
  });
});
