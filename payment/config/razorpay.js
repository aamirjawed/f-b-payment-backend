const Razorpay = require('razorpay');

const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret || key_id.includes('YourKeyIdHere') || key_id === 'dummy_key_id') {
    throw new Error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing or unconfigured in environment variables');
  }

  return new Razorpay({
    key_id,
    key_secret,
  });
};

module.exports = getRazorpayInstance;
