// Type declarations: every name declared in src/index.d.ts is exported at runtime, and a strict TypeScript
// consumer (test/types/consumer.ts) compiles against the package. Run: npm run types
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const dts = readFileSync(join(root, 'src/index.d.ts'), 'utf8');
const declared = [...dts.matchAll(/^export declare (?:const|function|class) (\w+)/gm)].map((m) => m[1]);
const nodeOnly = new Set(['loadUserLexiconFile']);
let fail = 0;
for (const [file, mod] of [['src/node.mjs', await import('../src/node.mjs')], ['src/index.mjs', await import('../src/index.mjs')]]) {
  const missing = declared.filter((n) => !(n in mod) && !(file === 'src/index.mjs' && nodeOnly.has(n)));
  console.log(`${file}: ${declared.length} declared, ${missing.length} missing${missing.length ? ': ' + missing.join(', ') : ''}`);
  fail += missing.length;
}

let tsc;
try { tsc = fileURLToPath(import.meta.resolve('typescript/bin/tsc')); } catch { tsc = null; }
if (!tsc) {
  console.log('tsc: typescript not installed (npm install), skipped');
} else {
  const dir = join(process.env.TK_SCRATCH || tmpdir(), `leokani-g2p-types-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const config = {
    compilerOptions: { strict: true, noEmit: true, module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022',
      lib: ['es2022', 'dom'], types: [], skipLibCheck: false, baseUrl: root, paths: { 'leokani-g2p': [join(root, 'src/index.d.ts')] } },
    files: [join(root, 'test/types/consumer.ts'), join(root, 'src/index.d.ts')],
  };
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config));
  try {
    execFileSync(process.execPath, [tsc, '-p', join(dir, 'tsconfig.json')], { stdio: 'pipe' });
    console.log('tsc: test/types/consumer.ts compiles (strict)');
  } catch (e) {
    console.log(`tsc: failed\n${e.stdout}${e.stderr}`); fail++;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(fail ? `types: ${fail} problem(s)` : 'types: ok');
process.exitCode = fail ? 1 : 0;
