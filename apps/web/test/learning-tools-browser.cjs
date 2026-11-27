'use strict';
const {
  chromium,
} = require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const cp = require('node:child_process'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const origin = process.env.TOOLS01_ORIGIN || 'http://127.0.0.1:5197';
const out =
  process.env.TOOLS01_EVIDENCE_DIR ||
  path.join(root, '.core-demo', 'tools01-browser-' + Date.now());
assert.ok(path.isAbsolute(out) && !path.relative(root, out).startsWith('..'));
fs.mkdirSync(out, { recursive: true });
let browser,
  vite,
  stage = 'start';
const results = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(name, fn) {
  stage = name;
  await fn();
  results.push({ name, status: 'PASS' });
  console.log('TOOLS01 PASS: ' + name);
}
(async () => {
  if (!process.env.TOOLS01_ORIGIN) {
    vite = cp.spawn(
      process.execPath,
      [
        path.join(root, 'node_modules/vite/bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--port',
        '5197',
        '--strictPort',
      ],
      {
        cwd: path.join(root, 'apps/web'),
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          VITE_API_BASE_URL: '/api',
        },
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  if (!process.env.TOOLS01_ORIGIN)
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Unauthenticated' } }),
      }),
    );
  let providerRequests = 0;
  const media = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname.endsWith('an2.net')) providerRequests++;
  });
  page.on('response', (r) => {
    if (/\/ma[1-4]\.mp3/.test(r.url()) && [200, 206].includes(r.status()))
      media.push(new URL(r.url()).pathname);
  });
  await step('public Vietnamese hub; no external provider before explicit selection', async () => {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    await page
      .getByLabel('Tên đăng nhập', { exact: true })
      .fill('unsent-tools-test@example.invalid');
    await page.getByRole('button', { name: 'Công cụ học tập', exact: true }).click();
    await page.getByRole('heading', { name: 'Công cụ học tập', exact: true }).waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(providerRequests, 0);
    await page.screenshot({ path: path.join(out, 'hub-desktop.png'), fullPage: true });
  });
  await step('pinned Pinyin table, search, four tone dialog and isolated iframe', async () => {
    await page.getByRole('button', { name: 'Mở Pinyin Studio', exact: true }).click();
    const frame = page.frameLocator('iframe[title^="Pinyin Studio"]');
    await frame.locator('.syllable').first().waitFor();
    assert.equal(await frame.locator('.syllable').count(), 406);
    assert.ok(
      !(await page.locator('iframe').getAttribute('sandbox')).includes('allow-same-origin'),
    );
    const child = page.frames().find((f) => f.parentFrame() === page.mainFrame());
    assert.equal(
      await child.evaluate(() => {
        try {
          parent.document.title;
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    await frame.getByRole('textbox', { name: 'Tìm kiếm âm tiết' }).fill('ma');
    await frame.getByRole('button', { name: 'Nghe âm tiết ma', exact: true }).click();
    await frame.getByRole('dialog').waitFor();
    assert.equal(await frame.locator('#toneGrid button').count(), 4);
  });
  await step('actual remote MP3 playback completes for four tones', async () => {
    const frame = page.frameLocator('iframe[title^="Pinyin Studio"]');
    await frame
      .locator('#playingText')
      .filter({ hasText: 'Phát âm xong' })
      .waitFor({ timeout: 35000 });
    assert.ok((await frame.locator('#audioMode').innerText()).includes('Phát âm MP3'));
    for (let n = 2; n <= 4; n++) {
      const response = page.waitForResponse(
        (r) => r.url().includes(`/ma${n}.mp3`) && [200, 206].includes(r.status()),
      );
      await frame.locator(`#toneGrid button[data-tone="${n}"]`).click();
      await response;
      await frame
        .locator('#playingText')
        .filter({ hasText: 'Phát âm xong' })
        .waitFor({ timeout: 35000 });
      assert.ok(media.some((p) => p.endsWith(`/ma${n}.mp3`)));
    }
    await page.screenshot({ path: path.join(out, 'pinyin-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'pinyin-mobile.png'), fullPage: true });
  });
  await step(
    'AN2 Vietnamese worksheet appears inline with permanent external fallback',
    async () => {
      await page.getByRole('button', { name: 'Giấy tập viết', exact: true }).click();
      const frame = page.frameLocator('iframe[title^="an2.net"]');
      await frame.locator('textarea').first().waitFor({ timeout: 45000 });
      assert.equal(
        await page
          .getByRole('link', { name: 'mở công cụ ở tab riêng', exact: true })
          .getAttribute('href'),
        'https://www.an2.net/vi/tools/worksheet/tianzige',
      );
      await frame.locator('textarea').first().fill('你好');
      await page.screenshot({ path: path.join(out, 'writing-mobile.png'), fullPage: true });
      const created = context.waitForEvent('page');
      await frame.getByRole('button', { name: 'Tạo', exact: true }).click();
      const worksheet = await created;
      await worksheet.waitForLoadState('domcontentloaded');
      assert.equal(new URL(worksheet.url()).pathname, '/vi/tools/worksheet/tianzige/preview');
      await worksheet.locator('body').filter({ hasText: '你' }).waitFor();
      assert.ok((await worksheet.locator('body').innerText()).includes('好'));
      console.log(
        'AN2_PREVIEW=' +
          JSON.stringify({
            title: await worksheet.title(),
            buttons: await worksheet.getByRole('button').allTextContents(),
            printAvailable: await worksheet.evaluate(() => typeof window.print === 'function'),
          }),
      );
      await worksheet.screenshot({ path: path.join(out, 'writing-generated.png'), fullPage: true });
      await worksheet.close();
    },
  );
  await step('closing tools restores original input without submitting login', async () => {
    await page.getByRole('button', { name: '← Quay lại học tập', exact: true }).click();
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Tên đăng nhập', { exact: true }).inputValue(),
      'unsent-tools-test@example.invalid',
    );
    assert.equal(await page.locator('iframe').count(), 0);
  });
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        status: 'PASS',
        origin,
        results,
        mp3Responses: media.length,
        providerRequests,
        loginNotSubmitted: true,
      },
      null,
      2,
    ),
  );
})()
  .catch((error) => {
    console.error('TOOLS01 FAIL ' + stage + ': ' + error.message);
    fs.writeFileSync(
      path.join(out, 'results.json'),
      JSON.stringify({ status: 'FAIL', stage, message: error.message, results }, null, 2),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
  });
