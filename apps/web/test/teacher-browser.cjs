/* TW-01 browser interaction harness. Test-only HTTP interception, NO real API/DB.
 * Requires an already installed playwright accessible via NODE_PATH.
 * Run: node apps/web/test/teacher-browser.cjs <external-evidence-directory>
 * Starts/stops only its own loopback Vite child. Never logs cookies or credentials.
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = process.argv[2];
if (!output || !path.isAbsolute(output))
  throw new Error('An absolute external evidence directory is required');
const web = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:5187';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const klass = {
  classId: id(1),
  title: 'Mandarin foundations',
  term: 'Autumn 2026',
  enrolled: 2,
  createdAt: '2026-10-01T09:00:00Z',
};
const students = [
  {
    studentId: id(2),
    displayName: 'Linh Nguyen',
    login: 'learner-a.invalid',
    enrolledAt: '2026-10-02T09:00:00Z',
  },
  {
    studentId: id(3),
    displayName: 'Minh Tran',
    login: 'learner-b.invalid',
    enrolledAt: '2026-10-03T09:00:00Z',
  },
];
const node = (n, title, visibility = 'PUBLISHED') => ({
  publicId: id(n),
  title,
  visibility,
  slug: 'test-only',
  description: null,
  position: 0,
});
const assignment = {
  assignmentId: id(7),
  studentId: id(2),
  lessonId: id(6),
  lessonTitle: 'Greetings & introductions',
  dueAt: '2026-11-01T10:00:00Z',
  createdAt: '2026-10-01T09:00:00Z',
};
const detail = {
  studentId: id(2),
  login: students[0].login,
  displayName: students[0].displayName,
  assignments: [assignment],
  progress: {
    studentId: id(2),
    classId: id(1),
    evidence: {
      window: { from: '2026-09-21T12:00:00Z', to: '2026-10-21T12:00:00Z', days: 30 },
      totalEvents: 15,
      attempts: 12,
      correct: 9,
      incorrect: 3,
      accuracy: 0.75,
      assignedLessons: 1,
      itemsWithEvidence: 3,
    },
    weakItems: [{ itemId: id(8), state: 'LEARNING', correct: 2, incorrect: 2, dueAt: null }],
  },
  recentEvidence: [
    {
      eventId: id(9),
      type: 'ANSWER_SUBMITTED',
      occurredAt: '2026-10-20T10:00:00Z',
      accepted: true,
      lessonId: id(6),
      itemId: id(8),
    },
  ],
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function visible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  const server = spawn(
    process.execPath,
    [vite, '--host', '127.0.0.1', '--port', '5187', '--strictPort'],
    {
      cwd: web,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        VITE_API_BASE_URL: '',
        NODE_ENV: 'test',
      },
    },
  );
  let started = false;
  let startup = '';
  server.stdout.on('data', (data) => {
    startup += String(data);
    if (/Local/.test(startup) && /5187/.test(startup)) started = true;
  });
  server.stderr.on('data', (data) => {
    startup += String(data);
  });
  let browser;
  const results = [];
  try {
    for (let attempt = 0; attempt < 100 && !started && server.exitCode === null; attempt++)
      await pause(100);
    assert.ok(
      started,
      `Own Vite instance failed to start; refusing to use an existing server. ${startup}`,
    );
    browser = await chromium.launch({
      headless: true,
      ...(process.env.TW01_BROWSER_CHANNEL ? { channel: process.env.TW01_BROWSER_CHANNEL } : {}),
    });
    async function scenario(name, options, run) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        colorScheme: 'light',
      });
      const csrf = randomBytes(24).toString('base64url');
      await context.addCookies([{ name: 'clp_csrf', value: csrf, url: origin }]);
      const page = await context.newPage();
      const calls = [];
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let classes = options.empty
        ? []
        : [klass, { ...klass, classId: id(10), title: 'Everyday conversations', enrolled: 0 }];
      let assigned = false;
      await page.route('**/*', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const p = url.pathname;
        if (url.origin !== origin) return route.abort();
        if (!/^\/(auth|teacher|content|student)\//.test(p)) return route.continue();
        const body = req.postDataJSON();
        calls.push({
          path: p,
          method: req.method(),
          body,
          hasCsrf: req.headers()['x-csrf-token'] === csrf,
        });
        const send = (data, status = 200) =>
          route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        const fail = (status) =>
          send(
            {
              error: {
                code: status === 403 ? 'FORBIDDEN' : 'TEST_ERROR',
                message: 'not for display',
              },
            },
            status,
          );
        if (p === '/auth/me')
          return options.anonymous
            ? fail(401)
            : send({
                user: {
                  publicId: id(99),
                  login: 'teacher.invalid',
                  displayName: 'An Nguyen',
                  roles: options.roles || ['TEACHER'],
                },
              });
        if (p === '/auth/logout')
          return options.logoutFailure ? fail(500) : route.fulfill({ status: 204 });
        if (p === '/student/today')
          return send({
            generatedAt: '',
            dailyGoal: 10,
            completedToday: 0,
            remaining: 0,
            entries: [],
            empty: true,
          });
        if (p === '/teacher/classes') {
          if (options.denied) return fail(options.denied);
          if (options.networkFailure) return route.abort();
          if (req.method() === 'POST') {
            await pause(200);
            const created = {
              ...klass,
              classId: id(20),
              title: body.title,
              term: body.term,
              enrolled: 0,
            };
            classes.push(created);
            return send(created, 201);
          }
          if (options.slow) await pause(400);
          return send({ classes });
        }
        if (p.endsWith('/roster')) return send({ students: options.emptyRoster ? [] : students });
        if (p === `/teacher/classes/${id(1)}/students/${id(2)}`) {
          if (options.detailDenied) return fail(options.detailDenied);
          if (options.slowDetail) await pause(700);
          return send({
            ...detail,
            assignments: assigned
              ? [
                  ...detail.assignments,
                  { ...assignment, assignmentId: id(30), lessonTitle: 'Daily routines' },
                ]
              : detail.assignments,
          });
        }
        if (p.endsWith(`/students/${id(3)}`))
          return send({ ...detail, studentId: id(3), displayName: 'Minh Tran' });
        if (p === '/content/courses') return send([node(4, 'HSK 1 · Foundations')]);
        if (p.endsWith('/units')) return send([node(5, 'Getting started')]);
        if (p.endsWith('/lessons'))
          return send([node(6, 'Daily routines'), node(11, 'Private draft', 'DRAFT')]);
        if (p.endsWith('/assignments') && req.method() === 'POST') {
          if (options.assignmentError) return fail(options.assignmentError);
          await pause(200);
          assigned = true;
          return send(assignment, 201);
        }
        throw new Error(`Unexpected test request: ${req.method()} ${p}`);
      });
      try {
        await page.goto(origin);
        await run(page, calls);
        assert.deepEqual(errors, [], 'No browser runtime errors');
        assert.equal(
          await page.evaluate(() => localStorage.length + sessionStorage.length),
          0,
          'Teacher data never persisted in storage',
        );
        results.push({ name, result: 'PASS' });
        console.log(`PASS ${name}`);
      } finally {
        await context.close();
      }
    }
    const openClass = async (page) => {
      await page.getByRole('button', { name: /Mandarin foundations/ }).click();
      await visible(page.getByRole('heading', { name: 'Students', exact: true }));
    };
    const openStudent = async (page) => {
      await openClass(page);
      await page.getByRole('button', { name: /View progress for Linh/ }).click();
      await visible(page.getByRole('heading', { name: 'Linh Nguyen', exact: true }));
    };
    async function screenshot(page, name) {
      await page.evaluate(() => {
        const label = document.createElement('div');
        label.id = 'test-evidence-label';
        label.textContent = 'TW-01 · SYNTHETIC BROWSER TEST FIXTURE · NOT LIVE STUDENT DATA';
        label.style.cssText =
          'padding:8px;background:#fff4c9;color:#332800;font:12px sans-serif;text-align:center';
        document.body.prepend(label);
      });
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
      await page.locator('#test-evidence-label').evaluate((element) => element.remove());
    }
    await scenario('dashboard roster progress and responsive views', {}, async (page, calls) => {
      await visible(page.getByRole('heading', { name: 'Your teaching space' }));
      await screenshot(page, '01-dashboard-desktop');
      await openClass(page);
      await screenshot(page, '02-class-roster');
      await page.getByRole('button', { name: /View progress for Linh/ }).click();
      await visible(page.getByText('75%', { exact: true }));
      assert.equal(
        await page
          .locator('body')
          .innerText()
          .then((text) => text.includes(id(8))),
        false,
      );
      await screenshot(page, '03-student-progress');
      await page.setViewportSize({ width: 820, height: 1100 });
      await screenshot(page, '04-tablet');
      await page.setViewportSize({ width: 390, height: 844 });
      await screenshot(page, '05-mobile');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(calls.every((call) => call.method === 'GET'));
    });
    await scenario(
      'create class exact DTO CSRF and double-click protection',
      {},
      async (page, calls) => {
        await page.getByRole('button', { name: '+ New class' }).click();
        await page.getByLabel('Class name').fill('Evening practice');
        await page.getByLabel('Term (optional)').fill('Winter');
        await page.getByRole('button', { name: 'Create class', exact: true }).dblclick();
        await visible(page.getByRole('button', { name: /Evening practice/ }));
        const posts = calls.filter((call) => call.method === 'POST');
        assert.equal(posts.length, 1);
        assert.deepEqual(posts[0].body, { title: 'Evening practice', term: 'Winter' });
        assert.ok(posts[0].hasCsrf);
      },
    );
    await scenario('assign published lesson and refresh evidence', {}, async (page, calls) => {
      await openStudent(page);
      await page.getByLabel('Course', { exact: true }).selectOption(id(4));
      await page.getByLabel('Unit', { exact: true }).selectOption(id(5));
      await page.getByLabel('Published lesson').selectOption(id(6));
      assert.equal(await page.getByRole('option', { name: 'Private draft' }).count(), 0);
      await screenshot(page, '06-assignment-form');
      await page.getByRole('button', { name: 'Assign lesson', exact: true }).dblclick();
      await visible(page.getByText('Lesson assigned.', { exact: true }));
      await visible(page.getByText('Daily routines', { exact: true }));
      const posts = calls.filter((call) => call.method === 'POST');
      assert.equal(posts.length, 1);
      assert.ok(posts[0].hasCsrf);
      assert.deepEqual(posts[0].body, { studentId: id(2), lessonId: id(6), dueAt: null });
    });
    await scenario('empty dashboard', { empty: true }, async (page) => {
      await visible(page.getByText('A fresh start for your classroom'));
    });
    await scenario('empty roster', { emptyRoster: true }, async (page) => {
      await openClass(page);
      await visible(page.getByText('No students enrolled yet'));
    });
    const networkOptions = { networkFailure: true };
    await scenario('network error retry', networkOptions, async (page) => {
      await visible(page.getByRole('alert'));
      networkOptions.networkFailure = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await visible(page.getByRole('button', { name: /Mandarin foundations/ }));
    });
    await scenario('loading state', { slow: true }, async (page) => {
      await visible(page.getByText('Loading your workspace…'));
      await visible(page.getByRole('button', { name: /Mandarin foundations/ }));
    });
    await scenario(
      'forbidden response clears private content',
      { detailDenied: 403 },
      async (page) => {
        await openClass(page);
        await page.getByRole('button', { name: /View progress for Linh/ }).click();
        await visible(page.getByRole('alert'));
        assert.equal(await page.getByRole('heading', { name: 'Linh Nguyen' }).count(), 0);
      },
    );
    await scenario('expired session returns to login', { denied: 401 }, async (page) => {
      await visible(page.getByLabel('Password', { exact: true }));
      assert.equal(await page.getByRole('heading', { name: 'Your teaching space' }).count(), 0);
    });
    await scenario(
      'student-only account does not request teacher data',
      { roles: ['STUDENT'] },
      async (page, calls) => {
        await visible(page.getByRole('heading', { name: 'Today', exact: true }));
        assert.ok(calls.every((call) => !call.path.startsWith('/teacher')));
      },
    );
    await scenario(
      'dual role workspace navigation',
      { roles: ['TEACHER', 'STUDENT'] },
      async (page) => {
        await visible(page.getByRole('heading', { name: 'Your teaching space' }));
        await page.getByRole('button', { name: 'Student', exact: true }).click();
        await visible(page.getByRole('heading', { name: 'Today', exact: true }));
        await page.getByRole('button', { name: 'Teacher', exact: true }).click();
        await visible(page.getByRole('heading', { name: 'Your teaching space' }));
      },
    );
    await scenario(
      'late student response cannot replace newer navigation',
      { slowDetail: true },
      async (page) => {
        await openClass(page);
        await page.getByRole('button', { name: /View progress for Linh/ }).click();
        await page.getByRole('button', { name: 'Mandarin foundations', exact: true }).click();
        await page.getByRole('button', { name: /View progress for Minh/ }).click();
        await visible(page.getByRole('heading', { name: 'Minh Tran', exact: true }));
        await pause(800);
        assert.equal(
          await page.getByRole('heading', { name: 'Linh Nguyen', exact: true }).count(),
          0,
        );
      },
    );
    await scenario(
      'mutation conflict remains visible without auto retry',
      { assignmentError: 409 },
      async (page, calls) => {
        await openStudent(page);
        await page.getByLabel('Course', { exact: true }).selectOption(id(4));
        await page.getByLabel('Unit', { exact: true }).selectOption(id(5));
        await page.getByLabel('Published lesson').selectOption(id(6));
        await page.getByRole('button', { name: 'Assign lesson', exact: true }).click();
        await visible(page.getByRole('alert'));
        assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
        assert.equal(await page.getByText('Lesson assigned.', { exact: true }).count(), 0);
      },
    );
    await scenario(
      'logout failure does not pretend to revoke session',
      { logoutFailure: true },
      async (page) => {
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await visible(page.getByText(/You have not been signed out/));
      },
    );
    await scenario(
      'anonymous does not request teacher data',
      { anonymous: true },
      async (page, calls) => {
        await visible(page.getByLabel('Password', { exact: true }));
        assert.ok(calls.every((call) => !call.path.startsWith('/teacher')));
      },
    );
    fs.writeFileSync(
      path.join(output, 'browser-results.json'),
      JSON.stringify(
        {
          environment: 'Chromium; synthetic request interception only; no real API or database',
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
