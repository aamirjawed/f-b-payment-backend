const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const Bartender = require('../models/Bartender');
const Vendor = require('../../vendor/models/Vendor');
const { Order, OrderItem } = require('../../order/models');
const Payment = require('../../payment/models/Payment');

/**
 * Generate a secure JWT token for bartender device session
 */
const generateBartenderToken = (bartender) => {
  const secret = process.env.JWT_SECRET || 'food_stall_super_secret_jwt_key_2026';
  return jwt.sign(
    {
      id: bartender.id,
      bartenderId: bartender.id,
      vendorId: bartender.vendorId,
      username: bartender.username,
      name: bartender.name,
      station: bartender.station,
      role: bartender.role,
    },
    secret,
    { expiresIn: '30d' } // Long-lived token for counter/station tablets
  );
};

/**
 * Helper to construct the dynamic QR Login URL for frontend rendering
 */
const buildQrLoginUrl = (bartender) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${clientUrl}/bartender/login?token=${bartender.pairingToken}&vendorId=${bartender.vendorId}&staffId=${bartender.id}`;
};

// ==========================================
// 1. ADMIN STAFF & BARTENDER MANAGEMENT APIs
// ==========================================

/**
 * POST /api/admin/bartenders - Create a new bartender/staff member with auto-generated credentials & QR pairing URL
 */
const createBartender = async (req, res, next) => {
  try {
    const {
      vendorId,
      name,
      station = 'Main Counter',
      role = 'bartender',
      username,
      password,
      pinCode,
    } = req.body;

    if (!vendorId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Vendor (stall ID) and Bartender Name are required',
      });
    }

    // Verify vendor/stall exists
    const vendor = await Vendor.findByPk(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: `Stall/Bar with ID '${vendorId}' not found`,
      });
    }

    // Generate unique ID
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const staffId = `BT-${vendor.slug || vendorId.slice(0, 8)}-${randomSuffix}`;

    // Auto-generate credentials if not provided
    const staffUsername = username
      ? username.trim()
      : `${cleanName || 'staff'}_${randomSuffix}`;
    const rawPassword = password || `Bar#${Math.floor(1000 + Math.random() * 9000)}`;
    const rawPin = pinCode ? String(pinCode).trim() : `${Math.floor(1000 + Math.random() * 9000)}`;
    const pairingToken = crypto.randomBytes(24).toString('hex');

    // Check unique username
    const existing = await Bartender.findOne({ where: { username: staffUsername } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Username '${staffUsername}' already exists. Please choose a different username.`,
      });
    }

    const newBartender = await Bartender.create({
      id: staffId,
      vendorId,
      name: name.trim(),
      username: staffUsername,
      password: rawPassword, // Model hook will hash password
      pinCode: rawPin,       // Model hook will hash pin
      station: station.trim(),
      role,
      pairingToken,
      isActive: true,
    });

    const qrLoginUrl = buildQrLoginUrl(newBartender);

    res.status(201).json({
      success: true,
      message: `Bartender '${newBartender.name}' registered successfully!`,
      data: {
        id: newBartender.id,
        name: newBartender.name,
        username: newBartender.username,
        station: newBartender.station,
        role: newBartender.role,
        vendorId: newBartender.vendorId,
        stallName: vendor.name,
        pairingToken: newBartender.pairingToken,
        qrLoginUrl,
        credentials: {
          username: staffUsername,
          password: rawPassword,
          pinCode: rawPin,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/bartenders - List all bartenders (with optional vendor filtering and performance metrics)
 */
const getAllBartenders = async (req, res, next) => {
  try {
    const { vendorId, activeOnly } = req.query;
    const whereCondition = {};

    if (vendorId && vendorId !== 'all') {
      whereCondition.vendorId = vendorId;
    }
    if (activeOnly === 'true') {
      whereCondition.isActive = true;
    }

    const bartenders = await Bartender.findAll({
      where: whereCondition,
      include: [
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Calculate completed orders count for each bartender
    const enrichedList = await Promise.all(
      bartenders.map(async (bt) => {
        const completedCount = await Order.count({
          where: { completedByBartenderId: bt.id },
        });

        return {
          id: bt.id,
          name: bt.name,
          username: bt.username,
          station: bt.station,
          role: bt.role,
          vendorId: bt.vendorId,
          stallName: bt.vendor?.name || 'Unknown Stall',
          stallNumber: bt.vendor?.stallNumber || '',
          isActive: bt.isActive,
          lastLoginAt: bt.lastLoginAt,
          pairingToken: bt.pairingToken,
          qrLoginUrl: buildQrLoginUrl(bt),
          stats: {
            completedOrders: completedCount,
          },
          createdAt: bt.createdAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedList.length,
      data: enrichedList,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/bartenders/:id - Get single bartender details with performance statistics
 */
const getBartenderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const bartender = await Bartender.findByPk(id, {
      include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] }],
    });

    if (!bartender) {
      return res.status(404).json({
        success: false,
        message: `Bartender with ID '${id}' not found`,
      });
    }

    const completedCount = await Order.count({
      where: { completedByBartenderId: id },
    });

    res.status(200).json({
      success: true,
      data: {
        id: bartender.id,
        name: bartender.name,
        username: bartender.username,
        station: bartender.station,
        role: bartender.role,
        vendorId: bartender.vendorId,
        stallName: bartender.vendor?.name || '',
        isActive: bartender.isActive,
        lastLoginAt: bartender.lastLoginAt,
        pairingToken: bartender.pairingToken,
        qrLoginUrl: buildQrLoginUrl(bartender),
        stats: {
          completedOrders: completedCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/bartenders/:id/regenerate-qr - Regenerate Pairing Token & QR Code URL
 */
const regenerateQrToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const bartender = await Bartender.findByPk(id);

    if (!bartender) {
      return res.status(404).json({
        success: false,
        message: `Bartender with ID '${id}' not found`,
      });
    }

    bartender.pairingToken = crypto.randomBytes(24).toString('hex');
    await bartender.save();

    const qrLoginUrl = buildQrLoginUrl(bartender);

    res.status(200).json({
      success: true,
      message: `New QR Pairing Token generated for '${bartender.name}'`,
      data: {
        id: bartender.id,
        pairingToken: bartender.pairingToken,
        qrLoginUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/bartenders/:id - Update bartender profile, station, status, or reset credentials
 */
const updateBartender = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, station, role, isActive, password, pinCode } = req.body;

    const bartender = await Bartender.findByPk(id);
    if (!bartender) {
      return res.status(404).json({
        success: false,
        message: `Bartender with ID '${id}' not found`,
      });
    }

    if (name) bartender.name = name.trim();
    if (station !== undefined) bartender.station = station.trim();
    if (role) bartender.role = role;
    if (isActive !== undefined) bartender.isActive = isActive;
    if (password) bartender.password = password; // Hook will hash
    if (pinCode) bartender.pinCode = String(pinCode).trim(); // Hook will hash

    await bartender.save();

    res.status(200).json({
      success: true,
      message: `Bartender '${bartender.name}' updated successfully`,
      data: {
        id: bartender.id,
        name: bartender.name,
        username: bartender.username,
        station: bartender.station,
        role: bartender.role,
        isActive: bartender.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/bartenders/:id - Delete a bartender
 */
const deleteBartender = async (req, res, next) => {
  try {
    const { id } = req.params;
    const bartender = await Bartender.findByPk(id);

    if (!bartender) {
      return res.status(404).json({
        success: false,
        message: `Bartender with ID '${id}' not found`,
      });
    }

    await bartender.destroy();

    res.status(200).json({
      success: true,
      message: `Bartender with ID '${id}' deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. BARTENDER DEVICE AUTHENTICATION APIs
// ==========================================

/**
 * POST /api/bartenders/auth/qr - Device auto-login via scanned QR Pairing Token
 */
const loginWithQrToken = async (req, res, next) => {
  try {
    const { token, pairingToken } = req.body;
    const targetToken = token || pairingToken;

    if (!targetToken) {
      return res.status(400).json({
        success: false,
        message: 'Pairing token is required to log in via QR',
      });
    }

    const bartender = await Bartender.findOne({
      where: { pairingToken: targetToken, isActive: true },
      include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] }],
    });

    if (!bartender) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or revoked QR code. Please ask the manager for a new pairing code.',
      });
    }

    bartender.lastLoginAt = new Date();
    await bartender.save();

    const sessionToken = generateBartenderToken(bartender);

    res.status(200).json({
      success: true,
      message: `Welcome, ${bartender.name}! Station device paired.`,
      token: sessionToken,
      bartender: {
        id: bartender.id,
        name: bartender.name,
        username: bartender.username,
        station: bartender.station,
        role: bartender.role,
        vendorId: bartender.vendorId,
        stallName: bartender.vendor?.name || 'Food Stall',
        stallNumber: bartender.vendor?.stallNumber || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/bartenders/auth/pin - Fast 4-Digit PIN login
 */
const loginWithPin = async (req, res, next) => {
  try {
    const { vendorId, staffId, username, pinCode } = req.body;

    if (!pinCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your 4-digit PIN',
      });
    }

    const whereClause = { isActive: true };
    if (staffId) {
      whereClause.id = staffId;
    } else if (username) {
      whereClause.username = username;
    } else if (vendorId) {
      whereClause.vendorId = vendorId;
    }

    // Find candidate staff members
    const staffMembers = await Bartender.findAll({
      where: whereClause,
      include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] }],
    });

    if (!staffMembers || staffMembers.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'No active bartender found matching the specified ID or stall',
      });
    }

    // Compare PIN against candidate(s)
    let authenticatedStaff = null;
    for (const member of staffMembers) {
      const isPinMatch = await member.comparePin(pinCode);
      if (isPinMatch) {
        authenticatedStaff = member;
        break;
      }
    }

    if (!authenticatedStaff) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect PIN. Please try again.',
      });
    }

    authenticatedStaff.lastLoginAt = new Date();
    await authenticatedStaff.save();

    const sessionToken = generateBartenderToken(authenticatedStaff);

    res.status(200).json({
      success: true,
      message: `Welcome, ${authenticatedStaff.name}!`,
      token: sessionToken,
      bartender: {
        id: authenticatedStaff.id,
        name: authenticatedStaff.name,
        username: authenticatedStaff.username,
        station: authenticatedStaff.station,
        role: authenticatedStaff.role,
        vendorId: authenticatedStaff.vendorId,
        stallName: authenticatedStaff.vendor?.name || 'Food Stall',
        stallNumber: authenticatedStaff.vendor?.stallNumber || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/bartenders/auth/password - Standard Username & Password login
 */
const loginWithPassword = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password',
      });
    }

    const cleanUser = username.trim();
    const cleanPass = password.trim();
    const { Op } = require('sequelize');

    let bartender = await Bartender.findOne({
      where: {
        [Op.or]: [
          { username: cleanUser },
          { id: cleanUser },
          { vendorId: cleanUser },
          { username: `bar_${cleanUser}` },
          { username: cleanUser.replace(/^bar_/, '') },
        ],
        isActive: true,
      },
      include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] }],
    });

    if (!bartender) {
      // Fallback: Check Admin table for Bar/Vendor accounts (e.g. bar_vendor-main-stall)
      const Admin = require('../../admin/models/Admin');
      const adminAccount = await Admin.findOne({
        where: {
          [Op.or]: [
            { username: cleanUser },
            { email: cleanUser },
            { username: `bar_${cleanUser}` },
            { username: cleanUser.replace(/^bar_/, '') },
          ],
        },
      });

      if (adminAccount) {
        const isMatch = await adminAccount.comparePassword(cleanPass);
        if (isMatch) {
          // Resolve vendor record
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

          const sessionToken = generateBartenderToken({
            id: `admin-${adminAccount.id}`,
            vendorId: vendor ? vendor.id : 'global',
            username: adminAccount.username,
            name: vendor ? vendor.name : adminAccount.username,
            station: 'Main Bar',
            role: 'counter_lead',
          });

          return res.status(200).json({
            success: true,
            message: 'Bar login successful',
            token: sessionToken,
            bartender: {
              id: `admin-${adminAccount.id}`,
              name: vendor ? vendor.name : adminAccount.username,
              username: adminAccount.username,
              station: 'Main Bar',
              role: 'counter_lead',
              vendorId: vendor ? vendor.id : 'global',
              stallName: vendor ? vendor.name : 'Food Stall',
              stallNumber: vendor ? vendor.stallNumber || '' : '',
            },
          });
        }
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    const isMatch = await bartender.comparePassword(cleanPass);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    bartender.lastLoginAt = new Date();
    await bartender.save();

    const sessionToken = generateBartenderToken(bartender);

    res.status(200).json({
      success: true,
      message: 'Bartender login successful',
      token: sessionToken,
      bartender: {
        id: bartender.id,
        name: bartender.name,
        username: bartender.username,
        station: bartender.station,
        role: bartender.role,
        vendorId: bartender.vendorId,
        stallName: bartender.vendor?.name || 'Food Stall',
        stallNumber: bartender.vendor?.stallNumber || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/bartenders/me - Get current logged in bartender session info
 */
const getBartenderProfile = async (req, res, next) => {
  try {
    const bartenderId = req.bartender?.id;
    let bartender = await Bartender.findByPk(bartenderId, {
      attributes: { exclude: ['password', 'pinCode'] },
      include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber', 'location'] }],
    });

    if (!bartender) {
      if (req.bartender) {
        const vendor = await Vendor.findByPk(req.bartender.vendorId);
        return res.status(200).json({
          success: true,
          bartender: {
            id: req.bartender.id,
            name: req.bartender.name,
            username: req.bartender.username,
            station: req.bartender.station || 'Main Bar',
            role: req.bartender.role || 'counter_lead',
            vendorId: req.bartender.vendorId,
            vendor: vendor ? vendor.toJSON() : null,
            stats: { todayCompletedOrders: 0 },
          },
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Bartender session not found',
      });
    }

    const completedToday = await Order.count({
      where: {
        completedByBartenderId: bartenderId,
        createdAt: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    res.status(200).json({
      success: true,
      bartender: {
        ...bartender.toJSON(),
        stats: {
          todayCompletedOrders: completedToday,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. BARTENDER ORDER DISPLAY & FULFILLMENT APIs
// ==========================================

/**
 * GET /api/bartenders/orders - Fetch active/live orders for the bartender's assigned stall
 */
const getBartenderOrders = async (req, res, next) => {
  try {
    const vendorId = req.bartender?.vendorId;
    const { status, limit = 50 } = req.query;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'No stall/vendor associated with this bartender account',
      });
    }

    const whereCondition = { vendorId };

    if (status) {
      if (status === 'active') {
        whereCondition.orderStatus = { [Op.in]: ['pending', 'preparing', 'ready'] };
      } else {
        whereCondition.orderStatus = status;
      }
    }

    const orders = await Order.findAll({
      where: whereCondition,
      limit: parseInt(limit, 10),
      order: [['createdAt', 'ASC']], // Oldest pending first for kitchen queue
      include: [
        { model: OrderItem, as: 'items' },
        { model: Payment, as: 'paymentDetails' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber'] },
      ],
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
 * PATCH /api/bartenders/orders/:id/status - Update order status & log bartender fulfillment
 */
const updateBartenderOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;
    const bartenderId = req.bartender?.id;
    const vendorId = req.bartender?.vendorId;

    if (!orderStatus) {
      return res.status(400).json({
        success: false,
        message: 'orderStatus is required (e.g. preparing, ready, completed, cancelled)',
      });
    }

    const whereClause = { id };
    if (vendorId) {
      whereClause.vendorId = vendorId;
    }

    const order = await Order.findOne({
      where: whereClause,
      include: [
        { model: OrderItem, as: 'items' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'name', 'stallNumber'] },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order #${id} not found or does not belong to your stall`,
      });
    }

    order.orderStatus = orderStatus;

    if (orderStatus === 'completed') {
      order.completedByBartenderId = bartenderId || null;
      order.completedAt = new Date();
    }

    await order.save();

    // Broadcast real-time Socket.IO notification to Customer Token Screens & Admin
    if (req.io) {
      req.io.emit('order_status_updated', {
        orderId: order.id,
        vendorId: order.vendorId,
        stallName: order.vendor?.name || 'Food Stall',
        tokenNumber: order.tokenNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        completedBy: req.bartender?.name || 'Bartender',
        completedAt: order.completedAt,
      });
    }

    res.status(200).json({
      success: true,
      message: `Order #${order.id} status updated to '${order.orderStatus}' by ${req.bartender?.name || 'Bartender'}`,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBartender,
  getAllBartenders,
  getBartenderById,
  regenerateQrToken,
  updateBartender,
  deleteBartender,
  loginWithQrToken,
  loginWithPin,
  loginWithPassword,
  getBartenderProfile,
  getBartenderOrders,
  updateBartenderOrderStatus,
};
