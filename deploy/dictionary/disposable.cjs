'use strict';
// DICT02–04 Windows acceptance. NEW owned cluster only; never resumes/resets any DB.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  net = require('node:net'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const bin = 'C:/Program Files/PostgreSQL/17/bin';
const runId = process.env.DICT_RUN_ID;
assert.match(runId || '', /^[a-z0-9-]{3,40}$/);
assert.equal(process.env.DICT_DISPOSABLE_APPROVAL, 'APPROVED_55441_3116_5206');
assert.equal(process.platform, 'win32');
const owned = path.join(
    process.env.SEC01_TEMP_ROOT || path.join(root, '.core-demo'),
    'dict02-' + runId,
  ),
  data = path.join(owned, 'data');
assert.ok(!fs.existsSync(owned), 'NEW_DIRECTORY_REQUIRED');
assert.ok(!fs.existsSync(path.join(root, '.env')), 'ENV_FREE_WORKTREE_REQUIRED');
const dbPassword = crypto.randomBytes(32).toString('hex'),
  accountPassword = crypto.randomBytes(32).toString('hex');
const url = `postgresql://clp_dict_test:${dbPassword}@127.0.0.1:55441/clp_dict_test?schema=public&connection_limit=5`;
let prisma,
  app,
  vite,
  browser,
  started = false,
  stage = 'preflight';
const results = [];
const command = (file, args, options = {}) => {
  const p = cp.spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (p.status !== 0) throw new Error('DISPOSABLE_COMMAND_FAILED');
  return (p.stdout || '').trim();
};
const step = async (name, fn) => {
  stage = name;
  const start = performance.now();
  await fn();
  results.push({ name, status: 'PASS', milliseconds: Math.round(performance.now() - start) });
  console.log('DICT PASS: ' + name);
};
async function free(port) {
  await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  for (const port of [55441, 3116, 5206]) await free(port);
  assert.match(command(path.join(bin, 'postgres.exe'), ['--version']), /17\.11/);
  fs.mkdirSync(owned, { recursive: true });
  const sid = command('powershell.exe', [
    '-NoProfile',
    '-Command',
    '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  ]);
  command('icacls.exe', [owned, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]);
  const pwfile = path.join(owned, 'init-password.tmp');
  fs.writeFileSync(pwfile, dbPassword + '\n', { flag: 'wx', mode: 0o600 });
  try {
    command(path.join(bin, 'initdb.exe'), [
      '-D',
      data,
      '-U',
      'clp_dict_test',
      '--encoding=UTF8',
      '--locale=C',
      '--auth-host=scram-sha-256',
      '--auth-local=scram-sha-256',
      '--pwfile=' + pwfile,
    ]);
  } finally {
    fs.unlinkSync(pwfile);
  }
  command(
    path.join(bin, 'pg_ctl.exe'),
    [
      '-D',
      data,
      '-l',
      path.join(owned, 'postgres.log'),
      '-o',
      '-h 127.0.0.1 -p 55441',
      '-w',
      'start',
    ],
    { stdio: 'ignore' },
  );
  started = true;
  command(
    path.join(bin, 'createdb.exe'),
    ['-h', '127.0.0.1', '-p', '55441', '-U', 'clp_dict_test', 'clp_dict_test'],
    { env: { ...process.env, PGPASSWORD: dbPassword } },
  );
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  await step('approved new PostgreSQL17 identity and empty schema', async () => {
    const [identity] =
      await prisma.$queryRaw`SELECT current_database() AS name,current_user AS role,current_setting('data_directory') AS directory,current_setting('server_version_num')::int/10000 AS major,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables`;
    assert.equal(identity.name, 'clp_dict_test');
    assert.equal(identity.role, 'clp_dict_test');
    assert.equal(identity.major, 17);
    assert.equal(identity.tables, 0);
    assert.equal(path.resolve(identity.directory).toLowerCase(), path.resolve(data).toLowerCase());
  });
  const baseline = path.join(owned, 'baseline-prisma');
  fs.mkdirSync(path.join(baseline, 'migrations'), { recursive: true });
  fs.writeFileSync(
    path.join(baseline, 'schema.prisma'),
    command('git', ['show', 'b191d162c4f965d9abf9a3a89a62cf373e9188d7:prisma/schema.prisma']),
  );
  for (const name of fs.readdirSync(path.join(root, 'prisma/migrations'))) {
    if (name === '20261126040000_dictionary_foundation') continue;
    fs.cpSync(path.join(root, 'prisma/migrations', name), path.join(baseline, 'migrations', name), {
      recursive: true,
      errorOnExist: true,
    });
  }
  await step('eleven baseline migrations on a new empty PostgreSQL17', async () => {
    command(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--schema',
        path.join(baseline, 'schema.prisma'),
      ],
      { env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: '1' } },
    );
    const [ledger] =
      await prisma.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    assert.equal(ledger.count, 11);
  });
  const {
    ScryptPasswordHasher,
  } = require('../../apps/api/dist/src/modules/identity/infrastructure/scrypt-password-hasher.js');
  const hashed = await new ScryptPasswordHasher().hash(accountPassword);
  const users = {};
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT'])
    users[role] = await prisma.user.create({
      data: {
        login: `dict-${role.toLowerCase()}@example.invalid`,
        loginNormalized: `dict-${role.toLowerCase()}@example.invalid`,
        state: 'ACTIVE',
        credential: {
          create: {
            algorithm: hashed.algorithm,
            parameters: hashed.parameters,
            hash: hashed.hash,
            passwordChangedAt: new Date(),
          },
        },
        roles: { create: { role } },
      },
    });
  await prisma.session.create({
    data: {
      userId: users.STUDENT.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      csrfHash: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const oldTables = [
    'users',
    'password_credentials',
    'user_roles',
    'sessions',
    'courses',
    'units',
    'lessons',
    'learning_items',
    'lesson_learning_items',
    'learning_events',
    'mastery_projections',
    'exercise_sessions',
    'answer_submissions',
    'teaching_classes',
    'class_invitations',
    'class_enrollments',
    'lesson_assignments',
    'teacher_notes',
    'course_applications',
  ];
  async function oldFingerprint() {
    const result = {};
    for (const name of oldTables) {
      result[name] = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${name}" t`,
      );
    }
    return result;
  }
  const original = await oldFingerprint();
  await step(
    'additive migration12 preserves populated identity/credential/role/session and all19 prior tables',
    async () => {
      command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: '1' },
      });
      assert.deepEqual(await oldFingerprint(), original);
      const [ledger] =
        await prisma.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      assert.equal(ledger.count, 12);
      const [tables] =
        await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'dictionary_%'`;
      assert.equal(tables.count, 12);
    },
  );
  const {
    DictionaryRepository,
  } = require('../../apps/api/dist/src/modules/dictionary/repository.js');
  const { parseImport } = require('../../apps/api/dist/src/modules/dictionary/domain.js');
  const repo = new DictionaryRepository(prisma);
  const source = fs.readFileSync(process.env.DICT_SOURCE_FILE);
  assert.equal(
    crypto.createHash('sha256').update(source).digest('hex'),
    '519a001dbce642aed261f67fb147a16f33fe6d0fea4ec20a67ad1ca74e2912ed',
  );
  const document = parseImport(source, 'html');
  const beforeLearning = async () => {
    const [value] =
      await prisma.$queryRaw`SELECT (SELECT count(*)::int FROM exercise_sessions) AS sessions,(SELECT count(*)::int FROM answer_submissions) AS submissions,(SELECT count(*)::int FROM learning_events) AS events,(SELECT count(*)::int FROM mastery_projections) AS mastery`;
    return value;
  };
  const learning = await beforeLearning();
  await step('actual corpus parse and canonical reconciliation', async () => {
    assert.equal(document.summary.validRows, 32573);
    assert.equal(document.summary.canonicalDuplicates, 10);
    assert.equal(document.summary.candidateSenses, 32563);
    assert.equal(document.summary.candidateHeadwords, 23266);
  });
  let receipt;
  await step('real corpus atomic import and retained provenance', async () => {
    receipt = await repo.import(
      document,
      'Tu_dien_tieng_Trung_chuyen_nganh_v4.html',
      users.ADMIN.id,
    );
    assert.equal(receipt.insertedHeadwords, 23266);
    assert.equal(receipt.insertedSenses, 32563);
    assert.equal(receipt.sourceAssociations, 33497);
    const [counts] =
      await prisma.$queryRaw`SELECT (SELECT count(*)::int FROM dictionary_import_items) AS input,(SELECT count(*)::int FROM dictionary_sources) AS sources,(SELECT count(*)::int FROM dictionary_source_categories) AS categories,(SELECT count(*)::int FROM dictionary_sense_origins) AS origins`;
    assert.deepEqual(counts, { input: 32573, sources: 13, categories: 15, origins: 33497 });
  });
  await step('repeat and competing imports replay without duplicates', async () => {
    const repeats = await Promise.all([
      repo.import(document, 'same.html', users.ADMIN.id),
      repo.import(document, 'same.html', users.ADMIN.id),
    ]);
    assert.ok(repeats.every((r) => r.replay));
    const [count] =
      await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_import_batches`;
    assert.equal(count.count, 1);
  });
  const makeDocument = (word) =>
    parseImport(
      Buffer.from(
        JSON.stringify({
          cats: ['Synthetic review'],
          sources: ['https://example.invalid/dictionary'],
          entries: [[word, 'hétóng', 'contract', 'hợp đồng', [0]]],
        }),
      ),
      'json',
    );
  await step('injected canonical and provenance failure roll back all tables', async () => {
    const fingerprint = async () =>
      prisma.$queryRaw`SELECT (SELECT count(*)::int FROM dictionary_entries) AS entries,(SELECT count(*)::int FROM dictionary_import_batches) AS batches,(SELECT count(*)::int FROM dictionary_import_items) AS items,(SELECT count(*)::int FROM dictionary_sense_origins) AS origins,(SELECT count(*)::int FROM dictionary_sources) AS sources`;
    const before = await fingerprint();
    for (const point of ['canonical', 'provenance']) {
      await assert.rejects(
        repo.import(makeDocument('合成测试' + point), 'synthetic.json', users.ADMIN.id, point),
      );
      assert.deepEqual(await fingerprint(), before);
    }
  });
  await step('dictionary history constraints and concurrent taxonomy cycle rejection', async () => {
    await assert.rejects(prisma.$executeRaw`UPDATE dictionary_audit_events SET action='FORGED'`);
    await assert.rejects(prisma.$executeRaw`DELETE FROM dictionary_entry_revisions`);
    const a = crypto.randomUUID(),
      b = crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO dictionary_categories(id,public_id,slug,label,updated_at) VALUES(${a}::uuid,${crypto.randomUUID()}::uuid,'test-cycle-a','Synthetic cycle A',NOW()),(${b}::uuid,${crypto.randomUUID()}::uuid,'test-cycle-b','Synthetic cycle B',NOW())`;
    const moves = await Promise.allSettled([
      prisma.$executeRaw`UPDATE dictionary_categories SET parent_id=${b}::uuid WHERE id=${a}::uuid`,
      prisma.$executeRaw`UPDATE dictionary_categories SET parent_id=${a}::uuid WHERE id=${b}::uuid`,
    ]);
    assert.equal(moves.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(moves.filter((x) => x.status === 'rejected').length, 1);
    assert.deepEqual(await oldFingerprint(), original);
  });
  const normal = { q: '合同', sort: 'relevance', limit: 20 };
  await step(
    'internal actual-data search, alternatives, paginated taxonomy and publication gate',
    async () => {
      const internal = await repo.search(normal, true);
      assert.ok(internal.total > 0);
      assert.equal(internal.items[0].chinese, '合同');
      for (const q of ['hétóng', 'hetong', 'he tong', 'Hợp đồng', 'hop dong', 'contract'])
        assert.ok((await repo.search({ ...normal, q }, true)).total > 0, q);
      assert.equal((await repo.search(normal, false)).total, 0);
      assert.deepEqual(await repo.categories(false), []);
      const cats = await repo.categories(true);
      assert.equal(cats.filter((c) => !c.parentId).length, 6);
      const first = await repo.search({ ...normal, q: '', limit: 5 }, true),
        second = await repo.search({ ...normal, q: '', limit: 5, cursor: first.nextCursor }, true);
      assert.equal(new Set([...first.items, ...second.items].map((e) => e.publicId)).size, 10);
    },
  );
  // Only this independently created synthetic source is marked rights-confirmed for learner HTTP/browser tests.
  const synthetic = parseImport(
    Buffer.from(
      JSON.stringify({
        cats: ['Synthetic review'],
        sources: ['https://example.invalid/dictionary'],
        entries: [['合成示例', 'héchéng shìlì', 'synthetic example', 'ví dụ tổng hợp', [0]]],
      }),
    ),
    'json',
  );
  await repo.import(synthetic, 'synthetic-approved-test.json', users.ADMIN.id);
  await prisma.$executeRaw`UPDATE dictionary_sources SET rights='CONFIRMED',rights_evidence='Synthetic test content authored for isolated verification',updated_at=NOW() WHERE url='https://example.invalid/dictionary'`;
  await prisma.$executeRaw`UPDATE dictionary_entries SET verification='VERIFIED',publication='PUBLISHED',updated_at=NOW() WHERE chinese='合成示例'`;
  Object.assign(process.env, {
    DATABASE_URL: url,
    NODE_ENV: 'test',
    API_PORT: '3116',
    SPA_ORIGIN: 'http://127.0.0.1:5206',
    POSTGRES_HOST: '127.0.0.1',
    POSTGRES_PORT: '55441',
    POSTGRES_DB: 'clp_dict_test',
    POSTGRES_USER: 'clp_dict_test',
    POSTGRES_PASSWORD: dbPassword,
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
    origin: ['http://127.0.0.1:5206'],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-CSRF-Token',
      'X-Dictionary-Format',
      'X-Dictionary-Filename',
      'X-Dictionary-Confirm',
    ],
  });
  await app.listen(3116, '127.0.0.1');
  const api = 'http://127.0.0.1:3116';
  async function login(role) {
    const response = await fetch(api + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5206' },
      body: JSON.stringify({ login: users[role].login, password: accountPassword }),
    });
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie().map((c) => c.split(';')[0]);
    return {
      Cookie: cookies.join('; '),
      'X-CSRF-Token': decodeURIComponent(cookies.find((c) => c.startsWith('clp_csrf=')).slice(9)),
    };
  }
  await step(
    'combined category/type filters and normalized Pinyin ordering across cursor pages',
    async () => {
      const cats = await repo.categories(true);
      const leaf = cats.find((c) => c.parentId);
      assert.ok(leaf);
      const scoped = await repo.search(
        { q: '', sort: 'pinyin', limit: 5, categoryId: leaf.publicId, type: 'UNCLASSIFIED' },
        true,
      );
      assert.ok(scoped.total > 0);
      assert.ok(scoped.items.every((e) => e.type === 'UNCLASSIFIED'));
      const { compact } = require('../../apps/api/dist/src/modules/dictionary/domain.js');
      const keys = scoped.items.map((e) => compact(e.pinyin));
      assert.deepEqual(keys, [...keys].sort());
      if (scoped.nextCursor) {
        const next = await repo.search(
          {
            q: '',
            sort: 'pinyin',
            limit: 5,
            categoryId: leaf.publicId,
            type: 'UNCLASSIFIED',
            cursor: scoped.nextCursor,
          },
          true,
        );
        assert.equal(
          new Set([...scoped.items, ...next.items].map((e) => e.publicId)).size,
          scoped.items.length + next.items.length,
        );
      }
      assert.equal(
        (
          await repo.search(
            { q: '', sort: 'chinese', limit: 5, categoryId: leaf.publicId, type: 'WORD' },
            true,
          )
        ).total,
        0,
      );
      await assert.rejects(
        repo.search({ q: 'different', sort: 'pinyin', limit: 5, cursor: scoped.nextCursor }, true),
      );
    },
  );
  await step(
    'new imports cannot append unreviewed meanings/sources to reviewed published content',
    async () => {
      const before = await repo.search({ q: '合成示例', sort: 'relevance', limit: 20 }, false);
      const detail = await repo.detail(before.items[0].publicId, false);
      const pending = parseImport(
        Buffer.from(
          JSON.stringify({
            cats: ['Đề xuất chưa duyệt'],
            sources: ['https://example.invalid/unreviewed-source'],
            entries: [
              ['合成示例', 'héchéng shìlì', 'UNREVIEWED_ALTERNATIVE', 'Nghĩa chưa được duyệt', [0]],
            ],
          }),
        ),
        'json',
      );
      const imported = await repo.import(pending, 'pending-review.json', users.ADMIN.id);
      assert.equal(imported.insertedSenses, 0);
      assert.equal(imported.reviewRequiredRows, 1);
      assert.equal(imported.retainedSourceAssociations, 1);
      const after = await repo.detail(before.items[0].publicId, false);
      assert.deepEqual(after, detail);
      const afterSearch = await repo.search({ q: '合成示例', sort: 'relevance', limit: 20 }, false);
      assert.equal(afterSearch.catalogRevision, before.catalogRevision);
      assert.equal(
        (await repo.search({ q: 'UNREVIEWED_ALTERNATIVE', sort: 'relevance', limit: 20 }, false))
          .total,
        0,
      );
      const queue = await repo.batch(imported.batchId);
      assert.equal(queue.issues[0].outcome, 'REVIEW_REQUIRED');
      assert.equal(queue.issues[0].raw.sources[0].url, 'https://example.invalid/unreviewed-source');
    },
  );
  const admin = await login('ADMIN'),
    student = await login('STUDENT'),
    teacher = await login('TEACHER');
  await step(
    'real HTTP authentication/RBAC/CSRF and unchanged denied-request DB state',
    async () => {
      assert.equal((await fetch(api + '/dictionary/entries')).status, 401);
      for (const headers of [student, teacher])
        assert.equal((await fetch(api + '/dictionary/admin/entries', { headers })).status, 403);
      const response = await fetch(api + '/dictionary/entries', { headers: student });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const entries = await response.json();
      assert.equal(entries.total, 1);
      const id = entries.items[0].publicId;
      const [counts] =
        await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_entry_reports`;
      for (const token of ['', 'forged']) {
        const result = await fetch(api + `/dictionary/entries/${id}/reports`, {
          method: 'POST',
          headers: { ...student, 'X-CSRF-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: 1, comment: 'Synthetic report' }),
        });
        assert.equal(result.status, 403);
      }
      const [after] =
        await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_entry_reports`;
      assert.deepEqual(after, counts);
      const result = await fetch(api + `/dictionary/entries/${id}/reports`, {
        method: 'POST',
        headers: { ...student, 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, comment: 'Đề nghị kiểm tra bản dịch.' }),
      });
      assert.equal(result.status, 201);
      const [internal] =
        await prisma.$queryRaw`SELECT public_id::text AS id FROM dictionary_entries WHERE chinese='合同' LIMIT 1`;
      assert.equal(
        (await fetch(api + '/dictionary/entries/' + internal.id, { headers: student })).status,
        404,
      );
      const before =
        await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_import_batches`;
      const dry = await fetch(api + '/dictionary/admin/imports/dry-run', {
        method: 'POST',
        headers: {
          ...admin,
          'Content-Type': 'application/octet-stream',
          'X-Dictionary-Format': 'json',
          'X-Dictionary-Filename': 'synthetic.json',
        },
        body: Buffer.from(
          JSON.stringify({
            cats: ['Test'],
            sources: ['https://example.invalid/dry-run'],
            entries: [['测试', 'cèshì', '', 'kiểm thử', [0]]],
          }),
        ),
      });
      assert.equal(dry.status, 200);
      assert.equal((await dry.json()).dictionaryWrites, 0);
      assert.deepEqual(
        await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_import_batches`,
        before,
      );
    },
  );
  await step(
    'real HTTP multilingual search, literal input, rights revocation and idempotent file upload',
    async () => {
      const query = async (q) => {
        const response = await fetch(api + '/dictionary/entries?q=' + encodeURIComponent(q), {
          headers: student,
        });
        assert.equal(response.status, 200);
        return response.json();
      };
      const baseline = await query('合成示例');
      const entryId = baseline.items[0].publicId;
      for (const q of [
        'héchéng shìlì',
        'hechengshili',
        'he cheng shi li',
        'ví dụ tổng hợp',
        'vi du tong hop',
        'synthetic example',
      ]) {
        const result = await query(q);
        assert.equal(result.total, 1);
        assert.equal(result.items[0].publicId, entryId);
      }
      assert.equal((await query("%' OR 1=1--")).total, 0);
      await prisma.$executeRaw`UPDATE dictionary_sources SET rights='DENIED',updated_at=NOW() WHERE url='https://example.invalid/dictionary'`;
      assert.equal((await query('合成示例')).total, 0);
      assert.equal(
        (await fetch(api + '/dictionary/entries/' + entryId, { headers: student })).status,
        404,
      );
      assert.deepEqual(
        await (await fetch(api + '/dictionary/categories', { headers: student })).json(),
        [],
      );
      await prisma.$executeRaw`UPDATE dictionary_sources SET rights='CONFIRMED',updated_at=NOW() WHERE url='https://example.invalid/dictionary'`;
      for (const token of ['', 'forged']) {
        const denied = await fetch(api + '/dictionary/admin/imports', {
          method: 'POST',
          headers: {
            ...admin,
            'X-CSRF-Token': token,
            'Content-Type': 'application/octet-stream',
            'X-Dictionary-Format': 'html',
            'X-Dictionary-Filename': 'source.html',
            'X-Dictionary-Confirm': 'IMPORT_INTERNAL_UNVERIFIED',
          },
          body: source,
        });
        assert.equal(denied.status, 403);
      }
      const upload = await fetch(api + '/dictionary/admin/imports', {
        method: 'POST',
        headers: {
          ...admin,
          'Content-Type': 'application/octet-stream',
          'X-Dictionary-Format': 'html',
          'X-Dictionary-Filename': 'source.html',
          'X-Dictionary-Confirm': 'IMPORT_INTERNAL_UNVERIFIED',
        },
        body: source,
      });
      assert.equal(upload.status, 201);
      assert.equal((await upload.json()).replay, true);
    },
  );
  await step('real dataset five-client search benchmark and actual planner evidence', async () => {
    command(process.execPath, ['deploy/dictionary/benchmark.cjs'], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        DICT_BENCHMARK_OUTPUT: path.join(owned, 'benchmark-real.json'),
      },
    });
  });
  await step(
    'real API/browser dictionary at desktop/tablet/mobile, roles and import notices',
    async () => {
      vite = cp.spawn(
        process.execPath,
        [
          path.join(root, 'node_modules/vite/bin/vite.js'),
          '--host',
          '127.0.0.1',
          '--port',
          '5206',
          '--strictPort',
        ],
        {
          cwd: path.join(root, 'apps/web'),
          windowsHide: true,
          stdio: 'ignore',
          env: { ...process.env, VITE_API_BASE_URL: api },
        },
      );
      // Explicit loopback development CORS; production build uses the existing single-origin /api reverse proxy.
      for (let i = 0; i < 40; i++) {
        try {
          const response = await fetch('http://127.0.0.1:5206');
          if (response.ok) break;
        } catch {}
        await pause(250);
      }
      const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      for (const role of ['ADMIN', 'STUDENT']) {
        const context = await browser.newContext({ locale: 'en-US' });
        await context.addCookies(
          Object.entries(role === 'ADMIN' ? admin : student)
            .filter(([k]) => k === 'Cookie')
            .flatMap(([, v]) =>
              v.split('; ').map((c) => {
                const at = c.indexOf('=');
                return {
                  name: c.slice(0, at),
                  value: c.slice(at + 1),
                  url: 'http://127.0.0.1:5206',
                };
              }),
            ),
        );
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.name));
        await page.goto('http://127.0.0.1:5206');
        await page
          .getByRole('navigation', {
            name: role === 'ADMIN' ? 'Điều hướng giáo viên' : 'Điều hướng học viên',
          })
          .getByRole('button', {
            name: role === 'ADMIN' ? 'Quản lý từ điển' : 'Từ điển',
            exact: true,
          })
          .click();
        await page
          .getByRole('heading', {
            name: role === 'ADMIN' ? 'Quản lý từ điển' : 'Từ điển tiếng Trung',
            exact: true,
          })
          .waitFor();
        if (role === 'ADMIN') {
          await page.getByLabel('Tìm kiếm', { exact: true }).fill('合同');
          await page.getByRole('heading', { name: '合同', exact: true }).first().waitFor();
        } else {
          await page.getByRole('heading', { name: '合成示例', exact: true }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Nhập dữ liệu nội bộ', exact: true }).count(),
            0,
          );
        }
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({
            path: path.join(owned, `dictionary-${role.toLowerCase()}-${width}.png`),
            fullPage: true,
          });
        }
        await page
          .getByRole('button', { name: /^Xem chi tiết/ })
          .first()
          .click();
        await page.getByRole('heading', { name: 'Nguồn dữ liệu', exact: true }).waitFor();
        await page.getByRole('button', { name: '← Về kết quả tra cứu', exact: true }).click();
        assert.deepEqual(errors, []);
        await context.close();
      }
    },
  );
  await step(
    '100000-headword synthetic scale fixture benchmark, separate from real corpus',
    async () => {
      const [before] =
        await prisma.$queryRaw`SELECT count(*)::int AS count FROM dictionary_entries`;
      const needed = 100000 - before.count;
      await prisma.$executeRaw`INSERT INTO dictionary_entries(id,public_id,chinese,pinyin,identity_hash,pinyin_key,pinyin_compact,pinyin_alias,updated_at) SELECT gen_random_uuid(),gen_random_uuid(),'DICT-BENCH-'||i,'benchmark '||i,md5('synthetic-entry-'||i),'benchmark '||i,'benchmark'||i,'benchmark'||i,NOW() FROM generate_series(1,${needed}) i`;
      await prisma.$executeRaw`INSERT INTO dictionary_senses(id,public_id,entry_id,vietnamese,english,identity_hash,vietnamese_key,english_key,updated_at) SELECT gen_random_uuid(),gen_random_uuid(),id,'mục kiểm thử tổng hợp','synthetic benchmark',md5('synthetic-sense-'||chinese),'muc kiem thu tong hop','synthetic benchmark',NOW() FROM dictionary_entries WHERE chinese LIKE 'DICT-BENCH-%'`;
      await prisma.$executeRaw`ANALYZE dictionary_entries`;
      await prisma.$executeRaw`ANALYZE dictionary_senses`;
      command(process.execPath, ['deploy/dictionary/benchmark.cjs'], {
        env: {
          ...process.env,
          DATABASE_URL: url,
          DICT_BENCHMARK_OUTPUT: path.join(owned, 'benchmark-scale.json'),
        },
      });
    },
  );
  await require('./publication-acceptance.cjs')({
    root,
    prisma,
    repo,
    users,
    api,
    admin,
    student,
    teacher,
    browser,
    owned,
    step,
  });
  if (process.env.SEC01_ACCEPTANCE === 'RUN_ON_APPROVED_DISPOSABLE')
    await require('../security/credential-acceptance.cjs')({
      prisma,
      app,
      vite,
      browser,
      owned,
      api,
      step,
    });
  await step('dictionary never creates learning records', async () => {
    assert.deepEqual(await beforeLearning(), learning);
  });
  fs.writeFileSync(
    path.join(owned, 'report.json'),
    JSON.stringify(
      {
        status: 'PASS',
        disposableOnly: true,
        sourceChecksum: document.checksum,
        results,
        importReceipt: receipt,
        learningRecordsUnchanged: true,
        realCorpusPublished: false,
      },
      null,
      2,
    ),
  );
  console.log('EVIDENCE ' + owned);
}
main()
  .catch((error) => {
    if (error.name === 'AssertionError')
      console.error(
        'ASSERT_DIAGNOSTIC ' +
          JSON.stringify({
            message: error.message.slice(0, 200),
            actual: typeof error.actual === 'number' ? error.actual : typeof error.actual,
            expected: typeof error.expected === 'number' ? error.expected : typeof error.expected,
            location: (error.stack || '')
              .split('\n')
              .filter((x) => x.includes('publication-acceptance.cjs'))
              .map((x) => x.match(/:(\d+):(\d+)\)?$/)?.[0]),
          }),
      );
    console.error(
      'DICT FAILED ' +
        stage +
        ' ' +
        error.name +
        ' ' +
        (error.code || '') +
        ' ' +
        (error.meta?.code || ''),
    );
    if (fs.existsSync(owned))
      fs.writeFileSync(
        path.join(owned, 'failure.json'),
        JSON.stringify(
          { stage, errorClass: error.name, code: error.code, sqlState: error.meta?.code, results },
          null,
          2,
        ),
      );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (vite) vite.kill();
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (started)
      command(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', 'stop'], {
        stdio: 'ignore',
      });
  });
