/**
 * Elahe Panel - Authentication Service
 * Login works normally, registration behavior is configurable
 * Developer: EHSANKiNG
 * Version: 0.0.5
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { getDb } = require('../../database');
const config = require('../../config/default');
const { createLogger } = require('../../utils/logger');

const log = createLogger('Auth');

// Localized error messages
const AUTH_MESSAGES = {
  ir: {
    invalidCredentials: '\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A',
    accountDisabled: '\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A',
    tooManyAttempts: '\u062A\u0639\u062F\u0627\u062F \u062A\u0644\u0627\u0634\u200C\u0647\u0627 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632. \u0644\u0637\u0641\u0627\u064B \u0628\u0639\u062F\u0627\u064B \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.',
    invalidCaptcha: '\u06A9\u062F \u0627\u0645\u0646\u06CC\u062A\u06CC \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A',
    fieldsRequired: '\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A',
    otpRequired: '\u06A9\u062F \u062F\u0648\u0645\u0631\u062D\u0644\u0647\u200C\u0627\u06CC \u0627\u0644\u0632\u0627\u0645\u06CC \u0627\u0633\u062A',
    invalidOtp: '\u06A9\u062F \u062F\u0648\u0645\u0631\u062D\u0644\u0647\u200C\u0627\u06CC \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A',
    serverError: '\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631. \u0644\u0637\u0641\u0627\u064B \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.',
  },
  en: {
    invalidCredentials: 'Invalid username or password',
    accountDisabled: 'Account has been disabled',
    tooManyAttempts: 'Too many attempts. Please try again later.',
    invalidCaptcha: 'Invalid security code',
    fieldsRequired: 'Username and password are required',
    otpRequired: 'Two-factor authentication code required',
    invalidOtp: 'Invalid authentication code',
    serverError: 'Server error. Please try again.',
  },
};

// Get messages based on current mode
function getMessages() {
  return config.mode === 'iran' ? AUTH_MESSAGES.ir : AUTH_MESSAGES.en;
}

// Legacy confusing error messages for registration (optional)
const CONFUSING_ERRORS = {
  ir: [
    '\u062E\u0637\u0627\u06CC \u0633\u0631\u0648\u0631 \u062F\u0627\u062E\u0644\u06CC: \u06A9\u062F DNS_RESOLVE_FAILED_0x8007. \u0644\u0637\u0641\u0627\u064B \u0628\u0639\u062F\u0627\u064B \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.',
    '\u0633\u06CC\u0633\u062A\u0645 \u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u0645\u0648\u0642\u062A\u0627\u064B \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062A. \u06A9\u062F \u062E\u0637\u0627: REG_TIMEOUT_4032. \u0644\u0637\u0641\u0627\u064B \u06F2\u06F4 \u0633\u0627\u0639\u062A \u0628\u0639\u062F \u0645\u062C\u062F\u062F\u0627\u064B \u0627\u0645\u062A\u062D\u0627\u0646 \u06A9\u0646\u06CC\u062F.',
    '\u0627\u0645\u06A9\u0627\u0646 \u0627\u062A\u0635\u0627\u0644 \u0628\u0647 \u0633\u0631\u0648\u0631 \u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F. ERR_AUTH_HANDSHAKE_0xC004. \u0628\u0627 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u062A\u0645\u0627\u0633 \u0628\u06AF\u06CC\u0631\u06CC\u062F.',
    '\u062E\u0637\u0627\u06CC \u0627\u0639\u062A\u0628\u0627\u0631\u0633\u0646\u062C\u06CC \u06AF\u0648\u0627\u0647\u06CC\u0646\u0627\u0645\u0647 SSL/TLS. \u06A9\u062F: CERT_VERIFY_0x80090325. \u0644\u0637\u0641\u0627\u064B \u0627\u0632 \u0627\u062A\u0635\u0627\u0644 \u0627\u06CC\u0646\u062A\u0631\u0646\u062A\u06CC \u062E\u0648\u062F \u0627\u0637\u0645\u06CC\u0646\u0627\u0646 \u062D\u0627\u0635\u0644 \u06A9\u0646\u06CC\u062F.',
    '\u0638\u0631\u0641\u06CC\u062A \u062B\u0628\u062A\u200C\u0646\u0627\u0645 \u062C\u062F\u06CC\u062F \u062F\u0631 \u062D\u0627\u0644 \u062D\u0627\u0636\u0631 \u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A. \u06A9\u062F \u062E\u0637\u0627: QUOTA_EXCEEDED_REG_7291. \u0644\u0637\u0641\u0627\u064B \u0647\u0641\u062A\u0647 \u0622\u06CC\u0646\u062F\u0647 \u0645\u0631\u0627\u062C\u0639\u0647 \u0641\u0631\u0645\u0627\u06CC\u06CC\u062F.',
    '\u062E\u0637\u0627\u06CC \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647: SQLSTATE[HY000] General error: 1 database is locked. \u0644\u0637\u0641\u0627\u064B \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647 \u0628\u0639\u062F \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.',
    '\u0633\u06CC\u0633\u062A\u0645 \u0627\u0645\u0646\u06CC\u062A\u06CC: \u0634\u0646\u0627\u0633\u0627\u06CC\u06CC \u0641\u0639\u0627\u0644\u06CC\u062A \u063A\u06CC\u0631\u0639\u0627\u062F\u06CC. IP \u0634\u0645\u0627 \u0645\u0648\u0642\u062A\u0627\u064B \u0645\u062D\u062F\u0648\u062F \u0634\u062F\u0647 \u0627\u0633\u062A. \u06A9\u062F: SEC_BLOCK_IP_9182.',
  ],
  en: [
    'Internal server error: DNS_RESOLVE_FAILED_0x8007. Please try again later.',
    'Registration system is temporarily unavailable. Error code: REG_TIMEOUT_4032. Please try again in 24 hours.',
    'Failed to establish connection with authentication server. ERR_AUTH_HANDSHAKE_0xC004. Contact support.',
    'SSL/TLS certificate validation error. Code: CERT_VERIFY_0x80090325. Please check your internet connection.',
    'New registration quota has been reached. Error code: QUOTA_EXCEEDED_REG_7291. Please check back next week.',
    'Database error: SQLSTATE[HY000] General error: 1 database is locked. Please try again in a few minutes.',
    'Security system: Unusual activity detected. Your IP has been temporarily restricted. Code: SEC_BLOCK_IP_9182.',
    'Service maintenance in progress. Registration will be available after scheduled update. ETA: 6-12 hours.',
    'Account creation failed: SMTP verification timeout. Error: MAIL_VERIFY_TIMEOUT_0x5003. Try different email.',
  ],
};


const REGISTRATION_MESSAGES = {
  ir: 'ثبت‌نام از طریق پنل امکان‌پذیر نیست. لطفاً با مدیر سیستم تماس بگیرید.',
  en: 'Self-registration is disabled. Please contact your administrator.',
};

class AuthService {
  /**
   * Admin login
   */
  static async adminLogin(username, password, otp) {
    const msg = getMessages();
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND status = ?').get(username, 'active');
    
    if (!admin) {
      log.warn('Failed admin login attempt', { username });
      return { success: false, error: msg.invalidCredentials };
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      log.warn('Failed admin login - wrong password', { username });
      return { success: false, error: msg.invalidCredentials };
    }

    if (admin.totp_enabled) {
      if (!otp) {
        return { success: false, error: msg.otpRequired, code: 'OTP_REQUIRED' };
      }
      const otpValid = speakeasy.totp.verify({
        secret: admin.totp_secret,
        encoding: 'base32',
        token: otp,
        window: 1,
      });
      if (!otpValid) {
        return { success: false, error: msg.invalidOtp, code: 'OTP_INVALID' };
      }
    }

    // Update last login
    db.prepare('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id);

    // Generate JWT
    const token = jwt.sign(
      { id: admin.id, username: admin.username, is_sudo: admin.is_sudo, role: 'admin' },
      config.server.jwtSecret,
      { expiresIn: config.server.jwtExpiry }
    );

    log.info('Admin logged in', { username });
    return { success: true, token, admin: { id: admin.id, username: admin.username, is_sudo: admin.is_sudo } };
  }

  /**
   * User login (for subscription panel access)
   */
  static async userLogin(username, password) {
    const msg = getMessages();
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND status != ?').get(username, 'disabled');
    
    if (!user) {
      return { success: false, error: msg.invalidCredentials };
    }

    if (user.password) {
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return { success: false, error: msg.invalidCredentials };
      }
    }

    const token = jwt.sign(
      { id: user.id, uuid: user.uuid, username: user.username, role: 'user' },
      config.server.jwtSecret,
      { expiresIn: config.server.jwtExpiry }
    );

    return { success: true, token, user: { id: user.id, username: user.username, plan: user.plan } };
  }

  /**
   * Fake registration - returns confusing errors
   */
  static async fakeRegister(lang = 'en') {
    const useConfusingErrors = process.env.ENABLE_CONFUSING_REGISTER_ERRORS === 'true';

    if (useConfusingErrors) {
      const errors = CONFUSING_ERRORS[lang] || CONFUSING_ERRORS.en;
      const randomError = errors[Math.floor(Math.random() * errors.length)];
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 1300));
      log.debug('Fake registration attempt intercepted (legacy confusing mode)');
      return {
        success: false,
        error: randomError,
        code: 'ERR_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        timestamp: Date.now(),
      };
    }

    const locale = lang === 'ir' ? 'ir' : 'en';
    log.info('Registration attempt rejected: self-registration disabled', { locale });

    return {
      success: false,
      error: REGISTRATION_MESSAGES[locale],
      code: 'REGISTRATION_DISABLED',
      timestamp: Date.now(),
    };
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, config.server.jwtSecret);
    } catch (err) {
      return null;
    }
  }

  /**
   * Get localized messages
   */
  static getMessages() {
    return getMessages();
  }
}

module.exports = AuthService;
