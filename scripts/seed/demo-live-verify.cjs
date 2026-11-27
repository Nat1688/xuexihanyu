#!/usr/bin/env node
'use strict';
// Owner-approved DS-01 contract: PostgreSQL evidence, no memory simulation.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { assertDemoTarget } = require('./db-seed-demo.cjs');
const decision = assertDemoTarget(process.env.DEMO_DATABASE_URL, process.env.DEMO_SEED_CONFIRM);
if (!decision.allowed) {
  console.error('[demo-verify] explicit disposable target required. No tests run.');
  process.exitCode = 1;
} else {
  const root = path.resolve(__dirname, '../..');
  const jest = require.resolve('jest/bin/jest');
  const result = spawnSync(
    process.execPath,
    [
      jest,
      '--config',
      'jest.integration.config.cjs',
      '--runInBand',
      '--runTestsByPath',
      'test/db/demo-seed.int-spec.ts',
    ],
    {
      cwd: path.join(root, 'apps/api'),
      stdio: 'inherit',
      env: process.env,
    },
  );
  process.exitCode = result.status ?? 1;
}
