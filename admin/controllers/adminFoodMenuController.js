const { MenuItem, Category } = require('../../food-menu/models');
const { Op } = require('sequelize');

/**
 * GET /api/admin/menu - Get admin dashboard data & menu list
 */
const getAdminMenuDashboard = async (req, res, next) => {
  try {
    const { category, search, isAvailable, vendorId } = req.query;
    const whereCondition = {};

    if (vendorId && vendorId !== 'all') {
      whereCondition.vendorId = {
        [Op.or]: [vendorId, 'global'],
      };
    }

    if (category && category !== 'all') {
      whereCondition.category = category;
    }

    if (isAvailable !== undefined && isAvailable !== 'all') {
      whereCondition.isAvailable = isAvailable === 'true' || isAvailable === true;
    }

    if (search) {
      whereCondition[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    const items = await MenuItem.findAll({
      where: whereCondition,
      order: [['category', 'ASC'], ['createdAt', 'DESC'], ['id', 'ASC']],
    });

    const categories = await Category.findAll({
      order: [['id', 'ASC']],
    });

    const totalItems = await MenuItem.count();
    const availableItems = await MenuItem.count({ where: { isAvailable: true } });
    const outOfStockItems = totalItems - availableItems;

    res.status(200).json({
      success: true,
      stats: {
        totalItems,
        availableItems,
        outOfStockItems,
        totalCategories: categories.length,
      },
      categories,
      count: items.length,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/menu - Admin add new menu item
 */
const adminCreateMenuItem = async (req, res, next) => {
  try {
    const {
      id,
      vendorId = 'global',
      name,
      description = '',
      price,
      category,
      subCategory,
      isVeg = true,
      rating = 4.5,
      spicyLevel = 0,
      popular = false,
      image = '',
      isAvailable = true,
    } = req.body;

    if (!name || price === undefined || !category || !subCategory) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed: name, price, category, and subCategory are required fields',
      });
    }

    // Check if category exists by ID or Name
    let targetCategory = await Category.findOne({
      where: {
        [Op.or]: [
          { id: category },
          { name: category },
        ],
      },
    });

    // Auto-create category if it does not exist in MySQL database yet
    if (!targetCategory) {
      const catId = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      targetCategory = await Category.findOrCreate({
        where: { id: catId },
        defaults: {
          id: catId,
          vendorId: vendorId || 'global',
          name: category.charAt(0).toUpperCase() + category.slice(1),
          icon: '',
          subCategories: ['All', subCategory],
        },
      }).then(([cat]) => cat);
    }

    const generatedId = id || `item-${Date.now()}`;

    const newItem = await MenuItem.create({
      id: generatedId,
      vendorId: vendorId || 'global',
      name,
      description,
      price: parseFloat(price),
      category: targetCategory.id,
      subCategory,
      isVeg: isVeg === true || isVeg === 'true',
      rating: parseFloat(rating),
      spicyLevel: parseInt(spicyLevel) || 0,
      popular: popular === true || popular === 'true',
      image,
      isAvailable: isAvailable === true || isAvailable === 'true',
    });

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully and synced across all bars/stalls',
      data: newItem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/menu/:id - Admin update menu item
 */
const adminUpdateMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await MenuItem.findByPk(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Menu item with ID '${id}' not found`,
      });
    }

    const updateFields = { ...req.body };
    if (updateFields.isAvailable !== undefined) {
      updateFields.isAvailable = updateFields.isAvailable === true || updateFields.isAvailable === 'true';
    }
    if (updateFields.isVeg !== undefined) {
      updateFields.isVeg = updateFields.isVeg === true || updateFields.isVeg === 'true';
    }
    if (updateFields.price !== undefined) {
      updateFields.price = parseFloat(updateFields.price);
    }

    // If updating category, ensure it exists in database
    if (updateFields.category) {
      let targetCategory = await Category.findOne({
        where: {
          [Op.or]: [
            { id: updateFields.category },
            { name: updateFields.category },
          ],
        },
      });

      if (!targetCategory) {
        const catId = updateFields.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        targetCategory = await Category.findOrCreate({
          where: { id: catId },
          defaults: {
            id: catId,
            vendorId: updateFields.vendorId || 'global',
            name: updateFields.category.charAt(0).toUpperCase() + updateFields.category.slice(1),
            icon: '',
            subCategories: ['All'],
          },
        }).then(([cat]) => cat);
      }
      updateFields.category = targetCategory.id;
    }

    await item.update(updateFields);

    res.status(200).json({
      success: true,
      message: 'Menu item updated successfully',
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/menu/:id - Admin delete menu item
 */
const adminDeleteMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await MenuItem.findByPk(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Menu item with ID '${id}' not found`,
      });
    }

    await item.destroy();

    res.status(200).json({
      success: true,
      message: `Menu item with ID '${id}' removed successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/categories - Admin create new category
 */
const adminCreateCategory = async (req, res, next) => {
  try {
    const { name, icon = '', subCategories = ['All'], id: customId, vendorId = 'global' } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    const catId = customId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const [category, created] = await Category.findOrCreate({
      where: { id: catId },
      defaults: { id: catId, vendorId: vendorId || 'global', name, icon, subCategories },
    });

    if (!created) {
      category.name = name;
      if (icon) category.icon = icon;
      if (subCategories) category.subCategories = subCategories;
      if (vendorId) category.vendorId = vendorId;
      await category.save();
    }

    res.status(201).json({
      success: true,
      message: created ? 'Category created successfully' : 'Category already existed (updated)',
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/categories/:id - Admin delete category
 */
const adminDeleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    await category.destroy();
    res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminMenuDashboard,
  adminCreateMenuItem,
  adminUpdateMenuItem,
  adminDeleteMenuItem,
  adminCreateCategory,
  adminDeleteCategory,
};
