// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// Shared by the browser and Node entry points: read the model files (as they are needed), check them, start the
// sessions.
import { LeokaniG2P, FORMAT } from './g2p.mjs';
import { MODEL_FILES, VARIANTS, DEFAULT_VARIANT } from './models.mjs';
import { Lexicon, readData } from './data.mjs';

export { VARIANTS, DEFAULT_VARIANT };

export const FILES = { lexicon: 'leokani-g2p.data', words: 'leokani-g2p-words.data', encoder: 'oov-encoder.onnx', decoder: 'oov-decoder.onnx', context: 'context.onnx' };
/** What a first sentence needs: the tables + common words, and the context model (it runs on every piece). */
export const FIRST = ['lexicon', 'context'];

async function sha256(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The subfolder of the package's models/ that holds VARIANT ('micro' -> '', 'mini' -> 'mini/'). */
export function variantPath(variant) {
  const v = variant || DEFAULT_VARIANT;
  if (!(v in VARIANTS)) throw new Error(`unknown Leokani G2P variant ${JSON.stringify(v)} (have ${Object.keys(VARIANTS).join(', ')})`);
  return VARIANTS[v] ? VARIANTS[v] + '/' : '';
}

export async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);   // already plain JSON
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/**
 * read(name) -> Promise<Uint8Array>; ort: an onnxruntime module (onnxruntime-web or onnxruntime-node).
 * opts.files: bytes given directly ({ lexicon, words, encoder, decoder, context }); opts.sha256: false to skip the
 * check; opts.variant: 'micro' (default) or 'mini', the pins the files are checked against.
 * opts.lazy: true (default) reads the lexicon tables and the context model now, the other-words file on the first
 * word that is not a common one, and the letter-to-sound models on the first unknown word; false reads everything.
 */
export async function create(read, ort, opts = {}) {
  const t0 = Date.now();
  variantPath(opts.variant);
  const variant = opts.variant || DEFAULT_VARIANT;
  const given = opts.files || {};
  const lazy = opts.lazy !== false;
  const fetched = [];
  const get = async (k) => {
    let b = given[k] ? given[k] : await read(FILES[k]);
    b = b instanceof Uint8Array ? b : new Uint8Array(b);
    fetched.push(k);
    if (opts.sha256 !== false) {
      const want = MODEL_FILES[variant][FILES[k]];
      const got = want ? await sha256(b) : null;
      if (want && got !== want.sha256) {
        throw new Error(`${FILES[k]}: sha256 ${got} (${b.length} bytes), expected ${want.sha256} (${want.bytes} bytes); pass sha256: false to use other model files, or the right variant`);
      }
    }
    return b;
  };
  const so = { executionProviders: opts.executionProviders || ['wasm'], graphOptimizationLevel: 'all', ...(opts.sessionOptions || {}) };
  const core = readData(await get('lexicon'), null, FILES.lexicon);
  const doc = core.doc;
  if (doc.format !== FORMAT) throw new Error(`${FILES.lexicon}: not a ${FORMAT} file (format ${JSON.stringify(doc.format)})`);
  const loader = {
    session: async (k) => ort.InferenceSession.create(await get(k), so),
    words: async () => readData(await get('words'), doc.lexiconSymbols, FILES.words).table,
  };
  const g2p = new LeokaniG2P(doc, { ort, lexicon: new Lexicon(core.table.toMap()), loader, userLexicon: opts.userLexicon || null });
  if (lazy) await g2p._session('context');
  else await g2p.loadAll();
  g2p.loadMs = Date.now() - t0;
  g2p.variant = variant;
  g2p.fetched = fetched;                       // the files read so far, in order (grows as lazy parts load)
  return g2p;
}
