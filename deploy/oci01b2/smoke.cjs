'use strict';
// Read-only HTTP smoke. No account creation, login, seed, submit, or DB writes.
const assert = require('node:assert/strict');
async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:18080';
  const url = new URL(base);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Loopback test target only');
  assert.ok(
    ['18080', '18443', '18082', '18445'].includes(url.port),
    'Only approved loopback trial/test ports',
  );
  const get = (suffix) => fetch(base + suffix, { signal: AbortSignal.timeout(10000) });
  const live = await get('/api/health/live');
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  const ready = await get('/api/health/ready');
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).dependencies.database, 'up');
  const home = await get('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(home.headers.get('content-type'), /text\/html/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map(
    (x) => x[1],
  );
  assert.ok(assets.some((x) => x.endsWith('.js')));
  assert.ok(assets.some((x) => x.endsWith('.css')));
  for (const asset of assets) {
    const response = await get(asset);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-type'),
      asset.endsWith('.js') ? /javascript/ : /text\/css/,
    );
    assert.ok((await response.text()).length > 0);
  }
  assert.equal((await get('/api/auth/me')).status, 401);
  assert.equal((await get('/api/student/learning-prototypes/lesson-01')).status, 401);
  const missing = await get('/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /<html/i);
  console.log(
    'PASS: live/ready(database up), HTML/JS/CSS, /api routing and anonymous auth denial. No authenticated-cookie or ARM image claim from this check alone.',
  );
}
main().catch(() => {
  console.error('PACKAGING_SMOKE_FAILED');
  process.exitCode = 1;
});
