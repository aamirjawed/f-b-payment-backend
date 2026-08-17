const Vendor = require('../models/Vendor');
const Admin = require('../../admin/models/Admin');
const { Order, OrderItem } = require('../../order/models');
const Payment = require('../../payment/models/Payment');
const sequelize = require('../../config/database');

const jwt = require('jsonwebtoken');

/**
 * Helper to build customer Food Menu QR code URL
 */
const buildMenuQrUrl = (vendor) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  return `${clientUrl}/menu?vendorId=${vendor.id}`;
};

/**
 * Helper to generate JWT token for bar device login
 */
const generateVendorToken = (vendor, adminAccount) => {
  const secret = process.env.JWT_SECRET || 'food_stall_super_secret_jwt_key_2026';
  return jwt.sign(
    {
      id: adminAccount ? adminAccount.id : vendor.id,
      vendorId: vendor.id,
      stallName: vendor.name,
      username: adminAccount ? adminAccount.username : vendor.email,
      role: 'vendor',
    },
    secret,
    { expiresIn: '30d' }
  );
};

/**
 * GET /api/vendors - Fetch all vendors/bars/stalls (with menu QR URL and live tracking statistics)
 */
const getAllVendors = async (req, res, next) => {
  try {
    const { includeStats, activeOnly } = req.query;
    const whereCondition = {};
    if (activeOnly === 'true') {
      whereCondition.isActive = true;
    }

    const vendors = await Vendor.findAll({
      where: whereCondition,
      order: [['createdAt', 'ASC']],
    });

    const vendorStats = await Promise.all(
      vendors.map(async (v) => {
        const vData = v.toJSON();
        const orderCount = await Order.count({ where: { vendorId: v.id } });
        const pendingOrders = await Order.count({ where: { vendorId: v.id, orderStatus: 'pending' } });
        const completedOrders = await Order.count({ where: { vendorId: v.id, orderStatus: 'completed' } });
        const revenueResult = await Payment.findAll({
          where: { vendorId: v.id, status: 'captured' },
          attributes: [[sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']],
        });
        const totalRevenue = parseFloat(revenueResult[0]?.dataValues?.totalRevenue || 0);

        return {
          ...vData,
          menuQrUrl: buildMenuQrUrl(v),
          stats: {
            totalOrders: orderCount,
            pendingOrders,
            completedOrders,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
          },
        };
      })
    );

    res.status(200).json({
      success: true,
      count: vendorStats.length,
      data: vendorStats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/vendors/:id - Fetch single vendor/bar by ID with menu QR and statistics
 */
const getVendorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByPk(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: `Stall/Bar with ID '${id}' not found`,
      });
    }

    const orderCount = await Order.count({ where: { vendorId: id } });
    const pendingOrders = await Order.count({ where: { vendorId: id, orderStatus: 'pending' } });
    const completedOrders = await Order.count({ where: { vendorId: id, orderStatus: 'completed' } });
    const revenueResult = await Payment.findAll({
      where: { vendorId: id, status: 'captured' },
      attributes: [[sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']],
    });
    const totalRevenue = parseFloat(revenueResult[0]?.dataValues?.totalRevenue || 0);

    res.status(200).json({
      success: true,
      data: {
        ...vendor.toJSON(),
        menuQrUrl: buildMenuQrUrl(vendor),
        stats: {
          totalOrders: orderCount,
          pendingOrders,
          completedOrders,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/vendors - Admin create a new bar/stall with auto-generated login credentials & Menu QR URL
 */
const createVendor = async (req, res, next) => {
  try {
    const {
      id,
      name,
      email,
      phone = '',
      stallNumber = '',
      location = '',
      description = '',
      adminUsername,
      adminPassword,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Stall/Bar name is required',
      });
    }

    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const vendorId = id ? id.trim() : `stall-${baseSlug || randomSuffix}`;
    const vendorEmail = email ? email.trim() : `${vendorId}@foodstall.local`;

    // Check if ID already exists
    const existingVendor = await Vendor.findOne({ where: { id: vendorId } });
    if (existingVendor) {
      return res.status(409).json({
        success: false,
        message: `A stall with ID '${vendorId}' already exists. Please choose a unique ID.`,
      });
    }

    // Auto-generate clean login credentials if not provided
    const cleanUsername = adminUsername ? adminUsername.trim() : `bar_${baseSlug || 'stall'}_${randomSuffix}`;
    const cleanPassword = adminPassword ? adminPassword.trim() : `Bar@${Math.floor(1000 + Math.random() * 9000)}`;

    // Create Vendor record
    const newVendor = await Vendor.create({
      id: vendorId,
      name,
      slug: `${baseSlug}-${Date.now().toString().slice(-4)}`,
      email: vendorEmail,
      phone,
      stallNumber: stallNumber || `Stall #${Date.now().toString().slice(-3)}`,
      location,
      description,
      isActive: true,
    });

    // Create Bar Admin login account
    const vendorAdmin = await Admin.create({
      username: cleanUsername,
      email: vendorEmail,
      password: cleanPassword,
    });

    // Also create Bartender record for instant Bartender Portal compatibility
    const Bartender = require('../../bartender/models/Bartender');
    const crypto = require('crypto');
    const staffId = `BT-${newVendor.id.replace(/[^a-z0-9-]/gi, '')}`;
    const pairingToken = crypto.randomBytes(24).toString('hex');
    
    await Bartender.findOrCreate({
      where: { username: cleanUsername },
      defaults: {
        id: staffId,
        vendorId: newVendor.id,
        name: newVendor.name,
        username: cleanUsername,
        password: cleanPassword,
        pinCode: '1234',
        station: 'Main Bar',
        role: 'counter_lead',
        pairingToken,
        isActive: true,
      },
    }).catch(() => {});

    const menuQrUrl = buildMenuQrUrl(newVendor);

    res.status(201).json({
      success: true,
      message: `Bar/Stall '${newVendor.name}' created successfully with auto-generated login!`,
      vendor: {
        ...newVendor.toJSON(),
        menuQrUrl,
      },
      loginCredentials: {
        username: cleanUsername,
        password: cleanPassword,
        loginUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/login`,
      },
      menuQrUrl,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/vendors/login - Bar device login with username & password
 */
const loginVendor = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const { Op } = require('sequelize');
    const adminAccount = await Admin.findOne({
      where: {
        [Op.or]: [{ username }, { email: username }],
      },
    });

    if (!adminAccount) {
      return res.status(401).json({
        success: false,
        message: 'Invalid bar username or password',
      });
    }

    const isMatch = await adminAccount.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid bar username or password',
      });
    }

    // Resolve associated Vendor / Bar record by email prefix or ID
    let vendor = await Vendor.findOne({
      where: {
        [Op.or]: [
          { email: adminAccount.email },
          { id: adminAccount.username.replace(/^bar_/, '') },
        ],
      },
    });

    if (!vendor) {
      vendor = await Vendor.findOne({ where: { isActive: true }, order: [['createdAt', 'ASC']] });
    }

    const token = generateVendorToken(vendor || { id: 'admin', name: 'Admin Bar' }, adminAccount);

    res.status(200).json({
      success: true,
      message: `Bar logged in successfully as ${adminAccount.username}`,
      token,
      bar: {
        id: vendor ? vendor.id : 'all',
        name: vendor ? vendor.name : 'Food Stall Bar',
        stallNumber: vendor ? vendor.stallNumber : '',
        location: vendor ? vendor.location : '',
        menuQrUrl: vendor ? buildMenuQrUrl(vendor) : '',
        username: adminAccount.username,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/vendors/:id/orders - Fetch orders specifically for this bar/stall
 */
const getVendorOrders = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const whereClause = { vendorId: id };
    if (status && status !== 'all') {
      whereClause.orderStatus = status;
    }

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        { model: OrderItem, as: 'items' },
        { model: Payment, as: 'paymentDetails' },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/vendors/orders/:orderId/complete - Bar ticks/marks order as completed
 */
const completeVendorOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, {
      include: [{ model: Vendor, as: 'vendor' }, { model: OrderItem, as: 'items' }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order with ID '${orderId}' not found`,
      });
    }

    order.orderStatus = 'completed';
    order.completedAt = new Date();
    await order.save();

    // Broadcast Real-time event
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
      message: `Order #${order.id} (Token: ${order.tokenNumber}) marked as COMPLETED by bar`,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/vendors/:id - Admin update an existing vendor/bar/stall
 */
const updateVendor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByPk(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: `Stall/Bar with ID '${id}' not found`,
      });
    }

    const { name, email, phone, stallNumber, location, description, isActive } = req.body;

    if (name) {
      vendor.name = name;
    }
    if (email) vendor.email = email;
    if (phone !== undefined) vendor.phone = phone;
    if (stallNumber !== undefined) vendor.stallNumber = stallNumber;
    if (location !== undefined) vendor.location = location;
    if (description !== undefined) vendor.description = description;
    if (isActive !== undefined) vendor.isActive = isActive;

    await vendor.save();

    res.status(200).json({
      success: true,
      message: `Stall/Bar '${vendor.name}' updated successfully`,
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/vendors/:id - Admin delete a vendor/bar/stall
 */
const deleteVendor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByPk(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: `Stall/Bar with ID '${id}' not found`,
      });
    }

    // Clean up or cascade delete associated orders and payments if required
    await Payment.destroy({ where: { vendorId: id } });
    await Order.destroy({ where: { vendorId: id } });
    await vendor.destroy();

    res.status(200).json({
      success: true,
      message: `Stall/Bar with ID '${id}' and all its associated local records deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  loginVendor,
  getVendorOrders,
  completeVendorOrder,
};
