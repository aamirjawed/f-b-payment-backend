const { Op } = require('sequelize');
const { Order, OrderItem } = require('../models');
const Payment = require('../../payment/models/Payment');
const Vendor = require('../../vendor/models/Vendor');
const { createOrderQrPayload, verifyOrderQrPayload } = require('../utils/qrSigner');

/**
 * POST /api/orders
 * Create a new Food Order for a specific bar/stall along with OrderItems & signed QR Payload
 */
const createOrder = async (req, res, next) => {
  try {
    const {
      orderId,
      vendorId,
      customerName = '',
      customerPhone = '',
      items = [],
      subtotal = 0,
      tax = 0,
      totalAmount,
      paymentMethod = 'upi',
      notes = '',
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item',
      });
    }

    // Resolve target stall/vendor
    let targetVendor = null;
    if (vendorId) {
      targetVendor = await Vendor.findByPk(vendorId);
    }
    if (!targetVendor) {
      targetVendor = await Vendor.findOne({ where: { isActive: true }, order: [['createdAt', 'ASC']] });
      if (!targetVendor) {
        targetVendor = await Vendor.findOne({ order: [['createdAt', 'ASC']] });
      }
    }

    const resolvedVendorId = targetVendor ? targetVendor.id : (vendorId || '');
    if (!resolvedVendorId) {
      return res.status(400).json({
        success: false,
        message: 'A valid stall/bar (vendorId) is required to place an order',
      });
    }

    const calculatedSubtotal = subtotal || items.reduce((acc, curr) => acc + (parseFloat(curr.price) * parseInt(curr.quantity || 1)), 0);
    const finalTotal = totalAmount !== undefined ? parseFloat(totalAmount) : (calculatedSubtotal + parseFloat(tax || 0));
    const generatedOrderId = orderId || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const tokenNumber = `Token #${Math.floor(10 + Math.random() * 90)}`;

    // Create Order Record in MySQL tied to vendorId
    const newOrder = await Order.create({
      id: generatedOrderId,
      vendorId: resolvedVendorId,
      tokenNumber,
      customerName,
      customerPhone,
      subtotal: parseFloat(calculatedSubtotal),
      tax: parseFloat(tax || 0),
      totalAmount: parseFloat(finalTotal),
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      notes,
    });

    // Create OrderItem Records in MySQL
    const itemRecords = items.map((item, idx) => ({
      id: `item_${generatedOrderId}_${idx + 1}`,
      orderId: generatedOrderId,
      menuItemId: item.id || item.menuItemId || `item_${idx + 1}`,
      name: item.name,
      price: parseFloat(item.price),
      quantity: parseInt(item.quantity) || 1,
      totalPrice: parseFloat(item.price) * (parseInt(item.quantity) || 1),
    }));

    await OrderItem.bulkCreate(itemRecords);

    // Fetch full created order with items and stall details
    const fullOrder = await Order.findByPk(generatedOrderId, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] },
      ],
    });

    // Generate compact signed QR Payload string
    const qrPayload = createOrderQrPayload(fullOrder, items);

    // Emit Real-time Socket.IO notification tagged with the bar/stall ID
    if (req.io) {
      req.io.emit('new_order_created', {
        orderId: generatedOrderId,
        vendorId: resolvedVendorId,
        stallName: targetVendor ? targetVendor.name : 'Food Stall',
        tokenNumber,
        totalAmount: finalTotal,
        itemsCount: items.length,
        qrPayload,
      });
    }

    res.status(201).json({
      success: true,
      message: `Food Order #${generatedOrderId} placed successfully for ${targetVendor ? targetVendor.name : resolvedVendorId}`,
      data: {
        ...fullOrder.toJSON(),
        qrPayload,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders
 * Fetch list of food orders with per-stall filtering & Server-Side Pagination
 */
const getOrders = async (req, res, next) => {
  try {
    const { vendorId, orderStatus, paymentStatus, search } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    const whereCondition = {};

    if (vendorId && vendorId !== 'all') {
      whereCondition.vendorId = vendorId;
    }
    if (orderStatus && orderStatus !== 'all') {
      if (orderStatus === 'paid_uncompleted') {
        whereCondition.paymentStatus = 'paid';
        whereCondition.orderStatus = { [Op.ne]: 'completed' };
      } else {
        whereCondition.orderStatus = orderStatus;
      }
    }
    if (paymentStatus && paymentStatus !== 'all') {
      whereCondition.paymentStatus = paymentStatus;
    }
    if (search) {
      whereCondition[Op.or] = [
        { id: { [Op.like]: `%${search}%` } },
        { tokenNumber: { [Op.like]: `%${search}%` } },
        { customerName: { [Op.like]: `%${search}%` } },
        { customerPhone: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count: totalFiltered, rows: orders } = await Order.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      include: [
        { model: OrderItem, as: 'items' },
        { model: Payment, as: 'paymentDetails' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] },
      ],
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    const totalPages = Math.ceil(totalFiltered / limit) || 1;

    const enrichedOrders = orders.map((ord) => ({
      ...ord.toJSON(),
      qrPayload: createOrderQrPayload(ord, ord.items || []),
    }));

    res.status(200).json({
      success: true,
      count: enrichedOrders.length,
      pagination: {
        totalCount: totalFiltered,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      data: enrichedOrders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/:id
 * Fetch single order details with items, payment, vendor, and signed QR Payload
 */
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await Order.findByPk(id, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: Payment, as: 'paymentDetails' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location', 'phone'] },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order with ID '${id}' not found`,
      });
    }

    const qrPayload = createOrderQrPayload(order, order.items || []);

    res.status(200).json({
      success: true,
      data: {
        ...order.toJSON(),
        qrPayload,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/verify-qr
 * Instantly verify scanned QR Data String (verifies HMAC signature & checks redemption in DB)
 */
const verifyOrderQrData = async (req, res, next) => {
  try {
    const { qrData, qrPayload } = req.body;
    const rawQr = qrData || qrPayload;

    const verified = verifyOrderQrPayload(rawQr);

    if (!verified.isValid) {
      return res.status(400).json({
        success: false,
        status: 'invalid_signature',
        message: `❌ ${verified.reason}`,
      });
    }

    const { orderId } = verified.order;
    const dbOrder = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] },
      ],
    });

    if (!dbOrder) {
      return res.status(404).json({
        success: false,
        status: 'not_found',
        message: `Order #${orderId} not found in system`,
      });
    }

    if (dbOrder.orderStatus === 'completed') {
      return res.status(200).json({
        success: true,
        status: 'already_redeemed',
        message: `⚠️ ALREADY REDEEMED at ${dbOrder.completedAt ? new Date(dbOrder.completedAt).toLocaleTimeString() : 'earlier'}`,
        order: dbOrder,
        completedAt: dbOrder.completedAt,
      });
    }

    if (dbOrder.orderStatus === 'cancelled') {
      return res.status(200).json({
        success: false,
        status: 'cancelled',
        message: `❌ Order #${orderId} was CANCELLED`,
        order: dbOrder,
      });
    }

    res.status(200).json({
      success: true,
      status: 'valid',
      message: `✅ VALID PAID TICKET - ${dbOrder.tokenNumber}`,
      order: {
        id: dbOrder.id,
        tokenNumber: dbOrder.tokenNumber,
        vendorId: dbOrder.vendorId,
        stallName: dbOrder.vendor?.name || 'Food Stall',
        customerName: dbOrder.customerName,
        totalAmount: dbOrder.totalAmount,
        orderStatus: dbOrder.orderStatus,
        paymentStatus: dbOrder.paymentStatus,
        items: dbOrder.items,
      },
      qrDetails: verified.order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/redeem-qr
 * One-Tap QR Scanner Redemption (verifies signature, marks completed, logs timestamp & broadcasts Socket.IO)
 */
const redeemOrderQr = async (req, res, next) => {
  try {
    const { qrData, qrPayload, orderId } = req.body;
    const rawQr = qrData || qrPayload;

    let targetOrderId = orderId;
    if (rawQr) {
      const verified = verifyOrderQrPayload(rawQr);
      if (!verified.isValid) {
        return res.status(400).json({
          success: false,
          message: `❌ ${verified.reason}`,
        });
      }
      targetOrderId = verified.order.orderId;
    }

    if (!targetOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID or QR Data is required to redeem order',
      });
    }

    const order = await Order.findByPk(targetOrderId, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber'] },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order #${targetOrderId} not found`,
      });
    }

    if (order.orderStatus === 'completed') {
      return res.status(409).json({
        success: false,
        status: 'already_redeemed',
        message: `⚠️ ALREADY REDEEMED at ${new Date(order.completedAt).toLocaleTimeString()}`,
        data: order,
      });
    }

    order.orderStatus = 'completed';
    order.completedAt = new Date();
    if (req.bartender?.id) {
      order.completedByBartenderId = req.bartender.id;
    }
    await order.save();

    if (req.io) {
      req.io.emit('order_status_updated', {
        orderId: order.id,
        vendorId: order.vendorId,
        stallName: order.vendor?.name || 'Food Stall',
        tokenNumber: order.tokenNumber,
        orderStatus: 'completed',
        completedAt: order.completedAt,
      });
    }

    res.status(200).json({
      success: true,
      message: `🎉 Order #${order.id} (${order.tokenNumber}) REDEEMED & COMPLETED!`,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/orders/:id/status
 * Update kitchen order status ('preparing', 'ready', 'completed', 'cancelled')
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    const order = await Order.findByPk(id, {
      include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber'] }],
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order with ID '${id}' not found`,
      });
    }

    if (orderStatus) {
      order.orderStatus = orderStatus;
    }
    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    if (orderStatus === 'completed' && !order.completedAt) {
      order.completedAt = new Date();
    }

    await order.save();

    if (req.io) {
      req.io.emit('order_status_updated', {
        orderId: order.id,
        vendorId: order.vendorId,
        stallName: order.vendor?.name || 'Food Stall',
        tokenNumber: order.tokenNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
      });
    }

    res.status(200).json({
      success: true,
      message: `Order #${id} status updated to '${order.orderStatus}'`,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  verifyOrderQrData,
  redeemOrderQr,
  updateOrderStatus,
};

