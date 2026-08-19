const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

/**
 * POST /api/admin/login - Admin Login
 */
const adminLogin = async (req, res, next) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username/email and password',
      });
    }

    const { Op } = require('sequelize');
    const admin = await Admin.findOne({
      where: {
        [Op.or]: [
          { username: usernameOrEmail },
          { email: usernameOrEmail },
        ],
      },
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const secret = process.env.JWT_SECRET || 'food_stall_super_secret_jwt_key_2026';
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        email: admin.email,
      },
      secret,
      { expiresIn: '30d' } // Extended 30 days session for tablets & mobile devices
    );

    res.status(200).json({
      success: true,
      message: 'Admin authentication successful',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/logout - Admin Logout
 */
const adminLogout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin logged out successfully',
  });
};

/**
 * GET /api/admin/me - Get currently logged-in Admin profile
 */
const getAdminProfile = async (req, res, next) => {
  try {
    const admin = await Admin.findByPk(req.admin.id, {
      attributes: { exclude: ['password'] },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin profile not found',
      });
    }

    res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/reset-database - Wipe all mock / transaction / stall data from MySQL
 */
const resetDatabase = async (req, res, next) => {
  try {
    const { Category, MenuItem, Vendor } = require('../../food-menu/models');
    const { Order, OrderItem } = require('../../order/models');
    const Payment = require('../../payment/models/Payment');
    const Bartender = require('../../bartender/models/Bartender');
    const { Op } = require('sequelize');

    await Payment.destroy({ where: {} }).catch(() => {});
    await OrderItem.destroy({ where: {} }).catch(() => {});
    await Order.destroy({ where: {} }).catch(() => {});
    await MenuItem.destroy({ where: {} }).catch(() => {});
    await Category.destroy({ where: {} }).catch(() => {});
    await Bartender.destroy({ where: {} }).catch(() => {});
    await Vendor.destroy({ where: {} }).catch(() => {});
    // Remove all stall admin accounts except super admin 'admin'
    await Admin.destroy({ where: { username: { [Op.ne]: 'admin' } } }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'All stalls, bartenders, menu items, categories, orders, and payments have been completely wiped from the database. Clean slate ready.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  adminLogin,
  adminLogout,
  getAdminProfile,
  resetDatabase,
};

