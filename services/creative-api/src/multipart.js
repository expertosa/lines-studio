import { ApiError } from './errors.js';

export function parseMultipart(buffer, boundary) {
  if (typeof boundary !== 'string' || boundary.length < 1 || boundary.length > 200) {
    throw new ApiError(400, 'invalid_multipart', 'Multipart boundary is invalid.');
  }
  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(marker);
  if (start === -1) throw new ApiError(400, 'invalid_multipart', 'Multipart body is invalid.');
  while (start !== -1) {
    let cursor = start + marker.length;
    if (buffer.subarray(cursor, cursor + 2).toString('utf8') === '--') break;
    if (buffer.subarray(cursor, cursor + 2).toString('utf8') === '\r\n') cursor += 2;
    const next = buffer.indexOf(marker, cursor);
    if (next === -1) break;
    let chunk = buffer.subarray(cursor, next);
    if (chunk.length >= 2 && chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10) {
      chunk = chunk.subarray(0, chunk.length - 2);
    }
    const sep = chunk.indexOf(Buffer.from('\r\n\r\n'));
    if (sep === -1) throw new ApiError(400, 'invalid_multipart', 'Multipart part is invalid.');
    const headerText = chunk.subarray(0, sep).toString('utf8');
    const body = chunk.subarray(sep + 4);
    const name = /name="([^"]+)"/.exec(headerText)?.[1];
    const type = /content-type:\s*([^\r\n;]+)/i.exec(headerText)?.[1]?.trim().toLowerCase() || '';
    if (!name) throw new ApiError(400, 'invalid_multipart', 'Multipart part is missing a name.');
    parts.push({ name, type, body });
    start = next;
  }
  return parts;
}

export function boundaryFrom(header) {
  if (typeof header !== 'string') return null;
  const match = header.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return null;
  return (match[1] || match[2] || '').trim();
}
