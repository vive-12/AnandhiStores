const express = require('express');
const router = express.Router();
const db = require('../db/schema');

// Get all offers
router.get('/', (req, res) => {
  try {
    const offers = db.getOffers();
    res.json(offers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new offer
router.post('/', (req, res) => {
  try {
    const { title, subtitle, bg_color, is_active } = req.body;
    if (!title || !subtitle) {
      return res.status(400).json({ error: 'Title and subtitle are required' });
    }
    const offer = db.addOffer({ title, subtitle, bg_color, is_active });
    res.status(201).json(offer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an offer
router.patch('/:id', (req, res) => {
  try {
    const offer = db.updateOffer(req.params.id, req.body);
    res.json(offer);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Delete an offer
router.delete('/:id', (req, res) => {
  try {
    db.deleteOffer(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
