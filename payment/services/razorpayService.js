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
 * Service: Create Dynamic Razorpay UPI QR Code / UPI Intent Link & Store Pending Payment Record
 */
const createQRCodeService = async ({ amount, vendorId, orderId, notes = {} }) => {
  const razorpay = getRazorpayInstance();
  const amountInPaise = Math.round(amount * 100);
  const targetOrderId = orderId || `ord_${Date.now()}`;
  const paymentId = `pay_qr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let qrImageUrl = '';
  let upiString = '';
  let razorpayQrId = `qr_${targetOrderId}_${Date.now()}`;

  try {
    const qrCode = await razorpay.qrCode.create({
      type: 'upi_qr',
      name: `Food Stall Payment`,
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: amountInPaise,
      description: `Payment for Order #${targetOrderId}`,
      notes: {
        vendorId: vendorId || '',
        orderId: targetOrderId,
        ...notes,
      },
    });

    qrImageUrl = qrCode.image_url;
    razorpayQrId = qrCode.id;
  } catch (error) {
    console.warn('[Razorpay QR Notice]: Using Dynamic UPI Intent payload:', error.message);
    const upiId = process.env.STALL_UPI_ID || 'foodstall@upi';
    upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=FoodStall&am=${amount}&cu=INR&tr=${targetOrderId}`;
    qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiString)}`;
  }

  let pendingPayment = null;
  try {
    // 💾 Store Payment record in MySQL with status 'created'
    pendingPayment = await Payment.create({
      id: paymentId,
      orderId: targetOrderId,
      vendorId: vendorId || '',
      razorpayOrderId: razorpayQrId,
      amount,
      currency: 'INR',
      status: 'created',
      paymentMethod: 'upi_qr',
      receipt: `rcpt_${targetOrderId}`,
      notes: {
        vendorId: vendorId || '',
        orderId: targetOrderId,
        ...notes,
      },
    });
  } catch (dbError) {
    console.warn('[Payment DB Notice]: Could not create pending payment record:', dbError.message);
  }

  return {
    success: true,
    payment: pendingPayment,
    qrCodeId: razorpayQrId,
    imageUrl: qrImageUrl,
    upiString,
    amount,
    orderId: targetOrderId,
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

  if (event === 'payment.captured' || event === 'order.paid' || event === 'qr_code.credited') {
    const paymentEntity = payload.payment ? payload.payment.entity : null;
    const razorpayOrderId = paymentEntity ? paymentEntity.order_id : null;
    const razorpayPaymentId = paymentEntity ? paymentEntity.id : null;
    const notes = paymentEntity?.notes || payload.qr_code?.entity?.notes;
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
      payment.paymentMethod = paymentEntity ? paymentEntity.method : 'upi_qr';
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
  createQRCodeService,
  verifySignatureService,
  handleWebhookService,
};
