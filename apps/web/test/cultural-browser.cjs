/* UI-V5: real Chrome, actual React components, explicitly synthetic API fixtures.
 * No production server/database. Existing workflow harnesses remain unchanged. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..');
const source = process.env.UIV5_SOURCE || root;
const out = path.join(root, '.core-demo', 'cultural-' + Date.now());
fs.mkdirSync(out, { recursive: true });
const origin = 'http://127.0.0.1:5212';
const widths = [390, 768, 1024, 1440, 1920];
let vite, browser;
const results = [],
  errors = [],
  unknown = [],
  external = [];
async function capture(page, name) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(overflow.scroll <= overflow.width, name + ' overflow ' + JSON.stringify(overflow));
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
    results.push({ name, width, status: 'PASS', fixture: 'SYNTHETIC_API_REAL_REACT_CHROME' });
  }
}
(async () => {
  try {
    await fetch(origin);
    throw new Error('PORT_OCCUPIED');
  } catch (e) {
    if (e.message === 'PORT_OCCUPIED') throw e;
  }
  vite = cp.spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5212',
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
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const role of ['LOGIN', 'STUDENT', 'TEACHER', 'ADMIN']) {
    const context = await browser.newContext({ locale: 'en-US', colorScheme: 'dark' });
    const sessionId = '10000000-0000-4000-8000-000000000005';
    const entry = {
      publicId: 'fixture-entry',
      chinese: '你好',
      pinyin: 'nǐ hǎo',
      type: 'WORD',
      revision: 1,
      publication: 'PUBLISHED',
      senses: [{ publicId: 'fixture-sense', vietnamese: 'xin chào', english: 'hello' }],
      categories: [],
      sources: [],
    };
    let answered = false;
    const writes = [];
    await context.addCookies([{ name: 'clp_csrf', value: 'synthetic-csrf-only', url: origin }]);
    await context.route(origin + '/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname.slice(4);
      if (route.request().method() !== 'GET') {
        writes.push(p);
        assert.equal(route.request().headers()['x-csrf-token'], 'synthetic-csrf-only');
      }
      const reply = (body, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (p === '/auth/me')
        return reply(
          role === 'LOGIN'
            ? { user: null }
            : {
                user: {
                  publicId: 'fixture-user',
                  login: role.toLowerCase() + '@example.invalid',
                  displayName: 'Tài khoản kiểm thử',
                  roles: [role],
                },
              },
        );
      if (p === '/student/learning-prototypes/lesson-01/availability')
        return reply({ available: false });
      if (p === '/student/today')
        return reply({ dailyGoal: 10, completedToday: 2, remaining: 0, entries: [] });
      if (p === '/student/classes')
        return reply({
          classes: [
            {
              classId: 'fixture-class',
              title: 'Tiếng Trung nhập môn',
              term: 'Học kỳ 2026',
              enrolledAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      if (p === '/student/assignments')
        return reply({
          assignments: [
            {
              assignmentId: 'fixture-assignment',
              classId: 'fixture-class',
              classTitle: 'Tiếng Trung nhập môn',
              lessonId: 'fixture-lesson',
              lessonTitle: 'Chào hỏi và giới thiệu',
              dueAt: null,
              completion: { total: 2, correct: 1, completed: false },
            },
          ],
        });
      if (p === '/student/progress')
        return reply({
          days: 30,
          assignedLessons: 1,
          attempts: 7,
          correct: 5,
          incorrect: 2,
          from: '2026-11-01T00:00:00Z',
          to: '2026-11-27T00:00:00Z',
          recentResults: [],
        });
      if (p === '/teacher/overview')
        return reply({
          courses: 2,
          classes: 1,
          students: 12,
          lessons: 8,
          assignments: 4,
          completed: 3,
          pending: 1,
        });
      if (p === '/teacher/classes')
        return reply({
          classes: [
            {
              classId: 'fixture-class',
              title: 'Tiếng Trung nhập môn',
              term: 'Học kỳ 2026',
              enrolled: 12,
              createdAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      if (p === '/content/courses') return reply([]);
      if (p === '/admissions/courses') return reply({ courses: [], applications: [] });
      if (p === '/admissions/review') return reply({ applications: [], classes: [] });
      if (/^\/dictionary\/(admin\/)?categories$/.test(p)) return reply([]);
      if (/^\/dictionary\/(admin\/)?entries$/.test(p))
        return reply({
          items: [entry],
          total: 1,
          nextCursor: null,
          catalogRevision: 'fixture-only',
        });
      if (/^\/dictionary\/(admin\/)?entries\/fixture-entry$/.test(p)) return reply(entry);
      if (p === '/student/exercises/next' || p === `/student/exercises/${sessionId}`)
        return reply({
          sessionId,
          lessonId: 'fixture-lesson',
          mode: 'VI_TO_ZH',
          format: 'TYPING',
          prompt: 'xin chào',
          options: null,
          expiresAt: '2099-01-01T00:00:00Z',
          alreadyAnswered: answered,
        });
      if (p === `/student/exercises/${sessionId}/answers`) {
        assert.equal(route.request().postDataJSON().answer, '你好');
        answered = true;
        return reply({
          sessionId,
          correct: true,
          feedback: 'CORRECT',
          received: '你好',
          expected: '你好',
          submittedAt: '2026-11-27T00:00:00Z',
          integrityStatus: 'COMPLETE',
          next: { action: 'CONTINUE', remaining: 0, completedToday: 3 },
        });
      }
      unknown.push(p);
      return reply({ error: { code: 'NOT_FOUND', message: 'Synthetic fixture absent' } }, 404);
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => {
      if (!request.url().startsWith(origin + '/')) external.push(new URL(request.url()).origin);
    });
    await page.goto(origin);
    await page
      .getByRole('heading', {
        name:
          role === 'LOGIN'
            ? 'Đăng nhập'
            : role === 'STUDENT'
              ? 'Tổng quan học tập'
              : 'Không gian giảng dạy',
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
    await capture(page, role.toLowerCase());
    if (role === 'LOGIN') {
      await page.getByLabel('Tên đăng nhập', { exact: true }).focus();
      assert.ok(await page.locator(':focus').count());
      assert.ok(
        await page
          .locator('#login-name')
          .evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth) >= 3),
      );
      if (!process.env.UIV5_SOURCE) {
        assert.equal(
          await page.locator('.cultural-title').evaluate((el) => getComputedStyle(el).fontWeight),
          '900',
        );
        assert.equal(
          await page
            .locator('.cultural-title span')
            .evaluate((el) => getComputedStyle(el).fontWeight),
          '900',
        );
        assert.ok(
          await page
            .locator('.cultural-landmarks')
            .evaluate((el) =>
              getComputedStyle(el).backgroundImage.includes('cultural-landmarks.webp'),
            ),
        );
      }
      await page.getByRole('button', { name: /Chưa có tài khoản/ }).click();
      await page.getByRole('heading', { name: 'Đăng ký học sinh', exact: true }).waitFor();
      await capture(page, 'registration');
    } else {
      const nav = page.getByRole('navigation', {
        name: role === 'STUDENT' ? 'Điều hướng học viên' : 'Điều hướng giáo viên',
      });
      const screens =
        role === 'STUDENT'
          ? [
              ['Lớp của tôi', 'Lớp của tôi'],
              ['Tham gia lớp', 'Tham gia lớp'],
              ['Bài được giao', 'Bài được giao'],
              ['Tiến độ', 'Tiến độ'],
              ['Đăng ký khóa học', 'Đăng ký khóa học'],
            ]
          : [
              ['Khóa học & bài học', 'Khóa học & bài học'],
              ['Giao bài', 'Giao bài'],
              ['Duyệt đăng ký', 'Duyệt đăng ký khóa học'],
            ];
      for (const [label, heading] of screens) {
        await nav.getByRole('button', { name: label, exact: true }).click();
        await page.getByRole('heading', { name: heading, exact: true }).waitFor();
        await capture(
          page,
          role.toLowerCase() + '-' + screens.indexOf(screens.find((s) => s[0] === label)),
        );
      }
      await nav
        .getByRole('button', {
          name: role === 'ADMIN' ? 'Quản lý từ điển' : 'Từ điển',
          exact: true,
        })
        .click();
      await page.locator('.dict-entry').waitFor();
      await capture(page, role.toLowerCase() + '-dictionary');
      await page.getByRole('button', { name: /^Xem chi tiết/ }).click();
      await page.locator('.dict-detail').waitFor();
      await capture(page, role.toLowerCase() + '-dictionary-detail');
      assert.equal(writes.length, 0, 'Reading/navigation never mutates data');
      if (role === 'STUDENT') {
        await page.reload();
        await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
        await page
          .getByRole('navigation', { name: 'Điều hướng học viên' })
          .getByRole('button', { name: 'Tự học', exact: true })
          .click();
        await page.getByRole('heading', { name: 'Hôm nay', exact: true }).waitFor();
        await capture(page, 'today');
        await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
        await page.getByLabel('Câu trả lời của bạn', { exact: true }).fill('你好');
        await capture(page, 'exercise');
        await page.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
        await page.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
        await capture(page, 'result');
        assert.deepEqual(writes, [
          '/student/exercises/next',
          `/student/exercises/${sessionId}/answers`,
        ]);
        await page.getByRole('button', { name: 'Tổng quan học tập', exact: true }).click();
        await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unknown, []);
  assert.deepEqual(external, [], 'Fonts/images/data must stay on the test origin');
  console.log(JSON.stringify({ out, cases: results.length, status: 'PASS' }));
})()
  .catch((e) => {
    results.push({ status: 'FAIL', message: e.message });
    process.exitCode = 1;
    console.error(e.message);
  })
  .finally(async () => {
    fs.writeFileSync(
      path.join(out, 'results.json'),
      JSON.stringify({ results, errors, unknown, external }, null, 2),
    );
    if (browser) await browser.close();
    if (vite) vite.kill();
  });
