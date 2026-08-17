const express = require('express');
const router = express.Router();
const { getMenuItems } = require('../controllers/foodMenuController');

// Public Food Menu Route (Read-Only for customers/POS users)
router.get('/', getMenuItems);

module.exports = router;
