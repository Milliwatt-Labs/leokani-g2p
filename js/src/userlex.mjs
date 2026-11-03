// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// Custom pronunciations (brands, people, places), checked before the lexicon and before any normaliser rule.
// The format and its rules are shared by every port (see USER-LEXICON.md in the package).
import { cps, lower, isspaceCh, splitWs, pyTrim, pyTrimEnd, splitLines } from './py.mjs';
import { Normalizer, PRIMARY, SECONDARY } from './normalize.mjs';

export const USER_FORMAT = 'leokani-g2p-user/1';
const SIBILANT_END = new Set(cps('szʃʒʧʤ'));
const VOICELESS_END = new Set(cps('ptkfθ'));

export class UserLexiconError extends Error {}

/**
 * A user lexicon: word -> phonemes or word -> respelling.
 * A key with no capital letter matches any casing; a key with a capital matches only that casing, and wins.
 * "Leokani's" falls back to "Leokani" (phonemes + ᵻz / s / z, or the respelling + 's); "James'" to "James".
 */
export class UserLexicon {
  /** symbols: the phoneme symbols a phoneme entry may use (null: no check). */
  constructor(entries = null, { symbols = null } = {}) {
    this.symbols = symbols;
    this.exact = new Map();       // key with a capital -> {kind, value}
    this.lower = new Map();       // all-lowercase key
    if (entries) this.update(entries);
  }

  get size() { return this.exact.size + this.lower.size; }

  /** A value -> {kind: 'phonemes' | 'say', value}. "/…/" is phonemes, other text a respelling. */
  static parse(value) {
    let kind; let val;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === 'phonemes') [kind, val] = ['phonemes', value.phonemes];
      else if (keys.length === 1 && keys[0] === 'say') [kind, val] = ['say', value.say];
      else throw new UserLexiconError(`an entry is {"phonemes": ...} or {"say": ...}, not ${JSON.stringify(value)}`);
      if (typeof val !== 'string') throw new UserLexiconError(`not a pronunciation: ${JSON.stringify(value)}`);
    } else if (typeof value === 'string') {
      const v = pyTrim(value);
      const a = cps(v);
      if (a.length >= 2 && a[0] === '/' && a[a.length - 1] === '/') [kind, val] = ['phonemes', a.slice(1, -1).join('')];
      else [kind, val] = ['say', v];
    } else {
      throw new UserLexiconError(`not a pronunciation: ${JSON.stringify(value)}`);
    }
    val = splitWs(val).join(' ');
    if (!val) throw new UserLexiconError('an empty pronunciation');
    return { kind, value: val };
  }

  /**
   * add('Leokani', '/lˌAOkˈɑni/'), add('Siobhan', { say: 'shivawn' }), add('gif', { phonemes: 'ʤˈɪf' }).
   */
  add(word, value) {
    if (typeof word !== 'string') throw new UserLexiconError(`a key is a string: ${JSON.stringify(word)}`);
    const entry = UserLexicon.parse(value);
    let key = pyTrim(word).replaceAll('’', "'");
    key = Normalizer.split(key)[1] || key;           // matched against a token's core: "Mx." -> "Mx"
    if (!key || cps(key).some(isspaceCh)) throw new UserLexiconError(`a key is one token with no spaces: ${JSON.stringify(word)}`);
    if (entry.kind === 'phonemes' && this.symbols) {
      const bad = [...new Set(cps(entry.value).filter((c) => c !== ' ' && !this.symbols.has(c)))].sort();
      if (bad.length) throw new UserLexiconError(`${word}: unknown phoneme symbols ${bad.join(' ')}`);
    }
    (key !== lower(key) ? this.exact : this.lower).set(key, entry);
    return this;
  }

  delete(word) {
    let key = pyTrim(word).replaceAll('’', "'");
    key = Normalizer.split(key)[1] || key;
    return this.exact.delete(key) || this.lower.delete(key);
  }

  clear() { this.exact.clear(); this.lower.clear(); }

  /** Entries: a UserLexicon, a {format, words} document, a plain {word: value} object, or a Map. */
  update(entries) {
    if (entries instanceof UserLexicon) {
      for (const [k, v] of entries.exact) this.exact.set(k, v);
      for (const [k, v] of entries.lower) this.lower.set(k, v);
      return this;
    }
    if (entries instanceof Map) {
      for (const [k, v] of entries) this.add(k, v);
      return this;
    }
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new UserLexiconError('a user lexicon is an object: word -> pronunciation');
    }
    if ('words' in entries && 'format' in entries) {
      if (entries.format !== USER_FORMAT) throw new UserLexiconError(`not a ${USER_FORMAT} file: ${JSON.stringify(entries.format)}`);
      entries = entries.words;
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
        throw new UserLexiconError('a user lexicon is an object: word -> pronunciation');
      }
    }
    for (const [k, v] of Object.entries(entries)) this.add(k, v);
    return this;
  }

  /** Add the entries of a JSON document (text or parsed). */
  loadJSON(doc) {
    return this.update(typeof doc === 'string' ? JSON.parse(doc) : doc);
  }

  /** Add the entries of TSV text: key TAB value per line; blank lines and # comments skipped. */
  loadTSV(text, name = 'tsv') {
    splitLines(text).forEach((raw, k) => {
      const ln = pyTrim(raw).replace(/^\uFEFF+/, '');
      if (!ln || ln.startsWith('#')) return;
      const t = ln.indexOf('\t');
      if (t < 0) throw new UserLexiconError(`${name}:${k + 1}: expected key<TAB>value`);
      try {
        this.add(ln.slice(0, t), ln.slice(t + 1));
      } catch (e) {
        throw new UserLexiconError(`${name}:${k + 1}: ${e.message}`);
      }
    });
    return this;
  }

  /** Text in either format: JSON if it starts with "{", otherwise TSV. */
  load(text, { format, name } = {}) {
    const f = format || (text.trimStart().replace(/^\uFEFF/, '').startsWith('{') ? 'json' : 'tsv');
    return f === 'json' ? this.loadJSON(text.replace(/^\uFEFF/, '')) : this.loadTSV(text, name);
  }

  /** The {format, words} document for these entries (round-trips through loadJSON). */
  toJSON() {
    const words = {};
    for (const m of [this.lower, this.exact]) {
      for (const [k, e] of m) words[k] = e.kind === 'phonemes' ? { phonemes: e.value } : { say: e.value };
    }
    return { format: USER_FORMAT, words };
  }

  get(core) {
    const c = core.replaceAll('’', "'");
    return this.exact.get(c) || this.lower.get(lower(c)) || null;
  }

  /** A token's core -> {kind, value}, possessives included, or null. */
  rewrite(core) {
    const hit = this.get(core);
    if (hit) return hit;
    const c = core.replaceAll('’', "'");
    const a = cps(c);
    const end2 = a.slice(-2).join('');
    if (a.length > 2 && (end2 === "'s" || end2 === "'S")) {
      const stem = this.get(a.slice(0, -2).join(''));
      if (!stem) return null;
      if (stem.kind === 'say') return { kind: 'say', value: stem.value + "'s" };
      const ph = cps(pyTrimEnd(stem.value.replaceAll(PRIMARY, '').replaceAll(SECONDARY, '')));
      const last = ph.length ? ph[ph.length - 1] : '';
      return { kind: 'phonemes', value: stem.value + (SIBILANT_END.has(last) ? 'ᵻz' : VOICELESS_END.has(last) ? 's' : 'z') };
    }
    if (a.length > 2 && a[a.length - 1] === "'" && (a[a.length - 2] === 's' || a[a.length - 2] === 'S')) {
      return this.get(a.slice(0, -1).join(''));
    }
    return null;
  }
}
