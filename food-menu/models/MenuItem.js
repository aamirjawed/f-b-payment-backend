const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const MenuItem = sequelize.define('MenuItem', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
  },
  vendorId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'global',
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '',
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  subCategory: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  isVeg: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  rating: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: 4.5,
  },
  spicyLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  popular: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  timestamps: true,
});

module.exports = MenuItem;
