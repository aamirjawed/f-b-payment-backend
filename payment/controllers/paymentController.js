const {
  createOrderService,
  createQRCodeService,
  verifySignatureService,
  handleWebhookService,
} = require('../services/razorpayService');
const Payment = require('../models/Payment');
const sequelize = require('../../config/database');
const { Op } = require('sequelize');

/**
 * POST /api/payment/create-order
 * Create a new Razorpay order for checkout
 */
const createPaymentOrder = async (req, res, next) => {
  try {
    const { amount, currency = 'INR', vendorId, orderId, customerDetails, notes } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required to create a payment order',
      });
    }

    const result = await createOrderService({
      amount: parseFloat(amount),
      currency,
      vendorId,
      orderId,
      customerDetails,
      notes,
    });

    res.status(201).json({
      success: true,
      message: 'Razorpay order created successfully',
      keyId: result.keyId,
      razorpayOrder: result.razorpayOrder,
      payment: result.payment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payment/create-qr
 * Create dynamic Razorpay UPI QR code or dynamic UPI intent payload
 */
const createPaymentQRCode = async (req, res, next) => {
  try {
    const { amount, vendorId, orderId, notes } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required to generate UPI QR code',
      });
    }

    const result = await createQRCodeService({
      amount: parseFloat(amount),
      vendorId,
      orderId,
      notes,
    });

    res.status(200).json({
      success: true,
      message: 'UPI QR code generated successfully',
      qrData: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payment/verify-signature
 * Verify Razorpay payment signature after successful checkout popup
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are required for verification',
      });
    }

    const result = await verifySignatureService({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (result.success) {
      if (req.io) {
        req.io.emit('payment_success', {
          orderId: result.payment?.orderId,
          vendorId: result.payment?.vendorId,
          paymentId: razorpayPaymentId,
          amount: result.payment?.amount,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Payment signature verified successfully',
        payment: result.payment,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || 'Payment signature verification failed',
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payment/webhook
 * Handle automated webhook callbacks from Razorpay
 */
const processWebhook = async (req, res, next) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const result = await handleWebhookService(req.body, webhookSignature);

    res.status(200).json({
      status: 'ok',
      message: 'Webhook processed successfully',
      event: result.event,
    });
  } catch (error) {
    console.error('[Razorpay Webhook Error]:', error.message);
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

/**
 * GET /api/payment/:paymentId
 * Fetch single payment details by ID or order ID
 */
const getPaymentById = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findOne({
      where: {
        [Op.or]: [
          { id: paymentId },
          { orderId: paymentId },
          { razorpayOrderId: paymentId },
          { razorpayPaymentId: paymentId },
        ],
      },
    });

    if (!payment) {
      // Check if order exists directly to return clean pending status instead of 404
      const { Order } = require('../../order/models');
      const order = await Order.findByPk(paymentId);
      if (order) {
        return res.status(200).json({
          success: true,
          payment: {
            id: `pay_${order.id}`,
            orderId: order.id,
            vendorId: order.vendorId,
            amount: order.totalAmount,
            status: order.paymentStatus || 'pending',
            paymentMethod: order.paymentMethod || 'upi',
          },
        });
      }

      return res.status(404).json({
        success: false,
        message: `Payment details for '${paymentId}' not found`,
      });
    }

    res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payment
 * List payments with High-Performance Server-Side Pagination & SQL Aggregations
 */
const getAllPayments = async (req, res, next) => {
  try {
    const { vendorId, status } = req.query;
    
    // Pagination parameters (default page=1, limit=10, max limit=100)
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    const whereCondition = {};
    const baseVendorCondition = {};

    if (vendorId && vendorId !== 'all') {
      whereCondition.vendorId = vendorId;
      baseVendorCondition.vendorId = vendorId;
    }

    if (status && status !== 'all') {
      if (status === 'captured' || status === 'paid') {
        whereCondition.status = { [Op.in]: ['captured', 'paid', 'authorized'] };
      } else {
        whereCondition.status = status;
      }
    }

    const { Order } = require('../../order/models');
    const Vendor = require('../../vendor/models/Vendor');

    // ⚡ Fast Paginated Query using MySQL Indexes (LIMIT, OFFSET)
    const { count: totalFiltered, rows: payments } = await Payment.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      include: [
        { model: Order, as: 'orderDetails', attributes: ['id', 'tokenNumber', 'customerName', 'totalAmount', 'orderStatus'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    // ⚡ High-Speed SQL Aggregation across millions of rows without loading all into RAM
    const statsResult = await Payment.findAll({
      where: baseVendorCondition,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
      ],
      group: ['status'],
      raw: true,
    });

    let totalRevenue = 0;
    let totalCount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    statsResult.forEach(row => {
      const rowCount = parseInt(row.count) || 0;
      const rowSum = parseFloat(row.totalAmount) || 0;
      totalCount += rowCount;

      if (['captured', 'paid', 'authorized'].includes(row.status)) {
        totalRevenue += rowSum;
        paidCount += rowCount;
      } else if (row.status === 'created' || row.status === 'pending') {
        pendingCount += rowCount;
      } else if (row.status === 'failed') {
        failedCount += rowCount;
      }
    });

    const totalPages = Math.ceil(totalFiltered / limit) || 1;

    res.status(200).json({
      success: true,
      count: payments.length,
      pagination: {
        totalCount: totalFiltered,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      payments,
      stats: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCount,
        paidCount,
        pendingCount,
        failedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPaymentOrder,
  createPaymentQRCode,
  verifyPayment,
  processWebhook,
  getPaymentById,
  getAllPayments,
};
