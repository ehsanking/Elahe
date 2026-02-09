/**
 * Elahe Panel - Auth Middleware
 */

const AuthService = require('../services/auth');

function authMiddleware(requiredRole = 'admin') {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = AuthService.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (requiredRole === 'admin' && decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = decoded;
    next();
  };
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  if (token) {
    req.user = AuthService.verifyToken(token);
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };
