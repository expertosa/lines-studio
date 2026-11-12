import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clientIp,
  createAuthLimiter,
  isTrustedProxyPeer,
  parseTrustedProxies,
  rateLimitKey,
} from '../src/auth-limit.js';

test('IPv6 /64 shares a bucket and IPv4 stays the full address', () => {
  const limiter = createAuthLimiter({ limit: 2, windowMs: 60_000 });
  const at = 1_000_000;
  assert.equal(rateLimitKey('2001:db8:85a3:1::1'), rateLimitKey('2001:0db8:85a3:0001:0000:0000:0000:00ff'));
  assert.notEqual(rateLimitKey('2001:db8:85a3:1::1'), rateLimitKey('2001:db8:85a3:2::1'));
  assert.equal(rateLimitKey('::ffff:203.0.113.10'), '203.0.113.10');
  assert.equal(limiter.record('2001:db8:85a3:1::1', at).limited, false);
  assert.equal(limiter.record('2001:0DB8:85a3:0001::ffff', at).limited, true);
  assert.equal(limiter.check('2001:db8:85a3:1::abcd', at).retryAfter >= 1, true);
  assert.equal(limiter.record('2001:db8:85a3:2::1', at).limited, false);
  assert.equal(limiter.record('203.0.113.10', at).limited, false);
  assert.equal(limiter.record('203.0.113.11', at).limited, false);
  assert.equal(limiter.record('::ffff:203.0.113.10', at).limited, true);
});

test('forwarded headers count only from a trusted proxy', () => {
  const headers = {
    'cf-connecting-ip': '203.0.113.5',
    'x-real-ip': '198.51.100.3',
    'x-forwarded-for': '198.51.100.8, 203.0.113.9',
  };
  const req = { socket: { remoteAddress: '10.0.0.8' }, headers };
  assert.equal(clientIp(req, false), '10.0.0.8');
  assert.equal(clientIp(req, true), '203.0.113.5');
  assert.equal(clientIp({
    socket: { remoteAddress: '203.0.113.50' },
    headers,
  }, true), '203.0.113.50');
  assert.equal(clientIp({
    socket: { remoteAddress: '::ffff:10.1.2.3' },
    headers: { 'x-forwarded-for': '[2001:db8::5], 198.51.100.9' },
  }, true), '198.51.100.9');
  assert.equal(clientIp({
    socket: { remoteAddress: '203.0.113.50' },
    headers,
  }, true, ['203.0.113.50']), '203.0.113.5');
  assert.equal(clientIp({
    socket: { remoteAddress: '10.0.0.8' },
    headers,
  }, true, ['203.0.113.50']), '10.0.0.8');
  assert.equal(clientIp({
    socket: { remoteAddress: '198.51.100.20' },
    headers: { 'x-forwarded-for': '203.0.113.8' },
  }, true, ['198.51.100.0/24']), '203.0.113.8');
  assert.equal(clientIp({
    socket: { remoteAddress: '198.51.100.20' },
    headers: { 'x-forwarded-for': '203.0.113.8' },
  }, true, ['198.51.101.0/24']), '198.51.100.20');
  assert.equal(clientIp({
    socket: { remoteAddress: '2001:db8:1:2::50' },
    headers: { 'cf-connecting-ip': '203.0.113.7' },
  }, true, ['2001:db8:1:2::/64']), '203.0.113.7');
  assert.equal(clientIp({
    socket: { remoteAddress: '2001:db8:1:3::50' },
    headers: { 'cf-connecting-ip': '203.0.113.7' },
  }, true, ['2001:db8:1:2::/64']), '2001:db8:1:3::50');
  assert.equal(isTrustedProxyPeer('127.0.0.1'), true);
  assert.equal(isTrustedProxyPeer('::1'), true);
  assert.equal(isTrustedProxyPeer('fd00::1'), true);
  assert.equal(isTrustedProxyPeer('203.0.113.5'), false);
  assert.throws(() => parseTrustedProxies('10.0.0.0/33'), /invalid entry/);
  assert.equal(parseTrustedProxies(''), undefined);
  assert.deepEqual(parseTrustedProxies('10.0.0.1, 192.168.0.0/16'), ['10.0.0.1', '192.168.0.0/16']);
});
