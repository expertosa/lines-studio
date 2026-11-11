/**
 * ElevenLabs text-to-speech: POST /v1/text-to-speech/{voice_id}, key in the
 * xi-api-key header, output_format as a query parameter, text + model_id in
 * the JSON body. Returns the MP3 bytes.
 */
export const ELEVEN_BASE = 'https://api.elevenlabs.io';

export async function synthesize({ apiKey, voiceId, text, modelId = 'eleven_v3', language, fetchImpl, signal }) {
  if (!apiKey) throw Object.assign(new Error('ElevenLabs key is not configured'), { code: 'vendor_not_configured', retry: false });
  const url = `${ELEVEN_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const body = { text, model_id: modelId };
  if (language) body.language_code = language;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw Object.assign(new Error(`ElevenLabs TTS failed (${response.status}): ${detail}`), {
      code: response.status === 401 || response.status === 403 ? 'vendor_auth' : 'tts_failed',
      retry: response.status === 429 || response.status >= 500,
    });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw Object.assign(new Error('ElevenLabs returned no audio'), { code: 'tts_failed', retry: true });
  return bytes;
}
