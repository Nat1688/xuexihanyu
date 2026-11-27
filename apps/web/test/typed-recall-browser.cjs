/* FC-02 typed/cloze interactions. Synthetic API fixtures, never a live database. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'),
  origin = 'http://127.0.0.1:5205',
  out = path.join(root, '.core-demo', 'fc02-' + Date.now());
fs.mkdirSync(out, { recursive: true });
const ids = {
  course: 'a0000000-0000-4000-8000-000000000001',
  unit: 'b0000000-0000-4000-8000-000000000001',
  one: 'c0000000-0000-4000-8000-000000000001',
  two: 'c0000000-0000-4000-8000-000000000002',
};
const node = (id, title) => ({
  publicId: id,
  title,
  slug: 'fixture',
  description: null,
  visibility: 'PUBLISHED',
  position: 0,
});
let vite, browser, page;
const results = [],
  requests = [],
  errors = [],
  unknown = [];
async function step(name, run) {
  await run();
  results.push({ name, status: 'PASS' });
  console.log('FC02 PASS: ' + name);
}
(async () => {
  vite = cp.spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5205',
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
    const reply = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') throw Error('UNEXPECTED_WRITE');
    if (p === '/auth/me')
      return reply({
        user: {
          publicId: 'student-fixture',
          login: 'fc02@example.invalid',
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
    if (p === '/admissions/courses')
      return reply({
        courses: [node(ids.course, 'Tiếng Trung nhập môn')],
        applications: [
          {
            publicId: 'application',
            status: 'APPROVED',
            createdAt: '2026-11-01T00:00:00Z',
            course: { publicId: ids.course, title: 'Tiếng Trung nhập môn' },
          },
        ],
      });
    if (p === `/content/courses/${ids.course}/units`) return reply([node(ids.unit, 'Chương một')]);
    if (p === `/content/units/${ids.unit}/lessons`)
      return reply([node(ids.one, 'Chào hỏi'), node(ids.two, 'Chữ Hán')]);
    if (p === `/content/lessons/${ids.one}`)
      return reply({
        revision: 'fixture',
        lesson: node(ids.one, 'Chào hỏi'),
        items: [
          {
            publicId: 'hello',
            kind: 'VOCABULARY',
            simplified: '你好',
            pinyin: 'nǐ hǎo',
            meaning: 'xin chào',
            reference: { example: '你好，小安！你好！' },
          },
          {
            publicId: 'bye',
            kind: 'VOCABULARY',
            simplified: '再见',
            pinyin: 'zàijiàn',
            meaning: 'tạm biệt',
          },
        ],
      });
    if (p === `/content/lessons/${ids.two}`)
      return reply({
        revision: 'fixture',
        lesson: node(ids.two, 'Chữ Hán'),
        items: [
          { publicId: 'learn', kind: 'CHARACTER', simplified: '学', pinyin: null, meaning: 'học' },
        ],
      });
    unknown.push(p);
    return reply({ error: { code: 'UNEXPECTED', message: 'Missing fixture' } });
  });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
  await page
    .getByRole('navigation', { name: 'Điều hướng học viên' })
    .getByRole('button', { name: 'Flashcard ôn tập', exact: true })
    .click();
  const input = () => page.locator('#fc-typed-answer');
  const feedback = () => page.locator('.fc-typed-feedback');
  async function begin(practice = 'typing', direction = 'chinese', lesson = ids.one) {
    await page.getByLabel('Khóa học', { exact: true }).selectOption(ids.course);
    await page.getByLabel('Bộ thẻ', { exact: true }).selectOption(lesson);
    await page.getByLabel('Cách ôn tập', { exact: true }).selectOption(practice);
    if (practice !== 'cloze')
      await page.getByLabel('Mặt trước của thẻ', { exact: true }).selectOption(direction);
    await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
    await input().waitFor();
  }
  async function chooseAgain() {
    await page.getByRole('button', { name: 'Chọn bộ thẻ khác', exact: true }).click();
    await page.getByLabel('Khóa học', { exact: true }).waitFor();
  }
  await step(
    'type a meaning, hide sample until checking, neutral synonym comparison and retry',
    async () => {
      await begin();
      assert.ok((await page.locator('.fc-typed-prompt').innerText()).includes('你好'));
      assert.ok(!(await page.locator('.fc-typed-prompt').innerText()).includes('xin chào'));
      assert.equal(await feedback().count(), 0);
      assert.ok(await page.getByRole('button', { name: 'Đối chiếu', exact: true }).isDisabled());
      assert.ok(await page.getByRole('button', { name: 'Đã nhớ', exact: true }).isDisabled());
      await input().fill('chào bạn');
      await input().press('Enter');
      await page.getByText('Chưa trùng cách diễn đạt mẫu.', { exact: false }).waitFor();
      assert.ok(!(await feedback().innerText()).includes('Chưa chính xác'));
      assert.ok(await input().isDisabled());
      await page.getByRole('button', { name: 'Thử viết lại', exact: true }).click();
      assert.equal(await input().inputValue(), '');
      assert.equal(await feedback().count(), 0);
      assert.ok(await page.getByRole('button', { name: 'Đã nhớ', exact: true }).isDisabled());
      await input().fill('  XIN   CHÀO ');
      await input().press('Enter');
      await page.getByText('Khớp với đáp án mẫu.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
      assert.equal(await input().inputValue(), '');
      assert.equal(await feedback().count(), 0);
      assert.ok((await page.locator('.fc-typed-prompt').innerText()).includes('再见'));
    },
  );
  await step('meaning to Chinese supports IME Enter without premature reveal', async () => {
    await chooseAgain();
    await begin('typing', 'meaning');
    assert.ok((await page.locator('.fc-typed-prompt').innerText()).includes('xin chào'));
    assert.ok(!(await page.locator('.fc-typed-prompt').innerText()).includes('你好'));
    await input().fill('你好');
    await input().evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '你' }));
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter',
          isComposing: true,
          keyCode: 229,
        }),
      );
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你好' }));
      el.form.requestSubmit();
    });
    assert.equal(await feedback().count(), 0);
    await input().press('Enter');
    await page.getByText('Khớp với đáp án mẫu.', { exact: true }).waitFor();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(out, `typing-${width}.png`), fullPage: true });
    }
  });
  await step(
    'cloze masks every target using existing example, discloses filtered count, repeat resets input',
    async () => {
      await chooseAgain();
      await begin('cloze', 'meaning', '*');
      assert.ok(
        (await page.locator('.fc-typed-prompt').innerText()).includes('____，小安！____！'),
      );
      assert.ok(!(await page.locator('.fc-typed-prompt').innerText()).includes('你好'));
      await page.getByText('Có 1 / 3 thẻ có ví dụ phù hợp.', { exact: false }).waitFor();
      assert.equal(await page.getByText('nǐ hǎo', { exact: true }).count(), 0);
      await input().fill('你好');
      await page.getByRole('button', { name: 'Đối chiếu', exact: true }).click();
      await page.getByText('Khớp với đáp án mẫu.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Cần ôn lại', exact: true }).click();
      await page.getByRole('heading', { name: 'Hoàn tất lượt tự ôn', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Ôn lại thẻ chưa nhớ', exact: true }).click();
      assert.equal(await input().inputValue(), '');
      assert.equal(await feedback().count(), 0);
      await page.screenshot({ path: path.join(out, 'cloze-mobile.png'), fullPage: true });
    },
  );
  await step(
    'no invented cloze when examples are missing; direct typing and reveal remain available',
    async () => {
      await chooseAgain();
      await page.getByLabel('Bộ thẻ', { exact: true }).selectOption(ids.two);
      await page.getByLabel('Cách ôn tập', { exact: true }).selectOption('cloze');
      await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
      await page.getByText('Bài này chưa có ví dụ phù hợp', { exact: false }).waitFor();
      assert.equal(await input().count(), 0);
      await page.getByLabel('Cách ôn tập', { exact: true }).selectOption('typing');
      await page.getByLabel('Mặt trước của thẻ', { exact: true }).selectOption('meaning');
      await page.getByRole('button', { name: 'Bắt đầu ôn tập', exact: true }).click();
      await page.getByRole('button', { name: 'Xem đáp án mẫu', exact: true }).click();
      await page.getByText('Đáp án mẫu để bạn tự đối chiếu.', { exact: true }).waitFor();
      assert.ok(await page.getByRole('button', { name: 'Đã nhớ', exact: true }).isEnabled());
    },
  );
  await step(
    'typed text never leaves browser, never enters storage, and reload resets the round',
    async () => {
      await page.getByRole('button', { name: 'Thử viết lại', exact: true }).click();
      await input().fill('<img src=x onerror="window.fixtureAttack=1">');
      await page.getByRole('button', { name: 'Đối chiếu', exact: true }).click();
      assert.equal(await page.locator('.fc-typed img').count(), 0);
      assert.equal(await page.evaluate(() => window.fixtureAttack), undefined);
      assert.deepEqual(
        await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
        { local: {}, session: {} },
      );
      assert.ok(requests.every((row) => row.method === 'GET'));
      assert.deepEqual(unknown, []);
      assert.deepEqual(errors, []);
      await page.reload();
      await page.getByRole('heading', { name: 'Tổng quan học tập', exact: true }).waitFor();
      assert.equal(await input().count(), 0);
    },
  );
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify(
      { status: 'PASS', fixtureOnly: true, noLiveDatabase: true, allRequestsGet: true, results },
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
