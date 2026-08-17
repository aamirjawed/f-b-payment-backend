const jwt = require('jsonwebtoken');

/**
 * Strict Bartender & Staff JWT Authentication Middleware
 * Protects bartender order management and fulfillment endpoints
 */
const verifyBartenderAccess = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied: No bartender authentication token provided.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'food_stall_super_secret_jwt_key_2026';
    const decoded = jwt.verify(token, secret);

    // Allow both bartenders and admins
    if (decoded.role === 'admin' || decoded.bartenderId || decoded.staffId || decoded.id) {
      req.user = decoded;
      req.bartender = {
        id: decoded.bartenderId || decoded.staffId || decoded.id,
        vendorId: decoded.vendorId,
        username: decoded.username,
        name: decoded.name,
        role: decoded.role,
        station: decoded.station,
      };
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied: Invalid bartender credentials.',
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired bartender session. Please scan QR or enter PIN again.',
    });
  }
};

module.exports = {
  verifyBartenderAccess,
};
