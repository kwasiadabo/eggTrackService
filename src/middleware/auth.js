const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

// Roles: admin > manager > viewer
const ROLE_LEVELS = { admin: 3, manager: 2, viewer: 1 };

/**
 * Verifies the Bearer JWT and attaches req.user.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid token. Please log in again.';
    return res.status(401).json({ success: false, message });
  }
}

/**
 * Require a minimum role level.
 * Usage: authorize('manager')  — allows manager + admin
 *        authorize('admin')    — allows admin only
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    const userLevel  = ROLE_LEVELS[req.user.role] || 0;
    const minLevel   = Math.min(...roles.map(r => ROLE_LEVELS[r] || 99));
    if (userLevel < minLevel) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}.`,
      });
    }
    next();
  };
}

/**
 * Shorthand guards
 */
const requireViewer  = [authenticate];
const requireManager = [authenticate, authorize('manager', 'admin')];
const requireAdmin   = [authenticate, authorize('admin')];

module.exports = { authenticate, authorize, requireViewer, requireManager, requireAdmin };
