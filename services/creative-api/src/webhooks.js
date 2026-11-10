import https from 'node:https';
import net from 'node:net';
import { presentJob } from './present.js';
import { webhookSignature } from './sign.js';
import { assertPublicHttps } from './ssrf.js';

function pinnedRequest({ href, address, body, headers, timeoutMs }) {
  const target = new URL(href);
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:',
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers,
      timeout: timeoutMs,
      servername: target.hostname,
      lookup: (_hostname, _options, callback) => {
        callback(null, address, net.isIP(address) === 6 ? 6 : 4);
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode || 0 }));
    });
    req.on('timeout', () => req.destroy(new Error('webhook timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

function safeError(error) {
  const text = String(error?.message || 'webhook failed').replace(/https?:\/\/\S+/gi, '[url]');
  return text.slice(0, 200);
}

export async function dispatchWebhooks(ctx, limit = 5) {
  const due = ctx.store.pendingWebhooks(ctx.now(), limit);
  for (const event of due) {
    const job = ctx.store.readJob(event.jobId);
    const secret = ctx.store.webhookSecret(event.tenantId);
    if (!job || !secret || !event.callbackUrl) {
      ctx.store.markWebhook(event.id, { dead: true, error: 'missing destination', nextAttemptAt: ctx.now() });
      continue;
    }
    const raw = JSON.stringify({
      event: event.event,
      job: presentJob(job, ctx.store.artifactsFor(job.id), {
        signing: ctx.signingKey ? { key: ctx.signingKey, ttlMs: ctx.limits.signedUrlTtlMs } : null,
        now: ctx.now(),
      }),
    });
    const timestamp = String(Math.floor(ctx.now() / 1000));
    const headers = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(raw),
      'user-agent': 'lines-video-api',
      'x-lines-timestamp': timestamp,
      'x-lines-signature': webhookSignature(secret, timestamp, raw),
    };
    let blocked = false;
    let address = null;
    try {
      const checked = await assertPublicHttps(event.callbackUrl, {
        lookup: ctx.webhookLookup,
        allowedPorts: ctx.webhookPorts,
      });
      address = checked.addresses[0];
    } catch (error) {
      blocked = true;
      ctx.log('warn', { code: 'webhook_blocked', jobId: job.id, message: safeError(error) });
    }
    let ok = false;
    let errorText = blocked ? 'ssrf_blocked' : null;
    if (!blocked) {
      try {
        const transport = ctx.webhookTransport || pinnedRequest;
        const result = await transport({
          href: event.callbackUrl,
          address,
          body: raw,
          headers,
          timeoutMs: ctx.limits.webhookTimeoutMs,
        });
        ok = result.status >= 200 && result.status < 300;
        if (!ok) errorText = `status ${result.status}`;
      } catch (error) {
        errorText = safeError(error);
      }
    }
    if (ok) {
      ctx.store.markWebhook(event.id, { delivered: true });
      continue;
    }
    const attempt = event.attempt + 1;
    const dead = attempt >= ctx.limits.webhookMaxAttempts;
    const delay = ctx.limits.webhookBackoffMs[Math.min(attempt - 1, ctx.limits.webhookBackoffMs.length - 1)];
    ctx.store.markWebhook(event.id, {
      dead,
      error: errorText,
      nextAttemptAt: ctx.now() + delay,
    });
  }
}
