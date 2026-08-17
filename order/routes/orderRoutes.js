const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  verifyOrderQrData,
  redeemOrderQr,
} = require('../controllers/orderController');
const { getDashboardAnalytics } = require('../controllers/dashboardController');

// --- Order QR Verification & Scanner Redemption ---
router.post('/verify-qr', verifyOrderQrData);
router.post('/redeem-qr', redeemOrderQr);

// --- Standard Order Operations ---
router.post('/', createOrder);
router.get('/', getOrders);
router.get('/analytics', getDashboardAnalytics);
router.get('/:id', getOrderById);
router.patch('/:id/status', updateOrderStatus);

module.exports = router;
