// The page in a real browser: serve the site (the repository root, as GitHub Pages does), open its
// front page, play, move the elaboration (the voice rendered anew), seek, open the details under it
// (one set apart rendered as its own setting, what is heard switched, the fader taking them back),
// open and close the info card, show the reconstruction's instructions and the piano in the spectrogram, choose each piano in
// the settings (an instrument over MIDI played by a stand-in that keeps what it is sent), and fail on
// any page error. Needs Playwright with Chromium installed (not a
// dependency of this project):   npm run smoke
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { ROOT } from './node-support.ts';

/** The part of Playwright this uses. */
interface Page {
  addInitScript(script: string): Promise<void>;
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string, arg?: unknown, options?: { timeout: number }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
  textContent(selector: string): Promise<string | null>;
  click(selector: string): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  readonly keyboard: { press(key: string): Promise<void> };
  on(event: 'pageerror', listener: (error: Error) => void): void;
  on(event: 'console', listener: (message: { type(): string; text(): string }) => void): void;
}
interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}
interface Playwright {
  chromium: { launch(options: { args: string[] }): Promise<Browser> };
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.mei': 'application/xml',
  '.msm': 'application/xml',
  '.mpm': 'application/xml',
  '.mp3': 'audio/mpeg',
  '.map': 'application/json',
};
const site = join(ROOT, '..');

/** A MIDI instrument for the page to find: it keeps every message, with when it was sent and for when. */
const STAND_IN_MIDI = `
  window.sent = [];
  const port = {
    id: 'stand-in', name: 'Stand-in instrument', type: 'output', state: 'connected',
    send(data, at) { window.sent.push({ data: [...data], at: at ?? 0, sentAt: performance.now() }); },
  };
  const access = { outputs: new Map([[port.id, port]]), inputs: new Map(), onstatechange: null, sysexEnabled: false };
  Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: async () => access });
`;
interface Sent {
  readonly data: readonly number[];
  readonly at: number;
  readonly sentAt: number;
}
const server = createServer((request, response) => {
  let path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname));
  if (path.endsWith('/')) path += 'index.html';
  const file = join(site, path);
  try {
    if (!file.startsWith(site) || !statSync(file).isFile()) throw new Error('not found');
  } catch {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const { port } = server.address() as AddressInfo;

const { chromium } = createRequire(import.meta.url)('playwright') as Playwright;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors: string[] = [];
try {
  const page = await browser.newPage();
  await page.addInitScript(STAND_IN_MIDI);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // espressivo notes that the MSM's parts have no MPM parts of their own: this MPM's are global
    if (m.type() === 'error' && !m.text().startsWith('No MPM part found')) errors.push(m.text());
  });
  const text = async (id: string): Promise<string> => (await page.textContent(`#${id}`)) ?? '';
  const report = async (what: string): Promise<void> => {
    console.log(
      `${what.padEnd(24)} ${await text('now')} / ${await text('total')}  ${await text('bar')}  ${await text('status')}`,
    );
  };
  const started = Date.now();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction("!document.getElementById('play').disabled", undefined, { timeout: 90000 });
  await report(`ready in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const chosen = (): Promise<string> =>
    page.evaluate("document.querySelector('input[name=piano]:checked').value");
  const recorded = await page.evaluate<boolean>("!document.getElementById('choice-recorded').hidden");
  console.log(`piano: ${await chosen()}`);
  if ((await chosen()) !== (recorded ? 'recorded' : 'sampled'))
    errors.push('the Pianoteq recordings are not the piano where there are some');
  await page.click('#play');
  await page.waitForTimeout(6000);
  await report('played 6 s');
  // a barer setting is more exaggerated, slower in places: the piece's length changes when it takes over
  const total = await text('total');
  await page.evaluate(
    "(() => { const e = document.getElementById('elaboration'); e.value = 30; e.dispatchEvent(new Event('input')); })()",
  );
  await page.waitForFunction(
    `document.getElementById('total').textContent !== ${JSON.stringify(total)}`,
    undefined,
    {
      timeout: 60000,
    },
  );
  await page.waitForTimeout(3000);
  await report('elaboration 0.3 took over');
  await page.evaluate(
    "(() => { const r = document.getElementById('pos'); r.value = 90; r.dispatchEvent(new Event('input')); })()",
  );
  await page.waitForTimeout(5000);
  await report('seeked to 1:30');
  for (const [value, expected] of [
    [20, 'harmonies'],
    [0, 'humming'],
    [67, 'piece'],
  ] as const) {
    await page.evaluate(
      `(() => { const e = document.getElementById('elaboration'); e.value = ${value}; e.dispatchEvent(new Event('input')); })()`,
    );
    await page.waitForTimeout(1500);
    const shown = await text('o-elaboration');
    if (shown !== expected) errors.push(`elaboration ${value} shows ${shown}, not ${expected}`);
  }
  console.log('elaboration: harmonies, humming alone, the piece');
  // the voice rendered anew for the last elaboration takes over, and playing goes on
  await page.waitForFunction("document.getElementById('status').hidden", undefined, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await report('voice for 0.65 took over');

  // the details: they follow the fader; one set apart is rendered as its own setting, and the fader
  // takes it back
  const attr = (id: string, name: string): Promise<string | null> =>
    page.evaluate(`document.getElementById(${JSON.stringify(id)}).getAttribute(${JSON.stringify(name)})`);
  const value = (id: string): Promise<string> =>
    page.evaluate(`document.getElementById(${JSON.stringify(id)}).value`);
  const apart = (): Promise<boolean> =>
    page.evaluate("document.getElementById('details-toggle').classList.contains('apart')");
  await page.click('#details-toggle');
  const open = await page.evaluate<boolean>("!document.getElementById('details').hidden");
  const following = (await value('d-flighty')) === '67' && (await value('d-exaggerated')) === '67';
  if (!open || !following || (await apart())) errors.push('the details do not open where the fader is');
  const totalBefore = await text('total');
  await page.evaluate(
    "(() => { const e = document.getElementById('d-exaggerated'); e.value = 0; e.dispatchEvent(new Event('input')); })()",
  );
  await page.waitForFunction(
    `document.getElementById('total').textContent !== ${JSON.stringify(totalBefore)}`,
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(2000);
  await report('the exaggeration set apart took over');
  await page.click('#d-voice');
  await page.click('#d-harmonies');
  const heard = [
    await attr('d-voice', 'aria-pressed'),
    await attr('d-harmonies', 'aria-pressed'),
    await attr('d-piece', 'aria-pressed'),
  ];
  console.log(
    `details: open ${open}, following ${following}, set apart ${await apart()}, heard ${heard.join(' ')}`,
  );
  if (heard.join() !== 'false,true,false' || !(await apart()))
    errors.push('the details do not set what is heard apart');
  await page.evaluate(
    "(() => { const e = document.getElementById('elaboration'); e.value = 65; e.dispatchEvent(new Event('input')); })()",
  );
  const back =
    !(await apart()) &&
    (await value('d-exaggerated')) === '65' &&
    (await attr('d-piece', 'aria-pressed')) === 'true';
  console.log(`details: the fader takes them back ${back}`);
  if (!back) errors.push('the fader does not take the details back');
  await page.waitForFunction("document.getElementById('status').hidden", undefined, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await report('voice for 0.65 took over again');
  const cardOpen = (): Promise<boolean> =>
    page.evaluate("document.getElementById('info').matches(':popover-open')");
  await page.click('[popovertarget=info]');
  const opened = await cardOpen();
  await page.keyboard.press('Escape');
  const closed = !(await cardOpen());
  console.log(`info card: opens ${opened}, closes on Escape ${closed}`);
  if (!opened || !closed) errors.push('the info card does not open and close');

  // the settings: the reconstruction's instructions where the music is, each a link into MPM Desk
  await page.click('.settings-button');
  await page.click('#show-instructions');
  await page.waitForTimeout(500);
  const links = await page.evaluate<string[]>(
    "[...document.querySelectorAll('#instructions a')].map((a) => a.textContent + ' <' + a.href + '>')",
  );
  console.log(`instructions: ${links.length} hold, ${links[0] ?? 'none'}`);
  if (links.length === 0) errors.push('no instructions are listed where the music is');
  if (links.some((link) => !/<https:\/\/mpmdesk\.welte225\.org\/#[0-9a-f-]{36}>$/.test(link)))
    errors.push('an instruction does not open in MPM Desk');
  await page.click('#show-instructions');
  if (!(await page.evaluate<boolean>("document.getElementById('instructions').hidden")))
    errors.push('the instructions do not go away');
  // the piano under the humming in the spectrogram: of the recording, then of the sampled grand
  const pianoDrawn = async (what: string): Promise<void> => {
    await page.waitForFunction("Number(document.getElementById('spec').dataset.piano) > 500", undefined, {
      timeout: 30000,
    });
    console.log(
      `spectrogram: ${what}, ${await page.evaluate<string>("document.getElementById('spec').dataset.piano")} columns`,
    );
  };
  await pianoDrawn('the piano as it plays');

  // the sampled grand, then an instrument over MIDI
  await page.click('input[name=piano][value=sampled]');
  await page.waitForTimeout(2500);
  await report('sampled grand');
  await pianoDrawn('the sampled grand');
  if ((await chosen()) !== 'sampled') errors.push('the sampled grand was not chosen');
  await page.click('input[name=piano][value=midi]');
  await page.evaluate(
    "(() => { const d = document.getElementById('midi-delay'); d.value = '500'; d.dispatchEvent(new Event('change')); })()",
  );
  await page.waitForTimeout(4000);
  await report(`MIDI, delay 500 ms`);
  const sent = (): Promise<Sent[]> => page.evaluate('window.sent');
  const ons = (list: readonly Sent[]): Sent[] => list.filter((m) => (m.data[0] & 0xf0) === 0x90);
  const early = ons(await sent()).map((m) => m.at - m.sentAt);
  const pedals = (await sent()).filter((m) => m.data[0] === 0xb0 && [64, 67].includes(m.data[1])).length;
  console.log(
    `MIDI: ${early.length} keys, ${pedals} pedal moves, sent ${Math.min(...early).toFixed(0)}–${Math.max(...early).toFixed(0)} ms before they are due`,
  );
  // the instrument's delay is taken from the time each key is due: none may be sent after it
  if (early.length === 0) errors.push('no keys were sent to the instrument');
  else if (Math.min(...early) < 0) errors.push('keys were sent to the instrument late');
  const before = ons(await sent()).length;
  await page.evaluate(
    "(() => { const e = document.getElementById('elaboration'); e.value = 20; e.dispatchEvent(new Event('input')); })()",
  );
  await page.waitForTimeout(3000);
  // where the harmonies hold still (over the ritardando into bar 17 no key is struck for five
  // seconds), their next key is waited for
  await page
    .waitForFunction(`window.sent.filter((m) => (m.data[0] & 0xf0) === 0x90).length > ${before}`, undefined, {
      timeout: 9000,
    })
    .catch(() => undefined);
  const harmonies = ons(await sent()).slice(before).length;
  console.log(`MIDI: the harmonies, ${harmonies} keys`);
  if (harmonies === 0) errors.push('the instrument did not go on with the harmonies');
  const sentBefore = (await sent()).length;
  await page.click('#play');
  await page.waitForTimeout(300);
  const silenced = (await sent()).slice(sentBefore).some((m) => m.data[0] === 0xb0 && m.data[1] === 123);
  console.log(`MIDI: silenced on pause ${silenced}`);
  if (!silenced) errors.push('the instrument was not silenced on pause');
  await page.click('.settings-button');
  await page.click(`input[name=piano][value=${recorded ? 'recorded' : 'sampled'}]`);
  await page.keyboard.press('Escape');
  console.log(`back to ${await chosen()}`);
} finally {
  await browser.close();
  server.close();
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('no page errors');
