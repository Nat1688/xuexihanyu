/**
 * Jest config for the CLP API workspace (CLP-00-08A).
 *
 * Test layout convention (see docs/Testing/TEST-HARNESS.md):
 *   - test/protected/*.spec.ts   unit tests over pure logic (no Nest, no DB)
 *   - test/protected/*.e2e-spec.ts  API/integration tests booting Nest (no DB)
 *   - test/support/*             shared harness (factories, lifecycle helper)
 *
 * The `protected/` directory keeps test files grouped; `testPathIgnorePatterns`
 * below ensures the `support/` harness (which is NOT a test file) is never
 * collected as a suite.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // Default suite: unit + API/integration (no live DB). Live-database
  // integration specs use the `*.int-spec.ts` suffix and run via the separate
  // `jest.integration.config.cjs` (`npm run test:integration`), so the default
  // `npm test` never requires a running PostgreSQL.
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/test/support/', '\\.int-spec\\.ts$'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
