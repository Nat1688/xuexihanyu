module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'CommonJS',
          strict: true,
          esModuleInterop: true,
        },
      },
    ],
  },
};
