// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// Digits read as the reference runtime reads them ("740" -> sˈɛvənhˈʌndɹɪd fˈɔɹɾi). Atoms (0-99, scale words,
// signs, letters, ordinals) come from the lexicon file. say() returns null for a token it has no rule for.
import { PyError, get, cps, isdigit, isalpha, islower, isupper, lower, lstrip, pyBig } from './py.mjs';
import { PRIMARY, SECONDARY } from './normalize.mjs';

const VOWELS = new Set(cps('aeiouæɑɐɒɔəɛɜɪʊʌAEIOUWYᵊᵻɚɝ'));
const SEG = /\p{Nd}+(?:,\p{Nd}{3})*(?:\.\p{Nd}+)?|[A-Za-z]+|./gu;
const ORD = new Set(['st', 'nd', 'rd', 'th']);
const SUFFIX_SOUND = { st: 'st', nd: 'ənd', rd: 'd', th: 'θ' };
const firstCh = (s) => (s ? cps(s)[0] : '');

export class Numbers {
  constructor(atoms, word) {
    this.a = atoms;                       // Map
    this.word = word || (() => null);
  }

  A(k) { return get(this.a, k); }

  group(n, pre = false) {                 // n: Number, 0 < n < 1000
    const h = Math.floor(n / 100); const r = n % 100;
    const out = h ? [this.A(String(h)) + this.A('hundred')] : [];
    if (r) out.push(pre && this.a.has(`pre:${r}`) ? this.a.get(`pre:${r}`) : this.A(String(r)));
    return out;
  }

  integer(digits) {
    let n = pyBig(digits);
    if (n >= 10n ** 12n) return null;
    if (n === 0n) return [this.A('0')];
    if (n >= 1900n && n <= 1999n && cps(digits).length === 4) {
      const r = Number(n % 100n);
      return [this.A('19') + this.A('hundred'), ...(r ? [this.A(String(r))] : [])];
    }
    const out = [];
    for (const [scale, name] of [[10n ** 9n, 'billion'], [10n ** 6n, 'million'], [10n ** 3n, 'thousand']]) {
      const q = n / scale; n %= scale;
      if (q) { out.push(...this.group(Number(q), true)); out.push(this.A(name)); }
    }
    if (n) out.push(...this.group(Number(n)));
    return out;
  }

  digits(d) {
    const a = cps(d);
    if (a.length <= 3) {
      let z = a.length - cps(lstrip(d, '0')).length;
      z = Math.min(z, a.length - 1);
      const zeros = Array.from({ length: z }, () => this.A('0')).join('');
      const rest = this.integer(a.slice(z).join(''));
      if (rest === null) throw new PyError('TypeError');
      return [zeros, ...rest];
    }
    if (a.length === 4) return [a.map((c) => this.A(c)).join('')];
    const groups = []; let rest = a;
    while (rest.length) { groups.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
    return groups.map((gr) => gr.map((c) => this.A(c)).join(''));
  }

  number(s) {
    const k = s.indexOf('.');
    const whole = k < 0 ? s : s.slice(0, k);
    const frac = k < 0 ? '' : s.slice(k + 1);
    const digits = whole.replaceAll(',', '');
    let out = cps(digits).length > 1 && digits.startsWith('0') && !whole.includes(',') ? this.digits(digits) : this.integer(digits);
    if (out === null) return null;
    if (frac) out = [...out, this.A('.'), ...cps(frac).map((c) => this.A(c))];
    return out;
  }

  static rightSuffix(n) {
    if (n % 100 >= 10 && n % 100 <= 20) return 'th';
    return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  }

  ordinal(n, suffix) {                    // n: BigInt
    const r = Number(n % 100n);
    if (!r) return [...(this.integer(String(n)) || []), this.A('ord:th')];
    const head = n - BigInt(r) ? this.integer(String(n - BigInt(r))) : [];
    const whole = this.A(`ord:${r}`);
    const right = SUFFIX_SOUND[Numbers.rightSuffix(r)];
    if (!whole.endsWith(right)) return [...(head || []), whole];
    return [...(head || []), whole.slice(0, whole.length - right.length) + SUFFIX_SOUND[suffix]];
  }

  letters(run, isFirst) {
    const names = cps(run).map((c) => this.a.get('letter:' + lower(c)));
    if (names.some((x) => x === undefined)) return null;
    const spelled = names.slice(0, -1).map((x) => x.replaceAll(PRIMARY, SECONDARY)).join('');
    const last = names[names.length - 1];
    const tail = isFirst && lower(run) === 'a' ? last.replaceAll(PRIMARY, SECONDARY) : last;
    return [spelled + tail];
  }

  say(w) {
    try {
      return this._say(w);
    } catch (e) {
      if (e instanceof PyError) return null;
      throw e;
    }
  }

  _say(w) {
    const segs = w.replaceAll('−', '-').match(SEG) || [];
    const toks = [];
    let glue = false;
    let i = 0;
    const glueOn = (part) => {
      if (glue && toks.length) {
        if (!part.length) throw new Error('IndexError in the number reader');
        toks[toks.length - 1] += part[0];
        part = part.slice(1);
      }
      toks.push(...part);
      glue = false;
    };
    while (i < segs.length) {
      const s = segs[i];
      const nxt = i + 1 < segs.length ? segs[i + 1] : '';
      const prev = i ? segs[i - 1] : '';
      if (isdigit(firstCh(s))) {
        let part;
        if (prev === ':' && cps(s).length === 2 && s.startsWith('0')) part = cps(s).map((c) => this.A(c));
        else if (nxt === ':' && isdigit(s)) part = this.integer(s);
        else if (ORD.has(nxt) && !s.includes('.')) { part = this.ordinal(pyBig(s.replaceAll(',', '')), nxt); i += 1; }
        else if (nxt === 's' && !s.includes('.')) {
          part = this.number(s);
          if (part === null) return null;
          part = [...part, this.A('suffix:s')];
          i += 1;
        } else part = this.number(s);
        if (part === null) return null;
        glueOn(part);
      } else if (isalpha(s)) {
        let part;
        if (prev === '-' && cps(s).length > 1) {
          const y = this.word(s);
          part = y === null ? null : [y];
        } else if (cps(s).length > 1 && islower(s) && this.word(s) !== null && (nxt === '-' || !prev)) part = [this.word(s)];
        else if (cps(s).length > 3 && this.word(s) !== null) part = [this.word(s)];
        else if (cps(s).length <= 3 || isupper(s)) part = this.letters(s, !toks.length);
        else part = null;
        if (part === null) return null;
        glueOn(part);
      } else if ((s === "'" || s === '’') && nxt === 's' && toks.length) {
        toks.push(this.A('suffix:s'));
        i += 1;
      } else if (['$', '£', '€'].includes(s) && !toks.length) {
        toks.push(this.A(s));
      } else if (s === '-') {
        const nd = isdigit(firstCh(nxt));
        if (!toks.length && nd) toks.push(this.A('minus'));
        else if (toks.length && nd && isalpha(prev)) toks.push('');
        else if (toks.length && nd) toks.push(this.A('-'));
        else if (toks.length && isalpha(nxt)) glue = true;
        else if (!nxt) { /* a trailing hyphen */ } else return null;
      } else if (['%', '°', '/'].includes(s)) {
        toks.push(this.A(s));
      } else if (s === ':') {
        if (!(cps(nxt).length === 2 && isdigit(nxt))) toks.push(this.A(':'));
      } else if (s === '–') {
        /* nothing */
      } else return null;
      i += 1;
    }
    return toks.length ? this.link(toks) : null;
  }

  link(toks) {
    return toks.map((t, i) => {
      const nxt = i + 1 < toks.length ? toks[i + 1] : '';
      const nb = nxt.replaceAll(PRIMARY, '').replaceAll(SECONDARY, '');
      return t.endsWith('əɹ') && VOWELS.has(firstCh(nb)) ? t + 'ɹ' : t;
    }).join(' ');
  }
}

export { VOWELS };
