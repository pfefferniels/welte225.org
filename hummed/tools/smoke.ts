// The page in a real browser: serve the site (the repository root, as GitHub Pages does), open
// /hummed/, play, switch the exaggeration, seek, and fail on any page error. Needs Playwright with
// Chromium installed (not a dependency of this project):   npm run smoke
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { ROOT } from './node-support.ts';

/** The part of Playwright this uses. */
interface Page {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string, arg?: unknown, options?: { timeout: number }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
  textContent(selector: string): Promise<string | null>;
  click(selector: string): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
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
  await page.goto(`http://localhost:${port}/hummed/`);
  await page.waitForFunction("!document.getElementById('play').disabled", undefined, { timeout: 90000 });
  await report(`ready in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await page.click('#play');
  await page.waitForTimeout(6000);
  await report('played 6 s');
  const total = await text('total');
  await page.evaluate(
    "(() => { const e = document.getElementById('exag'); e.value = 0.5; e.dispatchEvent(new Event('input')); })()",
  );
  await page.waitForFunction(
    `document.getElementById('total').textContent !== ${JSON.stringify(total)}`,
    undefined,
    {
      timeout: 60000,
    },
  );
  await page.waitForTimeout(3000);
  await report('switched to ×0.5');
  await page.evaluate(
    "(() => { const r = document.getElementById('pos'); r.value = 90; r.dispatchEvent(new Event('input')); })()",
  );
  await page.waitForTimeout(5000);
  await report('seeked to 1:30');
} finally {
  await browser.close();
  server.close();
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('no page errors');
