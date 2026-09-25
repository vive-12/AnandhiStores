const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/orders', require('./routes/orders'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/admin',  require('./routes/admin'));
app.use('/api/users',  require('./routes/users'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/offers', require('./routes/offers'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AquaRush API', time: new Date().toISOString() });
});

require('./jobs/emptyCanChecker');

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  💧 AquaRush Server is RUNNING!');
  console.log(`  http://localhost:${PORT}/health`);
  console.log(`  http://localhost:${PORT}/api/orders`);
  console.log(`  http://localhost:${PORT}/api/agents`);
  console.log(`  http://localhost:${PORT}/api/admin/alerts`);
  console.log('');
});
