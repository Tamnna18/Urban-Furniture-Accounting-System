const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./config/db');
const authRoutes = require('./routes/auth');
const mastersRoutes = require('./routes/masters');
const purchasesRoutes = require('./routes/purchases');
const salesRoutes = require('./routes/sales');
const paymentsRoutes = require('./routes/payments');
const journalEntriesRoutes = require('./routes/journalEntries');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    database: 'MySQL',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', mastersRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/journal-entries', journalEntriesRoutes);
app.use('/api/reports', reportsRoutes);

// Static frontend serving
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
async function startServer() {
  try {
    console.log('Initializing MySQL Database connection & schema...');
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`Urban Furniture Accounting Server running on port ${PORT}`);
      console.log(`API Base URL: http://localhost:${PORT}/api`);
      console.log(`Frontend Application: http://localhost:${PORT}`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Failed to start Express server:', err.message);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
