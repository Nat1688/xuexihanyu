'use strict';
// Real browser, synthetic API interception ONLY. No real accounts/DB/preview gate.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = process.argv[2];
if (!path.isAbsolute(output || '')) throw Error('ABSOLUTE_EVIDENCE_PATH_REQUIRED');
const origin = 'http://127.0.0.1:5196';
const web = path.resolve(__dirname, '..');
const id = '00000000-0000-4000-8000-000000000001';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = spawn(
    process.execPath,
    [
      path.resolve(web, '../../node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5196',
      '--strictPort',
    ],
    {
      cwd: web,
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        VITE_API_BASE_URL: '',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let startup = '';
  server.stdout.on('data', (b) => {
    startup += b;
  });
  server.stderr.on('data', (b) => {
    startup += b;
  });
  let browser;
  try {
    for (let i = 0; i < 100 && !/Local.*5196/s.test(startup) && server.exitCode === null; i++)
      await pause(100);
    assert.ok(/Local.*5196/s.test(startup), 'Refuse to reuse existing server');
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    async function scenario(name, options, run) {
      const context = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1440, height: 900 },
        colorScheme: 'light',
      });
      const page = await context.newPage();
      const requests = [],
        errors = [];
      let loggedIn = !options.anonymous,
        offline = !!options.error;
      const csrf = randomBytes(24).toString('hex');
      await context.addCookies([{ name: 'clp_csrf', value: csrf, url: origin }]);
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          p = url.pathname;
        if (url.origin !== origin) return route.abort();
        if (!/^\/(auth|student|teacher)\//.test(p)) return route.continue();
        const body = req.postDataJSON();
        requests.push({
          path: p,
          method: req.method(),
          ...(p.endsWith('practice-check') ? { body } : {}),
        });
        const send = (value, status = 200) =>
          route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
        const error = (status, code = 'TEST') =>
          send(
            { error: { code, message: 'Internal English error must never appear in UI' } },
            status,
          );
        if (p === '/auth/me')
          return loggedIn
            ? send({
                user: {
                  publicId: id,
                  login: 'synthetic.invalid',
                  displayName: 'Học viên thử nghiệm',
                  roles: options.denied ? ['OTHER_ROLE'] : ['STUDENT'],
                },
              })
            : error(401);
        if (p === '/auth/login') {
          if (options.loginFailure) return error(401);
          loggedIn = true;
          return send({
            user: {
              publicId: id,
              login: 'synthetic.invalid',
              displayName: 'Học viên thử nghiệm',
              roles: ['STUDENT'],
            },
          });
        }
        if (p === '/auth/logout') {
          loggedIn = false;
          return route.fulfill({ status: 204 });
        }
        if (p.endsWith('/availability')) return send({ available: !!options.preview });
        if (p.endsWith('/lesson-01') && req.method() === 'GET') {
          const language = url.searchParams.get('instructionLanguage');
          return send({
            packageId: 'synthetic-lesson-01',
            variantId: 'synthetic-' + language,
            revision: 'synthetic-r1',
            instructionLanguage: language,
            status: 'PREVIEW_ONLY',
            practiceOnly: true,
            recordsProgress: false,
            title:
              language === 'en' ? 'Greetings and self-introduction' : 'Chào hỏi và tự giới thiệu',
            notice:
              language === 'en'
                ? 'Synthetic English teaching content'
                : 'Nội dung bài học giả lập để kiểm thử giao diện',
            objectives: ['Chào hỏi đúng ngữ cảnh'],
            concepts: [
              {
                id: 'hello',
                hanzi: '你好',
                pinyin: 'nǐ hǎo',
                gloss: language === 'en' ? 'hello' : 'xin chào',
              },
            ],
            blocks: [],
            dialogue: [
              {
                speaker: 'A',
                hanzi: '你好',
                pinyin: 'nǐ hǎo',
                translation: language === 'en' ? 'Hello' : 'Xin chào',
              },
            ],
            practices: [
              {
                taskId: 'P1',
                format: 'CHOICE',
                prompt: language === 'en' ? 'Choose a greeting' : 'Chọn câu chào hỏi',
                options: ['你好', '再见'],
              },
            ],
          });
        }
        if (p.endsWith('/practice-check')) {
          assert.equal(req.headers()['x-csrf-token'], csrf);
          return send({
            ...body,
            feedback:
              body.instructionLanguage === 'en'
                ? 'Correct greeting.'
                : 'Đúng: dùng 你好 để chào hỏi.',
            correct: true,
            recordsProgress: false,
            status: 'PREVIEW_ONLY',
          });
        }
        if (p === '/student/today') {
          if (options.loading) await pause(500);
          if (offline) return error(503);
          return send({
            generatedAt: '2026-10-29T00:00:00Z',
            dailyGoal: 10,
            completedToday: 1,
            remaining: options.empty ? 0 : 2,
            empty: !!options.empty,
            entries: options.empty
              ? []
              : [
                  {
                    lessonId: id,
                    lessonTitle: 'Chào hỏi · 你好',
                    itemId: id,
                    state: 'LEARNING',
                    dueAt: null,
                    due: false,
                  },
                ],
          });
        }
        if (p === '/student/exercises/next' || p === '/student/exercises/' + id)
          return send({
            sessionId: id,
            lessonId: id,
            mode: 'VI_TO_ZH',
            format: 'TYPING',
            prompt: 'xin chào',
            options: null,
            expiresAt: '2099-01-01T00:00:00Z',
            alreadyAnswered: false,
          });
        if (p.endsWith('/answers')) {
          assert.equal(req.headers()['x-csrf-token'], csrf);
          return send({
            sessionId: id,
            correct: !options.incorrect,
            feedback: 'Server-owned verdict',
            expected: '你好',
            received: body.answer,
            submittedAt: '2026-10-29T00:00:00Z',
            integrityStatus: 'COMPLETE',
            next: { action: 'NEXT', remaining: 1, completedToday: 2 },
          });
        }
        throw Error('Unexpected synthetic request ' + p);
      });
      const screenshot = async (label) => {
        await page.evaluate(() => {
          const tag = document.createElement('div');
          tag.id = 'vi01-evidence';
          tag.textContent = 'VI-01 · DỮ LIỆU GIẢ LẬP · KIỂM THỬ GIAO DIỆN';
          tag.style.cssText =
            'padding:8px;background:#fff4c9;color:#332800;text-align:center;font:12px sans-serif';
          document.body.prepend(tag);
        });
        await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true });
        await page.locator('#vi01-evidence').evaluate((e) => e.remove());
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'No page overflow',
        );
      };
      try {
        await page.goto(origin);
        await run(page, requests, screenshot, () => {
          offline = false;
        });
        assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
        assert.equal(await page.title(), 'XueXiHanyu — Học tiếng Trung');
        assert.ok(!(await page.locator('body').innerText()).includes('Internal English error'));
        assert.deepEqual(errors, []);
        results.push({ name, status: 'PASS', browserLocale: 'en-US' });
      } finally {
        await context.close();
      }
    }
    await scenario(
      'login and native validation in English browser',
      { anonymous: true },
      async (page, calls, shot) => {
        await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
        await shot('01-login-desktop');
        await page.setViewportSize({ width: 390, height: 844 });
        await shot('02-login-mobile');
        assert.equal(await page.getByRole('button', { name: /English|Tiếng Anh/ }).count(), 0);
        const text = await page.evaluate(() => {
          const input = document.createElement('input');
          input.required = true;
          document.body.append(input);
          input.reportValidity();
          const text = input.validationMessage;
          input.value = 'ok';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const cleared = input.validationMessage;
          input.remove();
          return { text, cleared };
        });
        assert.equal(text.text, 'Vui lòng điền thông tin này.');
        assert.equal(text.cleared, '');
      },
    );
    await scenario(
      'login error uses Vietnamese instead of server details',
      { anonymous: true, loginFailure: true },
      async (page) => {
        await page.getByLabel('Tên đăng nhập').fill('synthetic.invalid');
        await page.getByLabel('Mật khẩu').fill(randomBytes(16).toString('hex'));
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
        await page.getByRole('alert').waitFor();
        assert.ok((await page.getByRole('alert').innerText()).includes('Không thể xác thực'));
      },
    );
    await scenario('student today exercise result and logout', {}, async (page, calls, shot) => {
      await page.getByText('Chào hỏi · 你好', { exact: true }).waitFor();
      await shot('03-today-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('04-today-mobile');
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await page.getByLabel('Câu trả lời của bạn').fill('你好');
      await shot('05-exercise-mobile');
      await page.setViewportSize({ width: 1440, height: 900 });
      await shot('13-exercise-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
      await page.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
      await shot('06-result-mobile');
      await page.setViewportSize({ width: 1440, height: 900 });
      await shot('14-result-desktop');
      assert.ok((await page.locator('body').innerText()).includes('✓ Chính xác'));
      assert.ok((await page.locator('body').innerText()).includes('你好'));
      await page.getByRole('button', { name: 'Về Hôm nay', exact: true }).click();
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await page.getByLabel('Mật khẩu').waitFor();
    });
    await scenario(
      'empty/loading/error/retry states',
      { empty: true, loading: true, error: true },
      async (page, calls, shot, online) => {
        await page.getByText('Đang tải kế hoạch học…', { exact: true }).waitFor();
        await page.getByRole('alert').waitFor();
        await shot('07-network-error');
        online();
        await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
        await page.getByRole('heading', { name: 'Hiện chưa có bài để luyện tập' }).waitFor();
        await shot('08-empty');
      },
    );
    await scenario(
      'unauthorized account sees Vietnamese denial',
      { denied: true },
      async (page, calls, shot) => {
        await page.getByRole('alert').waitFor();
        await shot('09-access-denied');
        assert.ok(calls.every((c) => !c.path.startsWith('/teacher')));
      },
    );
    await scenario(
      'VI preview default; EN teaching variant keeps Vietnamese UI and pinned revision',
      { preview: true },
      async (page, calls, shot) => {
        await page.getByRole('button', { name: 'Bài 01 · BẢN XEM TRƯỚC' }).click();
        await page
          .getByRole('heading', { name: 'Chào hỏi và tự giới thiệu', exact: true })
          .waitFor();
        assert.equal(await page.getByLabel('Ngôn ngữ hướng dẫn trong bài').inputValue(), 'vi');
        await shot('10-preview-vi-desktop');
        await page.setViewportSize({ width: 390, height: 844 });
        await shot('11-preview-vi-mobile');
        await page.getByRole('radio', { name: '你好', exact: true }).check();
        await page.getByRole('button', { name: 'Kiểm tra P1' }).click();
        await page.getByText('Đúng: dùng 你好 để chào hỏi.').waitFor();
        await page.getByLabel('Ngôn ngữ hướng dẫn trong bài').selectOption('en');
        await page.getByRole('heading', { name: 'Greetings and self-introduction' }).waitFor();
        assert.ok((await page.locator('body').innerText()).includes('Tự luyện — chưa lưu tiến độ'));
        await shot('12-en-content-vietnamese-ui');
        await page.getByRole('radio', { name: '你好', exact: true }).check();
        await page.getByRole('button', { name: 'Kiểm tra P1' }).click();
        await page.getByText('Correct greeting.').waitFor();
        const submits = calls.filter((c) => c.path.endsWith('practice-check'));
        assert.equal(submits.length, 2);
        assert.equal(submits[1].body.revision, 'synthetic-r1');
        assert.equal(submits[1].body.instructionLanguage, 'en');
        await page.reload();
        await page.getByRole('heading', { name: 'Hôm nay', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Bài 01 · BẢN XEM TRƯỚC' }).click();
        await page
          .getByRole('heading', { name: 'Chào hỏi và tự giới thiệu', exact: true })
          .waitFor();
        assert.equal(await page.getByLabel('Ngôn ngữ hướng dẫn trong bài').inputValue(), 'vi');
      },
    );
    fs.writeFileSync(
      path.join(output, 'browser-results.json'),
      JSON.stringify(
        {
          environment:
            'Chrome, en-US, real Vite frontend, synthetic API interception; no real database/accounts/preview gate',
          results,
        },
        null,
        2,
      ),
    );
    console.log('VI01 browser PASS: ' + results.length + ' scenarios');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
