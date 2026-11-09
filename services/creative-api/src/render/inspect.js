import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { HARD } from '../constants.js';
import { CodedError } from '../errors.js';
import { cleanProcessEnv } from './local-ffmpeg.js';

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
    const err = [];
    let outLen = 0;
    child.stdout.on('data', (chunk) => {
      outLen += chunk.length;
      if (outLen <= HARD.maxArtifactBytes) out.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (err.length < 8) err.push(chunk);
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new CodedError('ARTIFACT_REJECTED', 'media probe failed'));
        return;
      }
      resolve({ stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8') });
    });
  });
}

export async function probe(ffprobe, filePath) {
  const { stdout } = await run(ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  let parsed;
  try {
    parsed = JSON.parse(stdout.toString('utf8'));
  } catch {
    reject('probe json unreadable');
  }
  return parsed;
}

export async function frameStdev(ffmpeg, filePath, width, height, { still }) {
  const args = ['-v', 'error'];
  if (!still) args.push('-ss', '0.4');
  args.push('-i', filePath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const { stdout } = await run(ffmpeg, args);
  const pixels = width * height;
  if (stdout.length < pixels * 3) reject('decoded frame is short');
  let sum = 0;
  let sumSquares = 0;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 3;
    const luma = 0.2126 * stdout[offset] + 0.7152 * stdout[offset + 1] + 0.0722 * stdout[offset + 2];
    sum += luma;
    sumSquares += luma * luma;
  }
  const mean = sum / pixels;
  const variance = Math.max(0, sumSquares / pixels - mean * mean);
  return Math.sqrt(variance);
}

export async function inspectMedia({ filePath, mime, brief, ffmpeg, ffprobe }) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) reject('output is not a file');
  if (stat.size > HARD.maxArtifactBytes) reject('output exceeds size cap');
  if (mime === 'video/mp4' && stat.size < HARD.minVideoBytes) reject('video below minimum size');
  if (mime === 'image/png' && stat.size < HARD.minImageBytes) reject('image below minimum size');
  assertMagic(filePath, mime);
  const probed = await probe(ffprobe, filePath);
  const stream = (probed.streams || []).find((item) => item.codec_type === 'video') || probed.streams?.[0];
  if (!stream) reject('no video stream');
  if ((probed.streams || []).some((item) => item.codec_type === 'audio')) reject('unexpected audio');
  const width = Number(stream.width);
  const height = Number(stream.height);
  if (width !== brief.width || height !== brief.height) reject('dimensions do not match the brief');
  if (mime === 'video/mp4' && stream.codec_name !== 'h264') reject('video codec is not h264');
  if (mime === 'image/png' && stream.codec_name !== 'png') reject('image codec is not png');
  let durationMs = null;
  if (mime === 'video/mp4') {
    const seconds = Number(probed.format?.duration);
    if (!Number.isFinite(seconds)) reject('duration missing');
    durationMs = Math.round(seconds * 1000);
    if (Math.abs(durationMs - brief.durationMs) > 400) reject('duration does not match the brief');
  }
  const lumaStdev = await frameStdev(ffmpeg, filePath, width, height, { still: mime === 'image/png' });
  if (!Number.isFinite(lumaStdev) || lumaStdev < HARD.minLumaStdev) {
    reject('frame is uniform or a fixture');
  }
  return { width, height, durationMs, lumaStdev, byteSize: stat.size };
}
