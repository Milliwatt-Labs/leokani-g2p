// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com): English text to Kokoro-style phonemes, in Node.
// It produces espeak compatible phoneme codes, made from the ground up.
// It contains no espeak-ng code or data files.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { create, FILES, VARIANTS, DEFAULT_VARIANT, variantPath } from './load.mjs';

export { LeokaniG2P, FORMAT, VERSION, clean, chunks, pieces } from './g2p.mjs';
export { UserLexicon, UserLexiconError, USER_FORMAT } from './userlex.mjs';
export { FILES, VARIANTS, DEFAULT_VARIANT };

const MODELS = new URL('../models/', import.meta.url);

async function runtime(backend) {
  if (backend === 'onnxruntime-node' || backend === 'auto') {
    try {
      return { ort: await import('onnxruntime-node'), name: 'onnxruntime-node' };
    } catch (e) {
      if (backend === 'onnxruntime-node') throw e;
    }
  }
  return { ort: await import('onnxruntime-web/wasm'), name: 'onnxruntime-web' };
}

/**
 * Load the phonemizer. Options:
 *   variant    'micro' (default) or 'mini' (larger: better on names and rare words), from the package's models/
 *   modelDir   folder (path or file: URL) holding the four model files instead
 *   files      the files' bytes instead: { lexicon, encoder, decoder, context }
 *   userLexicon  custom pronunciations: a {format, words} document, a {word: value} object, or a .json/.tsv path
 *   backend    'wasm' (default: onnxruntime-web), 'onnxruntime-node' or 'auto' (onnxruntime-node when installed)
 *   threads    inference threads (default 1); ort: an onnxruntime module to use instead; sha256: false skips the check
 */
export async function load(opts = {}) {
  let ort = opts.ort; let backend = 'custom';
  if (!ort) ({ ort, name: backend } = await runtime(opts.backend || 'wasm'));
  const threads = opts.threads ?? 1;
  if (ort.env?.wasm) ort.env.wasm.numThreads = threads;
  const dirIn = opts.modelDir || opts.modelBase;
  const dir = dirIn ? (dirIn instanceof URL ? dirIn : pathToFileURL(String(dirIn).endsWith('/') ? String(dirIn) : String(dirIn) + '/')) : new URL(variantPath(opts.variant), MODELS);
  const read = async (name) => new Uint8Array(await readFile(fileURLToPath(new URL(name, dir))));
  let userLexicon = opts.userLexicon;
  if (typeof userLexicon === 'string') userLexicon = null;
  const sessionOptions = backend === 'onnxruntime-node' ? { intraOpNumThreads: threads, interOpNumThreads: 1, ...(opts.sessionOptions || {}) } : opts.sessionOptions;
  const g2p = await create(read, ort, {
    ...opts, userLexicon, sessionOptions,
    executionProviders: opts.executionProviders || (backend === 'onnxruntime-node' ? ['cpu'] : ['wasm']),
  });
  g2p.backend = backend;
  if (typeof opts.userLexicon === 'string') await loadUserLexiconFile(g2p, opts.userLexicon);
  return g2p;
}

/** Add the custom pronunciations in a .json or .tsv file. */
export async function loadUserLexiconFile(g2p, path) {
  const text = await readFile(path, 'utf8');
  g2p.loadUserLexicon(text, { format: /\.json$/i.test(path) ? 'json' : /\.tsv$/i.test(path) ? 'tsv' : undefined, name: path });
  return g2p;
}

let shared = null;
/** The default phonemizer, loaded on first use. */
export function getDefault() { return (shared ||= load()); }
/** A line or paragraph -> Kokoro-style phonemes (loads the model on first use). */
export async function phonemize(text) { return (await getDefault()).phonemize(text); }
/** A line or paragraph -> phonemes, one string per clause chunk. */
export async function phonemizeChunks(text) { return (await getDefault()).phonemizeChunks(text); }
