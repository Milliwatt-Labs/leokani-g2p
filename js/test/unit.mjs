// Pure-logic checks (no model): Python string semantics, the long-word splitter, the user lexicon's rules.
import assert from 'node:assert/strict';
import { pyRound, pyInt, isdigit, isupper, islower, splitWs, cmpCp, PyError } from '../src/py.mjs';
import { splitLong, chunks, pieces, clean } from '../src/g2p.mjs';
import { UserLexicon, UserLexiconError } from '../src/userlex.mjs';
import { Normalizer } from '../src/normalize.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('round half to even', () => { assert.equal(pyRound(10.5), 10); assert.equal(pyRound(11.5), 12); assert.equal(pyRound(2.4), 2); assert.equal(pyRound(2.6), 3); });
t('int()', () => { assert.equal(pyInt(' 42 '), 42); assert.equal(pyInt('٣'), 3); assert.equal(pyInt('1_000'), 1000); assert.throws(() => pyInt('²'), PyError); assert.throws(() => pyInt(''), PyError); });
t('isdigit', () => { assert.ok(isdigit('²')); assert.ok(isdigit('12')); assert.ok(!isdigit('')); assert.ok(!isdigit('1a')); });
t('isupper / islower', () => { assert.ok(isupper('ABC1')); assert.ok(!isupper('1')); assert.ok(!isupper('Ab')); assert.ok(islower('ß')); assert.ok(!islower('ǅ')); });
t('split()', () => assert.deepEqual(splitWs(' a b\tc  '), ['a', 'b', 'c']));
t('split() keeps U+FEFF, splits on \\x1c and \\x85', () => {
  assert.deepEqual(splitWs('a\uFEFFb'), ['a\uFEFFb']);
  assert.deepEqual(splitWs('a\x1cb\x85c\u2028d'), ['a', 'b', 'c', 'd']);
});
t('code point order', () => assert.deepEqual(['�', '😀', 'a'].sort(cmpCp), ['a', '�', '😀']));
t('long words', () => { assert.deepEqual(splitLong('short'), ['short']); assert.equal(splitLong('a'.repeat(21)).join(''), 'a'.repeat(21)); assert.ok(splitLong('supercalifragilisticexpialidocious').length === 3); });
t('chunks', () => assert.deepEqual(chunks('Dr. Smith is here. Yes. No.'), ['Dr. Smith is here.', 'Yes.', 'No.']));
t('pieces', () => assert.deepEqual(pieces('Well, I read it yesterday.'), ['Well', ',', 'eye red it yesterday', '.']));
t('clean', () => assert.equal(clean('**bold**  _x_ `c`'), 'bold x c'));

const sym = new Set([...'ˈˌabdefhiklmnoprstuvwzæðŋɑɔəɛɡɪɹʃʊʌʒʤʧθᵻAIOW']);
t('user lexicon: slash rule and objects', () => {
  assert.deepEqual(UserLexicon.parse('/ʤˈɪf/'), { kind: 'phonemes', value: 'ʤˈɪf' });
  assert.deepEqual(UserLexicon.parse(' shi  vawn '), { kind: 'say', value: 'shi vawn' });
  assert.deepEqual(UserLexicon.parse({ say: 'T N U' }), { kind: 'say', value: 'T N U' });
  assert.throws(() => UserLexicon.parse({ phonemes: 'a', say: 'b' }), UserLexiconError);
  assert.throws(() => UserLexicon.parse('//'), UserLexiconError);
});
t('user lexicon: case', () => {
  const u = new UserLexicon({ nguyen: 'win', US: 'U S', us: '/ʌs/' }, { symbols: sym });
  assert.equal(u.rewrite('NGUYEN').value, 'win');
  assert.equal(u.rewrite('US').value, 'U S');
  assert.equal(u.rewrite('Us').value, 'ʌs');
});
t('user lexicon: possessives', () => {
  const u = new UserLexicon({ Gauss: '/ɡˈWs/', Jules: '/ʤˈulz/', Kate: '/kˈAt/', Siobhan: 'shivawn', Bo: '/bˈO/' }, { symbols: sym });
  assert.equal(u.rewrite("Gauss's").value, 'ɡˈWsᵻz');
  assert.equal(u.rewrite('Kate’s').value, 'kˈAts');
  assert.equal(u.rewrite("Bo's").value, 'bˈOz');
  assert.equal(u.rewrite("Jules'").value, 'ʤˈulz');
  assert.equal(u.rewrite("Siobhan's").value, "shivawn's");
  assert.equal(u.rewrite("gauss's"), null);
});
t('user lexicon: keys', () => {
  const u = new UserLexicon(null, { symbols: sym });
  u.add('Mx.', 'mix');
  assert.equal(u.rewrite('Mx').value, 'mix');
  assert.throws(() => u.add('two words', 'x'), UserLexiconError);
  assert.throws(() => u.add('x', '/qX/'), /unknown phoneme symbols X q/);
  assert.ok(u.delete('Mx.'));
  assert.equal(u.size, 0);
});
t('user lexicon: TSV', () => {
  const u = new UserLexicon(null, { symbols: sym }).loadTSV('﻿# names\n\nGauss\t/ɡˈWs/\r\nnyc\tNew York City\n');
  assert.equal(u.size, 2);
  assert.throws(() => new UserLexicon().loadTSV('a b\n', 'x.tsv'), /x.tsv:1: expected key<TAB>value/);
  assert.equal(new UserLexicon().load('{"format":"leokani-g2p-user/1","words":{"a":"b"}}').size, 1);
});
t('user lexicon in the normaliser', () => {
  const nm = new Normalizer();
  nm.user = new UserLexicon({ Gauss: '/ɡˈWs/', BBC: 'B B C', 'C++': 'C plus plus' }, { symbols: sym });
  assert.equal(nm.normalize("(Gauss's) BBC, C++."), "(Gauss'sɡˈWsᵻz) B B C, C plus plus.");
});
console.log(`unit: ${n} passed`);
