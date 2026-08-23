module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Node 24 on Windows can crash Babel/Jest workers during module startup
  // when Jest fans out to the default CPU-count-based worker pool.
  maxWorkers: 2,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', types: ['jest'] } }],
  },
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^@sentry/react-native$': '<rootDir>/__mocks__/@sentry/react-native.js',
  },
};
