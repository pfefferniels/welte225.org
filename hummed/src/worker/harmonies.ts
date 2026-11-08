// The harmonies (reduction/harmonies.mei), which the piano plays in the lower half of its fader.
// espressivo converts the MEI to a score (MSM) as it converted the piece's, but leaves out the grace
// notes; they are put back here, each a thirty-second note just before the note it leads to.
import { DOMParser } from '@xmldom/xmldom';
import { convertMeiToMsm, Msm, type Element } from 'espressivo';
import { readGraces, type XmlElement } from '../reduction/mei.ts';
import type { Ticks } from '../shared/units.ts';

const GRACE: Ticks = 90;
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

export class HarmoniesError extends Error {
  override name = 'HarmoniesError';
}

/** The note with an `xml:id`, and the part it is in. */
function findNote(msm: Msm, id: string): { readonly part: Element; readonly date: Ticks } {
  for (const part of msm.getPartsArray()) {
    const score = part.getFirstChildElement('dated')?.getFirstChildElement('score');
    if (!score) continue;
    for (const note of score.getChildElements('note'))
      if (note.getAttributeValue('id', XML_NAMESPACE) === id)
        return { part, date: Number(note.getAttributeValue('date')) };
  }
  throw new HarmoniesError(`a grace note leads to ${id}, which the score does not have`);
}

/** The harmonies as a score, grace notes and all, to perform as the piece is performed. */
export function harmoniesScore(mei: string): string {
  const movement = convertMeiToMsm(mei).at(0);
  if (!movement) throw new HarmoniesError('the harmonies have no movement');
  const doc = new DOMParser().parseFromString(mei, 'application/xml');
  const graces = readGraces(doc.documentElement as unknown as XmlElement);
  if (graces.length === 0) return movement.msm;
  const msm = new Msm(movement.msm);
  for (const grace of graces) {
    const { part, date } = findNote(msm, grace.before);
    msm.addNote(part, { date: date - GRACE, duration: GRACE, midiPitch: grace.pitch, id: grace.id });
  }
  return msm.toXML();
}
