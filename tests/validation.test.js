/**
 * Elahe Panel - Validation Tests
 * Test suite for validation middleware
 */

const { validationRules, customValidations } = require('../src/middleware/validation');

describe('Validation Middleware', () => {
  // Mock request and response objects
  const mockRequest = (body = {}, params = {}, query = {}) => ({
    body,
    params,
    query,
    path: '/test',
  });

  const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Login Validation', () => {
    it('should pass with valid login data', async () => {
      const req = mockRequest({
        username: 'testuser',
        password: 'password123',
        captchaId: 'captcha123',
        captchaAnswer: '42',
      });
      const res = mockResponse();

      // Run all validators except the last one (validate middleware)
      for (let i = 0; i < validationRules.login.length - 1; i++) {
        await validationRules.login[i].run(req);
      }

      // Check if there are no validation errors
      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing username', async () => {
      const req = mockRequest({
        password: 'password123',
        captchaId: 'captcha123',
        captchaAnswer: '42',
      });

      // Run all validators
      for (let i = 0; i < validationRules.login.length - 1; i++) {
        await validationRules.login[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            param: 'username',
          }),
        ])
      );
    });

    it('should fail with short password', async () => {
      const req = mockRequest({
        username: 'testuser',
        password: '12345', // Too short
        captchaId: 'captcha123',
        captchaAnswer: '42',
      });

      for (let i = 0; i < validationRules.login.length - 1; i++) {
        await validationRules.login[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should validate OTP format if provided', async () => {
      const req = mockRequest({
        username: 'testuser',
        password: 'password123',
        captchaId: 'captcha123',
        captchaAnswer: '42',
        otp: 'invalid', // Not 6 digits
      });

      for (let i = 0; i < validationRules.login.length - 1; i++) {
        await validationRules.login[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            param: 'otp',
          }),
        ])
      );
    });
  });

  describe('User Creation Validation', () => {
    it('should pass with valid user data', async () => {
      const req = mockRequest({
        username: 'newuser',
        password: 'securepass123',
        dataLimit: 10737418240,
        maxConnections: 2,
      });

      for (let i = 0; i < validationRules.createUser.length - 1; i++) {
        await validationRules.createUser[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid username characters', async () => {
      const req = mockRequest({
        username: 'user@invalid', // Contains @ which is not allowed
        password: 'securepass123',
      });

      for (let i = 0; i < validationRules.createUser.length - 1; i++) {
        await validationRules.createUser[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with negative data limit', async () => {
      const req = mockRequest({
        username: 'newuser',
        password: 'securepass123',
        dataLimit: -1000, // Negative value
      });

      for (let i = 0; i < validationRules.createUser.length - 1; i++) {
        await validationRules.createUser[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Tunnel Creation Validation', () => {
    it('should pass with valid tunnel data', async () => {
      const req = mockRequest({
        name: 'Test Tunnel',
        iranServerId: 1,
        foreignServerId: 2,
        tunnelType: 'ssh',
        localPort: 443,
        remotePort: 8443,
      });

      for (let i = 0; i < validationRules.createTunnel.length - 1; i++) {
        await validationRules.createTunnel[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid tunnel type', async () => {
      const req = mockRequest({
        name: 'Test Tunnel',
        iranServerId: 1,
        foreignServerId: 2,
        tunnelType: 'invalid-type',
        localPort: 443,
        remotePort: 8443,
      });

      for (let i = 0; i < validationRules.createTunnel.length - 1; i++) {
        await validationRules.createTunnel[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid port numbers', async () => {
      const req = mockRequest({
        name: 'Test Tunnel',
        iranServerId: 1,
        foreignServerId: 2,
        tunnelType: 'ssh',
        localPort: 99999, // Invalid port
        remotePort: 8443,
      });

      for (let i = 0; i < validationRules.createTunnel.length - 1; i++) {
        await validationRules.createTunnel[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Pagination Validation', () => {
    it('should pass with valid pagination params', async () => {
      const req = mockRequest({}, {}, { page: '1', limit: '10' });

      for (let i = 0; i < validationRules.pagination.length - 1; i++) {
        await validationRules.pagination[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid page number', async () => {
      const req = mockRequest({}, {}, { page: '0', limit: '10' }); // Page must be >= 1

      for (let i = 0; i < validationRules.pagination.length - 1; i++) {
        await validationRules.pagination[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with excessive limit', async () => {
      const req = mockRequest({}, {}, { page: '1', limit: '1000' }); // Limit max 100

      for (let i = 0; i < validationRules.pagination.length - 1; i++) {
        await validationRules.pagination[i].run(req);
      }

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Custom Validations', () => {
    it('should validate domain format', async () => {
      const validator = customValidations.isValidDomain('domain');
      const req = mockRequest({ domain: 'example.com' });

      await validator.run(req);

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid domain', async () => {
      const validator = customValidations.isValidDomain('domain');
      const req = mockRequest({ domain: 'invalid_domain' });

      await validator.run(req);

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should validate UUID format', async () => {
      const validator = customValidations.isValidUUID('uuid');
      const req = mockRequest({ uuid: '550e8400-e29b-41d4-a716-446655440000' });

      await validator.run(req);

      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });
  });
});
