// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// Shared by the browser and Node entry points: read the four model files, check them, start the sessions.
import { LeokaniG2P, FORMAT } from './g2p.mjs';
import { MODEL_FILES, VARIANTS, DEFAULT_VARIANT } from './models.mjs';

export { VARIANTS, DEFAULT_VARIANT };

export const FILES = { lexicon: 'leokani-g2p.json.gz', encoder: 'oov-encoder.onnx', decoder: 'oov-decoder.onnx', context: 'context.onnx' };

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
 * opts.files: bytes given directly ({ lexicon, encoder, decoder, context }); opts.sha256: false to skip the check;
 * opts.variant: 'micro' (default) or 'mini', the pins the files are checked against.
 */
export async function create(read, ort, opts = {}) {
  const t0 = Date.now();
  variantPath(opts.variant);
  const variant = opts.variant || DEFAULT_VARIANT;
  const given = opts.files || {};
  const names = Object.keys(FILES);
  const bytes = await Promise.all(names.map(async (k) => {
    const b = given[k] ? new Uint8Array(given[k]) : await read(FILES[k]);
    return b instanceof Uint8Array ? b : new Uint8Array(b);
  }));
  const files = Object.fromEntries(names.map((k, i) => [k, bytes[i]]));
  if (opts.sha256 !== false) {
    await Promise.all(names.map(async (k) => {
      const want = MODEL_FILES[variant][FILES[k]];
      if (!want) return;
      const got = await sha256(files[k]);
      if (got !== want.sha256) {
        throw new Error(`${FILES[k]}: sha256 ${got} (${files[k].length} bytes), expected ${want.sha256} (${want.bytes} bytes); pass sha256: false to use other model files, or the right variant`);
      }
    }));
  }
  const doc = JSON.parse(await gunzip(files.lexicon));
  if (doc.format !== FORMAT) throw new Error(`${FILES.lexicon}: not a ${FORMAT} file (format ${JSON.stringify(doc.format)})`);
  const so = { executionProviders: opts.executionProviders || ['wasm'], graphOptimizationLevel: 'all', ...(opts.sessionOptions || {}) };
  const [encoder, decoder, context] = await Promise.all(['encoder', 'decoder', 'context'].map((k) => ort.InferenceSession.create(files[k], so)));
  const g2p = new LeokaniG2P(doc, { ort, encoder, decoder, context, userLexicon: opts.userLexicon || null });
  g2p.loadMs = Date.now() - t0;
  g2p.variant = variant;
  return g2p;
}
