/**
 * Catch a looping home-page section that cannot actually loop.
 *
 * WHY THIS EXISTS
 * ---------------
 * A marquee is its track repeated and translated by exactly one copy. The wrap
 * is only invisible if the copies BEHIND the travel still cover the frame. That
 * is a sum over three things no stylesheet states — item width, item count and
 * viewport width — so it cannot be read off the CSS, and it is wrong in a
 * direction nobody tests: the copy that fits on a phone is dwarfed by a desktop
 * container.
 *
 * It shipped wrong once, on the desktop side of a setting whose entire purpose
 * is that the two sides differ. At 1440px the trust strip's four chips were
 * 631px inside a 1336px band, so a 705px hole swept through the loop once every
 * cycle; the category tiles left a 312px one. Both were invisible at the phone
 * widths where looping already existed, and invisible to every other check in
 * tools/ because nothing there lays out a page.
 *
 * WHY IT IS THE ONE TOOL HERE THAT IS NOT PYTHON
 * ----------------------------------------------
 * It needs a browser to do the laying out, and it talks to one over the Chrome
 * DevTools Protocol. Node ships a WebSocket client; Python does not, and adding
 * a dependency to a repository that has none would cost more than this saves.
 * There is nothing to install: it serves the repo itself and drives whichever
 * of Edge or Chrome is already on the machine.
 *
 * IT SKIPS RATHER THAN FAILS when there is no browser to drive. A missing
 * browser is not a broken layout, and a check that goes red on a machine that
 * simply cannot run it teaches people to ignore it.
 *
 * Usage:  node tools/loop-check.mjs
 *         exit 1 only on a loop measured to have a gap
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Both ports are assigned by the OS rather than picked. A hard-coded port is a
   check that skips itself on whichever machine happens to be using it, and a
   check that skips is a check nobody notices has stopped running. */

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/* Every section that can be told to loop, and the pair of elements the loop is
   built from. Add a section here when you add one to HomeLayout::SECTIONS with
   a `loop` style — otherwise it goes unmeasured, which is how the first two got
   through. */
const LOOPABLE = [
  ['trust', '[data-trust-marquee]', '[data-trust-track]'],
  ['category', '[data-cat-viewport]', '.home-cat-grid'],
  ['brands', '[data-brand-viewport]', '.brand-wall'],
  ['testimonials', '[data-testi-viewport]', '[data-testi-track]'],
];

/* Both sides of the 768px line, and a narrow phone: the failure is a function
   of viewport width, so one width proves nothing about the other. */
const WIDTHS = [
  { label: 'phone 360', width: 360, height: 780, mobile: true },
  { label: 'phone 390', width: 390, height: 844, mobile: true },
  { label: 'desktop 1280', width: 1280, height: 900, mobile: false },
  { label: 'desktop 1440', width: 1440, height: 900, mobile: false },
  { label: 'desktop 1920', width: 1920, height: 1080, mobile: false },
];

const PROBE = `(() => {
  const out = { lay: document.documentElement.getAttribute('data-lay'), loops: [],
    docW: document.documentElement.scrollWidth, winW: window.innerWidth };
  for (const [name, vSel, tSel] of ${JSON.stringify(LOOPABLE)}) {
    const v = document.querySelector(vSel), t = document.querySelector(tSel);
    if (!v || !t) { out.loops.push({ name, missing: true }); continue; }
    if (!v.classList.contains('is-looping')) { out.loops.push({ name, off: true }); continue; }
    const clones = t.querySelectorAll('.is-marquee-clone').length;
    const originals = t.children.length - clones;
    const copies = originals ? t.children.length / originals : 1;
    out.loops.push({ name, copies, copyW: Math.round(t.scrollWidth / copies),
      frameW: Math.round(v.clientWidth) });
  }
  return JSON.stringify(out);
})()`;

function serve() {
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(ROOT, rel || 'index.html');
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok, no) => {
    server.on('error', no);
    server.listen(0, '127.0.0.1', () => ok(server));
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); }
  static async attach(port) {
    for (let tries = 0; tries < 40; tries++) {
      try {
        const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const ws = new WebSocket(info.webSocketDebuggerUrl);
        await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
        const cdp = new CDP(ws);
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          const p = cdp.waiting.get(m.id);
          if (!p) return;
          cdp.waiting.delete(m.id);
          m.error ? p.no(new Error(JSON.stringify(m.error))) : p.ok(m.result);
        };
        return cdp;
      } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    return null;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    return new Promise((ok, no) => this.waiting.set(id, { ok, no }));
  }
}

async function main() {
  const browser = BROWSERS.find((p) => existsSync(p));
  if (!browser) {
    console.log('  no Edge or Chrome found — skipping (this check needs a browser to lay out a page)');
    return 0;
  }

  let server;
  try { server = await serve(); } catch (err) {
    console.log(`  could not open a local server (${err.code}) — skipping`);
    return 0;
  }
  const port = server.address().port;

  const profile = await mkdtemp(path.join(tmpdir(), 'gr-loopcheck-'));
  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  const problems = [];
  let measured = 0;
  try {
    /* Port 0 means the browser chooses, and writes what it chose into its own
       profile directory. Reading it back is the only way to know. */
    let debugPort = null;
    for (let tries = 0; tries < 60 && !debugPort; tries++) {
      try {
        debugPort = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\s+/)[0];
      } catch { await new Promise((r) => setTimeout(r, 250)); }
    }

    const cdp = debugPort ? await CDP.attach(debugPort) : null;
    if (!cdp) {
      console.log('  the browser never opened its debugging port — skipping');
      return 0;
    }

    // Every loopable section turned on at once: the shapes are independent, so
    // one page load per width measures all of them.
    const lay = LOOPABLE.map(([n]) => `${n}:loop`).join(' ');
    const url = `http://127.0.0.1:${port}/index.html?lay=${encodeURIComponent(lay)}`;

    for (const vp of WIDTHS) {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Emulation.setDeviceMetricsOverride',
        { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile }, sessionId);
      await cdp.send('Page.navigate', { url }, sessionId);
      await new Promise((r) => setTimeout(r, 3500));

      const res = await cdp.send('Runtime.evaluate',
        { expression: PROBE, returnByValue: true }, sessionId);
      await cdp.send('Target.closeTarget', { targetId });
      const data = JSON.parse(res.result.value);

      if (data.docW - data.winW > 1) {
        problems.push(`${vp.label}: the page scrolls sideways (${data.docW} > ${data.winW})`);
      }
      for (const l of data.loops) {
        if (l.missing) { problems.push(`${vp.label}: ${l.name} has lost its markup hooks`); continue; }
        if (l.off) { problems.push(`${vp.label}: ${l.name} was asked to loop and did not`); continue; }
        measured++;
        const behind = Math.round((l.copies - 1) * l.copyW);
        if (behind < l.frameW) {
          problems.push(`${vp.label}: ${l.name} leaves a ${l.frameW - behind}px gap every cycle `
            + `(${l.copies} copies of ${l.copyW}px behind a ${l.frameW}px frame)`);
        }
      }
    }
  } finally {
    proc.kill();
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  if (problems.length) {
    console.log('  looping sections that cannot loop cleanly:');
    problems.forEach((p) => console.log(`    ${p}`));
    console.log();
    console.log('  A loop travels exactly one copy of its track, so the copies behind that');
    console.log('  travel must still cover the frame. marquee.js counts them from measurement;');
    console.log('  a gap here means the item widths or the frame changed under it.');
    return 1;
  }
  console.log(`  ${measured} looping sections measured across ${WIDTHS.length} widths — all seamless`);
  return 0;
}

process.exit(await main());
