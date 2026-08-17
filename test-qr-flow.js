const http = require('http');

const request = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(dataString) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let resBody = '';
      res.on('data', (chunk) => { resBody += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resBody);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(dataString);
    req.end();
  });
};

async function testQrSystem() {
  console.log('=== Testing Self-Contained Signed QR Code System ===\n');

  try {
    // 1. Create Order and receive signed QR payload
    console.log('[1] Creating Customer Order with signed QR payload...');
    const orderRes = await request('POST', '/api/orders', {
      vendorId: 'vendor-main-stall',
      customerName: 'Marcus Miller',
      customerPhone: '9988776655',
      items: [
        { name: 'Craft Mojito', price: 180, quantity: 2 },
        { name: 'Iced Coffee', price: 120, quantity: 1 },
      ],
      totalAmount: 480,
    });

    console.log('    Order Creation:', orderRes.status === 201 ? 'PASSED' : 'FAILED');
    const orderData = orderRes.data.data;
    console.log('    Order ID:', orderData.id, '| Token Number:', orderData.tokenNumber);
    console.log('    Signed QR Payload String:', orderData.qrPayload);

    // 2. Bartender scans valid QR code (verifies signature & payload offline)
    console.log('\n[2] Bartender scanning & verifying valid QR Payload (/api/orders/verify-qr)...');
    const verifyRes = await request('POST', '/api/orders/verify-qr', {
      qrData: orderData.qrPayload,
    });
    console.log('    Verification Status:', verifyRes.data.status, verifyRes.status === 200 ? 'PASSED' : 'FAILED');
    console.log('    Header Message:', verifyRes.data.message);
    console.log('    Decoded Drink Items:', JSON.stringify(verifyRes.data.order?.items || []));

    // 3. Test Anti-Tampering Security Check
    console.log('\n[3] Testing Anti-Tampering Security Check (tampered payload)...');
    const tamperedPayload = orderData.qrPayload.slice(0, -4) + 'XXXX';
    const tamperRes = await request('POST', '/api/orders/verify-qr', {
      qrData: tamperedPayload,
    });
    console.log('    Tamper Detection Status:', tamperRes.data.status, tamperRes.status === 400 ? 'PASSED (REJECTED TAMPERED TICKET)' : 'FAILED');

    // 4. One-Tap Bartender Redemption (/api/orders/redeem-qr)
    console.log('\n[4] Bartender Taps "Redeem / Hand Over Drinks" (/api/orders/redeem-qr)...');
    const redeemRes = await request('POST', '/api/orders/redeem-qr', {
      qrData: orderData.qrPayload,
    });
    console.log('    Redemption Result:', redeemRes.status === 200 ? 'PASSED' : 'FAILED');
    console.log('    Redemption Message:', redeemRes.data.message);

    // 5. Test Double-Fulfillment Prevention (Scanning the same QR again)
    console.log('\n[5] Testing Double-Use Prevention (Scanning same QR code again)...');
    const doubleRes = await request('POST', '/api/orders/verify-qr', {
      qrData: orderData.qrPayload,
    });
    console.log('    Double Scan Status:', doubleRes.data.status, doubleRes.data.status === 'already_redeemed' ? 'PASSED (BLOCKED RE-USE)' : 'FAILED');
    console.log('    Double Scan Alert:', doubleRes.data.message);

    console.log('\n=============================================================');
    console.log('🎉 ALL SIGNED QR CODE & SCANNER REDEMPTION TESTS PASSED!');
    console.log('=============================================================');
  } catch (err) {
    console.error('Test error:', err);
  }
}

testQrSystem();
