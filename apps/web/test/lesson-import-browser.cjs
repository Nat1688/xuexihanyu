// IMPORT-01: actual production bundle, synthetic API only, no production writes.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..');
const dist = path.resolve(process.env.IMPORT01_DIST || path.join(root, 'apps/web/dist'));
const out = path.resolve(
  process.env.IMPORT01_EVIDENCE_DIR || path.join(root, 'artifacts/import01-browser'),
);
assert.ok(!path.relative(root, out).startsWith('..'));
const origin = process.env.IMPORT01_ORIGIN || 'http://127.0.0.1:5214';
fs.mkdirSync(out, { recursive: true });
const node = (id, title) => ({
  publicId: id,
  title,
  slug: id,
  description: null,
  visibility: 'DRAFT',
  position: 0,
});
let document = {
  revision: 'revision-1',
  lesson: node('lesson', 'Bài cũ'),
  items: [
    { publicId: 'old-item', kind: 'VOCABULARY', simplified: '我', pinyin: 'wǒ', meaning: 'Tôi' },
  ],
};
let server, browser;
const writes = [],
  unknown = [],
  pageErrors = [],
  results = [];
async function step(name, fn) {
  await fn();
  results.push(name);
  console.log('IMPORT01 PASS: ' + name);
}
(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      const p = url.pathname.slice(4);
      let body;
      if (p === '/auth/me')
        body = {
          user: {
            publicId: 'synthetic-teacher',
            login: 'teacher@example.invalid',
            roles: ['TEACHER'],
          },
        };
      else if (p === '/teacher/overview')
        body = {
          courses: 1,
          classes: 0,
          students: 0,
          lessons: 1,
          assignments: 0,
          completed: 0,
          pending: 0,
        };
      else if (p === '/teacher/classes') body = { classes: [] };
      else if (p === '/content/courses') body = [node('course', 'Khóa mẫu')];
      else if (p === '/content/courses/course/units') body = [node('unit', 'Chương mẫu')];
      else if (p === '/content/units/unit/lessons') body = [document.lesson];
      else if (p === '/content/lessons/lesson') body = document;
      else if (p === '/content/lessons/lesson/save' && req.method === 'POST') {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => {
          const parsed = JSON.parse(data);
          writes.push({ parsed, csrf: req.headers['x-csrf-token'] });
          document = {
            revision: 'revision-2',
            lesson: {
              ...document.lesson,
              title: parsed.title,
              description: parsed.description,
              visibility: parsed.visibility,
            },
            items: parsed.items,
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(document));
        });
        return;
      } else {
        unknown.push(p);
        res.writeHead(500);
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (rel.includes('..')) {
      res.writeHead(400);
      res.end();
      return;
    }
    const file = path.join(dist, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.csv': 'text/csv;charset=utf-8',
      '.woff2': 'font/woff2',
      '.webp': 'image/webp',
    };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(5214, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (process.env.IMPORT01_ORIGIN) {
    // Exercise live static assets with synthetic authenticated API responses only.
    await context.route(origin + '/api/**', async (route) => {
      const request = route.request();
      const response = await fetch('http://127.0.0.1:5214' + new URL(request.url()).pathname, {
        method: request.method(),
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': request.headers()['x-csrf-token'] || '',
        },
        ...(request.method() === 'POST' ? { body: request.postData() } : {}),
      });
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: await response.text(),
      });
    });
  }
  await context.addCookies([{ name: 'clp_csrf', value: 'synthetic-proof', url: origin }]);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const open = async () => {
    await page.goto(origin);
    await page
      .getByRole('navigation', { name: 'Điều hướng giáo viên' })
      .getByRole('button', { name: 'Khóa học & bài học', exact: true })
      .click();
    await page.getByRole('button', { name: 'Chọn khóa học →', exact: true }).click();
    await page.getByRole('button', { name: 'Mở chương →', exact: true }).click();
    await page.getByRole('button', { name: 'Soạn bài học →', exact: true }).click();
    await page.getByText('Nhập bài học từ file JSON / CSV', { exact: true }).click();
  };
  const preview = page.getByRole('region', { name: 'Xem trước file nhập' });
  const file = page.getByLabel('Chọn file bài học');
  await step('JSON preview and cancel preserve editor without writes', async () => {
    await open();
    await file.setInputFiles(path.join(dist, 'templates/bai-hoc-mau.json'));
    await preview.waitFor();
    assert.match(await preview.innerText(), /你好/);
    assert.equal(await page.getByLabel('Tiêu đề bài học', { exact: true }).inputValue(), 'Bài cũ');
    await page.getByRole('button', { name: 'Hủy nhập', exact: true }).click();
    assert.equal(await preview.count(), 0);
    assert.equal(writes.length, 0);
  });
  await step('invalid file shows error and leaves old contents intact', async () => {
    await file.setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{'),
    });
    await page.getByRole('alert').filter({ hasText: 'JSON không hợp lệ' }).waitFor();
    assert.equal(
      await page.getByLabel('Chữ Hán / cấu trúc / câu ví dụ', { exact: true }).first().inputValue(),
      '我',
    );
    assert.equal(writes.length, 0);
  });
  await step(
    'Vietnamese Excel guide and downloaded CSV show Unicode headers and examples',
    async () => {
      const guide = page.getByRole('region', { name: 'Hướng dẫn điền mẫu CSV' });
      assert.match(await guide.innerText(), /CSV UTF-8/);
      await guide.getByText('Giải thích từng cột và ví dụ cần điền', { exact: true }).click();
      assert.equal(await guide.locator('dt').count(), 9);
      assert.match(await guide.innerText(), /Nghĩa tiếng Việt/);
      assert.match(await guide.innerText(), /nǐ hǎo/);
      const downloadEvent = page.waitForEvent('download');
      await page
        .getByRole('link', { name: 'Tải mẫu CSV tiếng Việt (mở bằng Excel)', exact: true })
        .click();
      const download = await downloadEvent;
      const target = path.join(out, 'mau-tieng-viet.csv');
      await download.saveAs(target);
      const bytes = fs.readFileSync(target);
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.match(bytes.toString('utf8'), /Tên bài học,Giới thiệu bài học,Loại nội dung/);
      await file.setInputFiles(target);
      await preview.waitFor();
      assert.match(await preview.innerText(), /Từ vựng: 你好/);
      assert.doesNotMatch(await preview.innerText(), /VOCABULARY|GRAMMAR/);
      await page.getByRole('button', { name: 'Hủy nhập', exact: true }).click();
      assert.equal(writes.length, 0);
    },
  );
  await step('CSV append keeps old item and title without saving', async () => {
    await file.setInputFiles(path.join(dist, 'templates/bai-hoc-mau.csv'));
    await preview.waitFor();
    await page.getByRole('button', { name: 'Áp dụng vào trình soạn bài', exact: true }).click();
    assert.equal(
      await page.getByLabel('Chữ Hán / cấu trúc / câu ví dụ', { exact: true }).count(),
      3,
    );
    assert.equal(await page.getByLabel('Tiêu đề bài học', { exact: true }).inputValue(), 'Bài cũ');
    assert.equal(writes.length, 0);
  });
  await step(
    'explicit JSON replacement, draft save and reopening preserve revision contract',
    async () => {
      await file.setInputFiles(path.join(dist, 'templates/bai-hoc-mau.json'));
      await preview.waitFor();
      await page.getByLabel('Cách nhập', { exact: true }).selectOption('replace');
      await page.getByRole('button', { name: 'Áp dụng vào trình soạn bài', exact: true }).click();
      assert.equal(
        await page.getByLabel('Tiêu đề bài học', { exact: true }).inputValue(),
        'Bài 1 — Chào hỏi',
      );
      assert.equal(
        await page.getByLabel('Chữ Hán / cấu trúc / câu ví dụ', { exact: true }).count(),
        2,
      );
      assert.equal(writes.length, 0);
      await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
      await page.getByText('Đã lưu bản nháp trên hệ thống.', { exact: true }).waitFor();
      assert.equal(writes.length, 1);
      assert.equal(writes[0].csrf, 'synthetic-proof');
      assert.equal(writes[0].parsed.revision, 'revision-1');
      assert.equal(writes[0].parsed.publicId, 'lesson');
      assert.equal(writes[0].parsed.visibility, 'DRAFT');
      assert.equal(writes[0].parsed.items.length, 2);
      await open();
      assert.equal(
        await page.getByLabel('Chữ Hán / cấu trúc / câu ví dụ', { exact: true }).count(),
        2,
      );
    },
  );
  await step('download JSON contains current lesson with no server identities', async () => {
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải bài hợp lệ (.json)', exact: true }).click();
    const download = await downloadEvent;
    const target = path.join(out, 'download.json');
    await download.saveAs(target);
    const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.equal(saved.title, 'Bài 1 — Chào hỏi');
    assert.equal(saved.items.length, 2);
    assert.equal(saved.revision, undefined);
    assert.equal(saved.items[0].publicId, undefined);
    await file.setInputFiles(target);
    await preview.waitFor();
    await page.getByRole('button', { name: 'Hủy nhập', exact: true }).click();
  });
  await step('mobile and desktop import controls remain usable', async () => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const guide = page.getByRole('region', { name: 'Hướng dẫn điền mẫu CSV' });
      if ((await guide.locator('details').getAttribute('open')) === null) {
        await guide.getByText('Giải thích từng cột và ví dụ cần điền', { exact: true }).click();
      }
      await file.setInputFiles(path.join(dist, 'templates/bai-hoc-mau.json'));
      await preview.waitFor();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        'HORIZONTAL_OVERFLOW',
      );
      await page.screenshot({ path: path.join(out, 'import-' + width + '.png'), fullPage: true });
      await guide.screenshot({ path: path.join(out, 'guide-' + width + '.png') });
      await page.getByRole('button', { name: 'Hủy nhập', exact: true }).click();
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unknown, []);
  });
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify({ status: 'PASS', api: 'SYNTHETIC_FIXTURES_ONLY', dist, results }, null, 2),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });
