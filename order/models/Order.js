const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  vendorId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tokenNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  subtotal: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  tax: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  totalAmount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'upi',
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    defaultValue: 'pending',
  },
  orderStatus: {
    type: DataTypes.ENUM('pending', 'preparing', 'ready', 'completed', 'cancelled'),
    defaultValue: 'pending',
  },
  paymentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  completedByBartenderId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['vendorId'] },
    { fields: ['paymentStatus'] },
    { fields: ['orderStatus'] },
    { fields: ['createdAt'] },
    { fields: ['vendorId', 'paymentStatus'] },
    { fields: ['vendorId', 'orderStatus'] },
  ],
});

module.exports = Order;
