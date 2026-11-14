#!/usr/bin/env node
// Ten synthetic users; refuses live stages, non-loopback hosts and protected ports.
import { createHmac } from 'node:crypto';
const base = new URL(process.argv[2] || 'http://127.0.0.1:18193');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname) || !['18080', '18193'].includes(base.port)) throw new Error('Only isolated local test ports 18080/18193 are allowed');
const latency = [];
async function request(route, options = {}, expected = 200) {
  const start = performance.now();
  const response = await fetch(new URL(route, base), { ...options, signal: AbortSignal.timeout(10000) });
  const body = response.status === 204 ? null : await response.json();
  latency.push(performance.now() - start);
  if (response.status !== expected) throw new Error(`${route}: expected ${expected}, received ${response.status}`);
  return body;
}
const version = await request('/api/version');
if (version.appStage !== 'test') throw new Error('Refusing to write outside APP_STAGE=test');
const signingKey = 'synthetic-pilot-signing-key-not-a-telegram-token';
function signedUser(id) {
  const auth_date = String(Math.floor(Date.now() / 1000));
  const user = JSON.stringify({ id, first_name: 'Synthetic load test' });
  const secret = createHmac('sha256', 'WebAppData').update(signingKey).digest();
  const hash = createHmac('sha256', secret).update(`auth_date=${auth_date}\nuser=${user}`).digest('hex');
  return new URLSearchParams({ auth_date, user, hash }).toString();
}
const started = performance.now();
const users = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
  const id = 1770000000 + index;
  const session = await request('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ init_data: signedUser(id) }) });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session_token}` };
  await request('/api/catalog', { headers });
  const before = await request('/api/shopping', { headers });
  const item = { id: `synthetic-load-${id}`, name: `Synthetic product ${index}`, amountLabel: '100 г', department: 'Другое', linkedRecipeTitles: [], alreadyHave: false, checkedInStore: false };
  const body = JSON.stringify({ schema_version: 1, expected_revision: before.revision, items: [item] });
  const saved = await request('/api/shopping', { method: 'PUT', headers, body });
  if (saved.revision !== before.revision + 1) throw new Error('Revision increment mismatch');
  await request('/api/shopping', { method: 'PUT', headers, body }, 409);
  await request(`/api/shopping?user_id=${1770000000 + ((index + 1) % 10)}`, { headers }, 403);
  const restored = await request('/api/shopping', { headers });
  if (restored.revision !== saved.revision || JSON.stringify(restored.items) !== JSON.stringify([item])) throw new Error('Saved shopping state changed or crossed user boundaries');
  return { synthetic_user: index + 1, revision: restored.revision, items: restored.items.length };
}));
latency.sort((a, b) => a - b);
const p95 = latency[Math.ceil(latency.length * .95) - 1];
console.log(JSON.stringify({ stage: 'isolated-local-test', build_id: version.buildId, concurrent_users: 10, requests: latency.length, errors: 0, p95_ms: Math.round(p95 * 100) / 100, duration_ms: Math.round(performance.now() - started), data_preserved: users.length === 10, passed: p95 <= 2000, users }, null, 2));
if (p95 > 2000) process.exitCode = 1;
