const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  vendorId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  razorpayOrderId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  razorpayPaymentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  razorpaySignature: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'INR',
  },
  status: {
    type: DataTypes.ENUM('created', 'authorized', 'captured', 'failed', 'refunded'),
    defaultValue: 'created',
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  receipt: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  notes: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  errorDetails: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['vendorId'] },
    { fields: ['status'] },
    { fields: ['orderId'] },
    { fields: ['razorpayOrderId'] },
    { fields: ['createdAt'] },
    { fields: ['vendorId', 'status'] },
  ],
});

module.exports = Payment;
