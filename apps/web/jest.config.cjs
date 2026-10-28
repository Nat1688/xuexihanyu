module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '\\.spec\\.tsx?$',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'CommonJS',
          strict: true,
          esModuleInterop: true,
          jsx: 'react-jsx',
          skipLibCheck: true,
        },
      },
    ],
  },
};
