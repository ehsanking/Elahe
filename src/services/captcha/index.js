/**
 * Elahe Panel - Captcha Service
 */

const svgCaptcha = require('svg-captcha');
const crypto = require('crypto');
const { getDb } = require('../../database');
const config = require('../../config/default');

class CaptchaService {
  /**
   * Generate a new captcha
   */
  static generate() {
    const captcha = svgCaptcha.create({
      size: config.captcha.size,
      noise: config.captcha.noise,
      color: config.captcha.color,
      background: config.captcha.background,
      width: 200,
      height: 60,
      fontSize: 50,
    });

    const id = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    const db = getDb();
    db.prepare(`
      INSERT INTO captcha_sessions (id, answer, expires_at) VALUES (?, ?, ?)
    `).run(id, captcha.text.toLowerCase(), expiresAt);

    // Cleanup expired captchas
    db.prepare(`DELETE FROM captcha_sessions WHERE expires_at < datetime('now')`).run();

    return {
      id,
      svg: captcha.data,
    };
  }

  /**
   * Verify captcha answer
   */
  static verify(id, answer) {
    if (!id || !answer) return false;

    const db = getDb();
    const session = db.prepare(`
      SELECT * FROM captcha_sessions WHERE id = ? AND expires_at > datetime('now')
    `).get(id);

    if (!session) return false;

    // Delete used captcha
    db.prepare(`DELETE FROM captcha_sessions WHERE id = ?`).run(id);

    return session.answer === answer.toLowerCase();
  }
}

module.exports = CaptchaService;
