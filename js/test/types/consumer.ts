// Compiled by test/types.mjs (tsc --noEmit, strict): the declarations cover the documented API.
import { load, UserLexicon, UserLexiconError, phonemize, FORMAT, USER_FORMAT, type UserLexiconDocument, type PieceWords } from 'leokani-g2p';

async function main(): Promise<void> {
  const doc: UserLexiconDocument = { format: 'leokani-g2p-user/1', words: { Siobhan: 'shivawn', GIF: { phonemes: 'ʤˈɪf' }, BBC: { say: 'B B C' } } };
  const g2p = await load({ userLexicon: doc, threads: 1, backend: 'auto' });
  g2p.addPronunciation('Nguyen', 'win').loadUserLexicon('Kate\t/kˈAt/\n', { format: 'tsv' });
  const removed: boolean = g2p.removePronunciation('Nguyen');
  const s: string = await g2p.phonemize('Siobhan reads.');
  const c: string[] = await g2p.phonemizeChunks('One. Two.');
  const w: PieceWords = await g2p.pieceWords('hello world');
  const src: 'lexicon' | 'oov' | 'number' | 'symbol' | 'empty' = w.sources[0];
  const u = new UserLexicon({ a: '/ə/' }).add('b', { say: 'bee' });
  const e = u.rewrite("a's");
  if (e) { const k: 'phonemes' | 'say' = e.kind; void k; }
  const f: 'leokani-g2p/1' = FORMAT; const uf: 'leokani-g2p-user/1' = USER_FORMAT;
  void [removed, s, c, src, f, uf, await phonemize('x'), u.toJSON().words, new UserLexiconError('x') instanceof Error];
  await g2p.dispose();
}
void main;
