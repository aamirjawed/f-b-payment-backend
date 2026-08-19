const express = require('express');
const router = express.Router();
const {
  createPaymentOrder,
  verifyPayment,
  processWebhook,
  getPaymentById,
  getAllPayments,
} = require('../controllers/paymentController');
const { verifyAdminAccess } = require('../../admin/middlewares/adminAuth');

// Customer Checkout Routes
router.post('/create-order', createPaymentOrder);
router.post('/verify-signature', verifyPayment);

// Automated Razorpay Webhook Endpoint
router.post('/webhook', processWebhook);

// Payment Status & Admin Reporting Routes
router.get('/:paymentId', getPaymentById);
router.get('/', verifyAdminAccess, getAllPayments);

module.exports = router;
