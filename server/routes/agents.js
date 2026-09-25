const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');

router.get('/',          (req, res) => res.json(db.getAgents()));
router.get('/available', (req, res) => res.json(db.getAvailableAgents()));
router.get('/:id/orders',(req, res) => res.json(db.getAgentOrders(req.params.id)));

router.post('/', (req, res) => {
  const { name, phone, pin } = req.body;
  if (!name || !phone || !pin) return res.status(400).json({ error: 'name, phone and pin are required' });
  if (pin.length !== 4) return res.status(400).json({ error: 'PIN must be 4 digits' });
  try {
    res.status(201).json(db.addAgent({ name, phone, pin }));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Agent with this phone already exists' });
    throw e;
  }
});

router.post('/login', (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) return res.status(400).json({ error: 'phone and pin are required' });
  try {
    const agent = db.agentLogin(phone, pin);
    res.json(agent);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

router.patch('/:id/reset_pin', (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN is required' });
  try {
    const agent = db.resetAgentPin(req.params.id, pin);
    res.json(agent);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Profile Location Reviews
router.get('/:id/reviews', (req, res) => {
  try {
    res.json(db.getAgentReviews(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/reviews/:userId/approve', (req, res) => {
  const { delivery_fee } = req.body;
  try {
    const result = db.approveProfile(req.params.userId, delivery_fee);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
