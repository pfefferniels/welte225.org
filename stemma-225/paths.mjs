// Where the inputs live. By default everything is found relative to this file: stemma-225/ sits inside a
// checkout of welte225.org, whose root holds edition.jsonld and mpm/.
//   WELTE225_ROOT     another welte225.org checkout (default: the directory above stemma-225/)
//   WELTE225_EDITION  another edition.jsonld (default: $WELTE225_ROOT/edition.jsonld)
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** the stemma-225 directory */
export const STEMMA = resolve(fileURLToPath(new URL('./', import.meta.url)))
/** the welte225.org checkout */
export const ROOT = resolve(process.env.WELTE225_ROOT ?? fileURLToPath(new URL('../', import.meta.url)))
/** the edition every analysis reads */
export const EDITION = process.env.WELTE225_EDITION ? resolve(process.env.WELTE225_EDITION) : resolve(ROOT, 'edition.jsonld')
/** a path inside the welte225.org checkout, e.g. inRoot('mpm', 'score.msm') */
export const inRoot = (...parts) => resolve(ROOT, ...parts)
