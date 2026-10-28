'use strict';
const { spawn } = require('node:child_process');

function buildEnvironment(input, mode) {
  const invalid = () => {
    throw new Error('PACKAGING_CONFIGURATION_INVALID');
  };
  const profiles = {
    disposable: { database: 'clp_oci01b2', confirmation: 'OCI01B2_SYNTHETIC_ONLY' },
    'local-trial': { database: 'clp_local_trial', confirmation: 'MAC_LOCAL_TRIAL_SYNTHETIC_ONLY' },
  };
  const profile = Object.hasOwn(profiles, input.CLP_RUNTIME_PROFILE)
    ? profiles[input.CLP_RUNTIME_PROFILE]
    : null;
  if (
    !['api', 'migrate'].includes(mode) ||
    !profile ||
    input.CLP_TARGET_CONFIRMATION !== profile.confirmation
  )
    invalid();
  if (
    input.NODE_ENV !== 'production' ||
    input.POSTGRES_HOST !== 'db' ||
    input.POSTGRES_PORT !== '5432' ||
    input.POSTGRES_DB !== profile.database ||
    input.POSTGRES_USER !== profile.database
  )
    invalid();
  if (
    input.DATABASE_URL ||
    (input.LC03B_PREVIEW_ENABLED && input.LC03B_PREVIEW_ENABLED !== 'false')
  )
    invalid();
  for (const [key, min] of [
    ['POSTGRES_PASSWORD', 16],
    ['SESSION_SECRET', 32],
    ['CSRF_SECRET', 32],
  ]) {
    if (typeof input[key] !== 'string' || input[key].length < min || input[key].includes('\0'))
      invalid();
  }
  let origin;
  try {
    origin = new URL(input.SPA_ORIGIN);
  } catch {
    invalid();
  }
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    invalid();
  return {
    ...input,
    API_PORT: '3000',
    LC03B_PREVIEW_ENABLED: 'false',
    DATABASE_URL: `postgresql://${encodeURIComponent(input.POSTGRES_USER)}:${encodeURIComponent(input.POSTGRES_PASSWORD)}@db:5432/${profile.database}?schema=public&connection_limit=5`,
  };
}

async function run(mode) {
  const env = buildEnvironment(process.env, mode);
  if (mode === 'migrate') {
    // Read-only target check before any migration write. No datasource overrides.
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    try {
      const [target] =
        await db.$queryRaw`SELECT current_database() AS database, current_user AS role, current_setting('server_version_num')::int AS version`;
      if (
        target.database !== env.POSTGRES_DB ||
        target.role !== env.POSTGRES_USER ||
        Math.floor(target.version / 10000) !== 17
      )
        throw Error('TARGET_MISMATCH');
    } finally {
      await db.$disconnect();
    }
  }
  const args =
    mode === 'api'
      ? ['/app/apps/api/dist/src/main.js']
      : [
          '/app/node_modules/prisma/build/index.js',
          'migrate',
          'deploy',
          '--schema',
          '/app/prisma/schema.prisma',
        ];
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => {
    console.error('PACKAGING_CHILD_START_FAILED');
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143);
  });
}
if (require.main === module)
  run(process.argv[2]).catch(() => {
    console.error('PACKAGING_STARTUP_FAILED');
    process.exitCode = 1;
  });
module.exports = { buildEnvironment };
