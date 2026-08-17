const express = require('express');
const router = express.Router();
const {
  adminLogin,
  adminLogout,
  getAdminProfile,
  resetDatabase,
} = require('../controllers/adminAuthController');
const {
  getAdminMenuDashboard,
  adminCreateMenuItem,
  adminUpdateMenuItem,
  adminDeleteMenuItem,
  adminCreateCategory,
  adminDeleteCategory,
} = require('../controllers/adminFoodMenuController');
const { getOrders, getOrderById, updateOrderStatus } = require('../../order/controllers/orderController');
const { getAllPayments, getPaymentById } = require('../../payment/controllers/paymentController');
const {
  getAllVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
} = require('../../vendor/controllers/vendorController');
const {
  createBartender,
  getAllBartenders,
  getBartenderById,
  regenerateQrToken,
  updateBartender,
  deleteBartender,
} = require('../../bartender/controllers/bartenderController');
const { getDashboardAnalytics } = require('../../order/controllers/dashboardController');
const { verifyAdminAccess } = require('../middlewares/adminAuth');

// --- Public Admin Auth Routes ---
router.post('/login', adminLogin);

// --- Protected Admin Routes (Require JWT Token) ---
router.use(verifyAdminAccess);

router.post('/logout', adminLogout);
router.get('/me', getAdminProfile);

// Admin Food Menu Management Endpoints
router.get('/menu', getAdminMenuDashboard);       // GET - Admin dashboard & menu list
router.post('/menu', adminCreateMenuItem);        // POST - Admin create new item
router.put('/menu/:id', adminUpdateMenuItem);     // PUT - Admin update item
router.delete('/menu/:id', adminDeleteMenuItem);  // DELETE - Admin delete item

// Category Management Endpoints
router.post('/categories', adminCreateCategory);    // POST - Admin create category
router.delete('/categories/:id', adminDeleteCategory); // DELETE - Admin delete category

// Admin Orders & Payment Data Management Endpoints
router.get('/orders', getOrders);                      // GET - Admin get vendor orders
router.get('/orders/:id', getOrderById);               // GET - Admin get single order with items
router.patch('/orders/:id/status', updateOrderStatus); // PATCH - Admin update order & payment status
router.get('/payments', getAllPayments);               // GET - Admin get vendor payment transactions
router.get('/payments/:paymentId', getPaymentById);    // GET - Admin get payment detail

// Admin Stalls / Bars Management Endpoints
router.get('/stalls', getAllVendors);                  // GET - List all stalls/bars
router.get('/stalls/:id', getVendorById);              // GET - Get single stall details
router.post('/stalls', createVendor);                  // POST - Admin create new stall/bar
router.put('/stalls/:id', updateVendor);               // PUT - Admin update stall/bar
router.delete('/stalls/:id', deleteVendor);            // DELETE - Admin delete stall/bar

// Admin Bartenders & Staff Management Endpoints
router.get('/bartenders', getAllBartenders);                    // GET - List all bartenders
router.post('/bartenders', createBartender);                    // POST - Create bartender with auto credentials & QR URL
router.get('/bartenders/:id', getBartenderById);                // GET - Get single bartender stats & QR details
router.post('/bartenders/:id/regenerate-qr', regenerateQrToken); // POST - Generate new QR token & URL
router.put('/bartenders/:id', updateBartender);                 // PUT - Update profile/PIN/station
router.delete('/bartenders/:id', deleteBartender);              // DELETE - Remove bartender

// Admin Dashboard Analytics & Database Maintenance
router.get('/analytics', getDashboardAnalytics);       // GET - Full analytics (all stalls or filtered)
router.post('/reset-database', resetDatabase);         // POST - Wipe all database records (zero hardcoded/test data)

module.exports = router;
