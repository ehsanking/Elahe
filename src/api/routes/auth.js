/**
 * Elahe Panel - Auth Routes
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../../services/auth');
const CaptchaService = require('../../services/captcha');

// Get captcha
router.get('/captcha', (req, res) => {
  const captcha = CaptchaService.generate();
  res.json({ id: captcha.id, svg: captcha.svg });
});

// Admin login
router.post('/login', async (req, res) => {
  const { username, password, captchaId, captchaAnswer } = req.body;

  if (!CaptchaService.verify(captchaId, captchaAnswer)) {
    return res.status(400).json({ error: 'Invalid captcha' });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const result = await AuthService.adminLogin(username, password);
  
  if (result.success) {
    res.cookie('token', result.token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ success: true, token: result.token, admin: result.admin });
  }
  
  res.status(401).json({ error: result.error });
});

// User login (for subscription panel)
router.post('/user-login', async (req, res) => {
  const { username, password, captchaId, captchaAnswer } = req.body;

  if (!CaptchaService.verify(captchaId, captchaAnswer)) {
    return res.status(400).json({ error: 'Invalid captcha' });
  }

  const result = await AuthService.userLogin(username, password);
  
  if (result.success) {
    return res.json({ success: true, token: result.token, user: result.user });
  }
  
  res.status(401).json({ error: result.error });
});

// Fake registration (returns confusing errors)
router.post('/register', async (req, res) => {
  const { captchaId, captchaAnswer } = req.body;

  if (!CaptchaService.verify(captchaId, captchaAnswer)) {
    return res.status(400).json({ error: 'Invalid captcha' });
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
