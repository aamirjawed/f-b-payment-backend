const { Order, OrderItem } = require('../models');
const Payment = require('../../payment/models/Payment');
const Vendor = require('../../vendor/models/Vendor');
const sequelize = require('../../config/database');

/**
 * GET /api/orders/analytics (also mounted on /api/admin/analytics)
 * Get complete system analytics for Admin and multi-bar tracking
 */
const getDashboardAnalytics = async (req, res, next) => {
  try {
    const { vendorId } = req.query;
    const isFiltered = vendorId && vendorId !== 'all';
    const whereCondition = {};

    if (isFiltered) {
      whereCondition.vendorId = vendorId;
    }

    // 1. Total Revenue calculation (captured payments)
    const totalRevenueResult = await Payment.findAll({
      where: {
        ...(isFiltered ? { vendorId } : {}),
        status: 'captured',
      },
      attributes: [[sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']],
    });
    const totalRevenue = parseFloat(totalRevenueResult[0]?.dataValues?.totalRevenue || 0);

    // 2. Orders Count & Status Breakdown
    const totalOrdersCount = await Order.count({ where: whereCondition });
    const pendingOrdersCount = await Order.count({ where: { ...whereCondition, orderStatus: 'pending' } });
    const preparingOrdersCount = await Order.count({ where: { ...whereCondition, orderStatus: 'preparing' } });
    const readyOrdersCount = await Order.count({ where: { ...whereCondition, orderStatus: 'ready' } });
    const completedOrdersCount = await Order.count({ where: { ...whereCondition, orderStatus: 'completed' } });
    const cancelledOrdersCount = await Order.count({ where: { ...whereCondition, orderStatus: 'cancelled' } });

    // 3. Payment Status Breakdown
    const paidOrdersCount = await Order.count({ where: { ...whereCondition, paymentStatus: 'paid' } });
    const pendingPaymentOrdersCount = await Order.count({ where: { ...whereCondition, paymentStatus: 'pending' } });

    // 4. Top Selling Food Items (Filtered or Global)
    const itemInclude = isFiltered
      ? [{ model: Order, as: 'order', where: { vendorId }, attributes: [] }]
      : [];

    const topItemsResult = await OrderItem.findAll({
      attributes: [
        'name',
        'menuItemId',
        [sequelize.fn('SUM', sequelize.col('OrderItem.quantity')), 'totalQuantitySold'],
        [sequelize.fn('SUM', sequelize.col('OrderItem.totalPrice')), 'totalRevenueGenerated'],
      ],
      include: itemInclude,
      group: ['OrderItem.name', 'OrderItem.menuItemId'],
      order: [[sequelize.literal('totalQuantitySold'), 'DESC']],
      limit: 6,
    });

    // 5. Multi-Stall / Multi-Bar Performance Breakdown
    const vendorsList = await Vendor.findAll({
      attributes: ['id', 'name', 'slug', 'stallNumber', 'location', 'email', 'phone', 'isActive', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });

    const stallsBreakdown = await Promise.all(
      vendorsList.map(async (v) => {
        const vData = v.toJSON();
        const stallOrders = await Order.count({ where: { vendorId: v.id } });
        const stallPending = await Order.count({ where: { vendorId: v.id, orderStatus: 'pending' } });
        const stallRevResult = await Payment.findAll({
          where: { vendorId: v.id, status: 'captured' },
          attributes: [[sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']],
        });
        const stallRevenue = parseFloat(stallRevResult[0]?.dataValues?.totalRevenue || 0);

        return {
          ...vData,
          totalOrders: stallOrders,
          pendingOrders: stallPending,
          totalRevenue: Math.round(stallRevenue * 100) / 100,
        };
      })
    );

    // Selected stall metadata if filtered
    let currentStall = null;
    if (isFiltered) {
      currentStall = stallsBreakdown.find((s) => s.id === vendorId) || null;
    }

    res.status(200).json({
      success: true,
      filter: {
        vendorId: vendorId || 'all',
        isFiltered,
      },
      currentStall,
      analytics: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        orders: {
          total: totalOrdersCount,
          pending: pendingOrdersCount,
          preparing: preparingOrdersCount,
          ready: readyOrdersCount,
          completed: completedOrdersCount,
          cancelled: cancelledOrdersCount,
          paid: paidOrdersCount,
          pendingPayment: pendingPaymentOrdersCount,
        },
        topSellingItems: topItemsResult.map((item) => ({
          name: item.name,
          menuItemId: item.menuItemId,
          totalQuantitySold: parseInt(item.dataValues.totalQuantitySold) || 0,
          totalRevenueGenerated: Math.round((parseFloat(item.dataValues.totalRevenueGenerated) || 0) * 100) / 100,
        })),
        totalVendors: vendorsList.length,
        activeVendors: vendorsList.filter((v) => v.isActive).length,
        stalls: stallsBreakdown,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardAnalytics,
};
