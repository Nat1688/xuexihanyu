// M16: real React/Chromium, synthetic API interception; NOT backend/DB evidence.
// Uses already installed Playwright via NODE_PATH. Starts only its own loopback Vite.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('External evidence directory required');
const origin = 'http://127.0.0.1:5197';
const sessionId = '10000000-0000-4000-8000-000000000001';
const options = ['老师', '学生', '你好', '再见'];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const web = path.resolve(__dirname, '..');
  const vite = path.join(web, '../../node_modules/vite/bin/vite.js');
  const server = spawn(
    process.execPath,
    [vite, '--host', '127.0.0.1', '--port', '5197', '--strictPort'],
    {
      cwd: web,
      windowsHide: true,
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
  let ready = false;
  server.stdout.on('data', (data) => {
    if (String(data).includes('5197')) ready = true;
  });
  server.stderr.on('data', () => undefined);
  let browser;
  try {
    for (let i = 0; i < 100 && !ready && server.exitCode === null; i++) await pause(100);
    assert.ok(ready, 'Owned Vite did not start; will not use another server');
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      (id) => sessionStorage.setItem('clp.activeExerciseSessionId', id),
      sessionId,
    );
    let attempts = 0;
    const answers = [];
    await page.route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin !== origin) return route.abort();
      if (!/^\/(student|auth)\//.test(url.pathname)) return route.continue();
      const send = (value, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (url.pathname === '/auth/me')
        return send({
          user: { publicId: 'learner', login: 'fixture', displayName: null, roles: ['STUDENT'] },
        });
      if (url.pathname === `/student/exercises/${sessionId}`)
        return send({
          sessionId,
          lessonId: 'lesson',
          mode: 'VI_TO_ZH',
          format: 'MULTIPLE_CHOICE',
          prompt: 'xin chào',
          options,
          expiresAt: '2099-01-01T00:00:00Z',
          alreadyAnswered: false,
        });
      if (url.pathname.endsWith('/answers')) {
        answers.push(req.postDataJSON());
        attempts++;
        if (attempts === 1)
          return send({ error: { code: 'TEST_FAILURE', message: 'Retry test' } }, 503);
        return send({
          sessionId,
          correct: true,
          expected: '你好',
          received: '你好',
          feedback: 'CORRECT',
          submittedAt: '2026-10-23T00:00:00Z',
          integrityStatus: 'COMPLETE',
          next: { action: 'DONE', remaining: 0, completedToday: 1 },
        });
      }
      throw new Error('Unexpected API path');
    });
    await page.goto(origin);
    const radios = page.getByRole('radio');
    await radios.first().waitFor();
    async function checkOrder() {
      assert.deepEqual(await radios.evaluateAll((nodes) => nodes.map((n) => n.value)), options);
    }
    await checkOrder();
    await radios.first().focus();
    assert.equal(await page.locator('input:checked').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Submit answer' }).isDisabled(), true);
    await page.reload();
    await radios.first().waitFor();
    await checkOrder();
    assert.equal(await page.locator('input:checked').count(), 0);
    await page.getByRole('radio', { name: '你好', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await page.getByRole('alert').waitFor();
    await checkOrder(); // state/error rerender must not shuffle
    assert.equal(await page.getByRole('radio', { name: '你好', exact: true }).isChecked(), true);
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await page.getByRole('heading', { name: 'Result', exact: true }).waitFor();
    assert.equal(answers.length, 2);
    assert.equal(answers[0].answer, '你好');
    assert.equal(answers[1].answer, '你好');
    assert.equal(answers[0].submissionToken, answers[1].submissionToken);
    assert.deepEqual(errors, []);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, 'mcq-browser-results.json'),
      JSON.stringify(
        {
          scope: 'M16 Chromium + actual React; synthetic API, no database',
          status: 'PASS',
          checks: [
            'order on load',
            'focus does not select',
            'reload order',
            'error rerender order',
            'keyboard value submission',
            'same-token retry',
          ],
        },
        null,
        2,
      ),
    );
    console.log('M16 browser PASS (6 checks; synthetic API)');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
