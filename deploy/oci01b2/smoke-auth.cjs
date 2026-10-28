'use strict';
// Optional synthetic-account verification only. No provisioning/seed/learning writes.
const assert = require('node:assert/strict');
async function main() {
  const base = process.env.CLP_ORIGIN || 'https://localhost:18445';
  const origin = new URL(base);
  if (
    origin.protocol !== 'https:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    !['18443', '18445'].includes(origin.port) ||
    origin.origin !== base
  )
    throw Error('LOOPBACK_HTTPS_REQUIRED');
  if (
    !process.env.CLP_TEST_LOGIN ||
    !process.env.CLP_TEST_PASSWORD ||
    !process.env.CLP_TEST_LOGIN.endsWith('@example.invalid') ||
    !['OCI01B2_SYNTHETIC_ONLY', 'MAC_LOCAL_TRIAL_SYNTHETIC_ONLY'].includes(
      process.env.CLP_TARGET_CONFIRMATION,
    ) ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
  )
    throw Error('TEST_CONFIGURATION');
  const call = (route, options = {}) =>
    fetch(base + '/api' + route, { ...options, signal: AbortSignal.timeout(10000) });
  const response = await call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({
      login: process.env.CLP_TEST_LOGIN,
      password: process.env.CLP_TEST_PASSWORD,
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), base);
  const cookies = response.headers.getSetCookie();
  const session = cookies.find((x) => x.startsWith('clp_session='));
  const csrf = cookies.find((x) => x.startsWith('clp_csrf='));
  for (const cookie of [session, csrf]) {
    assert.ok(cookie);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /; Domain=/i);
  }
  assert.match(session, /HttpOnly/);
  assert.doesNotMatch(csrf, /HttpOnly/);
  const Cookie = cookies.map((x) => x.split(';')[0]).join('; ');
  const token = decodeURIComponent(csrf.split(';')[0].slice('clp_csrf='.length));
  try {
    assert.equal((await call('/auth/me', { headers: { Cookie } })).status, 200);
    const discovery = await call('/student/learning-prototypes/lesson-01/availability', {
      headers: { Cookie },
    });
    assert.equal(discovery.status, 200); // approved synthetic STUDENT account required
    assert.deepEqual(await discovery.json(), { available: false });
    assert.equal(
      (
        await call('/student/learning-prototypes/lesson-01?instructionLanguage=vi', {
          headers: { Cookie },
        })
      ).status,
      404,
    );
    for (const proof of [null, 'invalid']) {
      assert.equal(
        (
          await call('/auth/logout', {
            method: 'POST',
            headers: { Cookie, ...(proof ? { 'X-CSRF-Token': proof } : {}) },
          })
        ).status,
        403,
      );
    }
  } finally {
    assert.equal(
      (await call('/auth/logout', { method: 'POST', headers: { Cookie, 'X-CSRF-Token': token } }))
        .status,
      204,
    );
  }
  console.log(
    'PASS: HTTPS same-origin synthetic login, cookie attributes, session, CSRF, preview OFF, logout. No learner evidence created.',
  );
}
main().catch(() => {
  console.error('PACKAGING_AUTH_SMOKE_FAILED');
  process.exitCode = 1;
});
