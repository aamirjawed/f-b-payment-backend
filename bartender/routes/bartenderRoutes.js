const express = require('express');
const router = express.Router();
const {
  loginWithQrToken,
  loginWithPin,
  loginWithPassword,
  getBartenderProfile,
  getBartenderOrders,
  updateBartenderOrderStatus,
} = require('../controllers/bartenderController');
const { verifyBartenderAccess } = require('../middlewares/bartenderAuth');

// --- Public Bartender Device Authentication Routes ---
router.post('/auth/qr', loginWithQrToken);
router.post('/auth/pin', loginWithPin);
router.post('/auth/password', loginWithPassword);
router.post('/login', loginWithPassword);

// --- Protected Bartender Session & Order Fulfillment Routes ---
router.use(verifyBartenderAccess);

router.get('/me', getBartenderProfile);
router.get('/orders', getBartenderOrders);
router.patch('/orders/:id/status', updateBartenderOrderStatus);

module.exports = router;
