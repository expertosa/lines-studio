import assert from 'node:assert/strict';
import test from 'node:test';
import { runMoneyPrinter } from '../src/mpt.js';

const job = {
  id: 'job-1',
  engine: 'moneyprinter',
  title: 'عرض من اكسبرتو',
  style: 'calm',
  format: '1:1',
  language: 'ar',
  seconds: 15,
  voice: 'ar-SA-HamedNeural',
  prompt: 'هدوء',
  deadlineAt: '2026-11-10T13:00:00.000Z',
};

test('polls MoneyPrinterTurbo until the task completes', async () => {
  const calls = [];
  let polls = 0;
  const beats = [];
  const result = await runMoneyPrinter(job, {
    baseUrl: 'http://127.0.0.1:8080',
    pollMs: 1,
    sleep: async () => {},
    heartbeat: async () => beats.push('beat'),
    now: () => Date.parse('2026-11-10T12:00:00.000Z'),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });
      if (url.endsWith('/api/v1/videos')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: { task_id: 'task-9' } }) };
      }
      polls += 1;
      const state = polls < 2 ? 4 : 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: { task_id: 'task-9', state, videos: state === 1 ? ['/tasks/task-9/final-1.mp4'] : [] },
        }),
      };
    },
  });
  assert.equal(result.state, 1);
  assert.equal(calls[0].method, 'POST');
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.video_source, 'pixabay');
  assert.equal(sent.voice_name, 'ar-SA-HamedNeural');
  assert.equal(sent.subtitle_enabled, false);
  assert.equal(beats.length, 1);
});

test('a failed MoneyPrinterTurbo task is not retried by the poller', async () => {
  await assert.rejects(() => runMoneyPrinter(job, {
    baseUrl: 'http://127.0.0.1:8080/',
    pollMs: 1,
    sleep: async () => {},
    now: () => Date.parse('2026-11-10T12:00:00.000Z'),
    fetchImpl: async (url) => {
      if (url.endsWith('/videos')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: { task_id: 'task-2' } }) };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { state: -1, error: 'TTS request timed out' } }),
      };
    },
  }), (error) => error.retry === false && /timed out/.test(error.message));
});
