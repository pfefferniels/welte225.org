// The harmonies (reduction/harmonies.mei), which the piano plays in the lowest third of its fader.
// espressivo converts the MEI to a score (MSM) as it converted the piece's, and leaves the grace
// notes out of it, reporting them beside it instead; they are put back here, a thirty-second each,
// the last one just before the note they lead to.
import { convertMeiToMsm, Msm, type Element } from 'espressivo';
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
  if (movement.graces.length === 0) return movement.msm;
  const msm = new Msm(movement.msm);
  for (const group of movement.graces) {
    if (group.principal === null)
      throw new HarmoniesError(`a grace note (${group.notes.at(0)?.id ?? '?'}) leads to no note`);
    const { part, date } = findNote(msm, group.principal);
    const slots = Math.max(...group.notes.map((note) => note.slot)) + 1;
    for (const note of group.notes)
      msm.addNote(part, {
        date: date - GRACE * (slots - note.slot),
        duration: GRACE,
        midiPitch: note.pitch,
        ...(note.id !== null && { id: note.id }),
      });
  }
  return msm.toXML();
}
