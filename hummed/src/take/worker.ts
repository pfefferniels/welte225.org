// The take's worker: VocalTractLab, into which a take's sound is read back (inversion.ts), and the
// reading of its movements against the roll. It keeps the last take taken apart, so that its
// movements can be read anew without singing it again.
import { VtlEngine } from '../vtl/engine.ts';
import type { CreateVtl } from '../vtl/module.ts';
import { readBody, type Body } from './body.ts';
import { invert, type Inversion } from './inversion.ts';
import { movementsOf } from './movements.ts';
import type { TakeRequest, TakeResponse } from './protocol.ts';
import { read, type ReadingOptions, type TakeTiming } from './reading.ts';
import type { Roll } from './roll.ts';

const PASSES = 4;

const get = async (url: string): Promise<Response> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
};

/** VocalTractLab with the speaker, and the body's shapes read from it. */
async function load(): Promise<{ engine: VtlEngine; body: Body }> {
  const [script, speaker] = await Promise.all([
    get('vtl.js').then((r) => r.blob()),
    get('data/hummer.speaker.xml').then((r) => r.text()),
  ]);
  const url = URL.createObjectURL(script);
  try {
    importScripts(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const createVtl = (self as unknown as { createVTL: CreateVtl }).createVTL;
  const module = await createVtl({ print: () => undefined, printErr: () => undefined });
  return { engine: new VtlEngine(module, speaker), body: readBody(speaker) };
}

let loaded: ReturnType<typeof load> | null = null;
let last: { inversion: Inversion; roll: Roll; timing: TakeTiming } | null = null;

const post = (message: TakeResponse, transfer: Transferable[] = []): void => {
  (self as unknown as { postMessage(m: TakeResponse, t: Transferable[]): void }).postMessage(
    message,
    transfer,
  );
};

const readingOf = (request: TakeRequest): ReadingOptions => ({
  ...(request.tapLead === undefined ? {} : { tapLead: request.tapLead }),
  ...(request.between === undefined ? {} : { between: request.between }),
});

async function handle(request: TakeRequest): Promise<void> {
  if (request.type === 'reread') {
    if (!last) throw new Error('no take to read anew');
    const { inversion, roll, timing } = last;
    const movements = movementsOf(
      inversion.tracks,
      inversion.voiced,
      inversion.target.level,
      request.movements,
    );
    post({ type: 'reread', movements, reading: read(roll, timing, movements, readingOf(request)) });
    return;
  }
  const { engine, body } = await (loaded ??= load());
  const inversion = invert(engine, body, request.samples, {
    passes: PASSES,
    equalize: request.equalize,
    onPass: (pass, misfit) => {
      post({ type: 'round', pass, passes: PASSES, misfit });
    },
  });
  last = { inversion, roll: request.roll, timing: request.timing };
  const movements = movementsOf(
    inversion.tracks,
    inversion.voiced,
    inversion.target.level,
    request.movements,
  );
  const { tracks } = inversion;
  post({
    type: 'done',
    result: {
      frames: tracks.count,
      f0: tracks.f0,
      pressure: tracks.pressure,
      adduction: tracks.adduction,
      opening: tracks.opening,
      voiced: inversion.voiced,
      level: inversion.target.level,
      // a copy of its own, so that the worker keeps what it reads anew from
      copy: inversion.copy.slice(),
      misfits: inversion.misfits,
      movements,
      reading: read(request.roll, request.timing, movements, readingOf(request)),
    },
  });
}

self.addEventListener('message', (event: MessageEvent<TakeRequest>) => {
  handle(event.data).catch((error: unknown) => {
    post({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  });
});
