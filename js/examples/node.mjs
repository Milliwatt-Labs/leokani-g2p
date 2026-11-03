// node examples/node.mjs "Some text."
import { load } from 'leokani-g2p';

const g2p = await load({ userLexicon: { Siobhan: 'shivawn' } });
const text = process.argv.slice(2).join(' ') || 'Siobhan lands at 7:45 AM. It costs $4.99.';
for (const chunk of await g2p.phonemizeChunks(text)) console.log(chunk);
await g2p.dispose();
