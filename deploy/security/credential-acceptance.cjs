'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function ({ prisma, app, vite, browser, owned, api, step }) {
  assert.equal(process.env.DICT_DISPOSABLE_APPROVAL, 'APPROVED_55441_3116_5206');
  assert.equal(process.env.SEC01_ACCEPTANCE, 'RUN_ON_APPROVED_DISPOSABLE');
  assert.equal(api, 'http://127.0.0.1:3116');
  const {
    StructuredLogger,
  } = require('../../apps/api/dist/src/modules/foundation/logging/structured-logger.js');
  const {
    ScryptPasswordHasher,
  } = require('../../apps/api/dist/src/modules/identity/infrastructure/scrypt-password-hasher.js');
  const logs = [];
  const fixture = await require('./https-fixture.cjs')({
    app,
    vite,
    owned,
    logger: new StructuredLogger({ sink: (line) => logs.push(line) }),
  });
  const apiPath = (url) => new URL(url).pathname.replace(/^\/api/, '');
  const password = crypto.randomBytes(24).toString('hex') + ' 漢!';
  const login = 'sec01-form@example.invalid';
  const context = await browser.newContext({
    locale: 'en-US',
    ignoreHTTPSErrors: true, // Isolated self-signed test certificate only.
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const consoleLines = [],
    errors = [],
    urls = [],
    payloads = [],
    responses = [];
  page.on('console', (message) => consoleLines.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.name));
  page.on('request', (request) => {
    urls.push(request.url());
    if (/\/auth\/(?:login|register)$/.test(apiPath(request.url())))
      payloads.push({ path: apiPath(request.url()), body: request.postDataJSON() });
  });
  page.on('response', (response) => {
    if (apiPath(response.url()).startsWith('/auth/')) {
      // Read before Chrome can evict bodies on reload; 204 has no body by contract.
      responses.push(
        (response.status() === 204 ? Promise.resolve('') : response.text())
          .then((text) => ({ text, readable: true }))
          .catch(() => ({ text: '', readable: false })),
      );
    }
  });
  const noReflection = async () =>
    assert.ok(
      await page
        .locator('input[type=password]')
        .evaluateAll((inputs) => inputs.every((input) => !input.hasAttribute('value'))),
    );
  const emptyPasswords = () =>
    page.waitForFunction(() =>
      [...document.querySelectorAll('input[type=password]')].every((input) => input.value === ''),
    );
  let user;
  try {
    await step(
      'SEC01 real registration form validation and salted credential storage, no attribute reflection',
      async () => {
        const before = await prisma.user.count();
        await page.goto(fixture.origin);
        await page
          .getByRole('button', { name: 'Chưa có tài khoản? Đăng ký học sinh', exact: true })
          .click();
        await page.locator('#login-name').fill(login);
        await page.locator('#login-password').fill(password);
        await page.locator('#signup-confirm').fill(password + 'mismatch');
        await noReflection();
        await page.getByRole('button', { name: 'Tạo tài khoản học sinh', exact: true }).click();
        await page.getByRole('alert').waitFor();
        await emptyPasswords();
        assert.equal(await prisma.user.count(), before);
        await page.locator('#login-password').fill(password);
        await page.locator('#signup-confirm').fill(password);
        await noReflection();
        const registered = page.waitForResponse((r) => apiPath(r.url()) === '/auth/register');
        await page.getByRole('button', { name: 'Tạo tài khoản học sinh', exact: true }).click();
        const response = await registered;
        assert.equal(response.status(), 201);
        const body = await response.json();
        assert.deepEqual(Object.keys(body.user).sort(), ['login', 'publicId', 'roles']);
        assert.equal(JSON.stringify(body).includes(password), false);
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
        assert.equal(await prisma.user.count(), before + 1);
        user = await prisma.user.findUnique({
          where: { loginNormalized: login },
          include: { credential: true, roles: true },
        });
        assert.equal(user.state, 'ACTIVE');
        assert.deepEqual(
          user.roles.map((r) => r.role),
          ['STUDENT'],
        );
        assert.equal(user.credential.algorithm, 'scrypt');
        assert.ok(!user.credential.hash.includes(password));
        assert.ok(await new ScryptPasswordHasher().verify(password, user.credential));
        const submitted = payloads.at(-1).body;
        assert.deepEqual(submitted, { login, password, confirmPassword: password });
        payloads.length = 0;
      },
    );
    await step(
      'SEC01 real cookies session reload failed/successful login CSRF and logout stay compatible',
      async () => {
        const cookies = await context.cookies(fixture.origin);
        const session = cookies.find((c) => c.name === 'clp_session');
        assert.ok(session && session.httpOnly && session.secure && session.sameSite === 'Lax');
        assert.ok(cookies.find((c) => c.name === 'clp_csrf' && !c.httpOnly));
        await page.reload();
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
        const logout = page.waitForRequest((r) => apiPath(r.url()) === '/auth/logout');
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
        assert.ok((await logout).headers()['x-csrf-token']);
        await page.locator('#login-password').waitFor();
        await noReflection();
        assert.equal(await page.locator('#login-password').inputValue(), '');
        const wrong = page.waitForResponse((r) => apiPath(r.url()) === '/auth/login');
        await page.locator('#login-name').fill(login);
        await page.locator('#login-password').fill(password + 'wrong');
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
        assert.equal((await wrong).status(), 401);
        await page.getByRole('alert').waitFor();
        await emptyPasswords();
        const success = page.waitForResponse((r) => apiPath(r.url()) === '/auth/login');
        await page.locator('#login-password').fill(password);
        await noReflection();
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
        assert.equal((await success).status(), 200);
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
        assert.equal(payloads.at(-1).body.password, password);
        payloads.length = 0;
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
        await page.locator('#login-password').waitFor();
        assert.equal(
          await prisma.session.count({ where: { userId: user.id, revokedAt: null } }),
          0,
        );
      },
    );
    await step(
      'SEC01 no password/hash leaks in real responses browser persistence URLs or captured application logs',
      async () => {
        for (const response of await Promise.all(responses)) {
          assert.ok(response.readable, 'AUTH_RESPONSE_BODY_NOT_CAPTURED');
          const text = response.text;
          assert.ok(!text.includes(password) && !text.includes(user.credential.hash));
          if (text)
            assert.ok(!/"(?:password|confirmPassword|hash|credential|salt)"\s*:/i.test(text));
        }
        const storage = await page.evaluate(async () => ({
          local: JSON.stringify(localStorage),
          session: JSON.stringify(sessionStorage),
          cookie: document.cookie,
          indexed: await indexedDB.databases(),
        }));
        assert.ok(!JSON.stringify(storage).includes(password));
        assert.equal(storage.indexed.length, 0);
        assert.ok(!consoleLines.some((line) => line.includes(password)));
        assert.ok(
          !logs.some((line) => line.includes(password) || line.includes(user.credential.hash)),
        );
        assert.ok(
          urls.every(
            (url) => !url.includes(password) && !url.includes(encodeURIComponent(password)),
          ),
        );
        assert.deepEqual(errors, []);
        await noReflection();
        await page.screenshot({ path: path.join(owned, 'sec01-real-login.png'), fullPage: true });
        fs.writeFileSync(
          path.join(owned, 'sec01-real-auth.json'),
          JSON.stringify(
            {
              status: 'PASS',
              database: 'new approved disposable only',
              realApiAndBrowser: true,
              transport:
                'HTTPS loopback with temporary self-signed certificate; no production TLS verification claim',
              registration: true,
              storedHashVerified: 'scrypt',
              cookieSecurity: 'Secure/HttpOnly/SameSite=Lax',
              logoutSessionsRevoked: true,
              passwordsInAttributes: false,
              rawCredentialsSaved: false,
              nativePasswordManager: 'NOT_RUN',
            },
            null,
            2,
          ),
        );
      },
    );
  } finally {
    payloads.length = 0;
    await context.close();
    await fixture.close();
  }
};
