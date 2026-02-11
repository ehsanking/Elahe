/**
 * Elahe Panel - Captcha Tests
 */

const CaptchaService = require('../src/services/captcha');
const { getDb } = require('../src/database');

describe('CaptchaService', () => {
  it('should generate captcha with question metadata', () => {
    const captcha = CaptchaService.generate();

    expect(captcha.id).toBeDefined();
    expect(captcha.svg).toContain('<svg');
    expect(captcha.question).toContain('= ?');
  });

  it('should normalize Persian and Arabic digits', () => {
    expect(CaptchaService.normalizeAnswer('۱۲۳')).toBe('123');
    expect(CaptchaService.normalizeAnswer('٤٢')).toBe('42');
    expect(CaptchaService.normalizeAnswer('  -۱۵  ')).toBe('-15');
  });

  it('should accept localized digits in verification', () => {
    const captcha = CaptchaService.generate();
    const db = getDb();

    const row = db.prepare('SELECT answer FROM captcha_sessions WHERE id = ?').get(captcha.id);
    expect(row?.answer).toBeDefined();

    const localizedAnswer = row.answer
      .replace(/0/g, '۰')
      .replace(/1/g, '۱')
      .replace(/2/g, '۲')
      .replace(/3/g, '۳')
      .replace(/4/g, '۴')
      .replace(/5/g, '۵')
      .replace(/6/g, '۶')
      .replace(/7/g, '۷')
      .replace(/8/g, '۸')
      .replace(/9/g, '۹');

    expect(CaptchaService.verify(captcha.id, localizedAnswer)).toBe(true);
  });
});
