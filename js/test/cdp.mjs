// Headless Chrome over the DevTools protocol on a pipe (no port, no window, never takes focus), muted.
//   const b = await launch(); const p = await b.page(); await p.goto(url); await p.eval('1 + 1'); b.close();
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch({ args = [] } = {}) {
  const profile = mkdtempSync(join(process.env.TK_SCRATCH ?? tmpdir(), 'leokani-g2p-cdp-'));
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-pipe', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', `--user-data-dir=${profile}`, ...args, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const [toChrome, fromChrome] = [child.stdio[3], child.stdio[4]];

  let next = 1, buf = '';
  const waiting = new Map();
  const listeners = new Set();
  fromChrome.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && waiting.has(msg.id)) {
        const { resolve, reject, method } = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const l of listeners) l(msg);
      }
    }
  });
  const exited = new Promise((r) => child.on('exit', r));
  exited.then(() => { for (const { reject, method } of waiting.values()) reject(new Error(`${method}: Chrome exited\n${stderr.slice(-2000)}`)); });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = next++;
    waiting.set(id, { resolve, reject, method });
    toChrome.write(`${JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })}\0`);
  });

  async function page() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    const events = [];
    const on = (fn) => { const l = (m) => { if (m.sessionId === sessionId) fn(m); }; listeners.add(l); return () => listeners.delete(l); };
    on.all = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
    on((m) => events.push(m));
    await Promise.all([s('Page.enable'), s('Runtime.enable'), s('Network.enable'), s('Log.enable')]);
    const waitFor = (method, timeout = 30000) => new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error(`timeout waiting for ${method}`)); }, timeout);
      const off = on((m) => { if (m.method === method) { clearTimeout(t); off(); resolve(m.params); } });
    });
    return {
      send: s,
      sessionId,
      on,
      events,
      async goto(url) {
        const loaded = waitFor('Page.loadEventFired');
        const r = await s('Page.navigate', { url });
        if (r.errorText) throw new Error(`${url}: ${r.errorText}`);
        await loaded;
      },
      async eval(expression, timeout = 120000) {
        const r = await Promise.race([
          s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`eval timeout: ${expression.slice(0, 80)}`)), timeout)),
        ]);
        if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
        return r.result.value;
      },
      viewport: (width, height, mobile = false) => s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile }),
      scheme: (value) => s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] }),
      async screenshot() {
        const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        return Buffer.from(data, 'base64');
      },
      // Every URL the page requested, and every uncaught exception or console error.
      requests: () => events.filter((m) => m.method === 'Network.requestWillBeSent').map((m) => m.params.request.url),
      errors: () => events.flatMap((m) => {
        if (m.method === 'Runtime.exceptionThrown') return [m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text];
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') return [m.params.entry.text];
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') return [m.params.args.map((a) => a.value ?? a.description).join(' ')];
        return [];
      }),
      // Workers this page starts (and theirs): each is attached paused, gets setup(send) (its own Network.enable
      // etc.), then runs. Network conditions and blocked URLs set on the page reach worker fetches only this way.
      async followWorkers(setup = async () => {}) {
        const attach = async (parent) => {
          on.all((m) => {
            if (m.sessionId !== parent || m.method !== 'Target.attachedToTarget') return;
            const child = m.params.sessionId;
            const cs = (method, params) => send(method, params, child);
            (async () => {
              try { await cs('Network.enable'); await setup(cs); await attach(child); } catch {}
              cs('Runtime.runIfWaitingForDebugger').catch(() => {});
            })();
          });
          await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, parent);
        };
        await attach(sessionId);
      },
      close: () => send('Target.closeTarget', { targetId }),
    };
  }

  // send/onAny: raw protocol access, for targets a page spawns (workers attach with their own sessionId).
  const onAny = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  return {
    page,
    send,
    onAny,
    version: () => send('Browser.getVersion'),
    async close() {
      try { await Promise.race([send('Browser.close'), new Promise((r) => setTimeout(r, 2000))]); } catch {}
      child.kill();
      await exited;
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    },
  };
}
