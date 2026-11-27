/* UI-03 visual/interaction regression. Synthetic fixtures only; never a live API. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const origin = 'http://127.0.0.1:5201';
const out = path.join(root, '.core-demo', 'ui03-' + Date.now());
fs.mkdirSync(out, { recursive: true });
let vite, browser, page;
const results = [];
async function step(name, action) {
  await action();
  results.push({ name, status: 'PASS' });
  console.log('UI03 PASS: ' + name);
}
(async () => {
  vite = cp.spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5201',
      '--strictPort',
    ],
    {
      cwd: path.join(root, 'apps/web'),
      windowsHide: true,
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        VITE_API_BASE_URL: '/api',
      },
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
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, 'dedicated Vite ready');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    colorScheme: 'dark',
    viewport: { width: 1440, height: 1000 },
  });
  let authenticated = false,
    failClasses = false,
    empty = false,
    expire = false,
    releaseJoin;
  const writes = [],
    unknown = [],
    errors = [];
  await context.route(origin + '/api/**', async (route) => {
    const request = route.request(),
      p = new URL(request.url()).pathname.slice(4);
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/auth/me')
      return reply({
        user: authenticated
          ? {
              publicId: 'ui03-student',
              displayName: 'Học viên thử nghiệm',
              login: 'ui03@example.invalid',
              roles: ['STUDENT'],
            }
          : null,
      });
    if (p === '/admissions/courses')
      return expire
        ? reply({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }, 401)
        : reply({ courses: [], applications: [] });
    if (p === '/student/classes/join') {
      writes.push(p);
      await new Promise((r) => {
        releaseJoin = r;
      });
      return reply({ ok: true });
    }
    if (p === '/student/classes')
      return failClasses
        ? reply({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Synthetic test error' } }, 503)
        : reply({
            classes: empty
              ? []
              : [
                  {
                    classId: 'class-ui03',
                    title: 'Tiếng Trung nhập môn',
                    term: 'Khóa học thử nghiệm',
                    enrolledAt: '2026-11-01T00:00:00Z',
                  },
                ],
          });
    if (p === '/student/assignments')
      return reply({
        assignments: empty
          ? []
          : [
              {
                assignmentId: 'assignment-ui03',
                classId: 'class-ui03',
                classTitle: 'Tiếng Trung nhập môn',
                lessonId: 'lesson-ui03',
                lessonTitle: 'Chào hỏi và giới thiệu',
                dueAt: null,
                completion: { total: 3, correct: 1, completed: false },
              },
            ],
      });
    if (p === '/student/progress')
      return reply({
        days: 30,
        assignedLessons: empty ? 0 : 1,
        attempts: empty ? 0 : 2,
        correct: empty ? 0 : 1,
        incorrect: empty ? 0 : 1,
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-25T00:00:00Z',
        recentResults: [],
      });
    if (p === '/auth/logout') {
      writes.push(p);
      authenticated = false;
      return reply({ ok: true });
    }
    unknown.push(p);
    return reply({ error: { code: 'UNEXPECTED', message: 'Fixture missing' } }, 500);
  });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const nav = (name) =>
    page
      .getByRole('navigation', { name: 'Điều hướng học viên' })
      .getByRole('button', { name, exact: true });
  async function fits() {
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no page overflow',
    );
  }
  await step('Vietnamese login with English browser and dark OS, keyboard focus', async () => {
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
    assert.equal(
      await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(243, 246, 249)',
    );
    await page.keyboard.press('Tab');
    assert.ok(await page.locator(':focus-visible').count());
    await page.screenshot({ path: path.join(out, 'login-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await fits();
    await page.screenshot({ path: path.join(out, 'login-mobile.png'), fullPage: true });
  });
  await step(
    'Student sidebar retains course admission, class join, assignments, progress, self study and tools',
    async () => {
      authenticated = true;
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.reload();
      await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
      await nav('Đăng ký khóa học').click();
      await page.getByRole('heading', { name: 'Đăng ký khóa học', exact: true }).waitFor();
      for (const label of [
        'Đăng ký khóa học',
        'Lớp của tôi',
        'Tham gia lớp',
        'Bài được giao',
        'Tiến độ',
        'Tự học',
        'Công cụ học tập',
      ])
        assert.ok(await nav(label).isVisible());
      await nav('Lớp của tôi').click();
      await page.getByRole('heading', { name: 'Tiếng Trung nhập môn', exact: true }).waitFor();
      assert.equal(await nav('Lớp của tôi').getAttribute('aria-current'), 'page');
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await fits();
        await page.screenshot({
          path: path.join(out, 'student-classes-' + width + '.png'),
          fullPage: true,
        });
      }
    },
  );
  await step(
    'Assignments and progress retain real contract labels and accessible actions',
    async () => {
      await nav('Bài được giao').click();
      await page.getByRole('heading', { name: 'Chào hỏi và giới thiệu' }).waitFor();
      assert.ok(
        await page.getByText('1/3 mục luyện tập đã trả lời đúng', { exact: false }).isVisible(),
      );
      assert.ok(await page.getByRole('button', { name: 'Mở bài học', exact: true }).isVisible());
      assert.ok(
        await page
          .getByRole('button', { name: 'Luyện tập bài được giao', exact: true })
          .isVisible(),
      );
      await fits();
      await page.screenshot({
        path: path.join(out, 'student-assignments-mobile.png'),
        fullPage: true,
      });
      await nav('Tiến độ').click();
      await page
        .getByText('đây không phải tỷ lệ hoàn thành bài được giao.', { exact: false })
        .waitFor();
      await fits();
    },
  );
  await step('In-flight join keeps navigation/tools/logout disabled and posts once', async () => {
    await nav('Tham gia lớp').click();
    await page.getByLabel('Mã tham gia lớp').fill('synthetic-ui03-code');
    await page.locator('form').getByRole('button', { name: 'Tham gia lớp', exact: true }).click();
    await page.getByText('Đang xử lý, vui lòng chờ…', { exact: true }).waitFor();
    assert.ok(await nav('Lớp của tôi').isDisabled());
    assert.ok(await nav('Công cụ học tập').isDisabled());
    assert.ok(await page.getByRole('button', { name: 'Đăng xuất', exact: true }).isDisabled());
    assert.equal(writes.filter((x) => x.endsWith('/join')).length, 1);
    releaseJoin();
    await page.getByText('Đã tham gia lớp. Mở Lớp của tôi để xem.', { exact: true }).waitFor();
    assert.ok(await nav('Lớp của tôi').isEnabled());
  });
  await step('Student empty and error states remain distinct with retry', async () => {
    empty = true;
    await nav('Lớp của tôi').click();
    await page.getByText('Bạn chưa tham gia lớp nào.', { exact: false }).waitFor();
    failClasses = true;
    await nav('Tiến độ').click();
    await nav('Lớp của tôi').click();
    await page.getByRole('alert').waitFor();
    failClasses = false;
    empty = false;
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByRole('heading', { name: 'Tiếng Trung nhập môn' }).waitFor();
  });
  await step('Session expiry returns to login and logout preserves existing flow', async () => {
    expire = true;
    await nav('Đăng ký khóa học').click();
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    expire = false;
    authenticated = true;
    await page.reload();
    await nav('Lớp của tôi').waitFor();
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.equal(writes.filter((x) => x === '/auth/logout').length, 1);
    assert.deepEqual(unknown, []);
    assert.deepEqual(errors, []);
  });
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      { status: 'PASS', fixtureOnly: true, noLiveDatabase: true, locale: 'en-US', results },
      null,
      2,
    ),
  );
  console.log('EVIDENCE ' + out);
})()
  .catch(async (error) => {
    console.error(error.message);
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
    fs.writeFileSync(
      path.join(out, 'failure.json'),
      JSON.stringify({ message: error.message, results }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
  });
