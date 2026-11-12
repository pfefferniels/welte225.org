// Bundle the page (app.js) and the worker (worker.js), and the take's (take.js, take-worker.js),
// minified with source maps. The bundles are
// committed: GitHub Pages serves the repository as it is. CI checks that they match the sources.
import { build, type BuildOptions } from 'esbuild';

const banner = (what: string): string =>
  `/*! Träumerei, hummed: ${what}. GPL-3.0-only. Source: https://github.com/pfefferniels/welte225.org/tree/main/hummed */`;

const common: BuildOptions = {
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  // the maps point at the TypeScript, which the site serves too, rather than carrying it
  sourcemap: 'linked',
  sourcesContent: false,
  legalComments: 'none',
  logLevel: 'info',
};

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/page/main.ts'],
    outfile: 'app.js',
    banner: { js: banner('the page') },
  }),
  build({
    ...common,
    entryPoints: ['src/worker/worker.ts'],
    outfile: 'worker.js',
    banner: { js: banner('the voice, with espressivo (GPL-3.0-only, Niels Pfeffer)') },
  }),
  // the take's page (../take/) and its worker
  build({
    ...common,
    entryPoints: ['src/take/page.ts'],
    outfile: 'take.js',
    banner: { js: banner("a take's page") },
  }),
  build({
    ...common,
    entryPoints: ['src/take/worker.ts'],
    outfile: 'take-worker.js',
    banner: { js: banner('a take taken apart, with espressivo (GPL-3.0-only, Niels Pfeffer)') },
  }),
]);
