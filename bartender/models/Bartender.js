const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const bcrypt = require('bcryptjs');

const Bartender = sequelize.define('Bartender', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
  },
  vendorId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  pinCode: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  station: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Main Counter',
  },
  role: {
    type: DataTypes.ENUM('bartender', 'barista', 'kitchen_staff', 'counter_lead'),
    defaultValue: 'bartender',
  },
  pairingToken: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
  },
  pairingTokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  hooks: {
    beforeCreate: async (staff) => {
      if (staff.password && !staff.password.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        staff.password = await bcrypt.hash(staff.password, salt);
      }
      if (staff.pinCode && !staff.pinCode.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        staff.pinCode = await bcrypt.hash(staff.pinCode, salt);
      }
    },
    beforeUpdate: async (staff) => {
      if (staff.changed('password') && !staff.password.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        staff.password = await bcrypt.hash(staff.password, salt);
      }
      if (staff.changed('pinCode') && !staff.pinCode.startsWith('$2')) {
        const salt = await bcrypt.genSalt(10);
        staff.pinCode = await bcrypt.hash(staff.pinCode, salt);
      }
    },
  },
  indexes: [
    { fields: ['vendorId'] },
    { fields: ['username'] },
    { fields: ['pairingToken'] },
    { fields: ['isActive'] },
  ],
});

// Instance method to compare password
Bartender.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to compare 4-digit PIN
Bartender.prototype.comparePin = async function (candidatePin) {
  return await bcrypt.compare(String(candidatePin), this.pinCode);
};

module.exports = Bartender;
