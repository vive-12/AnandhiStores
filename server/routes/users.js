const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');

// POST /api/users/register
router.post('/register', (req, res) => {
  const { phone, first_name, last_name, door_number, flat_house_name, street_number, locality, city, landmark, lat, lng } = req.body;
  if (!phone || !first_name || !door_number || !locality || !city) {
    return res.status(400).json({ error: 'phone, first_name, door_number, locality, and city are required' });
  }
  try {
    const user = db.createProfile(req.body);
    res.status(201).json(user);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'User with this phone already exists' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/login
router.post('/login', (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) return res.status(400).json({ error: 'phone and pin are required' });
  try {
    const result = db.loginUser(phone, pin);
    res.json(result);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

// PATCH /api/users/:id/set_pin
router.patch('/:id/set_pin', (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length !== 4) return res.status(400).json({ error: '4-digit PIN is required' });
  try {
    const user = db.setNewPin(req.params.id, pin);
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/users/:id/profile
router.patch('/:id/profile', (req, res) => {
  try {
    const user = db.updateProfile(req.params.id, req.body);
    res.json(user);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'User with this phone already exists' });
    res.status(400).json({ error: e.message });
  }
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
