/**
 * Elahe Panel - Input Validation Middleware
 * Provides comprehensive request validation using express-validator
 * Version: 0.0.5
 */

const { body, param, query, validationResult } = require('express-validator');
const { createLogger } = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

const log = createLogger('Validation');

/**
 * Middleware to check validation results and return errors
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));
    
    log.warn('Validation failed', { errors: errorMessages, path: req.path });
    
    throw new ValidationError('Validation failed', errorMessages);
  }
  next();
};

/**
 * Common validation rules
 */
const validationRules = {
  // Auth validations
  login: [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required')
      .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('captchaId')
      .notEmpty().withMessage('Captcha ID is required'),
    body('captchaAnswer')
      .notEmpty().withMessage('Captcha answer is required'),
    body('otp')
      .optional()
      .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
      .isNumeric().withMessage('OTP must be numeric'),
    validate
  ],

  // User management validations
  createUser: [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required')
      .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
      .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscores and hyphens'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('dataLimit')
      .optional()
      .isInt({ min: 0 }).withMessage('Data limit must be a positive number'),
    body('expireAt')
      .optional()
      .isISO8601().withMessage('Invalid expiration date format'),
    body('maxConnections')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Max connections must be between 1 and 100'),
    validate
  ],

  updateUser: [
    param('id')
      .isInt({ min: 1 }).withMessage('Invalid user ID'),
    body('password')
      .optional()
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('dataLimit')
      .optional()
      .isInt({ min: 0 }).withMessage('Data limit must be a positive number'),
    body('expireAt')
      .optional()
      .isISO8601().withMessage('Invalid expiration date format'),
    body('maxConnections')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Max connections must be between 1 and 100'),
    body('status')
      .optional()
      .isIn(['active', 'disabled', 'expired', 'limited']).withMessage('Invalid status value'),
    validate
  ],

  // Server validations
  createServer: [
    body('name')
      .trim()
      .notEmpty().withMessage('Server name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Server name must be 2-100 characters'),
    body('host')
      .trim()
      .notEmpty().withMessage('Host is required')
      .matches(/^[a-zA-Z0-9.-]+$/).withMessage('Invalid host format'),
    body('port')
      .optional()
      .isInt({ min: 1, max: 65535 }).withMessage('Port must be between 1 and 65535'),
    body('username')
      .optional()
      .trim()
      .notEmpty().withMessage('Username cannot be empty if provided'),
    body('type')
      .isIn(['iran', 'foreign']).withMessage('Type must be iran or foreign'),
    validate
  ],

  // Tunnel validations
  createTunnel: [
    body('name')
      .trim()
      .notEmpty().withMessage('Tunnel name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Tunnel name must be 2-100 characters'),
    body('iranServerId')
      .isInt({ min: 1 }).withMessage('Invalid Iran server ID'),
    body('foreignServerId')
      .isInt({ min: 1 }).withMessage('Invalid foreign server ID'),
    body('tunnelType')
      .isIn(['ssh', 'frp', 'gost', 'chisel', 'trusttunnel']).withMessage('Invalid tunnel type'),
    body('localPort')
      .isInt({ min: 1, max: 65535 }).withMessage('Local port must be between 1 and 65535'),
    body('remotePort')
      .isInt({ min: 1, max: 65535 }).withMessage('Remote port must be between 1 and 65535'),
    validate
  ],

  // Protocol config validations
  updateProtocolConfig: [
    body('protocol')
      .isIn(['vless-reality', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'wireguard', 'openvpn'])
      .withMessage('Invalid protocol type'),
    body('enabled')
      .optional()
      .isBoolean().withMessage('Enabled must be a boolean'),
    body('port')
      .optional()
      .isInt({ min: 1, max: 65535 }).withMessage('Port must be between 1 and 65535'),
    validate
  ],

  // Generic ID parameter validation
  idParam: [
    param('id')
      .isInt({ min: 1 }).withMessage('Invalid ID parameter'),
    validate
  ],

  // Pagination validation
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    validate
  ],

  // Settings validation
  updateSettings: [
    body('key')
      .trim()
      .notEmpty().withMessage('Setting key is required')
      .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Invalid setting key format'),
    body('value')
      .notEmpty().withMessage('Setting value is required'),
    validate
  ],

  // Subscription token validation
  subscriptionToken: [
    param('token')
      .trim()
      .notEmpty().withMessage('Subscription token is required')
      .isLength({ min: 32, max: 64 }).withMessage('Invalid token format'),
    validate
  ],
};

/**
 * Custom validation for complex scenarios
 */
const customValidations = {
  /**
   * Validate that at least one field is provided for update
   */
  requireAtLeastOne: (fields) => {
    return (req, res, next) => {
      const hasField = fields.some(field => req.body[field] !== undefined);
      if (!hasField) {
        throw new ValidationError(
          `At least one of the following fields is required: ${fields.join(', ')}`,
          [{ field: 'body', message: 'No valid fields provided' }]
        );
      }
      next();
    };
  },

  /**
   * Validate IP address format
   */
  isValidIP: (field) => {
    return body(field).custom((value) => {
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
      if (!ipv4Regex.test(value) && !ipv6Regex.test(value)) {
        throw new Error('Invalid IP address format');
      }
      return true;
    });
  },

  /**
   * Validate domain name format
   */
  isValidDomain: (field) => {
    return body(field).custom((value) => {
      const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
      if (!domainRegex.test(value)) {
        throw new Error('Invalid domain name format');
      }
      return true;
    });
  },

  /**
   * Validate UUID format
   */
  isValidUUID: (field) => {
    return body(field).custom((value) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) {
        throw new Error('Invalid UUID format');
      }
      return true;
    });
  },
};

module.exports = {
  validate,
  validationRules,
  customValidations,
};
