const sequelize = require('../../config/database');
const Category = require('./Category');
const MenuItem = require('./MenuItem');
const Vendor = require('../../vendor/models/Vendor');
const Payment = require('../../payment/models/Payment');
const { Order, OrderItem } = require('../../order/models');
const Bartender = require('../../bartender/models/Bartender');

// Associations (use constraints: false to allow global categories & menu items)
Vendor.hasMany(MenuItem, { foreignKey: 'vendorId', sourceKey: 'id', as: 'menuItems', constraints: false });
Vendor.hasMany(Category, { foreignKey: 'vendorId', sourceKey: 'id', as: 'categories', constraints: false });
Vendor.hasMany(Payment, { foreignKey: 'vendorId', sourceKey: 'id', as: 'payments' });
Vendor.hasMany(Bartender, { foreignKey: 'vendorId', sourceKey: 'id', as: 'bartenders' });

MenuItem.belongsTo(Vendor, { foreignKey: 'vendorId', targetKey: 'id', as: 'vendor', constraints: false });
Category.belongsTo(Vendor, { foreignKey: 'vendorId', targetKey: 'id', as: 'vendor', constraints: false });
Payment.belongsTo(Vendor, { foreignKey: 'vendorId', targetKey: 'id', as: 'vendor' });
Bartender.belongsTo(Vendor, { foreignKey: 'vendorId', targetKey: 'id', as: 'vendor' });

Category.hasMany(MenuItem, { foreignKey: 'category', sourceKey: 'id', as: 'items' });
MenuItem.belongsTo(Category, { foreignKey: 'category', targetKey: 'id', as: 'categoryDetails' });

module.exports = {
  sequelize,
  Category,
  MenuItem,
  Vendor,
  Payment,
  Order,
  OrderItem,
  Bartender,
};
