// The Pianoteq recordings on the page: a level's two parts are fetched and decoded when it is asked
// for, and the page keeps no more than the level playing and the one it is changing to (a decoded
// part of three minutes is some 30 MB).
import { parseManifest, type RecordedLevel, type RecordingsManifest } from '../shared/recordings.ts';

const BASE = 'piano/pianoteq/';

export interface LevelBuffers {
  readonly piece: AudioBuffer;
  readonly harmonies: AudioBuffer;
}

const keyOf = (level: number): number => Math.round(level * 100);

export class Recordings {
  readonly manifest: RecordingsManifest;
  readonly #context: AudioContext;
  readonly #loaded = new Map<number, LevelBuffers>();
  readonly #loading = new Set<number>();
  readonly #failed = new Set<number>();
  #playing: number | null = null;

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

  /** The level's entry in the manifest, if it was rendered. */
  level(level: number): RecordedLevel | null {
    return this.manifest.levels.find((l) => keyOf(l.level) === keyOf(level)) ?? null;
  }

  failed(level: number): boolean {
    return this.#failed.has(keyOf(level));
  }

  /** The level's sound, null while it loads (the first ask starts it) or where it failed. */
  buffers(level: number): LevelBuffers | null {
    const key = keyOf(level);
    const loaded = this.#loaded.get(key);
    if (loaded) return loaded;
    const entry = this.level(level);
    if (!entry || this.#failed.has(key) || this.#loading.has(key)) return null;
    for (const k of this.#loaded.keys()) if (k !== this.#playing) this.#loaded.delete(k);
    this.#loading.add(key);
    this.#fetch(entry).then(
      (buffers) => {
        this.#loading.delete(key);
        this.#loaded.set(key, buffers);
      },
      (error: unknown) => {
        this.#loading.delete(key);
        this.#failed.add(key);
        console.warn(`The Pianoteq recording of ×${level} did not load; the sampled grand plays it.`, error);
      },
    );
    return null;
  }

  /** The level now playing, kept while others come and go. */
  playing(level: number): void {
    this.#playing = keyOf(level);
  }

  async #fetch(entry: RecordedLevel): Promise<LevelBuffers> {
    const get = async (file: string): Promise<AudioBuffer> => {
      const response = await fetch(BASE + file);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return this.#context.decodeAudioData(await response.arrayBuffer());
    };
    const [piece, harmonies] = await Promise.all([get(entry.piece.file), get(entry.harmonies.file)]);
    return { piece, harmonies };
  }
}
