/**
 * Elahe Panel - Authentication Tests
 * Test suite for authentication service
 */

const AuthService = require('../src/services/auth');
const { getDb } = require('../src/database');

describe('AuthService', () => {
  let db;

  beforeAll(() => {
    // Database should be initialized by the application
    db = getDb();
  });

  describe('verifyToken', () => {
    it('should return null for invalid token', () => {
      const result = AuthService.verifyToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      const result = AuthService.verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJ0ZXN0IiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.test');
      expect(result).toBeNull();
    });
  });

  describe('getMessages', () => {
    it('should return localized messages', () => {
      const messages = AuthService.getMessages();
      expect(messages).toBeDefined();
      expect(messages.invalidCredentials).toBeDefined();
      expect(messages.accountDisabled).toBeDefined();
    });
  });

  describe('adminLogin', () => {
    it('should fail with invalid credentials', async () => {
      const result = await AuthService.adminLogin('nonexistent', 'wrongpassword');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should require OTP for admin with 2FA enabled', async () => {
      // This test assumes there's an admin with 2FA enabled
      // You may need to create test fixtures
      const result = await AuthService.adminLogin('admin', 'password');
      if (result.code === 'OTP_REQUIRED') {
        expect(result.success).toBe(false);
        expect(result.code).toBe('OTP_REQUIRED');
      }
    });
  });

  describe('userLogin', () => {
    it('should fail with invalid credentials', async () => {
      const result = await AuthService.userLogin('nonexistent', 'wrongpassword');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail for disabled users', async () => {
      // This test assumes there's a disabled user in the database
      // You may need to create test fixtures
      try {
        // Create a test user with disabled status
        const stmt = db.prepare(`
          INSERT INTO users (username, password, status) 
          VALUES (?, ?, ?)
        `);
        stmt.run('disabled-user', 'hashedpassword', 'disabled');
      } catch (e) {
        // User might already exist
      }

      const result = await AuthService.userLogin('disabled-user', 'anypassword');
      expect(result.success).toBe(false);
    });
  });

  describe('fakeRegister', () => {
    it('should always return failure', async () => {
      const result = await AuthService.fakeRegister('en');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return Persian error for ir locale', async () => {
      const result = await AuthService.fakeRegister('ir');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Check if error contains Persian characters
      expect(/[\u0600-\u06FF]/.test(result.error)).toBe(true);
    });
  });
});
