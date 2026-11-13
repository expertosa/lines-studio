import { spawn } from 'node:child_process';
import fs from 'node:fs';

/**
 * Local (free) building blocks for the free and economy tiers. Everything here runs on
 * the Mac mini, costs $0 and adds no watermark. Nothing is installed by this worker:
 * each tool is an executable the operator points at with an env var, and a missing tool
 * fails the job with `engine_not_configured` before any work starts.
 *
 * Voice (LINES_LOCAL_TTS, default `edge`):
 * - `edge`: reuses the Edge TTS that MoneyPrinterTurbo already uses on the Mac
 *   (`ar-SA-HamedNeural` / `ar-SA-ZariyahNeural`). Point LINES_EDGE_TTS_BIN at the
 *   `edge-tts` CLI inside MoneyPrinterTurbo's venv. Saudi-accented, mostly MSA wording.
 * - `namaa`: NAMAA-Saudi-TTS (Chatterbox fine-tune, MIT). LINES_NAMAA_TTS_CMD is an
 *   executable called as `<cmd> --text <line> --out <file.wav>`. Not installed yet.
 * Lip-sync: LINES_MUSETALK_CMD, called as `<cmd> --video <in.mp4> --audio <voice> --out <out.mp4>`
 * (MuseTalk 1.5, MIT; MLX port on Apple Silicon). Not installed yet.
 * ffmpeg/ffprobe: LINES_FFMPEG / LINES_FFPROBE (default from PATH), same as the other Mac workers.
 */

export const EDGE_VOICES = Object.freeze({ male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' });

function fail(message, code, retry = false) {
  return Object.assign(new Error(message), { code, retry });
}

/** Spawn without a shell. Resolves { code, stdout, stderr }. */
export function runCommand(cmd, args, { signal, timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; if (stdout.length > 65536) stdout = stdout.slice(-65536); });
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 65536) stderr = stderr.slice(-65536); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

/** Which local tools are set up. Pure: reads env only, so tests can drive it. */
export function localConfig(env = process.env) {
  const tts = (env.LINES_LOCAL_TTS || 'edge').toLowerCase();
  return {
    tts,
    edgeBin: env.LINES_EDGE_TTS_BIN || '',
    edgeVoice: env.LINES_EDGE_VOICE || EDGE_VOICES.male,
    namaaCmd: env.LINES_NAMAA_TTS_CMD || '',
    musetalkCmd: env.LINES_MUSETALK_CMD || '',
    ffmpeg: env.LINES_FFMPEG || 'ffmpeg',
    ffprobe: env.LINES_FFPROBE || 'ffprobe',
  };
}

/** Throws engine_not_configured naming the first missing local tool. */
export function assertLocalReady(config) {
  if (config.tts === 'edge' && !config.edgeBin) throw fail('local Saudi voice is not configured (set LINES_EDGE_TTS_BIN to the edge-tts CLI from MoneyPrinterTurbo)', 'engine_not_configured');
  if (config.tts === 'namaa' && !config.namaaCmd) throw fail('NAMAA-Saudi-TTS is not configured (LINES_NAMAA_TTS_CMD)', 'engine_not_configured');
  if (!['edge', 'namaa'].includes(config.tts)) throw fail(`unknown LINES_LOCAL_TTS "${String(config.tts).slice(0, 20)}"`, 'engine_not_configured');
  if (!config.musetalkCmd) throw fail('local lip-sync is not configured (LINES_MUSETALK_CMD for MuseTalk)', 'engine_not_configured');
}

function checkOutput(file, what, code) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) throw fail(`${what} produced no output`, code);
}

export async function synthesizeSaudi({ config, text, outBase, run = runCommand, signal }) {
  if (config.tts === 'namaa') {
    const out = `${outBase}.wav`;
    const r = await run(config.namaaCmd, ['--text', text, '--out', out], { signal });
    if (r.code !== 0) throw fail(`NAMAA-Saudi-TTS exited ${r.code}: ${r.stderr.slice(-200)}`, 'tts_failed');
    checkOutput(out, 'NAMAA-Saudi-TTS', 'tts_failed');
    return out;
  }
  const out = `${outBase}.mp3`;
  const r = await run(config.edgeBin, ['--voice', config.edgeVoice, '--text', text, '--write-media', out], { signal });
  if (r.code !== 0) throw fail(`edge-tts exited ${r.code}: ${r.stderr.slice(-200)}`, 'tts_failed', true);
  checkOutput(out, 'edge-tts', 'tts_failed');
  return out;
}

export async function probeSeconds({ config, file, run = runCommand, signal }) {
  const r = await run(config.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { signal });
  const value = Number(String(r.stdout).trim());
  if (r.code !== 0 || !Number.isFinite(value) || value <= 0) throw fail('could not read media duration', 'render_failed');
  return value;
}

export async function lipSync({ config, video, audio, out, run = runCommand, signal }) {
  const r = await run(config.musetalkCmd, ['--video', video, '--audio', audio, '--out', out], { signal, timeoutMs: 2 * 60 * 60 * 1000 });
  if (r.code !== 0) throw fail(`MuseTalk exited ${r.code}: ${r.stderr.slice(-200)}`, 'lipsync_failed');
  checkOutput(out, 'MuseTalk', 'lipsync_failed');
  return out;
}

/** Cut `file` into consecutive segments of the given lengths (seconds). Re-encodes so cuts are frame-exact. */
export async function splitVideo({ config, file, lengths, outBase, run = runCommand, signal }) {
  const outs = [];
  let start = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const out = `${outBase}-${i}.mp4`;
    const r = await run(config.ffmpeg, ['-y', '-v', 'error', '-ss', start.toFixed(3), '-i', file, '-t', lengths[i].toFixed(3), '-c:v', 'libx264', '-c:a', 'aac', out], { signal });
    if (r.code !== 0) throw fail(`ffmpeg split exited ${r.code}`, 'render_failed');
    outs.push(out);
    start += lengths[i];
  }
  return outs;
}

export async function concatVideos({ config, files, out, listFile, run = runCommand, signal }) {
  if (files.length === 1) {
    fs.copyFileSync(files[0], out);
    return out;
  }
  fs.writeFileSync(listFile, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const r = await run(config.ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-c:a', 'aac', out], { signal });
  if (r.code !== 0) throw fail(`ffmpeg concat exited ${r.code}`, 'render_failed');
  return out;
}
