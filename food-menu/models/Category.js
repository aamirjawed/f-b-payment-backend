const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Category = sequelize.define('Category', {
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
  icon: {
    type: DataTypes.STRING,
    defaultValue: '',
  },
  subCategories: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
}, {
  timestamps: true,
});

module.exports = Category;
