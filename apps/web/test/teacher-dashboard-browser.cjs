/* UI-02 presentation/navigation acceptance with explicit synthetic API fixtures.
 * Run with Playwright installed or on NODE_PATH. Does not contact a live API. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'),
  origin = 'http://127.0.0.1:5199';
const out = path.resolve(
  process.env.UI02_EVIDENCE_DIR || path.join(root, '.core-demo', 'ui02-' + Date.now()),
);
assert.ok(!path.relative(root, out).startsWith('..'));
fs.mkdirSync(out, { recursive: true });
let browser,
  vite,
  activePage,
  stage = 'startup';
const results = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(name, run) {
  stage = name;
  await run();
  results.push({ name, status: 'PASS' });
  console.log('UI02 PASS: ' + name);
}
(async () => {
  vite = cp.spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5199',
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
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
  });
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
  });
  let overview = {
      courses: 0,
      classes: 0,
      students: 0,
      lessons: 0,
      assignments: 0,
      completed: 0,
      pending: 0,
    },
    classes = [],
    error = false,
    holdOverview,
    releaseOverview;
  let roles = ['TEACHER'];
  const writes = [],
    unknown = [];
  await context.route(origin + '/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      p = url.pathname.slice(4);
    let body;
    if (p === '/auth/me')
      body = {
        user: {
          publicId: 'teacher-ui-fixture',
          login: 'teacher.ui@example.invalid',
          displayName: null,
          roles,
        },
      };
    else if (p === '/teacher/overview') {
      if (holdOverview) await holdOverview;
      if (error)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Synthetic unavailable' },
          }),
        });
      body = overview;
    } else if (p === '/teacher/classes' && request.method() === 'POST') {
      const data = request.postDataJSON();
      writes.push({ path: p, data });
      body = {
        classId: '00000000-0000-4000-8000-000000000001',
        title: data.title,
        term: data.term,
        enrolled: 0,
        createdAt: '2026-10-31T00:00:00Z',
      };
      classes = [body];
      overview = { ...overview, classes: 1 };
    } else if (p === '/teacher/classes') body = { classes };
    else if (p === '/content/courses') body = [];
    else if (p === '/admissions/review') body = { applications: [], classes: [] };
    else if (p.startsWith('/student/'))
      body = p.endsWith('/classes')
        ? { classes: [] }
        : p.endsWith('/assignments')
          ? { assignments: [] }
          : { results: [], summary: {} };
    else if (p === '/admissions/courses') body = { courses: [], applications: [] };
    else {
      unknown.push(p);
      body = { error: { code: 'UNEXPECTED_FIXTURE_REQUEST', message: p } };
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', (e) => console.error('PAGE_ERROR ' + e.message));
  const nav = (name) =>
    page
      .getByRole('navigation', { name: 'Điều hướng giáo viên' })
      .getByRole('button', { name, exact: true });
  async function home() {
    await nav('Tổng quan').click();
    await page.getByRole('heading', { name: 'Không gian giảng dạy', exact: true }).waitFor();
    await page.locator('.tw-start').waitFor();
  }
  async function guide(name) {
    if ((await page.locator('.tw-start').getAttribute('open')) === null)
      await page.locator('.tw-start summary').click();
    await page
      .locator('.tw-steps')
      .getByRole('button', { name: new RegExp('^' + name) })
      .click();
  }
  async function noOverflow() {
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no horizontal page overflow',
    );
  }
  await step(
    'empty dashboard guides five actions without seven zero cards or duplicate brand',
    async () => {
      await page.goto(origin);
      await page.getByRole('heading', { name: 'Không gian giảng dạy', exact: true }).waitFor();
      await page.locator('.tw-steps button').first().waitFor();
      assert.equal(await page.locator('.tw-steps button').count(), 5);
      assert.equal(await page.locator('.tw-stats').count(), 0);
      assert.equal(await page.locator('.clp-shell > header').isHidden(), true);
      assert.equal(writes.length, 0);
      await noOverflow();
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(80);
      await page.screenshot({ path: path.join(out, 'empty-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await noOverflow();
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(80);
      await page.screenshot({ path: path.join(out, 'empty-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await step('empty-state create action focuses existing form and saves exactly once', async () => {
    await page.getByRole('button', { name: 'Tạo lớp đầu tiên', exact: true }).click();
    await page.getByLabel('Tên lớp', { exact: true }).waitFor();
    assert.equal(
      await page
        .getByLabel('Tên lớp', { exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.getByLabel('Tên lớp', { exact: true }).fill('Lớp UI thử nghiệm');
    await page.getByRole('button', { name: 'Tải lại danh sách lớp', exact: true }).focus();
    await page.getByRole('button', { name: 'Tạo lớp đầu tiên', exact: true }).click();
    assert.equal(
      await page
        .getByLabel('Tên lớp', { exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    assert.equal(
      await page.getByLabel('Tên lớp', { exact: true }).inputValue(),
      'Lớp UI thử nghiệm',
      'repeated shortcut preserves unsaved class title',
    );

    await page.getByRole('button', { name: 'Tạo lớp', exact: true }).click();
    await page.getByText('Đã tạo lớp.', { exact: true }).waitFor();
    await page.locator('.tw-stats').waitFor();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.title, 'Lớp UI thử nghiệm');
  });
  await step(
    'all five guide shortcuts open existing authoring, class form, review and assignment destinations',
    async () => {
      for (const action of ['Tạo khóa học', 'Soạn và xuất bản']) {
        await guide(action);
        await page.getByRole('heading', { name: 'Khóa học & bài học', exact: true }).waitFor();
        await home();
      }
      await guide('Tạo lớp');
      await page.getByLabel('Tên lớp', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Đóng biểu mẫu', exact: true }).click();
      await guide('Duyệt học sinh');
      await page.getByRole('heading', { name: 'Duyệt đăng ký khóa học', exact: true }).waitFor();
      await home();
      await guide('Giao bài');
      await page.getByRole('heading', { name: 'Giao bài', exact: true }).waitFor();
      await home();
      assert.equal(writes.length, 1, 'navigation never creates data');
    },
  );
  await step(
    'populated overview retains seven API metrics with four aligned primary cards',
    async () => {
      overview = {
        courses: 3,
        classes: 2,
        students: 12,
        lessons: 8,
        assignments: 24,
        pending: 9,
        completed: 15,
      };
      classes = [
        ...classes,
        { ...classes[0], classId: 'second', title: 'Lớp UI thứ hai', enrolled: 12 },
      ];
      await page.reload();
      await page.locator('.tw-stats strong').filter({ hasText: '24' }).waitFor();
      assert.deepEqual(await page.locator('.tw-stats strong').allTextContents(), [
        '2',
        '12',
        '8',
        '24',
      ]);
      assert.deepEqual(await page.locator('.tw-overview-summary strong').allTextContents(), [
        '3',
        '9',
        '15',
      ]);
      const positions = await page
        .locator('.tw-stats strong')
        .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y));
      assert.equal(new Set(positions).size, 1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(80);
      await page.screenshot({ path: path.join(out, 'populated-desktop.png'), fullPage: true });
      for (const width of [768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow();
        await page.evaluate(() => window.scrollTo(0, 0));
        await delay(80);
        await page.screenshot({ path: path.join(out, `populated-${width}.png`), fullPage: true });
      }
    },
  );
  await step('loading and failed overview do not appear as genuine zero data', async () => {
    holdOverview = new Promise((r) => {
      releaseOverview = r;
    });
    await page.reload();
    await page.getByText('Đang tải không gian làm việc…', { exact: true }).first().waitFor();
    assert.equal(await page.locator('.tw-stats').count(), 0);
    releaseOverview();
    holdOverview = null;
    await page.locator('.tw-stats').waitFor();
    error = true;
    await page.reload();
    await page.getByRole('alert').first().waitFor();
    assert.equal(await page.locator('.tw-stats').count(), 0);
    assert.equal(await page.getByText('Chưa có dữ liệu thống kê.', { exact: false }).count(), 0);
    error = false;
  });
  await step('multi-role account keeps its workspace switch', async () => {
    roles = ['TEACHER', 'STUDENT'];
    await page.reload();
    await page.getByRole('navigation', { name: 'Chuyển không gian học tập' }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Học viên', exact: true }).isVisible(),
      true,
    );
    assert.equal(await page.locator('.clp-shell > header > p').isHidden(), true);
    assert.equal(unknown.length, 0, unknown.join(','));
  });
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        status: 'PASS',
        fixtureOnly: true,
        results,
        writes: writes.length,
        locale: 'en-US',
        apiUnchanged: true,
      },
      null,
      2,
    ),
  );
  console.log('EVIDENCE ' + out);
})()
  .catch(async (e) => {
    if (activePage) {
      console.log('PAGE_TEXT ' + (await activePage.locator('body').innerText()).slice(0, 600));
      await activePage.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
    }
    console.error('UI02 FAIL ' + stage + ': ' + e.message);
    fs.writeFileSync(
      path.join(out, 'results.json'),
      JSON.stringify({ status: 'FAIL', stage, message: e.message, results }, null, 2),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
  });
