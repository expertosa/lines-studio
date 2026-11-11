import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCaptions, chunkScript } from '../src/captions.js';
import { synthesize } from '../src/eleven.js';
import { dataUri, download, isFalMedia, runOmnihuman } from '../src/fal.js';
import { fakeVendors } from './helpers.js';

const mp3 = Buffer.alloc(4000, 1);

test('ElevenLabs request shape: voice in path, key header, format query, model in body', async () => {
  const { fetchImpl, calls } = fakeVendors({ mp3 });
  const audio = await synthesize({ apiKey: 'k-eleven', voiceId: 'nhJWWCFdNdusuVUT3x19', text: 'مرحبا', modelId: 'eleven_v3', fetchImpl });
  assert.equal(audio.length, 4000);
  const [call] = calls;
  assert.equal(call.path, '/v1/text-to-speech/nhJWWCFdNdusuVUT3x19');
  assert.equal(call.headers['xi-api-key'], 'k-eleven');
  assert.deepEqual(JSON.parse(call.body), { text: 'مرحبا', model_id: 'eleven_v3' });
});

test('ElevenLabs auth errors are not retried, rate limits are', async () => {
  await assert.rejects(synthesize({ apiKey: 'k', voiceId: 'v', text: 't', fetchImpl: fakeVendors({ ttsStatus: 401 }).fetchImpl }),
    (e) => e.code === 'vendor_auth' && e.retry === false);
  await assert.rejects(synthesize({ apiKey: 'k', voiceId: 'v', text: 't', fetchImpl: fakeVendors({ ttsStatus: 429 }).fetchImpl }),
    (e) => e.code === 'tts_failed' && e.retry === true);
  await assert.rejects(synthesize({ apiKey: '', voiceId: 'v', text: 't', fetchImpl: () => assert.fail('no call') }),
    (e) => e.code === 'vendor_not_configured');
});

test('fal queue: submit, poll with heartbeats, fetch the result; key only goes to queue.fal.run', async () => {
  const { fetchImpl, calls } = fakeVendors({ mp3 });
  let beats = 0;
  const url = await runOmnihuman({
    apiKey: 'k-fal', imageUrl: dataUri('image/png', Buffer.from('i')), audioUrl: dataUri('audio/mpeg', mp3),
    prompt: 'Casual.', fetchImpl, sleep: async () => {}, heartbeat: async () => { beats += 1; },
  });
  assert.equal(url, 'https://v3.fal.media/files/abc/out.mp4');
  assert.equal(beats, 2);
  const submit = calls[0];
  assert.equal(submit.path, '/fal-ai/bytedance/omnihuman/v1.5');
  assert.equal(submit.headers.authorization, 'Key k-fal');
  const input = JSON.parse(submit.body);
  assert.match(input.image_url, /^data:image\/png;base64,/);
  assert.match(input.audio_url, /^data:audio\/mpeg;base64,/);
  assert.equal(input.resolution, '1080p');
  for (const call of calls) {
    if (call.headers.authorization) assert.equal(call.host, 'queue.fal.run');
  }
});

test('fal results off fal media hosts are refused, failures are not retried', async () => {
  const off = fakeVendors({ mp3, videoUrl: 'https://evil.example/x.mp4' });
  await assert.rejects(runOmnihuman({ apiKey: 'k', imageUrl: 'd', audioUrl: 'd', fetchImpl: off.fetchImpl, sleep: async () => {} }),
    (e) => e.code === 'lipsync_failed' && e.retry === false);
  const failed = fakeVendors({ mp3, statuses: ['IN_QUEUE', 'FAILED'] });
  await assert.rejects(runOmnihuman({ apiKey: 'k', imageUrl: 'd', audioUrl: 'd', fetchImpl: failed.fetchImpl, sleep: async () => {} }),
    (e) => e.code === 'lipsync_failed' && e.retry === false);
  assert.equal(isFalMedia('https://v3.fal.media/a.mp4'), true);
  assert.equal(isFalMedia('http://v3.fal.media/a.mp4'), false);
  assert.equal(isFalMedia('https://fal.media.evil.com/a.mp4'), false);
  await assert.rejects(download('https://evil.example/x.mp4', off.fetchImpl), /non-fal/);
});

test('captions: tags stripped, short chunks, timed to the audio', () => {
  assert.deepEqual(chunkScript('[casual, excited] تدرون وش اللي غيّر شغلي هالشهر؟ اكسبرتو.'), [
    'تدرون وش اللي غيّر', 'شغلي هالشهر؟', 'اكسبرتو.',
  ]);
  const ass = buildCaptions('[excited] One two three four five. Six', { duration: 6, width: 1080, height: 1920, language: 'en' });
  const events = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.equal(events.length, 3);
  assert.doesNotMatch(ass, /excited/);
  assert.match(events.at(-1), /,0:00:06\.00,Cap,/);
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
});
