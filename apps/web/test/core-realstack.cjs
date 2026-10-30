/* CORE-01 real browser acceptance. Synthetic identities only. Does not use project .env to select its database target.
 * Fresh PostgreSQL cluster under .core-demo/<timestamp>; no existing DB is reused.
 * All curriculum, enrollment, assignment and study actions run through the web UI.
 * Run with an existing Playwright on NODE_PATH; requires PostgreSQL 17 and Chrome.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../../..');
const owned = path.join(root, '.core-demo', String(Date.now()));
const output = process.env.CORE01_EVIDENCE_DIR || path.join(root, 'artifacts/core-01');
if (!path.isAbsolute(output) || path.relative(root, output).startsWith('..'))
  throw Error('EVIDENCE_MUST_STAY_IN_WORKSPACE');
const bin = 'C:/Program Files/PostgreSQL/17/bin';
const password = crypto.randomBytes(24).toString('hex');
const accountPassword =
  process.env.CORE01_KEEP_RUNNING === 'YES'
    ? process.env.CORE01_DEMO_PASSWORD
    : crypto.randomBytes(24).toString('hex');
const role = 'clp_core_test';
const dbPort = 55441,
  apiPort = 3113,
  webPort = 5198;
const origin = `http://127.0.0.1:${webPort}`;
const url = `postgresql://${role}:${password}@127.0.0.1:${dbPort}/${role}?schema=public`;
const results = [];
let started = false,
  prisma,
  app,
  vite,
  browser,
  stage = 'preflight';
function run(file, args, options = {}) {
  const value = cp.spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (value.status !== 0) throw Error(`Command failed: ${path.basename(file)} (${value.status})`);
  return value.stdout;
}
async function step(name, fn) {
  stage = name;
  await fn();
  results.push({ name, status: 'PASS' });
  console.log(`CORE-01 PASS: ${name}`);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function free(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function main() {
  assert.equal(process.env.CORE01_DISPOSABLE, 'YES');
  assert.ok(
    typeof accountPassword === 'string' && accountPassword.length >= 12,
    'Use a temporary CORE01_DEMO_PASSWORD of at least 12 characters for manual demo',
  );
  for (const port of [dbPort, apiPort, webPort]) await free(port);
  assert.ok(!fs.existsSync(owned));
  fs.mkdirSync(owned, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  const pwfile = path.join(owned, 'init-password.tmp');
  const data = path.join(owned, 'data');
  fs.writeFileSync(pwfile, password + '\n', { flag: 'wx' });
  try {
    run(path.join(bin, 'initdb.exe'), [
      '-D',
      data,
      '-U',
      role,
      '-A',
      'scram-sha-256',
      '--pwfile=' + pwfile,
      '--encoding=UTF8',
      '--locale=C',
    ]);
  } finally {
    fs.unlinkSync(pwfile);
  }
  run(
    path.join(bin, 'pg_ctl.exe'),
    [
      '-D',
      data,
      '-l',
      path.join(owned, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${dbPort}`,
      '-w',
      'start',
    ],
    { stdio: 'ignore' },
  );
  started = true;
  const dbEnv = { ...process.env, PGPASSWORD: password };
  run(path.join(bin, 'createdb.exe'), ['-h', '127.0.0.1', '-p', String(dbPort), '-U', role, role], {
    env: dbEnv,
  });
  await step('fresh isolated PostgreSQL and existing migrations', async () => {
    for (const folder of fs.readdirSync(path.join(root, 'prisma/migrations')).sort()) {
      const file = path.join(root, 'prisma/migrations', folder, 'migration.sql');
      if (fs.existsSync(file) && !folder.includes('enroll01'))
        run(
          path.join(bin, 'psql.exe'),
          [
            '-h',
            '127.0.0.1',
            '-p',
            String(dbPort),
            '-U',
            role,
            '-d',
            role,
            '-v',
            'ON_ERROR_STOP=1',
            '-f',
            file,
          ],
          { env: dbEnv },
        );
    }
  });
  prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const { ScryptPasswordHasher } = require(
    path.join(root, 'apps/api/dist/src/modules/identity/infrastructure/scrypt-password-hasher.js'),
  );
  const hash = await new ScryptPasswordHasher().hash(accountPassword);
  for (const [login, roleName] of [
    ['teacher.core', 'TEACHER'],
    ['student.core', 'STUDENT'],
    ['stranger.core', 'TEACHER'],
    ['admin.core', 'ADMIN'],
    ['student.concurrent', 'STUDENT'],
  ])
    await prisma.user.create({
      data: {
        login: `${login}@example.invalid`,
        loginNormalized: `${login}@example.invalid`,
        state: 'ACTIVE',
        roles: { create: { role: roleName } },
        credential: {
          create: { algorithm: hash.algorithm, parameters: hash.parameters, hash: hash.hash },
        },
      },
    });
  await step(
    'ENROLL-01 upgrades ten migrations with existing accounts without changing identity rows',
    async () => {
      const before = await prisma.user.findMany({
        orderBy: { publicId: 'asc' },
        include: { roles: true, credential: true },
      });
      run(
        path.join(bin, 'psql.exe'),
        [
          '-h',
          '127.0.0.1',
          '-p',
          String(dbPort),
          '-U',
          role,
          '-d',
          role,
          '-v',
          'ON_ERROR_STOP=1',
          '-f',
          path.join(
            root,
            'prisma/migrations/20261030073000_enroll01_course_admissions/migration.sql',
          ),
        ],
        { env: dbEnv },
      );
      assert.deepEqual(
        await prisma.user.findMany({
          orderBy: { publicId: 'asc' },
          include: { roles: true, credential: true },
        }),
        before,
      );
      assert.equal(await prisma.courseApplication.count(), 0);
    },
  );
  Object.assign(process.env, {
    DATABASE_URL: url,
    NODE_ENV: 'test',
    API_PORT: String(apiPort),
    SPA_ORIGIN: origin,
    POSTGRES_HOST: '127.0.0.1',
    POSTGRES_PORT: String(dbPort),
    POSTGRES_DB: role,
    POSTGRES_USER: role,
    POSTGRES_PASSWORD: password,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    CSRF_SECRET: crypto.randomBytes(32).toString('hex'),
    SESSION_TTL_MINUTES: '60',
    LC03B_PREVIEW_ENABLED: 'false',
    TZ: 'UTC',
    LANG: 'C.UTF-8',
  });
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(root, 'apps/api/dist/src/app.module.js'));
  app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({
    origin: [origin],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
  });
  await app.listen(apiPort, '127.0.0.1');
  vite = cp.spawn(
    process.execPath,
    [
      path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    {
      cwd: path.join(root, 'apps/web'),
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
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
    await pause(100);
  }
  assert.ok(ready, 'Vite started');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const tc = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  const sc = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const teacher = await tc.newPage(),
    student = await sc.newPage();
  async function login(page, name) {
    await page.goto(origin);
    await page
      .getByRole('heading', { name: /^(Đăng nhập|Không gian học viên|Không gian giảng dạy)$/ })
      .first()
      .waitFor();
    if (!(await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).isVisible())) {
      const me = (await admissionCall(page, '/auth/me')).body.user;
      assert.equal(me.login, `${name}@example.invalid`);
      return;
    }
    await page.getByLabel('Tên đăng nhập', { exact: true }).fill(`${name}@example.invalid`);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(accountPassword);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page
      .getByRole('heading', {
        name: name.startsWith('student') ? 'Không gian học viên' : 'Không gian giảng dạy',
        exact: true,
      })
      .waitFor();
  }
  async function admissionCall(page, route, method = 'GET', data, proof = true) {
    return page.evaluate(
      async ({ endpoint, method, data, proof }) => {
        const headers = { 'Content-Type': 'application/json' };
        if (proof) {
          const csrf = document.cookie
            .split(';')
            .map((p) => p.trim())
            .find((p) => p.startsWith('clp_csrf='));
          if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice(9));
        }
        const res = await fetch(endpoint, {
          method,
          headers,
          credentials: 'include',
          body: data === undefined ? undefined : JSON.stringify(data),
        });
        return { status: res.status, body: await res.json() };
      },
      { endpoint: `http://127.0.0.1:${apiPort}${route}`, method, data, proof },
    );
  }
  async function visible(page, text) {
    await page.getByText(text, { exact: true }).first().waitFor();
  }
  async function noOverflow(page) {
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'no horizontal overflow',
    );
  }
  await step(
    'teacher creates course, unit, lesson, Chinese/Pinyin/Vietnamese through GUI',
    async () => {
      await login(teacher, 'teacher.core');
      await teacher.getByRole('button', { name: 'Giao bài', exact: true }).click();
      await teacher.getByRole('button', { name: 'Soạn và xuất bản bài học', exact: true }).click();
      await teacher.getByLabel('Tên khóa học', { exact: true }).fill('Tiếng Trung giao tiếp');
      let releaseCreate;
      let reachedCreate;
      const createHeld = new Promise((resolve) => {
        releaseCreate = resolve;
      });
      const createReached = new Promise((resolve) => {
        reachedCreate = resolve;
      });
      await teacher.route('**/content/courses', async (route) => {
        if (route.request().method() === 'POST') {
          reachedCreate();
          await createHeld;
        }
        await route.continue();
      });
      await teacher.getByRole('button', { name: 'Tạo khóa học', exact: true }).click();
      await createReached;
      assert.equal(
        await teacher.getByRole('button', { name: 'Giao bài', exact: true }).isDisabled(),
        true,
        'workspace navigation disabled while hierarchy write is pending',
      );
      releaseCreate();

      await teacher.getByLabel('Tên chương', { exact: true }).fill('Chương 1 · Làm quen');
      await teacher.getByRole('button', { name: 'Tạo chương', exact: true }).click();
      await teacher.getByLabel('Tên bài học', { exact: true }).fill('Bài 1 · Chào hỏi');
      await teacher.getByRole('button', { name: 'Tạo bài học', exact: true }).click();
      await teacher
        .getByLabel('Nội dung / giải thích bài học')
        .fill('Chào hỏi và giới thiệu bản thân. Đọc chữ Hán, luyện Pinyin và trả lời câu hỏi.');
      await teacher.getByRole('button', { name: '+ Từ vựng', exact: true }).click();
      await teacher.getByLabel('Chữ Hán / cấu trúc / câu ví dụ', { exact: true }).fill('你好');
      await teacher.getByLabel('Pinyin', { exact: true }).fill('nǐ hǎo');
      await teacher.getByLabel('Nghĩa / giải thích tiếng Việt', { exact: true }).fill('Xin chào');
      await teacher.getByRole('button', { name: 'Công cụ học tập', exact: true }).click();
      await teacher.getByRole('heading', { name: 'Công cụ học tập', exact: true }).waitFor();
      await teacher.getByRole('button', { name: '← Quay lại học tập', exact: true }).click();
      assert.equal(await teacher.getByLabel('Pinyin', { exact: true }).inputValue(), 'nǐ hǎo');
      await teacher
        .getByLabel('Ví dụ sử dụng', { exact: true })
        .fill('你好！我叫安。Nǐ hǎo! Wǒ jiào Ān. Xin chào! Tôi tên An.');
      await teacher.getByRole('button', { name: '+ Từ vựng', exact: true }).click();
      await teacher
        .getByLabel('Chữ Hán / cấu trúc / câu ví dụ', { exact: true })
        .nth(1)
        .fill('谢谢');
      await teacher.getByLabel('Pinyin', { exact: true }).nth(1).fill('xièxie');
      await teacher
        .getByLabel('Nghĩa / giải thích tiếng Việt', { exact: true })
        .nth(1)
        .fill('Cảm ơn');
      await teacher.getByRole('button', { name: '+ Ngữ pháp', exact: true }).click();
      await teacher.getByRole('button', { name: 'Xóa mục', exact: true }).nth(2).click();
      await teacher.getByRole('button', { name: 'Chuyển mục 2 lên', exact: true }).click();
      await teacher.getByRole('button', { name: 'Chuyển mục 1 xuống', exact: true }).click();
    },
  );
  await step(
    'draft save, persisted reload, preview, publish and desktop/mobile teacher screenshots',
    async () => {
      await teacher.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
      await visible(teacher, 'Đã lưu bản nháp trên hệ thống.');
      await teacher.reload();
      await teacher.getByRole('button', { name: 'Khóa học & bài học' }).click();
      await teacher
        .locator('article')
        .filter({
          has: teacher.getByRole('heading', { name: 'Tiếng Trung giao tiếp', exact: true }),
        })
        .getByRole('button', { name: 'Chọn khóa học →', exact: true })
        .click();
      await teacher
        .locator('article')
        .filter({ has: teacher.getByRole('heading', { name: 'Chương 1 · Làm quen', exact: true }) })
        .getByRole('button', { name: 'Mở chương →', exact: true })
        .click();
      await teacher
        .locator('article')
        .filter({ has: teacher.getByRole('heading', { name: 'Bài 1 · Chào hỏi', exact: true }) })
        .getByRole('button', { name: 'Soạn bài học →', exact: true })
        .click();
      assert.equal(
        await teacher.getByLabel('Pinyin', { exact: true }).first().inputValue(),
        'nǐ hǎo',
      );
      await teacher.screenshot({
        path: path.join(output, 'teacher-builder-desktop.png'),
        fullPage: true,
      });
      await teacher.getByRole('button', { name: 'Xem trước như học viên', exact: true }).click();
      await visible(teacher, '你好');
      await teacher.screenshot({ path: path.join(output, 'teacher-desktop.png'), fullPage: true });
      await teacher.setViewportSize({ width: 390, height: 844 });
      await noOverflow(teacher);
      await teacher.screenshot({ path: path.join(output, 'teacher-mobile.png'), fullPage: true });
      await teacher.setViewportSize({ width: 1440, height: 1000 });
      await teacher.getByRole('button', { name: 'Xuất bản bài học', exact: true }).click();
      await visible(teacher, 'Đã xuất bản. Bạn có thể giao bài học trong lớp.');
      await teacher.getByRole('button', { name: 'Chọn lớp để giao bài →', exact: true }).click();
      await teacher.getByRole('heading', { name: 'Giao bài', exact: true }).waitFor();
    },
  );
  await step(
    'teacher creates class, uses CL-01 enrollment and assigns lesson to class',
    async () => {
      await teacher.getByRole('button', { name: 'Tổng quan' }).click();
      await teacher.getByRole('button', { name: '+ Tạo lớp', exact: true }).click();
      await teacher.getByLabel('Tên lớp', { exact: true }).fill('Lớp giao tiếp A1');
      await teacher.getByRole('button', { name: 'Tạo lớp', exact: true }).click();
      await teacher.getByRole('button', { name: 'Giao bài', exact: true }).click();
      await teacher.getByRole('button', { name: /Lớp giao tiếp A1/ }).click();
      await teacher.getByRole('button', { name: 'Chỉnh sửa lớp học', exact: true }).click();
      await teacher.getByLabel('Học kỳ (không bắt buộc)', { exact: true }).fill('Học kỳ 2026');
      await teacher.getByRole('button', { name: 'Lưu lớp học', exact: true }).click();
      await teacher
        .getByText('Đã lưu lớp học. Về tổng quan để tải thông tin mới.', { exact: true })
        .waitFor();
      await teacher
        .getByLabel('Thêm tài khoản học viên có sẵn')
        .fill('student.core@example.invalid');
      await teacher.getByRole('button', { name: 'Thêm học viên', exact: true }).click();
      await visible(teacher, 'student.core@example.invalid');
      await teacher
        .getByLabel('Khóa học', { exact: true })
        .selectOption({ label: 'Tiếng Trung giao tiếp' });
      await teacher
        .getByLabel('Chương', { exact: true })
        .selectOption({ label: 'Chương 1 · Làm quen' });
      await teacher
        .getByLabel('Bài học đã xuất bản', { exact: true })
        .selectOption({ label: 'Bài 1 · Chào hỏi' });
      await teacher.getByLabel(/Hạn nộp/).fill('2026-12-20T20:30');
      await teacher.getByRole('button', { name: 'Giao bài học', exact: true }).click();
      await visible(
        teacher,
        'Đã giao bài hoặc bài đã có cho toàn bộ học viên đang hiển thị. Mở hồ sơ để xem chi tiết.',
      );
    },
  );
  await step(
    'ENROLL-01 legacy student is blocked until own teacher approves course and selects class',
    async () => {
      await login(student, 'student.core');
      const lesson = await prisma.lesson.findFirstOrThrow();
      assert.equal(
        (await admissionCall(student, `/content/lessons/${lesson.publicId}`)).status,
        404,
      );
      assert.equal(
        (await admissionCall(student, '/student/exercises/next', 'POST', {})).status,
        404,
      );
      await student.getByRole('button', { name: 'Đăng ký khóa học', exact: true }).click();
      await student.getByRole('button', { name: 'Xin tham gia khóa học', exact: true }).click();
      await student.getByText('Chờ duyệt', { exact: true }).first().waitFor();
      const catalog = (await admissionCall(student, '/admissions/courses')).body;
      const request = catalog.applications.find((a) => a.status === 'PENDING');
      assert.equal(
        (
          await admissionCall(student, '/admissions/applications', 'POST', {
            courseId: request.course.publicId,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await admissionCall(
            student,
            '/admissions/applications/' + request.publicId + '/cancel',
            'POST',
            {},
            false,
          )
        ).status,
        403,
      );
      const other = await browser.newContext({ locale: 'en-US' });
      const stranger = await other.newPage();
      await login(stranger, 'stranger.core');
      assert.equal(
        (await admissionCall(stranger, '/admissions/review')).body.applications.length,
        0,
      );
      assert.equal(
        (
          await admissionCall(
            stranger,
            '/admissions/applications/' + request.publicId + '/decision',
            'POST',
            { decision: 'REJECTED' },
          )
        ).status,
        404,
      );
      await other.close();
      const outsider = await prisma.user.findUniqueOrThrow({
        where: { loginNormalized: 'stranger.core@example.invalid' },
      });
      const foreignClass = await prisma.teachingClass.create({
        data: { ownerId: outsider.id, title: 'Lớp ngoài phạm vi' },
      });
      assert.equal(
        (
          await admissionCall(
            teacher,
            '/admissions/applications/' + request.publicId + '/decision',
            'POST',
            { decision: 'APPROVED', classId: foreignClass.publicId },
          )
        ).status,
        404,
      );
      assert.equal(
        (await prisma.courseApplication.findUnique({ where: { publicId: request.publicId } }))
          .status,
        'PENDING',
      );
      await teacher.getByRole('button', { name: 'Duyệt đăng ký', exact: true }).click();
      await teacher
        .getByLabel('Xếp vào lớp', { exact: true })
        .selectOption({ label: 'Lớp giao tiếp A1' });
      await teacher.getByRole('button', { name: 'Duyệt và xếp lớp', exact: true }).click();
      await teacher.getByText('Đã duyệt và xếp lớp cho học sinh.', { exact: true }).waitFor();
      assert.equal(
        (await admissionCall(student, `/content/lessons/${lesson.publicId}`)).status,
        200,
      );
      assert.equal(
        (
          await admissionCall(
            teacher,
            '/admissions/applications/' + request.publicId + '/decision',
            'POST',
            { decision: 'REJECTED' },
          )
        ).status,
        409,
      );
      assert.equal(
        await prisma.classEnrollment.count(),
        1,
        'existing class membership is not duplicated',
      );
    },
  );
  await step(
    'ENROLL-01 actual GUI self signup, immediate login, rejection, reapply and approval',
    async () => {
      const nc = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 390, height: 844 },
      });
      const newcomer = await nc.newPage();
      await newcomer.goto(origin);
      await newcomer
        .getByRole('button', { name: 'Chưa có tài khoản? Đăng ký học sinh', exact: true })
        .click();
      await newcomer
        .getByLabel('Tên đăng nhập', { exact: true })
        .fill('signup.core@example.invalid');
      await newcomer.getByLabel('Mật khẩu', { exact: true }).fill(accountPassword);
      await newcomer.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(accountPassword);
      await newcomer.getByRole('button', { name: 'Tạo tài khoản học sinh', exact: true }).click();
      await newcomer.getByRole('heading', { name: 'Không gian học viên', exact: true }).waitFor();
      const me = (await admissionCall(newcomer, '/auth/me')).body.user;
      assert.deepEqual(me.roles, ['STUDENT']);
      await newcomer.getByRole('button', { name: 'Xin tham gia khóa học', exact: true }).click();
      await newcomer.getByText('Chờ duyệt', { exact: true }).first().waitFor();
      let req = (await admissionCall(newcomer, '/admissions/courses')).body.applications[0];
      assert.equal(
        (
          await admissionCall(
            student,
            '/admissions/applications/' + req.publicId + '/cancel',
            'POST',
            {},
          )
        ).status,
        409,
      );
      await teacher.getByRole('button', { name: 'Tải lại danh sách', exact: true }).click();
      await teacher
        .getByLabel('Ghi chú / lý do (không bắt buộc)', { exact: true })
        .fill('Chọn lại đợt học phù hợp.');
      await teacher.getByRole('button', { name: 'Từ chối', exact: true }).click();
      await teacher.getByText('Đã từ chối yêu cầu.', { exact: true }).waitFor();
      await newcomer.reload();
      await newcomer.getByRole('button', { name: 'Gửi lại yêu cầu', exact: true }).click();
      await newcomer.getByText('Chờ duyệt', { exact: true }).first().waitFor();
      await newcomer.getByRole('button', { name: 'Hủy yêu cầu', exact: true }).click();
      await newcomer.getByText('Đã hủy', { exact: true }).first().waitFor();
      assert.equal(
        await newcomer.getByText('Từ chối', { exact: true }).count(),
        0,
        'old rejection is not current status',
      );
      await newcomer.getByRole('button', { name: 'Gửi lại yêu cầu', exact: true }).click();
      await newcomer.getByText('Chờ duyệt', { exact: true }).first().waitFor();
      req = (await admissionCall(newcomer, '/admissions/courses')).body.applications.find(
        (a) => a.status === 'PENDING',
      );
      const klass = await prisma.teachingClass.findFirstOrThrow();
      assert.equal(
        (
          await admissionCall(
            newcomer,
            '/admissions/applications/' + req.publicId + '/decision',
            'POST',
            { decision: 'APPROVED', classId: klass.publicId },
          )
        ).status,
        403,
      );
      await teacher.getByRole('button', { name: 'Tải lại danh sách', exact: true }).click();
      await teacher
        .getByLabel('Xếp vào lớp', { exact: true })
        .selectOption({ label: 'Lớp giao tiếp A1' });
      await teacher.getByRole('button', { name: 'Duyệt và xếp lớp', exact: true }).click();
      await teacher.getByText('Đã duyệt và xếp lớp cho học sinh.', { exact: true }).waitFor();
      await newcomer.reload();
      await newcomer.getByText('Đã duyệt', { exact: true }).first().waitFor();
      assert.equal(
        await prisma.courseApplication.count({ where: { student: { publicId: me.publicId } } }),
        3,
        'rejected and cancelled history retained',
      );
      await newcomer.screenshot({
        path: path.join(output, 'admissions-student-mobile.png'),
        fullPage: true,
      });
      await teacher.screenshot({
        path: path.join(output, 'admissions-teacher-desktop.png'),
        fullPage: true,
      });
      await nc.close();
    },
  );
  await step(
    'ENROLL-01 real DB concurrent applications/decisions, Admin scope and signup HTTP controls',
    async () => {
      const cc = await browser.newContext({ locale: 'en-US' }),
        ac = await browser.newContext({ locale: 'en-US' });
      const concurrent = await cc.newPage(),
        admin = await ac.newPage();
      await login(concurrent, 'student.concurrent');
      await login(admin, 'admin.core');
      const course = await prisma.course.findFirstOrThrow(),
        klass = await prisma.teachingClass.findFirstOrThrow({
          where: { title: 'Lớp giao tiếp A1' },
        });
      const applies = await Promise.all([
        admissionCall(concurrent, '/admissions/applications', 'POST', {
          courseId: course.publicId,
        }),
        admissionCall(concurrent, '/admissions/applications', 'POST', {
          courseId: course.publicId,
        }),
      ]);
      assert.deepEqual(applies.map((r) => r.status).sort(), [201, 409]);
      const pending = applies.find((r) => r.status === 201).body;
      const decisions = await Promise.all([
        admissionCall(
          teacher,
          '/admissions/applications/' + pending.publicId + '/decision',
          'POST',
          { decision: 'APPROVED', classId: klass.publicId },
        ),
        admissionCall(admin, '/admissions/applications/' + pending.publicId + '/decision', 'POST', {
          decision: 'REJECTED',
        }),
      ]);
      assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
      const decided = await prisma.courseApplication.findUniqueOrThrow({
        where: { publicId: pending.publicId },
      });
      assert.equal(
        await prisma.classEnrollment.count({
          where: { studentId: decided.studentId, classId: klass.id },
        }),
        decided.status === 'APPROVED' ? 1 : 0,
        'no membership from losing reviewer',
      );
      const outsider = await prisma.user.findUniqueOrThrow({
        where: { loginNormalized: 'stranger.core@example.invalid' },
      });
      const foreignCourse = await prisma.course.create({
        data: {
          authorId: outsider.id,
          slug: 'admin-cross-owner',
          title: 'Khóa kiểm thử Admin',
          visibility: 'PUBLISHED',
          position: 5,
        },
      });
      const foreignClass = await prisma.teachingClass.findFirstOrThrow({
        where: { ownerId: outsider.id },
      });
      const req = (
        await admissionCall(concurrent, '/admissions/applications', 'POST', {
          courseId: foreignCourse.publicId,
        })
      ).body;
      assert.equal(
        (
          await admissionCall(
            teacher,
            '/admissions/applications/' + req.publicId + '/decision',
            'POST',
            { decision: 'APPROVED', classId: foreignClass.publicId },
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await admissionCall(
            admin,
            '/admissions/applications/' + req.publicId + '/decision',
            'POST',
            { decision: 'APPROVED', classId: foreignClass.publicId },
          )
        ).status,
        200,
      );
      const before = await prisma.user.count();
      const denied = await cc.request.post(`http://127.0.0.1:${apiPort}/auth/register`, {
        headers: { Origin: 'https://untrusted.example.invalid' },
        data: {
          login: 'forbidden@example.invalid',
          password: accountPassword,
          confirmPassword: accountPassword,
          roles: ['ADMIN'],
        },
      });
      assert.equal(denied.status(), 403);
      assert.equal(await prisma.user.count(), before);
      assert.equal(
        (
          await admissionCall(concurrent, '/auth/register', 'POST', {
            login: 'invalid',
            password: 'short',
            confirmPassword: 'short',
          })
        ).status,
        422,
      );
      assert.equal(
        (
          await admissionCall(concurrent, '/auth/register', 'POST', {
            login: 'signup.core@example.invalid',
            password: accountPassword,
            confirmPassword: accountPassword,
          })
        ).status,
        409,
      );
      await cc.close();
      await ac.close();
    },
  );
  await step(
    'student sees assignment, reads lesson, reload resumes, responsive screenshots',
    async () => {
      await login(student, 'student.core');
      await student.getByRole('button', { name: 'Bài được giao', exact: true }).click();
      await visible(student, 'Bài 1 · Chào hỏi');
      await student.getByRole('button', { name: 'Mở bài học', exact: true }).click();
      await visible(student, '你好');
      await student.evaluate(() => window.scrollTo(0, 600));
      await pause(250);
      await student.reload();
      await visible(student, '你好');
      await student.waitForFunction(() => window.scrollY > 400);
      await noOverflow(student);
      await student.screenshot({ path: path.join(output, 'student-mobile.png'), fullPage: true });
      await student.setViewportSize({ width: 768, height: 1024 });
      await noOverflow(student);
      await student.screenshot({ path: path.join(output, 'student-tablet.png'), fullPage: true });
      await student.setViewportSize({ width: 1440, height: 1000 });
      await student.screenshot({ path: path.join(output, 'student-desktop.png'), fullPage: true });
      await student.setViewportSize({ width: 390, height: 844 });
    },
  );
  await step(
    'student submits exercise and receives persisted result; completion derives from evidence',
    async () => {
      await student.getByRole('button', { name: 'Luyện tập bài này →', exact: true }).click();
      const submitted = [];
      for (let i = 0; i < 6; i++) {
        const prompt = await student.locator('.clp-prompt').innerText();
        submitted.push(prompt);
        await student
          .getByLabel('Câu trả lời của bạn', { exact: true })
          .fill(prompt === 'Xin chào' ? '你好' : '谢谢');
        if (i === 0) {
          await student.getByRole('button', { name: 'Công cụ học tập', exact: true }).click();
          await student.getByRole('heading', { name: 'Công cụ học tập', exact: true }).waitFor();
          await student.getByRole('button', { name: '← Quay lại học tập', exact: true }).click();
          assert.equal(
            await student.getByLabel('Câu trả lời của bạn', { exact: true }).inputValue(),
            prompt === 'Xin chào' ? '你好' : '谢谢',
          );
        }
        await student.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
        await student.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
        const assignments = await student.evaluate(async (api) => {
          const r = await fetch(api + '/student/assignments', { credentials: 'include' });
          return r.json();
        }, `http://127.0.0.1:${apiPort}`);
        assert.equal(assignments.assignments[0].completion.total, 2);
        assert.equal(assignments.assignments[0].completion.correct, new Set(submitted).size);
        assert.equal(
          assignments.assignments[0].completion.completed,
          new Set(submitted).size === 2,
        );
        assert.equal(assignments.assignments[0].dueAt, '2026-12-20T13:30:00.000Z');
        if (assignments.assignments[0].completion.completed) break;
        await student.getByRole('button', { name: 'Bài tập tiếp theo', exact: true }).click();
      }
      assert.equal(new Set(submitted).size, 2);
      await student.reload();
      await visible(student, '你好');
      await student.getByRole('button', { name: '← Bài được giao', exact: true }).click();
      await student.getByRole('button', { name: 'Tiến độ', exact: true }).click();
      await student.getByRole('button', { name: 'Xem kết quả', exact: true }).first().click();
      await student.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
      assert.equal(await prisma.answerSubmission.count(), submitted.length);
      assert.equal(
        await prisma.learningEvent.count({ where: { type: 'ANSWER_SUBMITTED' } }),
        submitted.length,
      );
    },
  );
  await step('teacher sees student completion and correct answer evidence', async () => {
    await teacher.getByRole('button', { name: 'Giao bài', exact: true }).click();
    await teacher.getByRole('button', { name: /Lớp giao tiếp A1/ }).click();
    await teacher.getByRole('button', { name: /Xem tiến độ của student\.core@/ }).click();
    await teacher
      .getByText(/Đã hoàn thành/)
      .first()
      .waitFor();
    await teacher.screenshot({ path: path.join(output, 'teacher-results.png'), fullPage: true });
  });
  await step('independent authoring clears earlier class return context', async () => {
    await teacher.getByRole('button', { name: 'Soạn và xuất bản bài học', exact: true }).click();
    await teacher.getByRole('button', { name: 'Tổng quan', exact: true }).click();
    await teacher.getByRole('button', { name: '+ Soạn bài học', exact: true }).click();
    await teacher
      .locator('article')
      .filter({ has: teacher.getByRole('heading', { name: 'Tiếng Trung giao tiếp', exact: true }) })
      .getByRole('button', { name: 'Chọn khóa học →', exact: true })
      .click();
    await teacher
      .locator('article')
      .filter({ has: teacher.getByRole('heading', { name: 'Chương 1 · Làm quen', exact: true }) })
      .getByRole('button', { name: 'Mở chương →', exact: true })
      .click();
    await teacher
      .locator('article')
      .filter({ has: teacher.getByRole('heading', { name: 'Bài 1 · Chào hỏi', exact: true }) })
      .getByRole('button', { name: 'Soạn bài học →', exact: true })
      .click();
    await teacher
      .getByLabel('Tiêu đề bài học', { exact: true })
      .fill('Thay đổi chưa lưu kiểm tra điều hướng');
    teacher.once('dialog', (dialog) => dialog.accept());
    await teacher.getByRole('button', { name: 'Khóa học & bài học', exact: true }).click();
    await teacher.getByRole('heading', { name: 'Khóa học & bài học', exact: true }).waitFor();
    assert.equal(
      await teacher.getByLabel('Tiêu đề bài học', { exact: true }).count(),
      0,
      'confirmed same-page navigation resets discarded editor',
    );
    await teacher
      .locator('article')
      .filter({ has: teacher.getByRole('heading', { name: 'Tiếng Trung giao tiếp', exact: true }) })
      .getByRole('button', { name: 'Chọn khóa học →', exact: true })
      .click();
    await teacher
      .locator('article')
      .filter({ has: teacher.getByRole('heading', { name: 'Chương 1 · Làm quen', exact: true }) })
      .getByRole('button', { name: 'Mở chương →', exact: true })
      .click();
    await teacher
      .locator('article')
      .filter({ has: teacher.getByRole('heading', { name: 'Bài 1 · Chào hỏi', exact: true }) })
      .getByRole('button', { name: 'Soạn bài học →', exact: true })
      .click();
    assert.equal(
      await teacher.getByLabel('Tiêu đề bài học', { exact: true }).inputValue(),
      'Bài 1 · Chào hỏi',
    );
    await teacher.getByRole('button', { name: 'Chọn lớp để giao bài →', exact: true }).click();
    await teacher.getByRole('heading', { name: 'Giao bài', exact: true }).waitFor();
  });
  await step(
    'new save API denies missing CSRF, student writes, cross-owner writes and stale revision',
    async () => {
      const lesson = await prisma.lesson.findFirstOrThrow();
      async function call(page, endpoint, method = 'GET', data, proof = true) {
        return page.evaluate(
          async ({ endpoint, method, data, proof }) => {
            const headers = { 'Content-Type': 'application/json' };
            if (proof) {
              const csrf = document.cookie
                .split(';')
                .map((part) => part.trim())
                .find((part) => part.startsWith('clp_csrf='));
              if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice(9));
            }
            const response = await fetch(endpoint, {
              method,
              credentials: 'include',
              headers,
              body: data === undefined ? undefined : JSON.stringify(data),
            });
            return { status: response.status, body: await response.json() };
          },
          { endpoint, method, data, proof },
        );
      }
      const base = `http://127.0.0.1:${apiPort}/content/lessons/${lesson.publicId}`;
      const read = await call(teacher, base);
      assert.equal(read.status, 200, 'teacher read');
      assert.equal(
        (await call(teacher, `http://127.0.0.1:${apiPort}/content/lessons/invalid-id`)).status,
        400,
        'invalid public UUID',
      );
      const document = read.body;
      const payload = { ...document.lesson, revision: document.revision, items: document.items };
      assert.equal(
        (await call(teacher, base + '/save', 'POST', payload, false)).status,
        403,
        'missing CSRF',
      );
      assert.equal(
        (
          await call(teacher, base + '/save', 'POST', {
            ...payload,
            title: 'Bài 1 · Chào hỏi đã cập nhật',
          })
        ).status,
        200,
        'teacher save',
      );
      assert.equal(
        (await call(teacher, base + '/save', 'POST', payload)).status,
        409,
        'stale revision',
      );
      assert.equal(
        (await call(student, base + '/save', 'POST', payload)).status,
        403,
        'student denied',
      );
      const other = await browser.newContext({ locale: 'en-US' });
      const page = await other.newPage();
      await login(page, 'stranger.core');
      assert.equal(
        (await call(page, base + '/save', 'POST', payload)).status,
        403,
        'other teacher denied',
      );
      await other.close();
    },
  );
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ status: 'PASS', results }, null, 2),
  );
  if (process.env.CORE01_KEEP_RUNNING === 'YES') {
    console.log(
      `Demo cục bộ: ${origin}. Tài khoản: teacher.core@example.invalid / student.core@example.invalid. Dùng mật khẩu demo bạn vừa đặt. Nhấn Ctrl+C để dừng.`,
    );
    await new Promise((resolve) => process.once('SIGINT', resolve));
  }
}
main()
  .catch((error) => {
    console.error(`CORE-01 FAIL at ${stage}: ${error.message}`);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, 'results.json'),
      JSON.stringify({ status: 'FAIL', stage, message: error.message, results }, null, 2),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (started)
      run(
        path.join(bin, 'pg_ctl.exe'),
        ['-D', path.join(owned, 'data'), '-m', 'fast', '-w', 'stop'],
        { stdio: 'ignore' },
      );
  });
