// SPDX-License-Identifier: MIT
// Leokani G2P by Milliwatt Labs (milliwattlabs.com)
// Text normalisation before the lexicon: money, phone numbers, times and dates, emails, URLs, versions, units,
// Roman numerals, abbreviations, a few heteronyms and names. A line-for-line port of the reference runtime's
// Normalizer; plain words pass through untouched.
import {
  PyError, D, S, get, at, cps, plen, first, isdigit, isalpha, isalnumCh, isascii, isupper, islower, lower, upper,
  splitWs, split1, strip, lstrip, rstrip, contains, pyInt, cat, WS,
} from './py.mjs';
import { HG_CLASSES, HG_STOP, HOMOGRAPHS } from './homographs.mjs';

export const PRIMARY = 'ˈ';
export const SECONDARY = 'ˌ';
export const PH = '';          // "word" + PH + phonemes: a word whose base is given

const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = '_ _ twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const ORDINAL_WORDS = D({ one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' });

export function cardinal(n) {
  if (n < 20) return at(ONES, n);
  if (n < 100) return at(TENS, Math.floor(n / 10)) + (n % 10 === 0 ? '' : '-' + at(ONES, n % 10));
  for (const [scale, name] of [[1e9, 'billion'], [1e6, 'million'], [1000, 'thousand'], [100, 'hundred']]) {
    if (n >= scale) {
      const q = Math.floor(n / scale); const r = n % scale;
      return cardinal(q) + ' ' + name + (r === 0 ? '' : ' ' + cardinal(r));
    }
  }
  throw new PyError(String(n));
}

export function ordinal(n) {
  const words = cardinal(n).split(' ');
  const w = words[words.length - 1];
  const k = w.lastIndexOf('-');
  const head = k < 0 ? '' : w.slice(0, k);
  let last = k < 0 ? w : w.slice(k + 1);
  if (ORDINAL_WORDS.has(last)) last = ORDINAL_WORDS.get(last);
  else if (last.endsWith('y')) last = last.slice(0, -1) + 'ieth';
  else last += 'th';
  words[words.length - 1] = (head ? head + '-' : '') + last;
  return words.join(' ');
}

function pluralNumber(n) {
  if (n >= 1000 && n <= 9999 && n % 100 === 0 && n % 1000) return cardinal(Math.floor(n / 100)) + ' hundreds';
  if ((n >= 1100 && n <= 1999) || (n >= 2010 && n <= 2099)) return cardinal(Math.floor(n / 100)) + ' ' + pluralNumber(n % 100);
  const w = cardinal(n);
  return w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's';
}

function yearWords(y) {
  if ((y >= 2000 && y <= 2009) || y < 1000 || y > 2099) return cardinal(y).split(' ');
  const hi = Math.floor(y / 100); const lo = y % 100;
  if (lo === 0) return [cardinal(hi), 'hundred'];
  return [cardinal(hi), ...(lo < 10 ? ['oh', at(ONES, lo)] : [cardinal(lo)])];
}

function pairWords(n) {
  if (n % 1000 === 0) return cardinal(n).split(' ');
  return n >= 1000 && n <= 9999 ? yearWords(n) : cardinal(n).split(' ');
}

function digitWords(s, zero = 'zero') {
  const out = [];
  for (const c of s) if (isdigit(c)) out.push(c === '0' ? zero : at(ONES, pyInt(c)));
  return out;
}

const MONTHS = 'January February March April May June July August September October November December'.split(' ');
const MONTH_ABBR = D({ jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 });
const DAY_ABBR = D({ mon: 'Monday', tue: 'Tuesday', tues: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' });
const DAY_NAMES = new Set(DAY_ABBR.values());
const TITLE_ABBR = D({ ms: 'Miz', prof: 'Professor', mt: 'Mount', ft: 'Fort', sgt: 'Sergeant', capt: 'Captain', lt: 'Lieutenant', gen: 'General', gov: 'Governor', sen: 'Senator', rep: 'Representative', rev: 'Reverend', col: 'Colonel', cpl: 'Corporal', adm: 'Admiral', pres: 'President', supt: 'Superintendent', hon: 'Honorable' });
const STREET_ABBR = D({ st: 'Street', dr: 'Drive', ave: 'Avenue', av: 'Avenue', blvd: 'Boulevard', rd: 'Road', ln: 'Lane', ct: 'Court', pl: 'Place', pkwy: 'Parkway', hwy: 'Highway', sq: 'Square', ter: 'Terrace', cir: 'Circle', jr: 'Junior', sr: 'Senior' });
const STREET_NAMES = new Set(STREET_ABBR.values());
const WORD_ABBR = D({ vs: 'versus', 'e.g': 'for example', approx: 'approximately', apt: 'apartment', dept: 'department', est: 'established', fig: 'figure', vol: 'volume', ch: 'chapter', pp: 'pages', ca: 'circa', cf: 'compare', corp: 'corporation', inc: 'incorporated', ltd: 'limited', govt: 'government', intl: 'international', misc: 'miscellaneous', 'dept.': 'department', yr: 'year', yrs: 'years', mo: 'month', mos: 'months', wk: 'week', wks: 'weeks', hr: 'hour', hrs: 'hours', min: 'minute', mins: 'minutes', sec: 'second', secs: 'seconds', tsp: 'teaspoon', tbsp: 'tablespoon', oz: 'ounce', lb: 'pound', lbs: 'pounds', pt: 'pint', qt: 'quart', gal: 'gallon', in: 'inch', ft: 'foot', yd: 'yard', mi: 'mile' });
const UNITS = D({
  km: ['kilometer', 'kilometers'], cm: ['centimeter', 'centimeters'], mm: ['millimeter', 'millimeters'],
  m: ['meter', 'meters'], kg: ['kilogram', 'kilograms'], g: ['gram', 'grams'], mg: ['milligram', 'milligrams'],
  lb: ['pound', 'pounds'], lbs: ['pound', 'pounds'], oz: ['ounce', 'ounces'], ft: ['foot', 'feet'],
  mi: ['mile', 'miles'], yd: ['yard', 'yards'], yds: ['yard', 'yards'], mph: ['mile per hour', 'miles per hour'],
  kph: ['kilometer per hour', 'kilometers per hour'], 'km/h': ['kilometer per hour', 'kilometers per hour'],
  ml: ['milliliter', 'milliliters'], mL: ['milliliter', 'milliliters'], L: ['liter', 'liters'],
  gal: ['gallon', 'gallons'], qt: ['quart', 'quarts'], tsp: ['teaspoon', 'teaspoons'],
  tbsp: ['tablespoon', 'tablespoons'], Tbsp: ['tablespoon', 'tablespoons'], kWh: ['kilowatt hour', 'kilowatt hours'],
  Wh: ['watt hour', 'watt hours'], W: ['watt', 'watts'], kW: ['kilowatt', 'kilowatts'],
  MW: ['megawatt', 'megawatts'], mW: ['milliwatt', 'milliwatts'], V: ['volt', 'volts'], mV: ['millivolt', 'millivolts'],
  kV: ['kilovolt', 'kilovolts'], mA: ['milliamp', 'milliamps'], mAh: ['milliamp hour', 'milliamp hours'],
  Hz: ['hertz', 'hertz'], kHz: ['kilohertz', 'kilohertz'], MHz: ['megahertz', 'megahertz'],
  GHz: ['gigahertz', 'gigahertz'], KB: ['kilobyte', 'kilobytes'], kB: ['kilobyte', 'kilobytes'],
  MB: ['megabyte', 'megabytes'], GB: ['gigabyte', 'gigabytes'], TB: ['terabyte', 'terabytes'],
  Mbps: ['megabit per second', 'megabits per second'], Gbps: ['gigabit per second', 'gigabits per second'],
  ms: ['millisecond', 'milliseconds'], sec: ['second', 'seconds'], secs: ['second', 'seconds'],
  min: ['minute', 'minutes'], mins: ['minute', 'minutes'], hr: ['hour', 'hours'], hrs: ['hour', 'hours'],
  'µm': ['micrometer', 'micrometers'], 'μm': ['micrometer', 'micrometers'], nm: ['nanometer', 'nanometers'],
  'µs': ['microsecond', 'microseconds'], 'μs': ['microsecond', 'microseconds'],
  ns: ['nanosecond', 'nanoseconds'], 'µg': ['microgram', 'micrograms'], mcg: ['microgram', 'micrograms'],
  'µA': ['microamp', 'microamps'], uA: ['microamp', 'microamps'], dB: ['decibel', 'decibels'],
  rpm: ['R P M', 'R P M'], psi: ['P S I', 'P S I'],
});
const UNIT_GLUED = /^(\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)(km|cm|mm|nm|µm|μm|kg|mg|µg|mcg|lbs?|oz|ft|mi|mph|kph|ml|mL|tsp|tbsp|kWh|Wh|kW|MW|mW|W|mV|kV|V|mAh|mA|µA|Hz|kHz|MHz|GHz|KB|kB|MB|GB|TB|Mbps|Gbps|ms|µs|ns|hrs?|mins?|secs?|dB|rpm|psi)$/u;
const CURRENCY = D({ $: ['dollar', 'dollars', 'cent', 'cents'], '€': ['euro', 'euros', 'cent', 'cents'], '£': ['pound', 'pounds', 'penny', 'pence'], '¥': ['yen', 'yen', '', ''], '₹': ['rupee', 'rupees', '', ''] });
const SCALES = D({ k: 'thousand', K: 'thousand', m: 'million', M: 'million', mm: 'million', b: 'billion', B: 'billion', bn: 'billion', t: 'trillion', T: 'trillion' });
const SCALE_WORDS = S('thousand million billion trillion');
const ATTRIBUTIVE = S('bill bills note notes gift fee fine item items deal coupon voucher check cheque ticket tickets bet card cards bonus credit tip donation minimum purchase order prize reward discount charge surcharge increase raise loan budget bottle meal value pledge deposit fare toll coin coins piece pieces box kit bag plan subscription membership');
const PER_UNIT = D({ month: 'a month', mo: 'a month', year: 'a year', yr: 'a year', week: 'a week', wk: 'a week', day: 'a day', hour: 'an hour', hr: 'an hour', night: 'a night', person: 'a person', head: 'a head', kg: 'a kilo', lb: 'a pound', unit: 'a unit', user: 'a user', seat: 'a seat', share: 'a share', gallon: 'a gallon', mile: 'a mile', minute: 'a minute' });
const VERSION_CUE = S('version v release python node ios ipados macos android java ruby php perl rust go kotlin swift ubuntu debian fedora windows firmware kernel build update chrome firefox safari linux gcc clang llvm cuda numpy torch pytorch django rails react typescript xcode unity blender bluetooth http usb opengl vulkan tls ssl osx watchos tvos visionos gpt llama claude gemini qwen mistral pip npm openssl postgres mysql');
const ACRONYM_WORDS = S('FAQ GIF SIM PIN RAM LAN WAN ZIP CAD DOS ROM HUD TED SAT ASAP NASA NATO SCUBA LASER RADAR AIDS OPEC FEMA UNICEF UNESCO MOMA CERN IKEA JPEG PEG WASP SWAT SARS COVID GUI API ACK NAT VAT CAP MAD BAM POW MIA HAL NOW BRB LOL OMG WOW YES OK TBA PAC SAG CON PRO MAX MIN DEV OPS LIT MET SAC VAC MAG GEN');
const SHORTHAND = D({ imo: 'in my opinion', imho: 'in my humble opinion', eod: 'end of day', btw: 'by the way', tbd: 'to be determined', tba: 'to be announced', pls: 'please', plz: 'please', thx: 'thanks', pw: 'password', re: 'regarding', dept: 'department', pts: 'points', approx: 'approximately' });
const SHORTHAND_CASED = D({ IMO: 'in my opinion', IMHO: 'in my humble opinion', EOD: 'end of day', BTW: 'by the way', TBD: 'to be determined', TBA: 'to be announced', OT: 'overtime', TDs: 'touchdowns', INTs: 'interceptions' });
const ZONES = D({ ET: 'Eastern Time', PT: 'Pacific Time', CT: 'Central Time', MT: 'Mountain Time', HST: 'Hawaii time', UTC: 'U T C', GMT: 'G M T' });
const LETTER_CUE = S('series class type plan grade vitamin group section exhibit appendix option model building terminal gate row level platform tier phase zone block wing unit part item list team side track lot concourse');
const NUMBER_WORDS = S('two three four five six seven eight nine ten eleven twelve twenty dozen hundred');
const MINUTE_NOUNS = S('crack cracks hole holes scratch scratches fragment fragments detail details speck specks dose doses crystal crystals grain grains particle particles trace traces amount amounts fraction difference differences change changes flaw flaws quantity quantities tear leak bubble bubbles');
const DIRECTIONS = D({ n: 'North', s: 'South', e: 'East', w: 'West', ne: 'Northeast', nw: 'Northwest', se: 'Southeast', sw: 'Southwest' });
const STREET_WORDS = S('st street ave avenue blvd boulevard rd road dr drive ln lane way ct court pl place pkwy parkway hwy highway ter terrace cir circle sq square trl trail loop row box');
const STATES = D({ AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'D C' });
const TLDS = S('com org net edu gov io ai co uk us dev app info me tv ly gg xyz biz ca de fr jp au in nz ie es it nl ch se no fi be at mil int eu fm am so sh to cc tech site online store blog news page cloud health art design studio games live chat email global today world');
const TLD_SAY = new Set('com org net gov co info app dev me blog news tech site online store page cloud health art design studio games live chat email global today world biz mil'.split(' '));
const SEP_WORDS = D({ '.': 'dot', _: 'underscore', '-': 'dash', '+': 'plus', '/': 'slash', '~': 'tilde', '=': 'equals', '?': 'question mark', '&': 'and', '#': 'hash', ':': 'colon', '%': 'percent' });
const REGNAL = S('henry elizabeth louis george edward charles james william john richard paul pius benedict leo gregory innocent clement alexander napoleon philip frederick ferdinand peter catherine mary anne juan carlos felipe ramses constantine otto ludwig gustav christian olaf harald haakon nicholas ivan francis henri albert pedro sebastian martin urban boniface sixtus julius adrian hadrian rama victor umberto alfonso sancho baldwin david malcolm robert stephen kamehameha wilhelm leopold rudolf joseph willem carl frederik margrethe dmitry');
const ROMAN_CUE = S('war chapter part volume vol act book phase type class level section article title grade stage episode season bowl apollo gemini mark mk series round tier category schedule appendix unit rule step psalm canto scene game olympiad vatican council amendment division corps fleet army clause paragraph tome symphony lesson module track mission operation');
const ROMAN_AMBIGUOUS = S('IV XL LV LX XX XXX VL IL LI MIX DIV CIV VI XI IX CI CL CV DC CD MD MC MCC LXX XXL XXXL');
const ROMAN = /^(?=[IVXLCDM])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
export const SAY_AS = D({
  haumea: 'hWmˈAə', leokani: 'lˌAOkˈɑni', mahalo: 'məhˈɑlO', kamehameha: 'kəmˌAəmˈAhə',
  waikiki: 'wˌIkɪkˈi', kauai: 'kəwˈI', kolea: 'kOlˈAə', mauna: 'mˈWnə', kea: 'kˈAə',
  molokai: 'mˌOlOkˈI', lanai: 'lənˈI', hilo: 'hˈilO', pele: 'pˈɛlA', kahului: 'kˌɑhulˈui',
  wahine: 'wɑhˈinA', nguyen: 'wˈɪn', joaquin: 'wɑkˈin', nietzsche: 'nˈiʧə', ballets: 'bælˈAz',
  milliwatt: 'mˈɪlɪwˌɑt', xochitl: 'sˈOʧil', oaxaca: 'wəhˈɑkə', lanikai: 'lˌɑnikˈI',
  niamh: 'nˈiv', saoirse: 'sˈɪɹʃə', przybylski: 'ʃəbˈɪlski', keanu: 'kAˈɑnu', versailles: 'vəɹsˈI',
  'haagen-dazs': 'hˈɑɡən dˈɑz', nescafe: 'nˈɛskəfˌA', moet: 'mOˈɛt', huawei: 'wˈɑwA',
  aoife: 'ˈifə', quinoa: 'kˈinwɑ', sriracha: 'sɹˈiɹɑʧə', gnocchi: 'nˈjɑki',
  xavier: 'zˈAviəɹ', haleakala: 'hˌɑlAˌɑkəlˈɑ', kalapana: 'kˌɑləpˈɑnə', ngozi: 'əŋɡˈOzi',
  okonkwo: 'OkˈɔŋkwO', waimea: 'wˌImˈAə', briain: 'bɹˈiən',
  hermes: 'ɛɹmˈɛz', nike: 'nˈIki', adidas: 'ədˈidəs', hyundai: 'hˈʌndA', ioniq: 'Iˈɑnɪk',
  xiaomi: 'ʃˈWmi', lebron: 'ləbɹˈɑn', porsche: 'pˈɔɹʃə',
});
const SAY_AS_CASED = D({
  LaTeX: 'lˈAtɛk', iOS: 'ˌIˌOˈɛs', macOS: 'mˌækˌOˈɛs', watchOS: 'wˌɑʧˌOˈɛs',
  tvOS: 'tˌivˌiˌOˈɛs', iPadOS: 'ˈIpˌædˌOˈɛs', 'Wi-Fi': 'wˈIfˌI', WiFi: 'wˈIfˌI',
  SQL: 'sˈikwᵊl', RAM: 'ɹˈæm', ETA: 'ˌiˌtiˈA', YoY: 'jˈɪɹ ˌOvəɹ jˈɪɹ', IKEA: 'Ikˈiə', MacBook: 'mˈækbʊk',
  FEMA: 'fˈimə', ZIP: 'zˈɪp', eSIM: 'ˈi sˈɪm', eSIMs: 'ˈi sˈɪmz',
});
// ---- letters and codes (v1.2)
// capitals respelled as words ("IEEE" -> I triple E); the respelling goes through the normaliser again
const CASED_SAY = D({ IEEE: 'I triple E', WWI: 'World War one', WWII: 'World War two', WW1: 'World War one', WW2: 'World War two', PhD: 'P H D', PhDs: 'P H Ds', 'ZIP+4': 'zip plus four', 'A-OK': 'A O K', AAA: 'triple A', NAACP: 'N double A C P', NCAA: 'N C double A' });
// a digit run after one of these is a code said digit by digit ("tracking number 9400111899", "code 482913")
const CODE_CUE = S('number code pin passcode otp account tracking order confirmation reference ref serial invoice ticket sn policy member membership case claim booking voucher pnr id acct routing transaction receipt badge verification security access promo coupon shipment parcel package #');
const CODE_CUE_CARD = new Set([...CODE_CUE, 'card', 'phone']);
// an all-caps word the letter-to-sound model doesn't know is said as a word only if English could spell it:
// a legal onset, vowels, consonant clusters that split into a legal coda and onset, a legal coda
const ONSETS = new Set([...'b c d f g h j k l m n p q r s t v w x y z bl br ch cl cr dr dw fl fr gl gn gr kl kn kr ph pl pr ps qu sc sch scr sh shr sk sl sm sn sp spl spr squ st str sw th thr tr tw wh wr chr phr sph tw'.split(' '), '']);
const CODAS = new Set([...'b c d f g k l m n p r s t v x z ck ct ft ld lf lk lm lp lt mb mp nd ng nk ns nt nch rb rc rd rf rg rk rl rm rn rp rs rt sh sk sp st th tch ts ds ks ps ch ght gh ll ss ff zz rth rst nds nts mps rks lls ch rch lch nce rse lse wn wl wk ws wd y w h'.split(' '), '']);
// words that start a sentence after a single letter and a full stop ("Plan A. Then we ..."), not a name after an initial
const SENTENCE_START = S('the then we i it he she they this that a an and but so now there you my our in on at if when after before what why how next first finally also please');
// letters said in the plural: the sibilant letters take "-es"
const LETTER_PLURAL_ES = new Set('sxhz');
const LETTER_PLURAL_S = new Set('f');
const SIBILANT_END = new Set('szʃʒʧʤ');
const VOICELESS_END = new Set('ptkfθ');
const ERA = S('A.D AD B.C BC CE BCE B.C.E');
const capitalize = (s) => (s ? upper(first(s)) + lower(s.slice(first(s).length)) : '');
const lastCp = (s) => { const a = cps(s); return a.length ? a[a.length - 1] : ''; };

/** Could an English reader say this all-letter run as a word ("BLORB" yes, "AGC" or "QRT" no)? */
export function pronounceable(w) {
  w = lower(w);
  if (!isascii(w) || !isalpha(w)) return false;
  if (w.length <= 3) return /^[bcdfghjklmnpqrstvwxz]?[aeiou][bcdfgklmnprstvxz]?$/.test(w);   // one closed syllable ("HUD")
  // vowel groups; a "y" before a vowel or at the start is a consonant
  const groups = w.match(/[aeiou]+|(?<=[^aeiou])y(?![aeiou])|[^aeiou]/g) || [];
  const vowel = (x) => 'aeiou'.includes(x[0]) || x === 'y';
  const merged = [];
  for (const x of groups) {
    if (merged.length && !vowel(x) && !vowel(merged[merged.length - 1])) merged[merged.length - 1] += x;
    else merged.push(x);
  }
  const vows = merged.filter(vowel);
  if (!vows.length || vows.some((v) => v.length > 2)) return false;
  for (let k = 0; k < merged.length; k++) {
    const x = merged[k];
    if (vowel(x)) continue;
    if (k === 0) { if (!ONSETS.has(x)) return false; }
    else if (k === merged.length - 1) { if (!CODAS.has(x)) return false; }
    else {
      let split = false;
      for (let j = 0; j <= x.length; j++) if (CODAS.has(x.slice(0, j)) && ONSETS.has(x.slice(j))) { split = true; break; }
      if (!split || x.length > 4) return false;
    }
  }
  return true;
}

// ---- homographs (v1.2): HOMOGRAPHS (homographs.mjs), the first rule whose tests all hold says the word. A test is
// FIELD OP VALUES: FIELD p1 p2 p3 (the words before, "^" past the clause start), n1 n2 n3 (after, "$" past its end),
// P / N (any of p1-p3 / n1-n3); OP "=" (one of), "!=" (none of), "~" (ends with one of), "!~" (ends with none of);
// VALUES "|"-separated words, "@NAME" a HG_CLASSES set. "cap": the word is capitalised and not clause-initial.
function hgSet(v) {
  const out = new Set();
  for (const x of v.split('|')) {
    if (x.startsWith('@')) for (const w of get(HG_CLASSES, x.slice(1)).split(' ')) out.add(w);
    else out.add(x);
  }
  return out;
}
const HG_SETS = new Map();
const HG_OPS = ['!=', '!~', '=', '~'];

export function hgTest(t, prev, nxt, cap) {
  if (t === 'cap') return cap;
  if (t === '!cap') return !cap;
  let op; let k;
  for (op of HG_OPS) { k = t.indexOf(op); if (k > 0) break; }
  const field = t.slice(0, k); const vals = t.slice(k + op.length);
  let ws;
  if (field === 'P' || field === 'N') {
    const seq = field === 'P' ? prev : nxt;
    ws = seq.filter((w) => w !== '^' && w !== '$');
    if (!ws.length) ws = [at(seq, -1)];
  } else {
    const seq = field[0] === 'p' ? prev : nxt;
    const n = pyInt(field[1]) - 1;
    ws = [n < seq.length ? seq[n] : at(seq, -1)];
  }
  if (op === '~' || op === '!~') {
    const ends = vals.split('|');
    const hit = ws.some((w) => w !== '^' && w !== '$' && ends.some((e) => w.endsWith(e)));
    return op === '~' ? hit : !hit;
  }
  let s = HG_SETS.get(vals);
  if (s === undefined) { s = hgSet(vals); HG_SETS.set(vals, s); }
  const hit = ws.some((w) => s.has(w));
  return op === '!=' ? !hit : hit;
}
const BIT_UNITS = D({ Mb: ['megabit', 'megabits'], Gb: ['gigabit', 'gigabits'], kb: ['kilobit', 'kilobits'] });

const VERB_BEFORE = new Set(["to", "will", "would", "can", "could", "should", "must", "may", "might", "please", "we", "i", "eye", "they", "you", "don't", "didn't", "won't", "let's", "i'll", "we'll", "they'll", "you'll", "always", "never", "often", "also", "still", "just", "do", "did", "people", "who"]);
const ADJ_FORMS = D({ minute: 'mInˈut', content: 'kəntˈɛnt' });
const VERB_FORMS = D({ present: 'pɹɪzˈɛnt', convict: 'kənvˈɪkt', subject: 'səbʤˈɛkt', insult: 'ɪnsˈʌlt', decrease: 'dᵻkɹˈis', live: 'lˈɪv' });
const SUBJECTS = S('he she it they we i eye you who');
const OBJECTS = S('the a an your my our his her their its it this that these those them him me us up down all everything off out');
const OPEN = '"\'“‘([{«';
const CLOSE = '"\'”’)]}»,.!?;:…';

const VULGAR = D({ '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' });
const VULGAR_WORDS = D({ '½': 'a half', '¼': 'a quarter', '¾': 'three quarters', '⅓': 'a third', '⅔': 'two thirds', '⅛': 'an eighth', '⅜': 'three eighths', '⅝': 'five eighths', '⅞': 'seven eighths' });
const VULGAR_CHARS = [...VULGAR.keys()].join('');
const MIXED_RE = new RegExp(`(\\p{Nd})[${WS}]*([${VULGAR_CHARS}])`, 'gu');
const VULGAR_RE = new RegExp(`[${VULGAR_CHARS}]`, 'gu');
const W = '\\p{L}\\p{N}_';
const NAMED_RANGE = new RegExp(`(?<=[${W}])([–—])(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*(?![${W}]))`, 'gu');

const TIME = /^(\p{Nd}{1,2}):(\p{Nd}{2})(?::(\p{Nd}{2}))?(?:([ap])\.?m\.?)?$/iu;
const TIME_AMPM = /^(\p{Nd}{1,2})([ap])\.?m\.?$/iu;
const EMAIL = /^([A-Za-z0-9][A-Za-z0-9._%+-]*)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/u;
const URL_RE = new RegExp(`^(?:(https?|ftp)://)?((?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,})(/[^${WS}]*)?$`, 'iu');
const MONEY = /^(-?)([$€£¥₹])(\p{Nd}[\p{Nd},]*)?(\.\p{Nd}+)?(k|K|m|M|mm|b|B|bn|t|T)?$/u;
const CENTS = /^(\p{Nd}+)¢$/u;
const PHONE = /^(?:(\+?1)[-. ])?\(?(\p{Nd}{3})\)?[-.](\p{Nd}{3})[-.](\p{Nd}{4})$/u;
const PHONE7 = /^(\p{Nd}{3})-(\p{Nd}{4})$/u;
const TOLLWORD = /^1-(\p{Nd}{3})-([A-Za-z]{3,})$/u;
const IPV4 = /^\p{Nd}{1,3}(?:\.\p{Nd}{1,3}){3}$/u;
const VERSION = /^([vV])?(\p{Nd}+(?:\.\p{Nd}+)+)([-+][A-Za-z0-9.]+)?$/u;
const VERSION_DASH = /^(\p{Nd}+(?:\.\p{Nd}+){2,})((?:-[A-Za-z0-9.]+){2,})$/u;
const DECADE = /^['’]?(\p{Nd}{2}|\p{Nd}{4})s$/u;
const DATE_MDY = /^(\p{Nd}{1,2})\/(\p{Nd}{1,2})\/(\p{Nd}{2}|\p{Nd}{4})$/u;
const DATE_ISO = /^(\p{Nd}{4})-(\p{Nd}{2})-(\p{Nd}{2})$/u;
const FRACTION = /^(\p{Nd}{1,3})\/(\p{Nd}{1,3})$/u;
const RANGE = /^(\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)[-–](\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)$/u;
const TIMES_X = /^(\p{Nd}+)[x×](\p{Nd}+)$/u;
const MULT = /^(\p{Nd}+(?:\.\p{Nd}+)?)[x×]$/u;
const RATIO = /^(\p{Nd}{1,2}):(\p{Nd})$/u;
const DIGITS = /^\p{Nd}{13,}$/u;
const LEADING_POINT = /^\.(\p{Nd}+)$/u;
const DEGREES = /^(-?\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)°([CF])?$/u;

const NUM = /^-?\p{Nd}[\p{Nd},]*(\.\p{Nd}+)?$/u;
const isNum = (x) => NUM.test(x);
const ORD_NUM = /^\p{Nd}+(st|nd|rd|th)$/u;
const re = (r, s) => r.exec(s);                  // re.match for an anchored pattern: the match or null
const g = (m, k) => (m[k] === undefined ? null : m[k]);   // m.group(k): None when the group didn't take part
const startsUpper = (s) => isupper(first(s));
const startsLower = (s) => islower(first(s));
const startsDigit = (s) => isdigit(first(s));
const lastChar = (s) => (s ? s[s.length - 1] : '');

export function romanValue(s) {
  const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let k = 0; k < s.length; k++) {
    const v = vals[s[k]];
    if (v === undefined) throw new PyError('KeyError');
    total += k + 1 < s.length && vals[s[k + 1]] > v ? -v : v;
  }
  return total;
}

/** Hawaiian spelling folded for lookup: no ʻokina, no kahakō (macrons). */
export function stripOkina(w) {
  w = w.replace(new RegExp(`(?<=[${W}])[ʻ‘'’](?=[${W}])`, 'gu'), '');
  let out = '';
  for (const c of w.normalize('NFD')) if (!cat(c, 'Mn')) out += c;
  return out;
}

function isEmoji(w) {
  if (!w) return false;
  let any = false;
  for (const c of w) {
    const o = c.codePointAt(0);
    if (!(cat(c, 'So', 'Sk', 'Cf', 'Mn') || (o >= 0x1F000 && o <= 0x1FAFF) || c === '️' || c === '‍')) return false;
    if ((o >= 0x1F000 && o <= 0x1FAFF) || (o >= 0x2600 && o <= 0x27BF)) any = true;
  }
  return any;
}

const bare = (x) => x.replaceAll(PRIMARY, '').replaceAll(SECONDARY, '').replaceAll(' ', '');

export class Normalizer {
  /** opts: known(w), letters (Map letter -> phonemes), cased(w), common(w), reading(w) -> [forms]. */
  constructor({ known, letters, cased, common, reading } = {}) {
    this.reading = reading || (() => []);
    this.cased = cased || (() => false);
    this.common = common || (() => false);
    const lexicon = known || (() => false);
    this.known = (w) => SAY_AS.has(w) || lexicon(w);
    this.letters = letters || new Map();
    this.user = null;                 // custom pronunciations (UserLexicon), checked before any rule
    this.userOn = true;
  }

  spelled(w) {
    const forms = this.reading(w);
    let letters = '';
    for (const c of w) letters += bare(this.letters.get(c) ?? '?');
    return !forms.length || forms.some((f) => bare(f) === letters);
  }

  letter(c) {
    const ph = this.letters.get(lower(c));
    return ph ? `${upper(c)}${PH}${ph}` : upper(c);
  }

  spell(s) {
    const out = [];
    for (const c of s) if (isalnumCh(c) && isascii(c)) out.push(isalpha(c) ? this.letter(c) : at(ONES, pyInt(c)));
    return out;
  }

  segment(run) {
    const low = lower(run);
    const n = low.length;
    const best = new Array(n + 1).fill(null);
    best[0] = [];
    for (let i = 1; i <= n; i++) {
      for (let j = Math.max(0, i - 20); j < i; j++) {
        const w = low.slice(j, i);
        if (best[j] === null || !(w.length >= 3 || (j === 0 && w.length === 1 && i < n))) continue;
        if (w.length > 1 && !this.known(w)) continue;
        const cand = [...best[j], w];
        if (best[i] === null || cand.length < best[i].length) best[i] = cand;
      }
    }
    const out = best[n];
    return out && out.length > 1 ? out : null;
  }

  sayRun(run) {
    const out = [];
    for (const m of run.matchAll(/[A-Za-z]+|\p{Nd}+/gu)) {
      const t = m[0];
      if (isdigit(t)) out.push(...digitWords(t));
      else if (this.known(lower(t))) out.push(Normalizer.word(lower(t)));
      else if (this.segment(t)) out.push(...this.segment(t).map((w) => (w.length === 1 ? this.letter(w) : Normalizer.word(w))));
      else if (t.length > 3 && /[aeiouy]/.test(lower(t))) out.push(lower(t));
      else out.push(...this.spell(t));
    }
    return out;
  }

  static word(w) {
    return SAY_AS.has(w) ? w + PH + SAY_AS.get(w) : w;
  }

  sayParts(s) {
    const out = [];
    for (const part of s.split(/([._+\-/~=?&#:%])/u)) {
      if (!part) continue;
      if (SEP_WORDS.has(part)) out.push(SEP_WORDS.get(part));
      else out.push(...this.sayRun(part));
    }
    return out;
  }

  domain(d) {
    const labels = d.split('.');
    const out = [];
    labels.forEach((lab, i) => {
      if (i) out.push('dot');
      const low = lower(lab);
      if (i === labels.length - 1 && TLDS.has(low)) out.push(...(TLD_SAY.has(low) ? [low] : this.spell(low)));
      else if (low === 'www') out.push(...this.spell('www'));
      else out.push(...this.sayParts(lab));
    });
    return out;
  }

  money(sign, cur, whole, frac, scale, nextScale) {
    const [one, many, cent, cents] = get(CURRENCY, cur);
    const out = sign ? ['minus'] : [];
    whole = whole || '0';
    const wd = whole.replaceAll(',', '');
    const n = wd ? pyInt(wd) : 0;
    const sc = SCALES.get(scale || '') || nextScale;
    if (sc) return [...out, whole + (frac || ''), sc, many];
    if (frac && plen(frac) === 3 && cents) {
      const c = pyInt(frac.slice(1));
      if (n === 0 && c) return [...out, String(c), c === 1 ? cent : cents];
      if (c === 0) return [...out, whole, n === 1 ? one : many];
      if (cur === '£') return [...out, whole, n === 1 ? one : many, String(c)];
      return [...out, whole, n === 1 ? one : many, 'and', String(c), c === 1 ? cent : cents];
    }
    if (frac) return [...out, whole + frac, many];
    return [...out, whole, n === 1 && cur !== '¥' ? one : many];
  }

  phone(groups, pauses, plus = false) {
    const out = plus ? ['plus'] : [];
    groups.forEach((gr, i) => {
      let w = isdigit(gr) ? digitWords(gr) : [lower(gr)];
      if (gr === '800' && i === 1 && groups[0] === '1') w = ['eight', 'hundred'];
      if (pauses && i < groups.length - 1) {
        if (!w.length) throw new PyError('IndexError');
        w[w.length - 1] += ',';
      }
      out.push(...w);
    });
    return out;
  }

  time(h, m, s, ampm) {
    const hh = pyInt(h); const mm = pyInt(m);
    if (hh > 24 || mm > 59) return null;
    if (s !== null && s !== undefined) {
      const ss = pyInt(s);
      if (ss > 59) return null;
      const out = [String(hh), ...(mm > 0 && mm < 10 ? ['oh', String(mm)] : mm ? [m] : ['hundred'])];
      return [...out, ...(ss > 0 && ss < 10 ? ['oh', String(ss)] : ss ? [s] : ['hundred'])];
    }
    const out = [String(hh)];
    if (mm === 0) out.push(...(hh >= 13 || (h.startsWith('0') && !ampm) ? ['hundred'] : []));
    else if (mm < 10) out.push('oh', String(mm));
    else out.push(m);
    if (ampm) out.push(this.letter(ampm), 'M');
    return out;
  }

  static fraction(n, d) {
    let one; let many;
    if (d === 2) [one, many] = ['half', 'halves'];
    else if (d === 4) [one, many] = ['quarter', 'quarters'];
    else if ([3, 5, 6, 7, 8, 9, 10, 12, 16, 32, 64, 100].includes(d)) { one = ordinal(d); many = one + 's'; }
    else return null;
    if (!(n > 0 && n < d)) return null;
    return [cardinal(n), n === 1 ? one : many];
  }

  /** A line as a person reads it. pauses=false (inside a piece) leaves out phone-number commas. */
  normalize(text, pauses = true) {
    text = text.replaceAll('‑', '-').replaceAll('‐', '-');
    text = text.replace(MIXED_RE, (_, d, v) => d + ' ' + VULGAR.get(v) + ' ');
    text = text.replace(VULGAR_RE, (v) => ' ' + VULGAR_WORDS.get(v) + ' ');
    text = text.replace(NAMED_RANGE, ' $1 ');
    const toks = splitWs(text);
    const out = [];
    let i = 0;
    while (i < toks.length) {
      const [words, used] = this.token(toks, i, pauses);
      out.push(...words);
      i += used;
    }
    return out.join(' ');
  }

  static split(t) {
    let a = 0;
    while (a < t.length && OPEN.includes(t[a]) && !/^['’]\p{Nd}0s/u.test(t.slice(a))) a++;
    let b = t.length;
    while (b > a && CLOSE.includes(t[b - 1])) b--;
    return [t.slice(0, a), t.slice(a, b), t.slice(b)];
  }

  token(toks, i, pauses) {
    const t = toks[i];
    if (t.includes(PH)) return [[t], 1];
    const [lead, core, trail0] = Normalizer.split(t);
    const user = this.user && this.userOn && core ? this.user.rewrite(core) : null;
    if (user) {                                       // a custom pronunciation, before any rule
      let words;
      if (user.kind === 'phonemes') words = [core + PH + user.value];
      else {
        this.userOn = false;                          // a respelling's words are not looked up again
        try { words = this.normalize(user.value, pauses).split(' ').filter((w) => w); } finally { this.userOn = true; }
      }
      return Normalizer.finish(words, 1, lead, core, trail0);
    }
    const prev = i ? Normalizer.split(toks[i - 1])[1] : '';
    const prevEnd = i === 0 || '.!?:;'.includes(lastChar(toks[i - 1]));
    const prev2 = i > 1 ? lower(Normalizer.split(toks[i - 2])[1]) : '';
    const nxtRaw = i + 1 < toks.length ? toks[i + 1] : '';
    const nxt = Normalizer.split(nxtRaw)[1];
    let res;
    try {
      res = this.rewrite(core, trail0, prev, prev2, prevEnd, nxt, nxtRaw, toks, i, pauses);
    } catch (e) {
      if (!(e instanceof PyError || e instanceof RangeError || e instanceof TypeError)) throw e;
      res = null;                                    // never fail a line: keep the token as written
    }
    if (!res) return [[t], 1];
    const [words, used, trail] = res;
    return Normalizer.finish(words, used, lead, core, trail);
  }

  static finish(words, used, lead, core, trail) {
    if (lead.includes('(') && !trail.includes(')') && (used > 1 || core.includes(')'))) lead = lead.replaceAll('(', '');
    if (!words || !words.length) {
      return [strip(trail, '"\'”’)]}»') ? [strip(lead, '"\'“‘([{«') + trail] : [], used];
    }
    const outW = [];
    for (const w of words) {
      if (!w.includes(PH) || !w.includes(' ')) { outW.push(w); continue; }
      const head = w.split(PH)[0];
      for (const p of split1(w, PH)[1].split(' ')) outW.push(head + PH + p);
    }
    outW[0] = lead + outW[0];
    outW[outW.length - 1] = outW[outW.length - 1] + trail;
    return [outW, used];
  }

  rewrite(core, trail, prev, prev2, prevEnd, nxt, nxtRaw, toks, i, pauses) {
    if (!core) return null;
    for (const rules of [this.lettersFirst, this.more2, this.more, this.more3]) {
      const res = rules.call(this, core, trail, prev, prev2, nxt, nxtRaw, toks, i, pauses);
      if (res) return res;
    }
    const res = this.basic(core, trail, prev, prev2, prevEnd, nxt, nxtRaw, toks, i, pauses);
    return res || this.capitals(core, trail, prev, nxt, toks, i);
  }

  sub(text, pauses) {
    return this.normalize(text, pauses).split(' ');
  }

  more(core, trail, prev, prev2, nxt, nxtRaw, toks, i, pauses) {
    const low = lower(core); const pl = lower(prev); const nl = lower(nxt);
    let m;
    // a range or compound written with a dash: "3pm-5pm", "$5M-$7M", "10am–noon", "3-for-$10"
    if (/[–—-]/u.test(core) && /\p{Nd}/u.test(core) && !PHONE.test(core) && !TOLLWORD.test(core)
        && !/^[\p{Nd},.]+([–-][\p{Nd},.]+)+$/u.test(core) && !DATE_ISO.test(core) && !VERSION_DASH.test(core)
        && !/^\p{Nd}{1,2}:\p{Nd}{2}[-–]\p{Nd}{1,2}:\p{Nd}{2}$/u.test(core)) {
      const parts = core.split(/[–—-]/u);
      const timey = (p) => TIME.test(p) || TIME_AMPM.test(p) || ['noon', 'midnight'].includes(lower(p));
      const money = (p) => MONEY.test(p);
      if (parts.length === 2 && parts.every((p) => p) && (parts.every(timey) || parts.every(money))) {
        let a = this.sub(parts[0], pauses); const b = this.sub(parts[1], pauses);
        if (money(parts[0]) && a[a.length - 1] === b[b.length - 1]) a = a.slice(0, -1);
        return [[...a, 'to', ...b], 1, trail];
      }
      if (parts.every((p) => p) && parts.some((p) => money(p) || TIME_AMPM.test(p))) {
        const out = [];
        for (const p of parts) out.push(...this.sub(p, pauses));
        return [out, 1, trail];
      }
    }
    // money per unit: "£2,450/month", "$12/hr"
    m = re(/^([$€£¥₹][\p{Nd},.]+[kKmMbB]?)\/([A-Za-z]+)$/u, core);
    if (m && PER_UNIT.has(lower(m[2]))) return [[...this.sub(m[1], pauses), ...PER_UNIT.get(lower(m[2])).split(' ')], 1, trail];
    // money said as a modifier: "a $100 gift card", "£5 notes"
    m = re(MONEY, core);
    if (m && g(m, 3) && !g(m, 4) && !g(m, 5) && ATTRIBUTIVE.has(nl)) return [[...(m[1] ? ['minus'] : []), m[3], get(CURRENCY, m[2])[0]], 1, trail];
    // phone pieces: "(212)555-0100", extensions, star codes, pound
    m = re(/^\(?(\p{Nd}{3})\)(\p{Nd}{3})-(\p{Nd}{4})$/u, core);
    if (m) return [this.phone([m[1], m[2], m[3]], pauses), 1, trail];
    m = re(/^(?:x|ext\.?)(\p{Nd}{1,5})$/iu, core);
    if (m) { const d = m[1]; return [['extension', ...(plen(d) > 2 ? digitWords(d) : [d])], 1, trail]; }
    if (low === 'ext' && trail.startsWith('.') && startsDigit(nxt)) return [['extension'], 1, trail.slice(1)];
    m = re(/^\*(\p{Nd}{1,4})#?$/u, core);
    if (m) return [['star', ...digitWords(m[1]), ...(core.endsWith('#') ? ['pound'] : [])], 1, trail];
    if (core === '#' && (['press', 'then', 'hit', 'dial', 'enter', 'and', 'or'].includes(pl) || !nxt)) return [['pound'], 1, trail];
    if (core === '*' && !(isNum(prev) && isNum(nxt))) return [['star'], 1, trail];
    // military time: "0800 hours"
    if (/^[0-2]\p{Nd}[0-5]\p{Nd}$/u.test(core) && ['hours', 'hrs', 'hr', 'h'].includes(nl)) {
      const a = cps(core);
      const h = pyInt(a.slice(0, 2).join('')); const mm = pyInt(a.slice(2).join(''));
      return [[...(a[0] === '0' ? ['oh'] : []), cardinal(h), ...(mm === 0 ? ['hundred'] : mm < 10 ? ['oh', at(ONES, mm)] : [cardinal(mm)])], 1, trail];
    }
    // web: "localhost:8080/v1/chat", "ftp://files.example.net"
    m = re(new RegExp(`^(?:https?://)?(localhost|(?:[${W}-]+\\.)+[a-z]{2,}|\\p{Nd}{1,3}(?:\\.\\p{Nd}{1,3}){3}):(\\p{Nd}{2,5})(/[^${WS}]*)?$`, 'u'), core);
    if (m) {
      const host = m[1]; const port = m[2]; const pc = cps(port);
      const words = IPV4.test(host) ? this.ip(host) : host === 'localhost' ? ['local', 'host'] : this.domain(host);
      const tail3 = pc.slice(1).join('');
      words.push('colon', ...(pc.length === 4 && tail3 !== '000' && pyInt(port) < 2100 ? pairWords(pyInt(port))
        : pc.length === 4 && pc[2] !== '0' && tail3 !== '000' ? [pc.slice(0, 2).join(''), pc.slice(2).join('')]
          : [port]));
      for (const seg of (g(m, 3) || '').split('/').slice(1)) words.push('slash', ...(seg ? this.sayParts(seg) : []));
      return [words, 1, trail];
    }
    if (low.startsWith('ftp://') && plen(core) > 6) return [[...this.spell('FTP'), 'colon', 'slash', 'slash', ...this.sub(core.slice(6), pauses)], 1, trail];
    // versions: "Python 3.12", "1.10", "v20.x", "6.8.0-45-generic", build "23A344"
    m = re(/^([vV])?(\p{Nd}+)\.(\p{Nd}{2,3}|x)$/u, core);
    if (m && (VERSION_CUE.has(pl) || g(m, 1) || m[3] === 'x'
        || (m[3].endsWith('0') && !m[3].startsWith('0') && !UNITS.has(nl)
          && !isNum(prev) && !['is', 'of', 'at', 'was', 'by', 'about', 'gpa', 'score'].includes(pl)))) {
      const minor = m[3] === 'x' ? [this.letter('x')] : [m[3]];
      return [[...(g(m, 1) ? ['version'] : []), m[2], 'point', ...minor], 1, trail];
    }
    m = re(VERSION_DASH, core);
    if (m) {
      const words = [];
      m[1].split('.').forEach((x, k) => words.push(...(k ? ['point'] : []), x));
      for (const part of m[2].split('-').slice(1)) words.push('dash', ...(part ? this.sub(part, pauses) : []));
      return [words, 1, trail];
    }
    if (/^\p{Nd}+[A-Z]+\p{Nd}+[A-Z0-9]*$/u.test(core) && plen(core) >= 4) {
      const words = [];
      for (const x of core.match(/\p{Nd}+|[A-Z]+/gu)) words.push(...(isdigit(x) ? (plen(x) <= 2 ? [x] : digitWords(x)) : this.spell(x)));
      return [words, 1, trail];
    }
    // hex strings: say every character
    if (plen(core) >= 8 && /^[0-9a-fA-F]+$/.test(core) && /\p{Nd}/u.test(core) && /[a-fA-F]/.test(core)) return [this.spell(core), 1, trail];
    // digit groups in a run (card, account and IBAN numbers): digit by digit
    if (/^\p{Nd}{2,4}$/u.test(core)) {
      const near = toks.slice(Math.max(0, i - 2), i + 3).map((x) => Normalizer.split(x)[1]);
      if (near.filter((x) => /^(\p{Nd}{4}|[A-Z]{2}\p{Nd}{2})$/u.test(x)).length >= 3) {
        const w = digitWords(core);
        if (pauses && !trail && i + 1 < toks.length) { if (!w.length) throw new PyError('IndexError'); w[w.length - 1] += ','; }
        return [w, 1, trail];
      }
    }
    if (/^[A-Z]{2}\p{Nd}{2}$/u.test(core) && /^\p{Nd}{4}$/u.test(nxt)) {
      const w = [...this.spell(core.slice(0, 2)), ...digitWords(core.slice(2))];
      if (pauses && !trail) w[w.length - 1] += ',';
      return [w, 1, trail];
    }
    // years after a month or a day
    if (/^1[1-9]\p{Nd}\p{Nd}$/u.test(core) && !core.endsWith('00') && i && (
      MONTHS.includes(prev) || (MONTH_ABBR.has(pl) && startsUpper(prev))
        || /^\p{Nd}{1,2}(st|nd|rd|th)?,$/u.test(toks[i - 1])
        || /^([\p{L}\p{N}_]+ )?[\p{L}\p{N}_]+(st|nd|rd|th),$/u.test(toks[i - 1]))) {
      return [yearWords(pyInt(core)), 1, trail];
    }
    // a day after a month is an ordinal; a day before one is "the fifth of July"
    if (/^\p{Nd}{1,2}$/u.test(core) && pyInt(core) >= 1 && pyInt(core) <= 31 && (MONTHS.includes(prev) || (MONTH_ABBR.has(pl) && startsUpper(prev)))) {
      if (!UNITS.has(nl) && !['percent', 'degrees', 'hours', 'minutes', 'days', 'people', 'times'].includes(nl)) return [[ordinal(pyInt(core))], 1, trail];
    }
    if (/^\p{Nd}{1,2}$/u.test(core) && pyInt(core) >= 1 && pyInt(core) <= 31 && MONTHS.includes(nxt) && !['the', 'of'].includes(pl) && !isNum(prev)) {
      return [['the', ordinal(pyInt(core)), 'of'], 1, trail];
    }
    // addresses
    if (DIRECTIONS.has(low) && isupper(core)) {
      if (plen(core) === 2 && (STREET_WORDS.has(rstrip(pl, '.')) || STREET_NAMES.has(prev))) return [[DIRECTIONS.get(low)], 1, trail];
      if (plen(core) === 1 && trail.startsWith('.') && (startsUpper(nxt) || ORD_NUM.test(nxt))) return [[DIRECTIONS.get(low)], 1, trail.slice(1)];
    }
    if (['ste', 'hwy', 'rte', 'ave', 'blvd'].includes(low) && startsUpper(core)
        && (startsDigit(nxt) || (['ave', 'blvd'].includes(low) && startsUpper(prev)))) {
      const word = { ste: 'Suite', hwy: 'Highway', rte: 'Route', ave: 'Avenue', blvd: 'Boulevard' }[low];
      if (trail.startsWith('.') && (plen(trail) > 1 || (nxt && !startsUpper(nxt)))) trail = trail.slice(1);
      return [[word], 1, trail];
    }
    if (STATES.has(core) && /^\p{Nd}{5}(-\p{Nd}{4})?$/u.test(nxt) && i && toks[i - 1].endsWith(',')) {
      const z = Normalizer.split(nxtRaw);
      return [[...STATES.get(core).split(' '), ...digitWords(z[1])], 2, z[2]];
    }
    m = re(/^I-(\p{Nd}{1,3})$/u, core);
    if (m) {
      const d = cps(m[1]);
      return [[this.letter('I'), ...(d.length <= 2 ? [m[1]] : [at(ONES, pyInt(d[0])), ...(d[1] === '0' ? ['oh', at(ONES, pyInt(d[2]))] : [d.slice(1).join('')])])], 1, trail];
    }
    if (/^[1-9]\p{Nd}{3}$/u.test(core) && (['box', 'suite', 'ste', 'room', 'unit', 'apt', 'apartment'].includes(pl)
        || (startsUpper(nxt) && toks.slice(i + 1, i + 4).some((x) => STREET_WORDS.has(rstrip(lower(Normalizer.split(x)[1]), '.')))))) {
      return [pairWords(pyInt(core)), 1, trail];
    }
    // feet and inches, scientific notation, a unit after a hyphen
    const inch = trail.slice(0, 1) !== '' && '"”″'.includes(trail.slice(0, 1));
    m = re(/^(\p{Nd}{1,2})[′'’](\p{Nd}{1,2})$/u, core);
    if (m && inch) return [[m[1], 'foot', m[2]], 1, trail.slice(1)];
    if (/^\p{Nd}+(\.\p{Nd}+)?$/u.test(core) && inch && (['a', 'an', 'the'].includes(prev) || ['bolt', 'screw', 'pipe', 'screen', 'display', 'tv', 'monitor', 'wide', 'long', 'tall', 'deep', 'thick', 'of', 'nail'].includes(nl))) {
      return [[core, core === '1' || ['a', 'an', 'the'].includes(prev) ? 'inch' : 'inches'], 1, trail.slice(1)];
    }
    m = re(/^(\p{Nd}{1,3})\/(\p{Nd}{1,3})$/u, core);
    if (m && inch && Normalizer.fraction(pyInt(m[1]), pyInt(m[2]))) return [[...Normalizer.fraction(pyInt(m[1]), pyInt(m[2])), 'inch'], 1, trail.slice(1)];
    m = re(/^(-?\p{Nd}+(?:\.\p{Nd}+)?)[eE]([-+]?)(\p{Nd}{1,3})$/u, core);
    if (m) return [[m[1], 'times', 'ten', 'to', 'the', ...(m[2] === '-' ? ['minus'] : []), m[3]], 1, trail];
    m = re(/^(\p{Nd}+(?:\.\p{Nd}+)?)-([A-Za-zµμ]+)$/u, core);
    if (m && UNITS.has(m[2])) return [[m[1], ...UNITS.get(m[2])[0].split(' ')], 1, trail];
    // Roman numerals
    if (core === 'I' && startsUpper(prev) && REGNAL.has(pl) && (nl.endsWith('ed') || ['was', 'had', 'is', 'of', 'and', 'became', 'died', 'who', "'s", 'reigned', 'ruled'].includes(nl))) return [['the', 'first'], 1, trail];
    if (core === 'I' && ROMAN_CUE.has(pl) && startsUpper(prev)) return [['one'], 1, trail];
    if (islower(core) && plen(core) >= 2 && ROMAN.test(upper(core)) && ROMAN_CUE.has(pl)) return [[cardinal(romanValue(upper(core)))], 1, trail];
    if (core.startsWith('M') && plen(core) >= 4 && ROMAN.test(core)) {
      const v = romanValue(core);
      if (v >= 1000 && v <= 2099) return [yearWords(v), 1, trail];
    }
    if (plen(core) === 2 && isupper(core) && isalpha(core) && isascii(core) && !this.cased(core)
        && !this.common(low) && !ROMAN.test(core) && !this.spelled(low)
        && !(i && isupper(toks[i - 1]) && isalpha(toks[i - 1]) && plen(toks[i - 1]) > 3)) {
      return [this.spell(core), 1, trail];
    }
    if (/^(?:[A-Za-z]{1,2}\.)+[A-Za-z]{1,2}$/.test(core) && trail.startsWith('.')
        && !['e.g', 'i.e', 'a.m', 'p.m'].includes(low) && cps(core).some((c) => islower(c))) {
      return [this.spell(core.replaceAll('.', '')), 1, plen(trail) > 1 ? trail.slice(1) : trail];
    }
    // acronyms that are also words: "the WHO", "the IT team"
    if (['WHO', 'IT', 'AM', 'OR', 'IS', 'AS'].includes(core) && pl === 'the') return [this.spell(core), 1, trail];
    // heteronyms said as an adjective
    if (low === 'minute' && (['is', 'are', 'was', 'were', 'very', 'so', 'quite', 'extremely', 'too', 'seemed', 'looked'].includes(pl)
        || ['details', 'detail', 'amounts', 'amount', 'traces', 'trace', 'particles', 'quantities', 'changes', 'differences', 'fraction', 'portion', 'particle'].includes(nl))) {
      return [[core + PH + ADJ_FORMS.get('minute')], 1, trail];
    }
    if (low === 'content' && ['with', 'to'].includes(nl) && ['seemed', 'seem', 'seems', 'feel', 'felt', 'feels', 'be', 'been', 'is', 'was', 'are', 'were', 'am', 'remain', 'remained', 'quite', 'very', 'perfectly', 'more', 'less', 'not', 'looked', 'looks'].includes(pl)) {
      return [[core + PH + ADJ_FORMS.get('content')], 1, trail];
    }
    if (low === 'fl' && trail.startsWith('.') && ORD_NUM.test(prev)) return [['floor'], 1, trail.slice(1)];
    return null;
  }

  more2(core, trail, prev, prev2, nxt, nxtRaw, toks, i, pauses) {
    const low = lower(core); const pl = lower(prev); const nl = lower(nxt);
    let m;
    // chat and business shorthand
    if (SHORTHAND_CASED.has(core) && pl !== 'the') return [SHORTHAND_CASED.get(core).split(' '), 1, trail];
    if (SHORTHAND.has(low) && !isupper(core) && pl !== 'the' && (low !== 're' || trail.startsWith(':'))) return [SHORTHAND.get(low).split(' '), 1, trail];
    if (['w/', 'w/o', 'b/c'].includes(low)) return [{ 'w/': ['with'], 'w/o': ['without'], 'b/c': ['because'] }[low], 1, trail];
    if (['→', '->', '=>'].includes(core)) return [['to'], 1, trail];
    if (core === '@' && prev && nxt) return [['at'], 1, trail];
    if (core === 'St' && !trail.startsWith('.') && startsUpper(prev) && isalpha(prev) && (trail || !nxt || startsLower(nxt))) return [['Street'], 1, trail];
    if (/^[1-9]\p{Nd}{2}[A-Z]?$/u.test(core) && ['room', 'rm', 'suite', 'ste', 'gate', 'apt', 'apartment', 'unit', 'flight'].includes(rstrip(pl, '.'))) {
      const a = cps(core); const d = a.slice(0, 3); const tail = this.spell(a.slice(3).join(''));
      return [[at(ONES, pyInt(d[0])), ...(d[1] + d[2] === '00' ? ['hundred'] : d[1] === '0' ? ['oh', at(ONES, pyInt(d[2]))] : [d[1] + d[2]]), ...tail], 1, trail];
    }
    m = re(/^([A-Z]{2,4})(?:→|->)([A-Z]{2,4})$/u, core);
    if (m) return [[...this.spell(m[1]), 'to', ...this.spell(m[2])], 1, trail];
    // a lone dash between two days, dates or numbers
    if (['–', '-', '—'].includes(core) && prev && nxt) {
      if ((DAY_ABBR.has(rstrip(pl, '.')) || DAY_NAMES.has(prev)) && (DAY_ABBR.has(rstrip(nl, '.')) || DAY_NAMES.has(nxt))) return [['through'], 1, trail];
      if ((startsDigit(prev) || MONTH_ABBR.has(rstrip(pl, '.'))) && (startsDigit(nxt) || MONTH_ABBR.has(rstrip(nl, '.')))) return [['to'], 1, trail];
    }
    // weekdays written short without a full stop
    if (DAY_ABBR.has(low) && startsUpper(core) && isalpha(core)
        && (startsDigit(nxt) || DAY_ABBR.has(nl) || ['–', '-'].includes(nxt) || (trail === ',' && i + 1 < toks.length))) {
      return [[DAY_ABBR.get(low)], 1, trail];
    }
    m = re(/^([A-Z][a-z]{2})[–-]([A-Z][a-z]{2})$/u, core);
    if (m && DAY_ABBR.has(lower(m[1])) && DAY_ABBR.has(lower(m[2]))) return [[DAY_ABBR.get(lower(m[1])), 'through', DAY_ABBR.get(lower(m[2]))], 1, trail];
    // a date after a weekday or "on"
    m = re(/^(\p{Nd}{1,2})\/(\p{Nd}{1,2})$/u, core);
    if (m && pyInt(m[1]) >= 1 && pyInt(m[1]) <= 12 && pyInt(m[2]) >= 1 && pyInt(m[2]) <= 31
        && (DAY_NAMES.has(prev) || DAY_ABBR.has(rstrip(pl, '.,')) || ['on', 'by', 'due', 'until', 'till', 'from', 'before', 'after', 'dated', 'thru'].includes(pl))) {
      return [[at(MONTHS, pyInt(m[1]) - 1), ordinal(pyInt(m[2]))], 1, trail];
    }
    // a month after an ordinal: "1st Feb" -> first of February
    if (MONTH_ABBR.has(rstrip(low, '.')) && startsUpper(core) && /^\p{Nd}{1,2}(st|nd|rd|th)$/u.test(prev)) {
      return [['of', at(MONTHS, MONTH_ABBR.get(rstrip(low, '.')) - 1)], 1, trail.startsWith('.') ? trail.slice(1) : trail];
    }
    // time zones after a time
    if (ZONES.has(core) && (TIME.test(prev) || /^[aApP]\.?[mM]\.?$/.test(prev) || ['AM', 'PM'].includes(prev))) return [ZONES.get(core).split(' '), 1, trail];
    // "8:40a", "11:25p"
    m = re(/^(\p{Nd}{1,2}):(\p{Nd}{2})([ap])$/u, core);
    if (m) return [this.time(m[1], m[2], null, m[3]), 1, trail];
    // hour ranges: "10–11:30", "9–5"
    m = re(/^(\p{Nd}{1,2})(?::(\p{Nd}{2}))?[–-](\p{Nd}{1,2})(?::(\p{Nd}{2}))?$/u, core);
    if (m && (g(m, 2) || g(m, 4)) && pyInt(m[1]) <= 24 && pyInt(m[3]) <= 24 && !startsUpper(prev)) {
      const a = this.time(m[1], g(m, 2) || '00', null, null) || [m[1]];
      const b = this.time(m[3], g(m, 4) || '00', null, null) || [m[3]];
      return [[...a.filter((w) => w !== 'hundred'), 'to', ...b.filter((w) => w !== 'hundred')], 1, trail];
    }
    // durations and distances glued: "2h", "15m" (after hours), "400m"
    m = re(/^(\p{Nd}+(?:\.\p{Nd}+)?)(h|hr|m|min|s)$/u, core);
    if (m) {
      const n = m[1]; const u = m[2];
      if (u === 'h' || u === 'hr') return [[n, n === '1' ? 'hour' : 'hours'], 1, trail];
      if (u === 'min' || (u === 'm' && /^\p{Nd}+(h|hr)$/u.test(prev))) return [[n, n === '1' ? 'minute' : 'minutes'], 1, trail];
      if (u === 's' && /^\p{Nd}+(m|min)$/u.test(prev)) return [[n, n === '1' ? 'second' : 'seconds'], 1, trail];
      if (u === 'm' && ((['the', 'a', 'ran', 'run', 'runs', 'swam', 'swim', 'won', 'in', 'over', 'under', 'about', 'climbed', 'dove', 'fell', 'jumped'].includes(pl) && !['for', 'in', 'dollars', 'people', 'users'].includes(nl))
          || ['race', 'dash', 'sprint', 'freestyle', 'hurdles', 'relay', 'run', 'swim', 'high', 'deep', 'long', 'tall', 'wide', 'away', 'above', 'below'].includes(nl))) {
        return [[n, n === '1' ? 'meter' : 'meters'], 1, trail];
      }
    }
    // "$75+", "1,000+ users"
    m = re(/^([$€£¥]?)(\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)\+$/u, core);
    if (m) {
      if (m[1]) return [[...this.sub(m[1] + m[2], pauses), 'or', 'more'], 1, trail];
      return [['more', 'than', m[2]], 1, trail];
    }
    // a price after "a" or "an" is a modifier
    m = re(MONEY, core);
    if (m && g(m, 3) && !g(m, 4) && !g(m, 5) && ['a', 'an'].includes(pl) && startsLower(nxt)
        && !['a', 'an', 'the', 'and', 'or', 'for', 'per', 'each', 'to'].includes(nl)) {
      return [[m[3], get(CURRENCY, m[2])[0]], 1, trail];
    }
    // the last four of a card, a text short code
    if (/^\p{Nd}{4}$/u.test(core) && (pl === 'ending' || (pl === 'in' && prev2 === 'ending'))) return [digitWords(core), 1, trail];
    if (/^\p{Nd}{5,6}$/u.test(core) && pl === 'to' && toks.slice(Math.max(0, i - 4), i).some((x) => lower(Normalizer.split(x)[1]) === 'text')) return [digitWords(core), 1, trail];
    // a postal code before a city
    if (/^\p{Nd}{5}$/u.test(core) && startsUpper(nxt) && i && toks[i - 1].endsWith(',')) return [digitWords(core), 1, trail];
    // codes and passwords
    m = re(/^[Ww][Ii][Nn](\p{Nd}{1,2})$/u, core);
    if (m) return [['Windows', m[1]], 1, trail];
    m = re(/^([a-z]{1,4})(\p{Nd}{1,6})$/u, core);
    if (m && !['x', 'ext'].includes(m[1]) && !this.known(low) && (m[1].length <= 3 || !this.known(m[1]))) {
      const d = m[2];
      return [[...this.spell(m[1]), ...(plen(d) <= 2 ? [d] : digitWords(d))], 1, trail];
    }
    // directions after a highway number or before a numbered street
    if (['N', 'S', 'E', 'W'].includes(core) && isNum(prev) && (
      ['hwy', 'highway', 'route', 'rte', 'interstate', 'i', 'us', 'sr'].includes(prev2)
        || ORD_NUM.test(nxt) || (startsUpper(nxt) && plen(nxt) > 2))) {
      return [[get(DIRECTIONS, low)], 1, trail];
    }
    if (['rm', 'apt', 'bldg', 'fl'].includes(low) && startsUpper(core) && (startsDigit(nxt) || nxt.startsWith('#'))) {
      const word = { rm: 'Room', apt: 'Apartment', bldg: 'Building', fl: 'Floor' }[low];
      return [[word], 1, trail.startsWith('.') ? trail.slice(1) : trail];
    }
    if (low === 'approx' && (startsDigit(nxt) || contains('$~', nxt.slice(0, 1)))) return [['approximately'], 1, trail.startsWith('.') ? trail.slice(1) : trail];
    // units after a fraction or a range
    const fracWord = ['half', 'quarter', 'third', 'eighth', 'quarters', 'thirds', 'eighths'].includes(pl);
    if (UNITS.has(core) && !['m', 'g', 'L', 'W', 'V', 's'].includes(core) && (FRACTION.test(prev) || /^\p{Nd}+[–-]\p{Nd}+$/u.test(prev) || fracWord)) {
      const [sing, plur] = UNITS.get(core);
      const one = FRACTION.test(prev) || ['half', 'quarter', 'third', 'eighth'].includes(pl);
      return [(one ? sing : plur).split(' '), 1, trail];
    }
    // a single letter after a word that names classes of things
    if (core === 'A' && LETTER_CUE.has(pl) && startsUpper(prev)) return [[this.letter('A')], 1, trail];
    // Roman numerals after a ruler's name, "Rocky IV"
    if (['V', 'X'].includes(core) && REGNAL.has(pl) && startsUpper(prev)) return [['the', ordinal(romanValue(core))], 1, trail];
    if (['IV', 'VI', 'IX', 'XI'].includes(core) && startsUpper(prev) && isalpha(prev) && !isupper(prev)) {
      const v = romanValue(core);
      return [REGNAL.has(pl) ? ['the', ordinal(v)] : [cardinal(v)], 1, trail];
    }
    // an imperative "Read" opens a sentence
    if (core === 'Read' && (i === 0 || '.!?:;'.includes(lastChar(toks[i - 1]))) && (OBJECTS.has(nl) || startsUpper(nxt))) return [[core + PH + 'ɹˈid'], 1, trail];
    // accents the lexicon doesn't have: "Kīlauea", "Hawaiʻi", "Ó"
    const plain = stripOkina(core);
    if (plain !== core && isascii(plain) && isalpha(plain) && !this.known(low) && !SAY_AS.has(lower(plain))
        && (this.known(lower(plain)) || plen(plain) === 1)) {
      return [[plain], 1, trail];
    }
    // three capitals the lexicon reads as a word but nobody would: "HOA"
    if (plen(core) === 3 && isupper(core) && isalpha(core) && isascii(core) && !this.cased(core)
        && !this.common(low) && !ACRONYM_WORDS.has(core) && !ROMAN.test(core)
        && !this.spelled(low) && !(i && isupper(toks[i - 1]) && plen(toks[i - 1]) > 3)) {
      return [this.spell(core), 1, trail];
    }
    // heteronyms
    if (low === 'lead' && ['for', 'of', 'contains', 'containing', 'with', 'no', 'free', 'test', 'testing', 'tested'].includes(pl)
        && !['the', 'a', 'an', 'us', 'them', 'you', 'him', 'her', 'me', 'to', 'our', 'your', 'their', 'his', 'my'].includes(nl)) {
      return [[core + PH + 'lˈɛd'], 1, trail];
    }
    if (low === 'does' && (NUMBER_WORDS.has(pl) || isdigit(prev) || ['the', 'some', 'many', 'several', 'two', 'three', 'few', 'and'].includes(pl))
        && !['not', 'it', 'he', 'she', 'this', 'that', 'anyone', 'anybody', 'everyone'].includes(nl)) {
      return [[core + PH + 'dˈOz'], 1, trail];
    }
    if (low === 'row' && ['over', 'about', 'with', 'between'].includes(nl) && ['a', 'the', 'big', 'huge', 'blazing', 'public', 'family', 'another', 'furious'].includes(pl)) {
      return [[core + PH + 'ɹˈW'], 1, trail];
    }
    if (low === 'minute' && ['a', 'the'].includes(pl) && MINUTE_NOUNS.has(nl)) return [[core + PH + ADJ_FORMS.get('minute')], 1, trail];
    return null;
  }

  // ---- v1.2: letters, codes, ranges and units (the v1.2 blind batches)
  /** An initialism said as one word, stress on the last letter ("NBA"); end is a plural or possessive ("IDs", "AGC's"). */
  spellWord(s, end = '') {
    const names = cps(s).map((c) => this.letters.get(lower(c)));
    if (!isalpha(s) || !isascii(s) || names.some((n) => n === undefined || n === null)) return this.spell(s);
    const last = end ? split1(this.letterPlural(lastCp(s), end === 's' ? '' : end), PH)[1] : names[names.length - 1];
    return [`${s}${end}${PH}` + names.slice(0, -1).map((n) => n.replaceAll(PRIMARY, SECONDARY)).join('') + last];
  }

  /** 'Os' in "CEOs", 'C's' in "AGC's": a letter name said with a plural or possessive ending. */
  letterPlural(c, possessive = '') {
    const lc = lower(c);
    const ph = this.letters.get(lc) ?? '';
    return `${upper(c)}${possessive || 's'}${PH}${ph}${LETTER_PLURAL_ES.has(lc) ? 'ᵻz' : LETTER_PLURAL_S.has(lc) ? 's' : 'z'}`;
  }

  /** An all-caps run said letter by letter: the lexicon spells it, or it doesn't know it and English can't say it. */
  initialism(w) {
    if (ACRONYM_WORDS.has(w) || SAY_AS_CASED.has(w) || ROMAN.test(w) || !(isascii(w) && isalpha(w))) return false;
    if (this.cased(w)) return false;
    if (this.known(lower(w))) return this.spelled(lower(w)) && this.reading(lower(w)).length > 0;
    return !pronounceable(w);
  }

  single(t) {
    const c = Normalizer.split(t)[1];
    return plen(c) === 1 && isalpha(c) && isupper(c) && isascii(c);
  }

  /** The words around token i are written in capitals as ordinary words ("PLEASE READ THE MANUAL"). */
  shouted(toks, i) {
    let n = 0;
    for (const j of [i - 2, i - 1, i + 1, i + 2]) {
      if (j >= 0 && j < toks.length) {
        const c = Normalizer.split(toks[j])[1];
        if (plen(c) >= 3 && isupper(c) && isalpha(c.replaceAll("'", '').replaceAll('’', '')) && this.known(lower(c)) && !this.initialism(c)) n++;
      }
    }
    return n >= 2;
  }

  /** v1.2 letter rules, ahead of every other rule: spaced, dotted and hyphenated letters, initialisms with endings, shouted words. */
  lettersFirst(core, trail, prev, prev2, nxt, nxtRaw, toks, i, pauses) {
    const low = lower(core); const pl = lower(prev); const nl = lower(nxt);
    let m;
    // spaced single letters: "A G C"; a lone "A" or "I" before a word stays the article or the pronoun
    if (core === 'A' || core === 'I') {
      const afterLetter = i > 0 && this.single(toks[i - 1]) && !['A', 'I'].includes(Normalizer.split(toks[i - 1])[1])
        && !'.!?;:'.includes(lastCp(toks[i - 1]));
      const beforeLetter = !trail && i + 1 < toks.length && this.single(nxtRaw);
      if (afterLetter || beforeLetter || (core === 'A' && (['letter', 'letters', 'an'].includes(pl)
        || (['and', 'or'].includes(nl) && !trail) || (',;'.includes(cps(trail).slice(0, 1).join('')) && this.single(nxtRaw))))
        || (['and', 'or'].includes(pl) && i > 1 && this.single(toks[i - 2]))) {
        return [[this.letter(core)], 1, trail];
      }
    }
    // plural and possessive initialisms: "CEOs", "PDFs", "AGC's"
    m = re(/^([A-Z]{2,6})(s|'s|’s)$/u, core);
    if (m && !SHORTHAND_CASED.has(m[1]) && this.initialism(m[1]) && !SHORTHAND_CASED.has(core) && core !== 'IDs') {
      return [this.spellWord(m[1], m[2]), 1, trail];
    }
    // dotted capitals: "A.G.C.", "N.Y.C.", "A.I." (the full stop ends a sentence only before a capital or at the end)
    if (/^(?:[A-Z]\.){1,}[A-Z]$/u.test(core) && trail.startsWith('.') && plen(core) >= 3) {
      const keep = i + 1 >= toks.length || (startsUpper(nxt) && nxt !== 'I') ? trail : trail.slice(1);
      const flat = core.replaceAll('.', '');
      if (ACRONYM_WORDS.has(flat)) return [[flat], 1, keep];
      return [this.spellWord(flat), 1, keep];
    }
    // a middle initial: "George W. Bush", "Ulysses S. Grant" (not a direction)
    const initial = (t) => /^[A-Z]\.$/u.test(t);
    if (plen(core) === 1 && isupper(core) && trail === '.' && startsUpper(nxt) && !SENTENCE_START.has(nl)
      && (initial(nxtRaw) || (i && initial(toks[i - 1]) && isalpha(nxt))
        || (startsUpper(prev) && isalpha(prev) && !isupper(prev) && plen(nxt) > 1 && isalpha(nxt)
          && !'.!?:;,'.includes(lastCp(at(toks, i - 1)))))
      && !toks.slice(i + 1, i + 4).some((t) => STREET_WORDS.has(rstrip(lower(Normalizer.split(t)[1]), '.')))) {
      return [[this.letter(core)], 1, trail.slice(1)];
    }
    // a letter before a word: "p-value", "t-test", "x-axis"; a word before a letter: "Type-C", "Plan-B"
    m = re(/^([a-zA-Z])-(value|values|test|tests|axis|score|scores|statistic|coordinate|intercept)$/u, core);
    if (m) return [[this.letter(m[1]), m[2]], 1, trail];
    m = re(/^([A-Za-z]{2,})-([A-Z])$/u, core);
    if (m && isalpha(m[1])) return [[m[1], this.letter(m[2])], 1, trail];
    // a letter and a model number: "F-150", "B-52", "F-16"
    m = re(/^([A-Z]{1,2})-(\p{Nd}{2,3})$/u, core);
    if (m && core.slice(0, 2) !== 'I-') {
      const d = cps(m[2]);
      const num = d.length === 2 || (d[1] === '0' && d[2] === '0') ? cardinal(pyInt(m[2])).split(' ')
        : [at(ONES, pyInt(d[0])), ...(d[1] === '0' ? ['oh', at(ONES, pyInt(d[2]))] : cardinal(pyInt(d.slice(1).join(''))).split(' '))];
      return [[...this.spell(m[1]), ...num], 1, trail];
    }
    // mixed-case initialisms: "DoD", "DoE", "MoU"
    if (/^[A-Z]o[A-Z]s?$/u.test(core) && !SAY_AS_CASED.has(core)) return [this.spellWord(core.slice(0, 3), core.slice(3)), 1, trail];
    // a resolution: "1080p", "720p"
    m = re(/^(\p{Nd}{3,4})([pi])$/u, core);
    if (m) {
      const d = cps(m[1]);
      return [[...(d.length === 4 ? pairWords(pyInt(m[1])) : [at(ONES, pyInt(d[0])), ...cardinal(pyInt(d.slice(1).join(''))).split(' ')]),
        this.letter(m[2])], 1, trail];
    }
    // a possessive of a capitalised word: "NATO's" ("WHO's" stays v1.1's)
    m = re(/^([A-Z]{4,})(['’]s)$/u, core);
    if (m && !this.initialism(m[1]) && this.reading(lower(m[1])).length) {
      const ph = this.reading(lower(m[1]))[0];
      const e = lastCp(ph);
      return [[core + PH + ph + (SIBILANT_END.has(e) ? 'ᵻz' : VOICELESS_END.has(e) ? 's' : 'z')], 1, trail];
    }
    // a common word shouted in capitals keeps its word reading ("I CAN'T BELIEVE IT"), not its letters
    if (plen(core) >= 2 && isupper(core) && isalpha(core.replaceAll("'", '').replaceAll('’', '')) && this.known(low)
      && !ACRONYM_WORDS.has(core) && !SAY_AS_CASED.has(core) && !SHORTHAND_CASED.has(core) && !ZONES.has(core)
      && !ROMAN.test(core) && (this.common(low) || !this.cased(core)) && this.shouted(toks, i)
      && this.reading(low).some((f) => !this.spelledForm(f, low))) {
      return [[i && !'.!?'.includes(lastCp(toks[i - 1])) ? low : capitalize(low)], 1, trail];
    }
    return null;
  }

  spelledForm(f, w) {
    let s = '';
    for (const c of w) s += bare(this.letters.get(c) ?? '?');
    return bare(f) === s;
  }

  more3(core, trail, prev, prev2, nxt, nxtRaw, toks, i, pauses) {
    const low = lower(core); const pl = lower(prev); const nl = lower(nxt);
    const singUnit = (n, u) => get(UNITS, u)[n === '1' || n === '-1' ? 0 : 1].split(' ');
    const one = (n) => n === '1' || n === '-1';
    let m;
    // respelled capitals: "IEEE", "WWII", "PhD"
    if (CASED_SAY.has(core)) return [this.sub(CASED_SAY.get(core), pauses), 1, trail];
    if (core === 'ID') return [[core + PH + 'ˌIdˈi'], 1, trail];   // "your ID": not the Freudian id ("IDs" keeps v1.1's)
    // year ranges: "1990–95", "2019-2020 season"
    m = re(/^(1[1-9]\p{Nd}\p{Nd}|20\p{Nd}\p{Nd})[–-](\p{Nd}\p{Nd}|1[1-9]\p{Nd}\p{Nd}|20\p{Nd}\p{Nd})$/u, core);
    if ((m && !core.endsWith('00')) || (m && /^(1[1-9]\p{Nd}\p{Nd}|20\p{Nd}\p{Nd})[–-](\p{Nd}\p{Nd}|\p{Nd}{4})$/u.test(core) && pyInt(m[1]) % 100)) {
      const a = pyInt(m[1]); const b = m[2]; const bc = cps(b);
      const bw = bc.length === 4 ? yearWords(pyInt(b)) : (bc[0] === '0' ? ['oh', at(ONES, pyInt(bc[1]))] : cardinal(pyInt(b)).split(' '));
      if (!((bc.length === 4 && pyInt(b) <= a) || (bc.length === 2 && pyInt(b) <= a % 100))) {   // else not a range: a code
        const joint = ['season', 'seasons', 'school', 'academic', 'fiscal', 'tax', 'budget', 'financial'].includes(nl) ? [] : ['to'];
        return [[...yearWords(a), ...joint, ...bw], 1, trail];
      }
    }
    // a range in percent: "20–30%"
    m = re(/^(\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)[–-](\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)%$/u, core);
    if (m) return [[m[1], 'to', m[2], 'percent'], 1, trail];
    // day ranges after a month: "Jan 3–7", "May 12-19"
    m = re(/^(\p{Nd}{1,2})[–-](\p{Nd}{1,2})$/u, core);
    if (m && (MONTHS.includes(prev) || (MONTH_ABBR.has(rstrip(pl, '.')) && startsUpper(prev)))
      && pyInt(m[1]) >= 1 && pyInt(m[1]) < pyInt(m[2]) && pyInt(m[2]) <= 31) {
      return [[ordinal(pyInt(m[1])), 'to', ordinal(pyInt(m[2]))], 1, trail];
    }
    // fraction ranges: "1/2-1 cup", "1–1/2 tsp"
    m = re(/^(\p{Nd}{1,2}(?:\/\p{Nd}{1,2})?)[–-](\p{Nd}{1,2}(?:\/\p{Nd}{1,2})?)$/u, core);
    if (m && core.includes('/')) {
      let out = [];
      for (const [k, part] of [m[1], m[2]].entries()) {
        if (part.includes('/')) {
          const [n, d] = part.split('/').map(pyInt);
          const fr = Normalizer.fraction(n, d);
          if (!fr) { out = null; break; }
          out.push(...(k ? ['to'] : []), ...fr);
        } else out.push(...(k ? ['to'] : []), part);
      }
      if (out && out.length) return [out, 1, trail];
    }
    // aircraft: "Boeing 737-800", "Airbus A320"
    m = re(/^([1-9])(\p{Nd}\p{Nd})(?:-(\p{Nd}{1,3}))?$/u, core);
    if (m && ['boeing', 'airbus', 'embraer', 'bombardier', 'douglas', 'md', 'dc'].includes(pl)) {
      return [[at(ONES, pyInt(m[1])), ...cardinal(pyInt(m[2])).split(' '), ...(g(m, 3) ? cardinal(pyInt(m[3])).split(' ') : [])], 1, trail];
    }
    // years with an era: "A.D. 1250", "500 BC"
    if (/^\p{Nd}{3,4}$/u.test(core) && (ERA.has(rstrip(prev, '.')) || ERA.has(rstrip(nxt, '.'))) && !core.endsWith('00')) {
      return [yearWords(pyInt(core)), 1, trail];
    }
    // a month before a day range: "Jan 3–7"
    if (MONTH_ABBR.has(rstrip(low, '.')) && startsUpper(core) && isalpha(core) && /^\p{Nd}{1,2}[–-]\p{Nd}{1,2}$/u.test(nxt)) {
      return [[at(MONTHS, get(MONTH_ABBR, rstrip(low, '.')) - 1)], 1, trail.startsWith('.') ? trail.slice(1) : trail];
    }
    // a port: "port 443", "port 8080"
    if (/^\p{Nd}{2,5}$/u.test(core) && ['port', 'ports'].includes(pl) && !['the', 'a'].includes(prev2)) {
      const c = cps(core); const t1 = c.slice(1).join('');
      return [c.length === 4 && t1 !== '000' && pyInt(core) < 2100 ? pairWords(pyInt(core))
        : c.length === 4 && c[2] !== '0' && t1 !== '000' ? [c.slice(0, 2).join(''), c.slice(2).join('')]
          : c.length === 3 && c[1] !== '0' ? [c[0], t1] : [core], 1, trail];
    }
    // a weekday after a dash: "Tue–Thu", "Mon - Fri" (not "I talked to Thu Crosson")
    if (DAY_ABBR.has(low) && startsUpper(core) && isalpha(core) && (['–', '-', '—', 'through', 'to'].includes(prev) || ['thru', 'until', 'till'].includes(pl))
      && !(['through', 'to'].includes(prev) && startsUpper(nxt) && isalpha(nxt) && !DAY_ABBR.has(nl) && !DAY_NAMES.has(nxt) && !MONTH_ABBR.has(nl))) {
      return [[DAY_ABBR.get(low)], 1, trail.startsWith('.') ? trail.slice(1) : trail];
    }
    // phone numbers: "312 555 0199", "ext 12", "988", ZIP+4
    if (/^\p{Nd}{3}$/u.test(core) && /^\p{Nd}{3}$/u.test(nxt) && i + 2 < toks.length && !toks[i].startsWith('(')
      && !(i && /^\+\p{Nd}{1,3}$/u.test(toks[i - 1])) && /^\p{Nd}{4}$/u.test(Normalizer.split(toks[i + 2])[1]) && !Normalizer.split(nxtRaw)[2]) {
      const z = Normalizer.split(toks[i + 2]);
      return [this.phone([core, nxt, z[1]], pauses), 3, z[2]];
    }
    if (['ext', 'extension', 'x'].includes(low) && !trail && /^\p{Nd}{1,5}$/u.test(nxt) && (low !== 'x' || /\p{Nd}/u.test(prev)) && i) {
      const z = Normalizer.split(nxtRaw);
      return [['extension', ...(plen(z[1]) > 2 ? digitWords(z[1]) : [z[1]])], 2, z[2]];
    }
    if (core === '988' && (['call', 'text', 'dial', 'or'].includes(pl) || !nxt)) return [digitWords(core), 1, trail];
    if (/^\p{Nd}{5}-\p{Nd}{4}$/u.test(core)) return [digitWords(core.replaceAll('-', '')), 1, trail];
    if (/^\p{Nd}{4}$/u.test(core) && pl === 'in' && ['ends', 'ending'].includes(prev2)
      && (!(pyInt(core) >= 1100 && pyInt(core) <= 2099) || toks.slice(Math.max(0, i - 6), i).some((t) => CODE_CUE_CARD.has(lower(Normalizer.split(t)[1]))))) {
      return [digitWords(core), 1, trail];
    }
    // codes after a cue word: "tracking number 9400111899", "code 482913", "Invoice 2024-0915", "SN 555123"
    const cue = toks.slice(Math.max(0, i - 3), i).map((t) => rstrip(lower(Normalizer.split(t)[1]), ':#'));
    const last2 = cue.slice(-2);
    if ((/^#?\p{Nd}{4,}([-]\p{Nd}{2,})*$/u.test(core) && !isNum(core.replaceAll('-', 'x')) && core.includes('-')) || /^\p{Nd}{5,}$/u.test(core)) {
      if (cue.slice(-3).join('\u0000') === 'the\u0000code\u0000is' && cue.length >= 3) {
        // "The code is 351576." reads the number
      } else if (last2.some((c) => CODE_CUE.has(c)) || (cue.length && cue[cue.length - 1] === 'is' && cue.some((c) => CODE_CUE.has(c)))) {
        return [digitWords(core.replace(/[^\p{Nd}]/gu, '')), 1, trail];
      }
    }
    if (/^\p{Nd}{4}-\p{Nd}{3,}$/u.test(core) && last2.some((c) => CODE_CUE.has(c))) return [digitWords(core.replaceAll('-', '')), 1, trail];
    // units: "100 m²", "500 MB/s", "10 sq ft", "2 in long", "180 °C", "250 g of flour"
    m = re(/^(\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)?(km|m|cm|mm|ft|in|mi|yd)([²³])$/u, core);
    if (m && (g(m, 1) || isNum(prev))) {
      const n = g(m, 1) || prev;
      const name = UNITS.has(m[2]) ? UNITS.get(m[2]) : ['inch', 'inches'];
      const words = (m[3] === '²' ? 'square ' : 'cubic ') + (one(n) ? name[0] : name[1]);
      return [[...(g(m, 1) ? [n] : []), ...words.split(' ')], 1, trail];
    }
    m = re(/^(\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?)?([KMGT]B|[kMG]b|km|m|ft|mi)\/(s|sec|h|hr|min)$/u, core);
    if (m && (g(m, 1) || isNum(prev))) {
      const n = g(m, 1) || prev;
      const name = UNITS.get(m[2]) || get(BIT_UNITS, m[2]);
      const per = { s: 'second', sec: 'second', h: 'hour', hr: 'hour', min: 'minute' }[m[3]];
      return [[...(g(m, 1) ? [n] : []), ...(one(n) ? name[0] : name[1]).split(' '), 'per', per], 1, trail];
    }
    if (['sq', 'sq.', 'cu'].includes(low) && isNum(prev) && (UNITS.has(nxt) || ['in', 'ft'].includes(nl))) {
      const z = Normalizer.split(nxtRaw);
      const u = UNITS.has(z[1]) ? z[1] : lower(z[1]);
      const name = UNITS.has(u) ? UNITS.get(u) : ['inch', 'inches'];
      return [[low.startsWith('sq') ? 'square' : 'cubic', ...(one(prev) ? name[0] : name[1]).split(' ')], 2, z[2] !== '.' ? lstrip(z[2], '.') : z[2]];
    }
    if (core === 'in' && isNum(prev) && !trail && ['long', 'wide', 'tall', 'deep', 'thick', 'high', 'across', 'diameter', 'square'].includes(nl)) {
      return [[prev === '1' ? 'inch' : 'inches'], 1, trail];
    }
    if (['°C', '°F', '°'].includes(core) && isNum(prev)) {
      return [[one(prev) ? 'degree' : 'degrees', ...({ '°C': ['Celsius'], '°F': ['Fahrenheit'] }[core] || [])], 1, trail];
    }
    if (core === 'g' && isNum(prev) && (['of', ''].includes(nl) || trail)) return [singUnit(prev, 'g'), 1, trail];
    // Roman numerals: a list item "i." at the start of a line, "Grand Theft Auto V"
    if (i === 0 && trail === '.' && ROMAN.test(upper(core)) && (islower(core) || (plen(core) > 1 && isupper(core))) && startsUpper(nxt)) {
      return [[capitalize(cardinal(romanValue(upper(core))))], 1, trail];
    }
    if (core === 'V' && startsUpper(prev) && isalpha(prev) && !isupper(prev) && !REGNAL.has(pl) && !LETTER_CUE.has(pl) && i > 1
      && !'.!?:;'.includes(lastCp(toks[i - 1])) && (!nxt || startsLower(nxt))) {
      return [['five'], 1, trail];
    }
    // web: "https" said as letters, "@bakes.by.bella", "@NYTimes"
    if (['http', 'https'].includes(low) && islower(core)) return [this.spell(low), 1, trail];
    if (/^@[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/u.test(core)) return [['at', ...this.sayParts(core.slice(1))], 1, trail];
    if (/^@[A-Za-z0-9_]+$/u.test(core) && /[a-z]/u.test(core) && /[A-Z]{2}[a-z]/u.test(core)) {
      const words = ['at'];
      for (const [part] of core.slice(1).matchAll(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\p{Nd}+|_/gu)) {
        if (part === '_') words.push('underscore');
        else if (!isupper(part)) words.push(...this.sayRun(part));
        else if (this.initialism(part) || plen(part) <= 3) words.push(...this.spell(part));
        else words.push(part);
      }
      return [words, 1, trail];
    }
    return null;
  }

  /** Last: an all-caps word the lexicon doesn't have is spelled unless English could say it as a word. */
  capitals(core, trail, prev, nxt, toks, i) {
    if (plen(core) >= 2 && isupper(core) && isalpha(core) && isascii(core) && !this.known(lower(core)) && !this.cased(core) && this.initialism(core)) {
      return [this.spellWord(core), 1, trail];
    }
    return null;
  }

  // ---- homographs (v1.2): HOMOGRAPHS, first matching rule wins
  static ctxWord(t) {
    let a = 0; let b = t.length;
    while (a < b && OPEN.includes(t[a])) a++;
    while (b > a && CLOSE.includes(t[b - 1])) b--;
    return lower(t.slice(a, b)).replaceAll('’', "'");
  }

  /** The phonemes of the sense a homograph's context asks for, or null to leave it to the context model. */
  homograph(core, toks, i) {
    const rules = HOMOGRAPHS.get(lower(core));
    if (rules === undefined || !isalpha(core)) return null;
    const prev = [];                                  // p1, p2, p3 within the clause; "^" before its start
    for (let j = i - 1; j > i - 4; j--) {
      if (j < 0 || HG_STOP.has(lastCp(toks[j]))) { prev.push('^'); break; }
      prev.push(Normalizer.ctxWord(toks[j]));
    }
    const nxt = [];                                   // n1, n2, n3 within the clause; "$" after its end
    if (!HG_STOP.has(lastCp(toks[i]))) {
      for (let j = i + 1; j < i + 4; j++) {
        if (j >= toks.length) { nxt.push('$'); break; }
        nxt.push(Normalizer.ctxWord(toks[j]));
        if (HG_STOP.has(lastCp(toks[j]))) break;
      }
    }
    if (!nxt.length || (nxt.length < 3 && nxt[nxt.length - 1] !== '$')) nxt.push('$');
    if (prev[prev.length - 1] !== '^' && prev.length < 3) prev.push('^');
    const cap = startsUpper(core) && prev[0] !== '^';
    for (const [said, tests] of rules) {
      if (tests.every((t) => hgTest(t, prev, nxt, cap))) return said || null;
    }
    return null;
  }

  ip(host) {
    const words = [];
    host.split('.').forEach((x, k) => {
      const n = pyInt(x);
      const w = n < 100 || n % 100 === 0 ? cardinal(n).split(' ')
        : [at(ONES, Math.floor(n / 100)), ...(n % 100 < 10 ? ['oh', at(ONES, n % 10)] : [cardinal(n % 100)])];
      words.push(...(k ? ['dot'] : []), ...w);
    });
    return words;
  }

  basic(core, trail, prev, prev2, prevEnd, nxt, nxtRaw, toks, i, pauses) {
    const low = lower(core);
    const dot = trail.startsWith('.');
    const keepDot = i + 1 >= toks.length || startsUpper(nxt) ? trail : trail.slice(1);
    const nxtCap = startsUpper(nxt);
    const prevCap = (startsUpper(prev) && isalpha(prev)) || /^\p{Nd}+(st|nd|rd|th)?$/u.test(prev);
    const nxtNum = startsDigit(nxt);
    const prevNum = isNum(prev);
    let m;

    // -- symbols and digits
    m = re(EMAIL, core);
    if (m) return [[...this.sayParts(m[1]), 'at', ...this.domain(m[2])], 1, trail];
    if (core.startsWith('@') && /^@[A-Za-z0-9_]+$/.test(core)) return [['at', ...this.sayParts(core.slice(1))], 1, trail];
    if (core.startsWith('#') && plen(core) > 1) {
      const rest = core.slice(1);
      if (isdigit(rest)) return [['number', ...(plen(core) > 4 ? digitWords(rest) : [rest])], 1, trail];
      if (/^#[A-Za-z][\p{L}\p{N}_]*$/u.test(core)) {
        const parts = rest.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\p{Nd}+/gu) || [];
        return [['hashtag', ...parts.map((p) => (this.known(lower(p)) ? lower(p) : p))], 1, trail];
      }
    }
    if (/^[A-G]#$/.test(core)) return [[core[0], 'sharp'], 1, trail];
    m = re(URL_RE, core);
    if (m) {
      const hostLabels = m[2].split('.');
      const tld = hostLabels[hostLabels.length - 1];
      if ((g(m, 1) || TLDS.has(lower(tld))) && /[A-Za-z]{2}/.test(hostLabels[0]) && (g(m, 1) || !dot || low.split('.').length - 1 >= 1)) {
        let host = m[2];
        if (!g(m, 1) && !TLDS.has(tld)) return null;
        if (WORD_ABBR.has(low) || ['e.g.', 'i.e.'].includes(low + '.')) return null;
        const words = [];
        if (lower(host).startsWith('www.')) { words.push(...this.spell('www'), 'dot'); host = host.slice(4); }
        words.push(...this.domain(host));
        for (const seg of (g(m, 3) || '').split('/').slice(1)) {
          words.push('slash');
          if (/^[a-z]{2}[-_][a-z]{2}$/iu.test(seg)) words.push(...this.spell(seg.slice(0, 2)), get(SEP_WORDS, seg[2]), ...this.spell(seg.slice(3)));
          else if (/^[1-9]\p{Nd}{0,3}$/u.test(seg)) words.push(seg);
          else if (seg) words.push(...this.sayParts(seg));
        }
        return [words, 1, trail];
      }
    }
    m = re(MONEY, core);
    if (m && (g(m, 3) || g(m, 4))) {
      const nscale = SCALE_WORDS.has(lower(nxt)) && !g(m, 5) ? lower(nxt) : null;
      const words = this.money(m[1], m[2], g(m, 3), g(m, 4), g(m, 5), nscale);
      if (nscale) return [words, 2, Normalizer.split(nxtRaw)[2]];
      return [words, 1, trail];
    }
    m = re(CENTS, core);
    if (m) return [[m[1], m[1] === '1' ? 'cent' : 'cents'], 1, trail];
    m = re(DEGREES, core);
    if (m && (g(m, 2) || core.endsWith('°'))) {
      const n = m[1];
      const words = [...(n.startsWith('-') ? ['minus', n.slice(1)] : [n]), n === '1' || n === '-1' ? 'degree' : 'degrees'];
      return [[...words, ...({ C: ['Celsius'], F: ['Fahrenheit'] }[g(m, 2)] || [])], 1, trail];
    }
    m = re(TOLLWORD, core);
    if (m) return [this.phone(['1', m[1], m[2]], pauses), 1, trail];
    m = re(PHONE, core);
    if (m) {
      const gs = [m[1], m[2], m[3], m[4]].filter((x) => x);
      return [this.phone(gs.map((x) => x.replace(/^\++/, '')), pauses, gs[0].startsWith('+')), 1, trail];
    }
    if (/^\(\p{Nd}{3}\)$/u.test(toks[i]) || (/^\p{Nd}{3}$/u.test(core) && toks[i].startsWith('('))) {
      const m2 = re(/^(\p{Nd}{3})-(\p{Nd}{4})$/u, nxt);
      if (m2) return [this.phone([core, m2[1], m2[2]], pauses), 2, Normalizer.split(nxtRaw)[2]];
    }
    if (/^\+\p{Nd}{1,3}$/u.test(core)) {
      const groups = [core.slice(1)]; let j = i + 1;
      while (j < toks.length && /^\p{Nd}{1,4}(-\p{Nd}{1,4})*$/u.test(Normalizer.split(toks[j])[1])) {
        groups.push(...Normalizer.split(toks[j])[1].split('-'));
        j += 1;
        if (Normalizer.split(toks[j - 1])[2]) break;
      }
      if (groups.length >= 3) return [this.phone(groups, pauses, true), j - i, Normalizer.split(toks[j - 1])[2]];
    }
    m = re(PHONE7, core);
    if (m && !prevNum) return [this.phone([m[1], m[2]], pauses), 1, trail];
    if (/^[2-9]11$/.test(core) && (core === '911' || ['dial', 'call', 'called', 'calling'].includes(lower(prev)))) return [digitWords(core), 1, trail];
    if (IPV4.test(core) && core.split('.').every((x) => pyInt(x) < 256)) return [this.ip(core), 1, trail];
    m = re(VERSION, core);
    if (m && (m[2].split('.').length - 1 >= 2 || g(m, 1))) {
      const words = g(m, 1) && !['version', 'release', 'v'].includes(lower(prev)) ? ['version'] : [];
      m[2].split('.').forEach((x, k) => words.push(...(k ? ['point'] : []), ...(!(plen(x) > 1 && x.startsWith('0')) ? [x] : digitWords(x))));
      if (g(m, 3)) words.push(...m[3].match(/[A-Za-z]+|\p{Nd}+/gu) || []);
      return [words, 1, trail];
    }
    m = re(LEADING_POINT, core);
    if (m) return [['point', ...digitWords(m[1])], 1, trail];
    m = re(DECADE, core);
    if (m && m[1].endsWith('0') && (plen(m[1]) === 2 || (pyInt(m[1]) >= 1000 && pyInt(m[1]) <= 2090))) return [pluralNumber(pyInt(m[1])).split(' '), 1, trail];
    m = re(DATE_ISO, core);
    if (m && pyInt(m[2]) >= 1 && pyInt(m[2]) <= 12 && pyInt(m[3]) >= 1 && pyInt(m[3]) <= 31) {
      const sep = pauses ? ',' : '';
      return [[at(MONTHS, pyInt(m[2]) - 1), ordinal(pyInt(m[3])) + sep, ...yearWords(pyInt(m[1]))], 1, trail];
    }
    m = re(DATE_MDY, core);
    if (m && pyInt(m[1]) >= 1 && pyInt(m[1]) <= 12 && pyInt(m[2]) >= 1 && pyInt(m[2]) <= 31) {
      const y = plen(m[3]) === 4 ? m[3] : (pyInt(m[3]) < 50 ? '20' : '19') + m[3];
      const sep = pauses ? ',' : '';
      return [[at(MONTHS, pyInt(m[1]) - 1), ordinal(pyInt(m[2])) + sep, ...yearWords(pyInt(y))], 1, trail];
    }
    m = re(FRACTION, core);
    if (m) {
      const n = pyInt(m[1]); const d = pyInt(m[2]);
      const fr = Normalizer.fraction(n, d);
      const unitNext = ['of', 'inch', 'inches', 'cup', 'cups', 'mile', 'miles', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons', 'pound', 'pounds', 'ounce', 'ounces', 'hour', 'hours', 'an', 'a', 'in', 'tsp', 'tbsp', 'lb', 'oz'].includes(lower(nxt));
      if (fr && ([2, 3, 4, 8].includes(d) || unitNext || ([16, 32, 64].includes(d) && n % 2))) return [fr, 1, trail];
      if (n >= 1 && n <= 12 && d >= 13 && d <= 31) return [[at(MONTHS, n - 1), ordinal(d)], 1, trail];
      if ([[24, 7], [9, 11], [7, 11], [50, 50], [24, 365]].some(([a, b]) => a === n && b === d)) return [[String(n), String(d)], 1, trail];
      return null;
    }
    if (/^\p{Nd}+$/u.test(core) && FRACTION.test(nxt)) {
      const [n, d] = nxt.split('/').map(pyInt);
      const fr = Normalizer.fraction(n, d);
      if (fr && pyInt(core) < 1000) {
        const tail = n === 1 ? ['a', fr[1]] : fr;
        return [[cardinal(pyInt(core)), 'and', ...tail], 2, Normalizer.split(nxtRaw)[2]];
      }
    }
    m = re(TIME, core);
    if (m && (g(m, 3) || g(m, 4) || m[2].startsWith('0'))) {
      const words = this.time(m[1], m[2], g(m, 3), g(m, 4));
      if (words && words.length) return [words, 1, trail];
    }
    m = re(TIME_AMPM, core);
    if (m && pyInt(m[1]) <= 12) return [[m[1], this.letter(m[2]), 'M'], 1, trail];
    if (['am', 'pm'].includes(core) && (prevNum || TIME.test(prev))) return [[this.letter(core[0]), 'M'], 1, trail];
    m = re(RATIO, core);
    if (m && !startsUpper(prev) && !prevNum) return [[m[1], 'to', m[2]], 1, trail];
    if (/^\p{Nd}{1,2}:\p{Nd}{2}[-–]\p{Nd}{1,2}:\p{Nd}{2}$/u.test(core)) {
      const [a, b] = core.split(/[-–]/u);
      const wa = this.time(...a.split(':'), null, null) || [a];
      const wb = this.time(...b.split(':'), null, null) || [b];
      return [[...wa, 'to', ...wb], 1, trail];
    }
    m = re(RANGE, core);
    if (m) {
      const a = m[1]; const b = m[2];
      if (a === b) return [[a, b], 1, trail];
      return [[a, 'to', b], 1, trail];
    }
    m = re(TIMES_X, core);
    if (m) return [[...this.pairs(m[1]), 'by', ...this.pairs(m[2])], 1, trail];
    m = re(MULT, core);
    if (m) return [[m[1], 'times'], 1, trail];
    m = re(UNIT_GLUED, core);
    if (m) {
      const [sing, plur] = get(UNITS, m[2]);
      return [[m[1], ...(m[1] === '1' ? sing : plur).split(' ')], 1, trail];
    }
    if (DIGITS.test(core)) return [digitWords(core), 1, trail];
    if (['~', '≈'].includes(core) && nxtNum) return [['about'], 1, trail];
    if (core.startsWith('~') && /^~\p{Nd}/u.test(core)) return [['about', core.slice(1)], 1, trail];
    if (['>', '<', '*', '=', '+', '&', '±', '>=', '<='].includes(core) && (prevNum || nxtNum || core === '&')) {
      let say = { '>': ['is', 'greater', 'than'], '<': ['is', 'less', 'than'], '*': ['times'], '=': ['equals'], '+': ['plus'], '&': ['and'], '±': ['plus', 'or', 'minus'], '>=': ['is', 'at', 'least'], '<=': ['is', 'at', 'most'] }[core];
      if (['>', '<'].includes(core) && ['is', 'are', 'was', 'were'].includes(lower(prev))) say = say.slice(1);
      return [say, 1, trail];
    }
    if (/^[A-Z]{1,3}&[A-Z]{1,3}$/.test(core)) {
      const [a, b] = core.split('&');
      return [[...this.spell(a), 'and', ...this.spell(b)], 1, trail];
    }
    if (/^[A-Za-z]+&[A-Za-z]+$/.test(core)) {
      const [a, b] = core.split('&');
      return [[a, 'and', b], 1, trail];
    }
    if (/[A-Za-z](—|--|–)[A-Za-z]/.test(core)) return [core.split(/—|--|–/).filter((p) => p), 1, trail];
    if (/^[Rr][Oo][Cc][Kk]['’]n['’][Rr][Oo][Ll][Ll]$/.test(core)) return [[core.split("'")[0].split('’')[0], 'and', 'roll'], 1, trail];

    // -- numbers followed by a unit
    if (prevNum && UNITS.has(core) && !(['in', 'm', 'g'].includes(core) && !dot && core !== 'm')) {
      if (core === 'in') return null;
      const [sing, plur] = UNITS.get(core);
      return [(prev === '1' || prev === '-1' ? sing : plur).split(' '), 1, trail];
    }
    if (prevNum && low === 'in' && dot) return [[prev === '1' ? 'inch' : 'inches'], 1, keepDot !== trail ? keepDot.slice(1) : trail];
    if (prevNum && ['ft', 'lbs', 'lb', 'oz', 'hrs', 'hr', 'mins', 'min', 'secs', 'sec', 'yrs', 'yr', 'tsp', 'tbsp', 'mi', 'yds', 'yd', 'gal', 'qt'].includes(low) && dot) {
      let w = get(WORD_ABBR, low);
      if (prev !== '1' && prev !== '-1') {
        w = { foot: 'feet', inch: 'inches', pound: 'pounds', ounce: 'ounces', hour: 'hours', minute: 'minutes', second: 'seconds', year: 'years', teaspoon: 'teaspoons', tablespoon: 'tablespoons', mile: 'miles', yard: 'yards', gallon: 'gallons', quart: 'quarts' }[w] || w;
      }
      return [[w], 1, !(i + 1 >= toks.length || nxtCap) ? trail.slice(1) : trail];
    }

    // -- abbreviations with a full stop
    if (dot || low === 'e.g') {
      const key = low;
      if (key === 'e.g') return [WORD_ABBR.get(key).split(' '), 1, dot ? trail.slice(1) : trail];
      if (key === 'no' && (core === 'No' || core === 'no') && (nxtNum || nxt.startsWith('#'))) return [['number'], 1, trail.slice(1)];
      if ((key === 'st' || key === 'dr') && startsUpper(core)) {
        if ((prevCap || prevNum) && !prevEnd && !(nxtCap && i + 1 < toks.length && trail === '.')) {
          return [[STREET_ABBR.get(key)], 1, plen(trail) === 1 ? keepDot : trail.slice(1)];
        }
        if (key === 'st' && nxtCap && trail === '.') return [['Saint'], 1, ''];
        return null;
      }
      if ((key === 'jr' || key === 'sr') && startsUpper(core) && prevCap) return [[STREET_ABBR.get(key)], 1, keepDot];
      if (TITLE_ABBR.has(key) && startsUpper(core) && (nxtCap || nxtNum)) {
        if (key === 'ft' && !nxtCap) return null;
        return [[TITLE_ABBR.get(key)], 1, trail.slice(1)];
      }
      if (STREET_ABBR.has(key) && startsUpper(core) && !['st', 'dr', 'jr', 'sr'].includes(key) && (prevCap || prevNum)) return [[STREET_ABBR.get(key)], 1, keepDot];
      if (MONTH_ABBR.has(key) && startsUpper(core) && (nxtNum || prevNum)) return [[at(MONTHS, MONTH_ABBR.get(key) - 1)], 1, keepDot];
      if (DAY_ABBR.has(key) && startsUpper(core)) return [[DAY_ABBR.get(key)], 1, keepDot];
      if (['vs', 'approx', 'apt', 'dept', 'est', 'fig', 'vol', 'ch', 'pp', 'ca', 'cf', 'corp', 'govt', 'intl', 'misc'].includes(key)
          && (key !== 'ch' || nxtNum) && (key !== 'est' || nxtNum)
          && (!['fig', 'vol', 'pp', 'apt'].includes(key) || nxtNum || startsUpper(nxt))) {
        return [WORD_ABBR.get(key).split(' '), 1, !(i + 1 >= toks.length || nxtCap) ? trail.slice(1) : trail];
      }
    }
    const dayOrd = /^\p{Nd}{1,2}(st|nd|rd|th)?$/u;
    if ((MONTH_ABBR.has(low) && startsUpper(core) && isalpha(core) && nxtNum && dayOrd.test(nxt) && !['mar', 'jun'].includes(low))
        || (['mar', 'jun'].includes(low) && startsUpper(core) && dayOrd.test(nxt))) {
      return [[at(MONTHS, MONTH_ABBR.get(low) - 1)], 1, trail];
    }
    if (low === 'vs') return [['versus'], 1, trail];

    // -- Roman numerals
    if (ROMAN.test(core) && isupper(core)) {
      const v = romanValue(core);
      const pl = lower(prev);
      if (v && REGNAL.has(pl) && startsUpper(prev) && (plen(core) > 1 || trail || !nxt || lower(nxt) === 'of')) return [['the', ordinal(v)], 1, trail];
      if ((v && ROMAN_CUE.has(pl) && startsUpper(prev) && (plen(core) > 1 || ['V', 'X'].includes(core)))
          || (v && ROMAN_CUE.has(pl) && core === 'I' && (trail || !nxt))) {
        return [[cardinal(v)], 1, trail];
      }
      if (v && plen(core) > 1 && !ROMAN_AMBIGUOUS.has(core) && startsUpper(prev) && isalpha(prev) && !isupper(prev)) return [[cardinal(v)], 1, trail];
    }

    // -- names, brands, heteronyms
    const plain = stripOkina(core);
    if (SAY_AS_CASED.has(core)) return [[core + PH + SAY_AS_CASED.get(core)], 1, trail];
    if (SAY_AS.has(lower(plain)) && isalpha(plain.replaceAll('-', '')) && (!['kea', 'lanai'].includes(lower(plain))
        || lower(prev) === 'mauna' || startsUpper(plain))) {
      return [[plain + PH + SAY_AS.get(lower(plain))], 1, trail];
    }
    const pl = lower(prev);
    if (VERB_FORMS.has(low) && VERB_BEFORE.has(pl) && (low !== 'live' || ['i', 'eye'].includes(pl)) && (low !== 'present' || pl === 'please')) {
      return [[core + PH + VERB_FORMS.get(low)], 1, trail];
    }
    if (low === 'close' && (VERB_BEFORE.has(pl) || prevEnd) && OBJECTS.has(lower(nxt))) return [[core + PH + 'klˈOz'], 1, trail];
    if (low === 'bow' && ((['a', 'his', 'her', 'their', 'final'].includes(pl) && ['take', 'took', 'takes', 'taking', 'a'].includes(prev2))
        || ['down', 'before', 'deeply', 'low'].includes(lower(nxt)))) {
      return [[core + PH + 'bˈW'], 1, trail];
    }
    if (low === 'wound' && (['up', 'down', 'around', 'round', 'through', 'back'].includes(lower(nxt)) || OBJECTS.has(lower(nxt)))
        && !['the', 'a', 'his', 'her', 'my', 'your', 'our', 'their', 'its', 'this', 'that', 'open', 'deep', 'fresh', 'stab', 'gunshot', 'head', 'old'].includes(pl)) {
      return [[core + PH + 'wˈWnd'], 1, trail];
    }
    if (low === 'dove' && (SUBJECTS.has(pl) || ['into', 'in', 'under', 'off', 'for', 'down', 'through', 'onto', 'deep', 'headfirst', 'back'].includes(lower(nxt)))) {
      return [[core + PH + 'dˈOv'], 1, trail];
    }
    if (low === 'bass' && (['largemouth', 'smallmouth', 'striped', 'sea', 'rock', 'peacock'].includes(pl)
        || (pl === 'a' && ['caught', 'catch', 'catching', 'landed', 'hooked'].includes(prev2))
        || ['fishing', 'fisherman', 'boat', 'lure', 'lures', 'pond'].includes(lower(nxt)))) {
      return [[core + PH + 'bˈæs'], 1, trail];
    }
    if (isEmoji(core)) return [[], 1, trail];
    const said = this.homograph(core, toks, i);
    if (said) return [[core + PH + said], 1, trail];
    return null;
  }

  pairs(d) {
    const a = cps(d);
    if (a.length === 4 && a[2] + a[3] !== '00' && a[0] !== '0') return [a[0] + a[1], a[2] !== '0' ? a[2] + a[3] : 'oh ' + a[3]];
    return [d];
  }
}
