/**
 * Static-export playback check for the ads gallery and the home featured ads.
 * Serves `out/` and drives Playwright Chromium and WebKit.
 *
 * Requires a production build first: npm run build
 * Browsers: npx playwright install chromium webkit
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { VIDEO_VERSION } from '../lib/video.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
const shots = process.env.PLAYBACK_SHOTS || '/tmp/ads-playback';
const port = Number(process.env.PLAYBACK_PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const pages = [
  { path: '/ar/ads/', root: null, label: 'ar ads' },
  { path: '/en/ads/', root: null, label: 'en ads' },
  { path: '/ar/#sample-ads', root: '#sample-ads', label: 'ar home featured' },
  { path: '/en/#sample-ads', root: '#sample-ads', label: 'en home featured' },
];

function fail(message) {
  throw new Error(message);
}

function videoTags(html) {
  return html.match(/<video\b[^>]*>/gi) || [];
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?`, 'i'));
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? '';
}

function assertStaticMarkup(html, file) {
  const tags = videoTags(html);
  if (!tags.length) fail(`${file} has no <video>`);
  if (file.endsWith(`${path.sep}ads${path.sep}index.html`) && tags.length !== 50) {
    fail(`${file} expected 50 videos, found ${tags.length}`);
  }
  for (const tag of tags) {
    for (const name of ['autoplay', 'muted', 'playsinline', 'loop']) {
      if (attr(tag, name) === null) fail(`${file} video missing ${name}: ${tag.slice(0, 240)}`);
    }
    const poster = attr(tag, 'poster');
    const dataSrc = attr(tag, 'data-src');
    const preload = attr(tag, 'preload');
    if (!poster || !poster.endsWith('.webp')) fail(`${file} video poster is not a cover image: ${poster}`);
    if (!dataSrc || !dataSrc.endsWith(`.mp4?v=${VIDEO_VERSION}`)) fail(`${file} video data-src is not a versioned mp4: ${dataSrc}`);
    if (preload !== 'none') fail(`${file} video preload should stay none until a card is near the viewport, got ${preload}`);
    if (attr(tag, 'src') !== null) fail(`${file} video has src in the static HTML (should stay lazy): ${tag.slice(0, 240)}`);
  }
  return tags.length;
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let rel = clean.replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const full = path.resolve(outDir, rel);
  if (full !== outDir && !full.startsWith(outDir + path.sep)) return null;
  return full;
}

function sendFile(req, res, file) {
  stat(file).then((info) => {
    if (info.isDirectory()) {
      res.writeHead(301, { Location: `${req.url.replace(/\/?$/, '/')}` });
      res.end();
      return;
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const size = info.size;
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': size,
      'Accept-Ranges': 'bytes',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  }).catch(() => {
    res.writeHead(404);
    res.end('not found');
  });
}

function startServer() {
  const server = createServer((req, res) => {
    const file = resolveFile(req.url || '/');
    if (!file || !existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    sendFile(req, res, file);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function visibleScript(rootSelector) {
  const root = rootSelector ? document.querySelector(rootSelector) : document;
  if (!root) return { missing: true, rows: [], total: 0, scrollY: window.scrollY };
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const videos = [...root.querySelectorAll('video[data-src]')];
  const rows = videos.map((video, index) => {
    const rect = video.getBoundingClientRect();
    const visH = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    const visW = Math.min(rect.right, vw) - Math.max(rect.left, 0);
    const style = getComputedStyle(video);
    // A card counts as on screen only when a real slice is visible. WebKit does
    // not advance currentTime for videos that are merely near the fold.
    const onScreen = visH >= Math.max(48, rect.height * 0.2) && visW >= Math.max(80, rect.width * 0.2);
    const near = rect.width > 40 && rect.height > 40 && rect.bottom > 0 && rect.top < vh + 220 && rect.right > 0 && rect.left < vw;
    let sig = null;
    if (onScreen && video.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 24;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      try {
        ctx.drawImage(video, 0, 0, 16, 24);
        const data = ctx.getImageData(0, 0, 16, 24).data;
        sig = 0;
        for (let i = 0; i < data.length; i += 16) sig = (sig + data[i] + data[i + 1] * 3 + data[i + 2] * 7) % 1000003;
      } catch (err) {
        sig = null;
      }
    }
    return {
      index,
      onScreen,
      near,
      visible: onScreen,
      src: video.getAttribute('src') || '',
      poster: video.getAttribute('poster') || '',
      paused: video.paused,
      t: video.currentTime,
      ready: video.readyState,
      opacity: style.opacity,
      visibility: style.visibility,
      display: style.display,
      autoplay: video.hasAttribute('autoplay'),
      mutedAttr: video.hasAttribute('muted'),
      muted: video.muted,
      playsinline: video.hasAttribute('playsinline'),
      loop: video.hasAttribute('loop'),
      error: video.error ? String(video.error.code) : '',
      width: video.videoWidth,
      sig,
    };
  });
  const last = videos[videos.length - 1];
  const lastTop = last ? last.getBoundingClientRect().top : 0;
  return {
    missing: false,
    total: videos.length,
    scrollY: window.scrollY,
    rows,
    visible: rows.filter((row) => row.onScreen).length,
    near: rows.filter((row) => row.near).length,
    lastFar: Boolean(last) && lastTop > vh + 240,
    lastSrc: last ? last.getAttribute('src') : null,
  };
}

async function readState(page, rootSelector) {
  return page.evaluate(visibleScript, rootSelector);
}

function assertArmed(state, label) {
  if (state.missing) fail(`${label}: section missing`);
  const near = state.rows.filter((row) => row.near);
  if (!near.length) fail(`${label}: no video is in or near the viewport\n${JSON.stringify(state.rows.slice(0, 6))}`);
  const missing = near.filter((row) => !row.src || !row.poster.endsWith('.webp') || !row.autoplay || !row.mutedAttr || !row.muted || !row.playsinline || !row.loop || row.opacity !== '1' || row.visibility === 'hidden' || row.display === 'none');
  if (missing.length) {
    fail(`${label}: ${missing.length} nearby videos were not armed\n${JSON.stringify(missing, null, 2)}`);
  }
  return near;
}

function assertPlayingState(state, label) {
  const onScreen = state.rows.filter((row) => row.onScreen);
  if (!onScreen.length) return [];
  const bad = onScreen.filter((row) => (
    !row.src
    || row.paused
    || row.t <= 0
    || row.ready < 2
    || row.width < 2
    || row.error
  ));
  if (bad.length) {
    fail(`${label}: ${bad.length}/${onScreen.length} on-screen videos are not playing\n${JSON.stringify(bad, null, 2)}`);
  }
  return onScreen;
}

async function waitUntilPlaying(page, rootSelector, label) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 15000) {
    last = await readState(page, rootSelector);
    const onScreen = last.rows.filter((row) => row.onScreen);
    const near = last.rows.filter((row) => row.near);
    const onScreenReady = onScreen.every((row) => row.src && !row.paused && row.t > 0.05 && row.ready >= 2 && row.width > 0 && !row.error);
    const nearReady = near.length > 0 && near.every((row) => row.src) && near.some((row) => !row.paused || row.t > 0);
    if (onScreenReady && nearReady) return last;
    await page.waitForTimeout(200);
  }
  assertArmed(last, label);
  assertPlayingState(last, label);
  return last;
}

async function assertMotion(page, rootSelector, label) {
  const before = await waitUntilPlaying(page, rootSelector, label);
  assertArmed(before, label);
  const beforeOnScreen = assertPlayingState(before, label);
  if (!beforeOnScreen.length) {
    const started = before.rows.filter((row) => row.near && row.src && !row.paused);
    if (!started.length) fail(`${label}: nearby videos did not start`);
    return { visible: 0, started: started.length, total: before.total };
  }
  await page.waitForTimeout(500);
  const after = await readState(page, rootSelector);
  assertArmed(after, label);
  const afterOnScreen = assertPlayingState(after, `${label} after 500ms`);
  const stuck = afterOnScreen.filter((row) => {
    const prev = before.rows[row.index];
    if (!prev) return true;
    return !(row.t > prev.t + 0.04 || (row.t + 0.2 < prev.t && row.t > 0));
  });
  if (stuck.length) {
    fail(`${label}: playhead did not advance on ${stuck.length} on-screen videos\nbefore ${JSON.stringify(beforeOnScreen)}\nafter ${JSON.stringify(afterOnScreen)}`);
  }
  return { visible: afterOnScreen.length, started: after.rows.filter((row) => row.near && row.src).length, total: after.total };
}

async function openPage(page, item) {
  await page.goto(`http://127.0.0.1:${port}${item.path}`, { waitUntil: 'load' });
  await page.waitForSelector('video[data-src]');
  if (!item.root) {
    const y = await page.evaluate(() => window.scrollY);
    if (y > 1) fail(`${item.label} scrolled on load (${y}px); playback must start without scrolling`);
  } else {
    await page.waitForFunction((selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    }, item.root);
  }
}

async function runHappy(browser, viewport, item) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.width < 800,
    isMobile: viewport.width < 800,
  });
  const page = await context.newPage();
  try {
    await openPage(page, item);
    const result = await assertMotion(page, item.root, `${viewport.name} ${item.label}`);
    if (!item.root && viewport.width >= 1000 && result.visible < 4) {
      fail(`${viewport.name} ${item.label}: expected at least 4 on-screen videos playing, saw ${result.visible}`);
    }
    if (!item.root && viewport.width < 1000 && result.started < 2) {
      fail(`${viewport.name} ${item.label}: expected the first mobile row to start, saw ${result.started}`);
    }
    const state = await readState(page, item.root);
    if (!item.root && state.lastFar && state.lastSrc) {
      fail(`${viewport.name} ${item.label}: a far offscreen video loaded ${state.lastSrc}`);
    }
    const file = path.join(shots, `${viewport.name}-${item.label.replace(/\s+/g, '-')}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`ok ${viewport.name} ${item.label}: ${result.visible} on screen, ${result.started} started / ${result.total}`);
  } finally {
    await context.close();
  }
}

async function runReduced(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPage(page, pages[0]);
    const result = await assertMotion(page, null, 'reduced-motion ar ads');
    const buttons = await page.locator('.vcard-play').count();
    if (buttons !== 0) fail(`reduced motion showed ${buttons} play buttons even though playback started`);
    console.log(`ok reduced-motion ar ads: ${result.visible} playing, no play button`);
  } finally {
    await context.close();
  }
}

async function runBlocked(browser, browserName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const origPlay = HTMLMediaElement.prototype.play;
    const origPause = HTMLMediaElement.prototype.pause;
    let allow = false;
    HTMLMediaElement.prototype.play = function play() {
      if (!allow) return Promise.reject(new DOMException('The play method is not allowed', 'NotAllowedError'));
      return origPlay.apply(this, arguments);
    };
    addEventListener('pointerdown', () => { allow = true; }, true);
    // The autoplay attribute can start playback without going through the
    // patched play(). Keep those videos paused so the tap button stays up.
    const neuter = () => {
      if (allow) return;
      document.querySelectorAll('video').forEach((video) => {
        video.autoplay = false;
        video.removeAttribute('autoplay');
        if (!video.paused) origPause.call(video);
      });
    };
    const arm = () => {
      new MutationObserver(neuter).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      setInterval(neuter, 50);
    };
    if (document.documentElement) arm();
    else addEventListener('DOMContentLoaded', arm);
  });
  const page = await context.newPage();
  try {
    await openPage(page, pages[0]);
    const button = page.locator('.vcard-play').first();
    await button.waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(300);
    const box = await button.boundingBox();
    if (!box || box.width < 64 || box.height < 64) {
      fail(`play button is not prominent: ${JSON.stringify(box)}`);
    }
    const y = await page.evaluate(() => window.scrollY);
    if (y > 1) fail('blocked-autoplay page scrolled');
    await page.screenshot({ path: path.join(shots, `${browserName}-play-button.png`) });
    await button.click();
    await page.waitForFunction(() => {
      const articles = [...document.querySelectorAll('article.vcard')];
      return articles.some((article) => {
        const video = article.querySelector('video');
        return video && video.currentTime > 0.05 && !article.querySelector('.vcard-play');
      });
    }, { timeout: 8000 });
    console.log(`ok ${browserName} play button: visible ${Math.round(box.width)}px, click starts playback`);
  } finally {
    await context.close();
  }
}

async function runTall(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1280 } });
  const page = await context.newPage();
  try {
    await openPage(page, pages[0]);
    const result = await assertMotion(page, null, 'tall ar ads');
    if (result.visible < 12) fail(`tall viewport showed ${result.visible} on-screen videos, expected at least 12 playing`);
    console.log(`ok tall 1440x1280 ar ads: ${result.visible} on screen, ${result.started} started`);
  } finally {
    await context.close();
  }
}

async function main() {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(shots, { recursive: true });
  if (!existsSync(path.join(outDir, 'ar', 'ads', 'index.html'))) {
    fail('Missing out/ar/ads/index.html. Run npm run build first.');
  }
  const files = [
    ['ar', 'ads', 'index.html'],
    ['en', 'ads', 'index.html'],
    ['ar', 'index.html'],
    ['en', 'index.html'],
  ];
  for (const parts of files) {
    const file = path.join(outDir, ...parts);
    const html = await (await import('node:fs/promises')).readFile(file, 'utf8');
    const count = assertStaticMarkup(html, file);
    console.log(`ok static ${parts.join('/')}: ${count} videos with autoplay, muted, playsinline, loop, poster, lazy data-src`);
  }

  const server = await startServer();
  const browsers = [
    ['chromium', await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] })],
    ['webkit', await webkit.launch()],
  ];
  try {
    for (const [name, browser] of browsers) {
      for (const viewport of viewports) {
        for (const item of pages) {
          await runHappy(browser, viewport, item);
        }
      }
      await runReduced(browser);
      await runBlocked(browser, name);
      await runTall(browser);
    }
  } finally {
    for (const [, browser] of browsers) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('playback checks passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
