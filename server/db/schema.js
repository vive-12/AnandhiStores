/**
 * AquaRush JSON File Database
 * ─────────────────────────────────────────────────────────────────────────────
 * A zero-dependency, file-backed in-memory store.
 * Data is read from / written to aquarush.json on every change.
 * Good enough for a prototype running on a single machine.
 */

const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'aquarush.json');

// ─── Initial schema ───────────────────────────────────────────────────────────
const EMPTY_DB = {
  users:       [],
  agents:      [],
  orders:      [],
  assignments: [],
  profile_reviews: [],
  inventory:   [],
  offers:      [],
  _nextId:     { users: 1, agents: 1, orders: 1, assignments: 1, profile_reviews: 1, inventory: 1, offers: 1 },
};

// ─── Read / Write helpers ─────────────────────────────────────────────────────
function read() {
  if (!fs.existsSync(DB_FILE)) return structuredClone(EMPTY_DB);
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

function write(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Seed demo agents if file doesn't exist ───────────────────────────────────
if (!fs.existsSync(DB_FILE)) {
  const db = structuredClone(EMPTY_DB);
  db.agents.push({ id: 1, name: 'Ravi Kumar',  phone: '9876543210', pin: '1234', is_available: 1, created_at: now() });
  db.agents.push({ id: 2, name: 'Suresh Babu', phone: '9876543211', pin: '1234', is_available: 1, created_at: now() });
  db._nextId.agents = 3;
  
  db.inventory = [
    { id: 1, name: '20L Water Can', category: 'Water', price: 30, unit: 'can', in_stock: true, created_at: now() }
  ];
  db._nextId.inventory = 2;
  
  write(db);
  console.log('✅ Created aquarush.json with demo agents and default inventory');
} else {
  // Migration for existing databases to have at least a water can if inventory is empty
  const db = read();
  if (!db.inventory || db.inventory.length === 0) {
    db.inventory = [{ id: 1, name: '20L Water Can (Refill)', category: 'Water', price: 30, unit: 'can', in_stock: true, created_at: now() }];
    if (!db._nextId) db._nextId = {};
    db._nextId.inventory = 2;
    write(db);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function now() {
  return new Date().toISOString();
}

function nextId(db, table) {
  const id = db._nextId[table];
  db._nextId[table]++;
  return id;
}

function formatUser(u) {
  if (!u) return u;
  // If it's a legacy user without first_name, keep original name/address
  const name = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.name;
  let address = u.address;
  if (u.door_number) {
    const parts = [u.door_number, u.flat_house_name, u.street_number, u.locality, u.city].filter(Boolean);
    address = parts.join(', ');
    if (u.landmark) address += `, Landmark: ${u.landmark}`;
  }
  return { ...u, name, address };
}

// ─── Exported DB object (mirrors better-sqlite3 feel) ────────────────────────
const db = {
  // ── Users ───────────────────────────────────────────────────────────────────
  getUsers() {
    return read().users.map(formatUser).sort((a, b) => b.id - a.id);
  },
  getPendingUsers() {
    const data = read();
    return data.users
      .filter(u => u.status === 'pending_review')
      .map(u => {
        const fmt = formatUser(u);
        const review = data.profile_reviews.find(r => r.user_id === u.id && r.status === 'assigned');
        if (review) {
          fmt.assigned_agent = data.agents.find(a => a.id === review.agent_id) || null;
        }
        return fmt;
      })
      .sort((a, b) => a.id - b.id);
  },
  getUserById(id) {
    return formatUser(read().users.find(u => u.id === Number(id)) || null);
  },
  getUserByPhone(phone) {
    return formatUser(read().users.find(u => u.phone === phone) || null);
  },
  createProfile(profileData) {
    const data = read();
    if (data.users.find(u => u.phone === profileData.phone)) throw new Error('UNIQUE_CONSTRAINT: phone');
    const user = {
      id: nextId(data, 'users'),
      ...profileData,
      status: 'pending_review',
      pin: null, // final pin
      temp_pin: null, // assigned by agent
      delivery_fee: 0,
      created_at: now()
    };
    data.users.push(user);
    write(data);
    return formatUser(user);
  },
  updateProfile(userId, profileData) {
    const data = read();
    const user = data.users.find(u => u.id === Number(userId));
    if (!user) throw new Error('User not found');
    
    // Check if phone changed and is unique
    if (profileData.phone && profileData.phone !== user.phone) {
      if (data.users.find(u => u.phone === profileData.phone)) throw new Error('UNIQUE_CONSTRAINT: phone');
    }
    
    // Update fields
    Object.assign(user, profileData, { status: 'pending_review' }); // Always send to review on edit
    
    write(data);
    return formatUser(user);
  },
  assignProfileReview(userId, agentId) {
    const data = read();
    const user = data.users.find(u => u.id === Number(userId));
    if (!user) throw new Error('User not found');
    const agent = data.agents.find(a => a.id === Number(agentId));
    if (!agent) throw new Error('Agent not found');
    
    const existing = data.profile_reviews.find(r => r.user_id === Number(userId) && r.status === 'assigned');
    if (existing) {
      existing.agent_id = Number(agentId);
      existing.assigned_at = now();
    } else {
      data.profile_reviews.push({
        id: nextId(data, 'profile_reviews'),
        user_id: Number(userId),
        agent_id: Number(agentId),
        status: 'assigned',
        assigned_at: now()
      });
    }
    write(data);
  },
  getAgentReviews(agentId) {
    const data = read();
    const reviews = data.profile_reviews.filter(r => r.agent_id === Number(agentId) && r.status === 'assigned');
    return reviews.map(r => {
      const user = data.users.find(u => u.id === r.user_id);
      return { ...r, user };
    });
  },
  approveProfile(userId, deliveryFee) {
    const data = read();
    const user = data.users.find(u => u.id === Number(userId));
    if (!user) throw new Error('User not found');
    
    // Generate 4-digit temp pin
    const tempPin = Math.floor(1000 + Math.random() * 9000).toString();
    user.status = 'approved';
    user.delivery_fee = Number(deliveryFee) || 0;
    user.temp_pin = tempPin;
    
    // Mark review as completed
    const review = data.profile_reviews.find(r => r.user_id === Number(userId) && r.status === 'assigned');
    if (review) {
      review.status = 'completed';
      review.completed_at = now();
    }
    
    write(data);
    return { user: formatUser(user), tempPin };
  },
  loginUser(phone, pin) {
    const data = read();
    const user = data.users.find(u => u.phone === phone);
    if (!user) throw new Error('User not found');
    
    if (user.status === 'pending_review') throw new Error('Profile is pending review');
    
    if (user.temp_pin && user.temp_pin === pin) {
      return { user: formatUser(user), requireNewPin: true };
    }
    
    if (user.pin && user.pin === pin) {
      return { user: formatUser(user), requireNewPin: false };
    }
    
    throw new Error('Invalid PIN');
  },
  setNewPin(userId, newPin) {
    if (newPin.length !== 4) throw new Error('PIN must be 4 digits');
    const data = read();
    const user = data.users.find(u => u.id === Number(userId));
    if (!user) throw new Error('User not found');
    
    user.pin = newPin;
    user.temp_pin = null; // Clear temp pin
    write(data);
    return user;
  },
  adminResetPin(userId, newPin) {
    if (newPin.length !== 4) throw new Error('PIN must be 4 digits');
    const data = read();
    const user = data.users.find(u => u.id === Number(userId));
    if (!user) throw new Error('User not found');
    
    user.pin = newPin;
    user.temp_pin = null;
    write(data);
    return user;
  },

  // ── Agents ──────────────────────────────────────────────────────────────────
  getAgents() {
    const data = read();
    const agents = data.agents;
    const orders = data.orders.filter(o => o.status === 'delivered' && o.delivered_at);
    const assignments = data.assignments;

    const nowTime = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    return agents.map(agent => {
      // Find orders assigned to this agent
      const agentOrderIds = assignments.filter(a => a.agent_id === agent.id).map(a => a.order_id);
      const agentDeliveredOrders = orders.filter(o => agentOrderIds.includes(o.id));

      let todayCount = 0;
      let weeklyCount = 0;
      let monthlyCount = 0;

      agentDeliveredOrders.forEach(o => {
        const d = new Date(o.delivered_at);
        const dTime = d.getTime();
        const dStr = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

        if (dStr === todayStr) todayCount++;
        if (nowTime - dTime <= 7 * oneDayMs) weeklyCount++;
        if (nowTime - dTime <= 30 * oneDayMs) monthlyCount++;
      });

      return {
        ...agent,
        stats: { today: todayCount, weekly: weeklyCount, monthly: monthlyCount }
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  },
  getAvailableAgents() {
    return read().agents.filter(a => a.is_available === 1).sort((a, b) => a.name.localeCompare(b.name));
  },
  getAgentById(id) {
    return read().agents.find(a => a.id === Number(id)) || null;
  },
  addAgent({ name, phone, pin = '1234' }) {
    const data = read();
    if (data.agents.find(a => a.phone === phone)) throw new Error('UNIQUE_CONSTRAINT: phone');
    const agent = { id: nextId(data, 'agents'), name, phone, pin, is_available: 1, created_at: now() };
    data.agents.push(agent);
    write(data);
    return agent;
  },
  agentLogin(phone, pin) {
    const data = read();
    const agent = data.agents.find(a => a.phone === phone);
    if (!agent) throw new Error('Agent not found');
    if (agent.pin !== pin) throw new Error('Invalid PIN');
    return agent;
  },
  resetAgentPin(agentId, newPin) {
    if (newPin.length !== 4) throw new Error('PIN must be 4 digits');
    const data = read();
    const agent = data.agents.find(a => a.id === Number(agentId));
    if (!agent) throw new Error('Agent not found');
    agent.pin = newPin;
    write(data);
    return agent;
  },
  setAgentAvailability(id, available) {
    const data = read();
    const agent = data.agents.find(a => a.id === Number(id));
    if (agent) { agent.is_available = available ? 1 : 0; write(data); }
  },
  getAgentOrders(agentId) {
    const data  = read();
    const orderIds = data.assignments.filter(a => a.agent_id === Number(agentId)).map(a => a.order_id);
    return data.orders.filter(o => orderIds.includes(o.id)).sort((a, b) => b.id - a.id);
  },

  // ── Orders ──────────────────────────────────────────────────────────────────
  createOrder({ customer_name, customer_phone, delivery_address, lat, lng, items, cod_amount }) {
    const data  = read();
    const order = {
      id: nextId(data, 'orders'),
      customer_name, customer_phone, delivery_address,
      lat: lat || null, lng: lng || null,
      items: items || [], // array of { id, name, price, qty, unit }
      cod_amount,
      status:               'placed',
      placed_at:            now(),
      delivered_at:         null,
      empty_can_returned:   0,
      empty_can_alert_sent: 0,
    };
    data.orders.push(order);
    write(data);
    return order;
  },
  getAllOrders(status) {
    const data = read();
    let orders = data.orders;
    if (status) orders = orders.filter(o => o.status === status);
    return orders.sort((a, b) => b.id - a.id).map(o => {
      const asgn = data.assignments.find(a => a.order_id === o.id);
      const agent = asgn ? data.agents.find(a => a.id === asgn.agent_id) : null;
      return {
        ...o,
        agent_id: agent?.id || null,
        agent_name: agent?.name || null,
        agent_phone: agent?.phone || null,
      };
    });
  },
  getOrderById(id) {
    const data  = read();
    const order = data.orders.find(o => o.id === Number(id));
    if (!order) return null;
    const asgn  = data.assignments.find(a => a.order_id === order.id);
    const agent = asgn ? data.agents.find(a => a.id === asgn.agent_id) : null;
    return {
      ...order,
      agent_name:  agent?.name  || null,
      agent_phone: agent?.phone || null,
    };
  },
  updateOrderStatus(id, status) {
    const data  = read();
    const order = data.orders.find(o => o.id === Number(id));
    if (!order) return null;
    order.status = status;
    if (status === 'delivered') order.delivered_at = now();
    write(data);
    return order;
  },
  assignOrderToAgent(orderId, agentId) {
    const data = read();
    const exists = data.assignments.find(a => a.order_id === Number(orderId));
    if (!exists) {
      data.assignments.push({ id: nextId(data, 'assignments'), order_id: Number(orderId), agent_id: Number(agentId), assigned_at: now() });
      write(data);
    }
  },
  releaseAgentForOrder(orderId) {
    // Agents are now permanently available for multiple assignments
  },
  markEmptyCanReturned(id) {
    const data  = read();
    const order = data.orders.find(o => o.id === Number(id));
    if (order) { order.empty_can_returned = 1; order.empty_can_alert_sent = 0; write(data); }
  },

  // ── Admin ────────────────────────────────────────────────────────────────────
  getEmptyCanAlerts() {
    const data = read();
    const delivered = data.orders.filter(o =>
      o.status === 'delivered' && o.empty_can_returned === 0 && o.delivered_at
    );
    const withDays = delivered.map(o => {
      const daysAgo = Math.floor((Date.now() - new Date(o.delivered_at).getTime()) / (1000 * 60 * 60 * 24));
      return { ...o, days_since_delivery: daysAgo };
    }).sort((a, b) => a.id - b.id);

    // Auto-flag urgent ones
    const flagNeeded = withDays.filter(o => o.days_since_delivery >= 10 && !o.empty_can_alert_sent);
    if (flagNeeded.length) {
      flagNeeded.forEach(o => {
        const order = data.orders.find(x => x.id === o.id);
        if (order) order.empty_can_alert_sent = 1;
      });
      write(data);
    }

    return {
      urgent:  withDays.filter(o => o.days_since_delivery >= 10),
      pending: withDays.filter(o => o.days_since_delivery <  10),
    };
  },
  getStats() {
    const data = read();
    const orders = data.orders;
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    return {
      totalOrders:      orders.length,
      activeOrders:     orders.filter(o => o.status !== 'delivered').length,
      deliveredToday:   orders.filter(o => o.status === 'delivered' && o.delivered_at && new Date(o.delivered_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === todayStr).length,
      emptyCansPending: orders.filter(o => o.status === 'delivered' && o.empty_can_returned === 0).length,
      urgentAlerts:     orders.filter(o => {
        if (o.status !== 'delivered' || o.empty_can_returned !== 0 || !o.delivered_at) return false;
        return Math.floor((Date.now() - new Date(o.delivered_at).getTime()) / 86400000) >= 10;
      }).length,
      availableAgents:  data.agents.filter(a => a.is_available === 1).length,
    };
  },

  // ── Inventory ────────────────────────────────────────────────────────────────
  getInventory() {
    return read().inventory || [];
  },
  addInventoryItem({ name, category, price, unit, in_stock }) {
    const data = read();
    if (!data.inventory) data.inventory = [];
    if (!data._nextId.inventory) data._nextId.inventory = 1;
    
    const item = {
      id: nextId(data, 'inventory'),
      name,
      category, // e.g., 'vegetables', 'fruits', 'groceries', 'water'
      price: Number(price),
      unit: unit || 'kg',
      in_stock: in_stock !== undefined ? Boolean(in_stock) : true,
      created_at: now()
    };
    data.inventory.push(item);
    write(data);
    return item;
  },
  updateInventoryItem(id, updates) {
    const data = read();
    if (!data.inventory) data.inventory = [];
    const item = data.inventory.find(i => i.id === Number(id));
    if (!item) throw new Error('Item not found');
    
    Object.assign(item, updates);
    write(data);
    return item;
  },
  deleteInventoryItem(id) {
    const data = read();
    if (!data.inventory) data.inventory = [];
    const initialLen = data.inventory.length;
    data.inventory = data.inventory.filter(i => i.id !== Number(id));
    if (data.inventory.length < initialLen) write(data);
  },

  // ── Offers (Banners) ─────────────────────────────────────────────────────────
  getOffers() {
    return read().offers || [];
  },
  addOffer({ title, subtitle, bg_color, is_active }) {
    const data = read();
    if (!data.offers) data.offers = [];
    if (!data._nextId.offers) data._nextId.offers = 1;
    
    const offer = {
      id: nextId(data, 'offers'),
      title,
      subtitle,
      bg_color: bg_color || '#8b5cf6',
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      created_at: now()
    };
    data.offers.push(offer);
    write(data);
    return offer;
  },
  updateOffer(id, updates) {
    const data = read();
    if (!data.offers) data.offers = [];
    const offer = data.offers.find(o => o.id === Number(id));
    if (!offer) throw new Error('Offer not found');
    
    Object.assign(offer, updates);
    write(data);
    return offer;
  },
  deleteOffer(id) {
    const data = read();
    if (!data.offers) data.offers = [];
    data.offers = data.offers.filter(o => o.id !== Number(id));
    write(data);
  }
};

module.exports = db;
