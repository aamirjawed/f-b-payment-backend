const jwt = require('jsonwebtoken');

/**
 * Strict Admin JWT Authentication Middleware
 * Protects all admin management endpoints
 */
const verifyAdminAccess = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied: No authentication token provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'food_stall_super_secret_jwt_key_2026';
    const decoded = jwt.verify(token, secret);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired admin session. Please log in again.',
    });
  }
};

module.exports = {
  verifyAdminAccess,
};
