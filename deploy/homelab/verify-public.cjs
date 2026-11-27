'use strict';
// Public HTTPS checks after a rollout. Read-only, anonymous, no production writes.
// Usage: node deploy/homelab/verify-public.cjs [origin] [build.json copied from the release dir]
const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const origin = process.argv[2] || 'https://xuexihanyu.online';
const manifest = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).webManifest : [];
(async () => {
  const get = (p) => fetch(origin + p, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  for (let i = 0; i < manifest.length; i += 8)
    await Promise.all(manifest.slice(i, i + 8).map(async (f) => {
      const r = await get('/' + f.path);
      assert.equal(r.status, 200, f.path);
      assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'), f.sha256, f.path);
    }));
  const html = await (await get('/')).text();
  assert.match(html, /<html[^>]*lang="vi"/);
  const ready = await get('/api/health/ready');
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).dependencies.database, 'up');
  for (const p of ['/api/auth/me', '/api/dictionary/admin/categories']) {
    const r = await get(p);
    assert.equal(r.status, 401, p);
    assert.match(r.headers.get('content-type') || '', /application\/json/, p);
  }
  console.log(JSON.stringify({ status: 'PUBLIC_PASS', origin, verifiedAssets: manifest.length }));
})().catch((e) => { console.error('PUBLIC_FAIL', e.message); process.exitCode = 1; });
