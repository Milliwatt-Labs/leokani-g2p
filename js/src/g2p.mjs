// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// English text to Kokoro-style phonemes. It produces espeak compatible phoneme codes,
// made from the ground up. It contains no espeak-ng code or data files.
//
// Per piece (a clause with no punctuation):
//   1. each word gets a base pronunciation: the lexicon, else the number reader for digits, else the
//      letter-to-sound model (oov-encoder.onnx + oov-decoder.onnx, greedy);
//   2. the context model (context.onnx) picks, per word, how the base is said in this clause, the word edge, and
//      whether the word is written together with the next one.
import {
  cps, plen, first, isdigit, isalpha, isalnumCh, isascii, isupper, lower, anyDigit, anyAlpha, splitWs, split1,
  strip, rstrip, pyRound, cmpCp, cat, pyTrim, foldWs,
} from './py.mjs';
import { Normalizer, PH, PRIMARY, SECONDARY } from './normalize.mjs';
import { Numbers, VOWELS } from './numbers.mjs';
import { UserLexicon } from './userlex.mjs';
import { Lexicon, NeedWords, NeedOov } from './data.mjs';

export const FORMAT = 'leokani-g2p/1';
export const VERSION = '1.3.0';

const STRESS_OPS = ['same', 'demote', 'strip', 'promote1', 'demote1', 'demoteLast', 'promote'];
const N_VARIANTS = 6;
const EDGE_OPS = ['none', 'flap', 'linkr', 'unflap'];
const N_FEATURES = 14;
const SRC = ['lexicon', 'oov', 'number', 'symbol', 'empty'];
const SHAPES = ['lower', 'title', 'caps', 'mixed', 'digit', 'other'];

const replaceFirst = (b, from, to) => { const i = b.indexOf(from); return i < 0 ? b : b.slice(0, i) + to + b.slice(i + from.length); };
const replaceLast = (b, from, to) => { const i = b.lastIndexOf(from); return i < 0 ? b : b.slice(0, i) + to + b.slice(i + from.length); };

function stressOp(b, op) {
  switch (op) {
    case 'same': return b;
    case 'demote': return b.replaceAll(PRIMARY, SECONDARY);
    case 'strip': return b.replaceAll(PRIMARY, '').replaceAll(SECONDARY, '');
    case 'promote1': return replaceFirst(b, SECONDARY, PRIMARY);
    case 'demote1': return replaceFirst(b, PRIMARY, SECONDARY);
    case 'demoteLast': return replaceLast(b, PRIMARY, SECONDARY);
    case 'promote': return b.replaceAll(SECONDARY, PRIMARY);
    default: throw new Error(op);
  }
}

function edgeOp(s, op) {
  if (op === 'none' || !s) return s;
  if (op === 'flap') return s.endsWith('t') ? s.slice(0, -1) + 'ɾ' : s;
  if (op === 'linkr') return s + 'ɹ';
  if (op === 'unflap') return s.endsWith('ɾ') ? s.slice(0, -1) + 't' : s;
  throw new Error(op);
}

function candidates(base, variants) {
  const out = STRESS_OPS.map((op) => stressOp(base, op));
  for (let i = 0; i < N_VARIANTS; i++) out.push(i < variants.length ? variants[i] : null);
  return out;
}

function shape(w) {
  if (anyDigit(w)) return 'digit';
  if (!anyAlpha(w)) return 'other';
  if (w === lower(w)) return 'lower';
  if (isupper(w)) return 'caps';
  const a = cps(w); const rest = a.slice(1).join('');
  if (isupper(a[0]) && rest === lower(rest)) return 'title';
  return 'mixed';
}

const count = (s, sub) => s.split(sub).length - 1;

function features(words, bases, srcs, wordIds, symIds) {
  const n = words.length;
  const out = new BigInt64Array(n * N_FEATURES);
  for (let i = 0; i < n; i++) {
    const w = words[i]; const b = bases[i];
    const bb = cps(b.replaceAll(PRIMARY, '').replaceAll(SECONDARY, '').replaceAll(' ', ''));
    const sym = (c) => symIds.get(c) ?? 1;
    const row = [
      wordIds.get(lower(w)) ?? 1,
      SHAPES.indexOf(shape(w)),
      bb.length ? sym(bb[0]) : 0,
      bb.length ? sym(bb[bb.length - 1]) : 0,
      bb.length > 1 ? sym(bb[bb.length - 2]) : 0,
      Math.min(count(b, PRIMARY), 3),
      Math.min(count(b, SECONDARY), 3),
      Math.min(bb.filter((c) => VOWELS.has(c)).length, 7),
      Math.min(b ? count(b, ' ') + 1 : 0, 3),
      SRC.indexOf(srcs[i]),
      i === 0 ? 1 : 0,
      i === n - 1 ? 1 : 0,
      Math.min(i, 7),
      Math.min(n - 1 - i, 7),
    ];
    for (let k = 0; k < N_FEATURES; k++) out[i * N_FEATURES + k] = BigInt(row[k]);
  }
  return out;
}

/** The best (slot, edge) pair the word has: logits over cands.length * EDGE_OPS.length, slot-major. */
function pick(logits, cands) {
  const order = Array.from(logits.keys());
  order.sort((x, y) => (logits[y] - logits[x]) || (x - y));
  for (const j of order) {
    const k = Math.floor(j / EDGE_OPS.length); const e = j % EDGE_OPS.length;
    if (cands[k] !== null && cands[k] !== undefined) return edgeOp(cands[k], EDGE_OPS[e]);
  }
  return null;
}

function assemble(forms, joins) {
  let out = '';
  forms.forEach((f, i) => {
    if (!f) return;
    if (out && !out.endsWith(' ') && !(i > 0 && joins[i - 1] && forms[i - 1])) out += ' ';
    out += f;
  });
  return pyTrim(out);
}

const LONG_WORD = 20;   // an unknown word longer than this is said in parts
const PART = 12;

function splitLong(w) {
  const a = cps(w);
  if (a.length <= LONG_WORD) return [w];
  const n = Math.ceil(a.length / PART);
  const size = a.length / n;
  const cuts = []; let last = 0;
  for (let k = 1; k < n; k++) {
    const aim = pyRound(k * size);
    let best = aim;
    for (const d of [0, 1, -1, 2, -2, 3, -3]) {
      const j = aim + d;
      if (last < j && j < a.length && contains1('aeiouy', lower(a[j - 1])) && !contains1('aeiouy', lower(a[j]))) { best = j; break; }
    }
    cuts.push(best);
    last = best;
  }
  const starts = [0, ...cuts]; const ends = [...cuts, a.length];
  return starts.map((s, i) => a.slice(s, ends[i]).join('')).filter((x) => x);
}
const contains1 = (s, c) => s.includes(c);

const argmax = (arr, off, len) => {
  let best = 0;
  for (let k = 1; k < len; k++) if (arr[off + k] > arr[off + best]) best = k;
  return best;
};

/**
 * The phonemizer. Make one with load() (index.mjs / node.mjs); this class takes the parsed model file and
 * three onnxruntime InferenceSessions.
 */
export class LeokaniG2P {
  /**
   * doc: the tables (leokani-g2p.data's JSON, or a 1.2 leokani-g2p.json.gz document with its lexicon).
   * lexicon: a Lexicon (data.mjs) for 1.3 files. encoder/decoder/context: InferenceSessions, or omit them and give
   * loader: { session(name) -> Promise<InferenceSession>, words() -> Promise<WordTable> } to start each part on
   * first use (lazy loading).
   */
  constructor(doc, { ort, encoder = null, decoder = null, context = null, userLexicon = null, lexicon = null, loader = null }) {
    if (doc.format !== FORMAT) throw new Error(`not a ${FORMAT} file`);
    this.doc = doc;
    this.ort = ort;
    this.loader = loader;
    this._sessions = { encoder, decoder, context };
    this._pending = {};
    this.lexicon = lexicon || new Lexicon(new Map(Object.entries(doc.lexicon)), new Map());
    this.cased = new Map(Object.entries(doc.cased));
    this.variants = new Map(Object.entries(doc.variants));
    this.wordIds = new Map(doc.contextWords.map((w, i) => [w, i + 2]));
    this.symIds = new Map(doc.symbols.map((s, i) => [s, i + 2]));
    this.chars = new Map(doc.chars.map((c, i) => [c, i + 4]));
    this.outSyms = doc.outSymbols;
    const atoms = new Map(Object.entries(doc.numberAtoms));
    this.numbers = new Numbers(atoms, (w) => this._word(w));
    this.symbolWords = new Map(Object.entries(doc.symbolWords));
    const letters = new Map();
    for (const [k, v] of atoms) if (k.startsWith('letter:')) letters.set(k.slice(7), v);
    letters.set('s', 'ˈɛs');                         // the atom is the plural suffix ("80s")
    this.normalizer = new Normalizer({
      known: (w) => this.lexicon.has(w),
      letters,
      cased: (w) => this.cased.has(w),
      common: (w) => this.wordIds.has(w),
      reading: (w) => [...(this.lexicon.has(w) ? [this._lex(w)] : []), ...(this.variants.get(w) || [])],
    });
    this.maxOut = Number(doc.oov.maxOut);
    this.cache = new Map();
    /** Custom pronunciations, checked before the lexicon and before any normaliser rule. */
    this.userLexicon = new UserLexicon(null, { symbols: new Set([...this.outSyms, PRIMARY, SECONDARY]) });
    this.normalizer.user = this.userLexicon;
    if (userLexicon) this.userLexicon.update(userLexicon);
  }

  // ---- the parts, started on first use when lazy
  async _session(name) {
    if (this._sessions[name]) return this._sessions[name];
    if (!this.loader) throw new Error(`no ${name} model`);
    this._pending[name] ||= this.loader.session(name).then((s) => { this._sessions[name] = s; return s; });
    return this._pending[name];
  }

  async _words() {
    if (this.lexicon.loaded) return;
    this._pending.words ||= this.loader.words().then((t) => { this.lexicon.rest = t; });
    await this._pending.words;
  }

  /** Run fn, loading the other-words file and retrying when a look-up needs it. */
  async _lazy(fn) {
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof NeedOov) await this.oov([e.word]);
        else if (e instanceof NeedWords && !this.lexicon.loaded) await this._words();
        else throw e;
      }
    }
  }

  /** Read the rest now: the other-words file and the three models (load({ lazy: true }) defers them). */
  async loadAll() {
    await Promise.all([this._words(), ...['encoder', 'decoder', 'context'].map((k) => this._session(k))]);
    return this;
  }

  /** Which parts are in memory: 'words' (the other-words file) and the models ('encoder', 'decoder', 'context'). */
  loaded() {
    return [...(this.lexicon.loaded ? ['words'] : []), ...['encoder', 'decoder', 'context'].filter((k) => this._sessions[k])];
  }

  // ---- custom pronunciations
  /** addPronunciation('Leokani', '/lˌAOkˈɑni/'), ('Siobhan', 'shivawn'), ('gif', { phonemes: 'ʤˈɪf' }). */
  addPronunciation(word, value) { this.userLexicon.add(word, value); return this; }
  removePronunciation(word) { return this.userLexicon.delete(word); }
  /** Add custom pronunciations: a {format, words} document or {word: value} object, or JSON / TSV text. */
  loadUserLexicon(source, opts) {
    if (typeof source === 'string') this.userLexicon.load(source, opts);
    else this.userLexicon.update(source);
    return this;
  }

  // ---- bases
  /** The lexicon's phonemes for lowercase lw (which it has); a word the letter-to-sound model says comes from
   * its cache, or throws NeedOov (the async methods catch it, run the model and retry). */
  _lex(lw) {
    const v = this.lexicon.get(lw);
    if (v !== null) return v;
    if (this.cache.has(lw)) return this.cache.get(lw);
    throw new NeedOov(lw);
  }

  _word(w) {
    const c = this.cased.get(w);
    if (c) return c;
    const lw = lower(w);
    return this.lexicon.has(lw) ? this._lex(lw) : null;
  }

  /** A line as a person reads it (numbers, money, dates, abbreviations, ...). Lazy loading: see normalizeAsync. */
  normalize(text, pauses = true) {
    return this.normalizer.normalize(text, pauses);
  }

  /** normalize, reading the other-words file first if the line needs it (lazy loading). */
  async normalizeAsync(text, pauses = true) {
    return this._lazy(() => this.normalizer.normalize(text, pauses));
  }

  async base(w) {
    if (w.includes(PH)) return [split1(w, PH)[1], 'lexicon'];
    if (this.cased.has(w)) return [this.cased.get(w), 'lexicon'];
    const lw = lower(w);
    if (this.lexicon.has(lw)) {
      const v = this.lexicon.get(lw);
      return [v === null ? (await this.oov([lw]))[0] : v, 'lexicon'];
    }
    if (anyDigit(w)) {
      const said = this.numbers.say(w);
      if (said !== null) return [said, 'number'];
      // a shape the reader has no rule for ("(212)555-0100", "5'11"): its letter and digit runs, never nothing
      const runs = w.match(/\p{Nd}+|[\p{L}\p{Nl}\p{No}]+/gu) || [];
      if (runs.length && !(runs.length === 1 && runs[0] === w)) {
        const parts = [];
        for (const r of runs) { const [b] = await this.base(r); if (b) parts.push(b); }
        return [parts.join(' '), 'number'];
      }
    }
    if (this.symbolWords.has(w)) return [this.symbolWords.get(w), 'symbol'];
    if (!anyAlpha(w)) return ['', 'empty'];
    const r = rstrip(w, '.');
    if (w.endsWith('.') && r && !r.includes('.')) return this.base(r);
    return [(await this.oov([w]))[0], 'oov'];
  }

  async oov(words) {
    const todo = words.filter((w) => !this.cache.has(w));
    if (todo.length) {
      const parts = new Map(todo.map((w) => [w, splitLong(w)]));
      const flat = [...new Set([...parts.values()].flat())].sort(cmpCp);
      const said = await this._decode(flat);
      const by = new Map(flat.map((p, i) => [p, said[i]]));
      for (const w of todo) this.cache.set(w, parts.get(w).map((p) => by.get(p)).join(''));
    }
    return words.map((w) => this.cache.get(w));
  }

  async _decode(words) {
    const { Tensor } = this.ort;
    const B = words.length;
    const L = Math.max(...words.map(plen)) + 2;
    const x = new BigInt64Array(B * L);
    words.forEach((w, i) => {
      const ids = [2, ...cps(w).map((c) => this.chars.get(c) ?? 3), 1];
      ids.forEach((v, k) => { x[i * L + k] = BigInt(v); });
    });
    const chars = new Tensor('int64', x, [B, L]);
    const enc = await this._session('encoder'); const dec = await this._session('decoder');
    const { memory } = await enc.run({ chars });
    let T = 1;
    let y = new BigInt64Array(B).fill(2n);              // BOS
    const done = new Array(B).fill(false);
    for (let step = 0; step < this.maxOut; step++) {
      const prev = new Tensor('int64', y, [B, T]);
      const { logits } = await dec.run({ memory, chars, prev });
      const V = logits.dims[2]; const data = logits.data;
      const next = new BigInt64Array(B * (T + 1));
      for (let i = 0; i < B; i++) {
        for (let t = 0; t < T; t++) next[i * (T + 1) + t] = y[i * T + t];
        let tok = argmax(data, (i * T + T - 1) * V, V);
        if (done[i]) tok = 0;
        if (tok === 1) done[i] = true;
        next[i * (T + 1) + T] = BigInt(tok);
      }
      prev.dispose?.(); logits.dispose?.();
      y = next; T += 1;
      if (done.every(Boolean)) break;
    }
    chars.dispose?.(); memory.dispose?.();
    const out = [];
    for (let i = 0; i < B; i++) {
      let s = '';
      for (let t = 1; t < T; t++) {
        const v = Number(y[i * T + t]);
        if (v <= 1) break;
        s += v >= 4 ? this.outSyms[v - 4] : '';
      }
      out.push(s);
    }
    return out;
  }

  // ---- a piece
  /** One clause with no punctuation -> phonemes. */
  async piece(piece) {
    return (await this.pieceWords(piece)).phonemes;
  }

  /** -> {phonemes, forms, joins, sources}. */
  async pieceWords(piece) {
    return this._lazy(() => this._pieceWords(piece));
  }

  async _pieceWords(piece) {
    let words = this.normalize(piece, false).split(' ').filter((w) => w);
    if (!words.length) return { phonemes: '', forms: [], joins: [], sources: [] };
    const need = [...words.filter((w) => this._needsOov(w)), ...words.map((w) => this._derived(w)).filter((w) => w)];
    if (need.length) await this.oov([...new Set(need)].sort(cmpCp));
    const bases = []; const srcs = [];
    for (const w of words) { const [b, s] = await this.base(w); bases.push(b); srcs.push(s); }
    const given = words.map((w) => w.includes(PH));       // said as given: no weak forms of the spelling
    words = words.map((w) => w.split(PH)[0]);
    const n = words.length;
    const feats = new this.ort.Tensor('int64', features(words, bases, srcs, this.wordIds, this.symIds), [1, n, N_FEATURES]);
    const { form, join } = await (await this._session('context')).run({ features: feats });
    const F = form.dims[2]; const fd = form.data; const jd = join.data;
    const forms = [];
    for (let i = 0; i < n; i++) {
      const b = bases[i];
      const logits = Float32Array.from(fd.subarray(i * F, (i + 1) * F));
      if (given[i]) {
        if (!b.endsWith('ɹ')) for (let k = EDGE_OPS.indexOf('linkr'); k < F; k += EDGE_OPS.length) logits[k] = -Infinity;
        forms.push(pick(logits, candidates(b, [])) || b);
      } else {
        forms.push(pick(logits, candidates(b, this.variants.get(lower(words[i])) || [])) || b);
      }
    }
    const joins = words.map((_, i) => jd[i * 2 + 1] > jd[i * 2]);
    feats.dispose?.(); form.dispose?.(); join.dispose?.();
    return { phonemes: assemble(forms, joins), forms, joins, sources: srcs };
  }

  /** The lowercase key, when w's base is a lexicon word the letter-to-sound model says (batched with the rest). */
  _derived(w) {
    if (w.includes(PH) || this.cased.has(w)) return null;
    const r = rstrip(w, '.');
    if (w.endsWith('.') && r && !r.includes('.')) w = r;
    const lw = lower(w);
    return this.lexicon.has(lw) && this.lexicon.get(lw) === null && !this.cache.has(lw) ? lw : null;
  }

  _needsOov(w) {
    const r = rstrip(w, '.');
    if (w.endsWith('.') && r && !r.includes('.')) w = r;
    const lw = lower(w);
    return !w.includes(PH) && !this.cased.has(w) && !this.lexicon.has(lw) && !this.symbolWords.has(w)
      && anyAlpha(w) && !(anyDigit(w) && this.numbers.say(w));
  }

  // ---- a whole line
  /** A line or paragraph -> phonemes, one string per clause chunk (the unit Leokani-tts speaks). */
  async phonemizeChunks(text) {
    const out = [];
    for (const c of chunks(clean(await this.normalizeAsync(text)))) out.push(await line(c, this));
    return out;
  }

  /** A line or paragraph -> one phoneme string (the chunks joined by a space). */
  async phonemize(text) {
    return (await this.phonemizeChunks(text)).join(' ');
  }

  async dispose() {
    for (const s of Object.values(this._sessions)) await s?.release?.();
  }
}

// ---------------------------------------------------------------- the line front end

const PUNCT = new Set([',', '.', '!', '?', ';', ':', '—', '…']);

function clusters(s) {
  const out = [];
  for (const c of s) {
    if (out.length && (cat(c, 'Mn', 'Mc', 'Me') || c === '‍')) out[out.length - 1] += c;
    else out.push(c);
  }
  return out;
}

async function line(text, g2p) {
  let out = '';
  for (const p of pieces(text)) {
    if (clusters(p).every((c) => PUNCT.has(c))) { out += p; continue; }
    const ph = await g2p.piece(desilence(p));
    if (ph === '') continue;
    if (out && !out.endsWith(' ')) out += ' ';
    out += ph;
  }
  return pyTrim(out);
}

/** Drop markdown marks and fold whitespace. */
export function clean(text) {
  return pyTrim(foldWs(text.replace(/[*_`#>|]+/g, ' ')));
}

const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'st', 'vs', 'etc', 'e.g', 'i.e', 'no', 'jr', 'sr', 'mt']);

/** Clause chunks: break after . ! ? ; : (not after a title such as "Dr."), and after a comma once a chunk has 12
 * words. The first chunk needs 3 words. */
export function chunks(text) {
  const out = []; let cur = [];
  for (const w of text.split(' ')) {
    if (!w) continue;
    cur.push(w);
    const end = w[w.length - 1];
    const brk = '!?;:'.includes(end) || (end === '.' && !TITLES.has(rstrip(strip(lower(w), '("\''), '.')))
      || (end === ',' && cur.length >= 12);
    if (brk && cur.length >= (out.length ? 1 : 3)) { out.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) out.push(cur.join(' '));
  return out.filter((c) => cps(c).some(isalnumCh));
}

const DROPPED = new Set(['"', "'", '“', '”', '‘', '’', '(', ')', '[', ']', '*', '_', '`', '#']);
const ABBREV = new Set(['dr.', 'mr.', 'mrs.', 'ms.', 'st.', 'jr.', 'sr.', 'vs.', 'etc.', 'e.g.', 'i.e.', 'prof.', 'mt.', 'no.', 'a.m.', 'p.m.', 'u.s.', 'approx.']);
const READ_PAST_BEFORE = new Set(['already', 'just', 'was', 'were', 'been', "i've", "we've", "you've", "they've", 'had', 'has', 'have', 'never', 'once', 'recently']);
const READ_PAST_AFTER = new Set(['yesterday', 'last', 'earlier', 'ago', 'already', 'before']);
const LEAD_METAL = new Set(['pipe', 'pipes', 'paint', 'poisoning', 'pencil', 'pencils', 'weight', 'weights', 'shot', 'bullet', 'bullets', 'balloon', 'acid', 'crystal', 'apron', 'sinker', 'solder']);
const WIND_VERB_BEFORE = new Set(['to', 'will', 'would', 'can', 'could', 'must', 'should', 'please', 'i', 'we', 'you', 'they', 'and', "don't", "didn't"]);
const WIND_OBJECT = new Set(['the', 'it', 'up', 'down', 'back', 'your', 'my', 'our', 'his', 'her', 'them', 'this', 'that', 'a']);
const LIVES_SUBJECT = new Set(['he', 'she', 'it', 'who', 'that', 'which', 'everyone', 'someone', 'nobody', 'one', 'anyone', 'everybody', 'somebody']);
const LIVES_OWNER = new Set(['our', 'their', 'my', 'your', 'his', 'her', 'its', 'the', 'many', 'all', 'these', 'those', 'whose', 'two', 'nine', 'save', 'both']);
const YEAR_BEFORE = new Set(['in', 'since', 'by', 'of', 'from', 'until', 'till', 'year', 'circa', 'around', 'before', 'after', 'during', 'summer', 'winter', 'spring', 'fall', 'autumn']);
const NAMES = new Map([['tchaikovsky', 'chykoffsky'], ['chopin', 'showpan'], ['goethe', 'gerta']]);
// The pronoun I is always stressed ('ˈI'), except straight after an auxiliary ('Am I late?').
const PRONOUN = new Map([['i', 'eye'], ["i'm", 'eim'], ["i'll", 'isle'], ["i've", 'ive'], ["i'd", 'eyed']]);
const PRONOUN_AFTER = new Set(['am', 'are', 'is', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', "aren't", "isn't", "wasn't", "weren't", "don't", "doesn't", "didn't", "haven't", "hasn't", "hadn't", "can't", "couldn't", "won't", "wouldn't", "shouldn't", "mustn't"]);
const SILENT = [[0x2160, 0x2182], [0x2185, 0x2188], [0x24B6, 0x24E9]];

function respell(word, prev, nxt) {
  const w = lower(word); const p = prev !== null ? lower(prev) : null; const n = nxt.map(lower);
  const wq = w.replaceAll('’', "'");
  if (word.slice(0, 1) === 'I' && PRONOUN.has(wq)) return p !== null && PRONOUN_AFTER.has(p.replaceAll('’', "'")) ? null : PRONOUN.get(wq);
  if (NAMES.has(w)) return NAMES.get(w);
  if (w === 'read') {
    if ((p !== null && READ_PAST_BEFORE.has(p)) || n.some((x) => READ_PAST_AFTER.has(x))) return 'red';
  } else if (w === 'lead') {
    if ((n.length && LEAD_METAL.has(n[0])) || p === 'of') return 'led';
  } else if (w === 'wind' || w === 'winds') {
    const s = w === 'winds' ? 's' : '';
    if (n.length && (n[0] === 'up' || n[0] === 'down')) return 'wined' + s;
    if (n.length && WIND_OBJECT.has(n[0]) && (p === null || WIND_VERB_BEFORE.has(p))) return 'wined' + s;
  } else if (w === 'lives') {
    if (p !== null && LIVES_SUBJECT.has(p)) return 'livs';
    if (p !== null && prev && isupper(first(prev)) && !LIVES_OWNER.has(p)) return 'livs';
  }
  if (p !== null && YEAR_BEFORE.has(p) && plen(w) === 4 && isascii(w) && isdigit(w)) {
    const y = Number(w);
    if ((y >= 1100 && y <= 1999) || (y >= 2010 && y <= 2099)) {
      const hi = Math.floor(y / 100); const lo = y % 100;
      return lo === 0 ? `${hi} hundred` : lo < 10 ? `${hi} oh ${lo}` : `${hi} ${lo}`;
    }
  }
  return null;
}

/** Words grouped into punctuation-free clauses, with the punctuation marks between them as their own pieces. */
export function pieces(text) {
  const words = [];
  for (const t of splitWs(text)) {
    let core = clusters(t);
    while (core.length && DROPPED.has(core[0])) core = core.slice(1);
    let trail = '';
    while (core.length && (DROPPED.has(core[core.length - 1]) || PUNCT.has(core[core.length - 1]))) {
      const last = core[core.length - 1];
      if (PUNCT.has(last)) {
        if (last === '.' && ABBREV.has(lower(core.join('')))) break;
        trail = last + trail;
      }
      core = core.slice(0, -1);
    }
    if (core.length && core.every((c) => c === '-')) { words.push(['', '—']); continue; }
    words.push([core.join(''), trail]);
  }
  const out = []; let clause = [];
  words.forEach(([word, punct], i) => {
    if (word) {
      const prev = i > 0 && words[i - 1][1] === '' ? words[i - 1][0] : null;
      const nxt = [];
      if (punct === '') {
        for (let j = i + 1; j < Math.min(words.length, i + 5); j++) {
          nxt.push(words[j][0]);
          if (words[j][1] !== '') break;
        }
      }
      const r = respell(word, prev, nxt);
      clause.push(r !== null ? r : word);
    }
    if (punct) {
      if (clause.length) out.push(clause.join(' '));
      clause = [];
      out.push(punct.includes('..') ? '…' : clusters(punct).slice(0, 2).join(''));
    }
  });
  if (clause.length) out.push(clause.join(' '));
  return out;
}

/** Characters in SILENT become spaces before each piece. */
export function desilence(piece) {
  let out = '';
  for (const c of piece) {
    const o = c.codePointAt(0);
    out += SILENT.some(([a, b]) => o >= a && o <= b) ? ' ' : c;
  }
  return out;
}

export { PH, PRIMARY, SECONDARY, splitLong };
