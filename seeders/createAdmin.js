const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../food-menu/models');
const Admin = require('../admin/models/Admin');

async function createAdminAccount() {
  try {
    await sequelize.authenticate();
    console.log('[DB] MySQL Database connected.');

    // Ensure Admin model is synchronized
    await Admin.sync();

    // Single Admin Credentials
    const username = 'admin';
    const email = 'admin@foodstall.com';
    const password = 'admin123';

    let admin = await Admin.findOne({ where: { username } });
    if (!admin) {
      admin = await Admin.create({
        username,
        email,
        password,
      });
      console.log('[Admin] Single Admin account created successfully in MySQL!');
    } else {
      admin.password = password;
      await admin.save();
      console.log('[Admin] Single Admin account password updated in MySQL!');
    }

    console.log('\n==================================================');
    console.log('  SUCCESS! Single Admin Login stored in MySQL DB:');
    console.log('==================================================');
    console.log(' 🔐 ADMIN LOGIN CREDENTIALS:');
    console.log('   Username: admin');
    console.log('   Email:    admin@foodstall.com');
    console.log('   Password: admin123');
    console.log('==================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('[Error creating admin]:', error.message);
    process.exit(1);
  }
}

createAdminAccount();
