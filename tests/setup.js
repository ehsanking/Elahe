/**
 * Elahe Panel - Test Setup
 * Global test configuration and setup
 */

const path = require('path');
const fs = require('fs');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Use a test database
const testDbPath = path.join(__dirname, '../data/test-elahe.db');
process.env.DB_PATH = testDbPath;

// Setup test database before each test suite (but not for validation tests)
beforeAll(async () => {
  // Only initialize DB if this is not the validation test
  if (!process.env.SKIP_DB_INIT) {
    // Ensure data directory exists
    const dataDir = path.dirname(testDbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    const { initDatabase } = require('../src/database');
    await initDatabase();
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Close database connection
  try {
    const { getDb } = require('../src/database');
    const db = getDb();
    if (db) {
      db.close();
    }
  } catch (e) {
    // Ignore if DB was never initialized
  }

  // Optionally remove test database
  if (process.env.KEEP_TEST_DB !== 'true') {
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

// Suppress console output during tests (optional)
if (process.env.SILENT_TESTS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error for debugging
  };
}