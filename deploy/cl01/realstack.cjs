'use strict';
// CL-01 Windows acceptance only: creates a NEW approved cluster, never resumes/reset existing data.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const runId = process.env.CL01_RUN_ID || '01';
if (!/^[0-9]{2}$/.test(runId)) throw Error('INVALID_RUN_ID');
const owned = path.join(
  'C:/Users/admin/Documents/XueXiHanyu-Recovery/cl01-postgres17',
  'run-' + runId,
);
const bin = 'C:/Program Files/PostgreSQL/17/bin';
const results = [];
const password = crypto.randomBytes(24).toString('hex');
const accountPassword = crypto.randomBytes(24).toString('hex');
const url = `postgresql://clp_cl01_test:${password}@127.0.0.1:55440/clp_cl01_test?schema=public&connection_limit=8`;
let started = false,
  prisma,
  app,
  vite,
  browser,
  stage = 'preflight';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(file, args, options = {}) {
  const result = cp.spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) throw Error('CL01_COMMAND_FAILED');
  return result.stdout;
}
async function free(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function step(name, operation) {
  stage = name;
  await operation();
  results.push({ name, status: 'PASS' });
  console.log('CL01 PASS: ' + name);
}
async function main() {
  assert.equal(process.env.CL01_DISPOSABLE_APPROVAL, 'APPROVED_55440_3112_5199');
  assert.equal(process.platform, 'win32');
  assert.ok(!fs.existsSync(owned), 'NEW_CLUSTER_REQUIRED');
  assert.ok(!fs.existsSync(path.join(root, '.env')), 'ENV_FILE_FREE_WORKTREE_REQUIRED');
  for (const port of [55440, 3112, 5199]) await free(port);
  assert.match(run(path.join(bin, 'postgres.exe'), ['--version']), /17\.11/);
  fs.mkdirSync(owned, { recursive: true });
  const sid = run('powershell.exe', [
    '-NoProfile',
    '-Command',
    '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  ]).trim();
  run('icacls.exe', [owned, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]);
  const data = path.join(owned, 'data'),
    pwfile = path.join(owned, 'init-password.tmp');
  fs.writeFileSync(pwfile, password + '\n', { flag: 'wx', mode: 0o600 });
  try {
    run(path.join(bin, 'initdb.exe'), [
      '-D',
      data,
      '-U',
      'clp_cl01_test',
      '--encoding=UTF8',
      '--locale=C',
      '--auth-host=scram-sha-256',
      '--auth-local=scram-sha-256',
      '--pwfile=' + pwfile,
    ]);
  } finally {
    fs.unlinkSync(pwfile);
  } // only this newly generated transient file
  run(
    path.join(bin, 'pg_ctl.exe'),
    [
      '-D',
      data,
      '-l',
      path.join(owned, 'postgres.log'),
      '-o',
      '-h 127.0.0.1 -p 55440',
      '-w',
      'start',
    ],
    { stdio: 'ignore' },
  );
  started = true;
  run(
    path.join(bin, 'createdb.exe'),
    ['-h', '127.0.0.1', '-p', '55440', '-U', 'clp_cl01_test', 'clp_cl01_test'],
    { env: { ...process.env, PGPASSWORD: password } },
  );
  prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  await step('new PostgreSQL target identity and empty schema', async () => {
    const [identity] =
      await prisma.$queryRaw`SELECT current_database() AS database,current_user AS role,current_setting('server_version_num')::int / 10000 AS major,current_setting('data_directory') AS directory,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables`;
    assert.equal(identity.database, 'clp_cl01_test');
    assert.equal(identity.role, 'clp_cl01_test');
    assert.equal(identity.major, 17);
    assert.equal(identity.tables, 0);
    assert.equal(path.resolve(identity.directory).toLowerCase(), path.resolve(data).toLowerCase());
  });
  const env = {
    ...process.env,
    DATABASE_URL: url,
    CL01_TEST_DATABASE_URL: url,
    CL01_TEST_CONFIRM: 'APPROVED_CL01_DISPOSABLE_ONLY',
    CHECKPOINT_DISABLE: '1',
  };
  await step('ten reviewed migrations and PostgreSQL/HTTP regression', async () => {
    run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env });
    const report = path.join(owned, 'postgres-tests.json');
    const outcome = cp.spawnSync(
      process.execPath,
      [
        require.resolve('jest/bin/jest'),
        '--config',
        'jest.integration.config.cjs',
        '--runInBand',
        '--runTestsByPath',
        'test/db/classroom.int-spec.ts',
        '--json',
        '--outputFile',
        report,
      ],
      { cwd: path.join(root, 'apps/api'), env, encoding: 'utf8', windowsHide: true },
    );
    if (outcome.status !== 0) throw Error('CL01_POSTGRES_TESTS_FAILED_SEE_PRIVATE_REPORT');
    const tested = JSON.parse(fs.readFileSync(report, 'utf8'));
    assert.equal(tested.numFailedTests, 0);
    assert.equal(tested.numPendingTests, 0);
    assert.ok(tested.numPassedTests >= 8);
    results.push({ name: 'PostgreSQL test count', passed: tested.numPassedTests });
  });
  const {
    ScryptPasswordHasher,
  } = require('../../apps/api/dist/src/modules/identity/infrastructure/scrypt-password-hasher.js');
  const hash = await new ScryptPasswordHasher().hash(accountPassword);
  const accounts = [];
  for (const [name, role] of [
    ['teacher.browser', 'TEACHER'],
    ['student.browser', 'STUDENT'],
    ['other.browser', 'STUDENT'],
  ]) {
    accounts.push(
      await prisma.user.create({
        data: {
          login: `${name}@example.invalid`,
          loginNormalized: `${name}@example.invalid`,
          state: 'ACTIVE',
          roles: { create: { role } },
          credential: {
            create: { algorithm: hash.algorithm, parameters: hash.parameters, hash: hash.hash },
          },
        },
      }),
    );
  }
  const [teacherUser, studentUser] = accounts;
  const course = await prisma.course.create({
    data: {
      slug: 'cl01-browser',
      title: 'Khóa kiểm thử CL-01',
      authorId: teacherUser.id,
      visibility: 'PUBLISHED',
    },
  });
  const unit = await prisma.unit.create({
    data: {
      slug: 'cl01-unit',
      title: 'Chương chào hỏi',
      courseId: course.id,
      visibility: 'PUBLISHED',
    },
  });
  const lesson = await prisma.lesson.create({
    data: {
      slug: 'cl01-lesson',
      title: 'Chào hỏi CL-01',
      unitId: unit.id,
      visibility: 'PUBLISHED',
    },
  });
  const item = await prisma.learningItem.create({
    data: {
      kind: 'VOCABULARY',
      simplified: '你好',
      pinyin: 'nǐ hǎo',
      meaning: 'xin chào',
      authorId: teacherUser.id,
    },
  });
  await prisma.lessonLearningItem.create({
    data: { lessonId: lesson.id, learningItemId: item.id },
  });
  Object.assign(process.env, {
    DATABASE_URL: url,
    NODE_ENV: 'test',
    API_PORT: '3112',
    SPA_ORIGIN: 'http://127.0.0.1:5199',
    POSTGRES_HOST: '127.0.0.1',
    POSTGRES_PORT: '55440',
    POSTGRES_DB: 'clp_cl01_test',
    POSTGRES_USER: 'clp_cl01_test',
    POSTGRES_PASSWORD: password,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    CSRF_SECRET: crypto.randomBytes(32).toString('hex'),
    SESSION_TTL_MINUTES: '30',
    LC03B_PREVIEW_ENABLED: 'false',
  });
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../apps/api/dist/src/app.module.js');
  app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({
    origin: ['http://127.0.0.1:5199'],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
  });
  await app.listen(3112, '127.0.0.1');
  vite = cp.spawn(
    process.execPath,
    [
      path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
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
        NODE_ENV: 'test',
        VITE_API_BASE_URL: 'http://127.0.0.1:3112',
      },
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:5199')).ok) break;
    } catch {}
    await pause(100);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const teacherContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  const studentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
  });
  const teacher = await teacherContext.newPage(),
    student = await studentContext.newPage();
  async function browserFetch(page, url, method = 'GET') {
    return page.evaluate(
      async ({ url, method }) => {
        const response = await fetch(url, { method, credentials: 'include', cache: 'no-store' });
        return { status: response.status, body: await response.json() };
      },
      { url, method },
    );
  }
  const pageErrors = [];
  teacher.on('pageerror', () => pageErrors.push('teacher runtime error'));
  student.on('pageerror', () => pageErrors.push('student runtime error'));
  async function login(page, user) {
    await page.goto('http://127.0.0.1:5199');
    await page.locator('#login-name').fill(user.login);
    await page.locator('#login-password').fill(accountPassword);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  }
  async function shot(page, name) {
    await page.screenshot({
      path: path.join(owned, name + '.png'),
      fullPage: true,
      mask: [page.locator('output'), page.locator('input[type=password]')],
    });
  }
  let invitationCode, browserClass;
  await step(
    'real Teacher login, create class, persist after reload, invitation generation',
    async () => {
      await login(teacher, teacherUser);
      await teacher.getByRole('button', { name: '+ Tạo lớp', exact: true }).click();
      await teacher.getByLabel('Tên lớp', { exact: true }).fill('Lớp thử nghiệm trình duyệt CL-01');
      await teacher.getByRole('button', { name: 'Tạo lớp', exact: true }).click();
      await teacher.getByRole('button', { name: /Lớp thử nghiệm trình duyệt CL-01/ }).waitFor();
      await teacher.reload();
      await teacher.getByRole('button', { name: /Lớp thử nghiệm trình duyệt CL-01/ }).click();
      const generated = teacher.waitForResponse(
        (res) =>
          /\/invitation$/.test(new URL(res.url()).pathname) && res.request().method() === 'POST',
      );
      await teacher.getByRole('button', { name: 'Tạo mã mới / thay mã cũ', exact: true }).click();
      invitationCode = (await (await generated).json()).code;
      browserClass = await prisma.teachingClass.findFirstOrThrow({
        where: { ownerId: teacherUser.id, title: 'Lớp thử nghiệm trình duyệt CL-01' },
      });
      await teacher.getByText('Mã mới có hiệu lực', { exact: false }).waitFor();
      await shot(teacher, '01-teacher-invitation-masked-desktop');
    },
  );
  await step('real Student login, mobile join, own classes, duplicate rejection', async () => {
    await login(student, studentUser);
    await student.getByRole('heading', { name: 'Không gian học viên' }).waitFor();
    await student.getByRole('button', { name: 'Tham gia lớp', exact: true }).click();
    await student.getByLabel('Mã tham gia lớp').fill(invitationCode);
    await student.getByRole('button', { name: 'Tham gia lớp', exact: true }).last().click();
    await student.getByText('Đã tham gia lớp.', { exact: false }).waitFor();
    await student.getByLabel('Mã tham gia lớp').fill(invitationCode);
    await student.getByRole('button', { name: 'Tham gia lớp', exact: true }).last().click();
    await student.getByRole('alert').filter({ hasText: 'đã tham gia lớp' }).waitFor();
    await student.getByRole('button', { name: 'Lớp của tôi', exact: true }).click();
    await student.getByRole('heading', { name: browserClass.title }).waitFor();
    assert.equal(await student.evaluate(() => document.documentElement.lang), 'vi');
    assert.ok(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot(student, '02-student-classes-mobile');
  });
  await step('real Teacher roster and published assignment UI', async () => {
    await teacher.getByRole('button', { name: 'Tải lại danh sách học viên', exact: true }).click();
    await teacher.getByText(studentUser.login, { exact: true }).waitFor();
    await shot(teacher, '03-real-roster-loaded');
    await teacher.getByRole('button', { name: /Xem tiến độ/ }).click();
    await teacher.getByLabel('Khóa học', { exact: true }).selectOption(course.publicId);
    await teacher.getByLabel('Chương', { exact: true }).selectOption(unit.publicId);
    await teacher.getByLabel('Bài học đã xuất bản', { exact: true }).selectOption(lesson.publicId);
    await teacher.getByRole('button', { name: 'Giao bài học', exact: true }).click();
    await teacher.getByText('Đã giao bài học.', { exact: true }).waitFor();
    assert.equal(
      await prisma.lessonAssignment.count({
        where: { classId: browserClass.id, studentId: studentUser.id, lessonId: lesson.id },
      }),
      1,
    );
  });
  await step(
    'real Student assignment exercise, reload/recovery, evidence/mastery, Teacher progress',
    async () => {
      await student.getByRole('button', { name: 'Bài được giao', exact: true }).click();
      await student.getByRole('heading', { name: lesson.title }).waitFor();
      await shot(student, '04-assignment-mobile');
      const issuing = student.waitForResponse(
        (res) =>
          /\/exercises\/next$/.test(new URL(res.url()).pathname) &&
          res.request().method() === 'POST',
      );
      await student.getByRole('button', { name: 'Luyện tập bài được giao', exact: true }).click();
      const view = await (await issuing).json();
      for (const key of ['answerKey', 'answer', 'actorId', 'learningItemId'])
        assert.ok(!(key in view));
      assert.equal(view.lessonId, lesson.publicId);
      await student.getByLabel('Câu trả lời của bạn').fill('你好');
      await student.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
      await student.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
      await shot(student, '05-result-mobile');
      const session = await prisma.answerSession.findUniqueOrThrow({
        where: { publicId: view.sessionId },
        include: { submissions: true },
      });
      assert.equal(session.submissions.length, 1);
      assert.ok(session.submissions[0].learningEventPublicId);
      assert.equal(
        await prisma.learningEvent.count({
          where: {
            publicId: session.submissions[0].learningEventPublicId,
            actorId: studentUser.id,
            lessonId: lesson.id,
          },
        }),
        1,
      );
      assert.equal(
        await prisma.masteryProjection.count({
          where: { actorId: studentUser.id, learningItemId: item.id },
        }),
        1,
      );
      await student.evaluate((sessionId) => {
        sessionStorage.setItem('clp.activeExerciseSessionId', sessionId);
      }, view.sessionId);
      await student.reload();
      await student.getByRole('heading', { name: 'Kết quả', exact: true }).waitFor();
      assert.equal(
        await prisma.answerSubmission.count({ where: { exerciseSessionId: session.id } }),
        1,
      );
      await teacher.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click();
      const progress = await browserFetch(
        teacher,
        `http://127.0.0.1:3112/teacher/classes/${browserClass.publicId}/students/${studentUser.publicId}/progress`,
      );
      assert.equal(progress.status, 200);
      assert.equal(progress.body.evidence.attempts, 1);
      await shot(teacher, '06-teacher-progress');
    },
  );
  await step(
    'real-cookie CSRF/RBAC, exact-login UI, mobile Teacher and Student logout',
    async () => {
      const before = await prisma.classInvitation.findUniqueOrThrow({
        where: { classId: browserClass.id },
      });
      const rejected = await browserFetch(
        teacher,
        `http://127.0.0.1:3112/teacher/classes/${browserClass.publicId}/invitation`,
        'POST',
      );
      assert.equal(rejected.status, 403);
      assert.deepEqual(
        await prisma.classInvitation.findUniqueOrThrow({ where: { classId: browserClass.id } }),
        before,
      );
      assert.equal(
        (await browserFetch(student, 'http://127.0.0.1:3112/teacher/classes')).status,
        403,
      );
      assert.ok(
        (await teacherContext.cookies()).some(
          (cookie) => cookie.name === 'clp_session' && cookie.httpOnly,
        ),
      );
      await teacher.getByRole('button', { name: browserClass.title, exact: true }).click();
      await teacher.getByLabel('Thêm tài khoản học viên có sẵn').fill(accounts[2].login);
      await teacher.getByRole('button', { name: 'Thêm học viên', exact: true }).click();
      await teacher.getByText('Đã thêm học viên vào lớp.', { exact: true }).waitFor();
      await teacher.getByText(accounts[2].login, { exact: true }).waitFor();
      await teacher.setViewportSize({ width: 390, height: 844 });
      await teacher.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('.tw-workspace')).gridTemplateColumns.split(' ')
            .length === 1,
      );
      await shot(teacher, '07-teacher-enrollment-mobile');
      assert.ok(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await student
        .getByRole('button', { name: 'Về bài được giao và lớp học', exact: true })
        .click();
      await student.getByRole('button', { name: 'Tiến độ', exact: true }).click();
      await student.getByText('1 lượt trả lời', { exact: false }).waitFor();
      await shot(student, '08-student-progress-mobile');
      await student.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await student.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      await student.reload();
      await student.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    },
  );
  assert.deepEqual(pageErrors, []);
  results.push({
    name: 'final synthetic row counts',
    users: await prisma.user.count(),
    enrollments: await prisma.classEnrollment.count(),
    invitations: await prisma.classInvitation.count(),
    submissions: await prisma.answerSubmission.count(),
    events: await prisma.learningEvent.count(),
    projections: await prisma.masteryProjection.count(),
  });
}
main()
  .then(
    () => {
      console.log('CL01_REALSTACK_PASS');
    },
    (error) => {
      results.push({ name: stage, status: 'FAIL' });
      const safeMessage = String(error?.message || 'unknown')
        .split('\n')[0]
        .replace(/[a-f0-9]{48,}/gi, '[redacted]')
        .replace(/CL-[A-Za-z0-9_-]{32}/g, '[invitation]');
      results.push({ diagnostic: safeMessage });
      const location = String(error?.stack || '')
        .split('\n')
        .find((line) => /realstack\.cjs:\d/.test(line));
      if (location) {
        results.push({
          location: location.trim(),
          actual: typeof error.actual === 'number' ? error.actual : undefined,
          expected: typeof error.expected === 'number' ? error.expected : undefined,
        });
        console.error(location.trim());
      }
      console.error(safeMessage);
      console.error(
        'CL01_REALSTACK_FAILED at ' + stage + '; inspect sanitized results; preserve cluster.',
      );
      process.exitCode = 1;
    },
  )
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (started) {
      try {
        run(
          path.join(bin, 'pg_ctl.exe'),
          ['-D', path.join(owned, 'data'), '-m', 'fast', '-w', 'stop'],
          { stdio: 'ignore' },
        );
      } catch {
        process.exitCode = 1;
      }
    }
    if (fs.existsSync(owned))
      fs.writeFileSync(
        path.join(owned, 'results.json'),
        JSON.stringify(
          {
            environment:
              'Windows PostgreSQL17 / real Nest API / Vite / Chrome; synthetic fixtures only; preview OFF; retained stopped cluster',
            results,
          },
          null,
          2,
        ),
      );
  });
