module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/database/(.*)$': '<rootDir>/src/database/$1',
    '^@/observability/(.*)$': '<rootDir>/src/observability/$1',
    '^@/scraper/(.*)$': '<rootDir>/src/scraper/$1',
    '^@/models/(.*)$': '<rootDir>/src/models/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
  },
};