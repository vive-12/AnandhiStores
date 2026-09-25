const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');

router.get('/alerts', (req, res) => res.json(db.getEmptyCanAlerts()));
router.get('/stats',  (req, res) => res.json(db.getStats()));

// User Management
router.get('/users/all', (req, res) => {
  res.json(db.getUsers());
});

router.get('/users/recent', (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const all = db.getUsers();
  res.json(all.filter(u => u.created_at && u.created_at >= thirtyDaysAgo));
});

router.get('/users/pending', (req, res) => {
  res.json(db.getPendingUsers());
});

router.patch('/users/:id/assign', (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'agent_id is required' });
  try {
    db.assignProfileReview(req.params.id, agent_id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/users/:id/reset_pin', (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length !== 4) return res.status(400).json({ error: '4-digit PIN required' });
  try {
    db.adminResetPin(req.params.id, pin);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
