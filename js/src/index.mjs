// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com): English text to Kokoro-style phonemes, in the browser.
// It produces espeak compatible phoneme codes, made from the ground up.
// It contains no espeak-ng code or data files.
import * as ortWeb from 'onnxruntime-web/wasm';
import { create, FILES, VARIANTS, DEFAULT_VARIANT, variantPath } from './load.mjs';

export { LeokaniG2P, FORMAT, VERSION, clean, chunks, pieces } from './g2p.mjs';
export { UserLexicon, UserLexiconError, USER_FORMAT } from './userlex.mjs';
export { FILES, VARIANTS, DEFAULT_VARIANT };

const MODELS = new URL('../models/', import.meta.url);

/**
 * Load the phonemizer. Options:
 *   variant    'micro' (default) or 'mini' (larger: better on names and rare words)
 *   modelBase  folder (URL) holding the four model files; default: the package's models/ folder (mini: models/mini/)
 *   files      the files' bytes instead: { lexicon, encoder, decoder, context }
 *   userLexicon  custom pronunciations: a {format, words} document or a {word: value} object
 *   threads    onnxruntime wasm threads (default 1)
 *   wasmPaths  where onnxruntime-web's .wasm lives, if your bundler doesn't copy it
 *   ort        an onnxruntime module to use instead of onnxruntime-web
 *   fetch      a fetch function (default: globalThis.fetch); sha256: false skips the file check
 */
export async function load(opts = {}) {
  const ort = opts.ort || ortWeb;
  if (ort.env?.wasm) {
    ort.env.wasm.numThreads = opts.threads ?? 1;
    if (opts.wasmPaths) ort.env.wasm.wasmPaths = opts.wasmPaths;
  }
  const doFetch = opts.fetch || globalThis.fetch.bind(globalThis);
  const base = opts.modelBase ? new URL(opts.modelBase, globalThis.location?.href ?? MODELS) : new URL(variantPath(opts.variant), MODELS);
  const dir = base.href.endsWith('/') ? base : new URL(base.href + '/');
  const read = async (name) => {
    const url = new URL(name, dir);
    url.search = dir.search;                       // keep a signed URL's token on every file
    const res = await doFetch(url.href);
    if (!res.ok) throw new Error(`${url.href}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  return create(read, ort, opts);
}

let shared = null;
/** The default phonemizer, loaded on first use. */
export function getDefault() { return (shared ||= load()); }

/** A line or paragraph -> Kokoro-style phonemes (loads the model on first use). */
export async function phonemize(text) { return (await getDefault()).phonemize(text); }
/** A line or paragraph -> phonemes, one string per clause chunk. */
export async function phonemizeChunks(text) { return (await getDefault()).phonemizeChunks(text); }
