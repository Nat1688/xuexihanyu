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
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/test/support/'],
};
