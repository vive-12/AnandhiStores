// Removed axios, using native fetch

const BASE_URL = 'http://localhost:3001';

async function runSanityTests() {
  console.log('🧪 Starting API Sanity & Regression Tests...\n');
  let passed = 0;
  let failed = 0;

  const assert = (condition, name) => {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  };

  try {
    // 1. Health Check
    let res = await fetch(`${BASE_URL}/health`);
    let data = await res.json();
    assert(res.status === 200 && data.status === 'ok', 'Health Check');

    // 2. Fetch Inventory
    res = await fetch(`${BASE_URL}/api/inventory`);
    data = await res.json();
    assert(Array.isArray(data), 'Inventory API returns array');
    assert(data.some(i => i.name.includes('Water Can')), 'Inventory contains default Water Can (Regression)');

    // 3. Fetch Offers
    res = await fetch(`${BASE_URL}/api/offers`);
    data = await res.json();
    assert(Array.isArray(data), 'Offers API returns array');

    // 4. Place a Cart Order (using mock user_id 1 since auth is client-side)
    res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 1,
        items: [
          { id: 1, name: '20L Water Can', price: 30, qty: 2 },
          { id: 2, name: 'Onions (1kg)', price: 40, qty: 1 }
        ]
      })
    });
    const order = await res.json();
    assert(order.id && order.items.length === 2 && order.cod_amount === 100, 'Place Order with Cart Items');

    // 5. Admin Dashboard Stats
    res = await fetch(`${BASE_URL}/api/admin/stats`);
    const stats = await res.json();
    assert(stats.totalOrders >= 1, 'Admin Stats includes new order');

    // 6. Admin Assign Order
    res = await fetch(`${BASE_URL}/api/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'assigned',
        agent_id: 1 // Using the default agent
      })
    });
    const assign = await res.json();
    assert(assign.status === 'assigned' && assign.agent_name, 'Admin Assign Order to Agent');

  } catch (err) {
    console.error(`\n❌ ERROR: ${err.message}`);
    failed++;
  }

  console.log(`\n📊 Results: ${passed} Passed, ${failed} Failed`);
}

runSanityTests();
