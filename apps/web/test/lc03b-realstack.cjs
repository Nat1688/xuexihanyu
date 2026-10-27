// LC-03C: real Nest + Prisma + React + Chromium. Requires approved fresh disposable target.
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../../..');
const local = createRequire(path.join(repo, 'package.json'));
const { chromium } = require('playwright');
const root = process.argv[2];
const url = new URL(process.env.LC03B_DATABASE_URL || 'invalid:');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55438' ||
  url.pathname !== '/clp_lc03b_test' ||
  !path.isAbsolute(root || '')
)
  throw Error('Unapproved test target');
const api = 'http://127.0.0.1:3108',
  ui = 'http://127.0.0.1:5198';
const password = randomBytes(24).toString('hex');
Object.assign(process.env, {
  NODE_ENV: 'development',
  API_PORT: '3108',
  SPA_ORIGIN: ui,
  POSTGRES_HOST: url.hostname,
  POSTGRES_PORT: url.port,
  POSTGRES_DB: 'clp_lc03b_test',
  POSTGRES_USER: url.username,
  POSTGRES_PASSWORD: decodeURIComponent(url.password),
  SESSION_SECRET: randomBytes(32).toString('hex'),
  CSRF_SECRET: randomBytes(32).toString('hex'),
  SESSION_TTL_MINUTES: '60',
  DATABASE_URL: url.toString(),
  LC03B_PREVIEW_ENABLED: 'true',
});
const src = path.join(repo, 'apps/api/dist/src');
let app, browser, vite;
const evidence = [];
async function main() {
  const { NestFactory } = local('@nestjs/core');
  const { AppModule } = require(path.join(src, 'app.module'));
  app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({
    origin: ui,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  await app.listen(3108, '127.0.0.1');
  const { PrismaService } = require(path.join(src, 'modules/foundation/prisma.service'));
  const db = app.get(PrismaService);
  const { ScryptPasswordHasher } = require(
    path.join(src, 'modules/identity/infrastructure/scrypt-password-hasher'),
  );
  const hash = await new ScryptPasswordHasher().hash(password);
  const logins = {};
  for (const role of ['STUDENT', 'TEACHER', 'ADMIN']) {
    const login = `lc03b-${role.toLowerCase()}@example.invalid`;
    logins[role] = login;
    await db.user.create({
      data: {
        login,
        loginNormalized: login,
        state: 'ACTIVE',
        roles: { create: { role } },
        credential: { create: hash },
      },
    });
  }
  const learning = ['answerSession', 'answerSubmission', 'learningEvent', 'masteryProjection'];
  const before = await Promise.all(learning.map((x) => db[x].count()));
  let mutationCalls = 0;
  for (const model of learning) {
    const delegate = db[model];
    for (const method of [
      'create',
      'createMany',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ]) {
      const original = delegate[method];
      delegate[method] = function (...args) {
        mutationCalls++;
        throw Error('Forbidden learning write ' + model + '.' + method);
      };
      assert.notEqual(delegate[method], original);
    }
  }
  async function call(method, route, body, actor, proof = actor?.csrf) {
    const response = await fetch(api + route, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(actor ? { Cookie: actor.cookie } : {}),
        ...(proof ? { 'X-CSRF-Token': proof } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    return { response, data };
  }
  async function login(role) {
    const r = await fetch(api + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: logins[role], password }),
    });
    assert.equal(r.status, 200);
    const pairs = r.headers.getSetCookie().map((x) => x.split(';')[0]);
    return {
      cookie: pairs.join('; '),
      csrf: decodeURIComponent(
        pairs
          .find((x) => x.startsWith('clp_csrf='))
          .split('=')
          .slice(1)
          .join('='),
      ),
    };
  }
  const student = await login('STUDENT'),
    teacher = await login('TEACHER'),
    admin = await login('ADMIN');
  const route = '/student/learning-prototypes/lesson-01';
  const { PreviewService } = require(path.join(src, 'modules/lesson-preview/preview.service'));
  const service = app.get(PreviewService);
  const originalConfig = service.config;
  const originalCatalogs = service.catalogs;
  service.config = { ...originalConfig, LC03B_PREVIEW_ENABLED: 'false' };
  assert.equal((await call('GET', route + '/availability')).response.status, 401);
  for (const actor of [teacher, admin])
    assert.equal((await call('GET', route + '/availability', null, actor)).response.status, 403);
  const off = await call('GET', route + '/availability', null, student);
  assert.deepEqual(off.data, { available: false });
  assert.equal(off.response.headers.get('cache-control'), 'no-store');
  assert.equal(
    (await call('GET', route + '?instructionLanguage=vi', null, student)).response.status,
    404,
  );
  assert.equal((await call('POST', route + '/practice-check', {}, student)).response.status, 404);
  service.config = originalConfig;
  assert.deepEqual((await call('GET', route + '/availability', null, student)).data, {
    available: true,
  });
  assert.equal(
    (await call('GET', route + '/availability?secret=probe', null, student)).response.status,
    400,
  );
  evidence.push({
    scenario: 'Discovery OFF/ON, no-store, auth/RBAC, gate-OFF direct read/check',
    status: 'PASS',
  });
  assert.equal((await call('GET', route + '?instructionLanguage=vi')).response.status, 401);
  assert.equal((await call('POST', route + '/practice-check', {})).response.status, 401);
  for (const actor of [teacher, admin]) {
    assert.equal(
      (await call('GET', route + '?instructionLanguage=vi', null, actor)).response.status,
      403,
    );
    assert.equal((await call('POST', route + '/practice-check', {}, actor)).response.status, 403);
  }
  const read = await call('GET', route + '?instructionLanguage=vi', null, student);
  assert.equal(read.response.status, 200);
  assert.equal(read.response.headers.get('cache-control'), 'no-store');
  const revision = read.data.revision;
  // In-process test fixtures only: never catalog releases or persisted content.
  const next = JSON.parse(JSON.stringify(originalCatalogs[0]));
  next.revision = 'lc03c-fixture-next';
  next.tasks.find((x) => x.id === 'P5').expected = 'fixture-only-answer';
  const missing = JSON.parse(JSON.stringify(originalCatalogs[0]));
  missing.revision = 'lc03c-fixture-missing';
  missing.variants = missing.variants.filter((x) => x.language === 'vi');
  service.catalogs = [originalCatalogs[0], missing, next];
  assert.equal(
    (await call('GET', route + '?instructionLanguage=en', null, student)).data.revision,
    next.revision,
  );
  assert.equal(
    (await call('GET', route + '?instructionLanguage=en&revision=' + revision, null, student)).data
      .revision,
    revision,
  );
  assert.equal(
    (
      await call(
        'GET',
        route + '?instructionLanguage=en&revision=' + missing.revision,
        null,
        student,
      )
    ).response.status,
    404,
  );
  assert.equal(
    (
      await call(
        'POST',
        route + '/practice-check',
        { instructionLanguage: 'en', revision: missing.revision, taskId: 'P1', answer: '你好' },
        student,
      )
    ).response.status,
    404,
  );
  service.catalogs = originalCatalogs;
  evidence.push({
    scenario:
      'Explicit old/latest revision and unavailable variant without fallback (test-only registry)',
    status: 'PASS',
  });
  const b = { instructionLanguage: 'vi', revision, taskId: 'P1', answer: '你好' };
  for (const proof of [null, 'invalid'])
    assert.equal(
      (await call('POST', route + '/practice-check', b, student, proof)).response.status,
      403,
    );
  assert.equal(
    (await call('POST', route + '/practice-check', { ...b, expected: 'forged' }, student)).response
      .status,
    400,
  );
  assert.equal(
    (await call('GET', route + '?instructionLanguage=fr', null, student)).response.status,
    400,
  );
  assert.equal(
    (await call('GET', route + '?instructionLanguage=vi&revision=retired', null, student)).response
      .status,
    404,
  );
  for (const language of ['vi', 'en']) {
    const v = await call('GET', route + '?instructionLanguage=' + language, null, student);
    for (const forbidden of ['expected', 'acceptedForms', 'sha256', 'correct', 'incorrect'])
      assert.equal(JSON.stringify(v.data).includes('"' + forbidden + '":'), false);
    assert.equal(v.data.status, 'PREVIEW_ONLY');
    assert.equal(v.data.recordsProgress, false);
    for (const [taskId, answer, correct] of [
      ['P1', '你好', true],
      ['P1', '再见', false],
      ['P3', '是', true],
      ['P5', ' NǏ  HǍO ', true],
      ['P5', 'ní hǎo', false],
      ['P5', 'ni3 hao3', false],
    ]) {
      const checked = await call(
        'POST',
        route + '/practice-check',
        { ...b, instructionLanguage: language, taskId, answer },
        student,
      );
      assert.equal(checked.response.status, 200);
      assert.equal(checked.data.correct, correct);
      assert.equal(checked.data.instructionLanguage, language);
    }
  }
  evidence.push({ scenario: 'S01–S04/P01 HTTP auth/RBAC/CSRF/keys/normalization', status: 'PASS' });
  vite = spawn(
    process.execPath,
    [
      path.join(repo, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5198',
      '--strictPort',
    ],
    {
      cwd: path.join(repo, 'apps/web'),
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, VITE_API_BASE_URL: api },
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(ui)).status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(vite.exitCode, null);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const page = await context.newPage();
  const originalRead = service.read.bind(service);
  let releaseRead,
    enteredRead = false;
  // StrictMode can issue two reads. Release both through one barrier so the
  // live effect cannot remain blocked while only an obsolete effect completes.
  const readBarrier = new Promise((resolve) => {
    releaseRead = resolve;
  });
  service.read = async (input) => {
    const value = originalRead(input);
    enteredRead = true;
    await readBarrier;
    return value;
  };
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(ui);
  await page.getByLabel('Login', { exact: true }).fill(logins.STUDENT);
  await page.getByLabel('Password', { exact: true }).fill(password);
  service.config = { ...originalConfig, LC03B_PREVIEW_ENABLED: 'false' };
  const unavailableDiscovery = page.waitForResponse((r) => r.url().endsWith('/availability'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  assert.deepEqual(await (await unavailableDiscovery).json(), { available: false });
  await page.getByText('Loading your plan…', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(
    await page.getByRole('button', { name: 'Lesson 01 · PREVIEW', exact: true }).count(),
    0,
  );
  fs.mkdirSync(root, { recursive: true });
  await page.screenshot({ path: path.join(root, 'GATE-OFF.png'), fullPage: true });
  service.config = originalConfig;
  await page.reload();
  await page.getByRole('button', { name: 'Lesson 01 · PREVIEW', exact: true }).click();
  await page.getByText('Đang tải bài…', { exact: true }).waitFor();
  for (let i = 0; i < 100 && !enteredRead; i++) await page.waitForTimeout(10);
  assert.ok(enteredRead);
  service.read = originalRead;
  releaseRead();
  await page.getByRole('heading', { name: 'Chào hỏi và tự giới thiệu', exact: true }).waitFor();
  assert.equal(await page.locator('input:checked').count(), 0);
  await page.getByRole('radio', { name: '你好', exact: true }).check();
  await page.getByRole('button', { name: 'Kiểm tra P1', exact: true }).click();
  await page.getByText('Đúng: dùng 你好 để mở đầu cuộc gặp trong bài.', { exact: true }).waitFor();
  await page.getByLabel('Câu trả lời', { exact: true }).nth(0).fill('是');
  await page.getByRole('button', { name: 'Kiểm tra P3', exact: true }).click();
  await page.getByText('Đúng: 我是学生 nói vai trò.', { exact: true }).waitFor();
  await page.getByLabel('Câu trả lời', { exact: true }).nth(1).fill('nǐ hǎo');
  await page.getByRole('button', { name: 'Kiểm tra P5', exact: true }).click();
  await page.getByText('Đúng về ký âm. Bài gõ không đánh giá phát âm.', { exact: true }).waitFor();
  fs.mkdirSync(root, { recursive: true });
  await page.screenshot({ path: path.join(root, 'VI-PREVIEW.png'), fullPage: true });
  service.catalogs = [originalCatalogs[0], next];
  const switchResponse = page.waitForResponse((r) =>
    r.url().includes('instructionLanguage=en&revision='),
  );
  await page.getByLabel('Instruction language / Ngôn ngữ hướng dẫn').selectOption('en');
  assert.equal((await (await switchResponse).json()).revision, revision);
  await page
    .getByRole('heading', { name: 'Greetings and self-introduction', exact: true })
    .waitFor();
  assert.equal(await page.locator('input:checked').count(), 0);
  assert.equal(await page.getByLabel('Your answer', { exact: true }).nth(0).inputValue(), '');
  await page.getByRole('radio', { name: '再见', exact: true }).check();
  await page.getByRole('button', { name: 'Check P1', exact: true }).click();
  await page.getByText('Distinguish opening from goodbye; try 你好.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, 'EN-PREVIEW.png'), fullPage: true });
  await page.getByLabel('Your answer', { exact: true }).nth(1).fill('nǐ hǎo');
  const oldCheck = page.waitForResponse((r) => r.url().endsWith('/practice-check'));
  await page.getByRole('button', { name: 'Check P5', exact: true }).click();
  const oldFeedback = await (await oldCheck).json();
  assert.equal(oldFeedback.revision, revision);
  assert.equal(oldFeedback.correct, true); // latest fixture would reject this answer
  await page.getByLabel('Instruction language / Ngôn ngữ hướng dẫn').selectOption('vi');
  await page.getByRole('heading', { name: 'Chào hỏi và tự giới thiệu', exact: true }).waitFor();
  await page.getByText('Revision: ' + revision, { exact: true }).waitFor();
  await page.getByLabel('Instruction language / Ngôn ngữ hướng dẫn').selectOption('en');
  await page
    .getByRole('heading', { name: 'Greetings and self-introduction', exact: true })
    .waitFor();
  await page.getByRole('radio', { name: '再见', exact: true }).check();
  evidence.push({
    scenario:
      'Browser VI→EN→VI pinned old revision after latest changes; self-check uses old policy',
    status: 'PASS',
  });
  await page.getByLabel('Instruction language / Ngôn ngữ hướng dẫn').selectOption('vi');
  await page.getByRole('heading', { name: 'Chào hỏi và tự giới thiệu', exact: true }).waitFor();
  service.catalogs = [
    {
      ...originalCatalogs[0],
      variants: originalCatalogs[0].variants.filter((x) => x.language === 'vi'),
    },
    next,
  ];
  await page.getByLabel('Instruction language / Ngôn ngữ hướng dẫn').selectOption('en');
  await page
    .getByText('Preview or revision unavailable. Reload the lesson or return to Today.', {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole('heading', { name: 'Greetings and self-introduction', exact: true })
      .count(),
    0,
  );
  service.catalogs = originalCatalogs;
  await page.getByRole('button', { name: 'Reload lesson', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Greetings and self-introduction', exact: true })
    .waitFor();
  evidence.push({
    scenario:
      'Browser missing pinned variant shows unavailable, not latest; explicit reload recovers',
    status: 'PASS',
  });
  // Delay the actual service result; no intercepted HTTP or fabricated answer.
  const originalCheck = service.check.bind(service);
  // Explicit reload above correctly cleared selection; prepare a fresh attempt.
  await page.getByRole('radio', { name: '再见', exact: true }).check();
  let releaseCheck, enteredCheck;
  const entered = new Promise((resolve) => {
    enteredCheck = resolve;
  });
  service.check = async (input) => {
    const value = originalCheck(input);
    enteredCheck();
    await new Promise((resolve) => {
      releaseCheck = resolve;
    });
    return value;
  };
  await page.getByRole('button', { name: 'Check P1', exact: true }).click();
  await entered;
  assert.equal(
    await page.getByLabel('Instruction language / Ngôn ngữ hướng dẫn').isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
  await page.getByRole('button', { name: 'Lesson 01 · PREVIEW', exact: true }).click();
  await page.getByRole('heading', { name: 'Chào hỏi và tự giới thiệu', exact: true }).waitFor();
  service.check = originalCheck;
  releaseCheck();
  await page.waitForTimeout(150);
  assert.equal(
    await page.getByText('Distinguish opening from goodbye; try 你好.', { exact: true }).count(),
    0,
  );
  assert.equal(await page.locator('input:checked').count(), 0);
  // Existing server gate returns a real unavailable response, not a browser fixture.
  service.config = { ...originalConfig, LC03B_PREVIEW_ENABLED: 'false' };
  await page.getByLabel('Instruction language / Ngôn ngữ hướng dẫn').selectOption('en');
  await page
    .getByText('Preview or revision unavailable. Reload the lesson or return to Today.', {
      exact: true,
    })
    .waitFor();
  service.config = originalConfig;
  await page.getByRole('button', { name: 'Reload lesson', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Greetings and self-introduction', exact: true })
    .waitFor();
  service.catalogs = [originalCatalogs[0], next];
  await page.reload();
  await page.getByRole('button', { name: 'Lesson 01 · PREVIEW', exact: true }).click();
  await page.getByRole('heading', { name: 'Chào hỏi và tự giới thiệu', exact: true }).waitFor();
  await page.getByText('Revision: ' + next.revision, { exact: true }).waitFor();
  evidence.push({
    scenario: 'Browser reload deliberately loads current revision; unsaved answers cleared',
    status: 'PASS',
  });
  assert.equal(await page.locator('input:checked').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
  );
  await page.getByRole('radio', { name: '你好', exact: true }).focus();
  assert.equal(await page.locator('input:checked').count(), 0);
  await page.keyboard.press('Space');
  assert.equal(await page.getByRole('radio', { name: '你好', exact: true }).isChecked(), true);
  assert.deepEqual(pageErrors, []);
  // Expire only the synthetic student's sessions; auth must reject subsequent requests.
  const learner = await db.user.findUniqueOrThrow({ where: { loginNormalized: logins.STUDENT } });
  await db.session.updateMany({ where: { userId: learner.id }, data: { expiresAt: new Date(0) } });
  await page.getByRole('button', { name: 'Kiểm tra P1', exact: true }).click();
  await page
    .getByText('Phiên đăng nhập đã hết hạn. Quay lại và đăng nhập.', { exact: true })
    .waitFor();
  const after = await Promise.all(learning.map((x) => db[x].count()));
  assert.deepEqual(after, before);
  assert.equal(mutationCalls, 0);
  evidence.push({
    scenario: 'Real browser VI/EN practice, switching/reload/mobile/keyboard/expiry',
    status: 'PASS',
  });
  evidence.push({
    scenario: 'P02 PostgreSQL no learning writes',
    before,
    after,
    mutationCalls,
    status: 'PASS',
  });
  fs.writeFileSync(
    path.join(root, 'realstack-results.json'),
    JSON.stringify(
      {
        environment: 'PostgreSQL17 + actual Nest/React/Chromium; no intercepted API',
        revision,
        evidence,
      },
      null,
      2,
    ),
  );
  console.log('LC03C real-stack PASS');
}
main()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
    if (app) await app.close();
  });
