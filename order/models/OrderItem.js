const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  menuItemId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  totalPrice: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
}, {
  timestamps: true,
});

module.exports = OrderItem;
