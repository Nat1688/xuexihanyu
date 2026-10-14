/**
 * Jest config for the CLP API LIVE-DATABASE integration suite (CLP-00-05).
 *
 * Runs ONLY the `*.int-spec.ts` specs that connect to the isolated test database
 * (`TEST_DATABASE_URL` = clp_test). Kept separate from the default config so
 * `npm test` never requires a running PostgreSQL.
 *
 * Specs are expected to SKIP themselves (not fail) when the test database is
 * unavailable — see `test/db/identity-persistence.int-spec.ts`.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/test/support/'],
  // Live DB tests share one database; run serially to avoid cross-test contention.
  maxWorkers: 1,
};
