const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'food_stall_super_secret_jwt_key_2026';

/**
 * Generate HMAC-SHA256 signature for order data
 */
const generateSignature = (orderId, totalAmount, vendorId) => {
  const data = `${orderId}:${totalAmount}:${vendorId}`;
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex').slice(0, 16);
};

/**
 * Create a compact, self-contained signed QR payload string
 * Encoding order ID, token number, items, total amount, timestamp, and signature
 */
const createOrderQrPayload = (order, items = []) => {
  const orderId = order.id || order.orderId;
  const vendorId = order.vendorId || '';
  const totalAmount = parseFloat(order.totalAmount || 0);

  const compactItems = items.map((item) => ({
    n: item.name || item.title || 'Item',
    q: parseInt(item.quantity || 1, 10),
    p: parseFloat(item.price || 0),
  }));

  const payloadObj = {
    id: orderId,
    t: order.tokenNumber || '',
    v: vendorId,
    amt: totalAmount,
    items: compactItems,
    ts: Math.floor(new Date(order.createdAt || Date.now()).getTime() / 1000),
    sig: generateSignature(orderId, totalAmount, vendorId),
  };

  return Buffer.from(JSON.stringify(payloadObj)).toString('base64');
};

/**
 * Verify and decode a scanned Base64 QR string
 */
const verifyOrderQrPayload = (qrDataString) => {
  try {
    if (!qrDataString || typeof qrDataString !== 'string') {
      return { isValid: false, reason: 'Invalid or missing QR data' };
    }

    let jsonStr = '';
    try {
      jsonStr = Buffer.from(qrDataString.trim(), 'base64').toString('utf8');
    } catch (e) {
      jsonStr = qrDataString.trim();
    }

    const payload = JSON.parse(jsonStr);

    if (!payload || !payload.id || !payload.sig) {
      return { isValid: false, reason: 'Malformed QR code structure' };
    }

    const expectedSig = generateSignature(payload.id, payload.amt, payload.v);

    if (payload.sig !== expectedSig) {
      return { isValid: false, reason: 'Tampered or invalid QR code signature' };
    }

    return {
      isValid: true,
      order: {
        orderId: payload.id,
        tokenNumber: payload.t,
        vendorId: payload.v,
        totalAmount: payload.amt,
        items: (payload.items || []).map((i) => ({
          name: i.n,
          quantity: i.q,
          price: i.p,
        })),
        createdAt: new Date((payload.ts || 0) * 1000),
      },
    };
  } catch (error) {
    return { isValid: false, reason: `QR decode failed: ${error.message}` };
  }
};

module.exports = {
  createOrderQrPayload,
  verifyOrderQrPayload,
};
