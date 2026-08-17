const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Vendor = require('../../vendor/models/Vendor');
const Payment = require('../../payment/models/Payment');
const MenuItem = require('../../food-menu/models/MenuItem');
const Bartender = require('../../bartender/models/Bartender');

// Order <-> OrderItem (One-to-Many)
Order.hasMany(OrderItem, { foreignKey: 'orderId', sourceKey: 'id', as: 'items', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', targetKey: 'id', as: 'order' });

// Order <-> Vendor (Many-to-One)
Vendor.hasMany(Order, { foreignKey: 'vendorId', sourceKey: 'id', as: 'orders' });
Order.belongsTo(Vendor, { foreignKey: 'vendorId', targetKey: 'id', as: 'vendor' });

// Order <-> Payment (One-to-One / Optional)
Order.hasOne(Payment, { foreignKey: 'orderId', sourceKey: 'id', as: 'paymentDetails' });
Payment.belongsTo(Order, { foreignKey: 'orderId', targetKey: 'id', as: 'orderDetails' });

// OrderItem <-> MenuItem (Many-to-One)
MenuItem.hasMany(OrderItem, { foreignKey: 'menuItemId', sourceKey: 'id', as: 'orderItems' });
OrderItem.belongsTo(MenuItem, { foreignKey: 'menuItemId', targetKey: 'id', as: 'menuItem' });

// Order <-> Bartender (Many-to-One for completedBy)
Bartender.hasMany(Order, { foreignKey: 'completedByBartenderId', sourceKey: 'id', as: 'completedOrders' });
Order.belongsTo(Bartender, { foreignKey: 'completedByBartenderId', targetKey: 'id', as: 'completedByBartender' });

module.exports = {
  Order,
  OrderItem,
};
