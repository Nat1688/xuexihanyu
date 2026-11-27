/* UI-04: synthetic browser contract tests. No real accounts or database. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'),
  origin = 'http://127.0.0.1:5203';
const out = path.join(root, '.core-demo', 'ui04-' + Date.now());
fs.mkdirSync(out, { recursive: true });
const id = '10000000-0000-4000-8000-000000000004';
const historyId = '10000000-0000-4000-8000-000000000003';
let browser, vite, page, releaseLoad, releaseAnswer, releaseProgress;
const results = [],
  writes = [],
  submissions = [],
  unknown = [],
  errors = [];
let saved = false,
  format = 'TYPING',
  loadFailure = false,
  answerMode = 'normal',
  holdLoad = false,
  progressMode = 'normal',
  empty = false;
const exercise = () => ({
  sessionId: id,
  lessonId: 'lesson-ui04',
  mode: 'VI_TO_ZH',
  format,
  prompt: 'xin chào',
  options: format === 'MULTIPLE_CHOICE' ? ['再见', '你好', '谢谢'] : null,
  expiresAt: '2099-01-01T00:00:00Z',
  alreadyAnswered: saved,
});
const result = () => ({
  sessionId: id,
  correct: true,
  feedback: 'CORRECT',
  received: '你好',
  expected: '你好',
  submittedAt: '2026-11-25T10:00:00Z',
  integrityStatus: 'COMPLETE',
  next: { action: 'CONTINUE', remaining: 1, completedToday: 1 },
});
async function step(name, action) {
  await action();
  results.push({ name, status: 'PASS' });
  console.log('UI04 PASS: ' + name);
}
(async () => {
  vite = cp.spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5203',
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
  assert.ok(ready);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
  });
  await context.route(origin + '/api/**', async (route) => {
    const request = route.request(),
      p = new URL(request.url()).pathname.slice(4);
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() !== 'GET') writes.push(p);
    if (p === '/auth/me')
      return reply({
        user: {
          publicId: 'student-ui04',
          login: 'ui04@example.invalid',
          displayName: 'Học viên thử nghiệm',
          roles: ['STUDENT'],
        },
      });
    if (p === '/student/today')
      return reply({ dailyGoal: 10, completedToday: 0, remaining: 0, entries: [] });
    if (p === '/student/learning-prototypes/lesson-01/availability')
      return reply({ available: false });
    if (p === '/student/classes')
      return reply({
        classes: empty
          ? []
          : [
              {
                classId: 'class-ui04',
                title: 'Tiếng Trung nhập môn',
                term: null,
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
                assignmentId: 'a1',
                classId: 'class-ui04',
                classTitle: 'Tiếng Trung nhập môn',
                lessonId: 'lesson-ui04',
                lessonTitle: 'Chào hỏi và giới thiệu',
                dueAt: null,
                completion: { total: 2, correct: 1, completed: false },
              },
              {
                assignmentId: 'a2',
                classId: 'class-ui04',
                classTitle: 'Tiếng Trung nhập môn',
                lessonId: 'lesson-two',
                lessonTitle: 'Bài đã hoàn thành',
                dueAt: null,
                completion: { total: 2, correct: 2, completed: true },
              },
              {
                assignmentId: 'a3',
                classId: 'class-ui04',
                classTitle: 'Tiếng Trung nhập môn',
                lessonId: 'lesson-three',
                lessonTitle: 'Bài chưa có thống kê',
                dueAt: null,
              },
            ],
      });
    if (p === '/student/progress') {
      if (progressMode === 'hold')
        await new Promise((r) => {
          releaseProgress = r;
        });
      if (progressMode === 'error')
        return reply({ error: { code: 'UNAVAILABLE', message: 'Synthetic failure' } }, 503);
      if (progressMode === 'expired')
        return reply({ error: { code: 'UNAUTHORIZED', message: 'Synthetic expiry' } }, 401);
      return reply({
        days: 30,
        assignedLessons: empty ? 0 : 3,
        attempts: empty ? 0 : 7,
        correct: empty ? 0 : 5,
        incorrect: empty ? 0 : 2,
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-25T00:00:00Z',
        recentResults: empty
          ? []
          : [
              {
                sessionId: historyId,
                lessonTitle: 'Chào hỏi và giới thiệu',
                correct: true,
                submittedAt: '2026-11-25T10:00:00Z',
              },
            ],
      });
    }
    if (p === '/admissions/courses') return reply({ courses: [], applications: [] });
    if (p === `/student/exercises/${id}`) {
      if (holdLoad)
        await new Promise((r) => {
          releaseLoad = r;
        });
      return loadFailure
        ? reply(
            { error: { code: 'UNAVAILABLE', message: 'Synthetic unavailable' } },
            loadFailure === 'expired' ? 410 : loadFailure === 'unauthorized' ? 401 : 503,
          )
        : reply(exercise());
    }
    if (p === `/student/exercises/${id}/answers`) {
      submissions.push(request.postDataJSON());
      if (answerMode === 'hold')
        await new Promise((r) => {
          releaseAnswer = r;
        });
      if (answerMode === 'retry') {
        answerMode = 'normal';
        return route.abort('failed');
      }
      saved = true;
      if (answerMode === 'aftercommit') {
        answerMode = 'normal';
        return route.abort('failed');
      }
      return reply(result());
    }
    if (p === `/student/exercises/${id}/result/recover`) return reply(result());
    if (p === `/student/exercises/${id}/result`) return reply(result());
    if (p === `/student/exercises/${historyId}/result`)
      return reply({ ...result(), sessionId: historyId });
    unknown.push(p);
    return reply({ error: { code: 'UNEXPECTED', message: 'Missing fixture' } }, 500);
  });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const back = () => page.getByRole('button', { name: 'Tổng quan học tập', exact: true });
  const resume = () => page.getByRole('button', { name: 'Tiếp tục bài đang làm', exact: true });
  async function dashboard() {
    await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
  }
  async function openExercise() {
    await page.evaluate((id) => {
      sessionStorage.setItem('clp.activeExerciseSessionId', id);
      sessionStorage.removeItem('clp.pausedExerciseSessionId');
    }, id);
    await page.reload();
    await page.getByRole('heading', { name: 'Bài tập', exact: true }).waitFor();
  }
  async function noOverflow() {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await step(
    'dashboard uses actual scoped API counts, explicit unknown completion, recent results; GET only',
    async () => {
      await page.goto(origin);
      await dashboard();
      await page.getByText('Bài chưa có thống kê', { exact: true }).count();
      const metrics = page.locator('.ink-dashboard-metrics');
      await metrics.nth(1).waitFor();
      assert.deepEqual(await metrics.first().locator('dd').allTextContents(), ['3', '1', '1']);
      assert.deepEqual(await metrics.nth(1).locator('dd').allTextContents(), ['7', '5', '2']);
      await page.getByText('1 bài chưa có trạng thái hoàn thành', { exact: false }).waitFor();
      assert.equal(writes.length, 0);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await noOverflow();
        await page.screenshot({ path: path.join(out, `dashboard-${width}.png`), fullPage: true });
      }
    },
  );
  await step(
    'UI06 distinct semantic icons and prominent keyboard-accessible overview return at desktop/tablet/mobile',
    async () => {
      const icons = await page
        .locator('.ink-student-nav .ink-nav-icon path')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('d')));
      assert.equal(icons.length, 11);
      assert.equal(new Set(icons).size, 11);
      assert.equal(await page.locator('.ink-student-nav svg:not([aria-hidden="true"])').count(), 0);
      await page.getByRole('button', { name: 'Tự học', exact: true }).click();
      await page.getByRole('heading', { name: 'Hôm nay', exact: true }).waitFor();
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        const button = back();
        await button.focus();
        assert.ok(await button.evaluate((el) => document.activeElement === el));
        const box = await button.boundingBox();
        assert.ok(box.height >= 44 && box.width >= 200);
        assert.equal(
          await button.evaluate((el) => getComputedStyle(el).backgroundColor),
          'rgb(24, 51, 75)',
        );
        await noOverflow();
        await page.screenshot({ path: path.join(out, `self-study-${width}.png`), fullPage: true });
      }
      await back().press('Enter');
      await dashboard();
      assert.equal(writes.length, 0);
    },
  );
  await step(
    'exercise exit preserves typed draft and same session; pause survives reload without answer/token storage',
    async () => {
      await openExercise();
      await page.getByLabel('Câu trả lời của bạn').fill('你好');
      await back().click();
      await dashboard();
      assert.equal(writes.length, 0);
      await resume().click();
      assert.equal(await page.getByLabel('Câu trả lời của bạn').inputValue(), '你好');
      await back().click();
      await dashboard();
      const storage = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
      assert.deepEqual(Object.values(storage), [id, id]);
      await page.reload();
      await dashboard();
      assert.ok(await resume().isVisible());
      await resume().click();
      assert.equal(await page.getByLabel('Câu trả lời của bạn').inputValue(), '');
    },
  );
  await step('MCQ choice survives exit/resume and leaving never posts an answer', async () => {
    await back().click();
    format = 'MULTIPLE_CHOICE';
    await resume().click();
    await page.getByRole('radio', { name: '你好', exact: true }).check();
    await back().click();
    await resume().click();
    assert.ok(await page.getByRole('radio', { name: '你好', exact: true }).isChecked());
    assert.equal(writes.length, 0);
    await back().click();
    format = 'TYPING';
    await page.reload();
    await dashboard();
    await resume().click();
  });
  await step(
    'opening a historical result does not clear the different unfinished exercise',
    async () => {
      await back().click();
      await dashboard();
      await page.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
      await page.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem('clp.activeExerciseSessionId')),
        id,
      );
      await page.getByRole('button', { name: 'Tổng quan học tập', exact: true }).click();
      await dashboard();
      await resume().click();
    },
  );
  await step(
    'network failure then exit/resume retries same token and answer; pending submit blocks exit/tools',
    async () => {
      await page.getByLabel('Câu trả lời của bạn').fill('你好');
      answerMode = 'retry';
      await page.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await back().click();
      await dashboard();
      await resume().click();
      assert.equal(await page.getByLabel('Câu trả lời của bạn').inputValue(), '你好');
      answerMode = 'hold';
      await page.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
      await page.getByRole('button', { name: 'Đang kiểm tra…', exact: true }).waitFor();
      assert.ok(await back().isDisabled());
      assert.ok(
        await page.getByRole('button', { name: 'Công cụ học tập', exact: true }).isDisabled(),
      );
      assert.equal(submissions.length, 2);
      assert.deepEqual(submissions[0], submissions[1]);
      releaseAnswer();
      await page.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
    },
  );
  await step(
    'timeout after commit then explicit resume uses POST recovery without duplicate answer',
    async () => {
      saved = false;
      answerMode = 'aftercommit';
      await openExercise();
      await page.getByLabel('Câu trả lời của bạn').fill('你好');
      await page.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await back().click();
      await dashboard();
      const count = submissions.length;
      await resume().click();
      await page.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
      assert.equal(submissions.length, count);
      assert.ok(writes.includes(`/student/exercises/${id}/result/recover`));
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem('clp.activeExerciseSessionId')),
        null,
      );
    },
  );
  await step(
    'loading and load error always have an exit; late response cannot navigate away from dashboard',
    async () => {
      saved = false;
      holdLoad = true;
      await openExercise();
      await page.getByText('Đang tải bài tập…', { exact: true }).waitFor();
      await back().click();
      await dashboard();
      holdLoad = false;
      releaseLoad();
      loadFailure = true;
      await resume().click();
      await page.getByRole('alert').waitFor();
      assert.ok(
        await page.getByRole('button', { name: 'Thử tải lại bài tập', exact: true }).isVisible(),
      );
      await back().click();
      await dashboard();
      loadFailure = false;
    },
  );
  await step(
    'expired exercise clears resume and returns to dashboard; expired authentication returns to login',
    async () => {
      loadFailure = 'expired';
      await resume().click();
      await dashboard();
      assert.equal(await resume().count(), 0);
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem('clp.activeExerciseSessionId')),
        null,
      );
      loadFailure = 'unauthorized';
      await page.evaluate((id) => sessionStorage.setItem('clp.activeExerciseSessionId', id), id);
      await page.reload();
      await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      loadFailure = false;
      await page.reload();
      await dashboard();
    },
  );
  await step(
    'dashboard loading/error retry are not zero data; empty data gives a real onboarding action',
    async () => {
      progressMode = 'hold';
      await page.reload();
      await dashboard();
      await page
        .locator('.ink-dashboard-progress')
        .getByText('Đang tải tiến độ học tập…', { exact: true })
        .waitFor();
      assert.equal(await page.locator('.ink-dashboard-progress dd').count(), 0);
      progressMode = 'error';
      releaseProgress();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.locator('.ink-dashboard-progress dd').count(), 0);
      progressMode = 'normal';
      await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
      await page.locator('.ink-dashboard-progress dd').first().waitFor();
      empty = true;
      await page.getByRole('button', { name: 'Cập nhật tiến độ', exact: true }).click();
      await page.getByRole('button', { name: 'Tìm khóa học →', exact: true }).waitFor();
      await page
        .getByText('Bạn chưa có lượt trả lời trong phạm vi này.', { exact: false })
        .waitFor();
      await noOverflow();
    },
  );
  await step(
    'expired dashboard session returns to login; no browser runtime errors or unhandled API paths',
    async () => {
      progressMode = 'expired';
      await page.getByRole('button', { name: 'Cập nhật tiến độ', exact: true }).click();
      await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      assert.deepEqual(unknown, []);
      assert.deepEqual(errors, []);
    },
  );
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        status: 'PASS',
        fixtureOnly: true,
        noLiveDatabase: true,
        results,
        answerRequests: submissions.length,
      },
      null,
      2,
    ),
  );
  console.log('EVIDENCE ' + out);
})()
  .catch(async (e) => {
    console.error(e.stack);
    if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
    fs.writeFileSync(
      path.join(out, 'failure.json'),
      JSON.stringify({ message: e.message, results }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
  });
