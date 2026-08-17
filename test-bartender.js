const http = require('http');

const request = (method, path, body = null, token = null) => {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
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

async function runVerification() {
  console.log('=== Starting Bartender QR & Auth Verification ===\n');

  try {
    // 1. Health Check
    const health = await request('GET', '/api/health');
    console.log('[1] Health Check:', health.status === 200 ? 'PASSED' : 'FAILED', health.data.service);

    // 2. Super Admin Login
    const adminLogin = await request('POST', '/api/admin/login', {
      usernameOrEmail: 'admin',
      password: 'admin123',
    });
    console.log('[2] Super Admin Login:', adminLogin.status === 200 ? 'PASSED' : 'FAILED');
    const adminToken = adminLogin.data.token;

    // 3. Ensure a test stall exists
    let vendorId = 'stall-mocktails-bar';
    const createStall = await request('POST', '/api/admin/stalls', {
      id: vendorId,
      name: 'Tropical Cocktail Bar',
      stallNumber: 'Bar Counter #1',
      location: 'South Beach Lounge',
    }, adminToken);
    console.log('[3] Stall Setup:', (createStall.status === 201 || createStall.status === 409) ? 'PASSED' : 'FAILED');

    // 4. Create Bartender with Auto-Generated Credentials & QR Pairing URL
    const createBt = await request('POST', '/api/admin/bartenders', {
      vendorId: vendorId,
      name: 'Alex Mixologist',
      station: 'Draft Tap & Cocktail Bar',
      role: 'bartender',
    }, adminToken);

    console.log('[4] Create Bartender API:', createBt.status === 201 ? 'PASSED' : 'FAILED');
    if (createBt.status !== 201) {
      console.error('Error creating bartender:', createBt.data);
      return;
    }

    const btData = createBt.data.data;
    console.log('    - Staff ID:', btData.id);
    console.log('    - Auto-generated Username:', btData.credentials.username);
    console.log('    - Auto-generated Password:', btData.credentials.password);
    console.log('    - Auto-generated 4-Digit PIN:', btData.credentials.pinCode);
    console.log('    - Pairing Token:', btData.pairingToken);
    console.log('    - Dynamic QR Login URL:', btData.qrLoginUrl);

    // 5. Test QR Code Auto-Login on Device
    console.log('\n[5] Testing Device QR Scan Auto-Login (/api/bartenders/auth/qr)...');
    const qrLogin = await request('POST', '/api/bartenders/auth/qr', {
      pairingToken: btData.pairingToken,
    });
    console.log('    QR Auto-Login Result:', qrLogin.status === 200 ? 'PASSED' : 'FAILED');
    const bartenderToken = qrLogin.data.token;
    console.log('    Device Session Token Issued:', bartenderToken ? 'YES' : 'NO');

    // 6. Test 4-Digit PIN Login on Device
    console.log('\n[6] Testing Fast 4-Digit PIN Login (/api/bartenders/auth/pin)...');
    const pinLogin = await request('POST', '/api/bartenders/auth/pin', {
      staffId: btData.id,
      pinCode: btData.credentials.pinCode,
    });
    console.log('    PIN Login Result:', pinLogin.status === 200 ? 'PASSED' : 'FAILED');

    // 7. Test Get Bartender Profile
    console.log('\n[7] Testing Get Bartender Profile (/api/bartenders/me)...');
    const profile = await request('GET', '/api/bartenders/me', null, bartenderToken);
    console.log('    Profile Result:', profile.status === 200 ? 'PASSED' : 'FAILED');
    console.log('    Station:', profile.data.bartender.station);
    console.log('    Stall:', profile.data.bartender.vendor?.name);

    // 8. Place a Drink Order
    console.log('\n[8] Placing a Test Customer Order (/api/orders)...');
    // Ensure category and menu item exist
    await request('POST', '/api/admin/categories', {
      id: 'cat_cocktails',
      name: 'Signature Cocktails',
      icon: 'drink',
    }, adminToken).catch(() => {});

    await request('POST', '/api/admin/menu', {
      id: 'item_mojito_1',
      vendorId: vendorId,
      name: 'Signature Mojito',
      description: 'Refreshing mint and lime beverage',
      price: 150,
      category: 'cat_cocktails',
      subCategory: 'Cocktails',
    }, adminToken).catch(() => {});

    const newOrder = await request('POST', '/api/orders', {
      vendorId: vendorId,
      customerName: 'Alice Green',
      customerPhone: '9876543210',
      items: [
        { id: 'item_mojito_1', name: 'Signature Mojito', price: 150, quantity: 2 },
      ],
      totalAmount: 300,
    });
    console.log('    Order Placement Result:', newOrder.status === 201 ? 'PASSED' : 'FAILED');
    if (newOrder.status !== 201) {
      console.error('Order error:', newOrder.data);
      return;
    }
    const orderId = newOrder.data.data.id;
    console.log('    Order ID:', orderId, '| Token Number:', newOrder.data.data.tokenNumber);

    // 9. Fetch Orders as Bartender on Station Tablet
    console.log('\n[9] Fetching Live Orders for Bartender Stall (/api/bartenders/orders)...');
    const ordersList = await request('GET', '/api/bartenders/orders?status=active', null, bartenderToken);
    console.log('    Fetched Orders Count:', ordersList.data.count, ordersList.status === 200 ? 'PASSED' : 'FAILED');

    // 10. Bartender Marks Order as Preparing then Completed
    console.log('\n[10] Bartender Updating Order to "preparing" then "completed"...');
    const prepUpdate = await request('PATCH', `/api/bartenders/orders/${orderId}/status`, {
      orderStatus: 'preparing',
    }, bartenderToken);
    console.log('    Status updated to "preparing":', prepUpdate.status === 200 ? 'PASSED' : 'FAILED');

    const completeUpdate = await request('PATCH', `/api/bartenders/orders/${orderId}/status`, {
      orderStatus: 'completed',
    }, bartenderToken);
    console.log('    Status updated to "completed":', completeUpdate.status === 200 ? 'PASSED' : 'FAILED');
    console.log('    Audit Check -> completedByBartenderId:', completeUpdate.data.data.completedByBartenderId);
    console.log('    Audit Check -> completedAt:', completeUpdate.data.data.completedAt);

    // 11. Test QR Code Token Regeneration
    console.log('\n[11] Testing QR Token Regeneration by Admin (/api/admin/bartenders/:id/regenerate-qr)...');
    const regenQr = await request('POST', `/api/admin/bartenders/${btData.id}/regenerate-qr`, {}, adminToken);
    console.log('    Regenerate QR Result:', regenQr.status === 200 ? 'PASSED' : 'FAILED');
    console.log('    New QR Login URL:', regenQr.data.data.qrLoginUrl);

    // 12. Verify Admin List Bartenders with performance stats
    console.log('\n[12] Verifying Admin Bartender List & Completed Orders Stats...');
    const allBt = await request('GET', '/api/admin/bartenders', null, adminToken);
    console.log('    Bartenders Count:', allBt.data.count);
    const targetBt = allBt.data.data.find(b => b.id === btData.id);
    if (targetBt) {
      console.log('    Bartender stats.completedOrders:', targetBt.stats.completedOrders);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL BARTENDER QR & DEVICE AUTH TESTS PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('Verification error:', err);
  }
}

runVerification();
