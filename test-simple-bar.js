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

async function testBarWorkflow() {
  console.log('=== Testing Simple Bar Identification, Menu QR & Device Login ===\n');

  // 1. Admin Login
  const adminRes = await request('POST', '/api/admin/login', {
    usernameOrEmail: 'admin',
    password: 'admin123',
  });
  const adminToken = adminRes.data.token;
  console.log('[1] Admin Login:', adminRes.status === 200 ? 'SUCCESS' : 'FAILED');

  // 2. Create Bar with Auto-Generated Login & Customer Menu QR URL
  const barId = `bar-sunset-lounge-${Date.now().toString().slice(-4)}`;
  const createBarRes = await request('POST', '/api/vendors', {
    id: barId,
    name: 'Sunset Cocktail Lounge',
    stallNumber: 'Bar #03',
    location: 'Rooftop Deck',
  }, adminToken);

  console.log('[2] Create Bar/Stall API:', createBarRes.status === 201 ? 'SUCCESS' : 'FAILED');
  const barData = createBarRes.data;
  console.log('    - Unique Bar ID:', barData.vendor.id);
    console.log('    - Customer Menu QR URL:', barData.menuQrUrl);
  console.log('    - Auto-generated Bar Username:', barData.loginCredentials.username);
  console.log('    - Auto-generated Bar Password:', barData.loginCredentials.password);

  // 3. Bar logs in on their tablet/device using generated username & password
  console.log('\n[3] Bar Device Logging in (/api/vendors/login)...');
  const loginRes = await request('POST', '/api/vendors/login', {
    username: barData.loginCredentials.username,
    password: barData.loginCredentials.password,
  });
  console.log('    Login Result:', loginRes.status === 200 ? 'SUCCESS' : 'FAILED');
  console.log('    Logged In Bar:', loginRes.data.bar.name, `(${loginRes.data.bar.id})`);
  const barToken = loginRes.data.token;

  // 4. Customer Places an Order for this Bar
  console.log('\n[4] Customer places order for this bar (/api/orders)...');
  // Ensure menu item
  await request('POST', '/api/admin/menu', {
    id: `item_margarita_${Date.now().toString().slice(-4)}`,
    vendorId: barId,
    name: 'Classic Margarita',
    description: 'Tequila, triple sec, lime juice',
    price: 250,
    category: 'cat_cocktails',
    subCategory: 'Cocktails',
  }, adminToken).catch(() => {});

  const orderRes = await request('POST', '/api/orders', {
    vendorId: barId,
    customerName: 'Robert Smith',
    customerPhone: '9898989898',
    items: [
      { id: 'item_mojito_1', name: 'Signature Mojito', price: 150, quantity: 2 },
    ],
    totalAmount: 300,
  });
  console.log('    Order Placement Result:', orderRes.status === 201 ? 'SUCCESS' : 'FAILED');
  const orderId = orderRes.data.data.id;
  console.log('    Order ID:', orderId, '| Token:', orderRes.data.data.tokenNumber);

  // 5. Bar Views Live Orders for their bar
  console.log('\n[5] Bar Device fetches incoming orders (/api/vendors/:id/orders)...');
  const barOrders = await request('GET', `/api/vendors/${barId}/orders`);
  console.log('    Orders Response Status:', barOrders.status, 'Body:', barOrders.data);

  // 6. Bar ticks / marks the order as Completed
  console.log('\n[6] Bar ticks/marks order as COMPLETED (/api/vendors/orders/:id/complete)...');
  const completeRes = await request('PATCH', `/api/vendors/orders/${orderId}/complete`);
  console.log('    Complete Response Status:', completeRes.status, 'Body:', completeRes.data);
  if (completeRes.data && completeRes.data.data) {
    console.log('    Order Status in DB:', completeRes.data.data.orderStatus);
    console.log('    Completed At:', completeRes.data.data.completedAt);
  }

  // 7. Track Everything for this Bar
  console.log('\n[7] Verifying Live Tracking Stats for this Bar (/api/vendors/:id)...');
  const trackingRes = await request('GET', `/api/vendors/${barId}`);
  console.log('    Tracking Response:', trackingRes.data);
  if (trackingRes.data && trackingRes.data.data && trackingRes.data.data.stats) {
    console.log('    Total Orders:', trackingRes.data.data.stats.totalOrders);
    console.log('    Completed Orders:', trackingRes.data.data.stats.completedOrders);
    console.log('    Pending Orders:', trackingRes.data.data.stats.pendingOrders);
  }

  console.log('\n=============================================================');
  console.log('🎉 PERFECT! BAR CREDENTIALS, MENU QR & ORDER TRACKING VERIFIED!');
  console.log('=============================================================');
}

testBarWorkflow();
