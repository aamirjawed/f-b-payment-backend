require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');

const { sequelize } = require('./food-menu/models');
const foodMenuRoutes = require('./food-menu/routes/foodMenuRoutes');
const adminRoutes = require('./admin/routes/adminRoutes');
const vendorRoutes = require('./vendor/routes/vendorRoutes');
const paymentRoutes = require('./payment/routes/paymentRoutes');
const orderRoutes = require('./order/routes/orderRoutes');
const bartenderRoutes = require('./bartender/routes/bartenderRoutes');
const seedDatabase = require('./seeders/seedData');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'https://f-b-menu-frontend.vercel.app',
  'https://f-b-admin-frontend.vercel.app',
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like server-to-server, mobile apps, or Postman)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes(`${origin}/`) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // Allow all vercel.app domains for flexible frontend deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

// Socket.IO Setup with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  },
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach Socket.IO instance to request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date(),
    service: 'Food Stall Payment API - Multi-Vendor & Admin Module',
  });
});

// Module API Routes
app.use('/api/menu', foodMenuRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bartenders', bartenderRoutes);
app.use('/api/bartender', bartenderRoutes);

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('[Error Handler]:', err.stack || err.message);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || null,
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Bartender / Station devices join stall-specific room for targeted order alerts
  socket.on('join_vendor_room', (vendorId) => {
    if (vendorId) {
      socket.join(`vendor_${vendorId}`);
      console.log(`[Socket.IO] Socket ${socket.id} joined room vendor_${vendorId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Auto-create database if not exists and sync Sequelize models
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    const dbName = process.env.DB_NAME || 'food_stall_db';
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.end();
    console.log(`[Database] MySQL Database '${dbName}' verified/created.`);

    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
    await sequelize.sync({ force: false });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');

    // Safe column check & addition for existing tables
    const queryInterface = sequelize.getQueryInterface();
    try {
      const vendorCols = await queryInterface.describeTable('Vendors').catch(() => ({}));
      if (vendorCols && !vendorCols.location) {
        await queryInterface.addColumn('Vendors', 'location', {
          type: require('sequelize').DataTypes.STRING,
          allowNull: true,
        }).catch(() => {});
      }
      const orderCols = await queryInterface.describeTable('Orders').catch(() => ({}));
      if (orderCols && !orderCols.completedByBartenderId) {
        await queryInterface.addColumn('Orders', 'completedByBartenderId', {
          type: require('sequelize').DataTypes.STRING,
          allowNull: true,
        }).catch(() => {});
      }
      if (orderCols && !orderCols.completedAt) {
        await queryInterface.addColumn('Orders', 'completedAt', {
          type: require('sequelize').DataTypes.DATE,
          allowNull: true,
        }).catch(() => {});
      }
      // Dynamic drop of any legacy foreign key constraints on vendorId in categories and menuitems to allow global items
      const dropVendorIdFks = async (tableName) => {
        try {
          const [fks] = await sequelize.query(`
            SELECT CONSTRAINT_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE TABLE_SCHEMA = '${dbName}' 
              AND TABLE_NAME = '${tableName}' 
              AND COLUMN_NAME = 'vendorId' 
              AND REFERENCED_TABLE_NAME IS NOT NULL;
          `);
          for (const fk of fks) {
            const fkName = fk.CONSTRAINT_NAME;
            await sequelize.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${fkName}\`;`).catch(() => {});
          }
        } catch (err) {}
      };

      await dropVendorIdFks('categories');
      await dropVendorIdFks('menuitems');
    } catch (migErr) {
      console.log('[Migration Notice]:', migErr.message);
    }

    console.log('[Database] MySQL tables connected & synchronized.');

    await seedDatabase();

    server.listen(PORT, () => {
      console.log(`[Server] MySQL Food Menu API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Server Start Error]:', err.message);
  }
}

startServer();
