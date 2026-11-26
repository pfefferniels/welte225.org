// The Pianoteq recordings on the page: a setting's parts are fetched ahead with its voice, and each
// part is decoded when it is wanted: the part heard, for the settings around the fader (library.ts),
// and both for a setting that sounds, so that the details can switch to the other. A decoded part of
// three minutes is some 30 MB; what is kept decoded is what the library keeps.
import { parseManifest, type RecordedSetting, type RecordingsManifest } from '../shared/recordings.ts';
import type { PianoPartName } from './rendering.ts';

const BASE = 'piano/pianoteq/';

export interface SettingBuffers {
  readonly piece: AudioBuffer;
  readonly harmonies: AudioBuffer;
}

const keyOf = (elaboration: number): number => Math.round(elaboration * 100);
const PARTS: readonly PianoPartName[] = ['piece', 'harmonies'];

interface Part {
  /** The MP3, once fetched; kept, since decoding takes it. */
  bytes: ArrayBuffer | null;
  fetching: Promise<ArrayBuffer> | null;
  buffer: AudioBuffer | null;
  decoding: boolean;
}

export class Recordings {
  readonly manifest: RecordingsManifest;
  readonly #context: AudioContext;
  readonly #parts = new Map<string, Part>();
  readonly #failed = new Set<number>();
  /** Told when a part has been decoded. */
  changed: () => void = () => undefined;

  constructor(context: AudioContext, manifest: RecordingsManifest) {
    this.#context = context;
    this.manifest = manifest;
  }

  /** The recordings listed in piano/pianoteq/manifest.json; null where there are none. */
  static async load(context: AudioContext): Promise<Recordings | null> {
    const response = await fetch(`${BASE}manifest.json`);
    if (!response.ok) return null;
    const manifest = parseManifest(await response.json());
    return manifest && new Recordings(context, manifest);
  }

  /** The setting's entry in the manifest, if it was rendered. */
  setting(elaboration: number): RecordedSetting | null {
    return this.manifest.settings.find((s) => keyOf(s.elaboration) === keyOf(elaboration)) ?? null;
  }

  failed(elaboration: number): boolean {
    return this.#failed.has(keyOf(elaboration));
  }

  #part(elaboration: number, part: PianoPartName): Part {
    const key = `${keyOf(elaboration)}:${part}`;
    let entry = this.#parts.get(key);
    if (!entry) {
      entry = { bytes: null, fetching: null, buffer: null, decoding: false };
      this.#parts.set(key, entry);
    }
    return entry;
  }

  /** Fetch a setting's files ahead, without decoding them. */
  fetchAhead(elaboration: number): void {
    const entry = this.setting(elaboration);
    if (!entry || this.failed(elaboration)) return;
    for (const part of PARTS) void this.#bytes(elaboration, part, entry).catch(() => undefined);
  }

  #bytes(elaboration: number, part: PianoPartName, entry: RecordedSetting): Promise<ArrayBuffer> {
    const held = this.#part(elaboration, part);
    if (held.bytes) return Promise.resolve(held.bytes);
    held.fetching ??= (async () => {
      const file = entry[part].file;
      const response = await fetch(BASE + file);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return response.arrayBuffer();
    })().then(
      (bytes) => {
        held.bytes = bytes;
        held.fetching = null;
        return bytes;
      },
      (error: unknown) => {
        held.fetching = null;
        this.#fail(elaboration, error);
        throw error;
      },
    );
    return held.fetching;
  }

  #fail(elaboration: number, error: unknown): void {
    if (this.#failed.has(keyOf(elaboration))) return;
    this.#failed.add(keyOf(elaboration));
    console.warn(`The Pianoteq recording of ${elaboration} did not load; the sampled grand plays it.`, error);
    this.changed();
  }

  /** A part's sound, null while it loads (the first ask starts it) or where it failed. */
  part(elaboration: number, part: PianoPartName): AudioBuffer | null {
    const entry = this.setting(elaboration);
    if (!entry || this.failed(elaboration)) return null;
    const held = this.#part(elaboration, part);
    if (held.buffer) return held.buffer;
    if (held.decoding) return null;
    held.decoding = true;
    this.#bytes(elaboration, part, entry)
      .then((bytes) => this.#context.decodeAudioData(bytes.slice(0)))
      .then(
        (buffer) => {
          held.decoding = false;
          held.buffer = buffer;
          this.changed();
        },
        (error: unknown) => {
          held.decoding = false;
          this.#fail(elaboration, error);
        },
      );
    return null;
  }

  /** Both parts, where both are decoded; asking starts what is not. */
  buffers(elaboration: number): SettingBuffers | null {
    const piece = this.part(elaboration, 'piece');
    const harmonies = this.part(elaboration, 'harmonies');
    return piece && harmonies ? { piece, harmonies } : null;
  }

  /** What a setting's decoded parts take, in bytes. */
  bytes(elaboration: number): number {
    let bytes = 0;
    for (const part of PARTS) {
      const buffer = this.#parts.get(`${keyOf(elaboration)}:${part}`)?.buffer;
      if (buffer) bytes += buffer.length * buffer.numberOfChannels * 4;
    }
    return bytes;
  }

  /** Let go of the decoded parts of every setting but these (their files are kept). */
  keep(elaborations: Iterable<number>): void {
    const keys = new Set([...elaborations].map(keyOf));
    for (const [key, held] of this.#parts) if (!keys.has(Number(key.split(':')[0]))) held.buffer = null;
  }
}
