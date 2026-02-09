/**
 * Elahe Panel - Subscription Routes
 * Provides subscription data in both JSON and HTML format
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const SubscriptionService = require('../../services/subscription');
const config = require('../../config/default');

// Get subscription info page (HTML for browsers, JSON for API)
router.get('/info/:token', (req, res) => {
  const accept = req.headers['accept'] || '';
  
  // If requesting JSON explicitly, return JSON data
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    const data = SubscriptionService.getSubscriptionInfo(req.params.token);
    if (!data) return res.status(404).json({ error: 'Subscription not found' });
    return res.json(data);
  }

  // Serve the HTML page (it will fetch JSON via JS)
  const htmlPath = path.join(config.paths.public, 'admin', 'subscription.html');
  res.sendFile(htmlPath);
});

// JSON API endpoint for subscription info (always returns JSON)
router.get('/info/:token/json', (req, res) => {
  const data = SubscriptionService.getSubscriptionInfo(req.params.token);
  if (!data) return res.status(404).json({ error: 'Subscription not found' });
  res.json(data);
});

// Get raw subscription (base64 for V2rayNG etc.)
router.get('/:token', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  
  // If accessed from browser, redirect to info page (HTML)
  if (userAgent.includes('Mozilla') && !userAgent.includes('V2ray') && !userAgent.includes('Clash') && !userAgent.includes('Shadowrocket') && !userAgent.includes('Stash') && !userAgent.includes('Surge') && !userAgent.includes('Hiddify') && !userAgent.includes('NekoBox')) {
    return res.redirect(`/sub/info/${req.params.token}`);
  }

  const sub = SubscriptionService.getSubscriptionByToken(req.params.token);
  if (!sub || !sub.active) return res.status(404).send('Not found');

  const content = sub.subscriptionContent;
  
  // Build subscription userinfo header
  const u = sub.user;
  const upload = 0;
  const download = u.dataUsed || 0;
  const total = u.dataLimit || 0;
  const expire = u.expireAt ? Math.floor(new Date(u.expireAt).getTime() / 1000) : 0;
  const userinfo = `upload=${upload}; download=${download}; total=${total}; expire=${expire}`;
  
  res.set({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Disposition': 'inline',
    'Profile-Title': 'base64:' + Buffer.from(`Elahe - ${u.username}`).toString('base64'),
    'Subscription-Userinfo': userinfo,
    'Profile-Update-Interval': '12',
    'Support-Url': 'https://t.me/elahe_panel',
    'Profile-Web-Page-Url': `/sub/info/${req.params.token}`,
  });
  res.send(content);
});

module.exports = router;
