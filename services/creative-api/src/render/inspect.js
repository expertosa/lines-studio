import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { HARD } from '../constants.js';
import { CodedError } from '../errors.js';
import { cleanProcessEnv } from '../process-env.js';

function reject(message) {
  throw new CodedError('ARTIFACT_REJECTED', message);
}

export function assertMagic(filePath, mime) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const read = fs.readSync(fd, header, 0, 16, 0);
    if (mime === 'image/png') {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (read < 8 || !header.subarray(0, 8).equals(png)) reject('png magic mismatch');
      return;
    }
    if (mime === 'image/jpeg') {
      if (read < 3 || header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) reject('jpeg magic mismatch');
      return;
    }
    if (mime === 'video/mp4') {
      if (read < 12 || header.subarray(4, 8).toString('ascii') !== 'ftyp') reject('mp4 magic mismatch');
      return;
    }
    reject('unsupported mime');
  } finally {
    fs.closeSync(fd);
  }
}

function run(bin, args) {
  return new Promise((resolve, rejectPromise) => {
    const child = spawn(bin, args, {
      env: cleanProcessEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    let outLen = 0;
    child.stdout.on('data', (chunk) => {
      outLen += chunk.length;
      if (outLen <= 8 * 1024 * 1024) out.push(chunk);
    });
    child.stderr.on('data', () => {});
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new CodedError('ARTIFACT_REJECTED', 'media probe failed'));
        return;
      }
      resolve(Buffer.concat(out));
    });
  });
}

async function probe(ffprobe, filePath) {
  const stdout = await run(ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  try {
    return JSON.parse(stdout.toString('utf8'));
  } catch {
    reject('probe json unreadable');
  }
  return null;
}

async function frameStdev(ffmpeg, filePath, width, height) {
  const stdout = await run(ffmpeg, [
    '-v', 'error',
    '-ss', '0.2',
    '-i', filePath,
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    'pipe:1',
  ]);
  const pixels = width * height;
  if (stdout.length < pixels * 3) reject('decoded frame is short');
  let sum = 0;
  let sumSquares = 0;
  const step = Math.max(1, Math.floor(pixels / 20_000));
  let seen = 0;
  for (let index = 0; index < pixels; index += step) {
    const offset = index * 3;
    const luma = 0.2126 * stdout[offset] + 0.7152 * stdout[offset + 1] + 0.0722 * stdout[offset + 2];
    sum += luma;
    sumSquares += luma * luma;
    seen += 1;
  }
  const mean = sum / seen;
  return Math.sqrt(Math.max(0, sumSquares / seen - mean * mean));
}

export async function inspectTemplateVideo({ filePath, ffmpeg, ffprobe, width, height, durationMs }) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) reject('output is not a file');
  if (stat.size > HARD.maxVideoBytes || stat.size < HARD.minVideoBytes) reject('video size is out of range');
  assertMagic(filePath, 'video/mp4');
  const probed = await probe(ffprobe, filePath);
  const stream = (probed.streams || []).find((item) => item.codec_type === 'video');
  if (!stream) reject('no video stream');
  if ((probed.streams || []).some((item) => item.codec_type === 'audio')) reject('unexpected audio');
  if (stream.codec_name !== 'h264') reject('video codec is not h264');
  if (Number(stream.width) !== width || Number(stream.height) !== height) reject('dimensions do not match');
  const seconds = Number(probed.format?.duration);
  if (!Number.isFinite(seconds)) reject('duration missing');
  const actualMs = Math.round(seconds * 1000);
  if (Math.abs(actualMs - durationMs) > 700) reject('duration does not match');
  const lumaStdev = await frameStdev(ffmpeg, filePath, width, height);
  if (!Number.isFinite(lumaStdev) || lumaStdev < HARD.minLumaStdev) reject('frame is uniform');
  return { width, height, durationMs: actualMs, byteSize: stat.size };
}

export async function inspectUploadedVideo({ filePath, ffprobe }) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) reject('output is not a file');
  if (stat.size > HARD.maxVideoBytes || stat.size < HARD.minVideoBytes) reject('video size is out of range');
  assertMagic(filePath, 'video/mp4');
  const probed = await probe(ffprobe, filePath);
  const stream = (probed.streams || []).find((item) => item.codec_type === 'video');
  if (!stream) reject('no video stream');
  const seconds = Number(probed.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) reject('duration missing');
  return {
    width: Number(stream.width) || null,
    height: Number(stream.height) || null,
    durationMs: Math.round(seconds * 1000),
    byteSize: stat.size,
  };
}

export function inspectThumbnail(filePath, mime) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) reject('thumbnail is not a file');
  if (stat.size > HARD.maxThumbBytes || stat.size < HARD.minThumbBytes) reject('thumbnail size is out of range');
  assertMagic(filePath, mime);
  return { byteSize: stat.size };
}
