const Razorpay = require('razorpay');

const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret || key_id.includes('YourKeyIdHere')) {
    console.warn('[Razorpay Warning] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured properly in .env');
  }

  return new Razorpay({
    key_id: key_id || 'dummy_key_id',
    key_secret: key_secret || 'dummy_key_secret',
  });
};

module.exports = getRazorpayInstance;
