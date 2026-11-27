/* FC-01 browser contracts. Synthetic API fixtures; no real users or database. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'),
  origin = 'http://127.0.0.1:5204',
  out = path.join(root, '.core-demo', 'fc01-' + Date.now());
fs.mkdirSync(out, { recursive: true });
const ids = {
  a: 'a0000000-0000-4000-8000-000000000001',
  b: 'a0000000-0000-4000-8000-000000000002',
  pending: 'a0000000-0000-4000-8000-000000000003',
  unitA: 'b0000000-0000-4000-8000-000000000001',
  unitB: 'b0000000-0000-4000-8000-000000000002',
  draftUnit: 'b0000000-0000-4000-8000-000000000003',
  one: 'c0000000-0000-4000-8000-000000000001',
  two: 'c0000000-0000-4000-8000-000000000002',
  three: 'c0000000-0000-4000-8000-000000000003',
};
const node = (id, title, visibility = 'PUBLISHED') => ({
  publicId: id,
  title,
  visibility,
  slug: 'synthetic',
  description: null,
  position: 0,
});
const hello = {
  publicId: 'item-hello',
  kind: 'VOCABULARY',
  simplified: '你好',
  pinyin: 'nǐ hǎo',
  meaning: 'xin chào',
  reference: { example: '<img src=x onerror="window.fixtureAttack=1">' },
};
const document = (id, items) => ({
  revision: 'fixture-revision',
  lesson: node(id, 'Bài học thử nghiệm'),
  items,
});
let vite, browser, page, releaseCatalog, releaseDocument;
let catalogMode = 'normal',
  denied = 0,
  noCards = false,
  holdDocument = false,
  emptyLessons = false;
const results = [],
  requests = [],
  errors = [],
  unknown = [];
async function step(name, action) {
  await action();
  results.push({ name, status: 'PASS' });
  console.log('FC01 PASS: ' + name);
}
(async () => {
  vite = cp.spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5204',
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
    const req = route.request(),
      p = new URL(req.url()).pathname.slice(4);
    requests.push({ path: p, method: req.method() });
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET')
      return reply({ error: { code: 'UNEXPECTED_WRITE', message: 'No writes allowed' } }, 500);
    if (p === '/auth/me')
      return reply({
        user: {
          publicId: 'student-fixture',
          login: 'fc01@example.invalid',
          displayName: 'Học viên thử nghiệm',
          roles: ['STUDENT'],
        },
      });
    if (p === '/student/classes') return reply({ classes: [] });
    if (p === '/student/assignments') return reply({ assignments: [] });
    if (p === '/student/progress')
      return reply({
        days: 30,
        assignedLessons: 0,
        attempts: 0,
        correct: 0,
        incorrect: 0,
        recentResults: [],
      });
    if (p === '/admissions/courses') {
      if (catalogMode === 'hold')
        await new Promise((r) => {
          releaseCatalog = r;
        });
      if (catalogMode === 'error')
        return reply({ error: { code: 'UNAVAILABLE', message: 'Fixture outage' } }, 503);
      return reply({
        courses: [
          node(ids.a, 'Khóa được duyệt A'),
          node(ids.b, 'Khóa được duyệt B'),
          node(ids.pending, 'Khóa đang chờ'),
        ],
        applications:
          catalogMode === 'empty'
            ? []
            : [
                {
                  publicId: 'application-A',
                  status: 'APPROVED',
                  createdAt: '2026-11-01T00:00:00Z',
                  course: { publicId: ids.a, title: 'Khóa được duyệt A' },
                },
                {
                  publicId: 'application-B',
                  status: 'APPROVED',
                  createdAt: '2026-11-01T00:00:00Z',
                  course: { publicId: ids.b, title: 'Khóa được duyệt B' },
                },
                {
                  publicId: 'application-pending',
                  status: 'PENDING',
                  createdAt: '2026-11-01T00:00:00Z',
                  course: { publicId: ids.pending, title: 'Khóa đang chờ' },
                },
              ],
      });
    }
    if (p === `/content/courses/${ids.a}/units`)
      return reply([node(ids.unitA, 'Chương một'), node(ids.draftUnit, 'Chương nháp', 'DRAFT')]);
    if (p === `/content/courses/${ids.b}/units`) return reply([node(ids.unitB, 'Chương B')]);
    if (p === `/content/units/${ids.unitA}/lessons`)
      return reply([
        node(ids.one, 'Chào hỏi'),
        node(ids.two, 'Chữ Hán'),
        node('draft-lesson', 'Bài nháp', 'DRAFT'),
      ]);
    if (p === `/content/units/${ids.unitB}/lessons`)
      return reply(emptyLessons ? [] : [node(ids.three, 'Bài học B')]);
    if (p.startsWith('/content/lessons/')) {
      const id = p.split('/').at(-1);
      if (holdDocument && id === ids.one)
        await new Promise((r) => {
          releaseDocument = r;
        });
      if (denied)
        return reply({ error: { code: 'FORBIDDEN', message: 'private-debug-detail' } }, denied);
      if (noCards)
        return reply(
          document(id, [{ kind: 'GRAMMAR', simplified: '你好', meaning: 'không phải thẻ' }]),
        );
      return reply(
        document(
          id,
          id === ids.one
            ? [
                hello,
                {
                  publicId: 'bye',
                  kind: 'VOCABULARY',
                  simplified: '再见',
                  pinyin: 'zàijiàn',
                  meaning: 'tạm biệt',
                },
              ]
            : id === ids.two
              ? [
                  hello,
                  {
                    publicId: 'learn',
                    kind: 'CHARACTER',
                    simplified: '学',
                    pinyin: null,
                    meaning: 'học',
                  },
                  { kind: 'MEDIA_REFERENCE', simplified: 'x', meaning: 'không tải media' },
                ]
              : [
                  {
                    publicId: 'learn',
                    kind: 'CHARACTER',
                    simplified: '学',
                    pinyin: null,
                    meaning: 'học',
                  },
                ],
        ),
      );
    }
    unknown.push(p);
    return reply({ error: { code: 'UNEXPECTED', message: 'Missing fixture' } }, 500);
  });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const nav = () =>
    page
      .getByRole('navigation', { name: 'Điều hướng học viên' })
      .getByRole('button', { name: 'Flashcard ôn tập', exact: true });
  const card = () => page.locator('.fc-card');
  async function setup() {
    await page.getByRole('heading', { name: 'Flashcard ôn tập', exact: true }).waitFor();
  }
  async function choose(course = ids.a, lesson = ids.one, direction = 'chinese') {
    await page.getByLabel('Khóa học', { exact: true }).selectOption(course);
    await page.getByLabel('Bộ thẻ', { exact: true }).selectOption(lesson);
    await page.getByLabel('Mặt trước của thẻ', { exact: true }).selectOption(direction);
    await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
    await card().waitFor();
  }
  async function changeDeck() {
    await page.getByRole('button', { name: 'Chọn bộ thẻ khác', exact: true }).click();
    await page.getByLabel('Khóa học', { exact: true }).waitFor();
  }
  async function fresh() {
    await page.reload();
    await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
    await nav().click();
    await setup();
  }
  await step(
    'dashboard and sidebar expose flashcards; only approved published-course choices',
    async () => {
      await page.goto(origin);
      await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Mở flashcard ôn tập', exact: true }).click();
      await setup();
      await page.getByLabel('Khóa học', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('option', { name: 'Khóa đang chờ', exact: true }).count(),
        0,
      );
      assert.equal(await page.getByRole('navigation', { name: 'Điều hướng giáo viên' }).count(), 0);
    },
  );
  await step(
    'flip hides Pinyin/meaning until requested, keyboard works, self-ratings are local',
    async () => {
      await choose();
      assert.ok((await card().innerText()).includes('你好'));
      assert.ok(!(await card().innerText()).includes('nǐ hǎo'));
      assert.ok(!(await card().innerText()).includes('xin chào'));
      assert.ok(await page.getByRole('button', { name: 'Đã nhớ', exact: true }).isDisabled());
      const count = requests.length;
      await card().focus();
      await page.keyboard.press('Enter');
      await page.getByText('nǐ hǎo', { exact: true }).waitFor();
      assert.equal(await page.locator('.fc-card img').count(), 0);
      assert.equal(await page.evaluate(() => window.fixtureAttack), undefined);
      await page.getByRole('button', { name: 'Cần ôn lại', exact: true }).click();
      assert.ok((await card().innerText()).includes('再见'));
      assert.ok(await card().evaluate((el) => el === document.activeElement));
      await page.keyboard.press('Space');
      await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
      await page.getByRole('heading', { name: 'Hoàn tất lượt tự ôn', exact: true }).waitFor();
      assert.ok((await page.locator('.fc-summary').innerText()).includes('1 / 2'));
      assert.equal(requests.length, count);
      await page.getByRole('button', { name: 'Ôn lại thẻ chưa nhớ', exact: true }).click();
      assert.ok((await card().innerText()).includes('你好'));
      await card().click();
      await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
      assert.ok((await page.locator('.fc-summary').innerText()).includes('2 / 2'));
      assert.equal(
        await page.getByRole('button', { name: 'Ôn lại thẻ chưa nhớ', exact: true }).count(),
        0,
      );
      assert.deepEqual(
        await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
        { local: {}, session: {} },
      );
      hello.reference.example = '你好，小安！';
    },
  );
  await step('meaning-first direction, responsive cards and learner-only text', async () => {
    await changeDeck();
    await choose(ids.a, ids.one, 'meaning');
    assert.ok((await card().innerText()).includes('xin chào'));
    assert.ok(!(await card().innerText()).includes('你好'));
    await card().click();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(out, `card-${width}.png`), fullPage: true });
    }
    assert.ok(!(await page.locator('body').innerText()).includes(ids.one));
  });
  await step(
    'whole-course deck deduplicates shared items and excludes unpublished metadata',
    async () => {
      await changeDeck();
      await choose(ids.a, '*');
      await page.getByText('Thẻ 1 / 3', { exact: true }).waitFor();
      assert.equal(await page.getByRole('option', { name: 'Bài nháp', exact: true }).count(), 0);
      assert.ok(!requests.some((x) => x.path.includes(ids.draftUnit)));
      await card().click();
      await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
      await card().click();
      await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
      await card().click();
      await page.getByText('Nội dung này chưa có Pinyin.', { exact: true }).waitFor();
    },
  );
  await step(
    'denied read exposes neither partial deck nor raw backend details; retry succeeds',
    async () => {
      await changeDeck();
      denied = 403;
      await page.getByLabel('Bộ thẻ', { exact: true }).selectOption(ids.one);
      await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await card().count(), 0);
      assert.ok(!(await page.locator('body').innerText()).includes('private-debug-detail'));
      denied = 0;
      await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
      await card().waitFor();
    },
  );
  await step('course switch during document fetch cannot reveal a stale deck', async () => {
    await changeDeck();
    holdDocument = true;
    await page.getByLabel('Bộ thẻ', { exact: true }).selectOption(ids.one);
    await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
    await page.getByRole('button', { name: 'Đang chuẩn bị bộ thẻ…', exact: true }).waitFor();
    await choose(ids.b, ids.three);
    assert.ok((await card().innerText()).includes('学'));
    const received = page.waitForResponse(
      (r) => r.url() === origin + `/api/content/lessons/${ids.one}`,
    );
    holdDocument = false;
    releaseDocument();
    await received;
    assert.ok((await card().innerText()).includes('学'));
  });
  await step('empty usable content and empty lesson lists keep an exit path', async () => {
    await changeDeck();
    noCards = true;
    await page.getByLabel('Bộ thẻ', { exact: true }).selectOption(ids.three);
    await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
    await page.getByText('Chưa có thẻ phù hợp.', { exact: false }).waitFor();
    assert.equal(await card().count(), 0);
    noCards = false;
    emptyLessons = true;
    await fresh();
    await page.getByLabel('Khóa học', { exact: true }).selectOption(ids.b);
    await page
      .getByText('Khóa học chưa có bài học đã xuất bản để ôn tập.', { exact: true })
      .waitFor();
    emptyLessons = false;
  });
  await step('catalog loading, errors, empty approvals and retry are distinct', async () => {
    catalogMode = 'hold';
    await fresh();
    await page.getByText('Đang tải khóa học của bạn…', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Khóa học', { exact: true }).count(), 0);
    catalogMode = 'error';
    releaseCatalog();
    await page.getByRole('alert').waitFor();
    catalogMode = 'normal';
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByLabel('Khóa học', { exact: true }).waitFor();
    catalogMode = 'empty';
    await fresh();
    await page.getByText('Bạn chưa có khóa học đã được duyệt', { exact: false }).waitFor();
    catalogMode = 'normal';
  });
  await step(
    'reload discards self-rating state; expired session returns to login; every request is GET',
    async () => {
      await fresh();
      await choose();
      await card().click();
      await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
      await fresh();
      assert.equal(await card().count(), 0);
      assert.equal(await page.locator('.fc-summary').count(), 0);
      assert.equal(await page.getByLabel('Khóa học', { exact: true }).inputValue(), '');
      denied = 401;
      await page.getByLabel('Khóa học', { exact: true }).selectOption(ids.a);
      await page.getByLabel('Bộ thẻ', { exact: true }).selectOption(ids.one);
      await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
      await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      assert.ok(requests.every((x) => x.method === 'GET'));
      assert.deepEqual(errors, []);
      assert.deepEqual(unknown, []);
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
        allRequestsGet: true,
        requests: requests.length,
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
