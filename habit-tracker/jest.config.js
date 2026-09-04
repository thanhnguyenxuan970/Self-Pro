module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Node 24 on Windows can crash Babel/Jest workers during module startup
  // when Jest fans out to the default CPU-count-based worker pool.
  maxWorkers: 2,
  // Use Node's native coverage instrumentation for the TypeScript runtime.
  // This keeps the repository's default `jest --coverage` gate aligned with
  // the coverage command used in CI and avoids Babel-only source-map gaps.
  coverageProvider: 'v8',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', types: ['jest'] } }],
  },
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^expo-store-review$': '<rootDir>/__mocks__/expo-store-review.js',
    '^@sentry/react-native$': '<rootDir>/__mocks__/@sentry/react-native.js',
  },
};
