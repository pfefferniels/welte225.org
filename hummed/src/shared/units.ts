/** Score time, 720 per quarter, as in the MSM and the MPM. */
export type Ticks = number;
/** Performed time in milliseconds. */
export type Ms = number;
/** Performed time in seconds. */
export type Seconds = number;
/** A MIDI pitch or velocity. */
export type Midi = number;

export const SAMPLE_RATE = 44100;
/** VocalTractLab's synthesis step: one tract state every 110 samples (2.5 ms). */
export const STATE_STEP = 110;
/** Silence before the music in every rendering, so the first breath has room. */
export const PAD_MS: Ms = 600;
