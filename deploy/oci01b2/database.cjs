'use strict';
// Mac host Node22+. Never starts/stops containers, resets schema, or selects a remote DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const MAGIC = Buffer.from('CLPBACKUP1');
const LIMIT = 64 * 1024 * 1024;
function keyFrom(value) {
  if (!/^[a-fA-F0-9]{64}$/.test(value || '')) throw Error('BACKUP_KEY_REQUIRED');
  return Buffer.from(value, 'hex');
}
function seal(payload, key) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}
function unseal(bytes, key) {
  if (bytes.length < 39 || bytes.length > LIMIT * 1.5 || !bytes.subarray(0, 10).equals(MAGIC))
    throw Error('INVALID_BACKUP');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(10, 22));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(bytes.subarray(22, 38));
  return JSON.parse(
    Buffer.concat([decipher.update(bytes.subarray(38)), decipher.final()]).toString('utf8'),
  );
}
function outside(file) {
  if (!path.isAbsolute(file || '')) throw Error('ABSOLUTE_PRIVATE_PATH_REQUIRED');
  const resolved = path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (
    !relative ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  )
    throw Error('BACKUP_MUST_BE_OUTSIDE_SOURCE');
  for (let dir = path.dirname(resolved); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) throw Error('NO_BACKUPS_IN_GIT');
    if (path.dirname(dir) === dir) break;
  }
  return resolved;
}
function argsFor(profile) {
  const base = ['--context', 'colima-clp-arm64', 'compose', '--env-file', '/dev/null'];
  if (profile === 'local-trial')
    return [
      ...base,
      '-p',
      'clp-local-trial',
      '-f',
      path.join(__dirname, 'compose.yaml'),
      '-f',
      path.join(__dirname, 'compose.local-trial.yaml'),
    ];
  if (profile === 'restore')
    return [...base, '-p', 'clp-restore-check', '-f', path.join(__dirname, 'compose.restore.yaml')];
  throw Error('UNKNOWN_OPERATION_PROFILE');
}
function docker(profile, args, input) {
  const r = spawnSync('docker', [...argsFor(profile), ...args], {
    cwd: root,
    input,
    maxBuffer: LIMIT,
    windowsHide: true,
  });
  if (r.status !== 0) throw Error('DATABASE_TOOL_FAILED'); // never echo SQL, credentials or dump
  return r.stdout;
}
function sql(profile, query) {
  return JSON.parse(
    docker(profile, [
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      'PGPASSWORD=${POSTGRES_PASSWORD} exec psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"',
      'clp',
      query,
    ])
      .toString()
      .trim(),
  );
}
function identify(profile) {
  const r = sql(
    profile,
    "SELECT json_build_object('database',current_database(),'role',current_user,'major',current_setting('server_version_num')::int/10000,'tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'))",
  );
  const name = profile === 'local-trial' ? 'clp_local_trial' : 'clp_restore_check';
  if (r.database !== name || r.role !== name || r.major !== 17) throw Error('TARGET_MISMATCH');
  return r;
}
const BASE_TABLES = [
  '_prisma_migrations',
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
];
function tablesFor(version) {
  if (version === 10) return BASE_TABLES;
  if (version === 11) return [...BASE_TABLES, 'course_applications'];
  throw Error('UNSUPPORTED_SCHEMA_VERSION');
}
function expectedVersion() {
  const value = process.env.CLP_EXPECTED_MIGRATIONS || '10';
  if (!['10', '11'].includes(value)) throw Error('UNSUPPORTED_SCHEMA_VERSION');
  return Number(value);
}
function counts(profile, version = expectedVersion()) {
  const pairs = tablesFor(version)
    .map((t) => `'${t}',(SELECT count(*) FROM public."${t}")`)
    .join(',');
  return sql(profile, 'SELECT json_build_object(' + pairs + ')');
}
function main(mode, file) {
  if (mode === 'fingerprint') {
    if (process.env.CLP_OPERATION_CONFIRMATION !== 'MAC_LOCAL_TRIAL_ONLY')
      throw Error('OPERATOR_CONFIRMATION_REQUIRED');
    identify('local-trial');
    const rows = counts('local-trial');
    const ledger = sql(
      'local-trial',
      'SELECT json_agg(json_build_array(id,checksum,started_at,finished_at,rolled_back_at) ORDER BY id) FROM public._prisma_migrations',
    );
    if (Number(rows._prisma_migrations) !== expectedVersion()) throw Error('UNEXPECTED_MIGRATIONS');
    console.log(
      JSON.stringify(
        {
          database: 'clp_local_trial',
          counts: rows,
          ledgerFingerprint: crypto
            .createHash('sha256')
            .update(JSON.stringify(ledger))
            .digest('hex'),
        },
        null,
        2,
      ),
    );
    return;
  }
  const key = keyFrom(process.env.CLP_BACKUP_KEY);
  const target = outside(file);
  if (!['backup', 'restore-check', 'inspect'].includes(mode)) throw Error('UNKNOWN_OPERATION');
  let payload;
  if (mode !== 'backup') {
    if (fs.statSync(target).size > LIMIT * 1.5) throw Error('BACKUP_TOO_LARGE');
    payload = unseal(fs.readFileSync(target), key); // authenticate BEFORE any DB request
    if (
      payload.baseline !== '8fc28d3a45539c2de5ddb14b94c3a4f9127e0194' ||
      payload.source !== 'clp_local_trial' ||
      ![10, 11].includes(payload.schemaVersion) ||
      !payload.counts ||
      Object.keys(payload.counts).length !== tablesFor(payload.schemaVersion).length ||
      tablesFor(payload.schemaVersion).some(
        (table) =>
          !Number.isSafeInteger(Number(payload.counts[table])) || Number(payload.counts[table]) < 0,
      ) ||
      Number(payload.counts._prisma_migrations) !== payload.schemaVersion ||
      typeof payload.dump !== 'string'
    )
      throw Error('UNSUPPORTED_BACKUP');
    if (mode === 'inspect') {
      console.log(
        JSON.stringify(
          { source: payload.source, created: payload.created, counts: payload.counts },
          null,
          2,
        ),
      );
      return;
    }
  }
  if (process.env.CLP_OPERATION_CONFIRMATION !== 'MAC_LOCAL_TRIAL_ONLY')
    throw Error('OPERATOR_CONFIRMATION_REQUIRED');
  if (mode === 'backup') {
    if (fs.existsSync(target)) throw Error('REFUSE_BACKUP_OVERWRITE');
    const running = docker('local-trial', ['ps', '--status', 'running', '--services'])
      .toString()
      .trim()
      .split(/\s+/);
    if (
      !running.includes('db') ||
      running.includes('api') ||
      running.includes('web') ||
      running.includes('migrate')
    )
      throw Error('QUIESCE_TRIAL_WRITERS_FIRST');
    identify('local-trial');
    const rows = counts('local-trial');
    if (Number(rows._prisma_migrations) !== expectedVersion()) throw Error('UNEXPECTED_MIGRATIONS');
    const incomplete = sql(
      'local-trial',
      'SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL',
    );
    if (Number(incomplete) !== 0) throw Error('INCOMPLETE_MIGRATION');
    const dump = docker('local-trial', [
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      'PGPASSWORD=${POSTGRES_PASSWORD} exec pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges',
    ]);
    if (dump.length > LIMIT || dump.subarray(0, 5).toString() !== 'PGDMP')
      throw Error('INVALID_DUMP');
    payload = {
      baseline: '8fc28d3a45539c2de5ddb14b94c3a4f9127e0194',
      source: 'clp_local_trial',
      schemaVersion: expectedVersion(),
      created: new Date().toISOString(),
      counts: rows,
      dump: dump.toString('base64'),
    };
    const bytes = seal(payload, key);
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({
        status: 'BACKUP_CREATED',
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      }),
    );
  } else {
    const dump = Buffer.from(payload.dump, 'base64');
    if (dump.length > LIMIT || dump.subarray(0, 5).toString() !== 'PGDMP')
      throw Error('INVALID_DUMP');
    if (identify('restore').tables !== 0) throw Error('RESTORE_TARGET_NOT_EMPTY');
    docker(
      'restore',
      [
        'exec',
        '-T',
        'db',
        'sh',
        '-c',
        'PGPASSWORD=${POSTGRES_PASSWORD} exec pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --exit-on-error --no-owner --no-privileges',
      ],
      dump,
    );
    const actual = counts('restore', payload.schemaVersion);
    if (
      tablesFor(payload.schemaVersion).some((t) => String(actual[t]) !== String(payload.counts[t]))
    )
      throw Error('RESTORE_COUNTS_DIFFER');
    console.log(
      `RESTORE_CHECK_PASS: ${tablesFor(payload.schemaVersion).length} table counts match; ${payload.schemaVersion} migration rows retained. Target left intact.`,
    );
  }
}
if (require.main === module) {
  try {
    main(process.argv[2], process.argv[3]);
  } catch {
    console.error(
      'DATABASE_OPERATION_FAILED: preserve all data and inspect configuration; nothing reset or overwritten.',
    );
    process.exitCode = 1;
  }
}
module.exports = { seal, unseal, keyFrom, argsFor, outside, tablesFor, expectedVersion };
