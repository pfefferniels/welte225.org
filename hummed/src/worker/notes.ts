// The piece as espressivo performs an MPM, note by note of the score, for whoever draws a
// performance (described/): at the piece's own tempo, as no setting has it. Every note stands on its
// own date: the grace notes, which the MPM holds as ornaments of the notes they lead to, are not
// played out here as the piano plays them (piano.ts), since a note made up for one has no id to
// draw it by.
import { performMsmToData } from 'espressivo';
import { readPerformance, repair } from '../hummer/performance.ts';
import type { PerformedNote } from '../shared/protocol.ts';
import type { Score } from './reductions.ts';

/** The score's notes as performed, each by its xml:id, in the score's order. */
export function performedNotes(score: Score): (readonly [id: string, note: PerformedNote])[] {
  const { notes } = readPerformance(performMsmToData(score, { expandOrnaments: false }));
  // strongly exaggerated, a rolled chord's note can come out with impossible times, or softer than
  // nothing: put right as for the piano, which strikes a key at 1 at the least
  repair(notes);
  return notes.map((n) => [n.id, { on: n.onMs, off: n.endMs, velocity: Math.max(1, n.velocity) }]);
}
