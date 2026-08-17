const express = require('express');
const router = express.Router();
const {
  getAllVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  loginVendor,
  getVendorOrders,
  completeVendorOrder,
} = require('../controllers/vendorController');
const { verifyAdminAccess } = require('../../admin/middlewares/adminAuth');

// --- Bar Device Auth Route ---
router.post('/login', loginVendor);

// --- Bar Order Completion Endpoint (Tick/Mark Completed) ---
router.patch('/orders/:orderId/complete', completeVendorOrder);

// --- Public / Customer Routes ---
router.get('/', getAllVendors);
router.get('/:id/orders', getVendorOrders);
router.get('/:id', getVendorById);

// --- Protected Admin Management Routes ---
router.post('/', verifyAdminAccess, createVendor);
router.put('/:id', verifyAdminAccess, updateVendor);
router.delete('/:id', verifyAdminAccess, deleteVendor);

module.exports = router;
