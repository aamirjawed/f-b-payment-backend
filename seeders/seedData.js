const Admin = require('../admin/models/Admin');

/**
 * seedDatabase: Ensures only the super admin account exists for authentication
 * without injecting mock vendors, bars, menu items, or test data.
 */
const seedDatabase = async () => {
  try {
    const superAdmin = await Admin.findOne({ where: { username: 'admin' } });
    if (!superAdmin) {
      console.log('[Seed] Creating Super Admin account...');
      await Admin.create({
        username: 'admin',
        email: 'admin@foodstall.com',
        password: 'admin123',
      });
      console.log('[Seed] Super Admin account created (User: admin | Pass: admin123)');
    }
    console.log('[Seed] Database ready.');
  } catch (error) {
    console.error('[Seed Error]:', error.message);
  }
};

module.exports = seedDatabase;
