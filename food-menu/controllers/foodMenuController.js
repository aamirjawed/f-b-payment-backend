const { MenuItem, Category, Vendor } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/menu - Public endpoint to get menu items and categories for a specific vendor / stall
 * Query params: vendorId (optional), category, search, isVeg
 */
const getMenuItems = async (req, res, next) => {
  try {
    let { vendorId, category, search, isVeg } = req.query;

    let targetVendor = null;
    if (vendorId && vendorId !== 'all') {
      targetVendor = await Vendor.findByPk(vendorId);
      if (!targetVendor) {
        targetVendor = await Vendor.findOne({ where: { slug: vendorId } });
      }
    }

    // If no vendorId provided or not found, pick first active vendor
    if (!targetVendor && !vendorId) {
      targetVendor = await Vendor.findOne({
        where: { isActive: true },
        order: [['createdAt', 'ASC']],
      });
      if (!targetVendor) {
        targetVendor = await Vendor.findOne({ order: [['createdAt', 'ASC']] });
      }
    }

    const resolvedVendorId = targetVendor ? targetVendor.id : (vendorId || null);

    // Filter conditions for menu items
    const itemWhere = { isAvailable: true };

    if (category && category !== 'all') {
      itemWhere.category = category;
    }

    if (isVeg !== undefined) {
      itemWhere.isVeg = isVeg === 'true' || isVeg === true;
    }

    if (search) {
      itemWhere[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    // Attempt 1: Fetch scoped by resolvedVendorId, vendor-main-stall, or global
    if (resolvedVendorId) {
      itemWhere.vendorId = {
        [Op.or]: [resolvedVendorId, 'vendor-main-stall', 'global', null],
      };
    }

    let items = await MenuItem.findAll({
      where: itemWhere,
      order: [['category', 'ASC'], ['id', 'ASC']],
    });

    // Fallback: If no items found for exact vendorId string, return all available items (single master vendor model)
    if (items.length === 0) {
      delete itemWhere.vendorId;
      items = await MenuItem.findAll({
        where: itemWhere,
        order: [['category', 'ASC'], ['id', 'ASC']],
      });
    }

    const categoryWhere = {};
    if (resolvedVendorId) {
      categoryWhere.vendorId = {
        [Op.or]: [resolvedVendorId, 'vendor-main-stall', 'global', null],
      };
    }

    let categories = await Category.findAll({
      where: categoryWhere,
      order: [['id', 'ASC']],
    });

    if (categories.length === 0) {
      categories = await Category.findAll({
        order: [['id', 'ASC']],
      });
    }

    res.status(200).json({
      success: true,
      vendorId: resolvedVendorId,
      stall: targetVendor ? {
        id: targetVendor.id,
        name: targetVendor.name,
        stallNumber: targetVendor.stallNumber,
        location: targetVendor.location,
        isActive: targetVendor.isActive,
      } : null,
      categories,
      count: items.length,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMenuItems,
};
