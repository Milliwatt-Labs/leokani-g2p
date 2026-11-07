// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// The 1.3 lexicon files (leokani-g2p.data, leokani-g2p-words.data). Layout, little-endian:
//   "LKG2P13\x01", u32 n + n bytes of JSON (the tables; {} in the words file), then one word section:
//   u32 count, u32 block, u32 len + the words, u32 len + the phonemes.
// Words are sorted by their UTF-8 bytes and front-coded, each ended by a newline: every block-th word is written
// whole, the others as one byte (leading bytes shared with the word before) + the rest.
// Phonemes, one run per word: its symbols (one byte each, an index into the tables' "lexiconSymbols") ended by
// 0xFF, or the single byte 0xFE: in the lexicon and said by the letter-to-sound model.

const MAGIC = [0x4c, 0x4b, 0x47, 0x32, 0x50, 0x31, 0x33, 0x01];
const utf8 = new TextEncoder();
const text = new TextDecoder();
const NL = 0x0a; const END = 0xff; const MODEL = 0xfe;

const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

function cmpBytes(a, b) {
  const n = Math.min(a.length, b.length);
  for (let k = 0; k < n; k++) if (a[k] !== b[k]) return a[k] - b[k];
  return a.length - b.length;
}

/** A .data file's bytes -> { doc (its tables), table (a WordTable) }. symbols: the core file's, for the words file. */
export function readData(bytes, symbols = null, name = 'leokani-g2p.data') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 12 || MAGIC.some((v, k) => b[k] !== v)) throw new Error(`${name}: not a Leokani G2P 1.3 data file`);
  const n = u32(b, 8);
  const doc = JSON.parse(text.decode(b.subarray(12, 12 + n)));
  let i = 12 + n;
  const count = u32(b, i); const block = u32(b, i + 4);
  i += 8;
  const parts = [];
  for (let k = 0; k < 2; k++) {
    const m = u32(b, i);
    parts.push(b.subarray(i + 4, i + 4 + m));
    i += 4 + m;
  }
  const syms = symbols || doc.lexiconSymbols;
  if (!syms) throw new Error(`${name}: no lexiconSymbols`);
  return { doc, table: new WordTable(count, block, parts[0], parts[1], syms) };
}

/** Sorted, front-coded words: get(word) by binary search over the blocks' whole words, then a scan of one block. */
export class WordTable {
  constructor(count, block, words, phon, syms) {
    this.count = count; this.block = block;
    this.words = words; this.phon = phon; this.syms = syms;
    const nb = Math.ceil(count / block);
    this.wOff = new Uint32Array(nb); this.pOff = new Uint32Array(nb);
    this.heads = new Array(nb);
    let wi = 0; let pi = 0;
    for (let k = 0; k < count; k++) {
      if (k % block === 0) {
        const j = k / block;
        this.wOff[j] = wi; this.pOff[j] = pi;
        const e = words.indexOf(NL, wi);
        this.heads[j] = words.subarray(wi, e);
        wi = e + 1;
      } else {
        wi = words.indexOf(NL, wi + 1) + 1;
      }
      pi = phon[pi] === MODEL ? pi + 1 : phon.indexOf(END, pi) + 1;
    }
  }

  get size() { return this.count; }

  _say(pi, e) {
    let s = '';
    for (let k = pi; k < e; k++) s += this.syms[this.phon[k]];
    return s;
  }

  * _scan(from, to) {
    let wi = this.wOff[from / this.block]; let pi = this.pOff[from / this.block]; let prev = null;
    for (let k = from; k < to; k++) {
      let w;
      if (k % this.block === 0) {
        const e = this.words.indexOf(NL, wi);
        w = this.words.subarray(wi, e);
        wi = e + 1;
      } else {
        const p = this.words[wi];
        const e = this.words.indexOf(NL, wi + 1);
        w = new Uint8Array(p + e - wi - 1);
        w.set(prev.subarray(0, p));
        w.set(this.words.subarray(wi + 1, e), p);
        wi = e + 1;
      }
      prev = w;
      let v; let next;
      if (this.phon[pi] === MODEL) { v = null; next = pi + 1; } else { const e = this.phon.indexOf(END, pi); v = [pi, e]; next = e + 1; }
      yield [w, v];
      pi = next;
    }
  }

  /** word -> phonemes; null: in the lexicon, said by the letter-to-sound model; undefined: not in the lexicon. */
  get(word) {
    const q = utf8.encode(word);
    let lo = 0; let hi = this.heads.length - 1;
    if (hi < 0 || cmpBytes(q, this.heads[0]) < 0) return undefined;
    while (lo < hi) {                                   // the last block whose first word <= q
      const mid = (lo + hi + 1) >> 1;
      if (cmpBytes(this.heads[mid], q) <= 0) lo = mid; else hi = mid - 1;
    }
    for (const [w, v] of this._scan(lo * this.block, Math.min(this.count, (lo + 1) * this.block))) {
      const c = cmpBytes(w, q);
      if (c === 0) return v === null ? null : this._say(v[0], v[1]);
      if (c > 0) return undefined;
    }
    return undefined;
  }

  has(word) { return this.get(word) !== undefined; }

  /** Every [word, phonemes or null], in order. */
  * entries() {
    if (!this.count) return;
    for (const [w, v] of this._scan(0, this.count)) yield [text.decode(w), v === null ? null : this._say(v[0], v[1])];
  }

  /** The whole table as a Map (the common words: small, looked up for every word). */
  toMap() { return new Map(this.entries()); }
}

/** Thrown by a lexicon look-up that needs the other-words file before it is loaded (see LeokaniG2P._lazy). */
export class NeedWords extends Error {
  constructor() { super('the Leokani G2P words file is not loaded yet: use the async methods (normalizeAsync) or load({ lazy: false })'); this.name = 'NeedWords'; }
}

/** Thrown by a look-up of a lexicon word the letter-to-sound model says, before that model has said it. */
export class NeedOov extends Error {
  constructor(word) { super(`the Leokani G2P letter-to-sound model has not said ${JSON.stringify(word)} yet: use the async methods (normalizeAsync)`); this.name = 'NeedOov'; this.word = word; }
}

/** The lexicon: the common words (always loaded) + the other words (a WordTable once loaded). */
export class Lexicon {
  constructor(common, rest = null) { this.common = common; this.rest = rest; }
  get loaded() { return this.rest !== null; }
  _rest() { if (!this.rest) throw new NeedWords(); return this.rest; }
  has(w) { return this.common.has(w) || this._rest().has(w); }
  get(w) {
    const v = this.common.get(w);
    return v !== undefined ? v : this._rest().get(w);
  }
}
