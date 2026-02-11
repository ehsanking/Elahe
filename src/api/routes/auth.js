/**
 * Elahe Panel - Auth Routes
 * Version: 0.0.5
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../../services/auth');
const CaptchaService = require('../../services/captcha');

// Get captcha
router.get('/captcha', (req, res) => {
  const captcha = CaptchaService.generate();
  res.json({ id: captcha.id, svg: captcha.svg, type: captcha.type || 'svg', question: captcha.question || null });
});

// Admin login
router.post('/login', async (req, res) => {
  const msg = AuthService.getMessages();
  const { username, password, captchaId, captchaAnswer, otp } = req.body;

  if (!CaptchaService.verify(captchaId, captchaAnswer)) {
    return res.status(400).json({ success: false, error: msg.invalidCaptcha });
  }

  if (!username || !password) {
    return res.status(400).json({ success: false, error: msg.fieldsRequired });
  }

  try {
    const result = await AuthService.adminLogin(username, password, otp);
    
    if (result.success) {
      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('token', result.token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: isSecure,
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, token: result.token, admin: result.admin });
    }
    
    res.status(401).json({ success: false, error: result.error, code: result.code });
  } catch (err) {
    res.status(500).json({ success: false, error: msg.serverError });
  }
});

// User login (for subscription panel)
router.post('/user-login', async (req, res) => {
  const msg = AuthService.getMessages();
  const { username, password, captchaId, captchaAnswer } = req.body;

  if (!CaptchaService.verify(captchaId, captchaAnswer)) {
    return res.status(400).json({ success: false, error: msg.invalidCaptcha });
  }

  try {
    const result = await AuthService.userLogin(username, password);
    
    if (result.success) {
      return res.json({ success: true, token: result.token, user: result.user });
    }
    
    res.status(401).json({ success: false, error: result.error });
  } catch (err) {
    res.status(500).json({ success: false, error: msg.serverError });
  }
});

// Fake registration (returns confusing errors)
router.post('/register', async (req, res) => {
  const msg = AuthService.getMessages();
  const { captchaId, captchaAnswer } = req.body;

  if (!CaptchaService.verify(captchaId, captchaAnswer)) {
    return res.status(400).json({ success: false, error: msg.invalidCaptcha });
  }

  const lang = req.headers['accept-language']?.includes('fa') ? 'ir' : 'en';
  const result = await AuthService.fakeRegister(lang);
  
  // Always return error status for fake registration
  res.status(500).json(result);
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

module.exports = router;
