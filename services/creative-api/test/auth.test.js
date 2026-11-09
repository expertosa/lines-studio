import assert from 'node:assert/strict';
import test from 'node:test';
import { api, gateway, startApp, TOKENS, videoBrief } from './helpers.js';

async function withApp(t, overrides) {
  const ctx = await startApp({ providerName: 'disabled', ...overrides });
  t.after(() => ctx.close());
  return ctx;
}

test('health is public and does not claim a paid provider is ready', async (t) => {
  const ctx = await withApp(t);
  const res = await api(ctx.base, { path: '/v1/health' });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.ready, false);
  assert.equal(res.json.paidCalls, false);
  assert.equal(res.json.publishSupported, false);
  assert.equal(res.json.fixtureFulfillment, false);
  assert.deepEqual(res.json.capabilities, []);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('missing, malformed, and unknown tokens are unauthorized', async (t) => {
  const ctx = await withApp(t);
  const body = videoBrief();
  const missing = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body, idempotency: 'idem-auth-0001', ...gateway({ token: undefined }),
  });
  assert.equal(missing.status, 401);
  assert.equal(missing.json.error.code, 'unauthorized');
  const bad = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body, idempotency: 'idem-auth-0001', token: 'not-a-real-token-value-at-all',
    tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(bad.status, 401);
  const basic = await api(ctx.base, {
    method: 'GET', path: '/v1/health', headers: { authorization: 'Basic gateway-token-0123456789abcdef' },
  });
  assert.equal(basic.status, 200);
  const job = await api(ctx.base, {
    method: 'GET', path: '/v1/creative-jobs', headers: { authorization: 'Basic gateway-token-0123456789abcdef' },
    tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(job.status, 401);
});

test('token in the query string is rejected', async (t) => {
  const ctx = await withApp(t);
  const res = await api(ctx.base, {
    path: `/v1/health?access_token=${TOKENS.gateway}`,
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'invalid_request');
});

test('tenant and customer are required and a scoped token cannot cross tenants', async (t) => {
  const ctx = await startApp({ provider: (await import('./helpers.js')).holdProvider(), worker: false });
  t.after(() => ctx.close());
  const created = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-owner-001',
    token: TOKENS.tenantA, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(created.status, 201);
  const id = created.json.id;

  const missingTenant = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${id}`, token: TOKENS.tenantA, customer: 'cust-a',
  });
  assert.equal(missingTenant.status, 400);
  assert.equal(missingTenant.json.error.code, 'invalid_tenant');

  const otherTenantHeader = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${id}`, token: TOKENS.tenantA, tenant: 'tenant-b', customer: 'cust-a',
  });
  assert.equal(otherTenantHeader.status, 403);

  const otherTenantToken = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${id}`, token: TOKENS.tenantB, tenant: 'tenant-b', customer: 'cust-a',
  });
  assert.equal(otherTenantToken.status, 404);

  const otherCustomer = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${id}`, token: TOKENS.tenantA, tenant: 'tenant-a', customer: 'cust-b',
  });
  assert.equal(otherCustomer.status, 404);

  const queryOverride = await api(ctx.base, {
    path: `/v1/creative-jobs/${id}?tenantId=tenant-b&customerId=cust-b`,
    token: TOKENS.tenantA, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(queryOverride.status, 400);

  const owner = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${id}`, token: TOKENS.tenantA, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(owner.status, 200);
  assert.equal(owner.json.customerId, 'cust-a');
});

test('scopes are enforced independently of a valid token', async (t) => {
  const ctx = await startApp({ provider: (await import('./helpers.js')).holdProvider() });
  t.after(() => ctx.close());
  const write = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-scope-001',
    token: TOKENS.readOnly, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(write.status, 403);
  const created = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-scope-002',
    token: TOKENS.writeOnly, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(created.status, 201);
  const read = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${created.json.id}`,
    token: TOKENS.writeOnly, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(read.status, 403);
  const cancel = await api(ctx.base, {
    method: 'POST', path: `/v1/creative-jobs/${created.json.id}/cancel`,
    token: TOKENS.writeOnly, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(cancel.status, 403);
});

test('traversal and unknown routes do not reveal files', async (t) => {
  const ctx = await withApp(t);
  const traversed = await api(ctx.base, {
    path: '/v1/creative-jobs/../../etc/passwd',
    ...gateway(),
  });
  assert.equal(traversed.status, 404);
  const missing = await api(ctx.base, { path: '/v1/admin', ...gateway() });
  assert.equal(missing.status, 404);
  const method = await api(ctx.base, { method: 'DELETE', path: '/v1/health' });
  assert.equal(method.status, 405);
});
