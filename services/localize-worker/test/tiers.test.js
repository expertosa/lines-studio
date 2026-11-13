import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { editRequestBody } from '../src/gemini_edit.js';
import { assertLocalReady, localConfig } from '../src/local_tools.js';
import { renderClaimedJob } from '../src/run.js';
import { fakeClient, localizeJob, tmp } from './helpers.js';

const BIG = Buffer.alloc(4096, 7);

function respond(status, body, type = 'application/json') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-type', type]]),
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
  };
}

/** Fake source CDN + Google Cloud Storage + Vertex Interactions. */
function fakeGoogle({ statuses = ['in_progress', 'completed'], submitStatus = 200, finalStatus } = {}) {
  const calls = [];
  let polls = 0;
  let n = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push({ host: u.host, path: u.pathname, method, search: u.search, body: typeof init.body === 'string' ? init.body : undefined, headers: init.headers || {} });
    if (u.host === 'cdn.example.com') return respond(200, BIG, 'video/mp4');
    if (u.host === 'storage.googleapis.com' && method === 'POST') {
      if (submitStatus === 401) return respond(401, { error: 'nope' });
      return respond(200, { name: u.searchParams.get('name') });
    }
    if (u.host === 'aiplatform.googleapis.com' && method === 'POST') {
      if (submitStatus !== 200) return respond(submitStatus, { error: { message: 'denied' } });
      n += 1;
      polls = 0;
      return respond(200, { id: `int-${n}`, status: 'in_progress' });
    }
    if (u.host === 'aiplatform.googleapis.com' && method === 'GET') {
      const status = finalStatus || statuses[Math.min(polls + 1, statuses.length - 1)];
      polls += 1;
      const body = { id: u.pathname.split('/').pop(), status };
      if (status === 'completed') body.steps = [{ type: 'thought', summary: [] }, { type: 'model_output', content: [{ type: 'video', data: BIG.toString('base64'), mime_type: 'video/mp4' }] }];
      return respond(200, body);
    }
    return respond(404, { error: 'unexpected host' });
  };
  return { fetchImpl, calls };
}

/** Fake local commands: write a real-sized file wherever a tool is told to write. */
function fakeRun({ voiceSeconds = 8, videoSeconds = 30, failOn } = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (failOn && cmd === failOn) return { code: 1, stdout: '', stderr: 'boom' };
    if (cmd === 'ffprobe') {
      const file = args[args.length - 1];
      return { code: 0, stdout: `${/voice/.test(file) ? voiceSeconds : videoSeconds}\n`, stderr: '' };
    }
    const outIdx = Math.max(args.indexOf('--out'), args.indexOf('--write-media'));
    const out = outIdx >= 0 ? args[outIdx + 1] : args[args.length - 1];
    fs.writeFileSync(out, BIG);
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

const LOCAL_ENV = { LINES_EDGE_TTS_BIN: '/mpt/.venv/bin/edge-tts', LINES_MUSETALK_CMD: '/opt/musetalk/run', LINES_LOCALIZE_MAX_USD: '15' };
const GEMINI = { project: 'lines-test', bucket: 'lines-loc-test', token: 'ya29.fake' };

function deps({ env = LOCAL_ENV, google = fakeGoogle(), runner = fakeRun(), gemini = GEMINI, client = fakeClient() } = {}) {
  return {
    client,
    tmpDir: tmp(),
    runwayKey: '',
    heygenKey: '',
    gemini,
    localConfig: localConfig(env),
    runCmd: runner.run,
    fetchImpl: google.fetchImpl,
    sleep: async () => {},
    geminiPollMs: 1,
    heartbeatMs: 60_000,
    env,
    google,
    runner,
  };
}

const freeJob = (spec = {}) => localizeJob({}, { tier: 'free', swaps: [], captions: { dialect: 'najdi', text: 'هلا والله! قهوتنا الجديدة وصلت.' }, ...spec });
const economyJob = (spec = {}) => localizeJob({}, { tier: 'economy', ...spec });

test('free: missing local voice or lip-sync fails engine_not_configured before any download', async () => {
  const d = deps({ env: { LINES_LOCALIZE_MAX_USD: '15' } });
  const result = await renderClaimedJob(freeJob(), d);
  assert.deepEqual(result, { status: 'failed', code: 'engine_not_configured' });
  assert.equal(d.google.calls.length, 0);
  assert.equal(d.client.calls.some((c) => c[0] === 'upload' || c[0] === 'complete'), false);
  assert.throws(() => assertLocalReady(localConfig({ LINES_EDGE_TTS_BIN: '/x' })), /lip-sync/);
  assert.throws(() => assertLocalReady(localConfig({ LINES_LOCAL_TTS: 'namaa', LINES_MUSETALK_CMD: '/m' })), /NAMAA/);
});

test('free: Edge TTS ar-SA voice + MuseTalk, $0, no vendor calls, real upload', async () => {
  const d = deps();
  const result = await renderClaimedJob(freeJob(), d);
  assert.equal(result.status, 'succeeded', JSON.stringify(d.client.calls));
  assert.equal(result.tier, 'free');
  assert.equal(result.cost.estimateUsd, 0);
  assert.deepEqual(d.google.calls.map((c) => c.host), ['cdn.example.com']);
  const tts = d.runner.calls.find((c) => c[0] === '/mpt/.venv/bin/edge-tts');
  assert.deepEqual(tts.slice(1, 5), ['--voice', 'ar-SA-HamedNeural', '--text', 'هلا والله! قهوتنا الجديدة وصلت.']);
  const lips = d.runner.calls.find((c) => c[0] === '/opt/musetalk/run');
  assert.equal(lips[1], '--video');
  assert.ok(d.client.calls.some((c) => c[0] === 'upload' && c[2] > 1000));
  assert.ok(d.client.calls.some((c) => c[0] === 'complete'));
  assert.ok(result.timings.ttsMs >= 0 && result.timings.lipsyncMs >= 0);
});

test('free: NAMAA-Saudi-TTS is used when selected', async () => {
  const env = { LINES_LOCAL_TTS: 'namaa', LINES_NAMAA_TTS_CMD: '/opt/namaa/tts', LINES_MUSETALK_CMD: '/opt/musetalk/run' };
  const d = deps({ env });
  const result = await renderClaimedJob(freeJob(), d);
  assert.equal(result.status, 'succeeded');
  assert.ok(d.runner.calls.some((c) => c[0] === '/opt/namaa/tts' && c[c.length - 1].endsWith('.wav')));
});

test('free: swaps are refused (tier_unsupported) and a long line fails before lip-sync', async () => {
  const swaps = await renderClaimedJob(freeJob({ swaps: [{ kind: 'background', preset: 'alula' }] }), deps());
  assert.deepEqual(swaps, { status: 'failed', code: 'tier_unsupported' });

  const runner = fakeRun({ voiceSeconds: 40, videoSeconds: 30 });
  const d = deps({ runner });
  const long = await renderClaimedJob(freeJob(), d);
  assert.deepEqual(long, { status: 'failed', code: 'script_too_long' });
  assert.equal(runner.calls.some((c) => c[0] === '/opt/musetalk/run'), false);

  const broken = await renderClaimedJob(freeJob(), deps({ runner: fakeRun({ failOn: '/opt/musetalk/run' }) }));
  assert.deepEqual(broken, { status: 'failed', code: 'lipsync_failed' });
});

test('economy: missing Google config fails engine_not_configured before any paid call', async () => {
  const d = deps({ gemini: { project: 'p', bucket: '', token: '' } });
  const result = await renderClaimedJob(economyJob(), d);
  assert.deepEqual(result, { status: 'failed', code: 'engine_not_configured' });
  assert.equal(d.google.calls.length, 0);
});

test('economy: 30 s ad -> two 15 s Gemini edits at 720p, then local voice and lips', async () => {
  const d = deps();
  const job = economyJob({ swaps: [{ kind: 'background', preset: 'riyadh-boulevard' }, { kind: 'product', target: 'علبة قهوة', referenceUrl: 'https://cdn.example.com/p.png' }] });
  const result = await renderClaimedJob(job, d);
  assert.equal(result.status, 'succeeded', JSON.stringify(d.client.calls));
  assert.equal(Number(result.cost.estimateUsd.toFixed(2)), 2.1);
  const uploads = d.google.calls.filter((c) => c.host === 'storage.googleapis.com');
  assert.equal(uploads.length, 3); // one reference image + two segments
  assert.ok(uploads.every((c) => c.path === '/upload/storage/v1/b/lines-loc-test/o' && c.search.includes('uploadType=media')));
  const submits = d.google.calls.filter((c) => c.host === 'aiplatform.googleapis.com' && c.method === 'POST');
  assert.equal(submits.length, 2);
  assert.equal(submits[0].path, '/v1beta1/projects/lines-test/locations/global/interactions');
  const body = JSON.parse(submits[0].body);
  assert.equal(body.model, 'gemini-omni-1.2-flash');
  assert.equal(body.background, true);
  assert.deepEqual(body.generation_config, { video_config: { task: 'edit' } });
  assert.deepEqual(body.response_format, [{ type: 'video', delivery: 'inline', resolution: '720p' }]);
  assert.equal(body.input[1].uri, 'gs://lines-loc-test/lines-localize/job-loc-1/seg-0.mp4');
  assert.deepEqual(body.input[2], { type: 'image', uri: 'gs://lines-loc-test/lines-localize/job-loc-1/ref-0.png', mime_type: 'image/png' });
  assert.match(body.input[0].text, /Riyadh Boulevard/);
  assert.equal(submits[0].headers.authorization, 'Bearer ya29.fake');
  const splits = d.runner.calls.filter((c) => c[0] === 'ffmpeg' && c.includes('-ss'));
  assert.equal(splits.length, 2);
  assert.ok(d.runner.calls.some((c) => c[0] === '/opt/musetalk/run'));
  assert.ok(d.client.calls.some((c) => c[0] === 'complete'));
});

test('economy: Gemini failure and auth errors are reported, never success', async () => {
  const failed = deps({ google: fakeGoogle({ finalStatus: 'failed' }) });
  assert.deepEqual(await renderClaimedJob(economyJob({ swaps: [{ kind: 'background', preset: 'alula' }], dub: false }), failed), { status: 'failed', code: 'swap_failed' });
  assert.equal(failed.client.calls.some((c) => c[0] === 'complete'), false);

  const auth = deps({ google: fakeGoogle({ submitStatus: 401 }) });
  assert.deepEqual(await renderClaimedJob(economyJob({ swaps: [{ kind: 'background', preset: 'alula' }], dub: false }), auth), { status: 'failed', code: 'vendor_auth' });

  const failReport = failed.client.calls.find((c) => c[0] === 'fail');
  assert.ok(!JSON.stringify(failReport).includes('ya29'));
});

test('economy: more than two reference images is refused before any upload', async () => {
  const d = deps();
  const ref = (i) => ({ kind: 'product', target: `منتج ${i}`, referenceUrl: `https://cdn.example.com/p${i}.png` });
  const result = await renderClaimedJob(economyJob({ swaps: [ref(1), ref(2), ref(3)] }), d);
  assert.deepEqual(result, { status: 'failed', code: 'swap_failed' });
  assert.equal(d.google.calls.length, 0);
  assert.equal(editRequestBody({ prompt: 'x', gcsUri: 'gs://b/o', images: [1, 2, 3].map((i) => ({ uri: `gs://b/${i}`, mime: 'image/png' })) }).input.length, 4);
});
