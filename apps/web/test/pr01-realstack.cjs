/* PR-01 real-stack verification. Fresh PostgreSQL cluster only; NO mocked API.
 * Requires existing PostgreSQL 17 binaries, Playwright and Chrome.
 * Runtime: PR01_CONFIRM=NEW_CLUSTER_ONLY, PR01_DISPOSABLE_ROOT=<new absolute path>,
 * PR01_PG_BIN=<existing PostgreSQL bin directory>. Credentials generated in memory.
 * Retains database/evidence, stops only owned servers; never resets an existing DB.
 */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const { runDemoSeed, CONFIRMATION } = require('../../../scripts/seed/db-seed-demo.cjs');
const repo = path.resolve(__dirname, '../../..');
const root = process.env.PR01_DISPOSABLE_ROOT;
const pgBin = process.env.PR01_PG_BIN;
const apiOrigin = 'http://127.0.0.1:3101';
const spaOrigin = 'http://127.0.0.1:5188';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stage = 'provenance';
async function visible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
}
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function main() {
  assert.equal(process.env.PR01_CONFIRM, 'NEW_CLUSTER_ONLY');
  assert.ok(!fs.existsSync(path.join(repo, '.env')), 'Harness requires an env-file-free worktree');
  assert.ok(
    root && path.isAbsolute(root) && !fs.existsSync(root),
    'Fresh external directory required',
  );
  assert.ok(
    !path.resolve(root).toLowerCase().startsWith(repo.toLowerCase()),
    'Must be outside repository',
  );
  assert.ok(pgBin && fs.existsSync(path.join(pgBin, 'initdb.exe')));
  assert.ok(/17\./.test(execFileSync(path.join(pgBin, 'postgres.exe'), ['--version']).toString()));
  for (const port of [55434, 3101, 5188]) await freePort(port);
  fs.mkdirSync(root, { recursive: true });
  const sid = execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  ])
    .toString()
    .trim();
  execFileSync(
    'icacls.exe',
    [root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'],
    { stdio: 'ignore' },
  );
  const data = path.join(root, 'data');
  const evidence = path.join(root, 'evidence');
  fs.mkdirSync(evidence);
  const dbPassword = randomBytes(32).toString('base64url');
  const demoPassword = randomBytes(24).toString('base64url');
  const dbUser = `pr01_${randomBytes(5).toString('hex')}`;
  const url = `postgresql://${dbUser}:${dbPassword}@127.0.0.1:55434/clp_demo_ds01`;
  const env = { ...process.env, DATABASE_URL: url, PGPASSWORD: dbPassword, NODE_ENV: 'test' };
  const pwfile = path.join(root, 'init-password.tmp');
  fs.writeFileSync(pwfile, dbPassword);
  const pg = (name, args) =>
    execFileSync(path.join(pgBin, `${name}.exe`), args, { env, stdio: 'ignore', timeout: 60000 });
  let pgStarted = false,
    app,
    browser,
    vite,
    prisma;
  let releaseLock;
  const results = [];
  const pass = (name, detail = {}) => {
    results.push({ name, result: 'PASS', ...detail });
    console.log(`PASS ${name}`);
  };
  try {
    stage = 'new PostgreSQL cluster';
    pg('initdb', [
      '-D',
      data,
      '-U',
      dbUser,
      '--pwfile',
      pwfile,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ]);
    fs.unlinkSync(pwfile); // Only the generated transient password file, never a recovery/data artifact.
    pg('pg_ctl', [
      '-D',
      data,
      '-l',
      path.join(root, 'postgres.log'),
      '-o',
      '-h 127.0.0.1 -p 55434',
      '-w',
      'start',
    ]);
    pgStarted = true;
    pg('createdb', ['-h', '127.0.0.1', '-p', '55434', '-U', dbUser, 'clp_demo_ds01']);
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        path.join(repo, 'prisma/schema.prisma'),
      ],
      { cwd: repo, env, stdio: 'ignore', timeout: 60000 },
    );
    prisma = new PrismaClient({ datasources: { db: { url } } });
    assert.equal(await prisma.user.count(), 0);
    const seed = await runDemoSeed({ url, confirmation: CONFIRMATION, password: demoPassword });
    pass('fresh PostgreSQL17 migrated and DS01 seeded', { seed });
    if (process.env.PR01_REPRO_CONTENT !== '1') {
      stage = 'existing PostgreSQL integration suite';
      pg('createdb', ['-h', '127.0.0.1', '-p', '55434', '-U', dbUser, 'clp_test']);
      const testUrl = url.replace('/clp_demo_ds01', '/clp_test');
      const testEnv = { ...env, DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl };
      execFileSync(
        process.execPath,
        [
          require.resolve('prisma/build/index.js'),
          'migrate',
          'deploy',
          '--schema',
          path.join(repo, 'prisma/schema.prisma'),
        ],
        { cwd: repo, env: testEnv, stdio: 'ignore', timeout: 60000 },
      );
      const output = path.join(root, 'postgres-jest-private.json');
      // DS-01's separate 11-test suite requires its own empty clp_demo_ds01;
      // this run uses that database for real browser workflows. Select the
      // existing clp_test suite explicitly rather than silently skipping DS-01.
      execFileSync(
        process.execPath,
        [
          require.resolve('jest/bin/jest'),
          '--config',
          'jest.integration.config.cjs',
          '--runInBand',
          '--testPathIgnorePatterns=demo-seed.int-spec.ts',
          '--json',
          '--outputFile',
          output,
        ],
        { cwd: path.join(repo, 'apps/api'), env: testEnv, stdio: 'ignore', timeout: 180000 },
      );
      const report = JSON.parse(fs.readFileSync(output, 'utf8'));
      assert.equal(report.numFailedTests, 0);
      assert.equal(report.numPendingTests, 0);
      assert.ok(report.numPassedTests >= 44);
      pass(stage, {
        tests: report.numPassedTests,
        suites: report.numPassedTestSuites,
        skipped: report.numPendingTests,
      });
    }
    Object.assign(process.env, {
      DATABASE_URL: url,
      NODE_ENV: 'test',
      API_PORT: '3101',
      SPA_ORIGIN: spaOrigin,
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '55434',
      POSTGRES_DB: 'clp_demo_ds01',
      POSTGRES_USER: dbUser,
      POSTGRES_PASSWORD: dbPassword,
      SESSION_SECRET: randomBytes(32).toString('hex'),
      CSRF_SECRET: randomBytes(32).toString('hex'),
      SESSION_TTL_MINUTES: '30',
    });
    stage = 'real API startup';
    require('reflect-metadata');
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require(path.join(repo, 'apps/api/dist/src/app.module.js'));
    app = await NestFactory.create(AppModule, { logger: false });
    // Same real module/guards/services/config/DB and CORS contract as main.ts;
    // test-only bootstrap binds loopback explicitly, with no provider overrides.
    app.enableCors({
      origin: [spaOrigin],
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
      maxAge: 600,
    });
    await app.listen(3101, '127.0.0.1');
    if (process.env.PR01_REPRO_CONTENT !== '1') {
      stage = 'combined Content PostgreSQL HTTP security regression';
      await require('./pr01-content-postgres.cjs')({ app, prisma, password: demoPassword, pass });
    }
    const vitePath = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
    vite = spawn(
      process.execPath,
      [vitePath, '--host', '127.0.0.1', '--port', '5188', '--strictPort'],
      {
        cwd: path.join(repo, 'apps/web'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: 'test',
          VITE_API_BASE_URL: apiOrigin,
        },
      },
    );
    let started = false,
      startup = '';
    vite.stdout.on('data', (chunk) => {
      startup += String(chunk);
      if (/Local/.test(startup) && /5188/.test(startup)) started = true;
    });
    vite.stderr.on('data', () => {});
    for (let i = 0; i < 150 && !started && vite.exitCode === null; i++) await pause(100);
    assert.ok(started, 'Own Vite did not start');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const teacher = await teacherContext.newPage();
    const api = (page, route, method = 'GET', body, csrf = true) =>
      page.evaluate(
        async ({ origin, route, method, body, csrf }) => {
          const token = document.cookie
            .split(';')
            .map((v) => v.trim())
            .find((v) => v.startsWith('clp_csrf='))
            ?.slice(9);
          const response = await fetch(origin + route, {
            method,
            credentials: 'include',
            cache: 'no-store',
            headers: {
              ...(body ? { 'Content-Type': 'application/json' } : {}),
              ...(csrf && method === 'POST' && token
                ? { 'X-CSRF-Token': decodeURIComponent(token) }
                : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          return {
            status: response.status,
            data: response.status === 204 ? null : await response.json(),
          };
        },
        { origin: apiOrigin, route, method, body, csrf },
      );
    async function login(page, loginName) {
      await page.goto(spaOrigin);
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill(loginName);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(demoPassword);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    }
    async function shot(page, name) {
      assert.equal(
        await page.locator('input[type=password]').count(),
        0,
        'Never capture login credentials',
      );
      await page.evaluate(() => {
        const node = document.createElement('div');
        node.id = 'pr01-evidence';
        node.textContent = 'PR-01 REAL STACK · disposable PostgreSQL + real API · DS-01 demo data';
        node.style.cssText =
          'padding:8px;background:#fff4c9;color:#332800;font:12px sans-serif;text-align:center';
        document.body.prepend(node);
      });
      await page.screenshot({
        path: path.join(evidence, name + '.png'),
        fullPage: true,
        mask: [page.getByText(/@example\.invalid/)],
      });
      await page.locator('#pr01-evidence').evaluate((node) => node.remove());
    }
    const demoStudent = await prisma.user.findUniqueOrThrow({
      where: { loginNormalized: 'student.one@example.invalid' },
    });
    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { loginNormalized: 'teacher.two@example.invalid' },
    });
    stage = 'teacher login and dashboard';
    await login(teacher, teacherUser.login);
    await visible(teacher.getByRole('heading', { name: 'Không gian giảng dạy' }));
    const initial = await api(teacher, '/teacher/classes');
    assert.equal(initial.status, 200);
    assert.equal(initial.data.classes.length, 1);
    await visible(teacher.getByRole('button', { name: /Demo Class/ }));
    await shot(teacher, '01-dashboard');
    pass(stage);
    stage = 'pending create-class navigation regression with real PostgreSQL lock';
    let locked;
    const acquired = new Promise((resolve) => {
      locked = resolve;
    });
    const released = new Promise((resolve) => {
      releaseLock = resolve;
    });
    const blocking = prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('LOCK TABLE teaching_classes IN ACCESS EXCLUSIVE MODE');
        locked();
        await released;
      },
      { timeout: 20000 },
    );
    await acquired;
    await teacher.getByRole('button', { name: '+ Tạo lớp' }).click();
    await teacher.getByLabel('Tên lớp').fill('PR-01 real pilot class');
    const createResponse = teacher.waitForResponse(
      (r) => r.url() === apiOrigin + '/teacher/classes' && r.request().method() === 'POST',
    );
    await teacher.getByRole('button', { name: 'Tạo lớp', exact: true }).click();
    assert.ok(
      await teacher.getByRole('button', { name: 'Đóng biểu mẫu', exact: true }).isDisabled(),
    );
    assert.ok(await teacher.getByRole('button', { name: 'Hủy', exact: true }).isDisabled());
    assert.ok(await teacher.getByRole('button', { name: 'Đăng xuất', exact: true }).isDisabled());
    releaseLock();
    await blocking;
    releaseLock = null;
    assert.equal((await createResponse).status(), 201);
    await visible(teacher.getByRole('button', { name: /PR-01 real pilot class/ }));
    await teacher.reload();
    await visible(teacher.getByRole('button', { name: /PR-01 real pilot class/ }));
    const classes = (await api(teacher, '/teacher/classes')).data.classes;
    const created = classes.find((row) => row.title === 'PR-01 real pilot class');
    assert.equal(classes.filter((row) => row.title === created.title).length, 1);
    pass(stage);
    stage = 'empty class and real enrollment setup';
    await teacher.getByRole('button', { name: /PR-01 real pilot class/ }).click();
    await visible(teacher.getByText('Chưa có học viên ghi danh'));
    await shot(teacher, '02-empty-class');
    assert.equal(
      (
        await api(teacher, `/teacher/classes/${created.classId}/roster`, 'POST', {
          studentId: demoStudent.publicId,
        })
      ).status,
      201,
    );
    await teacher.getByRole('button', { name: 'Tải lại danh sách học viên' }).click();
    const studentButton = teacher.getByRole('button', {
      name: `Xem tiến độ của ${demoStudent.displayName || demoStudent.login}`,
    });
    await visible(studentButton);
    await shot(teacher, '03-loaded-roster');
    await studentButton.click();
    await visible(
      teacher.getByRole('heading', {
        name: demoStudent.displayName || demoStudent.login,
        exact: true,
      }),
    );
    pass(stage, { enrollmentSetup: 'real Teacher API; enrollment UI absent' });
    stage = 'assign published lesson via UI';
    const courseResponse = await api(teacher, '/content/courses');
    stage = `content courses contract HTTP ${courseResponse.status}`;
    assert.equal(courseResponse.status, 200);
    const courses = courseResponse.data;
    assert.ok(Array.isArray(courses) && courses.length > 0, 'Readable courses required');
    const course = courses.find((row) => row.visibility === 'PUBLISHED');
    assert.ok(course);
    const unitResponse = await api(teacher, `/content/courses/${course.publicId}/units`);
    stage = `content units contract HTTP ${unitResponse.status}`;
    if (process.env.PR01_REPRO_CONTENT === '1') {
      assert.equal(unitResponse.status, 500);
      const { PrismaContentRepository } = require(
        path.join(
          repo,
          'apps/api/dist/src/modules/content/infrastructure/prisma-content.repository.js',
        ),
      );
      await assert.rejects(
        new PrismaContentRepository(prisma).listUnitsByCourse(course.publicId),
        (error) => {
          assert.equal(error.name, 'PrismaClientValidationError');
          const fragment = error.message.match(/Unknown field `authorId`[^\n]*/)?.[0];
          assert.ok(fragment);
          pass('baseline original Prisma exception', {
            exception: error.name,
            message: fragment,
            httpStatus: unitResponse.status,
          });
          return true;
        },
      );
      fs.writeFileSync(
        path.join(evidence, 'content-root-cause.json'),
        JSON.stringify({ results }, null, 2),
      );
      return;
    }
    assert.equal(unitResponse.status, 200);
    const units = unitResponse.data;
    assert.ok(Array.isArray(units) && units.length > 0, 'Readable units required');
    // Today is a global queue, NOT ordered by teacher assignments. Read the
    // real student's queue to select a lesson that the next exercise covers;
    // do not alter ordering, evidence or seed fixtures to force the workflow.
    const studentContext = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const student = await studentContext.newPage();
    await login(student, demoStudent.login);
    await visible(student.getByRole('heading', { name: 'Hôm nay', exact: true }));
    const initialToday = (await api(student, '/student/today')).data;
    assert.equal(initialToday.completedToday, 0);
    const selectedLessonId = initialToday.entries[0].lessonId;
    let lesson, selectedUnit;
    for (const unit of units) {
      const response = await api(teacher, `/content/units/${unit.publicId}/lessons`);
      assert.equal(response.status, 200);
      const candidate = response.data.find(
        (row) => row.publicId === selectedLessonId && row.visibility === 'PUBLISHED',
      );
      if (candidate) {
        lesson = candidate;
        selectedUnit = unit;
        break;
      }
    }
    assert.ok(lesson && selectedUnit);
    stage = 'assign published queue lesson via UI';
    await teacher.getByLabel('Khóa học', { exact: true }).selectOption(course.publicId);
    await teacher.getByLabel('Chương', { exact: true }).selectOption(selectedUnit.publicId);
    await teacher.getByLabel('Bài học đã xuất bản').selectOption(lesson.publicId);
    await teacher.getByRole('button', { name: 'Giao bài học', exact: true }).click();
    await visible(teacher.getByText('Đã giao bài học.', { exact: true }));
    await visible(teacher.getByText(lesson.title, { exact: true }));
    await shot(teacher, '04-assignment');
    assert.equal(
      (
        await api(
          teacher,
          `/teacher/classes/${created.classId}/students/${demoStudent.publicId}/assignments`,
        )
      ).data.assignments.length,
      1,
    );
    pass(stage);
    stage = 'student real login and published queue contract';
    await student.reload();
    await visible(student.getByRole('heading', { name: 'Hôm nay', exact: true }));
    const today = (await api(student, '/student/today')).data;
    assert.ok(today.entries.some((row) => row.lessonId === lesson.publicId));
    assert.ok(!JSON.stringify(today).includes(demoStudent.id));
    await visible(student.getByRole('button', { name: 'Tiếp tục', exact: true }));
    await shot(student, '05-student-today');
    pass(stage, {
      gap: 'Student Today is a published/due queue, not an assignment inbox or completion contract.',
    });
    async function exercise(dropResponse) {
      const startResponse = student.waitForResponse(
        (r) => r.url().includes('/student/exercises/next') && r.request().method() === 'POST',
      );
      await student
        .getByRole('button', { name: dropResponse ? 'Bài tập tiếp theo' : 'Tiếp tục', exact: true })
        .click();
      const exercise = await (await startResponse).json();
      assert.deepEqual(
        Object.keys(exercise).sort(),
        [
          'sessionId',
          'lessonId',
          'mode',
          'format',
          'prompt',
          'options',
          'expiresAt',
          'alreadyAnswered',
        ].sort(),
      );
      const session = await prisma.answerSession.findUniqueOrThrow({
        where: { publicId: exercise.sessionId },
      });
      const responseText = JSON.stringify(exercise);
      for (const hidden of [session.id, session.actorId, session.learningItemId, session.lessonId])
        assert.ok(!responseText.includes(hidden));
      await visible(student.getByRole('button', { name: 'Nộp đáp án', exact: true }));
      if (!dropResponse) await shot(student, '06-exercise-before-answer');
      if (exercise.format === 'MULTIPLE_CHOICE') await student.getByRole('radio').first().check();
      else await student.getByLabel('Câu trả lời của bạn', { exact: true }).fill('你好');
      let dropped = false;
      if (dropResponse)
        await student.route('**/student/exercises/*/answers', async (route) => {
          await route.fetch(); // Real API commits. Fault injection drops ONLY the real network response.
          dropped = true;
          await route.abort('failed');
        });
      await student.getByRole('button', { name: 'Nộp đáp án', exact: true }).click();
      if (dropResponse) {
        await visible(student.getByRole('alert'));
        assert.ok(dropped);
        await student.unroute('**/student/exercises/*/answers');
        const recovery = student.waitForResponse(
          (r) => r.url().endsWith('/result/recover') && r.request().method() === 'POST',
        );
        await student.reload();
        assert.equal((await recovery).status(), 200);
      }
      await visible(student.getByRole('heading', { name: 'Kết quả', exact: true }));
      const submissions = await prisma.answerSubmission.findMany({
        where: { exerciseSessionId: session.id },
      });
      assert.equal(submissions.length, 1);
      assert.ok(submissions[0].learningEventPublicId);
      const events = await prisma.learningEvent.findMany({
        where: { publicId: submissions[0].learningEventPublicId },
      });
      assert.equal(events.length, 1);
      assert.equal(events[0].actorId, session.actorId);
      assert.equal(events[0].learningItemId, session.learningItemId);
      const projection = await prisma.masteryProjection.findFirstOrThrow({
        where: { actorId: session.actorId, learningItemId: session.learningItemId },
      });
      assert.equal(projection.sourceLastEventId, events[0].publicId);
      assert.equal(projection.sourceLastEventAt.getTime(), events[0].occurredAt.getTime());
      assert.equal(
        await prisma.masteryProjection.count({
          where: { actorId: session.actorId, learningItemId: session.learningItemId },
        }),
        1,
      );
      const again = await api(
        student,
        `/student/exercises/${exercise.sessionId}/result/recover`,
        'POST',
      );
      assert.equal(again.status, 200);
      const beforeGet = JSON.stringify(
        await Promise.all([
          prisma.answerSubmission.findMany(),
          prisma.learningEvent.findMany(),
          prisma.masteryProjection.findMany(),
        ]),
      );
      const readResult = await api(student, `/student/exercises/${exercise.sessionId}/result`);
      assert.equal(readResult.status, 200);
      assert.equal(
        JSON.stringify(
          await Promise.all([
            prisma.answerSubmission.findMany(),
            prisma.learningEvent.findMany(),
            prisma.masteryProjection.findMany(),
          ]),
        ),
        beforeGet,
      );
      assert.equal(
        await prisma.answerSubmission.count({ where: { exerciseSessionId: session.id } }),
        1,
      );
      await shot(student, dropResponse ? '08-recovered-result' : '07-result');
    }
    stage = 'normal answer and PostgreSQL evidence linkage';
    await exercise(false);
    pass(stage);
    stage = 'reload after real response loss and idempotent recovery';
    await exercise(true);
    pass(stage);
    stage = 'teacher evidence updates from real student activity';
    await teacher.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click();
    await visible(
      teacher.getByRole('heading', {
        name: demoStudent.displayName || demoStudent.login,
        exact: true,
      }),
    );
    const updated = (
      await api(teacher, `/teacher/classes/${created.classId}/students/${demoStudent.publicId}`)
    ).data;
    assert.ok(updated.progress.evidence.attempts > 0);
    await shot(teacher, '09-teacher-updated-progress');
    pass(stage, {
      attempts: updated.progress.evidence.attempts,
      correct: updated.progress.evidence.correct,
    });
    stage = 'real RBAC CSRF and ownership';
    assert.equal((await api(student, '/teacher/classes')).status, 403);
    assert.equal(
      (await api(teacher, '/teacher/classes', 'POST', { title: 'Must not be created' }, false))
        .status,
      403,
    );
    const other = await browser.newPage();
    await login(other, 'teacher.one@example.invalid');
    await visible(other.getByRole('heading', { name: 'Không gian giảng dạy' }));
    assert.equal((await api(other, `/teacher/classes/${created.classId}/roster`)).status, 404);
    assert.equal(await prisma.teachingClass.count({ where: { title: 'Must not be created' } }), 0);
    pass(stage);
    stage = 'real offline error and retry';
    await teacherContext.setOffline(true);
    await teacher.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click();
    await visible(teacher.getByRole('alert'));
    await teacherContext.setOffline(false);
    await teacher.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await visible(
      teacher.getByRole('heading', {
        name: demoStudent.displayName || demoStudent.login,
        exact: true,
      }),
    );
    pass(stage);
    stage = 'expired real session';
    await prisma.session.updateMany({
      where: { userId: teacherUser.id },
      data: { expiresAt: new Date(0) },
    });
    await teacher.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click();
    await visible(teacher.getByRole('heading', { name: 'Đăng nhập', exact: true }));
    pass(stage);
    const counts = {
      users: await prisma.user.count(),
      classes: await prisma.teachingClass.count(),
      assignments: await prisma.lessonAssignment.count(),
      submissions: await prisma.answerSubmission.count(),
      learningEvents: await prisma.learningEvent.count(),
      mastery: await prisma.masteryProjection.count(),
    };
    fs.writeFileSync(
      path.join(evidence, 'realstack-results.json'),
      JSON.stringify(
        {
          status: 'PASS',
          baseline: '4d62eaa23392651ddf26d761ab30455229ff2726',
          environment:
            'New PostgreSQL17 cluster, real Nest AppModule (no overrides), Vite and Chrome; DS01 seed; no mock responses',
          results,
          counts,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ status: 'PASS', scenarios: results.length, counts }));
  } catch (error) {
    const sourceFrame = String(error.stack)
      .split('\n')
      .find((line) => /at .*pr01-(content-postgres|realstack)\.cjs:\d+:\d+/.test(line));
    if (sourceFrame) console.error(sourceFrame.trim());
    fs.writeFileSync(
      path.join(evidence, 'realstack-results.json'),
      JSON.stringify(
        { status: 'FAIL', failureStage: stage, category: error.name, results },
        null,
        2,
      ),
    );
    throw new Error(
      `PR01 failed at: ${stage} (${error.name}); details intentionally omit credentials`,
    );
  } finally {
    releaseLock?.();
    if (browser) await browser.close();
    if (vite) vite.kill();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (pgStarted) pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    if (fs.existsSync(pwfile)) fs.unlinkSync(pwfile);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
