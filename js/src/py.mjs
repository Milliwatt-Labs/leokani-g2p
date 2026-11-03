// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// Python string semantics the reference runtime relies on (str.isdigit, str.isupper, int(), round(), dict lookups
// that raise), so the port gives the same output on any text, not only on ASCII.

export class PyError extends Error {}          // ValueError, KeyError, IndexError: "keep the token as written"

// Python's str.isdigit: Unicode decimal digits plus digit-type numerals (superscripts, circled digits, ...).
const DIGIT_CH = /^[\p{Nd}²³¹⁰⁴-⁹₀-₉①-⑨⑴-⑼⒈-⒐⓪⓵-⓽⓿❶-❾➀-➈➊-➒፩-፱᧚\u{10A40}-\u{10A43}\u{1F100}-\u{1F10A}]$/u;
const ALPHA = /^\p{L}+$/u;
const ALNUM_CH = /^[\p{L}\p{N}]$/u;
const UPPER_CH = /^\p{Uppercase}$/u;
const LOWER_CH = /^\p{Lowercase}$/u;
const TITLE_CH = /^\p{Lt}$/u;
// Python's whitespace (str.isspace, re's \s, str.split()): not JavaScript's \s, which has U+FEFF and lacks \x1c-\x1f, \x85.
export const WS = '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const SPACE = new RegExp(`^[${WS}]$`, 'u');
const WS_RUN = new RegExp(`[${WS}]+`, 'gu');
const WS_EDGES = new RegExp(`^[${WS}]+|[${WS}]+$`, 'gu');
const WS_END = new RegExp(`[${WS}]+$`, 'u');
/** str.strip() / str.rstrip() with no arguments. */
export const pyTrim = (s) => s.replace(WS_EDGES, '');
export const pyTrimEnd = (s) => s.replace(WS_END, '');
/** re.sub(r"\s+", " ", s) */
export const foldWs = (s) => s.replace(WS_RUN, ' ');
/** str.splitlines() */
export const splitLines = (s) => { const a = s.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/u); if (a.length && a[a.length - 1] === '') a.pop(); return a; };

export const cps = (s) => Array.from(s);                 // code points (Python indexes strings by code point)
export const plen = (s) => { let n = 0; for (const _ of s) n++; return n; };
export const first = (s) => { const c = s.codePointAt(0); return c === undefined ? '' : String.fromCodePoint(c); };
export const isDigitCh = (c) => DIGIT_CH.test(c);
export const isdigit = (s) => { if (!s) return false; for (const c of s) if (!DIGIT_CH.test(c)) return false; return true; };
export const isalpha = (s) => ALPHA.test(s);
export const isalnumCh = (c) => ALNUM_CH.test(c) || DIGIT_CH.test(c);
export const isalnum = (s) => { if (!s) return false; for (const c of s) if (!isalnumCh(c)) return false; return true; };
export const isascii = (s) => /^[\x00-\x7f]*$/.test(s);
export const anyDigit = (s) => { for (const c of s) if (DIGIT_CH.test(c)) return true; return false; };
export const anyAlpha = (s) => { for (const c of s) if (ALPHA.test(c)) return true; return false; };
export function isupper(s) {
  let cased = false;
  for (const c of s) {
    if (LOWER_CH.test(c) || TITLE_CH.test(c)) return false;
    if (UPPER_CH.test(c)) cased = true;
  }
  return cased;
}
export function islower(s) {
  let cased = false;
  for (const c of s) {
    if (UPPER_CH.test(c) || TITLE_CH.test(c)) return false;
    if (LOWER_CH.test(c)) cased = true;
  }
  return cased;
}
export const isspaceCh = (c) => SPACE.test(c);
export const lower = (s) => s.toLowerCase();
export const upper = (s) => s.toUpperCase();

/** str.split() with no arguments. */
export function splitWs(s) {
  return s.split(WS_RUN).filter((x) => x !== '');
}

/** str.split(sep, 1). */
export function split1(s, sep) {
  const i = s.indexOf(sep);
  return i < 0 ? [s] : [s.slice(0, i), s.slice(i + sep.length)];
}

const inSet = (chars) => { const set = new Set(cps(chars)); return (c) => set.has(c); };
export function lstrip(s, chars) {
  const has = inSet(chars); const a = cps(s); let i = 0;
  while (i < a.length && has(a[i])) i++;
  return a.slice(i).join('');
}
export function rstrip(s, chars) {
  const has = inSet(chars); const a = cps(s); let j = a.length;
  while (j > 0 && has(a[j - 1])) j--;
  return a.slice(0, j).join('');
}
export const strip = (s, chars) => lstrip(rstrip(s, chars), chars);
/** Python's `sub in s` for strings (true for an empty sub). */
export const contains = (s, sub) => s.includes(sub);

/** Python's int() on a str: optional sign and whitespace, Unicode decimal digits, '_' between digits. */
export function pyInt(s) {
  const t = pyTrim(String(s));
  const m = /^([+-]?)(\p{Nd}+(?:_\p{Nd}+)*)$/u.exec(t);
  if (!m) throw new PyError(`invalid literal for int(): ${JSON.stringify(s)}`);
  let n = 0;
  for (const c of m[2]) if (c !== '_') n = n * 10 + digitValue(c);
  return m[1] === '-' ? -n : n;
}
/** The same, as a BigInt (the number reader's huge integers). */
export function pyBig(s) {
  const t = pyTrim(String(s));
  const m = /^([+-]?)(\p{Nd}+(?:_\p{Nd}+)*)$/u.exec(t);
  if (!m) throw new PyError(`invalid literal for int(): ${JSON.stringify(s)}`);
  let ascii = '';
  for (const c of m[2]) if (c !== '_') ascii += String(digitValue(c));
  const n = BigInt(ascii);
  return m[1] === '-' ? -n : n;
}
const ND = /^\p{Nd}$/u;
function digitValue(c) {
  // Every run of decimal digits in Unicode is 0..9 (or several such runs back to back).
  let cp = c.codePointAt(0); let k = 0;
  while (ND.test(String.fromCodePoint(cp - 1))) { cp--; k++; }
  return k % 10;
}

/** Python 3 round() of a float to an int: halves go to the even neighbour. */
export function pyRound(x) {
  const f = Math.floor(x); const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** A dict lookup that raises like Python's d[k]. */
export function get(map, k) {
  const v = map.get(k);
  if (v === undefined) throw new PyError(`KeyError: ${k}`);
  return v;
}
/** list[i] with negative indexes, raising IndexError. */
export function at(list, i) {
  const j = i < 0 ? list.length + i : i;
  if (j < 0 || j >= list.length) throw new PyError('IndexError');
  return list[j];
}
export const D = (o) => new Map(Object.entries(o));
export const S = (a) => new Set(typeof a === 'string' ? a.split(' ') : a);

/** Code point order, as Python sorts strings. */
export function cmpCp(a, b) {
  const x = cps(a); const y = cps(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}

/** unicodedata.category(c) in the given categories. */
const catRe = new Map();
export function cat(c, ...cats) {
  const key = cats.join(',');
  let re = catRe.get(key);
  if (!re) { re = new RegExp(`^[${cats.map((x) => `\\p{${x}}`).join('')}]$`, 'u'); catRe.set(key, re); }
  return re.test(c);
}
