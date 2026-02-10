/**
 * Elahe Panel - Captcha Service
 * Math-based CAPTCHA (replaces svg-captcha)
 * Version: 0.0.5
 */

const crypto = require('crypto');
const { getDb } = require('../../database');
const config = require('../../config/default');

class CaptchaService {
  /**
   * Generate a new math-based captcha
   */
  static generate() {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;
    
    switch (op) {
      case '+':
        a = Math.floor(Math.random() * 50) + 1;
        b = Math.floor(Math.random() * 50) + 1;
        answer = a + b;
        break;
      case '-':
        a = Math.floor(Math.random() * 50) + 10;
        b = Math.floor(Math.random() * a);
        answer = a - b;
        break;
      case '*':
        a = Math.floor(Math.random() * 12) + 1;
        b = Math.floor(Math.random() * 10) + 1;
        answer = a * b;
        break;
    }

    const question = `${a} ${op} ${b} = ?`;
    
    // Generate SVG with the math question
    const colors = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777'];
    const bgColor = config.captcha.background || '#f0f0f0';
    const textColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Randomize positioning and rotation for each character
    const chars = question.split('');
    let textElements = '';
    const baseX = 20;
    const charWidth = 22;
    
    chars.forEach((char, i) => {
      const x = baseX + (i * charWidth);
      const y = 35 + (Math.random() * 10 - 5);
      const rotate = Math.random() * 20 - 10;
      const fontSize = 26 + Math.floor(Math.random() * 8);
      textElements += `<text x="${x}" y="${y}" transform="rotate(${rotate.toFixed(1)},${x},${y})" font-size="${fontSize}" font-family="monospace" font-weight="bold" fill="${textColor}">${char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char}</text>`;
    });

    // Generate noise lines
    let noiseLines = '';
    const noiseCount = config.captcha.noise || 3;
    for (let i = 0; i < noiseCount; i++) {
      const x1 = Math.random() * 200;
      const y1 = Math.random() * 60;
      const x2 = Math.random() * 200;
      const y2 = Math.random() * 60;
      const strokeColor = colors[Math.floor(Math.random() * colors.length)];
      noiseLines += `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${strokeColor}" stroke-width="1" opacity="0.3"/>`;
    }

    // Generate noise dots
    let noiseDots = '';
    for (let i = 0; i < 15; i++) {
      const cx = Math.random() * 200;
      const cy = Math.random() * 60;
      const r = Math.random() * 2 + 0.5;
      noiseDots += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(1)}" fill="${colors[Math.floor(Math.random() * colors.length)]}" opacity="0.3"/>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="60" viewBox="0 0 220 60">
      <rect width="220" height="60" fill="${bgColor}" rx="8"/>
      ${noiseLines}
      ${noiseDots}
      ${textElements}
    </svg>`;

    const id = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO captcha_sessions (id, answer, expires_at) VALUES (?, ?, ?)
    `).run(id, String(answer), expiresAt);

    // Cleanup expired captchas
    db.prepare(`DELETE FROM captcha_sessions WHERE expires_at < datetime('now')`).run();

    return {
      id,
      svg,
      type: 'math',
    };
  }

  /**
   * Verify captcha answer
   */
  static verify(id, answer) {
    if (!id || answer === undefined || answer === null || answer === '') return false;

    const db = getDb();
    const session = db.prepare(`
      SELECT * FROM captcha_sessions WHERE id = ? AND expires_at > datetime('now')
    `).get(id);

    if (!session) return false;

    // Delete used captcha
    db.prepare(`DELETE FROM captcha_sessions WHERE id = ?`).run(id);

    return session.answer === String(answer).trim();
  }
}

module.exports = CaptchaService;
