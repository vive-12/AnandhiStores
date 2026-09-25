const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');

const PRICE_PER_CAN = 30;

// POST /api/orders
router.post('/', (req, res) => {
  const { user_id, cans_qty, items: reqItems } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  
  const user = db.getUserById(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  let items = reqItems || [];
  
  // Backwards compatibility for old clients sending cans_qty
  if (items.length === 0 && cans_qty) {
    const qty = Math.max(1, parseInt(cans_qty) || 1);
    items.push({ id: 1, name: '20L Water Can', price: PRICE_PER_CAN, qty, unit: 'can' });
  }
  
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);
  const cod_amount = subtotal + (user.delivery_fee || 0);
  
  const order = db.createOrder({ 
    customer_name: user.name, 
    customer_phone: user.phone, 
    delivery_address: user.address, 
    lat: user.lat, 
    lng: user.lng, 
    items, 
    cod_amount 
  });
  res.status(201).json(order);
});

// GET /api/orders
router.get('/', (req, res) => {
  let orders = db.getAllOrders(req.query.status);
  if (req.query.user_id) {
    orders = orders.filter(o => o.customer_phone === db.getUserById(req.query.user_id)?.phone);
  }
  res.json(orders);
});

// GET /api/orders/:id  (with countdown)
router.get('/:id', (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  let placedAt = new Date(order.placed_at);
  if (isNaN(placedAt.getTime())) {
    // Fallback for legacy localized date strings in DB
    placedAt = new Date();
  }
  const deadline  = new Date(placedAt.getTime() + 15 * 60 * 1000);
  const secondsRemaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  res.json({ ...order, seconds_remaining: secondsRemaining, deadline: deadline.toISOString() });
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', (req, res) => {
  const { status, agent_id } = req.body;
  const valid = ['placed', 'assigned', 'out_for_delivery', 'delivered'];
  if (!valid.includes(status))
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });

  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.updateOrderStatus(req.params.id, status);

  if (status === 'assigned' && agent_id) {
    db.assignOrderToAgent(req.params.id, agent_id);
  }
  if (status === 'delivered') {
    db.releaseAgentForOrder(req.params.id);
  }

  res.json(db.getOrderById(req.params.id));
});

// PATCH /api/orders/:id/empty-returned
router.patch('/:id/empty-returned', (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.markEmptyCanReturned(req.params.id);
  res.json({ success: true });
});

module.exports = router;
