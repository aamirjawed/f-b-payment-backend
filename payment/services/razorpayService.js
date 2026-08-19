const crypto = require('crypto');
const getRazorpayInstance = require('../config/razorpay');
const Payment = require('../models/Payment');
const Order = require('../../order/models/Order');

/**
 * Service: Create a new Razorpay Order & local Payment record
 */
const createOrderService = async ({ amount, currency = 'INR', vendorId, orderId, customerDetails = {}, notes = {} }) => {
  const razorpay = getRazorpayInstance();

  const amountInPaise = Math.round(amount * 100);
  const receipt = `rcpt_${orderId || Date.now()}`;

  const options = {
    amount: amountInPaise,
    currency,
    receipt,
    notes: {
      vendorId: vendorId || '',
      orderId: orderId || `ord_${Date.now()}`,
      ...notes,
    },
  };

  const razorpayOrder = await razorpay.orders.create(options);

  const paymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const newPayment = await Payment.create({
    id: paymentId,
    orderId: orderId || options.notes.orderId,
    vendorId: vendorId || '',
    razorpayOrderId: razorpayOrder.id,
    amount,
    currency,
    status: 'created',
    customerName: customerDetails.name || '',
    customerEmail: customerDetails.email || '',
    customerPhone: customerDetails.phone || '',
    receipt,
    notes: options.notes,
  });

  return {
    payment: newPayment,
    razorpayOrder,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
};

/**
 * Service: Verify Razorpay Payment Signature (Frontend Checkout Callback)
 */
const verifySignatureService = async ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error('RAZORPAY_KEY_SECRET is missing in server environment variables');
  }

  const body = razorpayOrderId + '|' + razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body.toString())
    .digest('hex');

  const isValid = expectedSignature === razorpaySignature;

  if (isValid) {
    const payment = await Payment.findOne({ where: { razorpayOrderId } });
    if (payment) {
      payment.razorpayPaymentId = razorpayPaymentId;
      payment.razorpaySignature = razorpaySignature;
      payment.status = 'captured';
      await payment.save();

      // Sync matching Order paymentStatus to 'paid'
      try {
        const foodOrder = await Order.findByPk(payment.orderId);
        if (foodOrder) {
          foodOrder.paymentStatus = 'paid';
          foodOrder.paymentId = payment.id;
          await foodOrder.save();
        }
      } catch (err) {
        console.warn('[Order Sync Warning]:', err.message);
      }
    }
    return { success: true, payment };
  } else {
    const payment = await Payment.findOne({ where: { razorpayOrderId } });
    if (payment) {
      payment.status = 'failed';
      payment.errorDetails = { message: 'Invalid payment signature verification' };
      await payment.save();

      try {
        const foodOrder = await Order.findByPk(payment.orderId);
        if (foodOrder) {
          foodOrder.paymentStatus = 'failed';
          await foodOrder.save();
        }
      } catch (err) {
        console.warn('[Order Sync Warning]:', err.message);
      }
    }
    return { success: false, message: 'Invalid signature mismatch' };
  }
};

/**
 * Service: Verify & Handle Razorpay Webhooks
 */
const handleWebhookService = async (reqBody, webhookSignature) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (webhookSecret && webhookSecret !== 'YourWebhookSecretHere') {
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(JSON.stringify(reqBody));
    const digest = shasum.digest('hex');

    if (digest !== webhookSignature) {
      throw new Error('Invalid Webhook Signature');
    }
  }

  const event = reqBody.event;
  const payload = reqBody.payload;

  console.log(`[Razorpay Webhook Received]: Event type -> ${event}`);

  if (event === 'payment.captured' || event === 'order.paid') {
    const paymentEntity = payload.payment ? payload.payment.entity : null;
    const razorpayOrderId = paymentEntity ? paymentEntity.order_id : null;
    const razorpayPaymentId = paymentEntity ? paymentEntity.id : null;
    const notes = paymentEntity?.notes;
    const targetOrderId = notes?.orderId;

    const { Op } = require('sequelize');
    const payment = await Payment.findOne({
      where: {
        [Op.or]: [
          ...(razorpayOrderId ? [{ razorpayOrderId }] : []),
          ...(targetOrderId ? [{ orderId: targetOrderId }] : []),
        ],
      },
    });

    if (payment) {
      payment.status = 'captured';
      payment.razorpayPaymentId = razorpayPaymentId || payment.razorpayPaymentId;
      payment.paymentMethod = paymentEntity ? paymentEntity.method : 'online';
      await payment.save();

      // Synchronize associated Order paymentStatus to 'paid'
      try {
        const foodOrder = await Order.findByPk(payment.orderId);
        if (foodOrder) {
          foodOrder.paymentStatus = 'paid';
          foodOrder.paymentId = payment.id;
          await foodOrder.save();
        }
      } catch (err) {
        console.warn('[Order Sync Warning]:', err.message);
      }
    }
  } else if (event === 'payment.failed') {
    const paymentEntity = payload.payment ? payload.payment.entity : null;
    const razorpayOrderId = paymentEntity ? paymentEntity.order_id : null;

    if (razorpayOrderId) {
      const payment = await Payment.findOne({ where: { razorpayOrderId } });
      if (payment) {
        payment.status = 'failed';
        payment.errorDetails = paymentEntity ? paymentEntity.error_description : 'Payment failed';
        await payment.save();

        try {
          const foodOrder = await Order.findByPk(payment.orderId);
          if (foodOrder) {
            foodOrder.paymentStatus = 'failed';
            await foodOrder.save();
          }
        } catch (err) {
          console.warn('[Order Sync Warning]:', err.message);
        }
      }
    }
  }

  return { success: true, event };
};

module.exports = {
  createOrderService,
  verifySignatureService,
  handleWebhookService,
};
