// Coverage baseline (established 2026-03-30 after Phase 6.1):
//   Overall:              84.56% stmts | 70.92% branch | 87.05% funcs | 86.34% lines
//   popup.js:             89.62% stmts (newly tested — 60 tests)
//   options.js:           96.87% stmts (newly tested — 34 tests)
//   background.js:        77.20% stmts
//   content-script.js:    81.13% stmts
//   element-picker.js:    65.44% stmts (known gap — jsdom getBoundingClientRect limitation)
//   markdown-converter.js:86.61% stmts
//   preferences.js:       100%
//   site-detector.js:     100%
//   x-extractor.js:       94.21% stmts
//   x-formatter.js:       95.49% stmts
// Files below 70% line coverage: element-picker.js (67.25%) — jsdom limitation, not actionable.
// Enforcement deferred to Phase 6.5 (CI pipeline).
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  transform: {
    '^.+\\.js$': 'babel-jest'
  }
}; 