// SEC-01 UI-boundary regression. Auth responses here are explicitly mocked;
// real API/session/registration is verified separately on the disposable stack.
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const baseline = process.env.SEC01_BASELINE === '1';
const source = baseline ? path.resolve(root, '../dict07-worktree') : root;
const out = process.env.SEC01_EVIDENCE_DIR;
assert.ok(out && fs.statSync(out).isDirectory(), 'PREPARED_EVIDENCE_DIRECTORY_REQUIRED');
assert.ok(!fs.existsSync(path.join(source, '.env')), 'ENV_FREE_WORKTREE_REQUIRED');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port = 5206,
  origin = 'http://127.0.0.1:' + port;
const password = [' Synthetic', '-SEC01-', '漢&"', '-Only! '].join('');
const principal = {
  publicId: '11111111-1111-4111-8111-111111111111',
  login: 'synthetic@example.invalid',
  displayName: null,
  roles: ['STUDENT'],
};
let activePage;
let vite,
  browser,
  stage = 'preflight';
const results = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const test = async (name, fn) => {
  stage = name;
  await fn();
  results.push({ name, status: 'PASS' });
  console.log('SEC01 PASS: ' + name);
};
async function main() {
  await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
  vite = cp.spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: path.join(source, 'apps/web'),
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, VITE_API_BASE_URL: '/api' },
    },
  );
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, 'VITE_NOT_READY');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
  });
  const page = (activePage = await context.newPage()),
    consoleLines = [],
    pageErrors = [],
    calls = [];
  let logged = false,
    mode = 'failure',
    release;
  page.on('console', (m) => consoleLines.push(m.text()));
  page.on('pageerror', (e) => pageErrors.push(e.name));
  await page.route('**/*', (route) =>
    route
      .request()
      .url()
      .startsWith(origin + '/')
      ? route.continue()
      : route.abort(),
  );
  await page.route(origin + '/api/**', async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    const body = r.postDataJSON();
    const answer = (status, data) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: status === 204 ? '' : JSON.stringify(data),
      });
    if (url.pathname === '/api/auth/me')
      return answer(
        logged ? 200 : 401,
        logged
          ? { user: principal }
          : { error: { code: 'AUTH_UNAUTHENTICATED', message: 'Chưa đăng nhập.' } },
      );
    if (url.pathname === '/api/auth/logout') {
      logged = false;
      return answer(204);
    }
    if (['/api/auth/login', '/api/auth/register'].includes(url.pathname)) {
      calls.push({ path: url.pathname, url: r.url(), method: r.method(), body });
      if (mode === 'network') return route.abort('failed');
      if (mode === 'pending')
        await new Promise((resolve) => {
          release = resolve;
        });
      if (mode === 'success') {
        logged = true;
        return answer(url.pathname.endsWith('register') ? 201 : 200, { user: principal });
      }
      return answer(url.pathname.endsWith('register') ? 422 : 401, {
        error: {
          code: url.pathname.endsWith('register')
            ? 'REGISTRATION_INVALID'
            : 'AUTH_INVALID_CREDENTIALS',
          message: url.pathname.endsWith('register')
            ? 'Nhập email hợp lệ, mật khẩu 8–128 ký tự và xác nhận khớp nhau.'
            : 'Thông tin đăng nhập không hợp lệ.',
        },
      });
    }
    return answer(503, {
      error: {
        code: 'UI_TEST_ONLY',
        message: 'Phần dữ liệu workspace không thuộc UI-boundary test.',
      },
    });
  });
  await page.goto(origin);
  await page.locator('#login-password').waitFor();
  const noReflection = async () =>
    assert.ok(
      await page
        .locator('input[type="password"]')
        .evaluateAll((inputs) =>
          inputs.every((i) => !i.hasAttribute('value') && !i.hasAttribute('defaultValue')),
        ),
      'PASSWORD_ATTRIBUTE_REFLECTION',
    );
  const login = page.locator('#login-name'),
    pw = page.locator('#login-password');
  if (baseline) {
    await pw.fill(password);
    await test('before patch: controlled input reproduces application value-attribute reflection', async () => {
      assert.equal(await pw.getAttribute('value'), password);
    });
    await page.screenshot({ path: path.join(out, 'sec01-baseline-masked.png'), fullPage: true });
    fs.writeFileSync(
      path.join(out, 'sec01-baseline.json'),
      JSON.stringify(
        {
          status: 'REPRODUCED',
          results,
          syntheticOnly: true,
          rawPasswordRecorded: false,
          nativePasswordManager: 'NOT_RUN',
        },
        null,
        2,
      ),
    );
    return;
  }
  await test('initial login input empty, no HTML value, native autocomplete enabled', async () => {
    assert.equal(await pw.inputValue(), '');
    await noReflection();
    assert.equal(await pw.getAttribute('autocomplete'), 'current-password');
    assert.equal(await login.getAttribute('autocomplete'), 'username');
  });
  await test('manual password typing does not reflect plaintext into attributes', async () => {
    await login.fill('synthetic@example.invalid');
    await pw.fill(password);
    assert.equal(await pw.inputValue(), password);
    await noReflection();
  });
  await test('validation rerender preserves uncontrolled DOM value without reflection', async () => {
    await login.fill('');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await pw.inputValue(), password);
    await noReflection();
    assert.equal(calls.length, 0);
  });
  await test('failed login preserves exact POST password, clears fields, shows Vietnamese error', async () => {
    await login.fill('  synthetic@example.invalid  ');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#login-password').value === '');
    assert.equal(calls.at(-1).body.password, password);
    assert.equal(calls.at(-1).body.login, 'synthetic@example.invalid');
    assert.equal(calls.at(-1).method, 'POST');
    assert.equal(new URL(calls.at(-1).url).search, '');
    await noReflection();
    await page.getByRole('alert').waitFor();
  });
  async function autofill(events) {
    await page.evaluate(
      ({ password, events }) => {
        for (const [id, value] of [
          ['login-name', 'synthetic@example.invalid'],
          ['login-password', password],
        ]) {
          const input = document.getElementById(id);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
            input,
            value,
          );
          if (events) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      },
      { password, events },
    );
  }
  await test('simulated autofill without input events submits current native form values', async () => {
    await autofill(false);
    await noReflection();
    const n = calls.length;
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#login-password').value === '');
    assert.equal(calls.length, n + 1);
    assert.equal(calls.at(-1).body.password, password);
    await noReflection();
  });
  await test('simulated autofill with native input/change events has no attribute reflection', async () => {
    await autofill(true);
    await noReflection();
    assert.equal(await pw.inputValue(), password);
  });
  await test('mode switching clears password and registration fields use new-password names', async () => {
    await page
      .getByRole('button', { name: 'Chưa có tài khoản? Đăng ký học sinh', exact: true })
      .click();
    assert.equal(await pw.inputValue(), '');
    assert.equal(await pw.getAttribute('autocomplete'), 'new-password');
    assert.equal(await page.locator('#signup-confirm').getAttribute('name'), 'confirmPassword');
    assert.equal(
      await page.locator('#signup-confirm').getAttribute('autocomplete'),
      'new-password',
    );
    await noReflection();
  });
  await test('registration validation preserves payload contract and clears both passwords', async () => {
    await pw.fill(password);
    await page.locator('#signup-confirm').fill(password + 'different');
    await page.getByRole('button', { name: 'Tạo tài khoản học sinh', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('input[type=password]')].every((x) => x.value === ''),
    );
    assert.equal(calls.at(-1).body.password, password);
    assert.equal(calls.at(-1).body.confirmPassword, password + 'different');
    await noReflection();
  });
  await test('busy state and synchronous double-submit protection do not copy secrets into HTML', async () => {
    mode = 'pending';
    await pw.fill(password);
    await page.locator('#signup-confirm').fill(password);
    const n = calls.length;
    await page.locator('form').evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.waitForFunction(
      () => document.querySelector('form').getAttribute('aria-busy') === 'true',
    );
    for (let i = 0; i < 40 && !release; i++) await delay(25);
    assert.equal(calls.length, n + 1);
    assert.ok((await pw.getAttribute('readonly')) !== null);
    assert.ok(await page.locator('form button[type=submit]').isDisabled());
    await noReflection();
    mode = 'success';
    release();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
  });
  await test('registration success, existing session check and logout return to empty login', async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await pw.waitFor();
    assert.equal(await pw.inputValue(), '');
    await noReflection();
  });
  await test('successful login uses current-password and logout remains available', async () => {
    mode = 'success';
    await login.fill('synthetic@example.invalid');
    await pw.fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
    assert.equal(calls.at(-1).path, '/api/auth/login');
    assert.equal(calls.at(-1).body.password, password);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await pw.waitFor();
  });
  await test('network failure clears password without logging the credential', async () => {
    mode = 'network';
    await login.fill('synthetic@example.invalid');
    await pw.fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.waitForFunction(() => document.querySelector('#login-password').value === '');
    await noReflection();
  });
  await test('no credentials in browser storage cookies URLs console or error output', async () => {
    const storage = await page.evaluate(async () => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      cookies: document.cookie,
      databases: await indexedDB.databases(),
    }));
    for (const value of Object.values(storage))
      assert.ok(!JSON.stringify(value).includes(password));
    assert.equal(storage.databases.length, 0);
    assert.ok(!consoleLines.some((s) => s.includes(password)));
    assert.deepEqual(pageErrors, []);
    assert.ok(
      calls.every(
        (c) => !c.url.includes(encodeURIComponent(password)) && !c.url.includes(password),
      ),
    );
  });
  await page.screenshot({ path: path.join(out, 'sec01-login-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(out, 'sec01-login-mobile.png'), fullPage: true });
  fs.writeFileSync(
    path.join(out, 'sec01-ui-browser.json'),
    JSON.stringify(
      {
        status: 'PASS',
        results,
        syntheticOnly: true,
        authenticationResponses: 'MOCKED_UI_BOUNDARY_ONLY',
        simulatedAutofill: 'PASS with/without events',
        nativePasswordManager: 'NOT_RUN; manual acceptance required',
        rawCredentialsRecorded: false,
      },
      null,
      2,
    ),
  );
}
main()
  .catch(async (error) => {
    console.error('SEC01 UI FAIL: ' + stage + ' ' + error.name);
    console.error(error.message.replaceAll(password, '[SYNTHETIC REDACTED]'));
    if (activePage)
      await activePage.screenshot({
        path: path.join(out, 'sec01-ui-failure-masked-' + Date.now() + '.png'),
        fullPage: true,
      });
    fs.writeFileSync(
      path.join(out, 'sec01-ui-failure.json'),
      JSON.stringify({ stage, errorClass: error.name }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
  });
