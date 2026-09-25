const express = require('express');
const router = express.Router();
const db = require('../db/schema');

// Get all inventory items
router.get('/', (req, res) => {
  try {
    const items = db.getInventory();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new inventory item
router.post('/', (req, res) => {
  try {
    const { name, category, price, unit, in_stock } = req.body;
    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, category, and price are required' });
    }
    const item = db.addInventoryItem({ name, category, price, unit, in_stock });
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an inventory item
router.patch('/:id', (req, res) => {
  try {
    const item = db.updateInventoryItem(req.params.id, req.body);
    res.json(item);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Delete an inventory item
router.delete('/:id', (req, res) => {
  try {
    db.deleteInventoryItem(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
